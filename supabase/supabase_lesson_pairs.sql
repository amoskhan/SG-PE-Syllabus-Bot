-- ============================================================================
-- MIGRATION: Named pairs — connect the Practice Station to student records
-- Run this in your Supabase Dashboard -> SQL Editor. Safe to run multiple times.
-- Prereq: supabase_teacher_profiles.sql, supabase_lessons.sql,
--         supabase_pair_submissions.sql, supabase_add_ai_chat_analysis.sql
-- ============================================================================
--
-- The teacher says who is in each pair (lesson_pairs). From then on, every AI
-- analysis a pupil sends from the Practice Station is copied into that
-- student's gradings (skill_analyses), so it shows on their dashboard, feeds
-- the Progress section and the nightly AI note, and gets the same teacher
-- review as a chat grading.
--
-- The copy is made in the database, not on the pupil's device: pupils aren't
-- signed in and never see names. It runs when a pupil sends work, and again
-- when the teacher assigns or changes a pair, so work sent before the pairs
-- were set still reaches the right student.

-- ── 1. Who is in each pair ──────────────────────────────────────────────────
create table if not exists public.lesson_pairs (
  lesson_id   text not null references public.lessons on delete cascade,
  pair_number integer not null,
  performer   text not null check (performer in ('apple', 'banana')),
  student_id  uuid not null references public.students on delete cascade,
  teacher_id  uuid not null default auth.uid() references auth.users on delete cascade,
  primary key (lesson_id, pair_number, performer),
  unique (lesson_id, student_id)            -- one slot per pupil per lesson
);

alter table public.lesson_pairs enable row level security;

drop policy if exists "Teachers manage own lesson pairs" on public.lesson_pairs;
create policy "Teachers manage own lesson pairs" on public.lesson_pairs
  for all
  using (auth.uid() = teacher_id)
  with check (
    auth.uid() = teacher_id
    and exists (select 1 from public.lessons  l where l.id = lesson_id  and l.teacher_id = auth.uid())
    and exists (select 1 from public.students s where s.id = student_id and s.teacher_id = auth.uid())
  );

create index if not exists lesson_pairs_student_idx on public.lesson_pairs (student_id);

-- ── 2. Where a grading came from ────────────────────────────────────────────
alter table public.skill_analyses
  add column if not exists source        text not null default 'chat',  -- 'chat' | 'practice_station'
  add column if not exists lesson_id     text,
  add column if not exists submission_id text references public.pair_submissions on delete set null,
  add column if not exists performer     text,                          -- 'apple' | 'banana'
  -- from supabase_teacher_review.sql, repeated so the order they're run in doesn't matter
  add column if not exists teacher_criteria    jsonb,
  add column if not exists teacher_level       text,
  add column if not exists teacher_reviewed_at timestamptz;

create unique index if not exists skill_analyses_submission_performer_idx
  on public.skill_analyses (submission_id, performer);

-- ── 3. Copy one pupil's Practice Station analysis into their record ─────────
create or replace function public.sync_practice_analysis(p_submission_id text, p_performer text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub      public.pair_submissions%rowtype;
  v_entry    jsonb;
  v_student  uuid;
  v_text     text;
  v_level    text;
  v_video    text;
  v_existing public.skill_analyses%rowtype;
begin
  select * into v_sub from public.pair_submissions where id = p_submission_id;
  if not found or v_sub.teacher_id is null then return; end if;

  v_entry := v_sub.ai_chat_analysis -> p_performer;
  select student_id into v_student from public.lesson_pairs
   where lesson_id = v_sub.lesson_id and pair_number = v_sub.pair_number and performer = p_performer;

  v_text  := v_entry ->> 'analysisText';
  -- Same rule as the chat save: the first level named in the grading
  v_level := initcap(substring(lower(coalesce(v_text, '')) from '(beginning|developing|competent|excellent)'));

  -- Nobody assigned to this slot, or nothing gradable sent: no record for it
  if v_student is null or v_text is null or v_level is null then
    delete from public.skill_analyses where submission_id = p_submission_id and performer = p_performer;
    return;
  end if;

  -- Stored as a Storage path, which is what the dashboard signs to play
  v_video := case when p_performer = 'apple' then v_sub.apple_video_url else v_sub.banana_video_url end;
  v_video := nullif(split_part(regexp_replace(coalesce(v_video, ''), '^.*/student-videos/', ''), '?', 1), '');

  select * into v_existing from public.skill_analyses
   where submission_id = p_submission_id and performer = p_performer;

  if not found then
    insert into public.skill_analyses
      (student_id, teacher_id, skill_name, video_url, proficiency_level, analysis_text,
       model_id, summarised, source, lesson_id, submission_id, performer, created_at)
    values
      (v_student, v_sub.teacher_id, coalesce(v_entry ->> 'skillName', v_sub.skill_name), v_video, v_level, v_text,
       v_entry ->> 'modelUsed', false, 'practice_station', v_sub.lesson_id, p_submission_id, p_performer,
       coalesce((v_entry ->> 'submittedAt')::timestamptz, v_sub.created_at));
  elsif v_existing.analysis_text is distinct from v_text then
    -- A new analysis was sent: the teacher's review was of the old one
    update public.skill_analyses set
      student_id = v_student, video_url = coalesce(v_video, video_url),
      proficiency_level = v_level, analysis_text = v_text,
      skill_name = coalesce(v_entry ->> 'skillName', skill_name),
      model_id = v_entry ->> 'modelUsed',
      created_at = coalesce((v_entry ->> 'submittedAt')::timestamptz, created_at),
      teacher_criteria = null, teacher_level = null, teacher_reviewed_at = null,
      summarised = false
    where id = v_existing.id;
  elsif v_existing.student_id <> v_student or v_existing.video_url is distinct from coalesce(v_video, v_existing.video_url) then
    -- Same analysis: the teacher moved it to another pupil, or the video arrived.
    -- The review stays — it's about the clip, not who was named.
    update public.skill_analyses set
      student_id = v_student, video_url = coalesce(v_video, video_url), summarised = false
    where id = v_existing.id;
  end if;
end;
$$;

revoke all on function public.sync_practice_analysis(text, text) from public, anon, authenticated;

-- ── 4. Run it when a pupil sends work… ──────────────────────────────────────
create or replace function public.trg_sync_submission_analyses()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_practice_analysis(new.id, 'apple');
  perform public.sync_practice_analysis(new.id, 'banana');
  return null;
end;
$$;

drop trigger if exists trg_sync_submission_analyses on public.pair_submissions;
create trigger trg_sync_submission_analyses
  after insert or update of ai_chat_analysis, apple_video_url, banana_video_url
  on public.pair_submissions
  for each row execute function public.trg_sync_submission_analyses();

-- ── 5. …and when the teacher assigns, changes or clears a pair slot ─────────
create or replace function public.trg_sync_pair_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  -- The lesson itself is being deleted (its pairs go with it). Keep the
  -- gradings: they're the pupils' record, not the lesson's.
  if tg_op = 'DELETE' and not exists (select 1 from public.lessons where id = old.lesson_id) then
    return null;
  end if;

  -- The slot that was changed or cleared…
  if tg_op in ('UPDATE', 'DELETE') then
    for r in select id from public.pair_submissions
              where lesson_id = old.lesson_id and pair_number = old.pair_number
    loop
      perform public.sync_practice_analysis(r.id, old.performer);
    end loop;
  end if;

  -- …and the slot that was filled
  if tg_op in ('INSERT', 'UPDATE') then
    for r in select id from public.pair_submissions
              where lesson_id = new.lesson_id and pair_number = new.pair_number
    loop
      perform public.sync_practice_analysis(r.id, new.performer);
    end loop;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_sync_pair_assignment on public.lesson_pairs;
create trigger trg_sync_pair_assignment
  after insert or update or delete on public.lesson_pairs
  for each row execute function public.trg_sync_pair_assignment();
