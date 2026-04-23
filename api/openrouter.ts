
import { validateEdgeAuth } from './_lib/auth';

export const config = {
    runtime: 'edge',
};

function getCorsOrigin(req: Request): string {
    const allowedOrigins = process.env.ALLOWED_ORIGIN
        ? process.env.ALLOWED_ORIGIN.split(',').map((o: string) => o.trim())
        : ['http://localhost:5173', 'http://localhost:4173'];
    const origin = req.headers.get('origin') || '';
    return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
}

export default async function handler(req: Request) {
    const corsOrigin = getCorsOrigin(req);

    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': corsOrigin,
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title, HTTP-Referer',
                'Vary': 'Origin',
            },
        });
    }

    if (req.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    const { error: authError } = await validateEdgeAuth(req);
    if (authError) {
        return new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
        );
    }

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
        return new Response(
            JSON.stringify({ error: 'Server Error: OPENROUTER_API_KEY not configured in Vercel.' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }

    try {
        const raw = await req.json();

        // Whitelist allowed fields — never forward the raw body verbatim
        const { model, messages, stream, max_tokens, temperature, transforms } = raw;
        if (!model || typeof model !== 'string') {
            return new Response(JSON.stringify({ error: 'Bad Request: model is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        if (!Array.isArray(messages) || messages.length === 0) {
            return new Response(JSON.stringify({ error: 'Bad Request: messages must be a non-empty array' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        const forwardBody = { model, messages, stream: Boolean(stream), max_tokens, temperature, transforms };

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": req.headers.get("HTTP-Referer") || "https://sg-pe-syllabus.vercel.app",
                "X-Title": req.headers.get("X-Title") || "SG PE Syllabus Bot"
            },
            body: JSON.stringify(forwardBody)
        });

        const data = await response.json();

        return new Response(JSON.stringify(data), {
            status: response.status,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': corsOrigin,
                'Vary': 'Origin',
            },
        });

    } catch (error: any) {
        return new Response(
            JSON.stringify({ error: 'Failed to communicate with OpenRouter', details: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
        );
    }
}
