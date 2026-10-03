-- ============================================================================
-- MIGRATION: Planned lessons (Teacher Board → Lessons tab)
-- Run this in your Supabase Dashboard -> SQL Editor. Safe to run multiple times.
-- ============================================================================

-- A lesson's id is what the class QR carries. Pair check-ins
-- (pair_sessions.lesson_id), submissions (pair_submissions.lesson_id) and
-- Storage folders are all keyed by it, so every lesson must have its own.
create table if not exists public.lessons (
  id           text primary key,
  teacher_id   uuid not null default auth.uid() references auth.users on delete cascade,
  lesson_date  date not null,
  class_name   text not null,
  level        text,                                   -- 'P1'..'P6'
  objective    text,
  skill_area   text not null check (skill_area in ('FMS', 'Gymnastics')),
  skill_name   text not null,
  pair_count   integer not null default 15 check (pair_count between 1 and 30),
  created_at   timestamptz not null default timezone('utc'::text, now())
);

alter table public.lessons enable row level security;

-- Only the teacher who planned a lesson can see or change it. Pupils never
-- read this table: everything their phone needs travels in the QR code.
drop policy if exists "Teachers manage own lessons" on public.lessons;
create policy "Teachers manage own lessons" on public.lessons
  for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

create index if not exists lessons_teacher_date_idx
  on public.lessons (teacher_id, lesson_date desc);

-- A lesson's steps (#85; GLOSSARY.md: Lesson Step, ADR 0002): the ordered
-- Teach / Practise / Assess steps pupils' devices walk through, always read
-- and written as a whole (see src/utils/lessonFlow.ts for their shape).
-- Null = a lesson planned before steps existed: it runs as it always has
-- (peer assessment, then the Practice Station). skill_name is the main skill.
alter table public.lessons
  add column if not exists steps jsonb
  check (steps is null or jsonb_typeof(steps) = 'array');

-- ── Pupils read a lesson's steps (#87) ──────────────────────────────────────
-- Pupils never read this table. Their device asks for the steps with the
-- lesson pass from the class QR, and only on the lesson's date (Singapore
-- time). Returns {"skill_name", "steps"} (steps null = the legacy flow), or
-- null when refused. Needs pupil_pass from supabase_lesson_pass.sql; sg_today()
-- is repeated here, unchanged, so the order the files are run in doesn't matter.
create or replace function public.sg_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Singapore')::date;
$$;

create or replace function public.pupil_lesson_steps(p_lesson_id text, p_pass text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('skill_name', skill_name, 'steps', steps)
  from public.lessons
  where id = p_lesson_id
    and pupil_pass = p_pass
    and lesson_date = public.sg_today();
$$;

revoke all on function public.pupil_lesson_steps(text, text) from public;
grant execute on function public.pupil_lesson_steps(text, text) to anon, authenticated;
