-- ============================================================================
-- Narrows — boater <-> marina direct messaging
-- Run this in Supabase → SQL Editor, or `supabase db query --linked -f`.
-- Safe to re-run (IF NOT EXISTS / drops before create).
--
-- One thread per (boater, marina) PAIR, not per booking. The entry point is a
-- single DM icon on the marina's profile page, not a button on a specific
-- booking card -- so this is closer to Instagram DMs (one conversation with a
-- person) than a support-ticket thread per transaction. "Incase something
-- goes wrong" on any of that boater's bookings with this marina lands in the
-- same conversation.
-- ============================================================================

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  marina_id   uuid not null references public.marinas(id) on delete cascade,
  boater_id   uuid not null references auth.users(id) on delete cascade,
  sender_id   uuid not null references auth.users(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

-- Every thread view and unread-count check filters by (marina_id, boater_id).
create index if not exists messages_thread_idx
  on public.messages (marina_id, boater_id, created_at desc);

-- Unread-badge counts filter by recipient with read_at is null; this index
-- serves both the boater's and the marina's badge query.
create index if not exists messages_unread_idx
  on public.messages (marina_id, boater_id) where read_at is null;

alter table public.messages enable row level security;

-- Only the boater in the thread, or the marina's own profile_id, can read it.
drop policy if exists "messages_select_participants" on public.messages;
create policy "messages_select_participants" on public.messages
  for select using (
    boater_id = auth.uid()
    or marina_id in (select id from public.marinas where profile_id = auth.uid())
  );

-- A sender can only post as themselves, and only into a thread they're
-- actually a participant of.
drop policy if exists "messages_insert_participants" on public.messages;
create policy "messages_insert_participants" on public.messages
  for insert with check (
    sender_id = auth.uid()
    and (
      boater_id = auth.uid()
      or marina_id in (select id from public.marinas where profile_id = auth.uid())
    )
  );

-- Only used to stamp read_at on incoming messages. There's no separate
-- recipient column, so this allows a participant to touch any row in their
-- own thread -- harmless if a client also marks its own sent messages read.
drop policy if exists "messages_update_participants" on public.messages;
create policy "messages_update_participants" on public.messages
  for update using (
    boater_id = auth.uid()
    or marina_id in (select id from public.marinas where profile_id = auth.uid())
  )
  with check (
    boater_id = auth.uid()
    or marina_id in (select id from public.marinas where profile_id = auth.uid())
  );

-- GRANT TRAP (see HANDOFF.md "Gotchas"): RLS alone is not enough -- without
-- this, every read/write 403s with "permission denied for table messages"
-- regardless of policy correctness.
grant select, insert, update on table public.messages to authenticated;

-- Defense in depth: if this table is created via `supabase db query --linked`
-- (vs. the SQL Editor), it inherits supabase_admin's default ACL, which
-- auto-grants anon full select/insert/update/delete -- RLS still blocks anon
-- functionally (every policy checks auth.uid(), which is null for anon), but
-- there's no reason to carry the unused grant. Revoke DELETE from
-- authenticated too -- the app never deletes a message.
revoke all on table public.messages from anon;
revoke delete on table public.messages from authenticated;

-- Realtime: lets both sides subscribe to new messages in their thread live.
-- `alter publication ... add table` has no IF NOT EXISTS form, so guard it.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
