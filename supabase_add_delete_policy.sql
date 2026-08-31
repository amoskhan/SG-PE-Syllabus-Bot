-- ============================================================================
-- Migration: Add DELETE policy to pair_submissions
-- Run this in your Supabase Dashboard ? SQL Editor
-- ============================================================================

-- Allow authenticated teachers to delete their own submissions
create policy "Teachers can delete own pair submissions" on public.pair_submissions
  for delete using (auth.uid() = teacher_id or teacher_id is null);
