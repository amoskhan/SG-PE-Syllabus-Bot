
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

// Claude is paid, so every call must come from one of:
//   * a signed-in teacher  — Authorization: Bearer <Supabase access token>
//   * a pupil in a lesson  — X-Lesson-Id / X-Lesson-Pass / X-Pair-Number /
//                            X-Performer / X-Ai-Purpose, checked and counted by
//                            pupil_ai_use() (supabase_ai_usage.sql), which also
//                            decides the pupil's model.
// Everyone else is told to sign in. The server, not the caller, decides the
// model and caps the answer length.
//
// Kept self-contained (no imports from other api/ files): Vercel runs these as
// separate ES modules.

const MODELS = {
    sonnet: 'claude-sonnet-4-6',
    haiku: 'claude-haiku-4-5-20251001',
} as const;
const TEACHER_MODELS: string[] = Object.values(MODELS);

const MAX_TOKENS_TEACHER = 4000;
const MAX_TOKENS_PUPIL = { peer_feedback: 1024, analysis: 4000, question: 4000 } as const;
const MAX_MESSAGES = 40;
const MAX_IMAGES = 32; // gymnastics grading sends up to 30 frames

type Purpose = keyof typeof MAX_TOKENS_PUPIL;
type Caller =
    | { kind: 'teacher' }
    | { kind: 'pupil'; lessonId: string; pairNumber: number; performer: string; purpose: Purpose; model: 'sonnet' | 'haiku' };

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** Only the app's own site (and local dev) may call this from a browser. */
function applyCors(req: VercelRequest, res: VercelResponse) {
    const allowed = [process.env.ALLOWED_ORIGIN, 'https://localhost:5173', 'http://localhost:5174'].filter(Boolean);
    const origin = req.headers.origin;
    if (origin && allowed.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Lesson-Id, X-Lesson-Pass, X-Pair-Number, X-Performer, X-Ai-Purpose'
    );
}

const header = (req: VercelRequest, name: string) => {
    const v = req.headers[name.toLowerCase()];
    return (Array.isArray(v) ? v[0] : v) || '';
};

class Refusal extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

async function identifyCaller(req: VercelRequest): Promise<Caller> {
    const bearer = header(req, 'authorization').replace(/^Bearer\s+/i, '').trim();
    if (bearer) {
        const { data, error } = await createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
            .auth.getUser(bearer);
        if (error || !data.user) throw new Refusal(401, 'Your sign-in has expired. Please sign in again to use Claude.');
        return { kind: 'teacher' };
    }

    const lessonId = header(req, 'x-lesson-id');
    const pass = header(req, 'x-lesson-pass');
    if (!lessonId || !pass) throw new Refusal(401, 'Sign in to use Claude. Gemini is available without signing in.');

    const purpose = header(req, 'x-ai-purpose') as Purpose;
    if (!(purpose in MAX_TOKENS_PUPIL)) throw new Refusal(400, 'Unknown AI request type.');
    const pairNumber = Number(header(req, 'x-pair-number'));
    const performer = header(req, 'x-performer').toLowerCase();

    if (!serviceRoleKey) throw new Refusal(500, 'Server Error: SUPABASE_SERVICE_ROLE_KEY not configured.');
    const { data, error } = await createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
        .rpc('pupil_ai_use', {
            p_lesson_id: lessonId,
            p_pass: pass,
            p_pair_number: pairNumber,
            p_performer: performer,
            p_purpose: purpose,
        });
    if (error) {
        console.error('[api/claude] pupil_ai_use error:', error.message);
        throw new Refusal(500, 'Could not check the lesson. Please try again.');
    }
    const decision = data as { ok: boolean; model?: 'sonnet' | 'haiku'; reason?: string };
    if (!decision.ok) {
        throw decision.reason === 'budget'
            ? new Refusal(429, "You've used all your AI feedback for this lesson. Ask your teacher for help.")
            : new Refusal(403, "This lesson's QR code isn't open today. Ask your teacher to show today's QR code.");
    }
    return { kind: 'pupil', lessonId, pairNumber, performer, purpose, model: decision.model ?? 'haiku' };
}

/** Give a pupil's turn back when Anthropic fails, so an outage doesn't use up their budget. */
async function refund(caller: Caller) {
    if (caller.kind !== 'pupil' || !serviceRoleKey) return;
    const { error } = await createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
        .rpc('pupil_ai_refund', {
            p_lesson_id: caller.lessonId,
            p_pair_number: caller.pairNumber,
            p_performer: caller.performer,
            p_purpose: caller.purpose,
            p_model: caller.model,
        });
    if (error) console.error('[api/claude] pupil_ai_refund error:', error.message);
}

/** Only the fields the app uses, with the model and length decided here. */
function buildUpstreamBody(body: any, caller: Caller) {
    const messages = body?.messages;
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
        throw new Refusal(400, 'Invalid request: messages missing or too long.');
    }
    const images = messages
        .flatMap((m: any) => (Array.isArray(m?.content) ? m.content : []))
        .filter((b: any) => b?.type === 'image').length;
    if (images > MAX_IMAGES) throw new Refusal(400, 'Invalid request: too many images.');

    const requested = Number(body.max_tokens) || 1024;
    const model = caller.kind === 'teacher'
        ? (TEACHER_MODELS.includes(body.model) ? body.model : MODELS.haiku)
        : MODELS[caller.model];
    const cap = caller.kind === 'teacher' ? MAX_TOKENS_TEACHER : MAX_TOKENS_PUPIL[caller.purpose];
    const temperature = typeof body.temperature === 'number' ? Math.min(Math.max(body.temperature, 0), 1) : 0.3;

    return {
        model,
        max_tokens: Math.min(Math.max(requested, 1), cap),
        temperature,
        messages,
        ...(body.system ? { system: body.system } : {}),
    };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    applyCors(req, res);

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

    let caller: Caller | null = null;
    try {
        caller = await identifyCaller(req);
        const upstreamBody = buildUpstreamBody(req.body, caller);
        console.log(`[api/claude] ${caller.kind}${caller.kind === 'pupil' ? `/${caller.purpose}` : ''} → ${upstreamBody.model}`);

        const startTime = Date.now();
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'anthropic-beta': 'prompt-caching-2024-07-31',
                'content-type': 'application/json',
            },
            body: JSON.stringify(upstreamBody),
        });
        console.log(`[api/claude] Anthropic responded with status: ${response.status} in ${Date.now() - startTime}ms`);

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            console.error(`[api/claude] Anthropic error text:`, errorText);
            await refund(caller);
            let errorMsg = `Anthropic API error (${response.status})`;
            try {
                const parsed = JSON.parse(errorText);
                errorMsg = parsed.error?.message || parsed.message || errorMsg;
            } catch {}
            // 502: an upstream failure, not the caller's sign-in or budget
            return res.status(response.status === 429 ? 503 : 502).json({ error: errorMsg });
        }

        const data = await response.json() as any;
        return res.status(200).json({
            text: data.content?.[0]?.text || '',
            tokenUsage: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        });

    } catch (error: any) {
        if (error instanceof Refusal) {
            // Refused after the pupil's turn was counted (a malformed body) — give it back
            if (caller) await refund(caller);
            return res.status(error.status).json({ error: error.message });
        }
        console.error(`[api/claude] Caught error:`, error);
        if (caller) await refund(caller);
        return res.status(500).json({ error: 'Failed to communicate with Anthropic', details: error.message });
    }
}
