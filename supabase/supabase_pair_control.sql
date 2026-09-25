-- ============================================================================
-- MIGRATION: Pair claim tokens + teacher-control safeguards
-- Run this in your Supabase Dashboard -> SQL Editor. Safe to run multiple times.
-- ----------------------------------------------------------------------------
-- Fixes three linked problems:
--  1. A student re-uploading onto a pair wiped the teacher's feedback / star / AI
--     analysis (blind upsert with defaultToNull nulled the omitted columns).
--  2. Two different groups picking the same "Pair N" wrote to the same row and
--     clobbered each other.
--  3. (client-side) the teacher had no way to clear a check-in.
--
-- Prereq: supabase_pair_sessions.sql, supabase_pair_submissions.sql and
-- supabase_add_ai_chat_analysis.sql already run (this relies on the existing
-- pair_sessions delete policy and the ai_chat_analysis column).
-- ============================================================================

-- ── 1. Claim-token columns ─────────────────────────────────────────────────────
-- A claim token is a random id the student device generates once per lesson and
-- keeps in localStorage. It identifies "this group" so the same group can resume
-- its own pair, but a different group cannot write to a taken pair number.
alter table public.pair_sessions    add column if not exists claim_token text;
alter table public.pair_submissions add column if not exists claim_token text;

comment on column public.pair_submissions.status is
  '''pending_sync'', ''synced'', ''approved'', ''needs_redo'', ''resubmitted''';

-- ── 2. Protect teacher-authored columns from anonymous (student) writes ────────
-- Authenticated teacher writes have a non-null auth.uid() and are untouched.
-- Anonymous student devices (auth.uid() IS NULL) can update videos / cues / photo
-- but can never erase the teacher's comment, star, created_at, or AI analysis, and
-- a re-submit of already-reviewed work is re-queued as 'resubmitted' rather than
-- silently reverting to 'pending_sync'.
create or replace function public.protect_teacher_columns()
returns trigger
language plpgsql
security definer
as $$
begin
  if auth.uid() is null then
    new.teacher_feedback := old.teacher_feedback;
    new.teacher_star     := old.teacher_star;
    new.created_at       := old.created_at;

    if old.status in ('approved', 'needs_redo') and new.status = 'pending_sync' then
      new.status := 'resubmitted';
    end if;

    -- Keep prior AI analysis if the incoming write doesn't carry it (video-only re-upload)
    if new.ai_chat_analysis   is null then new.ai_chat_analysis   := old.ai_chat_analysis;   end if;
    if new.ai_student_feedback is null then new.ai_student_feedback := old.ai_student_feedback; end if;
    if new.ai_teacher_report  is null then new.ai_teacher_report  := old.ai_teacher_report;  end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_teacher_columns on public.pair_submissions;
create trigger trg_protect_teacher_columns
  before update on public.pair_submissions
  for each row execute function public.protect_teacher_columns();

-- ── 3. Reject cross-group writes to a claimed pair ────────────────────────────
-- If a row already carries a claim_token and the incoming write presents a
-- different one, block it. The client turns this exception into a friendly
-- "Pair N is already in use — pick another number" message.
create or replace function public.enforce_pair_claim()
returns trigger
language plpgsql
as $$
declare
  existing_token text;
begin
  if new.claim_token is null then
    return new; -- legacy / teacher-side writes without a token are allowed
  end if;

  select claim_token into existing_token
  from public.pair_sessions
  where id = new.id;

  if existing_token is not null and existing_token <> new.claim_token then
    raise exception 'PAIR_CLAIMED: pair % is already in use by another group', new.pair_number
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_pair_claim on public.pair_sessions;
create trigger trg_enforce_pair_claim
  before insert or update on public.pair_sessions
  for each row execute function public.enforce_pair_claim();

-- Same guard for submissions (defence in depth; the client checks first).
create or replace function public.enforce_submission_claim()
returns trigger
language plpgsql
as $$
declare
  existing_token text;
begin
  if new.claim_token is null or auth.uid() is not null then
    return new; -- teacher writes and legacy writes bypass
  end if;

  select claim_token into existing_token
  from public.pair_submissions
  where id = new.id;

  if existing_token is not null and existing_token <> new.claim_token then
    raise exception 'PAIR_CLAIMED: submission % is owned by another group', new.pair_number
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_submission_claim on public.pair_submissions;
create trigger trg_enforce_submission_claim
  before insert or update on public.pair_submissions
  for each row execute function public.enforce_submission_claim();
