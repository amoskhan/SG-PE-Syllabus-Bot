-- ============================================================================
-- MIGRATION: Lesson pass — pupils can only send work to a real lesson, today
-- Run this in your Supabase Dashboard -> SQL Editor. Safe to run multiple times.
-- Prereq: supabase_lessons.sql, supabase_protect_pupil_data.sql
-- ----------------------------------------------------------------------------
-- Each lesson gets a secret pupil_pass, carried in its class QR code. Every
-- pupil write now needs a lesson that:
--   * exists (the teacher planned it),
--   * is dated today (Singapore time), and
--   * matches the pass from the QR.
-- The lesson's own teacher_id is used — whatever teacher id a device sends is
-- ignored. The signed-in teacher who owns a lesson can always write to it
-- (e.g. "Test iPad Flow"), on any day, without the pass.
--
-- Video uploads from pupils are accepted only into
--   <teacher_id>/pair_submissions/<lesson_id or lesson_<lesson_id>>/...
-- for a lesson of that teacher dated today.
-- ============================================================================


-- ── 1. The pass ─────────────────────────────────────────────────────────────
alter table public.lessons
  add column if not exists pupil_pass text not null
  default replace(gen_random_uuid()::text, '-', '');


-- ── 2. Helpers ──────────────────────────────────────────────────────────────
create or replace function public.sg_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Singapore')::date;
$$;

-- What the scanner asks right after reading a QR: 'ok' | 'not_today' | 'invalid'
create or replace function public.pupil_lesson_status(p_lesson_id text, p_pass text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when l.id is null then 'invalid'
    when l.lesson_date = public.sg_today() then 'ok'
    else 'not_today'
  end
  from (select 1) as one
  left join public.lessons l on l.id = p_lesson_id and l.pupil_pass = p_pass;
$$;

-- Storage policy helper: may this (not signed-in) device upload to this path?
create or replace function public.pupil_can_upload(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.lessons l
    where l.teacher_id::text = (storage.foldername(p_name))[1]
      and (storage.foldername(p_name))[2] = 'pair_submissions'
      and (storage.foldername(p_name))[3] in (l.id, 'lesson_' || l.id)
      and l.lesson_date = public.sg_today()
  );
$$;


-- ── 3. Pupil functions, now checked against the lesson ──────────────────────
-- Signatures change, so drop the Step 1 versions first.
drop function if exists public.pupil_claimed_pairs(text);
drop function if exists public.pupil_check_in(text, integer, text, text, text, boolean, text);

create or replace function public.pupil_claimed_pairs(p_lesson_id text, p_pass text)
returns setof integer
language sql
stable
security definer
set search_path = public
as $$
  select s.pair_number
  from public.pair_sessions s
  join public.lessons l on l.id = s.lesson_id
  where s.lesson_id = p_lesson_id
    and ((auth.uid() is not null and l.teacher_id = auth.uid())
         or (l.pupil_pass = p_pass and l.lesson_date = public.sg_today()));
$$;

-- Returns 'ok' | 'claimed' | 'invalid_lesson'
create or replace function public.pupil_check_in(
  p_lesson_id   text,
  p_pass        text,
  p_pair_number integer,
  p_skill_name  text,
  p_pair_photo  text,
  p_needs_help  boolean,
  p_claim_token text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher uuid;
  v_pairs   integer;
  v_id      text := p_lesson_id || '-p' || p_pair_number;
  v_token   text;
begin
  select teacher_id, pair_count into v_teacher, v_pairs
  from public.lessons
  where id = p_lesson_id
    and ((auth.uid() is not null and teacher_id = auth.uid())
         or (pupil_pass = p_pass and lesson_date = public.sg_today()));

  if v_teacher is null or p_pair_number is null or p_pair_number not between 1 and v_pairs then
    return 'invalid_lesson';
  end if;
  if p_pair_photo is not null and left(p_pair_photo, 11) <> 'data:image/' then
    p_pair_photo := null;
  end if;

  select claim_token into v_token from public.pair_sessions where id = v_id;
  if v_token is not null and p_claim_token is not null and v_token <> p_claim_token then
    return 'claimed';
  end if;

  insert into public.pair_sessions
    (id, lesson_id, pair_number, skill_name, teacher_id, pair_photo, needs_help, claim_token, updated_at)
  values
    (v_id, p_lesson_id, p_pair_number, p_skill_name, v_teacher,
     p_pair_photo, coalesce(p_needs_help, false), p_claim_token, now())
  on conflict (id) do update set
    skill_name  = excluded.skill_name,
    teacher_id  = excluded.teacher_id,
    pair_photo  = coalesce(excluded.pair_photo, pair_sessions.pair_photo),
    needs_help  = excluded.needs_help,
    claim_token = coalesce(excluded.claim_token, pair_sessions.claim_token),
    updated_at  = now();

  return 'ok';
exception
  when check_violation then -- PAIR_CLAIMED from trg_enforce_pair_claim
    return 'claimed';
end;
$$;

-- Same as Step 1, plus: the lesson must accept this caller, the row must
-- belong to that lesson, and video / photo values must point where uploads
-- for that lesson go. Returns 'ok' | 'claimed' | 'invalid_lesson'.
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

    update public.pair_submissions set
      skill_name          = coalesce(p->>'skill_name', skill_name),
      status              = coalesce(p->>'status', status),
      pair_photo          = coalesce(v_photo, pair_photo),
      banana_video_url    = coalesce(v_banana, banana_video_url),
      apple_video_url     = coalesce(v_apple, apple_video_url),
      banana_cues         = coalesce(v_banana_cues, banana_cues),
      apple_cues          = coalesce(v_apple_cues, apple_cues),
      ai_student_feedback = coalesce(v_ai_student, ai_student_feedback),
      ai_teacher_report   = coalesce(v_ai_teacher, ai_teacher_report),
      ai_chat_analysis    = coalesce(v_ai_chat, ai_chat_analysis),
      claim_token         = coalesce(v_token, claim_token),
      updated_at          = now()
    where id = v_id;
  else
    insert into public.pair_submissions
      (id, lesson_id, pair_number, skill_name, teacher_id, status, claim_token,
       pair_photo, banana_video_url, apple_video_url, banana_cues, apple_cues,
       ai_student_feedback, ai_teacher_report, ai_chat_analysis, created_at, updated_at)
    values
      (v_id, v_lesson, v_pair,
       coalesce(p->>'skill_name', 'Overhand Throw'),
       v_teacher,
       coalesce(p->>'status', 'pending_sync'),
       v_token, v_photo, v_banana, v_apple,
       coalesce(v_banana_cues, '[]'::jsonb),
       coalesce(v_apple_cues, '[]'::jsonb),
       v_ai_student, v_ai_teacher, v_ai_chat,
       coalesce((p->>'created_at')::timestamptz, now()),
       now());
  end if;

  return 'ok';
exception
  when check_violation then -- PAIR_CLAIMED from trg_enforce_submission_claim
    return 'claimed';
end;
$$;

revoke all on function public.pupil_lesson_status(text, text) from public;
revoke all on function public.pupil_can_upload(text) from public;
revoke all on function public.pupil_claimed_pairs(text, text) from public;
revoke all on function public.pupil_check_in(text, text, integer, text, text, boolean, text) from public;
revoke all on function public.pupil_save_submission(jsonb) from public;
grant execute on function public.pupil_lesson_status(text, text) to anon, authenticated;
grant execute on function public.pupil_can_upload(text) to anon, authenticated;
grant execute on function public.pupil_claimed_pairs(text, text) to anon, authenticated;
grant execute on function public.pupil_check_in(text, text, integer, text, text, boolean, text) to anon, authenticated;
grant execute on function public.pupil_save_submission(jsonb) to anon, authenticated;


-- ── 4. Uploads only into a lesson that is on today ──────────────────────────
drop policy if exists "Upload to student-videos" on storage.objects;
create policy "Upload to student-videos" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'student-videos'
    and ((storage.foldername(name))[1] = auth.uid()::text   -- a teacher, into their own folder
         or public.pupil_can_upload(name))                  -- a pupil, into today's lesson
  );
