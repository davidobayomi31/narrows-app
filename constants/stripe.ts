// Stripe configuration.
//
// The publishable key is safe to ship in the app — Stripe designed it to be
// public, it can only create tokens/PaymentIntents client-side, never move
// money or read account data on its own.
//
// The SECRET key is the opposite: it must never appear in this repo or in the
// app bundle. It lives only in Supabase → Edge Functions → Secrets
// (STRIPE_SECRET_KEY), where Edge Functions read it server-side.
export const STRIPE_PUBLISHABLE_KEY =
  'pk_test_51TyT8N1hulcHVmf8c9rFbEkthD0huKKHKJkx7L0kNv1Hj4odvjLlzuAVMyiymsbBVYHxOAI4XRw8LQFbWAU0oS8b00E9RhFUDC';
