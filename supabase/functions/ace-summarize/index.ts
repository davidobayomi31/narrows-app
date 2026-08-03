// Narrows — ace-summarize Edge Function
// The ONE Claude API call in "Ace", the website's AI-assisted marina
// onboarding flow (marina/apply.html). Takes the applicant's structured
// answers from the scripted conversation and returns (a) a friendly 2-3
// sentence public profile summary and (b) amenity tags extracted from their
// free-text "anything else" answer — shown back to the applicant to edit
// before they submit, never written to a live marina unreviewed.
//
// No signed-in USER required — the applicant isn't signed up yet at this
// point in the flow (see marina_apply_drafts in supabase/ace_onboarding.sql
// for why). supabase-js still sends the anon key as the Authorization
// bearer when there's no session, and that's a real Supabase-signed JWT, so
// default gateway JWT verification passes without any extra deploy flag.
// Protected only by that + the input caps below (no user to scope this to).
//
// Deploy:  supabase functions deploy ace-summarize
// Requires a secret: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import Anthropic from 'npm:@anthropic-ai/sdk@0.68.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Caps on every field — this endpoint is unauthenticated, so these are the
// only thing standing between a malicious caller and an expensive prompt.
function clip(s: unknown, max: number): string {
  return typeof s === 'string' ? s.trim().slice(0, max) : '';
}
function clipArray(arr: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, maxItems).map((s) => clip(s, maxLen)).filter(Boolean);
}

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: "A friendly, 2-3 sentence public profile summary of the marina, written in third person for boaters browsing the Narrows app.",
    },
    suggested_amenities: {
      type: 'array',
      items: { type: 'string' },
      description: "Short amenity tags (e.g. 'Fuel Dock', 'Bait Shop') extracted ONLY from the applicant's free-text notes -- never invented, never repeating amenities already in their picked list.",
    },
  },
  required: ['summary', 'suggested_amenities'],
  additionalProperties: false,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const marinaName = clip(body.marina_name, 200);
  const location = clip(body.location, 300);
  const yearsInBusiness = Number.isFinite(body.years_in_business) ? Math.max(0, Math.min(200, body.years_in_business)) : null;
  const services = clipArray(body.services, 10, 40);
  const otherService = clip(body.other_service, 300);
  const amenities = clipArray(body.amenities, 20, 40);
  const extraNotes = clip(body.extra_notes, 2000);
  const numSlips = Number.isFinite(body.num_slips) ? Math.max(0, Math.min(10000, body.num_slips)) : null;

  if (!marinaName || !location) {
    return jsonResponse({ error: 'marina_name and location are required' }, 400);
  }

  const facts = {
    marina_name: marinaName,
    location,
    years_in_business: yearsInBusiness,
    services_offered: services,
    other_service_notes: otherService || null,
    amenities_already_picked: amenities,
    free_text_notes: extraNotes || null,
    num_slips_or_boats: numSlips,
  };

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1024,
      // Reformatting a few structured fields into a paragraph doesn't need
      // deep reasoning -- thinking is on by default on Opus 5 and bills as
      // output tokens ($25/1M, same rate as the response itself), so it's
      // pure cost with no quality benefit for a task this simple.
      thinking: { type: 'disabled' },
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: SUMMARY_SCHEMA },
      },
      system:
        "You are Ace, a friendly assistant that helps marina owners finish signing up for Narrows, a boating app for Simcoe County, Ontario. " +
        "Given an applicant's structured onboarding answers, write a short, warm, factual public profile summary — no marketing hype, no invented details, no claims not supported by the facts given. " +
        "Separately, extract amenity tags ONLY from free_text_notes if it clearly mentions something concrete (e.g. a fuel dock, a bait shop, free parking) that isn't already in amenities_already_picked. " +
        "If free_text_notes mentions nothing concrete, return an empty suggested_amenities array — never guess or pad it.",
      messages: [
        { role: 'user', content: JSON.stringify(facts) },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return jsonResponse({ error: 'Could not generate a summary for that input.' }, 422);
    }

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    if (!textBlock) {
      return jsonResponse({ error: 'No response from model' }, 502);
    }

    const parsed = JSON.parse(textBlock.text);
    return jsonResponse({
      summary: String(parsed.summary ?? '').trim(),
      suggested_amenities: Array.isArray(parsed.suggested_amenities)
        ? parsed.suggested_amenities.filter((a: unknown) => typeof a === 'string' && a.trim()).slice(0, 10)
        : [],
    });
  } catch (err) {
    console.error('ace-summarize failed', err);
    return jsonResponse({ error: 'Could not generate a summary right now — try again.' }, 502);
  }
});
