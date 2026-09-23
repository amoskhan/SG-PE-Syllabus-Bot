// Vercel Serverless Function - Gemini API Proxy
import { GoogleGenAI } from '@google/genai';

// GEMINI_API_KEY  = production Vercel env var (set in Vercel Dashboard)
// VITE_GEMINI_API_KEY = fallback for local 'vercel dev' (from .env.local)
// Note: vercel dev exposes ALL .env.local vars to Node functions, including VITE_ ones
const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

// Gemini is open to visitors who aren't signed in (Claude is not — see
// api/claude.ts), so the server, not the caller, sets the limits: the model is
// fixed, answers are capped, and the only tool allowed is Google Search
// grounding, which the syllabus chat uses.
const MAX_OUTPUT_TOKENS = 2000;
const MAX_HISTORY = 60;

/** Only the app's own site (and local dev) may call this from a browser. */
function applyCors(req: any, res: any) {
    const allowed = [process.env.ALLOWED_ORIGIN, 'https://localhost:5173', 'http://localhost:5174'].filter(Boolean);
    const origin = req.headers?.origin;
    if (origin && allowed.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const onlySearchTool = (tools: unknown) =>
    Array.isArray(tools) && tools.some((t) => t && typeof t === 'object' && 'googleSearch' in t)
        ? [{ googleSearch: {} }]
        : undefined;

export default async function handler(req: any, res: any) {
    applyCors(req, res);

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!apiKey) {
        console.error('SERVER ERROR: No API key found. Set GEMINI_API_KEY in Vercel Dashboard, or VITE_GEMINI_API_KEY in .env.local for local dev.');
        return res.status(500).json({
            error: 'Server Configuration Error: API Key missing. Please set GEMINI_API_KEY in Vercel Settings.'
        });
    }

    try {
        const { history, message, systemInstruction, tools, maxOutputTokens } = req.body ?? {};
        if (!message || (Array.isArray(history) && history.length > MAX_HISTORY)) {
            return res.status(400).json({ error: 'Invalid request: message missing or history too long.' });
        }

        console.log(`[gemini] Request received. History length: ${history?.length ?? 0}, Has system instruction: ${!!systemInstruction}`);

        // Initialize GenAI
        const ai = new GoogleGenAI({ apiKey });

        // Create chat session
        const chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: systemInstruction,
                tools: onlySearchTool(tools),
                temperature: 0.3,
                // 1200 default for syllabus text Q&A (clarifications are short; full section
        // dumps for a single sub-category need ~600-900 tokens, so 1200 gives headroom).
        // Motion analysis overrides this with 1500 from the client.
        maxOutputTokens: typeof maxOutputTokens === 'number' ? Math.min(Math.max(maxOutputTokens, 1), MAX_OUTPUT_TOKENS) : 1200,
            },
            history: history || []
        });

        // Send message (supports text or multipart for images)
        const result = await chat.sendMessage({ message: message });
        const response = (result as any).response || result;

        const text = typeof response.text === 'function' ? response.text() :
            (response.candidates?.[0]?.content?.parts?.[0]?.text || '');

        const usage = response.usageMetadata?.totalTokenCount;
        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const finishReason = response.candidates?.[0]?.finishReason;

        console.log(`[gemini] Success. Tokens: ${usage}, FinishReason: ${finishReason}`);

        return res.status(200).json({
            text,
            tokenUsage: usage,
            groundingChunks,
            finishReason
        });

    } catch (error: any) {
        // Log the FULL error object for debugging in Vercel logs
        console.error('[gemini] Gemini API Error:', JSON.stringify({
            message: error.message,
            status: error.status,
            code: error.code,
            stack: error.stack?.substring(0, 500)
        }));

        // Forward the real HTTP status from Gemini if available (e.g. 429, 401)
        const geminiStatus = error?.status || error?.response?.status;
        const httpStatus = geminiStatus === 429 ? 429
            : geminiStatus === 401 || geminiStatus === 403 ? 401
            : 500;

        return res.status(httpStatus).json({
            error: error.message || 'Error communicating with Google Gemini API',
            details: error?.errorDetails || undefined
        });
    }
}
