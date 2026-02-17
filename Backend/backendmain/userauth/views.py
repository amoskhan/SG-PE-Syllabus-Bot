import json
import httpx
from decouple import config
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
from django_ratelimit.decorators import ratelimit
from django_ratelimit.exceptions import Ratelimited


GEMINI_MODEL = 'gemini-2.5-flash'
GEMINI_REST_URL = (
    f'https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}'
    ':generateContent'
)


def _convert_tools(tools: list) -> list:
    """
    Frontend sends tools in camelCase SDK format e.g. [{"googleSearch": {}}].
    The Gemini REST API expects snake_case: [{"google_search": {}}].
    """
    converted = []
    for tool in tools:
        if 'googleSearch' in tool:
            converted.append({'google_search': tool['googleSearch']})
        else:
            converted.append(tool)
    return converted


@csrf_exempt
@login_required
@ratelimit(key='user', rate='10/m', block=True)
@require_POST
def gemini_proxy(request):
    """
    Authenticated, rate-limited proxy for the Google Gemini API.
    Accepts the same payload shape as the Vercel /api/gemini function:
      { history, message, systemInstruction, tools }
    Returns:
      { text, tokenUsage, groundingChunks }
    """
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)

    history = body.get('history', [])
    message = body.get('message', [])         # Part[] — text and/or inline images
    system_instruction = body.get('systemInstruction', '')
    tools = body.get('tools', [])

    if not message:
        return JsonResponse({'error': 'message is required'}, status=400)

    api_key = config('GEMINI_API_KEY')

    payload = {
        'system_instruction': {
            'parts': [{'text': system_instruction}]
        },
        'contents': history + [{'role': 'user', 'parts': message}],
        'generationConfig': {
            'temperature': 0.5,
            'maxOutputTokens': 8192,
        },
    }

    if tools:
        payload['tools'] = _convert_tools(tools)

    try:
        with httpx.Client(timeout=120.0) as client:
            resp = client.post(
                GEMINI_REST_URL,
                params={'key': api_key},
                json=payload,
            )
    except httpx.TimeoutException:
        return JsonResponse({'error': 'Request to Gemini API timed out'}, status=504)
    except httpx.RequestError as exc:
        return JsonResponse({'error': f'Network error: {exc}'}, status=502)

    if resp.status_code != 200:
        return JsonResponse(
            {'error': 'Gemini API error', 'details': resp.text},
            status=resp.status_code,
        )

    data = resp.json()

    try:
        candidate = data['candidates'][0]
        parts = candidate['content']['parts']
        text = ''.join(p.get('text', '') for p in parts)
    except (KeyError, IndexError):
        return JsonResponse({'error': 'Unexpected response structure from Gemini'}, status=502)

    token_usage = data.get('usageMetadata', {}).get('totalTokenCount')
    grounding_chunks = (
        candidate.get('groundingMetadata', {}).get('groundingChunks', [])
    )

    return JsonResponse({
        'text': text,
        'tokenUsage': token_usage,
        'groundingChunks': grounding_chunks,
    })


def ratelimit_error(request, exception=None):
    """Custom 429 handler for rate-limited requests."""
    return JsonResponse(
        {'error': 'Too many requests. Please wait a moment and try again.'},
        status=429,
    )
