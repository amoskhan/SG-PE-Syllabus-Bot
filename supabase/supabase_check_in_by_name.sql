-- ============================================================================
-- MIGRATION: Check-in by name (#183, ADR 0004)
-- Run this in your Supabase Dashboard -> SQL Editor. Safe to run more than once.
-- Prereq: supabase_lesson_pass.sql, supabase_lesson_pairs.sql,
--         supabase_class_lists.sql (students.short_name)
-- Run it BEFORE deploying the app change: the iPad's check-in asks for these.
-- ----------------------------------------------------------------------------
-- Pupils check in by tapping their own names instead of a pair number. The
-- pair number and who is Apple or Banana come from the teacher's Pair
-- Assignment (lesson_pairs), so work files under the right students through
-- the existing copy into student records (sync_practice_analysis).
--
-- What a pupil device may see (ADR 0004): only the students in the lesson's
-- Pair Assignment, by their Short Names, only with the lesson pass for a
-- lesson dated today (Singapore time). Never full names, never other students.
--
-- A name is taken once its pair has checked in. The teacher frees it with
-- Restart on the board (teacher_restart_pair deletes the check-in).
-- ============================================================================

-- ── 1. Who checked in, on the pair's check-in ───────────────────────────────
alter table public.pair_sessions
  add column if not exists apple_student  uuid references public.students on delete set null,
  add column if not exists banana_student uuid references public.students on delete set null;


-- ── 2. The name a pupil device shows ────────────────────────────────────────
-- The Short Name, or the same guess the app makes (suggestShortName in
-- src/utils/classList.ts): the first word of the full name, skipping
-- Muhammad, Mohd, Mohamed, Md, Nur and Nurul.
create or replace function public.short_name_or_guess(p_short text, p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(
    nullif(btrim(p_short), ''),
    (select w from regexp_split_to_table(btrim(coalesce(p_name, '')), '[\s,]+') with ordinality as t(w, i)
      where w <> '' and lower(regexp_replace(w, '\.$', '')) not in ('muhammad', 'mohd', 'mohamed', 'md', 'nur', 'nurul')
      order by i limit 1),
    (select w from regexp_split_to_table(btrim(coalesce(p_name, '')), '[\s,]+') with ordinality as t(w, i)
      where w <> '' order by i limit 1),
    ''
  );
$$;


-- ── 3. The planned students, for the name buttons ──────────────────────────
create or replace function public.pupil_planned_students(p_lesson_id text, p_pass text)
returns table (student_id uuid, short_name text, pair_number integer, performer text, taken boolean)
language sql
stable
security definer
set search_path = public
as $$
  select lp.student_id,
         public.short_name_or_guess(s.short_name, s.name),
         lp.pair_number,
         lp.performer,
         exists (select 1 from public.pair_sessions ps
                  where ps.lesson_id = l.id and lp.student_id in (ps.apple_student, ps.banana_student))
  from public.lessons l
  join public.lesson_pairs lp on lp.lesson_id = l.id and lp.pair_number between 1 and l.pair_count
  join public.students s on s.id = lp.student_id
  where l.id = p_lesson_id
    and ((auth.uid() is not null and l.teacher_id = auth.uid())
         or (l.pupil_pass = p_pass and l.lesson_date = public.sg_today()));
$$;


-- ── 4. Check a pair in by their names ──────────────────────────────────────
-- Returns {"result": "ok" | "not_planned" | "taken" | "claimed" | "invalid_lesson",
--          "pair_number": n}. The two students must be the Apple and Banana of
-- one planned pair; neither may have checked in with another pair. The rest
-- (claim token against a second iPad, the photo) is pupil_check_in, as before.
create or replace function public.pupil_check_in_by_name(
  p_lesson_id   text,
  p_pass        text,
  p_apple       uuid,
  p_banana      uuid,
  p_skill_name  text,
  p_pair_photo  text,
  p_needs_help  boolean,
  p_claim_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair   integer;
  v_result text;
begin
  if not exists (
    select 1 from public.lessons
     where id = p_lesson_id
       and ((auth.uid() is not null and teacher_id = auth.uid())
            or (pupil_pass = p_pass and lesson_date = public.sg_today()))
  ) then
    return jsonb_build_object('result', 'invalid_lesson');
  end if;

  select a.pair_number into v_pair
    from public.lesson_pairs a
    join public.lesson_pairs b on b.lesson_id = a.lesson_id and b.pair_number = a.pair_number
   where a.lesson_id = p_lesson_id
     and a.performer = 'apple'  and a.student_id = p_apple
     and b.performer = 'banana' and b.student_id = p_banana;
  if v_pair is null then
    return jsonb_build_object('result', 'not_planned');
  end if;

  if exists (
    select 1 from public.pair_sessions
     where lesson_id = p_lesson_id and id <> p_lesson_id || '-p' || v_pair
       and (apple_student in (p_apple, p_banana) or banana_student in (p_apple, p_banana))
  ) then
    return jsonb_build_object('result', 'taken', 'pair_number', v_pair);
  end if;

  v_result := public.pupil_check_in(p_lesson_id, p_pass, v_pair, p_skill_name, p_pair_photo, p_needs_help, p_claim_token);
  if v_result = 'ok' then
    update public.pair_sessions set apple_student = p_apple, banana_student = p_banana
     where id = p_lesson_id || '-p' || v_pair;
  end if;
  return jsonb_build_object('result', v_result, 'pair_number', v_pair);
end;
$$;

revoke all on function public.short_name_or_guess(text, text) from public;
revoke all on function public.pupil_planned_students(text, text) from public;
revoke all on function public.pupil_check_in_by_name(text, text, uuid, uuid, text, text, boolean, text) from public;
grant execute on function public.pupil_planned_students(text, text) to anon, authenticated;
grant execute on function public.pupil_check_in_by_name(text, text, uuid, uuid, text, text, boolean, text) to anon, authenticated;
