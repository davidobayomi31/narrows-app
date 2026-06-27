# Narrows — Session Handoff

> Paste this into a new chat to continue. Covers current state, how to work with David, what's done, what's left, and the path to shipping by ~July 17.

---

## ⚠️ How to work with David (read first)

- **Teaching mode by default.** David is *learning* React Native. Default: **explain the logic → give the code snippet → say exactly which file + where → let HIM type it.** Do NOT auto-edit files unless he says "do it" / "go in and fix it." He frequently does ask for direct edits on bigger refactors/bug fixes — fine to do then.
- He sends **screenshots constantly** — diagnose from those.
- **Expo SDK 54 — never upgrade.** Read versioned docs (`docs.expo.dev/versions/v54.0.0`) before writing SDK code.
- After any change, run `npx tsc --noEmit` to catch errors before he reloads.
- David is **not** registering a business — operates as himself (David Obayomi, Orillia, Ontario) but all **public-facing legal text uses "Narrows"**, not his personal name (privacy preference).
- Currently **Expo Go only** — no EAS dev build yet. Several features are explicitly deferred until the dev build exists (see "Blocked on dev build" below). Don't try to build those in Expo Go.

---

## Project

**Narrows** — marina/waterway navigation + fishing **social app** for Simcoe County, Ontario (Orillia / Lake Couchiching). React Native + Expo SDK 54, TypeScript. Monetization: ads using onboarding data + a Spotlight promo surface. Companion waitlist/countdown site at `narrows.site` (separate repo, `github.com/davidobayomi31/narrows-landing`, deploys via Netlify) — **launching its countdown email July 17** via Loops.

**Brand:** bg `#000000`, gold `#C2A24E`, cream `#F5F0E8`. Logo: `assets/narrows-logo-clear.png`.

**Design system** (`constants/colors.ts`): true-black bg, **borderless** cards on `surface #1C1C1E`, `surfaceAlt #2C2C2E`, neutral `muted #8E8E93`, dimmed `gold`.

## Tech stack

Expo ~54.0.34 · RN 0.81.5 · TypeScript · `@react-navigation` (native-stack + bottom-tabs) · Supabase (`@supabase/supabase-js` + AsyncStorage) · `expo-image-picker` · `expo-location` · `react-native-maps@1.20.1` · `expo-sensors` · `expo-blur` · `expo-linear-gradient` · `expo-file-system` (new SDK54 `File`/`Directory` API, not legacy) · `@expo/vector-icons`.

## Navigation

Root stack (`App.tsx`): **Splash → Login → Signup → ConfirmEmail → ForgotPassword → ResetPassword → SetNewPassword → Onboarding → Home** (=`MainTabs`), plus stack screens **Settings, EditProfile, Events, MarinaProfile**.

**MainTabs**: **Home / Feed / Map / Profile** — floating frosted pill tab bar.

---

## Auth (WORKING ✅ — fully fixed this session)

- Supabase project `narrows`, ref `pddfyikqpuuuzgqhwjgu`, Canada Central, free plan.
- Signup → `ConfirmEmail` (8-digit OTP). Login `signInWithPassword`.
- **Forgot password** is now fully built, split into 3 screens (David did this split himself): `ForgotPasswordScreen` (enter email) → `ResetPasswordScreen` (enter 8-digit code only, `verifyOtp type:'recovery'`) → `SetNewPasswordScreen` (set new password, `updateUser`).
- Signup now requires an **actual checkbox** ("I agree to Terms of Service and Privacy Policy") before submit is allowed — not just passive text.
- Apple/Google sign-in buttons **removed from Login** (were non-functional placeholders) — real implementation deferred to post-dev-build.

### 🐛 Major bug found & fixed this session: signups were silently failing for everyone except David
Root cause: Supabase's custom SMTP "from" address pointed at a domain (`mail.narrows.site`) that Resend had **not fully verified** — Resend's domain-verification badge requires the MX record + SPF TXT under "Enable Sending" to *both* pass, and the MX record had been skipped earlier to avoid conflicting with Namecheap's built-in email forwarding. Result: Resend silently restricted sending to "your own verified email only" (`davidobayomi3@gmail.com`), so **every other signup attempt failed** with a generic "Sign up failed" alert.

**Fix:** migrated the website's email forwarding off Namecheap's built-in feature onto **ImprovMX** (free), which let Namecheap's Mail Settings switch to "Custom MX" without losing `hello@`/`support@narrows.site` forwarding. Added ImprovMX's 2 MX records + Resend's bounce MX record + SPF TXT at root. Domain now shows **Verified** in Resend; confirmed via direct API test that signup succeeds (HTTP 200) for arbitrary email addresses.

- Also reset the **"Reset Password" email template** in Supabase to use `{{ .Token }}` (an 8-digit code) instead of the default magic link, matching the signup flow — the link was pointing to an unconfigured `localhost` URL.
- `support@narrows.site` now exists (ImprovMX catch-all forwards `*@narrows.site` → `davidobayomi3@gmail.com`).

---

## Database (Supabase) — tables & RLS

**🔑 GRANT gotcha:** auto-expose is OFF. New tables need `grant select,insert,update,delete on table <t> to authenticated;` or writes fail with "permission denied." (anon role intentionally has no grants on most tables — that's correct, not a bug, since the app always operates as an authenticated user.)

- **`profiles`** — id, first_name, last_name, region, boat_ownership, experience_level, created_at, bio, avatar_url, verified. `phone` column was **dropped this session** (was world-readable, unused). Update policies now have `WITH CHECK (auth.uid() = id)` (tightened this session, previously only had `USING`).
- **`posts`**, **`likes`**, **`comments`** — same `WITH CHECK` tightening applied to posts/comments update policies this session.
- **`marinas`** — name, lake, address, phone, amenities, featured, latitude, longitude, image_url, water_alert, **+ `profile_id`** (new column added this session, links a marina row to a real `profiles` account). Blue Beacon Marina's `profile_id` is linked + that profile has `verified = true`.
- **`catch_pins`** — verified this session: table exists, RLS/grants correct (`authenticated`-only by design, matches login-required Map screen).
- **Storage:** bucket `post-images` (public).

---

## Key screens / components (additions this session in bold)

- **`Homepage.tsx`** — **Fixed the double-loading-screen bug**: Splash now prefetches marina+weather data (`lib/homeData.ts`, in-memory cache for the session) in parallel with its 2s logo display. Home checks that cache first and only shows its own loading gate if it wasn't prefetched (e.g. arriving via Login/Onboarding instead of Splash). **Marina hero is now tappable** → navigates to `MarinaProfile`.
- **`MarinaProfileScreen.tsx`** (NEW) — full marina detail: photo hero, name+verified badge, address/phone/amenities, Get Directions, and a grid of **that marina's own posts** (queried via `marinas.profile_id`). No trip-stat sections (David's request — marinas aren't anglers).
- **`MapScreen.tsx`** — **added a permanent gold circular boat-icon marker per marina row** (distinct shape from the catch-pin teardrops), tappable → `MarinaProfile`. Marina coordinates were reported wrong vs. real-world location (693 Atherley Rd) — **flagged as possibly still needing verification, re-check coordinates in the `marinas` table against Apple Maps before trusting it's fixed.**
- **`screens/components/PostComposer.tsx`** & **`screens/components/CommentsModal.tsx`** — **content moderation**: both now check captions/comments against a slur/offensive-word blocklist (`lib/moderation.ts`, word-boundary regex) before allowing submit. Image/nudity moderation is **not** built — would need a paid vision API (AWS Rekognition ~$1/1000 images, has a free tier); deferred as a cheap post-launch addition, manual reporting is the fallback for now.
- **`FeedScreen.tsx`** — **added a working Share button** per post (was previously just like/comment). Downloads the post photo locally via `expo-file-system`'s new `File.downloadFileAsync`/`Paths.cache` API (SDK 54's new File/Directory API, not the legacy function API), then opens React Native's core `Share.share()` with the photo + a "Shared via Narrows 🚤 narrows.site" text tag. **This is the Expo-Go-compatible version** — works fully on iOS (photo + text), Android only gets the text (RN's core Share API has no image-attach support on Android without a native module). A real pixel-burned watermark (logo composited into the image) needs `react-native-view-shot`, which needs the EAS dev build — deferred.
- **Notifications** — in-app notification list built this session (bell icon in Feed top bar, badge count, marks read on open) for likes/comments on your posts. **Not** push notifications — in-app only, requires opening the app to see new ones. Push requires the dev build + APNs certs.
- **`SettingsScreen.tsx`** — Log Out now shows a confirmation alert before signing out (was instant before). "Delete Account" button **removed entirely** per David's request. Privacy/Terms URLs now point to the real hosted pages (see Legal below), pulled from a shared `constants/legal.ts`.
- **`lib/moderation.ts`** (NEW), **`lib/homeData.ts`** (NEW) — see above.
- **Trip tracking (foreground) — NEW, built this session.** `contexts/TripContext.tsx` (`TripProvider`/`useTrip()`) wraps the whole app in `App.tsx`. Tracks GPS via `Location.watchPositionAsync` (accuracy High, distanceInterval 10m), accumulates distance with a haversine helper (`lib/tripTracking.ts`), and ticks elapsed seconds. **MapScreen** has a Start Trip / End Trip pill (bottom-center) + a live "MM:SS · X.XX km" stat pill while tracking. Ending a trip opens `PostComposer` pre-filled with the tracked duration/distance (new `tripPrefill` prop, shows an "Auto-tracked from GPS — adjust if needed" note; fully editable before posting). **Not yet field-tested with real GPS movement** — verify distance accumulation feels right on a real device.
  - **`lib/backgroundTripTracking.ts` (NEW) is a stub** — real background tracking (`expo-task-manager` + `Location.startLocationUpdatesAsync`, written against the real SDK 54 API). **Not imported/called anywhere** — background location can't run in Expo Go, so it sits ready to wire up post-dev-build. `expo-task-manager` was added to deps via `expo install`.
- **Notification tap → jump to post — NEW, built this session.** Notification rows in `NotificationsScreen.tsx` are now tappable (query pulls `post_id`), navigating to the Feed tab with `{ focusPostId, focusType, focusNonce }`. `FeedScreen.tsx` reads the param, resets the filter to All, scrolls to the post (via `onLayout` offsets), flashes a gold highlight ~1.6s, and auto-opens the comments modal for comment-type notifications. Notifications with no `post_id` (older ones) are non-tappable.

---

## Legal — DONE this session (was placeholder before)

- Full app Privacy Policy + Terms of Service are **live and hosted** at `narrows.site/app-privacy.html` and `narrows.site/app-terms.html` (separate from the existing `narrows.site/privacy` page, which covers only the waitlist signup form — left untouched).
- Operator name uses **"Narrows"**, not David's personal name (confirmed via curl — no leftover references). Orillia, Ontario. Contact: `support@narrows.site`. Min age 13. Liability cap CAD $100.
- Pages were deliberately restyled to **plain white background / black text** (boring, standard legal-doc look) instead of the app's branded dark theme — David's request.
- Source files: `screens/SettingsScreen.tsx` and `screens/SignupScreen.tsx` both import URLs from `constants/legal.ts` (single source of truth).
- These live in the **`narrows-landing`** repo (separate from `narrows-app`), already pushed to `main`, Netlify auto-deploys.

---

## 🚨 Blocked on the EAS dev build (cannot build in Expo Go)

These were explicitly discussed and deferred — code for some can be *written* now, but none can be *tested* until the dev build exists:
1. **Sign in with Apple / Google** — Apple capability literally can't be configured before Apple Developer enrollment. **Google decision (this session):** chose the *native* `@react-native-google-signin` SDK over the Expo-Go-compatible Supabase OAuth web flow — but native needs the dev build, and Google OAuth config (Google Cloud client + Supabase provider) is **not set up yet**, so this is deferred. Web OAuth flow remains the fallback if a before-launch Google login is wanted.
2. **Real background trip tracking** (app minimized) — foreground-only tracking works in Expo Go today; background needs the dev build.
3. **Pixel-watermark sharing** (`react-native-view-shot`) — the text-tag version (above) ships now; this is the upgrade later.
4. **Push notifications** — needs APNs certs + dev build; in-app notifications (built this session) work today without it.

---

## 📋 Shipping timeline — target: live on both stores around/before July 17

Today's date: **June 27, 2026**. David gets paid **Sunday evening** — that's when the Apple fee gets paid, not before.

**Key correction made this session:** Google Play is the long pole, not Apple. New Google Play developer accounts must run a **closed testing track with 12+ testers, continuously opted in for 14 days**, before production access is even possible — this is a hard calendar minimum, not a queue you can rush. Apple App Store review is genuinely ~24-48h per attempt these days (not the old "2 weeks" rumor), though budget for one rejection-and-resubmit cycle on a first submission.

1. **Now → Sunday:** keep building everything Expo-Go-compatible. Re-verify the marina map coordinates. Recruit Android beta testers in parallel (see below) — don't wait for the Android build to exist before recruiting.
2. **Sunday evening:** pay & enroll Apple Developer Program ($99/yr, Individual). Same day: create a Google Play Console account ($25 one-time) — worth checking in Play Console whether a verified **Organization** account type gets a different/lighter testing requirement than Personal (uncertain, policy may have changed — check live).
3. **Once Apple approves (hours–48h):** `eas build:configure`, `npx expo install expo-dev-client`, run first iOS dev build, test Sign in with Apple / Google / background tracking / real watermark.
4. **As soon as an Android build exists:** immediately push to Google Play's closed testing track and get **12+ testers opted in on day one** (not gradually — the 14-day clock only starts once you actually have 12 simultaneously enrolled). Sources discussed: personal network with Android phones, the `narrows.site` waitlist email list, local Orillia/Simcoe Facebook groups, **r/alphaandbetausers** and **BetaFamily.com** (legitimate tester-exchange communities — do NOT buy testers from click-farm services, real suspension risk).
5. **iOS App Store submission:** once dev build is solid, submit. Realistic public availability: **~1 week** after Apple approval (assuming ≤1 rejection cycle).
6. **Google Play production:** 14-day testing clock + a few more days for final production review after that. Realistic public availability: **~3 weeks** from when the closed testing track actually starts with 12 testers.
7. **Conclusion:** iOS can plausibly be public *around* July 17 if Sunday enrollment goes smoothly. Android will almost certainly land **after** July 17 — plan messaging/launch accordingly (e.g. "iOS first, Android coming in [X] weeks") rather than trying to force both simultaneously.

---

## Roadmap after launch (free unless noted)
- Bathymetry depth layer, suggested hotspots from `catch_pins` data, weather radar (RainViewer), real Search, account deletion via Edge Function, image-based nudity moderation (AWS Rekognition, cheap at low volume).
- Consider registering an Ontario sole-proprietorship business name (~$60, ~20 min via Ontario Business Registry) — lets the App Store "Seller" field show "Narrows" instead of David's personal name, and may affect Google Play's Organization-account testing requirements (worth checking).

## Cost posture
$0 except: Apple Developer ($99/yr, pay Sunday), Google Play ($25 one-time), optionally a business name registration (~$60) later. Resend, Supabase, ImprovMX, Open-Meteo, Apple Maps all free at current scale.
