-- ============================================================================
-- Narrows — generalized marina listings + bookings
-- Run this in Supabase → SQL Editor. Safe to re-run (IF NOT EXISTS / drops).
--
-- WHY THIS EXISTS
-- `winterization_requests` only ever modelled one service. Slips, moorings,
-- rentals and winterization are all the same shape of problem: a marina offers
-- something, a boater requests it, the marina approves, money may change hands.
-- These two tables replace three future parallel systems with one pipeline:
--
--   marina_listings  = the thing a marina offers (one row per bookable unit)
--   bookings         = a boater's request/booking against one listing
--
-- MIGRATION NOTE: this is ADDITIVE. `winterization_requests` is left intact and
-- still works. Section 7 backfills its rows into `bookings` so nothing is lost.
-- Do not drop the old table until the app reads from `bookings` everywhere.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Extension needed for the no-double-booking constraint (section 4).
--    btree_gist lets one index mix `=` on a uuid with `&&` on a date range.
-- ----------------------------------------------------------------------------
create extension if not exists btree_gist;


-- ----------------------------------------------------------------------------
-- 1. marina_listings — what a marina offers.
--
--    ONE ROW = ONE BOOKABLE UNIT. Slip A12 is a row. Slip A13 is another row.
--    Three identical seadoos = three rows. This is what makes the overlap
--    constraint in section 4 work cleanly, and it's how Dockwa models slips too.
--
--    `exclusive` is the important flag:
--      true  (slip, mooring, rental) = only one booking may hold it at a time
--      false (winterization, fuel)   = a service; the marina can take many the
--                                      same week, so overlapping is fine
-- ----------------------------------------------------------------------------
create table if not exists public.marina_listings (
  id             uuid primary key default gen_random_uuid(),
  marina_id      uuid not null references public.marinas (id) on delete cascade,
  listing_type   text not null,          -- slip | mooring | winterization | rental | fuel | storage
  name           text not null,          -- "Slip A12", "Winterization — up to 24ft", "Seadoo GTI #2"
  description    text,
  exclusive      boolean not null default true,

  -- how a boater books this listing (set per listing, so each marina chooses):
  --   false = REQUEST flow: booking starts 'pending', the marina must approve
  --           before it holds the slip, then the boater pays. Owner screens who
  --           gets in. (Dockwa's "Inquiry Only" marinas.)
  --   true  = INSTANT flow: paying IS the reservation, first-to-pay wins, no
  --           approval step — the booking goes straight to 'paid'. The overlap
  --           guard (section 4) still makes first-to-pay atomic: if two boaters
  --           pay at once, the second update-to-'paid' fails and must be refunded.
  --           (Dockwa's "Online Booking" marinas.)
  -- Non-exclusive services (winterization, fuel) ignore this — nothing to race.
  instant_book   boolean not null default false,

  -- money is stored in CENTS as an integer, never dollars as a float.
  -- Stripe works in cents, and 0.1 + 0.2 != 0.3 in floating point — storing
  -- dollars as numeric/float is how booking systems end up a penny off.
  price_cents    integer,                -- base price; null = "contact for pricing"
  price_unit     text default 'night',   -- night | day | hour | flat | season
  deposit_cents  integer,                -- what the boater pays up front (null = full amount)
  currency       text not null default 'CAD',

  -- slip/rental physical limits, used to filter what a boater can book
  max_length_ft  numeric,
  max_beam_ft    numeric,
  max_draft_ft   numeric,
  power          text,                   -- "30A", "50A", null

  photos         text[] not null default '{}',
  active         boolean not null default true,   -- false = hidden from boaters, keeps history
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.marina_listings drop constraint if exists marina_listings_type_check;
alter table public.marina_listings
  add constraint marina_listings_type_check
  check (listing_type in ('slip', 'mooring', 'winterization', 'rental', 'fuel', 'storage'));

alter table public.marina_listings drop constraint if exists marina_listings_price_unit_check;
alter table public.marina_listings
  add constraint marina_listings_price_unit_check
  check (price_unit in ('night', 'day', 'hour', 'flat', 'season'));

-- prices can be null (contact for pricing) but never negative
alter table public.marina_listings drop constraint if exists marina_listings_price_positive;
alter table public.marina_listings
  add constraint marina_listings_price_positive
  check (price_cents is null or price_cents >= 0);


-- ----------------------------------------------------------------------------
-- 2. bookings — a boater's request against one listing.
--
--    DATE SEMANTICS: half-open, like a hotel. start_date = arrival,
--    end_date = departure, and the slip is FREE again on the departure day.
--    A boater arriving Jul 1 and leaving Jul 5 occupies Jul 1,2,3,4 — someone
--    else may arrive Jul 5. Same-day bookings are start = today, end = tomorrow.
--
--    marina_id is denormalized here (copied from the listing by the trigger in
--    section 3) purely so RLS policies and the marina dashboard don't have to
--    join through marina_listings on every single query.
-- ----------------------------------------------------------------------------
create table if not exists public.bookings (
  id                uuid primary key default gen_random_uuid(),
  listing_id        uuid not null references public.marina_listings (id) on delete cascade,
  marina_id         uuid not null references public.marinas (id) on delete cascade,
  user_id           uuid not null references auth.users (id) on delete cascade,

  status            text not null default 'pending',
  -- pending     = boater asked, marina hasn't answered (does NOT hold the slip)
  -- approved    = marina said yes; HOLDS the slip
  -- in_progress = the service itself has started (services only, e.g.
  --               winterization mid-job — a slip stay has no use for this,
  --               it just stays 'paid' until 'completed')
  -- paid        = deposit/payment captured; HOLDS the slip
  -- completed   = stay/service finished; HOLDS the slip (historical record)
  -- declined    = marina said no
  -- cancelled   = either side cancelled

  start_date        date,
  end_date          date,

  -- copied from the listing by the trigger — the client cannot set this itself,
  -- so a boater can't sneak a slip booking past the overlap constraint by
  -- claiming it's a non-exclusive service.
  exclusive         boolean not null default true,

  -- boat details captured at request time
  boat_type         text,
  boat_length_ft    numeric,
  boater_notes      text,

  -- fields that only apply to SOME listing types live here instead of getting
  -- their own column — e.g. winterization's `boat_location` ('at_marina' |
  -- 'needs_drop_off' | 'needs_tow'). Keeps the table from growing a new column
  -- every time a future booking type needs one custom field.
  details           jsonb not null default '{}',

  -- money, all in cents (see the note in section 1)
  quoted_cents      integer,             -- what the marina says it costs
  deposit_cents     integer,             -- what was asked up front
  amount_paid_cents integer not null default 0,
  currency          text not null default 'CAD',
  payment_intent_id text,                -- Stripe PaymentIntent id

  -- marina's side of the conversation
  marina_notes      text,
  responded_at      timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- The `details` column was added to this file after `bookings` had already
-- been created once — `create table if not exists` above is a no-op against
-- an existing table, so the column needs its own explicit ALTER to actually
-- land on a database that already has this table.
alter table public.bookings add column if not exists details jsonb not null default '{}';

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings
  add constraint bookings_status_check
  check (status in ('pending', 'approved', 'in_progress', 'paid', 'completed', 'declined', 'cancelled'));

-- departure must be after arrival
alter table public.bookings drop constraint if exists bookings_date_order;
alter table public.bookings
  add constraint bookings_date_order
  check (end_date is null or start_date is null or end_date > start_date);

-- anything exclusive (a slip, a mooring, a rental) must say when
alter table public.bookings drop constraint if exists bookings_exclusive_needs_dates;
alter table public.bookings
  add constraint bookings_exclusive_needs_dates
  check (not exclusive or (start_date is not null and end_date is not null));

alter table public.bookings drop constraint if exists bookings_amounts_positive;
alter table public.bookings
  add constraint bookings_amounts_positive
  check (
    (quoted_cents  is null or quoted_cents  >= 0) and
    (deposit_cents is null or deposit_cents >= 0) and
    amount_paid_cents >= 0
  );


-- ----------------------------------------------------------------------------
-- 3. Trigger: stamp marina_id + exclusive from the listing.
--    Runs BEFORE INSERT so the values are authoritative, not client-supplied.
-- ----------------------------------------------------------------------------
create or replace function public.set_booking_from_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
begin
  select marina_id, exclusive, active
    into l
    from public.marina_listings
   where id = new.listing_id;

  if l is null then
    raise exception 'Listing not found.' using errcode = 'foreign_key_violation';
  end if;

  if not l.active then
    raise exception 'That listing is no longer available.' using errcode = 'check_violation';
  end if;

  new.marina_id := l.marina_id;
  new.exclusive := l.exclusive;
  return new;
end;
$$;

drop trigger if exists bookings_set_from_listing on public.bookings;
create trigger bookings_set_from_listing
  before insert on public.bookings
  for each row execute function public.set_booking_from_listing();


-- keep updated_at honest on both tables
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists marina_listings_touch on public.marina_listings;
create trigger marina_listings_touch
  before update on public.marina_listings
  for each row execute function public.touch_updated_at();

drop trigger if exists bookings_touch on public.bookings;
create trigger bookings_touch
  before update on public.bookings
  for each row execute function public.touch_updated_at();


-- ----------------------------------------------------------------------------
-- 4. THE DOUBLE-BOOKING GUARD.
--
--    This is the single most important line in the file. It tells Postgres:
--    "for the same listing, two bookings whose date ranges overlap may not both
--    exist — as long as both are exclusive and both actually hold the slip."
--
--    daterange(start, end, '[)') = start included, end excluded (departure day
--    is free). `&&` means "overlaps". `with =` means "same listing_id".
--
--    Why a constraint and not a check in the app: if a boater in the app and the
--    owner on the website both act in the same instant, application-level checks
--    can BOTH pass before either writes. The database can't be fooled that way —
--    the second write fails, and that user sees "someone just booked that".
--
--    pending is deliberately excluded: several boaters may request the same slip,
--    and the marina picks one. Only approving/paying actually holds it.
-- ----------------------------------------------------------------------------
alter table public.bookings drop constraint if exists bookings_no_overlap;
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    listing_id with =,
    daterange(start_date, end_date, '[)') with &&
  )
  where (exclusive and status in ('approved', 'paid', 'completed'));


-- ----------------------------------------------------------------------------
-- 5. RLS + GRANTS
--    Reminder (the Supabase GRANT trap): RLS policies alone are not enough —
--    without the grants below, writes fail with "permission denied" even when
--    the policy is correct.
-- ----------------------------------------------------------------------------
alter table public.marina_listings enable row level security;
alter table public.bookings        enable row level security;

grant select on table public.marina_listings to anon, authenticated;
grant insert, update, delete on table public.marina_listings to authenticated;
grant select, insert, update on table public.bookings to authenticated;

-- --- marina_listings ---------------------------------------------------------

-- anyone may browse active listings (this is the boater-facing catalogue)
drop policy if exists "anyone views active listings" on public.marina_listings;
create policy "anyone views active listings" on public.marina_listings
  for select to anon, authenticated
  using (active);

-- a marina owner sees all of their own, including inactive ones
drop policy if exists "marina views own listings" on public.marina_listings;
create policy "marina views own listings" on public.marina_listings
  for select to authenticated
  using (marina_id in (select id from public.marinas where profile_id = (select auth.uid())));

drop policy if exists "marina creates own listings" on public.marina_listings;
create policy "marina creates own listings" on public.marina_listings
  for insert to authenticated
  with check (marina_id in (select id from public.marinas where profile_id = (select auth.uid())));

drop policy if exists "marina updates own listings" on public.marina_listings;
create policy "marina updates own listings" on public.marina_listings
  for update to authenticated
  using (marina_id in (select id from public.marinas where profile_id = (select auth.uid())))
  with check (marina_id in (select id from public.marinas where profile_id = (select auth.uid())));

drop policy if exists "marina deletes own listings" on public.marina_listings;
create policy "marina deletes own listings" on public.marina_listings
  for delete to authenticated
  using (marina_id in (select id from public.marinas where profile_id = (select auth.uid())));

-- --- bookings ----------------------------------------------------------------

drop policy if exists "boater creates own booking" on public.bookings;
create policy "boater creates own booking" on public.bookings
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "boater sees own bookings" on public.bookings;
create policy "boater sees own bookings" on public.bookings
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- a boater may cancel, but must not be able to approve themselves or edit money.
-- WITH CHECK re-tests the row AFTER the update: they must still own it, and the
-- resulting status may only be 'cancelled'.
drop policy if exists "boater cancels own booking" on public.bookings;
create policy "boater cancels own booking" on public.bookings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and status = 'cancelled');

drop policy if exists "marina sees own bookings" on public.bookings;
create policy "marina sees own bookings" on public.bookings
  for select to authenticated
  using (marina_id in (select id from public.marinas where profile_id = (select auth.uid())));

drop policy if exists "marina updates own bookings" on public.bookings;
create policy "marina updates own bookings" on public.bookings
  for update to authenticated
  using (marina_id in (select id from public.marinas where profile_id = (select auth.uid())))
  with check (marina_id in (select id from public.marinas where profile_id = (select auth.uid())));


-- ----------------------------------------------------------------------------
-- 6. Rate limit + indexes
-- ----------------------------------------------------------------------------

-- reuses the shared function from rate_limits.sql — 1 booking request per 15s
drop trigger if exists bookings_rate_limit on public.bookings;
create trigger bookings_rate_limit
  before insert on public.bookings
  for each row execute function public.enforce_rate_limit('15');

create index if not exists marina_listings_marina_idx
  on public.marina_listings (marina_id, listing_type) where active;

create index if not exists bookings_marina_status_idx
  on public.bookings (marina_id, status, start_date);

create index if not exists bookings_user_idx
  on public.bookings (user_id, created_at desc);

create index if not exists bookings_listing_dates_idx
  on public.bookings (listing_id, start_date, end_date);


-- ----------------------------------------------------------------------------
-- 7. Backfill existing winterization_requests into the new tables.
--
--    Creates one non-exclusive "Winterization" listing per marina that has
--    requests, then copies each request across. Idempotent: re-running will not
--    duplicate, because of the `not exists` guards.
--
--    The old table is NOT dropped. Both work until the app is fully migrated.
-- ----------------------------------------------------------------------------
insert into public.marina_listings (marina_id, listing_type, name, exclusive, price_unit)
select distinct w.marina_id, 'winterization', 'Winterization', false, 'flat'
  from public.winterization_requests w
 where not exists (
   select 1 from public.marina_listings l
    where l.marina_id = w.marina_id and l.listing_type = 'winterization'
 );

insert into public.bookings (
  id, listing_id, marina_id, user_id, status, exclusive,
  start_date, end_date, boat_type, boat_length_ft, boater_notes, details,
  quoted_cents, marina_notes, created_at
)
select
  w.id,
  l.id,
  w.marina_id,
  w.user_id,
  case w.status
    when 'requested'   then 'pending'
    when 'approved'    then 'approved'
    when 'scheduled'   then 'approved'
    when 'in_progress' then 'in_progress'
    when 'completed'   then 'completed'
    when 'declined'    then 'declined'
    else 'pending'
  end,
  false,                                    -- winterization is never exclusive
  coalesce(w.scheduled_date, w.preferred_date),
  null,
  w.boat_type,
  w.boat_length_ft,
  w.logistics_notes,
  jsonb_build_object('boat_location', w.boat_location),
  round(coalesce(w.marina_price, w.estimated_price) * 100)::integer,
  w.marina_notes,
  w.created_at
from public.winterization_requests w
join public.marina_listings l
  on l.marina_id = w.marina_id and l.listing_type = 'winterization'
where not exists (select 1 from public.bookings b where b.id = w.id);


-- ----------------------------------------------------------------------------
-- 8. Auto-create a "Winterization" listing whenever a marina is approved.
--
--    Without this, a newly-approved marina has winterization_enabled = true
--    (so boaters see the "Winterize My Boat" button) but no matching row in
--    marina_listings — nothing for a booking to attach to. Section 7's backfill
--    only covers marinas that already had a request under the old table; this
--    covers every future approval automatically, going forward.
-- ----------------------------------------------------------------------------
create or replace function public.ensure_winterization_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.winterization_enabled
     and (tg_op = 'INSERT' or coalesce(old.winterization_enabled, false) = false) then
    insert into public.marina_listings (marina_id, listing_type, name, exclusive, price_unit)
    select new.id, 'winterization', 'Winterization', false, 'flat'
    where not exists (
      select 1 from public.marina_listings
       where marina_id = new.id and listing_type = 'winterization'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists marinas_ensure_winterization_listing on public.marinas;
create trigger marinas_ensure_winterization_listing
  after insert or update of winterization_enabled on public.marinas
  for each row execute function public.ensure_winterization_listing();

-- catch up any marina that was approved before this trigger existed
insert into public.marina_listings (marina_id, listing_type, name, exclusive, price_unit)
select m.id, 'winterization', 'Winterization', false, 'flat'
  from public.marinas m
 where m.winterization_enabled
   and not exists (
     select 1 from public.marina_listings l
      where l.marina_id = m.id and l.listing_type = 'winterization'
   );
