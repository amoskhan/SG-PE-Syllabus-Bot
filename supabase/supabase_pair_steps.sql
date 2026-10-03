-- ============================================================================
-- MIGRATION: Which lesson step each pair is on (#91)
-- Run this in your Supabase Dashboard -> SQL Editor. Safe to run multiple times.
-- Prereq: supabase_pair_sessions.sql, supabase_lesson_pass.sql,
--         supabase_protect_pupil_data.sql
-- ----------------------------------------------------------------------------
-- A pair's device reports the step it's on (src/utils/lessonFlow.ts) to its
-- check-in row, so the Classroom Board can show where every pair is. Pupils
-- can't write pair_sessions directly: they go through pupil_set_step, which
-- needs the lesson pass, a lesson dated today, and the pair's own claim token.
-- ============================================================================

alter table public.pair_sessions
  add column if not exists step_id         text,         -- the step's id in lessons.steps
  add column if not exists step_index      integer,      -- its position, if the step was since removed
  add column if not exists step_finished   boolean not null default false,  -- past the last step
  add column if not exists step_updated_at timestamptz;

-- Returns 'ok' | 'invalid_lesson' | 'claimed'
create or replace function public.pupil_set_step(
  p_lesson_id   text,
  p_pass        text,
  p_pair_number integer,
  p_claim_token text,
  p_step_id     text,
  p_step_index  integer,
  p_finished    boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.pair_sessions%rowtype;
begin
  if not exists (
    select 1 from public.lessons
    where id = p_lesson_id
      and ((auth.uid() is not null and teacher_id = auth.uid())
           or (pupil_pass = p_pass and lesson_date = public.sg_today()))
  ) then
    return 'invalid_lesson';
  end if;

  select * into v_row from public.pair_sessions where id = p_lesson_id || '-p' || p_pair_number;
  if not found then return 'invalid_lesson'; end if;
  if v_row.claim_token is not null and v_row.claim_token is distinct from p_claim_token then
    return 'claimed';
  end if;

  update public.pair_sessions set
    step_id         = left(p_step_id, 80),
    step_index      = greatest(coalesce(p_step_index, 0), 0),
    step_finished   = coalesce(p_finished, false),
    step_updated_at = now()
  where id = v_row.id;
  return 'ok';
end;
$$;

revoke all on function public.pupil_set_step(text, text, integer, text, text, integer, boolean) from public;
grant execute on function public.pupil_set_step(text, text, integer, text, text, integer, boolean) to anon, authenticated;
