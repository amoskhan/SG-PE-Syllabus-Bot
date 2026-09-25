-- ============================================================================
-- MIGRATION: Protect pupils' photos, videos and submissions
-- Run this in your Supabase Dashboard -> SQL Editor. Safe to run multiple times.
-- Prereq: supabase_pair_submissions.sql, supabase_pair_sessions.sql,
--         supabase_add_ai_chat_analysis.sql, supabase_pair_control.sql
-- ----------------------------------------------------------------------------
-- Before this, pair_submissions, pair_sessions and the student-videos bucket
-- were open to anyone with the (public) anon key: any visitor could read every
-- pair selfie and video, and overwrite or delete them.
--
-- After this:
--   * Teachers read, update and delete only rows / videos that carry their own
--     teacher_id (videos: the first folder of the path is the teacher's id).
--   * Pupil devices (not signed in) have no direct table access. They go
--     through four SECURITY DEFINER functions that do exactly one job each:
--       pupil_claimed_pairs   – which pair numbers are taken (numbers only)
--       pupil_check_in        – check in / signal help for one pair
--       pupil_save_submission – send a pair's work (student columns only)
--       pupil_get_submission  – read back the pair's own row, proven by the
--                               claim token only that pair's device holds
--   * The student-videos bucket is private. Teachers play videos through
--     short-lived signed URLs; pupils can still upload.
-- ============================================================================


-- ── 1. Drop every existing policy on the two pair tables ────────────────────
-- Earlier migrations created open policies under several names; remove them
-- all so no forgotten "using (true)" policy survives.
do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('pair_submissions', 'pair_sessions')
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

alter table public.pair_submissions enable row level security;
alter table public.pair_sessions    enable row level security;


-- ── 2. Teacher policies ─────────────────────────────────────────────────────
create policy "Teachers read own pair submissions" on public.pair_submissions
  for select using (auth.uid() = teacher_id);
create policy "Teachers update own pair submissions" on public.pair_submissions
  for update using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);
create policy "Teachers delete own pair submissions" on public.pair_submissions
  for delete using (auth.uid() = teacher_id);

create policy "Teachers read own pair check-ins" on public.pair_sessions
  for select using (auth.uid() = teacher_id);
create policy "Teachers delete own pair check-ins" on public.pair_sessions
  for delete using (auth.uid() = teacher_id);


-- ── 3. Pupil functions ──────────────────────────────────────────────────────
-- Accepts only a well-formed uuid; anything else becomes null.
create or replace function public.safe_uuid(v text)
returns uuid
language sql
immutable
as $$
  select case when v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then v::uuid end;
$$;

create or replace function public.pupil_claimed_pairs(p_lesson_id text)
returns setof integer
language sql
stable
security definer
set search_path = public
as $$
  select pair_number from public.pair_sessions where lesson_id = p_lesson_id;
$$;

create or replace function public.pupil_check_in(
  p_lesson_id   text,
  p_pair_number integer,
  p_skill_name  text,
  p_teacher_id  text,
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
  v_id    text := p_lesson_id || '-p' || p_pair_number;
  v_token text;
begin
  select claim_token into v_token from public.pair_sessions where id = v_id;
  if v_token is not null and p_claim_token is not null and v_token <> p_claim_token then
    return 'claimed';
  end if;

  insert into public.pair_sessions
    (id, lesson_id, pair_number, skill_name, teacher_id, pair_photo, needs_help, claim_token, updated_at)
  values
    (v_id, p_lesson_id, p_pair_number, p_skill_name, public.safe_uuid(p_teacher_id),
     p_pair_photo, coalesce(p_needs_help, false), p_claim_token, now())
  on conflict (id) do update set
    skill_name  = excluded.skill_name,
    teacher_id  = coalesce(excluded.teacher_id, pair_sessions.teacher_id),
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

-- Insert a new submission, or update ONLY the student-owned columns of an
-- existing one. Keys missing from p (or empty cue lists) leave the stored
-- value alone, so a video-only re-upload never wipes cues, AI analysis or the
-- teacher's feedback. trg_protect_teacher_columns still guards teacher columns.
create or replace function public.pupil_save_submission(p jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    text := p->>'id';
  v_token text := nullif(p->>'claim_token', '');
  v_row   public.pair_submissions%rowtype;
  v_banana_cues jsonb := case when jsonb_typeof(p->'banana_cues') = 'array' and jsonb_array_length(p->'banana_cues') > 0
                              then p->'banana_cues' end;
  v_apple_cues  jsonb := case when jsonb_typeof(p->'apple_cues') = 'array' and jsonb_array_length(p->'apple_cues') > 0
                              then p->'apple_cues' end;
  v_ai_student jsonb := case when jsonb_typeof(p->'ai_student_feedback') = 'object' then p->'ai_student_feedback' end;
  v_ai_teacher jsonb := case when jsonb_typeof(p->'ai_teacher_report')   = 'object' then p->'ai_teacher_report' end;
  v_ai_chat    jsonb := case when jsonb_typeof(p->'ai_chat_analysis')    = 'object' then p->'ai_chat_analysis' end;
begin
  if v_id is null or v_id = '' then
    raise exception 'pupil_save_submission: id is required';
  end if;

  select * into v_row from public.pair_submissions where id = v_id;

  if found then
    if v_row.claim_token is not null and v_token is not null and v_row.claim_token <> v_token then
      return 'claimed';
    end if;

    update public.pair_submissions set
      skill_name          = coalesce(p->>'skill_name', skill_name),
      status              = coalesce(p->>'status', status),
      pair_photo          = coalesce(nullif(p->>'pair_photo', ''), pair_photo),
      banana_video_url    = coalesce(nullif(p->>'banana_video_url', ''), banana_video_url),
      apple_video_url     = coalesce(nullif(p->>'apple_video_url', ''), apple_video_url),
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
      (v_id,
       coalesce(p->>'lesson_id', 'pe-lesson-today'),
       coalesce((p->>'pair_number')::integer, 1),
       coalesce(p->>'skill_name', 'Overhand Throw'),
       public.safe_uuid(p->>'teacher_id'),
       coalesce(p->>'status', 'pending_sync'),
       v_token,
       nullif(p->>'pair_photo', ''),
       nullif(p->>'banana_video_url', ''),
       nullif(p->>'apple_video_url', ''),
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

-- A pair reads back its own submission (teacher comment, status, cues).
-- Rows without a claim token (made before tokens existed) are never returned:
-- their ids are guessable.
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
    'created_at', created_at
  )
  from public.pair_submissions
  where id = p_id
    and claim_token is not null
    and claim_token = p_claim_token;
$$;

revoke all on function public.pupil_claimed_pairs(text) from public;
revoke all on function public.pupil_check_in(text, integer, text, text, text, boolean, text) from public;
revoke all on function public.pupil_save_submission(jsonb) from public;
revoke all on function public.pupil_get_submission(text, text) from public;
grant execute on function public.pupil_claimed_pairs(text) to anon, authenticated;
grant execute on function public.pupil_check_in(text, integer, text, text, text, boolean, text) to anon, authenticated;
grant execute on function public.pupil_save_submission(jsonb) to anon, authenticated;
grant execute on function public.pupil_get_submission(text, text) to anon, authenticated;


-- ── 4. Private video bucket ─────────────────────────────────────────────────
update storage.buckets set public = false where id = 'student-videos';

-- Drop every existing policy that mentions this bucket (several names exist)
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') ilike '%student-videos%' or coalesce(with_check, '') ilike '%student-videos%')
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end $$;

-- Pupils (and teachers) can add new files. No update policy: uploads never
-- overwrite an existing file.
create policy "Upload to student-videos" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'student-videos');

-- Teachers see and delete only files under their own folder: <teacher_id>/...
create policy "Teachers read own student-videos" on storage.objects
  for select to authenticated
  using (bucket_id = 'student-videos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Teachers delete own student-videos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'student-videos' and (storage.foldername(name))[1] = auth.uid()::text);


-- ── 5. Optional: older submissions with no teacher ──────────────────────────
-- Rows saved before the QR carried a teacher id have teacher_id = null and are
-- now visible to no one. To keep them, find your user id in
-- Authentication -> Users, then run (replace the id):
--
--   update public.pair_submissions set teacher_id = 'YOUR-USER-ID' where teacher_id is null;
--   update public.pair_sessions    set teacher_id = 'YOUR-USER-ID' where teacher_id is null;
--
-- Check how many there are first:
--   select count(*) from public.pair_submissions where teacher_id is null;
