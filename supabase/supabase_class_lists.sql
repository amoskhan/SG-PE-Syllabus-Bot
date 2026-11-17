-- Class lists and Short Names (#181). Run after supabase_teacher_profiles.sql.
-- Safe to run more than once. Run it BEFORE deploying the app change that
-- uses it: the app now saves students' short_name.
--
-- 1. short_name: what a student is called day to day ("Aisha" for
--    "Nur Aisha binte Ahmad"). Optional; the only name a pupil device will show
--    (ADR 0004). Without one, the app uses the first word of the full name.
--
-- 2. Index numbers restart in every class, so a student is unique per teacher,
--    CLASS and index number, not per teacher and index number. "4b" and "4B"
--    are the same class, and index "07" is "7", matching the app's studentKey()
--    in src/utils/classList.ts.
--
-- The old rule compared index numbers exactly, so a teacher could have both
-- "7" and "07" in one class. The new rule counts those as the same student.
-- If any such pair exists, this script stops with a list of them and changes
-- nothing: rename or delete one of each pair, then run it again.

begin;

alter table public.students
  add column if not exists short_name text;

do $$
declare
  clashes text;
begin
  select string_agg(format('%s / class "%s" / index %s', teacher_id, coalesce(class, ''), idx), E'\n')
    into clashes
  from (
    select teacher_id,
           max(class) as class,
           regexp_replace(btrim(index_number), '^0+(?=[0-9])', '') as idx
    from public.students
    group by teacher_id,
             upper(regexp_replace(coalesce(class, ''), '\s', '', 'g')),
             regexp_replace(btrim(index_number), '^0+(?=[0-9])', '')
    having count(*) > 1
  ) d;
  if clashes is not null then
    raise exception E'Some students would be the same student under the new rule (teacher / class / index):\n%', clashes;
  end if;
end $$;

alter table public.students
  drop constraint if exists students_teacher_id_index_number_key;

create unique index if not exists students_teacher_class_index_key
  on public.students (
    teacher_id,
    upper(regexp_replace(coalesce(class, ''), '\s', '', 'g')),
    regexp_replace(btrim(index_number), '^0+(?=[0-9])', '')
  );

-- 3. renumber_students: the teacher changes saved students' index numbers in
--    a class's table, swaps included (3 ↔ 4). Done one row at a time, a swap
--    would clash with the rule above halfway through, so every moving
--    student is first parked on a number nobody uses, then given the real
--    one, all in one transaction. Runs as the teacher (row-level security
--    applies) and only touches their own students.
--    p_moves: [{"id": "<student uuid>", "index_number": "4"}, ...]
create or replace function public.renumber_students(p_moves jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.students s
     set index_number = 'moving-' || s.id::text
    from jsonb_to_recordset(p_moves) as m(id uuid, index_number text)
   where s.id = m.id and s.teacher_id = auth.uid();

  update public.students s
     set index_number = btrim(m.index_number)
    from jsonb_to_recordset(p_moves) as m(id uuid, index_number text)
   where s.id = m.id and s.teacher_id = auth.uid();
end;
$$;

revoke all on function public.renumber_students(jsonb) from public, anon;
grant execute on function public.renumber_students(jsonb) to authenticated;

commit;

-- No new policy needed: "Teachers manage own students" already limits every
-- read and write to the teacher's own rows, and pupil devices have no access.
