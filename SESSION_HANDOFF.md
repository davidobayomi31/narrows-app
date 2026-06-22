# Narrows — Session Handoff

> Paste this into a new chat to continue. Covers project state, how to work with David, and mistakes made early so they aren't repeated.

---

## ⚠️ How to work with David (read first)

- **Teaching mode.** David is *learning* React Native. Default behavior: **explain the logic + give the code snippet + show exactly where it goes, and let HIM type it.** Do NOT auto-edit files unless he explicitly says "go in and fix it" / "do it yourself."
- Early in the session the assistant repeatedly auto-wrote whole files when David wanted to type and learn. He pushed back hard: *"don't ever just go into VS Code and change it up unless I specifically tell you to."* Respect this. He'll say when he wants you to edit directly (and he often does for big/tedious refactors).
- He pastes **screenshots of errors** constantly — diagnose from those.
- **Expo SDK 54 — never upgrade.** His phone runs Expo Go 54. Read the versioned docs (`docs.expo.dev/versions/v54.0.0`) before writing SDK code.
- **Test email:** sign-up tests MUST use **davidobayomi3@gmail.com** (see Resend note below).

## 🐞 The main early mistake (David's #1 correction — do not repeat)

**The assistant kept editing the code directly / writing whole files instead of teaching.** David had to explicitly tell it, more than once, to **STOP editing the code itself without permission**, and instead to **send snippets of the code and say exactly where to add them** so he could type it and learn. This is the single most important behavior for the new chat:

> Default = **explain the logic + give the code snippet + point to the exact file and location → David types it himself.**
> Only edit files directly when David explicitly says "go in and fix it / do it yourself."

Other smaller errors that happened along the way (mostly from editing carelessly — another reason to default to snippets):
- **Read-window blind spot:** read only lines 1–16 of a file, missed an import on line 17, added a **duplicate `import * as ImagePicker`** → "already declared."
- **Bulk find-and-replace collateral:** a `replace_all` turned `[firstNameError, setFristNameError]` into `[setFirstNameError, setFirstNameError]` (duplicate identifier).
- **Dropped closing braces** in partial snippet replacements for `handlePost` (twice) → component `return` trapped inside the function.
- **Stray characters** (`},f` in a stylesheet, a missing `</View>`). Always re-read after any edit.

---

## Project

**Narrows** — marina/waterway navigation **social app** for Simcoe County, Ontario. React Native + Expo SDK 54 (blank-typescript template). Monetization: ads using onboarding data.

**Brand:** bg `#000000`, gold `#C9A84C`, cream `#F5F0E8`, navy `#1B2A3B`. Logo: `assets/narrows-logo-clear.png`.

## Tech stack

Expo ~54 · React Native 0.81 · TypeScript · `@react-navigation` (native-stack + bottom-tabs) · Supabase (`@supabase/supabase-js` + `@react-native-async-storage/async-storage`) · `expo-image-picker` · `expo-local-authentication` · `react-native-safe-area-context`.

## Navigation

Stack: **Splash → Login → Signup → ConfirmEmail → Onboarding → Home**, where `Home` = **MainTabs** (bottom tabs: **Home / Feed / Map / Explore / Profile**). Screens in `screens/`; `MainTabs` in `screens/navigation/`.

---

## Auth (WORKING ✅)

- Supabase project `narrows`, ref `pddfyikqpuuuzgqhwjgu`, region Canada Central, **free plan**.
- `lib/supabase.ts`: `createClient` + AsyncStorage, `persistSession:true`, `detectSessionInUrl:false`. Anon (publishable) key lives in the file.
- **Signup:** `signUp({ email, password, options:{ data:{ first_name, last_name } } })` → navigates to `ConfirmEmail` with `{ email }` route param.
- **Email confirm = 8-digit OTP** (NOT magic link). `verifyOtp({ email, token, type:'signup' })`. ConfirmEmail screen expects **8 digits**.
- **Login:** `signInWithPassword`. **Logout:** `signOut()` (Profile). **Session:** SplashScreen `getSession()` — *local only*; deleting a user in the dashboard does NOT log the app out (use Log Out, which clears AsyncStorage).
- **Resend = custom SMTP** for the OTP email: host `smtp.resend.com`, port 465, user `resend`, password = Resend API key, from `onboarding@resend.dev`. **Free tier only delivers to the Resend account email = davidobayomi3@gmail.com → test signups with that email only.** Edited the "Confirm signup" template to use `{{ .Token }}`. (Template editing requires custom SMTP enabled.)

---

## Database

**🔑 GRANT gotcha:** project was created with "Automatically expose new tables" **OFF**. Every new table needs `grant select,insert,update,delete on table <t> to authenticated;` or writes fail with **"permission denied for table"**. All SQL written directly in the Supabase **SQL Editor** (GitHub migration integration skipped).

**`profiles`** — `id uuid PK refs auth.users on delete cascade`, `first_name`, `last_name`, `phone`, `region`, `boat_ownership`, `experience_level`, `created_at`.
RLS: **select = public** (`using (true)` — changed from own-only so the feed can show other users' names), insert/update `auth.uid() = id`. No delete (account delete cascades). Onboarding upserts `boat_ownership/region/experience_level` and reads names from `user.user_metadata`.

**`posts`** — `id`, `user_id`, `type` (TRIP/CATCH/CHECK), `conditions` (GREAT/MIXED/ROUGH), `caption`, `created_at`, `location`, `duration_hours`, `distance_km`, `species`, `weight_lbs`, `length_in`, `released`, `image_url`. All nullable; each type fills only its own columns.
RLS: select `using (true)`, insert/update/delete `auth.uid() = user_id`. GRANTed.

**`likes`** — wired (⚓ toggle + count in feed). *Verify exact schema in DB.*

**Storage:** bucket `post-images` (public) + insert policy for authenticated. Upload pattern (verified for Expo): `fetch(uri).then(r=>r.arrayBuffer())` → `storage.from('post-images').upload(path, arraybuffer, {contentType})` → `getPublicUrl`.

---

## Key files / components

- **`screens/components/PostComposer.tsx`** — SHARED composer used for both **create** (Feed) and **edit** (Profile). Props: `visible / onClose / onSaved / editingPost`. No `editingPost` = INSERT; with `editingPost` = UPDATE, form pre-filled via `useEffect` (numbers→String, reverse TYPE_MAP via LABEL_MAP). Image only re-uploads if `imageUri` is a new local file (not `startsWith('http')`). Per-type fields. Photo via image-picker (**camera OR library** via `Alert` menu), trash icon to remove, tap preview → full-screen viewer. **Composer keyboard-scroll bug = FIXED.**
- **`FeedScreen.tsx`** — all posts newest-first; profile names **merged in JS** (two queries, no FK join). Floating gold **"+" FAB** → PostComposer in create mode. Per-type **gold detail line** above caption (Trip: ⏱h/📍km/where/conditions; Catch: 🎣species; Check-in: 📍location). Likes (⚓ + count).
- **`ProfileScreen.tsx`** — user's OWN posts (`.eq('user_id', user.id)`). **Long-press a post → Alert menu (Edit / Delete).** Edit → `setEditingPost` → opens PostComposer in edit mode. **Stats are REAL** — computed from `myPosts` (Trip/Catch counts via `.filter().length`, Km/Hours via `.reduce()`), refreshed on tab focus via **`useFocusEffect`**.
- **`Homepage.tsx` / `MapScreen.tsx` / `ExploreScreen.tsx`** — still **hardcoded placeholder data**.

**Catch fields:** David asked to trim Catch to **species only** (remove weight/length/spot). *Verify whether this is reflected in PostComposer.*

---

## Roadmap / what's next (in suggested order)

1. **Friendly error messages** — replace the raw `alert(error.message)` / response-object dumps.
2. **Forgot password** — `resetPasswordForEmail(email)` → recovery email → `verifyOtp({type:'recovery'})` → `updateUser({password})`. Easy, reuses the OTP pattern.
3. **Merge login + signup into an email-first flow** — one screen: enter email → "Continue" → if account exists, prompt password (login); else go to signup (first/last name + onboarding Qs). **Email must be pre-filled when moving login→signup** (route params). Checking if the email exists needs a **Postgres RPC `email_exists(email)` (security definer on `auth.users`)** because Supabase hides email-enumeration; call via `supabase.rpc('email_exists', ...)`.
4. **Comments** — new `comments` table, same RLS pattern as posts/likes.
5. **Real marina data** — a `marinas` table to replace hardcoded Homepage/Explore content.
6. **Apple + Google sign-in** — `signInWithOAuth` (Google) / `expo-apple-authentication` (Apple). ⚠️ **Generally do NOT work in Expo Go — need an EAS dev build** + provider setup (Google Cloud OAuth client; Apple Developer account ~$99/yr). Heaviest item, deferred.
7. **Profile photo upload** — reuse the `post-images` Storage flow.

## Environment notes

- **Working away from home:** plain `npx expo start` (LAN) only works on home wifi. `--tunnel` (ngrok) kept **timing out** for David. For now: develop at home. The robust "work anywhere" fix is an EAS **development build** (also a prerequisite for #6 OAuth) — deferred.
- Persistent memory files exist at the project memory dir (`user_profile`, `project_narrows`, `feedback_teaching`, `backend_supabase`) and already capture most of this.
