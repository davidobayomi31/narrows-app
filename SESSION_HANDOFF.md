# Narrows — Session Handoff

> Paste this into a new chat to continue. Covers current state, how to work with David, what's done, what's left, and the path to the App Store.

---

## ⚠️ How to work with David (read first)

- **Teaching mode by default.** David is *learning* React Native. Default: **explain the logic → give the code snippet → say exactly which file + where → let HIM type it.** Do NOT auto-edit files unless he says "do it" / "go in and fix it." He frequently does ask for direct edits on bigger tasks — fine to do then.
- He sends **screenshots constantly** — diagnose from those.
- **Expo SDK 54 — never upgrade.** Read versioned docs (`docs.expo.dev/versions/v54.0.0`) before writing SDK code.
- After any change, run `npx tsc --noEmit` to catch errors before he reloads.
- David is **not** registering a business — operates as himself (David Obayomi, Orillia, Ontario) but all **public-facing legal text uses "Narrows"**, not his personal name.
- Currently **Expo Go only** — no EAS dev build yet. Several features are deferred until after Apple Developer enrollment (see "Blocked on dev build" below).

---

## Project

**Narrows** — marina/waterway navigation + fishing **social app** for Simcoe County, Ontario (Orillia / Lake Couchiching). React Native + Expo SDK 54, TypeScript. Monetization: ads using onboarding data (boat ownership, region, experience). Companion waitlist/countdown site at `narrows.site` (separate repo `github.com/davidobayomi31/narrows-landing`, Netlify) — **countdown email launch July 17, 2026** via Loops.

**Brand:** bg `#000000`, gold `#C2A24E`, cream `#F5F0E8`. Logo: `assets/narrows-logo-clear.png`.

**Bundle ID:** `site.narrows.app` — locked in `app.json` as `ios.bundleIdentifier` + `android.package`. **Do not change** — becomes permanent at first App Store submission.

---

## 🟢 Where we are: Expo Go phase is COMPLETE

All buildable-in-Expo-Go features are done. The only gate remaining before Apple Developer enrollment is **testing in Expo Go** (David now has wifi — see test checklist below).

### What was built (full feature list)

**Auth:**
- Signup → ConfirmEmail (8-digit OTP via Resend SMTP, domain verified)
- Login (email/password)
- Forgot Password (3-screen flow: ForgotPasswordScreen → ResetPasswordScreen → SetNewPasswordScreen)
- Age gate checkbox ("I confirm I am at least 13 years old") on Signup
- Terms + Privacy checkboxes on Signup
- Delete Account: Settings → two-step Alert → `delete-account` Edge Function (deployed) → signOut → navigate Login

**Social / Feed:**
- Posts with images, likes, comments
- Share (downloads photo via expo-file-system SDK54 File API → React Native Share with "Shared via Narrows 🚤 narrows.site" tag; iOS = photo+text, Android = text only)
- "⋯" menu per post: report post
- Long-press comment (400ms): report comment
- Block user from post menu → posts + comments from blocked user vanish (both directions)
- Content moderation blocklist (slur filter, `lib/moderation.ts`)

**Map + Catch Pins:**
- react-native-maps@1.20.1 (Apple Maps, no key needed)
- User location blue dot (foreground permission)
- Catch pins as gold teardrop markers (long-press to drop)
- Marina markers as gold circular boat-icon markers → tap → MarinaProfileScreen

**Trip Tracking (foreground):**
- `contexts/TripContext.tsx` (TripProvider/useTrip()) wraps App.tsx
- Start/End Trip pill at bottom of Map screen
- Live "MM:SS · X.XX km" stat pill while tracking
- GPS via `Location.watchPositionAsync` (accuracy High, distanceInterval 10m)
- Haversine distance accumulation (`lib/tripTracking.ts`)
- End trip → PostComposer pre-filled with duration + distance (auto-tracked note, fully editable)
- Background tracking stub: `lib/backgroundTripTracking.ts` (NOT wired — can't run in Expo Go)

**Notifications:**
- In-app notification list (bell icon in Feed top bar, badge count, marks read on open)
- **Notification tap → jump to post:** navigates to Feed with `{ focusPostId, focusType, focusNonce }`, resets filter to All, scrolls to post via `onLayout` offsets, flashes gold highlight ~1.6s, auto-opens CommentsModal for comment-type notifications

**Security / Anti-abuse (all deployed to Supabase):**
- `reports` table (RLS: insert own, select own) — `supabase/security_setup.sql`
- `blocked_users` table (composite PK, both-direction RLS) — same file
- `delete-account` Edge Function (Deno, SERVICE_ROLE_KEY auto-injected, never in app)
- Rate-limit triggers: posts (10s), comments (5s), catch_pins (10s) — `supabase/rate_limits.sql`
- 8 MB image size cap in PostComposer (pre-upload check + upload backstop)
- FK CASCADE verified: all tables → CASCADE; `marinas.profile_id` → SET NULL
- Performance indexes on user_id + recipient_id columns

**Legal (all live at narrows.site):**
- `narrows.site/app-privacy.html` — app privacy policy (PIPEDA + Quebec Law 25)
- `narrows.site/app-terms.html` — Terms of Service with UGC zero-tolerance clause
- `narrows.site/community-guidelines.html` — standalone page, linked from Terms
- URLs exported from `constants/legal.ts`, used in SettingsScreen + SignupScreen
- Operator: "Narrows", Orillia Ontario, support@narrows.site, min age 13, liability cap CAD $100

**Polish + Setup:**
- MarinaProfileScreen (photo hero, verified badge, address/phone/amenities, marina posts grid)
- Homepage double-load bug fixed (Splash prefetches data)
- Marina hero on Homepage tappable → MarinaProfileScreen
- Settings: logout confirm alert, delete account, Community Guidelines link
- `app.json` bundle identifier: `site.narrows.app`
- `ACCOUNTS.md` in repo root (master list of all services/accounts)
- `tsconfig.json` excludes `supabase/` folder (prevents Deno type errors)

---

## 📱 Test checklist (do this NOW in Expo Go with wifi)

1. **Report a post** — tap ⋯ on any post → check Supabase `reports` table has the row
2. **Report a comment** — long-press a comment → pick a reason → check reports table
3. **Block a user** — tap ⋯ → Block → confirm that user's posts vanish from Feed
4. **Delete a throwaway account** — Settings → Delete Account → confirm posts/profile gone, can't log back in
5. **Trip tracking** — Start Trip on Map → walk/drive a bit → End Trip → confirm PostComposer opens pre-filled with duration + distance
6. **Notification tap** — get a like/comment notification → tap it → confirm Feed scrolls to the correct post with gold flash

---

## 🚀 Next step: Apple Developer Program enrollment

David gets paid Sunday (2026-07-06 or 2026-07-07). That's when the Apple fee gets paid.

**Exact steps for the Apple Developer chat:**
1. Go to `developer.apple.com/programs/enroll`
2. Sign in with your Apple ID (or create one — use `david3obayomi@gmail.com` or a dedicated Apple ID)
3. Select **Individual / Sole Proprietor** (not Organization — that requires a DUNS number and D&B verification which takes weeks)
4. Pay $99/yr
5. Approval typically comes in email within a few hours (sometimes instant, sometimes up to 48h)
6. **Same day or next:** Create Google Play Console at `play.google.com/console` ($25 one-time)

**After Apple approval:**
```bash
# In narrows-app directory
npx eas build:configure
npx expo install expo-dev-client
# Then run first iOS dev build via EAS
eas build --platform ios --profile development
```

---

## 🚨 Blocked on dev build (can't do in Expo Go)

1. **Sign in with Apple / Google** — Apple capability needs Xcode entitlements + dev build. Google OAuth config (Google Cloud client + Supabase provider) not set up yet.
2. **Background trip tracking** — stub at `lib/backgroundTripTracking.ts` is ready, just needs wiring post-dev-build.
3. **Real watermark on shared photos** — needs `react-native-view-shot`; current share uses text tag only.
4. **Push notifications** — needs APNs certs + dev build; in-app notifications work today.

---

## Database (Supabase)

- Project: `narrows`, ref `pddfyikqpuuuzgqhwjgu`, Canada Central, free plan
- **GRANT gotcha:** new tables need `grant select,insert,update,delete on table <t> to authenticated;` or writes fail with "permission denied"
- All Apple compliance tables deployed: `reports`, `blocked_users`
- Rate-limit triggers deployed on `posts`, `comments`, `catch_pins`
- Storage bucket: `post-images` (public)
- Edge Function deployed: `delete-account`

---

## Accounts (see ACCOUNTS.md for full detail)

| Service | Purpose |
|---|---|
| GitHub (`davidobayomi31`) | Code (narrows-app + narrows-landing repos) |
| Supabase | DB, auth, storage |
| Namecheap | narrows.site domain |
| Netlify | Hosts narrows.site (auto-deploys) |
| Resend | Sends OTP/password reset emails |
| ImprovMX | Forwards @narrows.site → gmail |
| Loops | Countdown email (July 17 launch) |
| Expo (EAS) | Builds the app |
| Apple Developer | $99/yr — pay Sunday |
| Google Play Console | $25 one-time — pay Sunday |

---

## Remaining optional work (after App Store submission)

- **Copyright/DMCA policy** — `app-copyright.html` in narrows-landing, linked from app-terms.html. The one remaining legal gap. Protects David from user-uploaded infringing content. Recommended before real users start uploading lots of photos.
- Bathymetry depth layer, weather radar (RainViewer), real search, push notifications — all post-launch roadmap.
- AWS Rekognition image moderation (~$1/1000 images) — cheap at low volume, add after launch.
- Ontario business name registration (~$60) — makes App Store "Seller" show "Narrows" instead of David's personal name.

---

## Shipping timeline

- **Now → Sunday:** Expo Go testing pass (checklist above). Recruit Android beta testers now (don't wait for build).
- **Sunday:** Pay Apple Developer ($99) + Google Play Console ($25).
- **After Apple approval (hours–48h):** `eas build:configure`, install `expo-dev-client`, first iOS dev build, test Sign in with Apple/Google + background tracking.
- **As soon as Android build exists:** push to Google Play closed testing track, get 12+ testers opted in on day one (14-day clock starts when 12 are simultaneously enrolled, not gradually).
- **iOS App Store submission:** after dev build is solid + TestFlight test. Realistic: ~1 week after Apple approval with ≤1 rejection cycle.
- **iOS public:** plausibly ~July 17 if Sunday enrollment goes smoothly.
- **Google Play public:** ~3 weeks from when the closed testing track starts. Will lag iOS — plan launch messaging accordingly ("iOS now, Android coming in X weeks").
