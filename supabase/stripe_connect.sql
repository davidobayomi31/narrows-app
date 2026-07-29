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

-- `marinas` is publicly readable (MarinaProfileScreen does `select('*')` for
-- any boater viewing a profile) — these two columns are Stripe account
-- internals, not profile content, so pull them out of that blanket grant.
-- Only the service-role client (which the Edge Functions use) can still read
-- them; no app code reads these columns today, so nothing else changes.
revoke select (stripe_account_id, stripe_charges_enabled) on public.marinas from anon, authenticated;
