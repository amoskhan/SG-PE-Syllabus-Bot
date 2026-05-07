
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const maxDuration = 60;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: 'Server Error: ANTHROPIC_API_KEY not configured.' });
    }

    try {
        console.log('[api/claude] Received request, reading body...');
        const body = req.body;
        console.log(`[api/claude] Body parsed. Sending to Anthropic... (Model: ${body.model})`);

        const startTime = Date.now();
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
        console.log(`[api/claude] Anthropic responded with status: ${response.status} in ${Date.now() - startTime}ms`);

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            console.error(`[api/claude] Anthropic error text:`, errorText);
            let errorMsg = `Anthropic API error (${response.status})`;
            try {
                const parsed = JSON.parse(errorText);
                errorMsg = parsed.error?.message || parsed.message || errorMsg;
            } catch {}
            return res.status(response.status).json({ error: errorMsg });
        }

        const data = await response.json() as any;
        console.log(`[api/claude] Anthropic success. Returning data to client.`);

        return res.status(200).json({
            text: data.content?.[0]?.text || '',
            tokenUsage: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        });

    } catch (error: any) {
        console.error(`[api/claude] Caught error:`, error);
        return res.status(500).json({ error: 'Failed to communicate with Anthropic', details: error.message });
    }
}
