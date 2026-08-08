-- ============================================================================
-- Narrows — marina "offer something else?" service suggestions
-- Run this in Supabase → SQL Editor, or `supabase db query --linked -f`.
-- Safe to re-run (IF NOT EXISTS / drops before create).
--
-- The portal's Services page (marina/services.html) only lets a marina turn
-- on/off the fixed set of listing_types the app already knows how to book
-- (slip, day_slip, mooring, storage, haul_out, winterization, rental, fuel).
-- This table is the "we don't do that yet, but here's what we'd want" free-
-- text channel underneath it. There is deliberately NO admin review UI here
-- -- David reviews new rows via the Supabase table editor and, if approved,
-- follows the existing manual path of adding a marina_listings row, same as
-- every other manual-approval step in this app (marina applications, etc).
-- ============================================================================

create table if not exists public.service_suggestions (
  id                uuid primary key default gen_random_uuid(),
  marina_id         uuid not null references public.marinas(id) on delete cascade,
  suggested_service text not null check (char_length(suggested_service) between 1 and 500),
  notes             text check (notes is null or char_length(notes) <= 2000),
  status            text not null default 'pending' check (status in ('pending', 'reviewed', 'added', 'declined')),
  created_at        timestamptz not null default now()
);

create index if not exists service_suggestions_marina_idx
  on public.service_suggestions (marina_id, created_at desc);

alter table public.service_suggestions enable row level security;

-- A marina can see and submit its own suggestions only. No update/delete
-- policy -- status is David's to change (service_role bypasses RLS), and a
-- marina shouldn't be able to quietly retract or edit what it asked for.
drop policy if exists "service_suggestions_select_own" on public.service_suggestions;
create policy "service_suggestions_select_own" on public.service_suggestions
  for select using (marina_id in (select id from public.marinas where profile_id = auth.uid()));

drop policy if exists "service_suggestions_insert_own" on public.service_suggestions;
create policy "service_suggestions_insert_own" on public.service_suggestions
  for insert with check (marina_id in (select id from public.marinas where profile_id = auth.uid()));

-- GRANT TRAP (see HANDOFF.md "Gotchas"): RLS alone is not enough -- without
-- this, every read/write 403s with "permission denied for table
-- service_suggestions" regardless of policy correctness.
grant select, insert on table public.service_suggestions to authenticated;
revoke all on table public.service_suggestions from anon;
revoke update, delete on table public.service_suggestions from authenticated;
