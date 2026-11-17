-- Class lists and Short Names (#181). Run after supabase_teacher_profiles.sql.
-- Safe to run more than once.
--
-- 1. short_name: what a student is called day to day ("Aisha" for
--    "Nur Aisha binte Ahmad"). Optional; the only name a pupil device will show
--    (ADR 0004). Without one, the app uses the first word of the full name.
--
-- 2. Index numbers restart in every class, so a student is unique per teacher,
--    CLASS and index number, not per teacher and index number. "4b" and "4B"
--    are the same class, and index "07" is "7", matching the app's studentKey()
--    in src/utils/classList.ts. Existing rows already meet the stricter old
--    rule, so they all meet this one.

alter table public.students
  add column if not exists short_name text;

alter table public.students
  drop constraint if exists students_teacher_id_index_number_key;

create unique index if not exists students_teacher_class_index_key
  on public.students (
    teacher_id,
    upper(regexp_replace(coalesce(class, ''), '\s', '', 'g')),
    regexp_replace(btrim(index_number), '^0+(?=[0-9])', '')
  );

-- No new policy needed: "Teachers manage own students" already limits every
-- read and write to the teacher's own rows, and pupil devices have no access.
