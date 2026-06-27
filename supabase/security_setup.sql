-- ============================================================================
-- Narrows — security setup for App Store UGC compliance (Guideline 1.2)
-- Run this in Supabase → SQL Editor. Safe to re-run (uses IF NOT EXISTS / drops).
-- Creates: reports table, blocked_users table, with RLS + grants.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. reports — users flag objectionable posts/comments. YOU review these.
-- ----------------------------------------------------------------------------
create table if not exists public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references auth.users (id) on delete cascade,
  content_type     text not null check (content_type in ('post', 'comment')),
  content_id       uuid not null,
  content_owner_id uuid,
  reason           text not null,
  details          text,
  status           text not null default 'open',   -- open | reviewed | actioned | dismissed
  created_at       timestamptz not null default now()
);

alter table public.reports enable row level security;

-- auto-expose is off in this project, so grants are required (see AGENTS notes)
grant select, insert on table public.reports to authenticated;

drop policy if exists "users can file reports" on public.reports;
create policy "users can file reports" on public.reports
  for insert to authenticated
  with check ((select auth.uid()) = reporter_id);

drop policy if exists "users can see own reports" on public.reports;
create policy "users can see own reports" on public.reports
  for select to authenticated
  using ((select auth.uid()) = reporter_id);

-- index for your admin review queries
create index if not exists reports_status_created_idx on public.reports (status, created_at desc);


-- ----------------------------------------------------------------------------
-- 2. blocked_users — a blocks b. Feeds hide content in BOTH directions.
-- ----------------------------------------------------------------------------
create table if not exists public.blocked_users (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

alter table public.blocked_users enable row level security;

grant select, insert, delete on table public.blocked_users to authenticated;

-- you can create/read/delete blocks where you are the blocker
drop policy if exists "manage own blocks" on public.blocked_users;
create policy "manage own blocks" on public.blocked_users
  for all to authenticated
  using ((select auth.uid()) = blocker_id)
  with check ((select auth.uid()) = blocker_id);

-- you can also READ rows where you are the blocked party, so the feed can
-- hide people who blocked you (mutual invisibility)
drop policy if exists "see blocks against me" on public.blocked_users;
create policy "see blocks against me" on public.blocked_users
  for select to authenticated
  using ((select auth.uid()) = blocked_id);

create index if not exists blocked_users_blocked_idx on public.blocked_users (blocked_id);


-- ----------------------------------------------------------------------------
-- 3. RLS performance — index the columns used in existing auth.uid() policies
--    (100x+ speedup at scale; harmless to run now). Adjust if a column differs.
-- ----------------------------------------------------------------------------
create index if not exists posts_user_id_idx        on public.posts (user_id);
create index if not exists comments_user_id_idx     on public.comments (user_id);
create index if not exists likes_user_id_idx        on public.likes (user_id);
create index if not exists catch_pins_user_id_idx   on public.catch_pins (user_id);
create index if not exists notifications_recipient_idx on public.notifications (recipient_id);
