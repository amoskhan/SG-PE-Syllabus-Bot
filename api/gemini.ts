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

// Flash first; Flash-Lite has its own free quota, so it answers when Flash's
// is used up (429), Flash stays busy (503) or Google has retired it (404).
// The "-latest" names follow Google's current models, so a retired version
// (as gemini-2.5-flash-lite was for new keys) doesn't stop the bot.
// Flash thinks first unless told not to; Flash-Lite doesn't think, and refuses
// the setting (400), so only Flash is sent it.
const MODELS = [
    { name: 'gemini-flash-latest', thinks: true },
    { name: 'gemini-flash-lite-latest', thinks: false },
];
// Worth trying the next model: quota used up, busy, or the model is gone
const TRY_NEXT = [429, 503, 404];

// Google's servers have moments of "high demand" (503) that pass within a
// second or two, so a 503 is tried again before giving up.
const RETRY_503_DELAYS_MS = [400, 1200];
const statusOf = (error: any): number | undefined => error?.status || error?.response?.status;
/** Google's own "retry in 40s" from a quota error, in whole seconds. */
const retryAfterSeconds = (error: any): number | undefined => {
    try {
        const details = JSON.parse(error?.message)?.error?.details ?? [];
        const delay = details.find((d: any) => typeof d?.retryDelay === 'string')?.retryDelay;
        return delay ? Math.ceil(parseFloat(delay)) : undefined;
    } catch {
        return undefined;
    }
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

        // Flash "thinks" first, and the thinking counts against
        // maxOutputTokens: a syllabus answer could come back cut short or empty.
        // Text questions don't need it; motion analysis (video frames) keeps it.
        const hasImages = Array.isArray(message) && message.some((part: any) => part?.inlineData);

        const send = ({ name, thinks }: (typeof MODELS)[number]) => ai.chats.create({
            model: name,
            config: {
                systemInstruction: systemInstruction,
                tools: onlySearchTool(tools),
                temperature: 0.3,
                thinkingConfig: thinks && !hasImages ? { thinkingBudget: 0 } : undefined,
                // 1200 default for syllabus text Q&A (clarifications are short; full section
        // dumps for a single sub-category need ~600-900 tokens, so 1200 gives headroom).
        // Motion analysis overrides this with 1500 from the client.
        maxOutputTokens: typeof maxOutputTokens === 'number' ? Math.min(Math.max(maxOutputTokens, 1), MAX_OUTPUT_TOKENS) : 1200,
            },
            history: history || []
        }).sendMessage({ message }); // text, or multipart for images

        const sendWithRetry = async (model: (typeof MODELS)[number]) => {
            for (let attempt = 0; ; attempt++) {
                try {
                    return await send(model);
                } catch (error) {
                    if (statusOf(error) !== 503 || attempt >= RETRY_503_DELAYS_MS.length) throw error;
                    await wait(RETRY_503_DELAYS_MS[attempt]);
                }
            }
        };

        let result;
        let model = MODELS[0].name;
        for (let i = 0; ; i++) {
            model = MODELS[i].name;
            try {
                result = await sendWithRetry(MODELS[i]);
                break;
            } catch (error) {
                const status = statusOf(error);
                if (!TRY_NEXT.includes(status as number) || i === MODELS.length - 1) throw error;
                console.warn(`[gemini] ${model} unavailable (${status}), trying ${MODELS[i + 1].name}`);
            }
        }
        const response = (result as any).response || result;

        // Gemini 3 sends a longer answer in several parts: join them all (not
        // just the first), leaving out any "thought" parts
        const parts: any[] = response.candidates?.[0]?.content?.parts ?? [];
        const text = parts.filter((part) => !part.thought).map((part) => part.text ?? '').join('')
            || (typeof response.text === 'string' ? response.text : '');

        const usage = response.usageMetadata?.totalTokenCount;
        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const finishReason = response.candidates?.[0]?.finishReason;

        console.log(`[gemini] Success. Tokens: ${usage}, FinishReason: ${finishReason}`);

        return res.status(200).json({
            text,
            model,
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
        const geminiStatus = statusOf(error);
        if (geminiStatus === 429) {
            const seconds = retryAfterSeconds(error);
            return res.status(429).json({
                error: `Coach Bot is busy right now. Try again in ${seconds ? `about ${seconds} seconds` : 'a minute'}.`,
                retryAfterSeconds: seconds,
            });
        }
        const httpStatus = geminiStatus === 429 ? 429
            : geminiStatus === 401 || geminiStatus === 403 ? 401
            : 500;

        return res.status(httpStatus).json({
            error: error.message || 'Error communicating with Google Gemini API',
            details: error?.errorDetails || undefined
        });
    }
}
