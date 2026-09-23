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
--   * 'analysis' (Analyse Apple / Banana) and 'question' (Practice Station chat):
--       5 calls per pupil; the pupil's first analysis uses Sonnet, the rest Haiku
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

alter table public.ai_usage enable row level security;

-- Teachers can see usage for their own lessons (e.g. a future Dashboard view)
drop policy if exists "Teachers read own lesson AI usage" on public.ai_usage;
create policy "Teachers read own lesson AI usage" on public.ai_usage
  for select using (
    exists (select 1 from public.lessons l where l.id = ai_usage.lesson_id and l.teacher_id = auth.uid())
  );


-- Returns {"ok": true, "model": "sonnet"|"haiku"}
--      or {"ok": false, "reason": "invalid_lesson"|"budget"}
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
  v_limit     integer;
  v_row       public.ai_usage%rowtype;
  v_model     text;
begin
  select pair_count into v_pairs
  from public.lessons
  where id = p_lesson_id and pupil_pass = p_pass and lesson_date = public.sg_today();

  if v_pairs is null or p_pair_number is null or p_pair_number not between 1 and v_pairs then
    return jsonb_build_object('ok', false, 'reason', 'invalid_lesson');
  end if;

  if p_purpose = 'peer_feedback' then
    v_performer := 'pair';
    v_limit := 12;
  elsif p_purpose in ('analysis', 'question') and p_performer in ('apple', 'banana') then
    v_performer := p_performer;
    v_limit := 5;
  else
    return jsonb_build_object('ok', false, 'reason', 'invalid_lesson');
  end if;

  insert into public.ai_usage (lesson_id, pair_number, performer)
  values (p_lesson_id, p_pair_number, v_performer)
  on conflict do nothing;

  select * into v_row from public.ai_usage
  where lesson_id = p_lesson_id and pair_number = p_pair_number and performer = v_performer
  for update;

  if v_row.calls >= v_limit then
    return jsonb_build_object('ok', false, 'reason', 'budget');
  end if;

  v_model := case when p_purpose = 'analysis' and not v_row.sonnet_used then 'sonnet' else 'haiku' end;

  update public.ai_usage set
    calls       = calls + 1,
    sonnet_used = sonnet_used or v_model = 'sonnet',
    updated_at  = now()
  where lesson_id = p_lesson_id and pair_number = p_pair_number and performer = v_performer;

  return jsonb_build_object('ok', true, 'model', v_model);
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
    calls       = greatest(calls - 1, 0),
    sonnet_used = case when p_model = 'sonnet' then false else sonnet_used end,
    updated_at  = now()
  where lesson_id = p_lesson_id
    and pair_number = p_pair_number
    and performer = case when p_purpose = 'peer_feedback' then 'pair' else p_performer end;
$$;

revoke all on function public.pupil_ai_use(text, text, integer, text, text) from public, anon, authenticated;
revoke all on function public.pupil_ai_refund(text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.pupil_ai_use(text, text, integer, text, text) to service_role;
grant execute on function public.pupil_ai_refund(text, integer, text, text, text) to service_role;
