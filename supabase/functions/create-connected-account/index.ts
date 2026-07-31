// Narrows — create-connected-account Edge Function
// Called once by a marina owner to create (or resume) their Stripe Express
// connected account, and returns a fresh onboarding link. Runs server-side so
// the Stripe secret key never ships in the app.
//
// Deploy:  supabase functions deploy create-connected-account
// Requires a secret: supabase secrets set STRIPE_SECRET_KEY=sk_test_...
// (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are injected
// automatically.)

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

// Where Stripe sends the marina owner back to after (or if they abandon)
// onboarding. The website doesn't have a dedicated page for this yet — it
// needs one that just shows "onboarding complete" / "let's finish this up"
// and re-calls this function to get a fresh link if `refresh` is set.
const RETURN_URL = 'https://narrows.site/marina/stripe-onboarding?complete=1';
const REFRESH_URL = 'https://narrows.site/marina/stripe-onboarding?refresh=1';

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

  // 2) Find the marina this user owns. Only a marina owner can onboard.
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: marina, error: marinaError } = await admin
    .from('marinas')
    .select('id, name, stripe_account_id')
    .eq('profile_id', user.id)
    .maybeSingle();

  if (marinaError) {
    return jsonResponse({ error: marinaError.message }, 500);
  }
  if (!marina) {
    return jsonResponse({ error: 'No marina is linked to this account' }, 403);
  }

  // 3) Create the Express connected account if this marina doesn't have one
  //    yet; otherwise reuse it so we don't orphan a second account in Stripe.
  //    business_type is deliberately left unset — most Simcoe County marinas
  //    (like David himself, per HANDOFF.md) are sole proprietors, not
  //    registered companies, and Stripe's own onboarding flow asks the owner
  //    directly rather than us guessing wrong and demanding paperwork they
  //    don't have.
  let accountId = marina.stripe_account_id;

  if (!accountId) {
    let account;
    try {
      account = await stripe.accounts.create({
        type: 'express',
        country: 'CA',
        email: user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
    } catch (err) {
      return jsonResponse({ error: `Stripe: ${(err as Error).message}` }, 502);
    }
    accountId = account.id;

    const { error: updateError } = await admin
      .from('marinas')
      .update({ stripe_account_id: accountId })
      .eq('id', marina.id);

    if (updateError) {
      return jsonResponse({ error: updateError.message }, 500);
    }
  }

  // 4) Re-read the account from Stripe and cache charges_enabled locally.
  //    Stripe is the source of truth; marinas.stripe_charges_enabled is only a
  //    cache so create-payment-intent doesn't need a Stripe round-trip per
  //    booking. Syncing here means an owner who returns to finish onboarding
  //    updates their own status just by hitting this endpoint. The
  //    account.updated webhook (not built yet) is still what will keep this
  //    fresh when Stripe changes the status on its own, with no one calling us.
  let chargesEnabled = false;
  try {
    const account = await stripe.accounts.retrieve(accountId);
    chargesEnabled = account.charges_enabled;
  } catch (err) {
    return jsonResponse({ error: `Stripe: ${(err as Error).message}` }, 502);
  }

  const { error: syncError } = await admin
    .from('marinas')
    .update({ stripe_charges_enabled: chargesEnabled })
    .eq('id', marina.id);

  if (syncError) {
    return jsonResponse({ error: syncError.message }, 500);
  }

  // 5) Account Links are single-use and short-lived — always mint a fresh
  //    one rather than trying to cache it. Still returned even when onboarding
  //    is already complete: Stripe shows the account's own management view, so
  //    it doubles as an "update my payout details" link.
  let accountLink;
  try {
    accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: REFRESH_URL,
      return_url: RETURN_URL,
      type: 'account_onboarding',
    });
  } catch (err) {
    return jsonResponse({ error: `Stripe: ${(err as Error).message}` }, 502);
  }

  return jsonResponse({ url: accountLink.url, accountId, chargesEnabled });
});
