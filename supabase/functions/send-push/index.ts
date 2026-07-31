// Narrows — send-push Edge Function
// Sends an actual OS-level push notification via Expo's push API. The app
// already writes rows into `notifications` (an in-app feed) on new bookings,
// approvals, declines, and messages, but nothing was ever sending a push for
// them — this is that missing piece. Call it right after inserting a
// `notifications` row, from any authenticated client (boater or marina).
//
// Deploy:  supabase functions deploy send-push
// (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
//
// Request body: { recipient_id: string, title: string, body: string, data?: object }
// Response:     { sent: number }  -- number of device tokens actually pushed to
// (0 is not an error -- the recipient may just not have push registered.)

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

  // Any logged-in app user may trigger a push to someone else (that's the
  // whole point -- a marina notifying a boater, or vice versa). We only
  // require a valid session to exist, not that it matches recipient_id.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
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

  let recipientId: string | undefined;
  let title: string | undefined;
  let body: string | undefined;
  let data: Record<string, unknown> | undefined;
  try {
    ({ recipient_id: recipientId, title, body, data } = await req.json());
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  if (!recipientId || !title || !body) {
    return jsonResponse({ error: 'recipient_id, title, and body are required' }, 400);
  }

  // push_tokens' RLS only lets a user read their OWN tokens -- reading
  // someone else's requires the service-role client.
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: tokenRows, error: tokenError } = await admin
    .from('push_tokens')
    .select('token')
    .eq('user_id', recipientId);

  if (tokenError) {
    return jsonResponse({ error: tokenError.message }, 500);
  }
  if (!tokenRows || tokenRows.length === 0) {
    return jsonResponse({ sent: 0 }); // recipient has no device registered -- not an error
  }

  const messages = tokenRows.map((row) => ({
    to: row.token,
    title,
    body,
    data: data ?? {},
    sound: 'default',
  }));

  let sent = 0;
  const staleTokens: string[] = [];
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    const result = await res.json();
    const tickets = Array.isArray(result?.data) ? result.data : [];
    tickets.forEach((ticket: any, i: number) => {
      if (ticket.status === 'ok') {
        sent += 1;
      } else if (ticket.details?.error === 'DeviceNotRegistered') {
        staleTokens.push(messages[i].to);
      }
    });
  } catch (err) {
    return jsonResponse({ error: `Expo push API: ${(err as Error).message}` }, 502);
  }

  // Best-effort cleanup -- a token Expo reports as dead will never work
  // again, so stop storing it. Not worth failing the whole request over.
  if (staleTokens.length > 0) {
    await admin.from('push_tokens').delete().in('token', staleTokens);
  }

  return jsonResponse({ sent });
});
