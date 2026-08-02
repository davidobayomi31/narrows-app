-- ============================================================================
-- Narrows — expanded booking types (Phase A0)
-- Run via `supabase db query --linked -f`, or Supabase → SQL Editor.
-- Safe to re-run (IF NOT EXISTS / drops before create).
--
-- WHY THIS EXISTS
-- Winterization was the only booking type. This adds the schema groundwork
-- for five more: seasonal slip, day slip (transient dockage), watercraft
-- rental, land/covered storage, haul-out. All additive — nothing here breaks
-- the existing winterization flow.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Widen marina_listings.listing_type to the two new types.
--    (slip/mooring/winterization/rental/fuel/storage already existed.)
-- ----------------------------------------------------------------------------
alter table public.marina_listings drop constraint if exists marina_listings_type_check;
alter table public.marina_listings
  add constraint marina_listings_type_check
  check (listing_type in
    ('slip', 'day_slip', 'mooring', 'winterization', 'rental', 'fuel', 'storage', 'haul_out'));


-- ----------------------------------------------------------------------------
-- 2. bookings.start_ts / end_ts — hourly timestamps, for Phase A4's instant-book
--    watercraft rentals (a seadoo is booked 1pm-3pm, not by the day). Kept
--    alongside the existing start_date/end_date, not replacing them — slip/
--    storage/winterization bookings keep using dates; only rentals will use
--    these once A4 lands. A booking uses ONE pair or the other, never both.
-- ----------------------------------------------------------------------------
alter table public.bookings add column if not exists start_ts timestamptz;
alter table public.bookings add column if not exists end_ts   timestamptz;

alter table public.bookings drop constraint if exists bookings_ts_order;
alter table public.bookings
  add constraint bookings_ts_order
  check (end_ts is null or start_ts is null or end_ts > start_ts);

-- Second double-booking guard, parallel to the existing date-range one —
-- applies only to rows that actually use start_ts/end_ts (the WHERE clause
-- means date-based bookings simply don't participate in this constraint, and
-- vice versa for the existing daterange constraint).
alter table public.bookings drop constraint if exists bookings_no_overlap_ts;
alter table public.bookings
  add constraint bookings_no_overlap_ts
  exclude using gist (
    listing_id with =,
    tstzrange(start_ts, end_ts, '[)') with &&
  )
  where (exclusive and status in ('approved', 'paid', 'completed')
         and start_ts is not null and end_ts is not null);


-- ----------------------------------------------------------------------------
-- 3. marina_applications.services — the signup service picker (Phase A2).
--    `other_service` catches anything not in the fixed list (reaches David,
--    not auto-bookable) so a marina isn't blocked from applying over a
--    service we haven't built a wizard for yet.
-- ----------------------------------------------------------------------------
alter table public.marina_applications add column if not exists services text[] not null default '{}';
alter table public.marina_applications add column if not exists other_service text;

alter table public.marina_applications drop constraint if exists marina_applications_services_check;
alter table public.marina_applications
  add constraint marina_applications_services_check
  check (services <@ array['slip', 'day_slip', 'winterization', 'rental', 'storage', 'haul_out']);


-- ----------------------------------------------------------------------------
-- 4. booking-documents storage bucket — PRIVATE. Insurance certificates and
--    driver's license photos live here, never in a public bucket like
--    post-images. Path convention: {user_id}/{booking_id}/{filename}.
--    Only the uploading boater and that booking's marina can read a file;
--    nobody else, not even other authenticated users.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('booking-documents', 'booking-documents', false, 10485760) -- 10 MB
on conflict (id) do update set public = false, file_size_limit = 10485760;

drop policy if exists "boater uploads own booking documents" on storage.objects;
create policy "boater uploads own booking documents" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'booking-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "boater reads own booking documents" on storage.objects;
create policy "boater reads own booking documents" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'booking-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "boater deletes own booking documents" on storage.objects;
create policy "boater deletes own booking documents" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'booking-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- marina reads documents for bookings made against their own marina — path's
-- 2nd segment is the booking_id; joins to bookings/marinas to check ownership.
drop policy if exists "marina reads booking documents for their bookings" on storage.objects;
create policy "marina reads booking documents for their bookings" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'booking-documents'
    and exists (
      select 1 from public.bookings b
      join public.marinas m on m.id = b.marina_id
      where b.id::text = (storage.foldername(name))[2]
        and m.profile_id = (select auth.uid())
    )
  );
