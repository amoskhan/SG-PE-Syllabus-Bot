-- Create the table for storing chat logs
create table public.chat_logs (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  session_id text,
  user_message text,
  bot_response text,
  detected_skill text,
  metadata jsonb
);

-- Enable Row Level Security (RLS)
alter table public.chat_logs enable row level security;

-- Create a policy that allows anyone (anon) to INSERT rows
-- This is necessary because our public website users are 'anon'
create policy "Allow public insert access"
  on public.chat_logs
  for insert
  with check (true);

-- Optional: Create a policy that allows only service_role (Admin/Dashboard) to SELECT/READ
-- This prevents random users from reading other people's chats via the API
create policy "Allow service_role read access"
  on public.chat_logs
  for select
  using (auth.role() = 'service_role');
  
-- Allow anon to read for now if you want to verify from client (Development only)
-- create policy "Allow public read access"
--   on public.chat_logs
--   for select
--   using (true);
