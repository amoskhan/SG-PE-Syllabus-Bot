-- ============================================================================
-- Migration: Add DELETE policies for pair_submissions table + student-videos storage
-- Run this in your Supabase Dashboard ? SQL Editor
-- ============================================================================

-- 1. Allow authenticated teachers to delete their own submission rows
create policy "Teachers can delete own pair submissions" on public.pair_submissions
  for delete using (auth.uid() = teacher_id or teacher_id is null);

-- 2. Allow deletion of files in the student-videos storage bucket
create policy "Allow deletion from student-videos" on storage.objects
  for delete using (bucket_id = 'student-videos');
