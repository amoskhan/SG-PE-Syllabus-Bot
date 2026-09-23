/**
 * api/get-memory.ts
 *
 * Vercel Edge Function — Tier 3 long-term memory retrieval.
 * Called by claudeService.ts before each message to inject teacher context.
 *
 * What it does:
 *   Reads the caller's Supabase access token (Authorization: Bearer ...) and
 *   returns the last 3 days of summarised conversations from
 *   user_memory_archive for that signed-in teacher.
 *
 * CRITICAL — Multi-Tenant Isolation:
 *   - The teacher is identified from the verified token, never from a
 *     client-supplied userId (anyone can type someone else's id into a URL).
 *   - The query runs as that teacher, so RLS
 *     ("user_id = auth.uid()::text") enforces isolation as well as the
 *     explicit .eq('user_id', ...) filter.
 *   - No token / bad token → { summaries: [] }.
 *
 * Pattern: follows api/claude.ts (Edge runtime, native fetch, no SDK).
 */

import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'edge' };

const EMPTY = () => new Response(JSON.stringify({ summaries: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
});

export default async function handler(req: Request) {
    // Allow only GET requests
    if (req.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return EMPTY();

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseKey) return EMPTY();

    try {
        // Act as the signed-in teacher so RLS applies to every query below
        const supabase = createClient(supabaseUrl, supabaseKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false },
        });

        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return EMPTY();
        const userId = user.id;

        // Compute the date 3 days ago (UTC date string)
        const threeDaysAgo = new Date();
        threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 3);
        const threeDaysAgoStr = threeDaysAgo.toISOString().split('T')[0]; // 'YYYY-MM-DD'

        // Fetch last 3 days of summaries — hard-filtered by userId
        const { data, error } = await supabase
            .from('user_memory_archive')
            .select('summary_date, summary_text')
            .eq('user_id', userId)          // CRITICAL: strict per-teacher filter
            .gte('summary_date', threeDaysAgoStr)
            .order('summary_date', { ascending: true }); // oldest first for chronological injection

        if (error) {
            console.error('get-memory Supabase error:', error.message);
            // Return empty on error — never crash the chat
            return new Response(JSON.stringify({ summaries: [] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify({ summaries: data ?? [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('get-memory unexpected error:', msg);
        // Silent fail — never crash the chat experience
        return new Response(JSON.stringify({ summaries: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
