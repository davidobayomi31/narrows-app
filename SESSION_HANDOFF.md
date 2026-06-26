# Narrows — Session Handoff

> Paste this into a new chat to continue. Covers current state, how to work with David, what's done, what's left, and the exact SQL / dashboard steps still pending.

---

## ⚠️ How to work with David (read first)

- **Teaching mode by default.** David is *learning* React Native. Default: **explain the logic → give the code snippet → say exactly which file + where → let HIM type it.** Do NOT auto-edit files unless he says "do it" / "go in and fix it."
- He **does** often ask you to edit directly for big/tedious refactors and bug fixes — he'll say so. When he pastes a whole file or says "check for errors," fixing directly is fine.
- He sends **screenshots constantly** — diagnose from those.
- **Expo SDK 54 — never upgrade.** Read the versioned docs (`docs.expo.dev/versions/v54.0.0`) before writing SDK code.
- After any change, run `npx tsc --noEmit` to catch errors before he reloads.
- Common paste errors to watch for: code pasted into the wrong block (e.g. a button nested inside another), missing closing `/>` on JSX, functions nested inside other functions, `.ts` instead of `.tsx` for files with JSX.

---

## Project

**Narrows** — marina/waterway navigation + fishing **social app** for Simcoe County, Ontario (Orillia / Lake Couchiching). React Native + Expo SDK 54, TypeScript. Monetization: ads using onboarding data + a Spotlight promo surface.

**Brand:** bg `#000000`, gold `#C2A24E` (dimmed from old `#C9A84C`), cream `#F5F0E8`. Logo: `assets/narrows-logo-clear.png`.

**Design system** (`constants/colors.ts`): true-black bg, **borderless** cards on `surface #1C1C1E`, `surfaceAlt #2C2C2E`, neutral `muted #8E8E93` (NO bluish gray), dimmed `gold`. This palette was applied across Home/Map/Feed/Profile to kill the "AI-templated" look (borders + blue-gray text were the tells).

## Tech stack

Expo ~54 · RN 0.81 · TypeScript · `@react-navigation` (native-stack + bottom-tabs) · Supabase (`@supabase/supabase-js` + AsyncStorage) · `expo-image-picker` · `expo-location` · `react-native-maps@1.20.1` · `expo-sensors` (magnetometer) · `expo-blur` · `expo-linear-gradient` · `expo-status-bar` · `@expo/vector-icons`.

## Navigation

Root stack (`App.tsx`): **Splash → Login → Signup → ConfirmEmail → Onboarding → Home** (=`MainTabs`), plus stack screens **Settings, EditProfile, Events** (dark header, back arrow). `<StatusBar style="light" />` is set so the iOS status bar (time/battery/wifi) shows white app-wide.

**MainTabs** (bottom tabs): **Home / Feed / Map / Profile** — a **floating frosted pill** (`expo-blur`, detached, translucent; content scrolls under it). The Explore tab/screen was removed (only one marina, no need yet).

---

## Auth (WORKING ✅)

- Supabase project `narrows`, ref `pddfyikqpuuuzgqhwjgu`, Canada Central, **free plan**.
- `lib/supabase.ts`: `createClient` + AsyncStorage, anon key in file (safe — protected by RLS).
- Signup → `ConfirmEmail` (8-digit OTP, `verifyOtp type:'signup'`). Login `signInWithPassword`. Logout in **Settings** now. Session via Splash `getSession()`.
- **Resend custom SMTP** sends the OTP email. ⚠️ **Free tier only delivers to davidobayomi3@gmail.com** — see Launch Blockers.

---

## Database (Supabase) — tables & RLS

**🔑 GRANT gotcha:** "auto-expose new tables" is OFF. Every new table needs `grant select,insert,update,delete on table <t> to authenticated;` or writes fail with "permission denied."

- **`profiles`** — id, first_name, last_name, phone, region, boat_ownership, experience_level, created_at, **+ bio, avatar_url, verified** (new). RLS: select `using(true)` (public), insert/update `auth.uid()=id`.
- **`posts`** — TRIP/CATCH/CHECK, conditions, caption, location, duration_hours, distance_km, species, weight_lbs, length_in, released, image_url. RLS: select public, owner ins/upd/del.
- **`likes`**, **`comments`** — select public, owner ins/upd/del. GRANTed.
- **`marinas`** — name, lake, address, phone, amenities text[], featured, latitude, longitude, **image_url, water_alert** (new). RLS: select public, NO write (seeded via SQL). One row: Blue Beacon Marina.
- **`catch_pins`** (Map) — user_id, lat, lng, species, notes, created_at. RLS select public + owner ins/upd/del (with WITH CHECK). **Verify this table's SQL was actually run.**
- **Storage:** bucket `post-images` (public). Post photos AND profile avatars (`avatars/…`) live here.

---

## Key screens / components

- **`Homepage.tsx`** — floating frosted header (NARROWS only; search removed with Explore). Order: weather hero (gradient by condition) → **marina photo hero** (full-bleed `ImageBackground` + dark gradient, reads `marinas.image_url`) → WIND card (live compass) → **Spotlight** promo (orange gradient, "Explore" → Events) → UV/Humidity tiles → Sunrise/Sunset card → This Week. Weather refreshes on tab focus. **Get Directions** → Apple/Google Maps hand-off. Water-alert banner only if `marina.water_alert` set.
- **`lib/weather.ts`** — Open-Meteo, `getWeather(lat,lng)`, 15-min cache, no key.
- **`screens/components/WindCompass.tsx`** — live compass via `expo-sensors`. Rose rotates with phone heading; arrow points where wind is GOING (`windDirection+180-heading`). Approximate.
- **`MapScreen.tsx`** — `react-native-maps` (Apple Maps, dark), live GPS dot, long-press → catch-pin composer, gold markers w/ custom callouts (species/author/timeAgo/"Tap to delete"), satellite toggle.
- **`FeedScreen.tsx`** — Instagram-style: top bar, filter tabs, full-bleed square photos, small bottom-left action icons (anchor like + chat comment), bold-name caption + "View all N comments", pull-to-refresh w/ animated Narrows logo, double-tap-to-like pop animation, empty state.
- **`screens/components/PostComposer.tsx`** — shared create/edit composer. Double-submit guard. Keyboard modal restructured (overlay + spacer + KAV sheet).
- **`screens/components/CommentsModal.tsx`** — bottom-sheet comments.
- **`ProfileScreen.tsx`** — gear → Settings, avatar photo, name + gold ✓ if verified, bio, stats, filter tabs, 3-col posts grid.
- **`screens/SettingsScreen.tsx`** — Edit Profile, Privacy/Terms (placeholder URLs), Log Out, Delete Account (mailto placeholder).
- **`screens/EditProfileScreen.tsx`** — edit name/region/bio + avatar upload.
- **`screens/EventsScreen.tsx`** — "no events yet" (Spotlight target).
- **Keyboard:** all input ScrollViews have `keyboardDismissMode="interactive"` + keyboard avoidance.
- **Legal drafts:** `legal/PRIVACY_POLICY.md`, `legal/TERMS_OF_SERVICE.md` (placeholders to fill; ToS has the safety/navigation disclaimer).

---

## ✅ Done this session
Friendly errors · marina table + weather + Apple-style live compass · comments · **big Home UI overhaul** (palette, floating frosted tab bar + header, marina photo hero, Spotlight, weather gradients) · **Map MVP** (GPS + catch pins + satellite + callouts + delete-own) · **Profile/Settings/EditProfile + photo upload** · **Feed Instagram-ification** · Get Directions hand-off · keyboard swipe-dismiss everywhere · StatusBar fix · removed Explore · legal docs drafted · security audit done (fixes pending).

---

## 🚨 LAUNCH BLOCKERS (do before real users)

1. **Email delivery (DO FIRST).** Resend free tier only delivers to davidobayomi3@gmail.com. **Verify a sending domain in Resend** + update Supabase SMTP `from`. Unblocks BOTH signup OTP **and** forgot-password emails (same SMTP).
2. **Forgot password** — NOT built. Reuses OTP: `resetPasswordForEmail(email)` → recovery email → `verifyOtp({type:'recovery'})` → `updateUser({password})`. Build after email delivery works.
3. **Distribution / EAS build.** Expo Go is dev-only — real users can't use it. Need **EAS Build → TestFlight** (+ **Apple Developer account ~$99/yr**). Biggest non-code gap; also unlocks Apple/Google sign-in + background trip tracking.

---

## 📋 Unfinished actions / SQL to run

**Confirm these were actually run (a missing column breaks the screen's query):**
```sql
alter table profiles add column bio text;
alter table profiles add column avatar_url text;
alter table profiles add column verified boolean default false;
alter table marinas add column image_url text;     -- (likely done — photo shows)
alter table marinas add column water_alert text;    -- null = no banner

-- catch_pins (Map) — VERIFY this ran:
create table catch_pins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  species text, notes text,
  created_at timestamptz default now()
);
alter table catch_pins enable row level security;
create policy "catch pins readable by everyone" on catch_pins for select using (true);
create policy "users insert their own catch pins" on catch_pins for insert with check (auth.uid() = user_id);
create policy "users update their own catch pins" on catch_pins for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users delete their own catch pins" on catch_pins for delete using (auth.uid() = user_id);
grant select, insert, update, delete on table catch_pins to authenticated;
```

**Security fixes (PAUSED — apply before launch):**
```sql
alter policy "users update their own comments" on comments with check (auth.uid() = user_id);
alter policy "Users can update their own posts" on posts with check (auth.uid() = user_id);
alter policy "user can update their own profile" on profiles with check (auth.uid() = id);
alter table profiles drop column phone;             -- world-readable; drop if unused
-- optional hardening (leave marinas public):
alter policy "Anyone can view posts" on posts to authenticated;
alter policy "Anyone can view profiles" on profiles to authenticated;
```

**Legal:** host `legal/PRIVACY_POLICY.md` + `legal/TERMS_OF_SERVICE.md`, fill `[placeholders]`, then update `PRIVACY_URL` / `TERMS_URL` / `SUPPORT_EMAIL` in `screens/SettingsScreen.tsx`. Have a lawyer review.

---

## Roadmap after launch (free unless noted)
- **Bathymetry depth layer** — free Ontario/Canada open data for Simcoe/Couchiching (data-sourcing task, not an API). Avoid paid Navionics/C-MAP.
- **Suggested hotspots** — from bathymetry structure + crowd-sourced `catch_pins` (catch pins = the data engine, already collecting). No buyable API needed.
- **Trip tracking ("Strava for water")** — foreground works in Expo Go (`watchPositionAsync` + haversine + `expo-keep-awake`); end → PostComposer TRIP mode pre-filled. Background needs a dev build.
- **Weather radar animation** — RainViewer (free, no key) animated `<UrlTile>`.
- **Marina accounts** — marina = normal account w/ profile first_name="Blue Beacon Marina" + `verified=true` → posts under its name + ✓ badge.
- **Account deletion** one-tap — needs a Supabase Edge Function (service-role); currently mailto placeholder.
- **Real Search** + **Notifications** (Feed bell is a placeholder; search removed with Explore).
- **Merge login+signup** email-first; **Apple/Google sign-in** (needs dev build).

## Cost posture
Ships for **$0** except: Apple Developer account ($99/yr for distribution), optionally paid bathymetry/weather later. Open-Meteo, RainViewer, Apple Maps (react-native-maps), Supabase free, Resend free — all $0 (Open-Meteo commercial use technically wants a paid plan once monetized).

## Environment notes
- Develop at home (`npx expo start` LAN); `--tunnel` kept timing out. Real distribution = EAS build (deferred).
- Persistent memory files at the project memory dir (`user_profile`, `project_narrows`, `feedback_teaching`, `backend_supabase`, `launch_plan`).
