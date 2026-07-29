// Narrows — create-payment-intent Edge Function
// Creates a Stripe PaymentIntent for a single booking, routed straight to the
// marina's connected account via transfer_data.destination (0% platform fee
// for now — see HANDOFF.md "Cost reality check"). Runs server-side so the
// Stripe secret key never ships in the app.
//
// Deploy:  supabase functions deploy create-payment-intent
// Requires a secret: supabase secrets set STRIPE_SECRET_KEY=sk_test_...
// (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are injected
// automatically.)
//
// Request body: { booking_id: string }
// Response:     { client_secret: string, payment_intent_id: string }

import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17.7.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization' }, 401);
  }

  let bookingId: string | undefined;
  try {
    ({ booking_id: bookingId } = await req.json());
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  if (!bookingId) {
    return jsonResponse({ error: 'booking_id is required' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  // 1) Identify the caller using THEIR token.
  const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse({ error: 'Invalid session' }, 401);
  }

  // 2) Load the booking through the CALLER's client — RLS already restricts
  //    `bookings` select to the boater's own rows, so this doubles as the
  //    ownership check without a manual user_id comparison.
  const { data: booking, error: bookingError } = await callerClient
    .from('bookings')
    .select('id, marina_id, status, quoted_cents, deposit_cents, currency, payment_intent_id')
    .eq('id', bookingId)
    .maybeSingle();

  if (bookingError) {
    return jsonResponse({ error: bookingError.message }, 500);
  }
  if (!booking) {
    return jsonResponse({ error: 'Booking not found' }, 404);
  }
  if (booking.status !== 'approved') {
    return jsonResponse({ error: 'This booking is not approved for payment yet' }, 409);
  }

  // ?? (not ||) — an explicit $0 deposit is a valid price, not "unset", and
  // must not fall through to charging the full quoted amount instead.
  const amountCents = booking.deposit_cents ?? booking.quoted_cents;
  if (!amountCents || amountCents <= 0) {
    return jsonResponse({ error: 'The marina has not set a price for this booking yet' }, 409);
  }

  // 3) Look up the marina's Stripe status via the service-role client — a
  //    boater's session has no reason to read another table's Stripe fields.
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: marina, error: marinaError } = await admin
    .from('marinas')
    .select('stripe_account_id, stripe_charges_enabled')
    .eq('id', booking.marina_id)
    .maybeSingle();

  if (marinaError) {
    return jsonResponse({ error: marinaError.message }, 500);
  }
  if (!marina?.stripe_account_id || !marina.stripe_charges_enabled) {
    return jsonResponse({ error: 'This marina has not finished payment setup yet' }, 409);
  }

  // 4) Re-entrancy guard: if a PaymentIntent already exists for this booking,
  //    Stripe still considers it usable, AND it was created for the same
  //    amount, hand back the same client secret instead of creating a second
  //    one (e.g. the app retried after a dropped response). If the marina
  //    re-approved the booking at a new price since, the cached PaymentIntent
  //    is for the old amount and must not be reused — fall through and mint
  //    a fresh one instead.
  if (booking.payment_intent_id) {
    let existing;
    try {
      existing = await stripe.paymentIntents.retrieve(booking.payment_intent_id);
    } catch (err) {
      return jsonResponse({ error: `Stripe: ${(err as Error).message}` }, 502);
    }
    if (existing.status !== 'canceled' && existing.amount === amountCents) {
      return jsonResponse({
        client_secret: existing.client_secret,
        payment_intent_id: existing.id,
      });
    }
  }

  let paymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: (booking.currency || 'CAD').toLowerCase(),
      transfer_data: { destination: marina.stripe_account_id },
      application_fee_amount: 0,
      metadata: { booking_id: booking.id, marina_id: booking.marina_id },
    });
  } catch (err) {
    return jsonResponse({ error: `Stripe: ${(err as Error).message}` }, 502);
  }

  const { error: updateError } = await admin
    .from('bookings')
    .update({ payment_intent_id: paymentIntent.id })
    .eq('id', booking.id);

  if (updateError) {
    return jsonResponse({ error: updateError.message }, 500);
  }

  return jsonResponse({
    client_secret: paymentIntent.client_secret,
    payment_intent_id: paymentIntent.id,
  });
});
