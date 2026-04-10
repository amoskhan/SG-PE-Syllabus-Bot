-- Migration: Add students and skill_analyses tables
-- Run this in Supabase SQL Editor if the main supabase_teacher_profiles.sql
-- fails due to existing policies on teacher_profiles / chat_sessions.

-- 1. Students table
create table if not exists public.students (
  id               uuid primary key default gen_random_uuid(),
  teacher_id       uuid references auth.users on delete cascade not null,
  index_number     text not null,
  name             text not null,
  class            text,
  progress_summary jsonb default '{}'::jsonb,
  created_at       timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(teacher_id, index_number)
);

alter table public.students enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'students' and policyname = 'Teachers manage own students'
  ) then
    execute 'create policy "Teachers manage own students" on public.students
      for all using (auth.uid() = teacher_id)';
  end if;
end $$;

-- 2. Skill analyses table
create table if not exists public.skill_analyses (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid references public.students on delete cascade not null,
  teacher_id        uuid references auth.users on delete cascade not null,
  skill_name        text not null,
  video_hash        text,
  proficiency_level text,
  analysis_text     text not null,
  pose_data         jsonb,
  session_id        text,
  model_id          text,
  token_usage       integer,
  summarised        boolean default false,
  created_at        timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.skill_analyses enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'skill_analyses' and policyname = 'Teachers manage own analyses'
  ) then
    execute 'create policy "Teachers manage own analyses" on public.skill_analyses
      for all using (auth.uid() = teacher_id)';
  end if;
end $$;

-- 3. Indexes
create index if not exists skill_analyses_student_skill_idx
  on public.skill_analyses (student_id, skill_name, created_at desc);

create index if not exists skill_analyses_video_hash_idx
  on public.skill_analyses (teacher_id, video_hash, skill_name);

create index if not exists skill_analyses_unsummarised_idx
  on public.skill_analyses (summarised, created_at)
  where summarised = false;
