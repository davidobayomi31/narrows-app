# Narrows — Marina Booking Platform, Web Portal & Ace — Session Memory

> Covers Phase B (marina web portal), Phase C (Ace AI onboarding), an on-device QA pass
> that was paused mid-way, and Phase D (Services/Hours/Merchandise, below). Read this
> before touching any of `marina/` (in the **narrows-landing** repo) or the booking/marina
> screens in narrows-app.
>
> Last updated: 2026-08-08 (Phase D: Services + Hours + Merchandise + portal profile
> completeness — code written, NOT yet deployed, see below). Two repos involved:
> `narrows-app` (this one) and `narrows-landing` at
> `/Users/davidobayomi/Desktop/Narrows/narrows-landing` — **a separate git repo**, not a
> subfolder of this one. Don't confuse the two when running git commands.

## ⚠️ Phase D — code written this session, NOT deployed yet

Full plan at the time: `/Users/davidobayomi/.claude/plans/eager-mixing-pond.md`. Everything
below is written and typechecks clean (`npx tsc --noEmit -p .` in narrows-app), but **none
of it is live** — no SQL has been run against the real Supabase project, no new Edge
Function has been deployed, and no portal page has been clicked through in a real browser.

**SQL to run, in this order** (Supabase → SQL Editor, or `supabase db query --linked -f`):
1. `supabase/marina_hours.sql` — adds `marinas.hours` jsonb.
2. `supabase/service_suggestions.sql` — new table, RLS, grants.
3. `supabase/marina_photos_bucket.sql` — new public bucket `marina-photos` + RLS.
4. `supabase/merchandise.sql` — `merch_products`/`merch_orders` tables, the
   `set_merch_order_from_product()` stamping trigger, the `decrement_merch_stock()` RPC,
   RLS, grants (including the service_role grant — this table class has bitten this
   project on that exact gotcha twice already, see stripe_connect.sql).
5. `supabase/merch_photos_bucket.sql` — new public bucket `merch-photos` + RLS.

**Edge Function to deploy:** `supabase functions deploy create-merch-payment-intent` — new
function, mirrors `create-payment-intent` exactly (same secrets already set:
`STRIPE_SECRET_KEY` etc., nothing new to configure).

**Edge Function to redeploy** (existing function, code changed):
`supabase functions deploy stripe-webhook` — its `payment_intent.succeeded` handler now
also checks `merch_orders` (not just `bookings`) by `payment_intent_id`. **No new Stripe
webhook destination needed** — same URL, same event, already subscribed.

**What shipped (code, pending the above deploy):**
- **Hours of operation** — `marinas.hours` jsonb (`{mon: {open,close,closed}, ...}`, null =
  not set = no constraint). Portal: new `marina/hours.html`. App: `RentalBookingModal.tsx`
  hard-filters its start-hour chips to the picked date's window (closed day → no chips +
  message); `BookingRequestModal.tsx`'s day-slip arrival/departure spinner gets a soft hint
  + a non-blocking "outside hours, send anyway?" warning (native time-spinner can't be
  cleanly bounded cross-platform, so this is a deliberate soft constraint, not a bug).
  `MarinaProfileScreen.tsx` shows today's hours. Shared helpers: `lib/marinaHours.ts`.
- **Services catalog** — portal: new `marina/services.html`, an on/off toggle grid for the
  8 fixed listing_types (turning one on inserts/reactivates a `marina_listings` row with
  sensible defaults; the boater-facing `MarinaServicesScreen.tsx` already read purely from
  active `marina_listings` rows, so this needed no app-side change) plus an "offer
  something else?" free-text box that inserts into the new `service_suggestions` table.
  **No admin review UI was built on purpose** — matches this project's existing convention
  (marina applications are already reviewed by David via direct table access, not a UI);
  review new suggestion rows via the Supabase table editor.
- **Portal profile completeness** — `marina/profile.html` gained a Bio textarea
  (`marinas.description`, previously only ever set once by Ace's onboarding summary, now
  marina-editable going forward) and a photo uploader (`marina-photos` bucket →
  `marinas.image_url`, which `MarinaProfileScreen.tsx`/`Homepage.tsx` already render but
  nothing previously wrote to).
- **Merchandise** — pickup-or-ship physical goods, buy-now (no cart), reusing the exact
  Stripe Connect destination-charge pattern proven by rentals (0% platform fee, same as
  bookings today). New tables `merch_products`/`merch_orders` (deliberately NOT folded into
  `bookings`/`marina_listings` — those model a date/time-exclusive bookable unit with no
  quantity concept). Portal: new `marina/merchandise.html` (Products tab: add/edit/photo
  upload to `merch-photos`; Orders tab: filter by status, "Mark shipped"
  optional-tracking-number / "Mark fulfilled" actions). App: new "Shop" section on
  `MarinaProfileScreen.tsx` (only shown if the marina has ≥1 active product, hidden for the
  marina's own account) → `screens/components/MerchPurchaseModal.tsx` (quantity stepper
  capped at stock, shipping address + Nominatim verification only when
  `fulfillment_type='ship'`, then the same `initPaymentSheet`/`presentPaymentSheet` flow
  `RentalBookingModal.tsx` uses). Stock decrements only on confirmed payment (webhook-
  driven, race-safe guarded UPDATE via `decrement_merch_stock()`), never on order creation
  — unlike a rental hold, there's no exclusive resource to squat on, so an abandoned
  unpaid order just sits at `pending_payment` with nothing to expire/sweep.

**What's genuinely NOT done — pick up here:**
- None of the 5 SQL files have been run against the live project.
- `create-merch-payment-intent` hasn't been deployed; `stripe-webhook`'s updated code
  hasn't been redeployed.
- No portal page (hours/services/merchandise, or the profile.html additions) has been
  clicked through in a real browser — same Claude-in-Chrome/localhost limitation noted
  below in the existing QA section.
- No end-to-end Stripe test-mode payment has been run for a merch order.
- Two small pre-existing inconsistencies noticed but deliberately left alone (out of
  scope for this pass): `MarinaOnboardingScreen.tsx`'s service chip list is missing
  `mooring`/`fuel` (present in `listings.html`'s and the new `services.html`'s full
  8-type list), and `marinas.water_alert` was deliberately not exposed in the portal —
  looks admin/safety-only, left alone without confirming that assumption with David.

## ✅ Ace is fully live — confirmed working end-to-end

`ANTHROPIC_API_KEY` is set on the Supabase project and **`ace-summarize` was tested directly
via curl and returned a real, correct summary** — not just "the secret exists," an actual
successful Claude API round trip:

```
curl -X POST "https://pddfyikqpuuuzgqhwjgu.supabase.co/functions/v1/ace-summarize" \
  -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>" \
  -d '{"marina_name":"Blue Beacon Marina","location":"693 Atherley Road, Orillia, ON L3V 1P4", ...}'
→ 200 {"summary":"Blue Beacon Marina is a family-run marina on Atherley Road in Orillia...",
       "suggested_amenities":["Bait Shop","Free Parking"]}
```

It correctly pulled "Bait Shop" and "Free Parking" out of free-text notes as *suggested*
amenities (not auto-added to the picked list) — exactly the intended behavior.

**Two real problems hit and fixed while getting here, worth knowing about:**
1. The first `supabase secrets set ANTHROPIC_API_KEY=...` David ran resulted in a `401
   invalid x-api-key` — the pasted value was bad somehow (extra whitespace/quote, dropped
   character — never root-caused precisely, just re-copied and re-ran the command and it
   fixed itself). **If this key ever needs to be rotated, re-set, and the app suddenly gets
   401s from Anthropic, redo `supabase secrets set` carefully — paste with no surrounding
   quotes.**
2. After the key started authenticating, the next error was `400 "Your credit balance is
   too low"` — David had clicked "Skip for now" on the credit-purchase screen when first
   creating the key, so Evaluation access alone wasn't enough for real API calls. Fixed by
   buying US$5 of credits on platform.claude.com (Anthropic Console) → Billing. **The
   console's billing modal itself was buggy** — "Buy credits" stayed inert/unclickable for
   several attempts even with a seemingly-complete form; a mismatched "Postal code" vs
   "Confirm postal code" was one real cause, but even after fixing that it still didn't work
   until reloading the page and redoing the form fresh in one pass. If this ever needs
   redoing (e.g. credits run low and need topping up), expect that same flakiness and try a
   full page reload if the buy button won't respond.

Temporary debug logging that was added to `ace-summarize/index.ts` to diagnose the above
(`debug`/`stack` fields on the error response) has been **reverted and redeployed** — the
function is back to its clean, production error-handling state. Nothing left uncommitted
from this.

**Only remaining loose end from Phase C:** none functionally — Ace is done. The web portal
itself (`marina/apply.html` end-to-end through a real magic-link email) still hasn't been
clicked through in an actual browser by anyone (see the QA section below) — the
`ace-summarize` function itself is proven, but the full apply→email→confirm human flow
around it isn't yet.

---

## What shipped this session

### Phase B — Marina web portal (`narrows-landing/marina/`)
Plain static HTML + vanilla JS + the Supabase JS client via `esm.sh` CDN import — **no
build step, no framework**, matching the rest of the marketing site. Talks to the exact
same Supabase project as the app (same RLS policies apply unchanged to a magic-link web
session — no special-casing needed).

- `marina/assets/portal.js` — shared Supabase client, `requireMarinaSession()` (auth guard +
  pending-approval state), `renderNav()`, formatters.
- `marina/assets/portal.css` — shared dark/gold theme matching the marketing site.
- `marina/login.html` — magic-link email sign-in. **`shouldCreateUser: false`** — only
  existing accounts can sign in here (prevents silently creating throwaway accounts that
  never went through onboarding).
- `marina/dashboard.html` — stats (pending requests, month revenue, total bookings,
  occupancy), Stripe-connect banner, recent requests.
- `marina/requests.html` — full bookings inbox: filter tabs, per-type detail rendering
  (every `details` JSON key across all 6 booking types), approve/decline/advance-status,
  private-bucket document viewer (insurance certs, licenses) via signed URL.
- `marina/messages.html` — DM thread list + realtime conversation view.
- `marina/listings.html` — the first-ever self-serve price/listing editor (previously
  SQL-only). Add/edit price, price_unit, description, active toggle.
- `marina/profile.html` — edit marina name/lake/address (Nominatim-verified)/phone/amenities
  + Stripe Connect status/connect button.
- `marina/index.html` — redirects to dashboard or login based on session.
- `marina/stripe-onboarding.html` — Stripe Connect return URL, now channel-neutral (works
  whether the marina connected from the app or the web portal).
- Website nav: `index.html` now has a "For Marinas" link → `/marina/`.
- New SQL: `supabase/marina_profile_edit.sql` — added the missing owner-UPDATE RLS policy
  on `marinas` (never existed before; only a public SELECT policy did).

### Phase C — "Ace" AI-assisted marina onboarding (`narrows-landing/marina/apply*.html`)
A **scripted** conversational wizard (no LLM per-question) that ends with **one** Claude API
call to write a profile summary + suggest amenity tags from free text.

- `marina/apply.html` — the chat-style wizard: name → marina name → address (verified) →
  years → services (chips, same copy as the app's onboarding) → amenities (chips) → free
  notes → slip count → phone → **Ace generates a summary** (editable) → email.
- `marina/apply-confirm.html` — where the magic link lands. Claims a staged draft, creates
  `profiles` + `marina_applications`, handles "already applied" (23505) gracefully.
- `supabase/functions/ace-summarize/index.ts` — the one Claude API call. **Model:
  `claude-opus-5`, `thinking: {type: 'disabled'}`, `effort: 'low'`** (tuned down from
  `medium`+thinking-on after a cost discussion — this task doesn't need deep reasoning, and
  thinking tokens bill at the same $25/1M output rate). Uses `output_config.format` with a
  JSON schema for guaranteed structured output. **No auth required** — applicant isn't
  signed up yet; protected by the anon apikey + input-length caps only.
- `supabase/ace_onboarding.sql` — new `marina_apply_drafts` table (the reason: the
  applicant finishes the whole conversation, including seeing their AI summary, **before**
  being asked for email/auth — but `marina_applications` requires `auth.uid()`. So answers
  are staged in this table keyed by an unguessable UUID that rides in the magic link's
  `?draft=<id>` redirect param — NOT sessionStorage/localStorage, which would silently lose
  the draft if the link is opened on a different device than it was filled out on, which is
  common with email magic links). Also added `marinas.description` and
  `marina_applications.ai_summary`/`ai_suggested_amenities`, and extended the existing
  `provision_listings_from_application()` trigger to sync the summary into
  `marinas.description` on approval, **and fixed a real pre-existing bug in that trigger
  while touching it**: marinas whose services included `winterization` got a
  `marina_listings` row but `marinas.winterization_enabled` was never set — and the app
  gates the "Winterize My Boat" button on that flag specifically, so those marinas had a
  winterization listing nobody could ever book. Fixed in the same migration.
- App change: `screens/MarinaProfileScreen.tsx` now renders `marina.description` (the
  Ace-written summary, once a marina is approved) below the amenity tags.

**✅ `ANTHROPIC_API_KEY` is set and confirmed working** — see the "Ace is fully live" section
at the top of this doc for the full story (two real bugs hit along the way, both resolved).
If the summary step ever starts failing again, that top section documents both known
failure modes (bad key value, low credit balance) and how they were diagnosed/fixed.

### Real bugs found and fixed during the portal build (not pre-existing, introduced/caught same session)
- `marina_apply_drafts` had **no table-level GRANT** for `anon`/`authenticated` — RLS
  policies alone don't matter if the underlying GRANT is missing; Postgres checks that
  first. Would have hard-broken the entire Ace flow. Fixed live + in the migration file.
- `listings.html`'s "Add a listing" form marked storage/haul-out/mooring as `exclusive`,
  diverging from the app's own convention (only slip/day_slip/rental are exclusive) — would
  have wrongly blocked legitimate concurrent bookings on any manually-added listing.
- `messages.html` double-rendered a marina's own sent messages — the Realtime-echo dedupe
  check referenced a `data-id` attribute on the bubble that was never actually set.
- (Also this session, in the app itself, before the portal work: the `crypto.randomUUID()`
  crash that broke every marina profile page — see `lib/uuid.ts` — and a booking-document
  upload that could hang forever on "Uploading…" if the permission/picker step threw before
  reaching the try/catch — see `lib/uploadBookingDocument.ts`. Both already fixed and
  committed earlier in this same session, mentioned here only for continuity.)

### Marina onboarding wizard (app-side, `screens/MarinaOnboardingScreen.tsx`)
Split from one long scroll into a proper 4-step wizard (About your marina / Contact info /
Services offered / Final details) with progress dots, matching the booking wizards' visual
language. Services chips now show a one-line explanation on select. Location field now
requires Nominatim address verification before continuing (same pattern used everywhere
else) — this was in direct response to a real incident: a marina's address geocoded to
California instead of Orillia when a boater tapped "Get Directions".

### Rental booking (`screens/components/RentalBookingModal.tsx`)
Added a **PCOC number** field (Pleasure Craft Operator Card — the actual Transport Canada
legal requirement to operate a powered watercraft, with no age exemption for PWCs like a
seadoo) alongside the existing photo-ID field, since a driver's license alone has no
bearing on boating competency. Relabeled the ID field to make clear it's for identity only.

---

## Commits made this session

**narrows-app** (`git log` to verify, newest first):
- `7e2f43b` — show marina description on profile, fix ace drafts table grants
- `54408bd` — connect marina on website to app *(committed by David directly, not me)*
- `4780e40` — marina services page + address verify + PCOC + fixes *(committed by David)*

**narrows-landing**:
- `1c0b57a` — fix listing exclusivity flag + duplicate message bubble
- `8feb80f` — ace *(committed by David)*
- `f088842` — marina side proal *(committed by David)*

**⚠️ Uncommitted right now:** `narrows-app/supabase/functions/ace-summarize/index.ts` (the
thinking-disabled/effort-low cost change from the tail end of this session). Check
`git status` in narrows-app before assuming everything is committed.

---

## On-device QA — paused mid-session, here's exactly where it stopped

Ran a real dev-client build in the iOS Simulator (not simulated/guessed — actually built and
tapped through it). Two tooling gotchas discovered, both important for next time:

1. **The `mcp__Claude_Code_iOS_Simulator__build` tool's headless build FAILS** with `Error:
   Cannot find module '@react-native/codegen/package.json'` during the "Generate Specs"
   script phase. Root cause confirmed by direct reproduction: that tool runs xcodebuild with
   a custom DerivedData path *outside* the project tree
   (`~/Library/Application Support/Claude/simulator-builds/...`), and React Native's own
   `script_phases.sh` does a `node --print "require.resolve(...)"` that resolves modules
   relative to `process.cwd()` — which ends up being that unrelated DerivedData directory,
   so it never walks up into `narrows-app/node_modules`. **Fix: don't use that MCP tool's
   `build` action for this project — use `npx expo run:ios --device "iPhone 16"` instead**,
   which invokes xcodebuild from the correct directory and builds cleanly (confirmed
   working, ~5 min clean build). Still use the MCP tool's `attach`/`screenshot`/`tap` actions
   for driving the simulator once the app is running — just not its `build` action.

2. **Coordinate space for `tap`/`swipe` is POINTS (393×852 for iPhone 16), not pixels.**
   Screenshots render at a higher pixel resolution, and it's easy to eyeball pixel positions
   from the screenshot and pass them straight to `tap` — that's wrong and causes
   near-misses. Convert via *fraction of the image* × 393 (width) or × 852 (height), not a
   fixed pixel/point ratio (I never nailed down the exact screenshot pixel dimensions, so a
   fraction-based estimate was the more reliable approach). Even then, expect to miss by a
   row occasionally on tightly-packed lists — verify with a screenshot after every tap
   before assuming success.

3. **Native iOS system alerts (`UIAlertController` — Log Out, Delete Account confirmations,
   any `Alert.alert()` from React Native) did not respond to this tool's synthetic taps at
   all**, across ~6 attempts with varied coordinates, while ordinary in-app (React Native
   view) taps worked fine every time. This looks like a real limitation of the simulator
   control tool with native alert hit-testing, not a coordinate-calibration problem — **for
   any flow that hits a native `Alert.alert()` or system dialog, ask the user to tap it
   manually** rather than burning turns guessing coordinates. This came up for both the
   "Delete account" and "Log out" confirmations under Settings.

### Test accounts (already exist, OAuth-only app — Claude can't sign in, only the user can)
| Email | Role | Notes |
|---|---|---|
| `david3obayomi@gmail.com` | boater | for submitting bookings against a marina |
| `david25obayomi@gmail.com` | marina | linked to **Blue Beacon Marina** — a REAL marina with real data. David confirmed there's already a real-looking pending winterization request ("David Obayomi, Sea Ray 24, needs a tow") sitting on it — **left untouched, do not approve/decline without asking**. Do not create new test bookings against Blue Beacon without asking first (David's guidance this session: use Narrows Test Marina for anything destructive instead). |
| `davidobayomi3@gmail.com` | marina | linked to **Narrows Test Marina** — the throwaway marina, safe to freely break. **Use this one for QA.** |

### What was actually verified (real, on real data, not guessed)
- Fresh dev-client build succeeds via `expo run:ios` and installs/launches on iPhone 16
  sim.
- Tab navigation (Home/Feed/Map/Requests/Profile) works, no crash on launch.
- Marina-side booking **detail view renders every field correctly** against a real live
  winterization request: type, boat make/model/year, beam, engine/fuel, shrink-wrap, tow
  address (Nominatim-formatted), emergency contact, logistics notes, preferred date,
  boater's estimate. Confirmed-price and scheduled-date inputs correctly pre-fill from the
  boater's estimate/preferred date. This is real evidence QA_CHECKLIST_PHASE_A.md §2's
  marina-side checks and part of §6 pass.
- Settings screen navigation, Log Out flow (David completed the final tap manually since
  the native alert wouldn't respond to synthetic taps).

### What's NOT done yet — pick up here in the new chat
Per `QA_CHECKLIST_PHASE_A.md`, everything below is still open:
- **§1** — marina signup → service picker → auto-provisioning (boater-side submission not
  yet tested; need to sign in as `david3obayomi@gmail.com`)
- **§2** — winterization wizard, boater-side submission (only marina-side viewing was
  verified)
- **§3** — seasonal slip wizard, insurance + document upload, private-bucket signed-URL
  access (and the negative test: a different marina can't open the doc)
- **§4** — day slip / storage / haul-out wizards
- **§5** — rental instant-book: live availability, age gate, license upload, safety
  checkboxes, Stripe PaymentSheet, **double-booking race test**, **hold-expiry sweep test**
- **§6** — cross-cutting: existing winterization pay flow end-to-end, DM messaging, push
  notifications (in-app + real OS-level push on a real device), Requests inbox filter tabs
  across all booking types
- Simulator was left logged out (David logged out at the very end) — next session starts
  from the login screen. Sign in as `davidobayomi3@gmail.com` (Narrows Test Marina) or
  `david3obayomi@gmail.com` (boater) depending which side you're testing.

### Also still not tested, unrelated to this session's build but still open from before
- Confirm the Stripe webhook actually flips a real payment to `paid`
- Confirm push notifications arrive on a real device + EAS has push credentials configured
- The web portal (Phase B/C) itself has never been clicked through in a real browser —
  Claude in Chrome was disconnected all session and the sandboxed Browser pane blocks
  localhost. It's been reviewed carefully against the live schema/RLS (see bugs fixed
  above) but never visually tested. Worth a real click-through once Claude in Chrome is
  connected, or ask David to try `narrows.site/marina/apply.html` once deployed.

---

## Other loose ends from earlier context, still open (not touched this session)
- Google Play submission (Data Safety form, content rating, testers)
- Supabase dashboard hardening (`checklist_hardening.sql` never run, crash-alert webhook)
- Apple Pay merchant ID registration
- iOS v1.0.1 rebuild (bundles several already-coded features waiting on it)
- Phase D (polish): DM read receipts + delete, response-time display on marina profiles,
  follow/favorite a marina, marina posts on feed, reviews

## Minor UI polish noted but not fixed (low priority)
- The "Close" button on the booking-request detail sheet sits right under the status bar —
  worked fine in the simulator but could be a hard tap target on a real device. Worth a
  quick look next time you're in `MarinaRequestsScreen.tsx`.
