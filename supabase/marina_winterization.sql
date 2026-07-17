-- ============================================================================
-- Narrows — account types (Boater / Marina Partner) + boat winterization
-- Run this in Supabase → SQL Editor. Safe to re-run (uses IF NOT EXISTS / drops).
--
-- Marina signup is NOT self-verifying: a new marina account submits a
-- marina_applications row (status 'pending') and gets a "pending approval"
-- screen. YOU review it manually, then in the Supabase table editor:
--   1. link (or create) the real row in `marinas` for them
--   2. set marinas.profile_id = their user id
--   3. set marinas.winterization_enabled = true
--   4. set marina_applications.status = 'approved' and marina_applications.marina_id
-- Only marinas with winterization_enabled = true show the "Winterize My Boat"
-- button to boaters — this is the gate against anyone falsely claiming a marina.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles.account_type — 'boater' (default, existing users) or 'marina'
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists account_type text not null default 'boater';

alter table public.profiles drop constraint if exists profiles_account_type_check;
alter table public.profiles
  add constraint profiles_account_type_check check (account_type in ('boater', 'marina'));


-- ----------------------------------------------------------------------------
-- 2. marinas — link to the owning profile + a winterization on/off switch.
--    (marinas.profile_id already existed for marina "own posts"; reused here.)
-- ----------------------------------------------------------------------------
alter table public.marinas
  add column if not exists winterization_enabled boolean not null default false;


-- ----------------------------------------------------------------------------
-- 3. marina_applications — pending marina signups, awaiting your manual review.
-- ----------------------------------------------------------------------------
create table if not exists public.marina_applications (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  marina_name        text not null,
  location           text not null,
  years_in_business  int,
  contact_phone      text,
  contact_email      text,
  offers_winterizing boolean,
  num_slips          int,
  status             text not null default 'pending', -- pending | approved | rejected
  marina_id          uuid references public.marinas (id), -- set by you on approval
  created_at         timestamptz not null default now(),
  unique (user_id)
);

-- additive columns for applications created before this update
alter table public.marina_applications add column if not exists contact_email text;
alter table public.marina_applications add column if not exists offers_winterizing boolean;
alter table public.marina_applications add column if not exists num_slips int;

alter table public.marina_applications drop constraint if exists marina_applications_status_check;
alter table public.marina_applications
  add constraint marina_applications_status_check check (status in ('pending', 'approved', 'rejected'));

alter table public.marina_applications enable row level security;

grant select, insert on table public.marina_applications to authenticated;

drop policy if exists "marina can submit own application" on public.marina_applications;
create policy "marina can submit own application" on public.marina_applications
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "marina can see own application" on public.marina_applications;
create policy "marina can see own application" on public.marina_applications
  for select to authenticated
  using ((select auth.uid()) = user_id);


-- ----------------------------------------------------------------------------
-- 4. winterization_requests — the actual booking, request → approve → track.
-- ----------------------------------------------------------------------------
create table if not exists public.winterization_requests (
  id               uuid primary key default gen_random_uuid(),
  marina_id        uuid not null references public.marinas (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  boat_type        text,
  boat_length_ft   numeric,
  boat_location    text not null, -- at_marina | needs_drop_off | needs_tow
  logistics_notes  text,
  preferred_date   date,
  estimated_price  numeric,
  status           text not null default 'requested', -- requested | approved | scheduled | in_progress | completed | declined
  marina_price     numeric,
  scheduled_date   date,
  marina_notes     text,
  created_at       timestamptz not null default now()
);

alter table public.winterization_requests drop constraint if exists winterization_requests_boat_location_check;
alter table public.winterization_requests
  add constraint winterization_requests_boat_location_check
  check (boat_location in ('at_marina', 'needs_drop_off', 'needs_tow'));

alter table public.winterization_requests drop constraint if exists winterization_requests_status_check;
alter table public.winterization_requests
  add constraint winterization_requests_status_check
  check (status in ('requested', 'approved', 'scheduled', 'in_progress', 'completed', 'declined'));

alter table public.winterization_requests enable row level security;

grant select, insert, update on table public.winterization_requests to authenticated;

-- boaters: create + view their own requests
drop policy if exists "boater creates own request" on public.winterization_requests;
create policy "boater creates own request" on public.winterization_requests
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "boater sees own requests" on public.winterization_requests;
create policy "boater sees own requests" on public.winterization_requests
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- marina owners: view + update requests made to THEIR marina
drop policy if exists "marina sees own requests" on public.winterization_requests;
create policy "marina sees own requests" on public.winterization_requests
  for select to authenticated
  using (
    marina_id in (select id from public.marinas where profile_id = (select auth.uid()))
  );

drop policy if exists "marina updates own requests" on public.winterization_requests;
create policy "marina updates own requests" on public.winterization_requests
  for update to authenticated
  using (
    marina_id in (select id from public.marinas where profile_id = (select auth.uid()))
  );

create index if not exists winterization_requests_marina_idx on public.winterization_requests (marina_id, status);
create index if not exists winterization_requests_user_idx   on public.winterization_requests (user_id);
