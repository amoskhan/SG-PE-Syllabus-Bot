/**
 * api/get-memory.ts
 *
 * Vercel Edge Function — Tier 3 long-term memory retrieval.
 * Called by claudeService.ts before each message to inject teacher context.
 *
 * What it does:
 *   Accepts a `userId` query parameter and returns the last 3 days of
 *   summarised conversations from user_memory_archive for that specific user.
 *
 * CRITICAL — Multi-Tenant Isolation:
 *   - If `userId` is missing or empty → returns { summaries: [] } immediately.
 *   - NEVER queries without a hard .eq('user_id', userId) filter.
 *   - One teacher's memories must NEVER be visible to another teacher.
 *
 * Pattern: follows api/claude.ts (Edge runtime, native fetch, no SDK).
 */

import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
    // Allow only GET requests
    if (req.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    // ── Multi-Tenant Isolation: validate userId before ANY query ─────────────
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');

    // CRITICAL: if userId is missing or empty, return empty — never fall back to a full scan
    if (!userId || userId.trim() === '') {
        return new Response(JSON.stringify({ summaries: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseKey) {
        return new Response(JSON.stringify({ summaries: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const supabase = createClient(supabaseUrl, supabaseKey);

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
