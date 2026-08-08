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
// Requires two secrets (Stripe's newer "event destinations" UI scopes a
// destination to EITHER "Your account" OR "Connected accounts", not both, so
// this needs two destinations pointing at the same URL, each with its own
// signing secret):
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...          (Your account)
//   supabase secrets set STRIPE_WEBHOOK_SECRET_CONNECT=whsec_...  (Connected accounts)
// (STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are already set
// from the other two Stripe functions.)
//
// Stripe Dashboard setup (one-time, David), two destinations, same URL:
//   URL for both: https://pddfyikqpuuuzgqhwjgu.supabase.co/functions/v1/stripe-webhook
//   1) Scope "Your account" -> event payment_intent.succeeded (this is the
//      one that flips a booking to 'paid' -- PaymentIntents are created on
//      the platform account via transfer_data.destination, so this event
//      fires on "Your account", not "Connected accounts").
//   2) Scope "Connected accounts" -> event account.updated (resyncs
//      stripe_charges_enabled -- a secondary safety net; create-connected-account
//      already resyncs this on every call, so this destination is optional
//      but adds a second layer of protection if that call is ever skipped).
//   Each destination shows its own "Signing secret" after creation -- copy
//   destination 1's into STRIPE_WEBHOOK_SECRET and destination 2's into
//   STRIPE_WEBHOOK_SECRET_CONNECT above.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17.7.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
// Optional: only set once the "Connected accounts" destination exists.
const webhookSecretConnect = Deno.env.get('STRIPE_WEBHOOK_SECRET_CONNECT');

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

  // Two destinations (see header comment) mean two possible signing secrets
  // for the same URL -- try the primary one first, then the Connect one
  // (if configured) before rejecting the request.
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (primaryErr) {
    if (!webhookSecretConnect) {
      return jsonResponse({ error: `Signature verification failed: ${(primaryErr as Error).message}` }, 400);
    }
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecretConnect);
    } catch (connectErr) {
      return jsonResponse({ error: `Signature verification failed: ${(connectErr as Error).message}` }, 400);
    }
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
      // PaymentIntent, or one that belongs to a merch order instead — see
      // below) — acknowledge so Stripe doesn't retry forever. Only
      // 'approved' -> 'paid' exists today (create-payment-intent gates on
      // it); a duplicate delivery for an already-'paid' booking is a no-op
      // rather than re-stamping it.
      if (booking && booking.status === 'approved') {
        const { error: updateError } = await admin
          .from('bookings')
          .update({ status: 'paid', amount_paid_cents: paymentIntent.amount_received })
          .eq('id', booking.id);
        if (updateError) {
          return jsonResponse({ error: updateError.message }, 500);
        }
        break;
      }

      // Same PaymentIntent id space, different table — a merch order's
      // create-merch-payment-intent stamps payment_intent_id onto
      // merch_orders instead of bookings, so check there too before giving
      // up. Also decrements stock_quantity (guarded so it can't go negative
      // even under a race — scarcity enforced at the DB layer, same
      // philosophy as bookings' overlap exclusion constraint).
      const { data: order, error: orderFindError } = await admin
        .from('merch_orders')
        .select('id, product_id, quantity, status')
        .eq('payment_intent_id', paymentIntent.id)
        .maybeSingle();

      if (orderFindError) {
        return jsonResponse({ error: orderFindError.message }, 500);
      }

      if (order && order.status === 'pending_payment') {
        const { error: updateOrderError } = await admin
          .from('merch_orders')
          .update({ status: 'paid', amount_paid_cents: paymentIntent.amount_received })
          .eq('id', order.id);
        if (updateOrderError) {
          return jsonResponse({ error: updateOrderError.message }, 500);
        }

        const { error: stockError } = await admin.rpc('decrement_merch_stock', {
          p_product_id: order.product_id,
          p_quantity: order.quantity,
        });
        if (stockError) {
          return jsonResponse({ error: stockError.message }, 500);
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
