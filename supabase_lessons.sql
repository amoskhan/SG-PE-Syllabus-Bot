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
