-- Stores each user's Expo push token(s) so the backend can send them
-- notifications. A user can have several devices, hence (user_id, token) PK.
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists public.push_tokens (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  token      text        not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

alter table public.push_tokens enable row level security;

-- a user can only see/insert/delete their OWN tokens
drop policy if exists "push_tokens_select_own" on public.push_tokens;
create policy "push_tokens_select_own" on public.push_tokens
  for select using (auth.uid() = user_id);

drop policy if exists "push_tokens_insert_own" on public.push_tokens;
create policy "push_tokens_insert_own" on public.push_tokens
  for insert with check (auth.uid() = user_id);

drop policy if exists "push_tokens_delete_own" on public.push_tokens;
create policy "push_tokens_delete_own" on public.push_tokens
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on table public.push_tokens to authenticated;
