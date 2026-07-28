-- ============================================================================
-- Narrows — security checklist hardening
-- Run in Supabase → SQL Editor. Safe to re-run (IF NOT EXISTS / drops first).
--
-- Covers, from the launch checklist:
--   #1  RLS audit query (verify no table is left open)
--   #4  rate limiting extended to the remaining write endpoints
--   #7  indexes on the most common query paths (feed, comments, likes, notifs)
--   #8  client_errors table (the app writes crashes here; a webhook alerts you)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- #1 — RLS AUDIT (read-only). Run this SELECT and eyeball the result.
--     Any public table with rls_enabled = false is readable/writable by anyone
--     holding the publishable key — fix it with:  alter table <t> enable row level security;
--     Also flag any policy whose USING clause is just `true` (effectively public).
-- ----------------------------------------------------------------------------
select
  c.relname            as table_name,
  c.relrowsecurity     as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relrowsecurity asc, c.relname;   -- unprotected tables float to the top

-- List policies that are effectively "public" (USING true) so you can review them:
select schemaname, tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and qual = 'true'
order by tablename;


-- ----------------------------------------------------------------------------
-- #4 — RATE LIMITING on the remaining write endpoints.
--     enforce_rate_limit() (posts/comments/catch_pins) already exists in
--     rate_limits.sql and keys off new.user_id. These add the endpoints that
--     were missing. Auth endpoints are rate-limited by Supabase already.
-- ----------------------------------------------------------------------------

-- winterization_requests: a booking. 1 per 30s per user is plenty.
drop trigger if exists winterization_requests_rate_limit on public.winterization_requests;
create trigger winterization_requests_rate_limit
  before insert on public.winterization_requests
  for each row execute function public.enforce_rate_limit('30');

-- reports use `reporter_id`, not `user_id`, so the generic function (which reads
-- new.user_id) doesn't fit — this dedicated version keys off reporter_id.
create or replace function public.enforce_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
  from public.reports
  where reporter_id = new.reporter_id
    and created_at > now() - make_interval(secs => 5);

  if recent_count >= 1 then
    raise exception 'Please wait a few seconds before reporting again.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists reports_rate_limit on public.reports;
create trigger reports_rate_limit
  before insert on public.reports
  for each row execute function public.enforce_report_rate_limit();

-- NOTE: likes are intentionally NOT rate-limited (like/unlike is a fast toggle;
-- a limit would break normal use). marina_applications has UNIQUE(user_id) so a
-- user can only ever create one — no rate limit needed.


-- ----------------------------------------------------------------------------
-- #7 — INDEXES for the most common queries. Owner-column indexes already exist
--     in security_setup.sql / winterization; these cover the hot read paths.
-- ----------------------------------------------------------------------------

-- Feed: posts.select('*').order('created_at', desc)
create index if not exists posts_created_at_idx on public.posts (created_at desc);

-- Comments: comments.eq('post_id', ...).order('created_at') — composite covers both
create index if not exists comments_post_id_created_idx on public.comments (post_id, created_at);

-- Likes: likes.select('post_id, user_id') + eq('post_id',...).eq('user_id',...)
create index if not exists likes_post_id_idx on public.likes (post_id);

-- Notifications: eq('recipient_id',...).order('created_at', desc)
create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);

-- Catch pins map/list: order('created_at', desc)
create index if not exists catch_pins_created_at_idx on public.catch_pins (created_at desc);


-- ----------------------------------------------------------------------------
-- #8 — CLIENT_ERRORS: the app writes unexpected crashes here (lib/logError.ts).
--     Insert-only for clients; you read it in the dashboard. Wire a Database
--     Webhook (Database → Webhooks) on INSERT to email/Slack you = "alert me
--     if something breaks". See setup steps in the checklist summary.
-- ----------------------------------------------------------------------------
create table if not exists public.client_errors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete set null,
  source      text,
  message     text not null,
  stack       text,
  platform    text,
  app_version text,
  extra       jsonb,
  created_at  timestamptz not null default now()
);

alter table public.client_errors enable row level security;

-- clients may INSERT their own error reports (a crash can happen before auth,
-- so allow both anon and authenticated), but NOT read anyone's — only you, via
-- the dashboard / service role, can read them.
grant insert on table public.client_errors to anon, authenticated;

drop policy if exists "anyone can log an error" on public.client_errors;
create policy "anyone can log an error" on public.client_errors
  for insert to anon, authenticated
  with check (true);

-- (no SELECT policy on purpose — reads are service-role/dashboard only)

create index if not exists client_errors_created_idx on public.client_errors (created_at desc);

-- Rate-limit error logging so a crash loop can't flood the table (keyed on
-- user_id when present; anonymous crashes fall through — acceptable, they're rare).
create or replace function public.enforce_client_error_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  if new.user_id is null then
    return new;   -- can't cheaply bucket anon; let it through
  end if;
  select count(*) into recent_count
  from public.client_errors
  where user_id = new.user_id
    and created_at > now() - make_interval(secs => 3);
  if recent_count >= 5 then
    return null;  -- silently drop excess (do NOT raise — logging must never fail)
  end if;
  return new;
end;
$$;

drop trigger if exists client_errors_rate_limit on public.client_errors;
create trigger client_errors_rate_limit
  before insert on public.client_errors
  for each row execute function public.enforce_client_error_rate_limit();
