-- ============================================================================
-- FIX MIGRATION: Peer Coaching Submission Pipeline
-- Run this in Supabase Dashboard -> SQL Editor
-- It is safe to run multiple times (idempotent)
-- ============================================================================

-- 1. Ensure the student-videos storage bucket is PUBLIC so teacher can play videos
UPDATE storage.buckets SET public = true WHERE id = 'student-videos';
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-videos', 'student-videos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Storage object policies — drop old and recreate cleanly
DROP POLICY IF EXISTS "Allow student uploads to student-videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public viewing of student-videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow updates to student-videos" ON storage.objects;

CREATE POLICY "Allow student uploads to student-videos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'student-videos');

CREATE POLICY "Allow public viewing of student-videos" ON storage.objects
  FOR SELECT USING (bucket_id = 'student-videos');

CREATE POLICY "Allow updates to student-videos" ON storage.objects
  FOR UPDATE USING (bucket_id = 'student-videos');

-- 3. pair_submissions SELECT policy — open to all (safe for a classroom PE tool)
DROP POLICY IF EXISTS "Teachers can read own pair submissions" ON public.pair_submissions;
DROP POLICY IF EXISTS "Allow reading all pair submissions" ON public.pair_submissions;

CREATE POLICY "Allow reading all pair submissions" ON public.pair_submissions
  FOR SELECT USING (true);

-- 4. INSERT policy
DROP POLICY IF EXISTS "Anyone can insert pair submissions" ON public.pair_submissions;
CREATE POLICY "Anyone can insert pair submissions" ON public.pair_submissions
  FOR INSERT WITH CHECK (true);

-- 5. UPDATE policy (needed for upsert-on-conflict from anon student devices)
DROP POLICY IF EXISTS "Anyone can update pair submissions" ON public.pair_submissions;
CREATE POLICY "Anyone can update pair submissions" ON public.pair_submissions
  FOR UPDATE USING (true);

-- 6. DELETE policy (teacher removes submissions)
DROP POLICY IF EXISTS "Teachers can delete own pair submissions" ON public.pair_submissions;
CREATE POLICY "Teachers can delete own pair submissions" ON public.pair_submissions
  FOR DELETE USING (auth.uid() = teacher_id OR teacher_id IS NULL);

-- 7. Storage DELETE (teacher removes video files)
DROP POLICY IF EXISTS "Teachers can delete student-videos" ON storage.objects;
CREATE POLICY "Teachers can delete student-videos" ON storage.objects
  FOR DELETE USING (bucket_id = 'student-videos');

-- 8. Indexes
CREATE INDEX IF NOT EXISTS pair_submissions_teacher_idx
  ON public.pair_submissions (teacher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pair_submissions_lesson_idx
  ON public.pair_submissions (lesson_id, pair_number);
