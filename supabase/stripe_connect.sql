-- ============================================================================
-- Narrows — Stripe Connect columns on `marinas`
-- Run this in Supabase → SQL Editor. Additive/idempotent — safe to re-run.
--
-- Adds the two columns the create-connected-account and create-payment-intent
-- Edge Functions need to track a marina's Stripe Express account:
--   stripe_account_id       — the Stripe connected account id (acct_...), set
--                             once by create-connected-account and reused
--                             after that instead of creating a new one.
--   stripe_charges_enabled  — mirrors Stripe's account.charges_enabled, so
--                             create-payment-intent can refuse to create a
--                             PaymentIntent for a marina that hasn't finished
--                             onboarding, without an extra Stripe API call.
-- ============================================================================

alter table public.marinas
  add column if not exists stripe_account_id text;

alter table public.marinas
  add column if not exists stripe_charges_enabled boolean not null default false;

-- THE GRANT TRAP (see HANDOFF.md "Gotchas"), service_role edition. Verified
-- against the live DB on 2026-07-29: service_role had only REFERENCES/TRIGGER/
-- TRUNCATE on `marinas` and NOTHING AT ALL on `bookings`/`marina_listings` —
-- marina_bookings.sql section 5 grants only to anon/authenticated. So the Edge
-- Functions' admin client failed with "permission denied for table marinas" on
-- its very first select; RLS was never even reached.
--
-- `bookings` matters just as much: create-payment-intent creates the Stripe
-- PaymentIntent BEFORE writing payment_intent_id back, so without UPDATE here
-- a payment attempt would leave a real PaymentIntent at Stripe with no record
-- of it in the database.
grant select, insert, update, delete on public.marinas         to service_role;
grant select, insert, update, delete on public.bookings        to service_role;
grant select, insert, update, delete on public.marina_listings to service_role;

-- NOTE — stripe_account_id and stripe_charges_enabled are currently readable by
-- any client, because `marinas` is publicly readable (MarinaProfileScreen does
-- `select('*')`). A column-level `revoke select (...) from anon, authenticated`
-- was tried here and removed: it's brittle against the blanket table grant
-- Supabase re-applies, and it silently broke normal marina reads. Low severity
-- for now (an `acct_...` id is an identifier, not a credential, and only
-- service_role can WRITE these columns). The real fix, when it matters, is to
-- move both columns to their own `marina_stripe_accounts` table with its own
-- RLS policy rather than fighting column-level grants on a public table.
