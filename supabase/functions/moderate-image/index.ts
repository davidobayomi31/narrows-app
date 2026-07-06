// Narrows — moderate-image Edge Function
// Runs a photo through Google Cloud Vision SafeSearch before a post is allowed
// to save, so nudity/gore never reaches the feed. Runs server-side so the
// Vision API key never ships in the app.
//
// Deploy: supabase functions deploy moderate-image
// Requires a secret: supabase secrets set GOOGLE_VISION_API_KEY=<key>

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// LIKELY/VERY_LIKELY block adult + violence outright; racy alone only blocks
// at VERY_LIKELY so normal boating/beach photos in swimwear aren't caught.
const BLOCK_AT: Record<string, string[]> = {
  adult: ['LIKELY', 'VERY_LIKELY'],
  violence: ['LIKELY', 'VERY_LIKELY'],
  racy: ['VERY_LIKELY'],
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // just confirms the caller is a real logged-in user — anyone signed in can
  // check a photo they're about to post, no ownership check needed here.
  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { imageUrl } = await req.json();
  if (!imageUrl) {
    return new Response(JSON.stringify({ error: 'imageUrl is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const visionRes = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${Deno.env.get('GOOGLE_VISION_API_KEY')}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { source: { imageUri: imageUrl } },
            features: [{ type: 'SAFE_SEARCH_DETECTION' }],
          },
        ],
      }),
    }
  );

  if (!visionRes.ok) {
    const text = await visionRes.text();
    return new Response(JSON.stringify({ error: `Vision API error: ${text}` }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const visionData = await visionRes.json();
  const safeSearch = visionData.responses?.[0]?.safeSearchAnnotation ?? {};

  const reasons = Object.entries(BLOCK_AT)
    .filter(([category, blockLevels]) => blockLevels.includes(safeSearch[category]))
    .map(([category]) => category);

  return new Response(JSON.stringify({ blocked: reasons.length > 0, reasons }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
