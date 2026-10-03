-- ============================================================================
-- MIGRATION: Pupil AI budget (Claude via /api/claude)
-- Run this in your Supabase Dashboard -> SQL Editor. Safe to run multiple times.
-- Prereq: supabase_lessons.sql, supabase_lesson_pass.sql
-- ----------------------------------------------------------------------------
-- Pupils aren't signed in. api/claude.ts lets them use Claude only with the
-- lesson pass of a lesson dated today, and asks pupil_ai_use() before every
-- call. Per lesson:
--   * automatic feedback after a pair sends (purpose 'peer_feedback'):
--       Haiku, 12 calls per pair (each send makes 4 calls → 3 sends)
--   * 'analysis' (Analyse Apple / Banana): 1 per pupil, on Sonnet (#95). A
--       teacher's redo request doesn't add another: the teacher grades a re-do.
--   * 'question' (Practice Station chat): 5 per pupil, on Haiku, counted
--       separately from the analysis
-- Both functions are callable only with the service role key (the server),
-- never from a browser.
-- ============================================================================

create table if not exists public.ai_usage (
  lesson_id    text not null references public.lessons (id) on delete cascade,
  pair_number  integer not null,
  performer    text not null check (performer in ('apple', 'banana', 'pair')),
  calls        integer not null default 0,
  sonnet_used  boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (lesson_id, pair_number, performer)
);

-- Per pupil counts (#95); `calls` is now used only for the pair's peer feedback
alter table public.ai_usage
  add column if not exists analyses  integer not null default 0,
  add column if not exists questions integer not null default 0;

alter table public.ai_usage enable row level security;

-- Teachers can see usage for their own lessons (e.g. a future Dashboard view)
drop policy if exists "Teachers read own lesson AI usage" on public.ai_usage;
create policy "Teachers read own lesson AI usage" on public.ai_usage
  for select using (
    exists (select 1 from public.lessons l where l.id = ai_usage.lesson_id and l.teacher_id = auth.uid())
  );


-- Returns {"ok": true, "model": "sonnet"|"haiku", "questions_left": n (questions only)}
--      or {"ok": false, "reason": "invalid_lesson"|"budget"|"analysis_used"|"questions_used"}
create or replace function public.pupil_ai_use(
  p_lesson_id   text,
  p_pass        text,
  p_pair_number integer,
  p_performer   text,
  p_purpose     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pairs     integer;
  v_performer text;
  v_row       public.ai_usage%rowtype;
begin
  select pair_count into v_pairs
  from public.lessons
  where id = p_lesson_id and pupil_pass = p_pass and lesson_date = public.sg_today();

  if v_pairs is null or p_pair_number is null or p_pair_number not between 1 and v_pairs then
    return jsonb_build_object('ok', false, 'reason', 'invalid_lesson');
  end if;

  if p_purpose = 'peer_feedback' then
    v_performer := 'pair';
  elsif p_purpose in ('analysis', 'question') and p_performer in ('apple', 'banana') then
    v_performer := p_performer;
  else
    return jsonb_build_object('ok', false, 'reason', 'invalid_lesson');
  end if;

  insert into public.ai_usage (lesson_id, pair_number, performer)
  values (p_lesson_id, p_pair_number, v_performer)
  on conflict do nothing;

  select * into v_row from public.ai_usage
  where lesson_id = p_lesson_id and pair_number = p_pair_number and performer = v_performer
  for update;

  if p_purpose = 'peer_feedback' then
    if v_row.calls >= 12 then
      return jsonb_build_object('ok', false, 'reason', 'budget');
    end if;
    update public.ai_usage set calls = calls + 1, updated_at = now()
    where lesson_id = p_lesson_id and pair_number = p_pair_number and performer = v_performer;
    return jsonb_build_object('ok', true, 'model', 'haiku');
  end if;

  if p_purpose = 'analysis' then
    if v_row.analyses >= 1 then
      return jsonb_build_object('ok', false, 'reason', 'analysis_used');
    end if;
    update public.ai_usage set analyses = analyses + 1, sonnet_used = true, updated_at = now()
    where lesson_id = p_lesson_id and pair_number = p_pair_number and performer = v_performer;
    return jsonb_build_object('ok', true, 'model', 'sonnet');
  end if;

  -- question
  if v_row.questions >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'questions_used');
  end if;
  update public.ai_usage set questions = questions + 1, updated_at = now()
  where lesson_id = p_lesson_id and pair_number = p_pair_number and performer = v_performer;
  return jsonb_build_object('ok', true, 'model', 'haiku', 'questions_left', 4 - v_row.questions);
end;
$$;

-- Give a call back when Anthropic failed, so a pupil doesn't lose a turn
-- (or their Sonnet grading) to an outage.
create or replace function public.pupil_ai_refund(
  p_lesson_id   text,
  p_pair_number integer,
  p_performer   text,
  p_purpose     text,
  p_model       text
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_usage set
    calls      = case when p_purpose = 'peer_feedback' then greatest(calls - 1, 0) else calls end,
    analyses   = case when p_purpose = 'analysis' then greatest(analyses - 1, 0) else analyses end,
    questions  = case when p_purpose = 'question' then greatest(questions - 1, 0) else questions end,
    updated_at = now()
  where lesson_id = p_lesson_id
    and pair_number = p_pair_number
    and performer = case when p_purpose = 'peer_feedback' then 'pair' else p_performer end;
$$;

revoke all on function public.pupil_ai_use(text, text, integer, text, text) from public, anon, authenticated;
revoke all on function public.pupil_ai_refund(text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.pupil_ai_use(text, text, integer, text, text) to service_role;
grant execute on function public.pupil_ai_refund(text, integer, text, text, text) to service_role;
