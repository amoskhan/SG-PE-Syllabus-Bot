-- ============================================================================
-- MIGRATION: Pair check-in sessions (Live Pair Check-In Grid, multi-device)
-- Run this in your Supabase Dashboard -> SQL Editor. Safe to run multiple times.
-- ============================================================================

-- A "check-in" is the pre-lineup selfie step (PairCheckInModal) — it happens in the
-- classroom BEFORE students go to the venue to record their practice videos.
-- The teacher's Command Board runs on a different device, so check-ins must be synced
-- to the cloud for the "Live Pair Check-In Grid" to show anything real.

create table if not exists public.pair_sessions (
  id            text primary key,                 -- `${lesson_id}-p${pair_number}`
  lesson_id     text not null default 'pe-lesson-today',
  pair_number   integer not null,
  skill_name    text,
  teacher_id    uuid references auth.users on delete cascade,
  pair_photo    text,
  needs_help    boolean not null default false,
  checked_in_at timestamptz not null default timezone('utc'::text, now()),
  updated_at    timestamptz not null default timezone('utc'::text, now())
);

alter table public.pair_sessions enable row level security;

-- Open policies — same posture as pair_submissions (classroom PE tool, anon student devices)
drop policy if exists "read all pair_sessions"   on public.pair_sessions;
drop policy if exists "insert pair_sessions"     on public.pair_sessions;
drop policy if exists "update pair_sessions"     on public.pair_sessions;
drop policy if exists "delete pair_sessions"     on public.pair_sessions;

create policy "read all pair_sessions"  on public.pair_sessions for select using (true);
create policy "insert pair_sessions"    on public.pair_sessions for insert with check (true);
create policy "update pair_sessions"    on public.pair_sessions for update using (true);
create policy "delete pair_sessions"    on public.pair_sessions
  for delete using (auth.uid() = teacher_id or teacher_id is null);

create index if not exists pair_sessions_teacher_idx
  on public.pair_sessions (teacher_id, checked_in_at desc);
create index if not exists pair_sessions_lesson_idx
  on public.pair_sessions (lesson_id, pair_number);
