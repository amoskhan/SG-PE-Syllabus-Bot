-- Teacher review of an AI grading.
--
-- The AI's own verdict stays untouched in analysis_text / proficiency_level.
-- A teacher's corrections sit beside it, and everything that reads a grading
-- (the Progress section, the nightly summary) prefers the teacher's values.
--
--   teacher_criteria     { "Step with opposite foot": "met", "Rotate hips": "missed", ... }
--                        — every cue in the checklist, as the teacher confirmed it
--   teacher_level        the level the teacher settled on
--   teacher_reviewed_at  when they last saved the review; null = not reviewed
--
-- No new policy needed: "Teachers manage own analyses" already lets a teacher
-- update rows with their own teacher_id, and nobody else.

alter table public.skill_analyses
  add column if not exists teacher_criteria    jsonb,
  add column if not exists teacher_level       text,
  add column if not exists teacher_reviewed_at timestamptz;
