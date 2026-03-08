import { getAllowedOrigin } from './_utils';

export const config = {
    runtime: 'edge',
};

export default async function handler(req: Request) {
    const allowedOrigin = getAllowedOrigin(req.headers.get('origin') || '');

    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': allowedOrigin,
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, HTTP-Referer, X-Title',
            },
        });
    }

    if (req.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
        return new Response(
            JSON.stringify({ error: 'Server Error: OPENROUTER_API_KEY not configured in Vercel.' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }

    try {
        const body = await req.json();
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': req.headers.get('HTTP-Referer') || 'https://sg-pe-syllabus.vercel.app',
                'X-Title': req.headers.get('X-Title') || 'SG PE Syllabus Bot',
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();
        return new Response(JSON.stringify(data), {
            status: response.status,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin },
        });
    } catch (error: any) {
        return new Response(
            JSON.stringify({ error: 'Failed to communicate with OpenRouter', details: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin } }
        );
    }
}
