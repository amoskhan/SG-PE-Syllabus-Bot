
export const config = {
    runtime: 'edge',
};

export default async function handler(req: Request) {
    // 1. Handle CORS (Flight checks)
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title, HTTP-Referer',
            },
        });
    }

    if (req.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    // 2. Get the API Key securely from Server Environment
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

    if (!OPENROUTER_API_KEY) {
        return new Response(
            JSON.stringify({ error: 'Server Error: OPENROUTER_API_KEY not configured in Vercel.' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }

    try {
        const body = await req.json();

        // 3. Forward request to OpenRouter
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                // Pass through optional headers for rankings if provided by client
                "HTTP-Referer": req.headers.get("HTTP-Referer") || "https://sg-pe-syllabus.vercel.app",
                "X-Title": req.headers.get("X-Title") || "SG PE Syllabus Bot"
            },
            body: JSON.stringify(body)
        });

        // 4. Return the response from OpenRouter back to the client
        const data = await response.json();

        return new Response(JSON.stringify(data), {
            status: response.status,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });

    } catch (error: any) {
        return new Response(
            JSON.stringify({ error: 'Failed to communicate with OpenRouter', details: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
    }
}
