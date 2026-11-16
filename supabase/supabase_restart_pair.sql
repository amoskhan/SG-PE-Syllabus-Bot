-- ============================================================================
-- MIGRATION: Restart a pair, keeping everything they sent (issue #173)
-- Run this in your Supabase Dashboard -> SQL Editor. Safe to run multiple times.
-- Prereq: supabase_lesson_pass.sql, supabase_lesson_pairs.sql,
--         supabase_glow_grow.sql.
-- ----------------------------------------------------------------------------
-- When the teacher clears a pair's check-in, the pair restarts (GLOSSARY.md:
-- Restart; ADR 0003): they check in again, on any device, and start the
-- lesson's work from Step 1. Everything they had sent is kept in the same
-- submission as earlier work, with its locks and grades, until the teacher
-- removes it. Their PE AI Buddy limits (ai_usage, by pair number) carry over.
--
-- Running this late is safe: until it is run, the app clears only the check-in
-- (as before) and nothing is lost.
-- No new policy: the columns sit behind the existing row rules, and pupils
-- never read earlier work (pupil_get_submission is unchanged).
-- ============================================================================

-- ── 1. Where it is kept ─────────────────────────────────────────────────────
alter table public.pair_submissions
  -- Each restart's earlier work, newest first. One entry is the submission's
  -- work columns as they were, plus:
  --   restartedAt  when the teacher cleared the check-in
  --   gradingIds   the student-record gradings of that work (skill_analyses),
  --                detached from the submission so new work gets its own
  add column if not exists earlier_work jsonb,
  -- When this pair last restarted: a device holding work from before it
  -- starts clean (src/utils/pairWork.ts: fromBeforeRestart)
  add column if not exists restarted_at timestamptz;

-- ── 2. The teacher restarts a pair ──────────────────────────────────────────
-- Returns 'ok' | 'not_yours'.
create or replace function public.teacher_restart_pair(p_lesson_id text, p_pair_number integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r       public.pair_submissions%rowtype;
  v_now   timestamptz := now();
  v_ids   jsonb;
  v_entry jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.lessons where id = p_lesson_id and teacher_id = auth.uid()
  ) then
    return 'not_yours';
  end if;

  for r in select * from public.pair_submissions
            where lesson_id = p_lesson_id and pair_number = p_pair_number
            for update
  loop
    if r.banana_video_url is not null or r.apple_video_url is not null
       or coalesce(jsonb_array_length(case when jsonb_typeof(r.banana_cues) = 'array' then r.banana_cues end), 0) > 0
       or coalesce(jsonb_array_length(case when jsonb_typeof(r.apple_cues)  = 'array' then r.apple_cues  end), 0) > 0
       or r.ai_chat_analysis is not null or r.first_attempts is not null or r.glow_grow is not null
       or r.ai_teacher_report is not null or r.teacher_feedback is not null then
      -- The gradings go with the earlier work. Detached first: clearing the
      -- analysis below makes sync_practice_analysis delete what is still linked.
      select coalesce(jsonb_agg(id order by created_at), '[]'::jsonb) into v_ids
        from public.skill_analyses where submission_id = r.id;
      update public.skill_analyses set submission_id = null where submission_id = r.id;

      v_entry := (to_jsonb(r) - array['id', 'lesson_id', 'pair_number', 'skill_name', 'teacher_id',
                                      'claim_token', 'earlier_work', 'restarted_at', 'updated_at'])
                 || jsonb_build_object('restartedAt', v_now, 'gradingIds', v_ids);

      update public.pair_submissions set
        earlier_work        = jsonb_build_array(v_entry) || coalesce(earlier_work, '[]'::jsonb),
        pair_photo          = null,
        banana_video_url    = null,
        apple_video_url     = null,
        banana_cues         = '[]'::jsonb,
        apple_cues          = '[]'::jsonb,
        ai_student_feedback = null,
        ai_teacher_report   = null,
        ai_chat_analysis    = null,
        first_attempts      = null,
        peer_steps          = null,
        glow_grow           = null,
        apple_sent_at       = null,
        banana_sent_at      = null,
        redo_requested_at   = null,
        teacher_feedback    = null,
        teacher_star        = false,
        status              = 'pending_sync',
        claim_token         = null,
        restarted_at        = v_now,
        -- The new work starts now (the earlier go keeps its own created_at)
        created_at          = v_now,
        updated_at          = v_now
      where id = r.id;
    else
      -- Nothing sent yet: only free the pair number
      update public.pair_submissions set claim_token = null, restarted_at = v_now, updated_at = v_now
      where id = r.id;
    end if;
  end loop;

  -- Clearing the check-in frees the pair number for the same pair on any device
  delete from public.pair_sessions where id = p_lesson_id || '-p' || p_pair_number;
  return 'ok';
end;
$$;

revoke all on function public.teacher_restart_pair(text, integer) from public, anon;
grant execute on function public.teacher_restart_pair(text, integer) to authenticated;

-- ── 3. The teacher removes one earlier go ───────────────────────────────────
-- Its gradings stay on the students' records, as when a whole submission is
-- deleted. Returns 'ok' | 'not_yours'.
create or replace function public.teacher_remove_earlier_work(p_id text, p_restarted_at text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.pair_submissions where id = p_id and teacher_id = auth.uid()
  ) then
    return 'not_yours';
  end if;

  update public.pair_submissions set
    earlier_work = nullif(coalesce((
      select jsonb_agg(e order by ord)
        from jsonb_array_elements(coalesce(earlier_work, '[]'::jsonb)) with ordinality as w(e, ord)
       where e->>'restartedAt' is distinct from p_restarted_at), '[]'::jsonb), '[]'::jsonb),
    updated_at = now()
  where id = p_id;
  return 'ok';
end;
$$;

revoke all on function public.teacher_remove_earlier_work(text, text) from public, anon;
grant execute on function public.teacher_remove_earlier_work(text, text) to authenticated;

-- ── 4. A pupil device asks when its pair last restarted ─────────────────────
-- Only with today's lesson pass. Null if the pair never restarted.
create or replace function public.pupil_pair_restarted_at(p_lesson_id text, p_pass text, p_pair_number integer)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select max(s.restarted_at)
    from public.pair_submissions s
    join public.lessons l on l.id = s.lesson_id
   where s.lesson_id = p_lesson_id
     and s.pair_number = p_pair_number
     and l.pupil_pass = p_pass
     and l.lesson_date = public.sg_today();
$$;

revoke all on function public.pupil_pair_restarted_at(text, text, integer) from public;
grant execute on function public.pupil_pair_restarted_at(text, text, integer) to anon, authenticated;
