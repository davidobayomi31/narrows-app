-- ============================================================================
-- Narrows — let a marina owner edit their own marinas row (Phase B: web portal)
-- Run via `supabase db query --linked -f`, or Supabase → SQL Editor.
-- Safe to re-run (drops before create).
--
-- Every other "own X" table (marina_listings, bookings, messages) already has
-- an owner-scoped UPDATE policy; marinas never got one because nothing in
-- the app needed to edit a marina's own row before now — profile fields were
-- only ever set by David by hand. The web portal's Profile page needs this.
-- ============================================================================

drop policy if exists "marina updates own profile" on public.marinas;
create policy "marina updates own profile" on public.marinas
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));
