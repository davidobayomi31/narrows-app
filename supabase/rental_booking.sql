-- ============================================================================
-- Narrows — watercraft rental instant-book engine (Phase A4)
-- Run via `supabase db query --linked -f`, or Supabase → SQL Editor.
-- Safe to re-run (drops before create).
--
-- HOW INSTANT-BOOK WORKS HERE
-- Unlike the request-based types (slip/day_slip/storage/haul_out), a rental
-- booking is inserted with status = 'approved' DIRECTLY, not 'pending' — no
-- marina review step exists. This is deliberate and is what makes it safe:
-- the double-booking exclusion constraint (bookings_no_overlap_ts, from
-- booking_expansion.sql) only fires for status in ('approved','paid',
-- 'completed'), so inserting straight to 'approved' means the DB rejects a
-- conflicting time slot at INSERT time, before any Stripe interaction has
-- happened — nobody's card is ever charged for a slot someone else just
-- took. The app catches the exclusion-violation error and tells the boater
-- to pick a different time.
--
-- THE HOLD-EXPIRY PROBLEM
-- Because the booking is 'approved' (and therefore blocking that time slot)
-- from the moment it's created — before payment — a boater who reserves a
-- slot and then abandons the app mid-payment would otherwise squat on that
-- inventory forever. hold_expires_at + expire_stale_rental_holds() below
-- fixes that: any unpaid 'approved' rental booking past its hold window gets
-- auto-cancelled the next time anyone opens the rental wizard for that
-- marina (lazy expiry — no cron/scheduled job needed).
-- ============================================================================

alter table public.bookings add column if not exists hold_expires_at timestamptz;

create or replace function public.expire_stale_rental_holds(p_marina_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bookings
     set status = 'cancelled'
   where marina_id = p_marina_id
     and status = 'approved'
     and payment_intent_id is null
     and hold_expires_at is not null
     and hold_expires_at < now();
end;
$$;

-- callable by any authenticated user (a boater sweeping stale holds before
-- checking availability) — SECURITY DEFINER lets it bypass RLS to cancel
-- OTHER people's abandoned holds, but it only ever touches rows matching the
-- narrow expired/unpaid/approved condition above, nothing else.
grant execute on function public.expire_stale_rental_holds(uuid) to authenticated;
