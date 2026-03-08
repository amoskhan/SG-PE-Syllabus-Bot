import { getAllowedOrigin } from './_utils';

export const config = {
    runtime: 'edge',
};

function decodeBedrockUrl(token: string): string {
    const base64Part = token.replace(/^bedrock-api-key-/, '');
    const decoded = atob(base64Part);
    return decoded.startsWith('http') ? decoded : `https://${decoded}`;
}

const corsHeaders = (origin: string) => ({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
});

const jsonResponse = (body: object, status: number, origin: string) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });

export default async function handler(req: Request) {
    const allowedOrigin = getAllowedOrigin(req.headers.get('origin') || '');

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders(allowedOrigin) });
    }

    if (req.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405, headers: corsHeaders(allowedOrigin) });
    }

    const BEDROCK_BEARER_TOKEN = process.env.BEDROCK_BEARER_TOKEN;
    if (!BEDROCK_BEARER_TOKEN) {
        return jsonResponse({ error: 'Server Error: BEDROCK_BEARER_TOKEN not configured in Vercel.' }, 500, allowedOrigin);
    }

    let presignedUrl: string;
    try {
        presignedUrl = decodeBedrockUrl(BEDROCK_BEARER_TOKEN);
    } catch {
        return jsonResponse({ error: 'Invalid Bedrock token format.' }, 500, allowedOrigin);
    }

    try {
        const body = await req.text();
        const response = await fetch(presignedUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        });
        const data = await response.text();
        return new Response(data, {
            status: response.status,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin },
        });
    } catch (error: any) {
        return jsonResponse({ error: 'Failed to communicate with Bedrock', details: error.message }, 500, allowedOrigin);
    }
}
