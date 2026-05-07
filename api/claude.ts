
export const config = {
    runtime: 'edge',
};

export default async function handler(req: Request) {
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            },
        });
    }

    if (req.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
        return new Response(
            JSON.stringify({ error: 'Server Error: ANTHROPIC_API_KEY not configured.' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }

    try {
        const body = await req.json();

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'anthropic-beta': 'prompt-caching-2024-07-31',
                'content-type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            let errorMsg = `Anthropic API error (${response.status})`;
            try {
                const parsed = JSON.parse(errorText);
                errorMsg = parsed.error?.message || parsed.message || errorMsg;
            } catch {}
            return new Response(
                JSON.stringify({ error: errorMsg }),
                { status: response.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*' } }
            );
        }

        const data = await response.json() as any;

        return new Response(
            JSON.stringify({
                text: data.content?.[0]?.text || '',
                tokenUsage: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
            }),
            {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
                },
            }
        );

    } catch (error: any) {
        return new Response(
            JSON.stringify({ error: 'Failed to communicate with Anthropic', details: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*' } }
        );
    }
}
