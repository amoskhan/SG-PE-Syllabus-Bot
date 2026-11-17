-- ============================================================================
-- MIGRATION: When a Teacher Note was sent, and when the pair saw it (issue #179)
-- Run this in your Supabase Dashboard -> SQL Editor. Safe to run multiple times.
-- Prereq: supabase_lesson_pass.sql, supabase_pair_control.sql.
-- ----------------------------------------------------------------------------
-- The teacher sends a pair a comment from the Review Tray (teacher_feedback).
-- The Review Tray then shows "✓ Sent 2:41 pm · 👀 Seen 2:43 pm":
--   teacher_feedback_sent_at  set by the database whenever the teacher changes
--                             the comment (so the app can't get it wrong)
--   teacher_feedback_seen_at  set when the pair's iPad shows that comment,
--                             through pupil_teacher_note_seen() below; cleared
--                             when the teacher sends a new one
-- Before this file is run the app still sends notes; the line just says "✓ Sent".
-- ============================================================================

alter table public.pair_submissions
  add column if not exists teacher_feedback_sent_at timestamptz,
  add column if not exists teacher_feedback_seen_at timestamptz;

-- ── 1. Stamp the times when the teacher changes the comment ─────────────────
-- Named to run after trg_protect_teacher_columns, which has already put back
-- any comment change from a pupil device.
create or replace function public.stamp_teacher_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    new.teacher_feedback_sent_at := old.teacher_feedback_sent_at;
  elsif new.teacher_feedback is distinct from old.teacher_feedback then
    new.teacher_feedback_sent_at := case when new.teacher_feedback is null then null else now() end;
    new.teacher_feedback_seen_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_teacher_note on public.pair_submissions;
create trigger trg_stamp_teacher_note
  before update on public.pair_submissions
  for each row execute function public.stamp_teacher_note();

-- ── 2. Pupil: "our iPad has shown this note" ─────────────────────────────────
-- Only the pair holding the claim token, with today's lesson pass, and only
-- for the comment as it is now (an older one the iPad showed doesn't count).
-- Returns true when it recorded the time.
create or replace function public.pupil_teacher_note_seen(
  p_id text, p_claim_token text, p_pass text, p_note text
)
returns boolean
language sql
volatile
security definer
set search_path = public
as $$
  with seen as (
    update public.pair_submissions s
       set teacher_feedback_seen_at = now()
      from public.lessons l
     where s.id = p_id
       and s.claim_token is not null
       and s.claim_token = p_claim_token
       and l.id = s.lesson_id
       and l.pupil_pass = p_pass
       and l.lesson_date = public.sg_today()
       and s.teacher_feedback = p_note
       and s.teacher_feedback_seen_at is null
    returning 1
  )
  select exists (select 1 from seen);
$$;

revoke all on function public.pupil_teacher_note_seen(text, text, text, text) from public;
grant execute on function public.pupil_teacher_note_seen(text, text, text, text) to anon, authenticated;
