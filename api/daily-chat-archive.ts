/**
 * api/daily-chat-archive.ts
 *
 * Vercel Serverless Function (Node.js runtime) — Tier 2 nightly memory archival.
 * Triggered by a Vercel Cron Job at 23:55 SGT (15:55 UTC) every day.
 *
 * What it does:
 *   1. Fetches all unarchived chat_sessions whose updated_at falls within
 *      the previous calendar day in SGT (UTC+8).
 *   2. Groups sessions by user_id — never mixes different teachers' data.
 *   3. For each user, sends the day's transcript to Claude Haiku for summarisation.
 *   4. Saves the resulting markdown summary to user_memory_archive.
 *   5. Marks processed chat_sessions rows as archived = true.
 *
 * Pattern: follows api/summarise-progress.ts exactly.
 * Runtime: nodejs (required for Vercel Cron Jobs)
 */

import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'nodejs' };

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface ChatSession {
    id: string;
    user_id: string;
    messages: ChatMessage[];
    updated_at: string;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request) {
    // 1. Verify Vercel cron secret — reject all unauthorised requests
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
    const anthropicKey = process.env.ANTHROPIC_API_KEY || '';

    if (!supabaseUrl || !supabaseKey || !anthropicKey) {
        return new Response(JSON.stringify({ error: 'Missing environment variables' }), { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 2. Compute yesterday's date range in SGT (UTC+8)
    //    We work in UTC throughout; SGT = UTC+8, so:
    //      yesterday 00:00 SGT = yesterday 16:00 UTC (the day before)
    //      yesterday 23:59 SGT = today 15:59 UTC
    const nowUtc = new Date();
    // "Today" in SGT means the UTC date that is 8 hours ahead
    const sgtOffsetMs = 8 * 60 * 60 * 1000;
    const nowSgt = new Date(nowUtc.getTime() + sgtOffsetMs);

    // Yesterday in SGT
    const yesterdaySgt = new Date(nowSgt);
    yesterdaySgt.setUTCDate(yesterdaySgt.getUTCDate() - 1);

    // Start of yesterday SGT = YYYY-MM-DD 00:00:00 SGT = YYYY-MM-DD T-1 16:00:00 UTC
    const yesterdayStartUtc = new Date(Date.UTC(
        yesterdaySgt.getUTCFullYear(),
        yesterdaySgt.getUTCMonth(),
        yesterdaySgt.getUTCDate(),
        0, 0, 0
    ) - sgtOffsetMs);

    // End of yesterday SGT = YYYY-MM-DD 23:59:59 SGT = YYYY-MM-DD T 15:59:59 UTC
    const yesterdayEndUtc = new Date(Date.UTC(
        yesterdaySgt.getUTCFullYear(),
        yesterdaySgt.getUTCMonth(),
        yesterdaySgt.getUTCDate(),
        23, 59, 59
    ) - sgtOffsetMs);

    const summaryDate = `${yesterdaySgt.getUTCFullYear()}-${String(yesterdaySgt.getUTCMonth() + 1).padStart(2, '0')}-${String(yesterdaySgt.getUTCDate()).padStart(2, '0')}`;

    // 3. Fetch unarchived sessions from yesterday (SGT)
    const { data: sessions, error: fetchError } = await supabase
        .from('chat_sessions')
        .select('id, user_id, messages, updated_at')
        .eq('archived', false)
        .gte('updated_at', yesterdayStartUtc.toISOString())
        .lte('updated_at', yesterdayEndUtc.toISOString())
        .order('updated_at', { ascending: true });

    if (fetchError) {
        return new Response(JSON.stringify({ error: `Supabase fetch error: ${fetchError.message}` }), { status: 500 });
    }

    if (!sessions || sessions.length === 0) {
        return new Response(JSON.stringify({ processed: 0, errors: [], message: 'No sessions to archive.' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 4. Group sessions by user_id — NEVER mix different teachers' data
    const userGroups = new Map<string, ChatSession[]>();
    for (const session of sessions as ChatSession[]) {
        if (!session.user_id) continue; // skip sessions with no user (should not happen)
        if (!userGroups.has(session.user_id)) {
            userGroups.set(session.user_id, []);
        }
        userGroups.get(session.user_id)!.push(session);
    }

    let processed = 0;
    const errors: string[] = [];

    // 5. Process each user independently
    for (const [userId, userSessions] of userGroups.entries()) {
        try {
            // Build a single transcript string for this user's day — strictly their own sessions
            const transcriptLines: string[] = [];
            for (const session of userSessions) {
                const messages = Array.isArray(session.messages) ? session.messages : [];
                for (const msg of messages) {
                    if (!msg || !msg.content) continue;
                    const speaker = msg.role === 'user' ? 'Teacher' : 'Assistant';
                    // Trim very long messages to avoid token bloat
                    const snippet = String(msg.content).slice(0, 400).replace(/\n/g, ' ');
                    transcriptLines.push(`${speaker}: ${snippet}`);
                }
            }

            if (transcriptLines.length === 0) continue;

            const transcript = transcriptLines.join('\n');

            // 5a. Send to Claude Haiku for summarisation
            const archivistPrompt = `You are a memory archivist for an AI tool used by Singapore PE teachers. Read the following conversation log and extract: (1) key topics discussed, (2) any decisions made, (3) anything the teacher explicitly asked you to remember. Be concise. Output as bullet points in markdown.\n\n${transcript}`;

            const archiveResponse = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': anthropicKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'claude-haiku-4-5-20251001',
                    max_tokens: 512,
                    messages: [{ role: 'user', content: archivistPrompt }],
                }),
            });

            if (!archiveResponse.ok) {
                const errText = await archiveResponse.text().catch(() => archiveResponse.statusText);
                errors.push(`userId ${userId}: Anthropic error ${archiveResponse.status} — ${errText}`);
                continue;
            }

            const archiveResult = await archiveResponse.json() as { content?: { text?: string }[] };
            const summaryText = archiveResult.content?.[0]?.text?.trim();

            if (!summaryText) {
                errors.push(`userId ${userId}: Empty summary returned by Haiku`);
                continue;
            }

            // 5b. Insert summary into user_memory_archive
            const { error: insertError } = await supabase
                .from('user_memory_archive')
                .insert({
                    user_id: userId,
                    summary_date: summaryDate,
                    summary_text: summaryText,
                });

            if (insertError) {
                errors.push(`userId ${userId}: Insert error — ${insertError.message}`);
                continue;
            }

            // 5c. Mark processed sessions as archived = true
            const sessionIds = userSessions.map(s => s.id);
            const { error: updateError } = await supabase
                .from('chat_sessions')
                .update({ archived: true })
                .in('id', sessionIds);

            if (updateError) {
                errors.push(`userId ${userId}: Update archived flag error — ${updateError.message}`);
                continue;
            }

            processed += sessionIds.length;

        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            errors.push(`userId ${userId}: Unexpected error — ${msg}`);
        }
    }

    // 6. Return structured result
    return new Response(
        JSON.stringify({ processed, errors }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
}
