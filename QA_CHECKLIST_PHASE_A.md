# QA Checklist — Phase A (generalized bookings)

> Covers A0–A4: expanded booking types, winterization's real question set, marina
> service picker + auto-provisioning, the 4 new request wizards (slip/day slip/
> storage/haul-out), and the rental instant-book engine.
>
> Needs a real device or simulator + a real (sandbox) Supabase/Stripe setup — none
> of this could be verified from the Claude session that built it. Test on a
> **fresh dev build**, not Expo Go (native modules involved: image picker, date
> picker, Stripe).

---

## 0. Setup before you start

- [ ] Fresh dev build installed (`expo run:ios` / EAS dev build) — not Expo Go
- [ ] Two test accounts: one boater, one marina owner (different Apple/Google
      sign-ins so you can be logged in as each on separate devices/simulators,
      or log out/in between steps)
- [ ] A marina row you can freely break things on — **don't test against Blue
      Beacon if it has real data you care about.** Either create a second test
      marina application from a throwaway account, or confirm you're OK
      resetting Blue Beacon's bookings after testing.
- [ ] Stripe sandbox card ready: `4242 4242 4242 4242`, any future expiry, any CVC

---

## 1. Marina signup → service picker → auto-provisioning

- [ ] Sign up as a new marina (MarinaOnboardingScreen). Confirm the **service
      picker chips** show all 6 options + "Offer something else?" free text
- [ ] Pick 2–3 services (e.g. Winterization + Slip + Rental), submit
- [ ] Confirm "Submit for Review" is disabled until at least one service is
      picked (or "Other" text is filled) — try submitting with nothing picked
- [ ] **In Supabase**, set that marina's `profile_id` to link the applicant
      (the manual approval step) and confirm:
  - [ ] `marina_listings` now has one row per picked service, auto-created
  - [ ] Each row's `name`/`price_unit`/`exclusive` looks sane (e.g. `slip` is
        exclusive, `winterization` is not)
  - [ ] Prices are `null` ("contact for pricing") — expected, nothing sets a
        real price yet. Set one manually via SQL for the types you'll test
        payment on (rental especially, since it needs `price_cents` to book)
- [ ] Log in as the boater, open that marina's profile — confirm **only** the
      picked services show a "Book X" button (nothing you didn't pick)

---

## 2. Winterization wizard (boater side)

- [ ] Open "Winterize My Boat" — confirm 4 steps with progress dots: Boat Info
      → Service Details → Schedule & Contact → Review
- [ ] Try tapping Continue with each step's required fields empty — confirm
      it's disabled until filled (boat type, length, beam on step 1; engine/
      fuel/shrink-wrap/location on step 2; emergency contact on step 3)
- [ ] Select "Sailboat" as boat type — confirm the "mast down?" question
      appears on step 2 (and required); select a non-sailboat type — confirm
      it does NOT appear
- [ ] Select "No" to already-at-marina, then "I need a tow" — confirm the
      address field + "Verify address" button appear
- [ ] Type a fake/incomplete address, tap Verify — confirm it's rejected
      ("Couldn't find that address")
- [ ] Type a real street address, verify — confirm the green checkmark +
      formatted address appears, and Continue becomes enabled
- [ ] Edit the address text after verifying — confirm the checkmark clears
      (must re-verify)
- [ ] Reach the Review step — confirm every field you entered shows correctly,
      including the estimate
- [ ] Submit — confirm success alert, modal closes, request appears in "Your
      Winterization Request" on the marina profile
- [ ] **As the marina**, open Requests → confirm the new fields all show:
      make/model/year, beam, engine/fuel, mast-down (if sailboat), shrink-wrap,
      tow address (if applicable), emergency contact

---

## 3. Seasonal Slip wizard (the big one — insurance + document upload)

- [ ] Open "Book a Slip" — confirm 6 steps: Boat Info → Power & Needs →
      Insurance → Season Dates → Emergency Contact → Review
- [ ] If the marina has multiple slip listings, confirm the listing picker
      shows on step 1; if only one, confirm it's auto-selected with no picker
- [ ] Enter a boat length longer than the listing's `max_length_ft` (set one
      via SQL if needed) — confirm the "fits boats up to X ft" error shows and
      blocks Continue
- [ ] Step 3 (Insurance): try continuing with fields empty — confirm blocked.
      Fill insurer/policy/liability/expiry, then tap "Upload photo" —
      **confirm the photo picker actually opens, you can pick an image, and
      it uploads** (watch for the "Uploading…" state, then "✓ Certificate
      attached")
- [ ] Step 4: pick season start/end dates — confirm end date can't be before
      start (try picking end before start, should auto-clear or block)
- [ ] Complete and submit — confirm success
- [ ] **As the marina**, open the request detail — confirm insurer/policy/
      liability/expiry show as text, AND **tap "View insurance certificate →"
      — confirm it actually opens the photo you uploaded** (this is the
      private-bucket signed-URL path; if this fails, check the storage RLS
      policies in `booking_expansion.sql`)
- [ ] Confirm a **different** marina account (not the one this booking was
      made against) **cannot** open that same document link — should fail or
      be inaccessible, proving the private-bucket scoping actually works

---

## 4. Day Slip, Storage, Haul-out wizards (lighter — spot check each)

For each of the three, confirm: correct step count/titles, required-field
gating works, listing-picker/fit-check behaves the same as Slip, and the
Review step shows accurate data.

- [ ] **Day Slip** (4 steps): boat info → dates+power → contact → review.
      Confirm arrival/departure date logic (departure must be after arrival)
- [ ] **Storage** (4 steps): boat info (with trailer y/n) → season dates +
      shrink-wrap add-on → contact → review
- [ ] **Haul-out** (4 steps): boat info (with weight) → service date +
      purpose chips → contact → review. Confirm it only needs ONE date, not a
      range
- [ ] **As the marina**, confirm each type's detail panel shows its specific
      fields (registration/power/water for slip and day slip; trailer/shrink-
      wrap for storage; weight/purpose for haul-out) — and the generic
      "Dates" row shows correctly for each (single date for haul-out, range
      for the others)

---

## 5. Rental instant-book (the highest-risk flow — test this most carefully)

- [ ] Confirm the marina's rental listing has a real `price_cents` set (SQL —
      auto-provisioned listings start with `null` price)
- [ ] Open "Rent a Seadoo" — pick a date, start time, duration — confirm
      **live availability checking** kicks in (spinner, then "✓ [unit name]
      is available")
- [ ] Try continuing before a slot is confirmed available — should be blocked
- [ ] Step 2: enter a DOB that makes you under 19 — confirm the age error
      shows and blocks Continue. Enter a valid DOB (19+), license number, and
      **upload a license photo** — confirm it uploads same as insurance did
- [ ] Step 3: confirm ALL 4 safety checkboxes must be checked before
      Continue enables — verify each one independently blocks/unblocks it
- [ ] Step 4: confirm the review shows unit/time/renter/price correctly, tap
      "Reserve & Pay" — **confirm the Stripe PaymentSheet opens immediately**
      (no marina approval step) — pay with the test card
- [ ] Confirm success alert, and the booking shows up already `paid` (or
      `approved` briefly until the webhook fires) — **not `pending`**
- [ ] **Double-booking race test (the most important one):** with only ONE
      unit of that rental type, start the flow on two devices/accounts for
      the *same exact time slot*, and try to submit both around the same
      time. Confirm **one succeeds and the other gets "That time slot was
      booked by someone else a moment ago"** — and confirm the second
      attempt's card was **never charged** (check Stripe dashboard — no
      PaymentIntent should exist for the rejected attempt)
- [ ] **Hold-expiry test:** start a rental booking, get to the payment sheet,
      then cancel/back out without paying. Confirm the booking sits as
      `approved`+unpaid. Wait 10+ minutes (or manually set `hold_expires_at`
      to the past via SQL for a faster test), then open the rental wizard
      again for the same slot — confirm it now shows as **available again**
      (the stale hold got swept)
- [ ] **As the marina**, open the request — confirm renter age/license show,
      and **"View driver's license →" actually opens the photo**

---

## 6. Cross-cutting checks (things that could regress from all this)

- [ ] Confirm the **existing winterization pay flow still works end-to-end**
      (approve → pay → webhook flips to `paid`) — this predates Phase A and
      shouldn't have broken
- [ ] Confirm **DM messaging** (paper-airplane icon on marina profile) still
      opens and sends/receives normally
- [ ] Confirm **push notifications** fire for: new winterization request, new
      slip/storage/etc. request, new rental booked — check both the in-app
      Notifications tab AND an actual OS-level push alert on a real device
- [ ] Confirm `npx tsc --noEmit` is still clean after any fixes you make
      during testing
- [ ] Confirm the marina Requests inbox **filter tabs** (if any) still
      correctly show/filter across all 6+ booking types, not just winterization

---

## Known gaps — not bugs, just not built yet

- Prices for auto-provisioned listings are `null` until set manually via SQL
  — no self-serve price editor exists yet (that's the website portal, Phase B)
- Mooring and Fuel Dock have no wizard/booking flow at all
- No email notifications, only push + in-app
- Marina can't edit their own listings/photos from the app — website-only,
  not built yet either
