-- Teacher long-term memory (Tier 3)
-- Written nightly by api/daily-chat-archive.ts, read by api/get-memory.ts.
-- Safe to re-run: every statement is idempotent.

-- 1. The archive table (already exists in production; recorded here so the
--    schema lives in the repo alongside the other supabase_*.sql files)
create table if not exists public.user_memory_archive (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  summary_date  date not null,
  summary_text  text not null,
  created_at    timestamptz default now()
);

alter table public.user_memory_archive enable row level security;

-- Teachers read their own memory. The nightly job writes with the service
-- role key, which bypasses RLS, so no insert policy is needed for it.
drop policy if exists "Users can only access their own memory" on public.user_memory_archive;
create policy "Users can only access their own memory" on public.user_memory_archive
  for all using (user_id = (auth.uid())::text);

create index if not exists user_memory_archive_user_date_idx
  on public.user_memory_archive (user_id, summary_date);

-- 2. The flag the nightly job uses to avoid summarising a session twice
alter table public.chat_sessions
  add column if not exists archived boolean not null default false;

create index if not exists chat_sessions_unarchived_idx
  on public.chat_sessions (updated_at)
  where archived = false;
