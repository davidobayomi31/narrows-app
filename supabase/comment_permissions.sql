-- Allow users to EDIT and DELETE their own comments.
-- The app now has edit/delete UI (long-press your own comment), but the database
-- will reject those operations unless these RLS policies + grants exist.
-- Run this once in the Supabase SQL editor. Safe to re-run (drops first).

alter table public.comments enable row level security;

-- edit own comment
drop policy if exists "comments_update_own" on public.comments;
create policy "comments_update_own" on public.comments
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- delete own comment
drop policy if exists "comments_delete_own" on public.comments;
create policy "comments_delete_own" on public.comments
  for delete
  using (auth.uid() = user_id);

-- table-level grants (Supabase's "permission denied" gotcha for new operations)
grant update, delete on table public.comments to authenticated;
