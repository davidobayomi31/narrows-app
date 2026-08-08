// Narrows — create-merch-payment-intent Edge Function
// Creates a Stripe PaymentIntent for a single merch order, routed straight to
// the marina's connected account via transfer_data.destination (0% platform
// fee, matching create-payment-intent's booking flow). Runs server-side so
// the Stripe secret key never ships in the app.
//
// Deploy:  supabase functions deploy create-merch-payment-intent
// (Reuses the same secrets as create-payment-intent — STRIPE_SECRET_KEY,
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.)
//
// Request body: { order_id: string }
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

  let orderId: string | undefined;
  try {
    ({ order_id: orderId } = await req.json());
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  if (!orderId) {
    return jsonResponse({ error: 'order_id is required' }, 400);
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

  // 2) Load the order through the CALLER's client — RLS already restricts
  //    `merch_orders` select to the buyer's own rows, so this doubles as the
  //    ownership check without a manual buyer_id comparison.
  const { data: order, error: orderError } = await callerClient
    .from('merch_orders')
    .select('id, marina_id, status, quantity, unit_price_cents, currency, payment_intent_id')
    .eq('id', orderId)
    .maybeSingle();

  if (orderError) {
    return jsonResponse({ error: orderError.message }, 500);
  }
  if (!order) {
    return jsonResponse({ error: 'Order not found' }, 404);
  }
  if (order.status !== 'pending_payment') {
    return jsonResponse({ error: 'This order is not awaiting payment' }, 409);
  }

  const amountCents = order.unit_price_cents * order.quantity;
  if (!amountCents || amountCents <= 0) {
    return jsonResponse({ error: 'Invalid order amount' }, 409);
  }

  // 3) Look up the marina's Stripe status via the service-role client.
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: marina, error: marinaError } = await admin
    .from('marinas')
    .select('stripe_account_id, stripe_charges_enabled')
    .eq('id', order.marina_id)
    .maybeSingle();

  if (marinaError) {
    return jsonResponse({ error: marinaError.message }, 500);
  }
  if (!marina?.stripe_account_id || !marina.stripe_charges_enabled) {
    return jsonResponse({ error: 'This marina has not finished payment setup yet' }, 409);
  }

  // 4) Re-entrancy guard — same reasoning as create-payment-intent.
  if (order.payment_intent_id) {
    let existing;
    try {
      existing = await stripe.paymentIntents.retrieve(order.payment_intent_id);
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
      currency: (order.currency || 'CAD').toLowerCase(),
      transfer_data: { destination: marina.stripe_account_id },
      application_fee_amount: 0,
      metadata: { merch_order_id: order.id, marina_id: order.marina_id },
    });
  } catch (err) {
    return jsonResponse({ error: `Stripe: ${(err as Error).message}` }, 502);
  }

  const { error: updateError } = await admin
    .from('merch_orders')
    .update({ payment_intent_id: paymentIntent.id })
    .eq('id', order.id);

  if (updateError) {
    return jsonResponse({ error: updateError.message }, 500);
  }

  return jsonResponse({
    client_secret: paymentIntent.client_secret,
    payment_intent_id: paymentIntent.id,
  });
});
