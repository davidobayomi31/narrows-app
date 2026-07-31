// Narrows — stripe-webhook Edge Function
// Keeps our data in sync with what Stripe already knows, instead of relying
// on the app to call back in after something happens:
//   - payment_intent.succeeded -> flips the matching booking to 'paid'
//   - account.updated          -> resyncs stripe_charges_enabled for the
//                                 connected account that changed
// This is the only Edge Function that must NOT trust its caller — anyone can
// POST here, so everything hinges on Stripe's signature over the raw body.
//
// Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt
// Requires a secret: supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
// (STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are already set
// from the other two Stripe functions.)
//
// Stripe Dashboard setup (one-time, David):
//   Developers -> Webhooks -> Add endpoint
//   URL: https://pddfyikqpuuuzgqhwjgu.supabase.co/functions/v1/stripe-webhook
//   Listen to: "Your account and connected accounts" (so both event types
//   below reach this one endpoint with a single signing secret) -> select
//   payment_intent.succeeded and account.updated. Copy the "Signing secret"
//   shown after creating it into the STRIPE_WEBHOOK_SECRET command above.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17.7.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return jsonResponse({ error: 'Missing stripe-signature header' }, 400);
  }

  // MUST read the raw text — constructEventAsync verifies the signature over
  // these exact bytes, so parsing to JSON first (which re-serializes) breaks it.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    return jsonResponse({ error: `Signature verification failed: ${(err as Error).message}` }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      const { data: booking, error: findError } = await admin
        .from('bookings')
        .select('id, status')
        .eq('payment_intent_id', paymentIntent.id)
        .maybeSingle();

      if (findError) {
        return jsonResponse({ error: findError.message }, 500);
      }

      // No matching booking isn't necessarily a bug (could be a stray
      // PaymentIntent) — acknowledge so Stripe doesn't retry forever.
      // Only 'approved' -> 'paid' exists today (create-payment-intent gates
      // on it); a duplicate delivery for an already-'paid' booking is a
      // no-op rather than re-stamping it.
      if (booking && booking.status === 'approved') {
        const { error: updateError } = await admin
          .from('bookings')
          .update({ status: 'paid', amount_paid_cents: paymentIntent.amount_received })
          .eq('id', booking.id);
        if (updateError) {
          return jsonResponse({ error: updateError.message }, 500);
        }
      }
      break;
    }

    case 'account.updated': {
      const account = event.data.object as Stripe.Account;

      const { error: updateError } = await admin
        .from('marinas')
        .update({ stripe_charges_enabled: account.charges_enabled })
        .eq('stripe_account_id', account.id);

      if (updateError) {
        return jsonResponse({ error: updateError.message }, 500);
      }
      break;
    }

    default:
      // Every other event type is ignored on purpose — Stripe still expects
      // a 2xx or it keeps retrying.
      break;
  }

  return jsonResponse({ received: true });
});
