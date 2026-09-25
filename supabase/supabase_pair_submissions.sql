-- ============================================================================
-- SQL Migration for Multi-Device Peer Coaching & Seesaw Review Tray
-- Run this in your Supabase Dashboard SQL Editor (https://supabase.com/dashboard)
-- ============================================================================

-- 1. Create the pair_submissions table
create table if not exists public.pair_submissions (
  id                  text primary key,
  lesson_id           text not null default 'pe-lesson-today',
  pair_number         integer not null,
  skill_name          text not null default 'Overhand Throw',
  teacher_id          uuid references auth.users on delete cascade,
  pair_photo          text,
  banana_video_url    text,
  apple_video_url     text,
  banana_cues         jsonb default '[]'::jsonb,
  apple_cues          jsonb default '[]'::jsonb,
  ai_student_feedback jsonb,
  ai_teacher_report   jsonb,
  status              text not null default 'pending_sync', -- 'pending_sync', 'approved', 'needs_redo'
  teacher_feedback    text,
  teacher_star        boolean default false,
  created_at          timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at          timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Enable Row Level Security (RLS)
alter table public.pair_submissions enable row level security;

-- 3. Policies for pair_submissions table
-- Teachers can view and manage all submissions for their lessons
create policy "Teachers can read own pair submissions" on public.pair_submissions
  for select using (auth.uid() = teacher_id or teacher_id is null);

create policy "Anyone can insert pair submissions" on public.pair_submissions
  for insert with check (true);

create policy "Anyone can update pair submissions" on public.pair_submissions
  for update using (true);

-- 4. Ensure storage bucket 'student-videos' exists and is public for playback
insert into storage.buckets (id, name, public)
  values ('student-videos', 'student-videos', true)
  on conflict (id) do update set public = true;

-- 5. Storage Policies for student video uploads
create policy "Allow student uploads to student-videos" on storage.objects
  for insert with check (bucket_id = 'student-videos');

create policy "Allow public viewing of student-videos" on storage.objects
  for select using (bucket_id = 'student-videos');

create policy "Allow updates to student-videos" on storage.objects
  for update using (bucket_id = 'student-videos');

-- 6. Indexes for fast queries by teacher
create index if not exists pair_submissions_teacher_idx
  on public.pair_submissions (teacher_id, created_at desc);

create index if not exists pair_submissions_lesson_idx
  on public.pair_submissions (lesson_id, pair_number);
