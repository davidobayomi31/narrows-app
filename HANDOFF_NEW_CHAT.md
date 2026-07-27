# Narrows — Session Handoff (2026-07-17)

Paste this into a new chat to continue. It captures what changed this session,
current state, and what's still pending. Verify against code before trusting any
specific claim.

## Project basics
- **App:** Narrows — boating/marina social app for Simcoe County (Lake Couchiching / Simcoe), Orillia ON.
- **Stack:** React Native + Expo **SDK 54** — NEVER upgrade (dev device is Expo Go 54.0.2 / dev build).
- **Bundle ID:** `site.narrows.app` · **Apple Team ID:** `YK5Q9B4A38` · **App Store numeric ID:** `6788090227`
- **Brand:** bg `#000`, gold `#C2A24E`, cream `#F5F0E8`.
- **Two repos:** `narrows-app` (this) and `narrows-landing` (website, GitHub `davidobayomi31/narrows-landing`, hosted on **Netlify**, auto-deploys on push to `main`, serves **narrows.site**).
- **App Store:** app is LIVE. This session's changes are for an **update** (will need a version bump — see Pending).

## What changed this session (all typecheck-clean)

### App (`narrows-app`)
1. **Speed → whole number** + 6 km/h floor (`contexts/UnitsContext.tsx`).
2. **Speed accuracy** (`screens/MapScreen.tsx`): median smoothing of last N GPS readings + accuracy gate (discard fixes worse than threshold) + **pedometer** (`expo-sensors`) to hide speed while walking. Needs `NSMotionUsageDescription` (added) → **needs native rebuild**.
3. **Share** → custom Instagram-style **`screens/components/ShareSheet.tsx`** (Copy link `expo-clipboard`, Save `expo-media-library`, WhatsApp/Messages via `Linking`, "Share to…" OS sheet). Wired into `FeedScreen` + `PostDetailScreen`. **`react-native-share` fully removed** (package, plugin, `lib/shareToSocial.ts`, `constants/social.ts` all deleted).
4. **Per-post Universal Links** — `narrows.site/post/<id>` opens the app to that post (`App.tsx` `linking` → PostDetail; `app.json` `associatedDomains: ["applinks:narrows.site"]`). ShareSheet Copy-link uses this URL.
5. **Pull-to-refresh** added to **Home + Profile only** (not Map).
6. **PostComposer image preview** — tapping the selected image now opens a full-screen viewer (overlay inside the composer Modal, not a broken second Modal).
7. **Depth of water on Map** (`screens/MapScreen.tsx`): live depth number from Simcoe County bathymetry `identify` endpoint. Two modes via **Settings toggle** (`depthMode` in UnitsContext): `location` (default, depth at your GPS) and map-center (crosshair reticle). Attribution + "reference only, not for navigation" disclaimer shown. (Earlier tile-overlay approach + the `narrows.site/depth/*` proxy were REMOVED.)
8. **Keyboard dismiss** — `screens/components/DismissKeyboardView.tsx`; applied to every TextInput screen + `KeyboardAvoidingView` on fixed-layout auth screens (Confirm/Forgot/Reset/SetNewPassword) so the keyboard never traps the button.
9. **Marina / account-type + winterization feature:**
   - SQL: **`supabase/marina_winterization.sql`** (additive; safe to re-run). Adds `profiles.account_type`, `marinas.winterization_enabled` + `profile_id`, `marina_applications`, `winterization_requests`.
   - Signup fork: **`AccountTypeScreen`** (Boater vs Marina Partner) → **`MarinaOnboardingScreen`** (name, location, years, phone, email, offers_winterizing, num_slips).
   - **`contexts/AccountContext.tsx`** (`accountType`, `marina`). `MainTabs` shows a **Requests** tab for marina accounts. **`MarinaRequestsScreen`** = marina dashboard (shows "pending review" until approved). Home shows a gold "waiting on approval" banner for unapproved marinas.
   - **Boater-facing winterize UI is HIDDEN** behind `WINTERIZATION_REQUESTS_LIVE = false` in **`constants/features.ts`** (button on MarinaProfile, WinterizeRequestModal, MyWinterizationRequests + its Settings row). Flip to `true` to launch later.
   - **Approve a marina (manual, in Supabase):** on the `marinas` row set `profile_id` = applicant's `marina_applications.user_id` AND `winterization_enabled = true`; optionally set `marina_applications.status = 'approved'`.

### Website (`narrows-landing`, all deployed live)
- **Per-post teaser:** `post.html`, `_redirects` (`/post/* → /post.html`), `_headers`, `.well-known/apple-app-site-association` (appID `YK5Q9B4A38.site.narrows.app`, paths `/post/*`). App Store ID `6788090227` in the teaser + iOS smart banner. **Verified live.**
- **Blue Beacon Marina photo:** real photo at `uploads/blue-beacon-marina.jpg` → **live at `https://narrows.site/uploads/blue-beacon-marina.jpg` (200 OK)**.
- **Mobile notice-bar fix:** the "Heads up… launch pushed to July 27" bar is now a clean full-width bottom bar on phones (was a cramped column over the signup form). Deployed.

### App Store screenshots (on ~/Desktop)
- `narrows-screenshot-feed-1.png` (family pontoon) and `narrows-screenshot-feed-2.png` (sunset), 1290×2796, pixel-accurate Feed mockups with fictional boaters. Ready to upload.

## PENDING / next steps
1. **Rebuild the dev app in Xcode** — native changes since last build: `expo-clipboard`, `expo-media-library`, `expo-sensors` Motion permission, `associatedDomains`, `LSApplicationQueriesSchemes:["whatsapp"]`. Until rebuilt on device, Save/Copy-link, deep links, and pedometer speed-hiding won't work. Prebuild already run; pods present. Metro: `npx expo start` (Mac IP was `10.0.0.48:8081` — may change).
2. **Set `marinas.image_url`** in Supabase to `https://narrows.site/uploads/blue-beacon-marina.jpg` — the photo is live but confirm the DB row points to it, else Home shows the stock octopus placeholder.
3. **Run `supabase/marina_winterization.sql`** in Supabase SQL Editor if not already (additive columns for the new onboarding fields).
4. **Version bump for the App Store update** — currently `1.0.0`. A new store version needs `app.json` `version` bumped (e.g. `1.0.1`). `eas.json` production `autoIncrement` handles the build number.
5. **Netlify Web Analytics** was accidentally enabled (~$9/mo per site). Check Team → Billing; disable on the Web Analytics page if unwanted. (Netlify "unique visitors" = unique IPs, inflated by bots + my deploy-verification curls — not real human count.)
6. **Full production build / TestFlight** — to properly test true offline cold-start (dev build can't; it needs Metro).

## Accounts
- Netlify: logged in **via GitHub** (`davidobayomi31`); project `glittering-alpaca-0cd45d` = narrows.site. General email `davidobayomi3@gmail.com`.
- `ACCOUNTS.md` (app root) is the master list — has blank "Login email" columns to fill in.
