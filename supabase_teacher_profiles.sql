-- Table to store teacher profiles securely in Supabase.
-- This allows custom rubrics and other settings to sync across devices.

create table if not exists public.teacher_profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  name text,
  avatar_url text,
  custom_rubrics jsonb default '{}'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS (Row Level Security)
alter table public.teacher_profiles enable row level security;

-- Policies to ensure users can only access their own data
create policy "Users can view own profile" 
  on public.teacher_profiles for select 
  using (auth.uid() = id);

create policy "Users can update own profile" 
  on public.teacher_profiles for update 
  using (auth.uid() = id);

create policy "Users can insert own profile" 
  on public.teacher_profiles for insert 
  with check (auth.uid() = id);

-- Trigger to update 'updated_at' on change
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at
before update on public.teacher_profiles
for each row
execute function public.handle_updated_at();
