-- ============================================================================
-- MIGRATION: Teach media — the teacher's own videos and pictures (#89)
-- Run this in your Supabase Dashboard -> SQL Editor. Safe to run multiple times.
-- Prereq: supabase_lessons.sql, supabase_lesson_pass.sql
-- ----------------------------------------------------------------------------
-- A Teach step can show pupils the teacher's own videos and pictures (a model
-- performance, the teacher demonstrating, a photo of a rubric). They live in
-- a private bucket, one folder per lesson:
--
--   teach-media/<teacher_id>/<lesson_id>/<lesson pupil_pass>/<file>
--
-- * The teacher uploads, reads and deletes only in their own folder.
-- * A pupil's device (not signed in) can read a file only when the path's
--   pass is that lesson's pass and the lesson is dated today (Singapore
--   time). It knows the path only from the lesson's steps, which it gets with
--   the pass (pupil_lesson_steps). It then asks Storage for a short-lived
--   signed link; there are no public links.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('teach-media', 'teach-media', false, 52428800,   -- 50 MB per file (the free plan's limit)
        array['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Is this path in the signed-in teacher's own folder? (A lesson being planned
-- isn't saved yet when its first video goes up, so the lesson isn't checked.)
create or replace function public.teach_media_is_mine(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and (storage.foldername(p_name))[1] = auth.uid()::text;
$$;

-- May a pupil's device read this path today? (pass in the path, lesson on today)
create or replace function public.teach_media_open_today(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.lessons l
    where l.id = (storage.foldername(p_name))[2]
      and l.teacher_id::text = (storage.foldername(p_name))[1]
      and l.pupil_pass = (storage.foldername(p_name))[3]
      and l.lesson_date = public.sg_today()
  );
$$;

revoke all on function public.teach_media_is_mine(text) from public;
revoke all on function public.teach_media_open_today(text) from public;
grant execute on function public.teach_media_is_mine(text) to anon, authenticated;
grant execute on function public.teach_media_open_today(text) to anon, authenticated;

drop policy if exists "Teachers upload own teach media" on storage.objects;
create policy "Teachers upload own teach media" on storage.objects
  for insert with check (bucket_id = 'teach-media' and public.teach_media_is_mine(name));

drop policy if exists "Teachers read own teach media" on storage.objects;
create policy "Teachers read own teach media" on storage.objects
  for select using (bucket_id = 'teach-media' and public.teach_media_is_mine(name));

drop policy if exists "Teachers delete own teach media" on storage.objects;
create policy "Teachers delete own teach media" on storage.objects
  for delete using (bucket_id = 'teach-media' and public.teach_media_is_mine(name));

drop policy if exists "Pupils read today's teach media" on storage.objects;
create policy "Pupils read today's teach media" on storage.objects
  for select using (bucket_id = 'teach-media' and public.teach_media_open_today(name));
