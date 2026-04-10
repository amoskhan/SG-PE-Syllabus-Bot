import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'nodejs' };

export default async function handler(req: Request) {
    // Verify Vercel cron secret
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

    // 1. Fetch all unsummarised analyses
    const { data: unsummarised, error: fetchError } = await supabase
        .from('skill_analyses')
        .select('id, student_id, skill_name, proficiency_level, analysis_text, created_at')
        .eq('summarised', false)
        .order('created_at', { ascending: true });

    if (fetchError || !unsummarised || unsummarised.length === 0) {
        return new Response(JSON.stringify({ message: 'Nothing to summarise', error: fetchError?.message }), { status: 200 });
    }

    // 2. Group by (student_id, skill_name)
    const groups = new Map<string, typeof unsummarised>();
    for (const row of unsummarised) {
        const key = `${row.student_id}::${row.skill_name}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
    }

    const processedIds: string[] = [];
    const errors: string[] = [];

    for (const [key, analyses] of groups.entries()) {
        const [studentId, skillName] = key.split('::');

        // 3. Get student's current progress_summary for this skill
        const { data: studentRow } = await supabase
            .from('students')
            .select('id, name, progress_summary')
            .eq('id', studentId)
            .single();

        if (!studentRow) continue;

        const existingSummary = studentRow.progress_summary?.[skillName] ?? null;

        const sessionLines = analyses.map(a => {
            const date = new Date(a.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
            const snippet = a.analysis_text.slice(0, 200).replace(/\n/g, ' ');
            return `- ${date}: ${a.proficiency_level ?? 'Unknown'} — ${snippet}`;
        }).join('\n');

        const prompt = `You track a Singapore PE student's FMS progress. Update their summary for "${skillName}".

Current summary: ${existingSummary ?? 'No prior summary — this is the first session.'}

New grading sessions:
${sessionLines}

Write 2–3 sentences covering:
1. Current proficiency level
2. Criteria consistently met or missed
3. Trajectory (improving / plateauing / regressing)

Be concise. This is injected into an AI grader's context, not shown to the teacher directly.`;

        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': anthropicKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'claude-haiku-4-5-20251001',
                    max_tokens: 256,
                    messages: [{ role: 'user', content: prompt }],
                }),
            });

            const result = await response.json() as any;
            const newSummary = result.content?.[0]?.text?.trim();
            if (!newSummary) continue;

            // 4. Upsert progress_summary for this skill
            const updatedSummary = { ...(studentRow.progress_summary ?? {}), [skillName]: newSummary };
            await supabase.from('students').update({ progress_summary: updatedSummary }).eq('id', studentId);

            // 5. Mark analyses as summarised
            const ids = analyses.map(a => a.id);
            await supabase.from('skill_analyses').update({ summarised: true }).in('id', ids);
            processedIds.push(...ids);

        } catch (e: any) {
            errors.push(`${key}: ${e.message}`);
        }
    }

    return new Response(JSON.stringify({
        processed: processedIds.length,
        groups: groups.size,
        errors,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
