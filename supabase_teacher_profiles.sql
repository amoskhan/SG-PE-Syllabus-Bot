-- 1. Table to store teacher profiles securely
create table if not exists public.teacher_profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  name text,
  avatar_url text,
  custom_rubrics jsonb default '{}'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Table to store chat sessions for cross-device history
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  title text not null default 'New Chat',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS (Row Level Security)
alter table public.teacher_profiles enable row level security;
alter table public.chat_sessions enable row level security;

-- Policies for teacher_profiles
create policy "Users can view own profile" on public.teacher_profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.teacher_profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.teacher_profiles for insert with check (auth.uid() = id);

-- Policies for chat_sessions
create policy "Users can view own sessions" on public.chat_sessions for select using (auth.uid() = user_id);
create policy "Users can insert own sessions" on public.chat_sessions for insert with check (auth.uid() = user_id);
create policy "Users can update own sessions" on public.chat_sessions for update using (auth.uid() = user_id);
create policy "Users can delete own sessions" on public.chat_sessions for delete using (auth.uid() = user_id);

-- Trigger for updated_at on teacher_profiles
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at_profiles
before update on public.teacher_profiles
for each row execute function public.handle_updated_at();

-- Trigger for updated_at on chat_sessions
create trigger set_updated_at_sessions
before update on public.chat_sessions
for each row execute function public.handle_updated_at();
