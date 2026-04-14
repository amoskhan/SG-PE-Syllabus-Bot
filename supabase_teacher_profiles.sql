-- 1. Table to store teacher profiles securely
create table if not exists public.teacher_profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  name text,
  avatar_url text,
  custom_rubrics jsonb default '{}'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Table to store chat sessions for cross-device history
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  title text not null default 'New Chat',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS (Row Level Security)
alter table public.teacher_profiles enable row level security;
alter table public.chat_sessions enable row level security;

-- Policies for teacher_profiles
create policy "Users can view own profile" on public.teacher_profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.teacher_profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.teacher_profiles for insert with check (auth.uid() = id);

-- Policies for chat_sessions
create policy "Users can view own sessions" on public.chat_sessions for select using (auth.uid() = user_id);
create policy "Users can insert own sessions" on public.chat_sessions for insert with check (auth.uid() = user_id);
create policy "Users can update own sessions" on public.chat_sessions for update using (auth.uid() = user_id);
create policy "Users can delete own sessions" on public.chat_sessions for delete using (auth.uid() = user_id);

-- Trigger for updated_at on teacher_profiles
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at_profiles
before update on public.teacher_profiles
for each row execute function public.handle_updated_at();

-- Trigger for updated_at on chat_sessions
create trigger set_updated_at_sessions
before update on public.chat_sessions
for each row execute function public.handle_updated_at();

-- 3. Table to store students (per teacher, identified by index number)
create table if not exists public.students (
  id               uuid primary key default gen_random_uuid(),
  teacher_id       uuid references auth.users on delete cascade not null,
  index_number     text not null,
  name             text not null,
  class            text,
  progress_summary jsonb default '{}'::jsonb, -- { "Underhand Throw": "summary text..." }
  created_at       timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(teacher_id, index_number)
);

alter table public.students enable row level security;

create policy "Teachers manage own students" on public.students
  for all using (auth.uid() = teacher_id);

-- 4. Table to store raw skill analysis records
create table if not exists public.skill_analyses (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid references public.students on delete cascade not null,
  teacher_id        uuid references auth.users on delete cascade not null,
  skill_name        text not null,
  video_hash        text,
  video_url         text,
  proficiency_level text,
  analysis_text     text not null,
  pose_data         jsonb,
  session_id        text,
  model_id          text,
  token_usage       integer,
  summarised        boolean default false,
  created_at        timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Storage bucket for student video uploads (viewed from dashboard)
insert into storage.buckets (id, name, public)
  values ('student-videos', 'student-videos', false)
  on conflict (id) do nothing;

create policy "Teachers upload own student videos" on storage.objects
  for insert with check (
    bucket_id = 'student-videos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Teachers read own student videos" on storage.objects
  for select using (
    bucket_id = 'student-videos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

alter table public.skill_analyses enable row level security;

create policy "Teachers manage own analyses" on public.skill_analyses
  for all using (auth.uid() = teacher_id);

create index if not exists skill_analyses_student_skill_idx
  on public.skill_analyses (student_id, skill_name, created_at desc);

create index if not exists skill_analyses_video_hash_idx
  on public.skill_analyses (teacher_id, video_hash, skill_name);

create index if not exists skill_analyses_unsummarised_idx
  on public.skill_analyses (summarised, created_at)
  where summarised = false;
