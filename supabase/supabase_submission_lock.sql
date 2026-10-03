-- ============================================================================
-- MIGRATION: Lock sent work; teacher redo requests (issue #86)
-- Run this in your Supabase Dashboard -> SQL Editor. Safe to run multiple times.
-- Prereq: supabase_lesson_pass.sql, supabase_protect_pupil_data.sql.
-- Run it AFTER both: it replaces pupil_save_submission and
-- pupil_get_submission from those files. If you re-run either of them,
-- re-run this file afterwards.
-- ----------------------------------------------------------------------------
-- Each performer's work in a pair's submission is locked as soon as it is sent
-- (their Practice Station analysis). The teacher's redo request
-- (redo_requested_at, set by "Send Back for Re-Do") opens both again; sending
-- after that locks again. See GLOSSARY.md (Submission, Redo Request).
-- Mirrored for display in src/utils/submissionLock.ts.
-- ============================================================================

-- ── 1. When each performer last sent, and when the teacher asked for a redo ─
alter table public.pair_submissions
  add column if not exists redo_requested_at timestamptz,
  add column if not exists apple_sent_at     timestamptz,
  add column if not exists banana_sent_at    timestamptz;

-- Work sent before this migration counts as sent
update public.pair_submissions set
  apple_sent_at  = coalesce(apple_sent_at,
                     case when ai_chat_analysis ? 'apple'
                          then coalesce((ai_chat_analysis->'apple'->>'submittedAt')::timestamptz, updated_at) end),
  banana_sent_at = coalesce(banana_sent_at,
                     case when ai_chat_analysis ? 'banana'
                          then coalesce((ai_chat_analysis->'banana'->>'submittedAt')::timestamptz, updated_at) end)
where (apple_sent_at is null and ai_chat_analysis ? 'apple')
   or (banana_sent_at is null and ai_chat_analysis ? 'banana');

-- Only the teacher sets redo_requested_at; the sent times are stamped by
-- pupil_save_submission. This trigger is the backstop for anonymous writes.
drop trigger if exists trg_protect_redo_request on public.pair_submissions;  -- earlier version
drop function if exists public.protect_redo_request();

create or replace function public.protect_lock_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    new.redo_requested_at := old.redo_requested_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_lock_columns on public.pair_submissions;
create trigger trg_protect_lock_columns
  before update on public.pair_submissions
  for each row execute function public.protect_lock_columns();

-- ── 2. The lock rule ────────────────────────────────────────────────────────
create or replace function public.performer_locked(s public.pair_submissions, p_performer text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    case when p_performer = 'apple' then s.apple_sent_at else s.banana_sent_at end
      >= coalesce(s.redo_requested_at, '-infinity'::timestamptz),
    false);
$$;

-- ── 3. Pupil save: refuse changes to locked work ────────────────────────────
-- Same as supabase_lesson_pass.sql, plus the lock. Returns
-- 'ok' | 'claimed' | 'invalid_lesson' | 'locked'.
create or replace function public.pupil_save_submission(p jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      text := p->>'id';
  v_lesson  text := p->>'lesson_id';
  v_token   text := nullif(p->>'claim_token', '');
  v_pair    integer := (p->>'pair_number')::integer;
  v_teacher uuid;
  v_pairs   integer;
  v_prefix  text;
  v_photo   text := nullif(p->>'pair_photo', '');
  v_banana  text := nullif(p->>'banana_video_url', '');
  v_apple   text := nullif(p->>'apple_video_url', '');
  v_row     public.pair_submissions%rowtype;
  v_banana_cues jsonb := case when jsonb_typeof(p->'banana_cues') = 'array' and jsonb_array_length(p->'banana_cues') > 0
                              then p->'banana_cues' end;
  v_apple_cues  jsonb := case when jsonb_typeof(p->'apple_cues') = 'array' and jsonb_array_length(p->'apple_cues') > 0
                              then p->'apple_cues' end;
  v_ai_student jsonb := case when jsonb_typeof(p->'ai_student_feedback') = 'object' then p->'ai_student_feedback' end;
  v_ai_teacher jsonb := case when jsonb_typeof(p->'ai_teacher_report')   = 'object' then p->'ai_teacher_report' end;
  v_ai_chat    jsonb := case when jsonb_typeof(p->'ai_chat_analysis')    = 'object' then p->'ai_chat_analysis' end;
  v_pupil      boolean;
  v_apple_new  boolean;  -- this write changes Apple's work
  v_banana_new boolean;  -- this write changes Banana's work
  v_any_locked boolean;
begin
  select teacher_id, pair_count into v_teacher, v_pairs
  from public.lessons
  where id = v_lesson
    and ((auth.uid() is not null and teacher_id = auth.uid())
         or (pupil_pass = p->>'pass' and lesson_date = public.sg_today()));

  if v_teacher is null
     or v_pair is null or v_pair not between 1 and v_pairs
     or v_id is null or v_id not like 'sub-' || v_lesson || '-p' || v_pair || '-%' then
    return 'invalid_lesson';
  end if;

  -- Only accept videos stored in this teacher's area and pair photos as images
  v_prefix := '/student-videos/' || v_teacher::text || '/pair_submissions/';
  if v_banana is not null and position(v_prefix in v_banana) = 0 then v_banana := null; end if;
  if v_apple  is not null and position(v_prefix in v_apple)  = 0 then v_apple  := null; end if;
  if v_photo  is not null and left(v_photo, 11) <> 'data:image/' then v_photo := null; end if;

  select * into v_row from public.pair_submissions where id = v_id;

  if found then
    if v_row.lesson_id <> v_lesson then
      return 'invalid_lesson';
    end if;
    if v_row.claim_token is not null and v_token is not null and v_row.claim_token <> v_token then
      return 'claimed';
    end if;

    -- Each performer's work is locked once sent, until the teacher asks for a
    -- redo. Unchanged values (a device re-sending what is already stored)
    -- don't count as changing it. The lesson's own teacher can always write.
    v_pupil := auth.uid() is null or auth.uid() <> v_teacher;
    v_apple_new :=
         (v_apple is not null and v_apple is distinct from v_row.apple_video_url)
      or (v_apple_cues is not null and v_apple_cues is distinct from v_row.apple_cues)
      or (v_ai_chat ? 'apple' and v_ai_chat->'apple' is distinct from v_row.ai_chat_analysis->'apple');
    v_banana_new :=
         (v_banana is not null and v_banana is distinct from v_row.banana_video_url)
      or (v_banana_cues is not null and v_banana_cues is distinct from v_row.banana_cues)
      or (v_ai_chat ? 'banana' and v_ai_chat->'banana' is distinct from v_row.ai_chat_analysis->'banana');
    if v_pupil and ((v_apple_new and public.performer_locked(v_row, 'apple'))
                 or (v_banana_new and public.performer_locked(v_row, 'banana'))) then
      return 'locked';
    end if;
    v_any_locked := public.performer_locked(v_row, 'apple') or public.performer_locked(v_row, 'banana');

    update public.pair_submissions set
      skill_name          = coalesce(p->>'skill_name', skill_name),
      status              = coalesce(p->>'status', status),
      pair_photo          = coalesce(v_photo, pair_photo),
      banana_video_url    = coalesce(v_banana, banana_video_url),
      apple_video_url     = coalesce(v_apple, apple_video_url),
      banana_cues         = coalesce(v_banana_cues, banana_cues),
      apple_cues          = coalesce(v_apple_cues, apple_cues),
      -- The automatic peer feedback covers both performers, so a pupil can't
      -- replace it once either one's work is locked
      ai_student_feedback = case when v_pupil and v_any_locked then ai_student_feedback
                                 else coalesce(v_ai_student, ai_student_feedback) end,
      ai_teacher_report   = case when v_pupil and v_any_locked then ai_teacher_report
                                 else coalesce(v_ai_teacher, ai_teacher_report) end,
      -- Merged per performer, so sending one never drops the other's
      ai_chat_analysis    = case when v_ai_chat is null then ai_chat_analysis
                                 else coalesce(ai_chat_analysis, '{}'::jsonb) || v_ai_chat end,
      -- Sending a performer's analysis is what "sent" means (stamped here, not by the device)
      apple_sent_at       = case when v_ai_chat ? 'apple' and v_ai_chat->'apple' is distinct from ai_chat_analysis->'apple'
                                 then now() else apple_sent_at end,
      banana_sent_at      = case when v_ai_chat ? 'banana' and v_ai_chat->'banana' is distinct from ai_chat_analysis->'banana'
                                 then now() else banana_sent_at end,
      claim_token         = coalesce(v_token, claim_token),
      updated_at          = now()
    where id = v_id;
  else
    insert into public.pair_submissions
      (id, lesson_id, pair_number, skill_name, teacher_id, status, claim_token,
       pair_photo, banana_video_url, apple_video_url, banana_cues, apple_cues,
       ai_student_feedback, ai_teacher_report, ai_chat_analysis, apple_sent_at, banana_sent_at,
       created_at, updated_at)
    values
      (v_id, v_lesson, v_pair,
       coalesce(p->>'skill_name', 'Overhand Throw'),
       v_teacher,
       coalesce(p->>'status', 'pending_sync'),
       v_token, v_photo, v_banana, v_apple,
       coalesce(v_banana_cues, '[]'::jsonb),
       coalesce(v_apple_cues, '[]'::jsonb),
       v_ai_student, v_ai_teacher, v_ai_chat,
       case when v_ai_chat ? 'apple'  then now() end,
       case when v_ai_chat ? 'banana' then now() end,
       coalesce((p->>'created_at')::timestamptz, now()),
       now());
  end if;

  return 'ok';
exception
  when check_violation then -- PAIR_CLAIMED from trg_enforce_submission_claim
    return 'claimed';
end;
$$;

revoke all on function public.pupil_save_submission(jsonb) from public;
grant execute on function public.pupil_save_submission(jsonb) to anon, authenticated;

-- ── 4. Pupil read: also return when each performer sent, and any redo ──────
create or replace function public.pupil_get_submission(p_id text, p_claim_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', id,
    'lesson_id', lesson_id,
    'pair_number', pair_number,
    'skill_name', skill_name,
    'status', status,
    'teacher_feedback', teacher_feedback,
    'teacher_star', teacher_star,
    'banana_cues', banana_cues,
    'apple_cues', apple_cues,
    'ai_student_feedback', ai_student_feedback,
    'ai_chat_analysis', ai_chat_analysis,  -- the pair's own sent analyses, for "Our work" (#94)
    'apple_video_url', apple_video_url,    -- so "Our work" knows a video was saved; not playable
    'banana_video_url', banana_video_url,  --   without the teacher's signed link (private bucket)
    'created_at', created_at,
    'redo_requested_at', redo_requested_at,
    'apple_sent_at', apple_sent_at,
    'banana_sent_at', banana_sent_at
  )
  from public.pair_submissions
  where id = p_id
    and claim_token is not null
    and claim_token = p_claim_token;
$$;

revoke all on function public.pupil_get_submission(text, text) from public;
grant execute on function public.pupil_get_submission(text, text) to anon, authenticated;

-- An earlier version of this migration locked on the teacher's grading instead
drop function if exists public.submission_locked(text);
