# Narrows — Accounts, Tools & Services

> Master list of every account/service/tool behind Narrows (app + website).
> Fill in the "Login email" column yourself so you know which email each is under.
> Last updated: July 15, 2026.
> **Reuse this doc as a checklist next time you build an app from scratch** — see the "Build order" section at the bottom.

## 🟢 Active accounts — PAID

| Service | What it does | Cost | Key details | Login email |
|---|---|---|---|---|
| **Apple Developer Program** | Required to build/submit to App Store, Sign in with Apple, push certs | $99/yr | Individual, Team `YK5Q9B4A38`, Apple ID `David25obayomi@gmail.com` | |
| **Namecheap** | Owns the domain | Paid yearly | `narrows.site` | |

## 🟢 Active accounts — FREE

| Service | What it does | Plan | Key details | Login email |
|---|---|---|---|---|
| **GitHub** | Stores the code (2 repos) | Free | `narrows-app` (app) + `davidobayomi31/narrows-landing` (website) | |
| **Supabase** | Database, auth, file storage, Edge Functions | Free | Project `narrows`, ref `pddfyikqpuuuzgqhwjgu`, Canada Central | |
| **Netlify** | Hosts the website, auto-deploys on push | Free | Serves narrows.site from narrows-landing repo | |
| **Resend** | Sends app emails (OTP, password reset) — used as custom SMTP for Supabase | Free | `smtp.resend.com`; free test sender only delivers to one verified address until a domain is verified | |
| **ImprovMX** | Forwards `@narrows.site` email | Free | `*@narrows.site` → `davidobayomi3@gmail.com` (incl. hello@, support@) | |
| **Loops** | Waitlist / countdown marketing email | Free | Launch email sent ~July 17 | |
| **Expo (EAS)** | Runs, builds, and OTA-updates the app; push notification relay | Free tier | Expo account `david_obayom1`, SDK 54 | |
| **Google Cloud Console** | OAuth client for Sign in with Google | Free | Project "Narrows" — Web OAuth client + iOS OAuth client (bundle `site.narrows.app`); Android client deferred until an EAS build gives a SHA-1 | |
| **Obsidian** | Notes / second brain, connected to Claude Code via MCP plugin | Free (local) | Only live while the Obsidian app is open (localhost MCP server) | |
| **Claude Code** | AI pair-programmer used to build the whole app + this doc | Depends on your Claude plan | The actual dev tool driving all of this | |

## 🔌 Free APIs used (no real "account" to manage)

| Service | Use | Notes |
|---|---|---|
| **Open-Meteo** | Weather data | Free, no key/account needed |
| **Apple Maps** | The map screen | Comes via Expo/react-native-maps; full features need the Apple Developer account |
| **Expo push API** (`exp.host`) | Sending push notifications | Free, used via Expo push tokens |

## 🟡 In progress / gated next steps

| Service | Why | Cost | Status |
|---|---|---|---|
| **Google Play Console** | Required to publish on Android | $25 one-time | Not yet signed up — needs 14-day closed testing w/ 12+ simultaneous testers once created |
| **TestFlight** (part of Apple Developer) | Internal beta testing before App Store submit | Included in Apple Dev fee | Not started yet |

## ⚪ Considered but NOT signed up (future / optional)

| Service | For | Status |
|---|---|---|
| **Cloudflare** | Extra rate-limiting/DDoS protection | Only if ever needed |
| **RainViewer** | Weather radar layer | Post-launch roadmap |
| **AWS Rekognition** | Image/nudity moderation | Post-launch (cheap at low volume) |
| **Ontario Business Name registration** | Show "Narrows" as the App Store seller instead of a personal name | Optional, ~$60 |

## 📧 Emails in play
- `davidobayomi3@gmail.com` — where all @narrows.site mail forwards (ImprovMX target); Resend test address
- `david3obayomi@gmail.com` — general account email
- `David25obayomi@gmail.com` — Apple Developer account
- `support@narrows.site` / `hello@narrows.site` — public contact addresses, forward to gmail

## 🧰 Dev environment / tooling (not "accounts" but part of the toolchain)
- **React Native + Expo SDK 54** (blank-typescript template) — the app framework
- **Expo Go** (device app, v54.0.2) — used for fast iteration before a native dev build existed
- **EAS Build** — cloud builds for anything needing native code (Apple/Google sign-in, push, CocoaPods) since this Mac only has Xcode Command Line Tools, not full Xcode
- **TypeScript** — `npx tsc --noEmit` as the standing correctness check after every change
- **Key npm packages**: `@supabase/supabase-js`, `@react-navigation/*`, `expo-image-picker`, `expo-location`, `react-native-maps`, `expo-sensors`, `expo-notifications`, `expo-apple-authentication`, `@react-native-google-signin/google-signin`, `expo-build-properties`

## 🔑 Security reminders
- Turn on **2-factor authentication** on GitHub, Supabase, Namecheap, Apple ID, and Google Cloud especially — those are the "keys to the kingdom."
- Namecheap (domain) + GitHub (code) + Supabase (data) + Apple Developer (App Store presence) are the accounts you most don't want to lose access to.
- Use a password manager (Apple Passwords, Bitwarden free) to hold all these logins in one place.

## 🗺️ Build order (for next time you start a project like this)
1. **Framework**: `npx create-expo-app` → pick a stable SDK version and pin it; read that SDK's *versioned* docs, not the latest.
2. **Backend**: Supabase free tier for DB + auth + storage + Edge Functions — covers almost everything a small social/utility app needs without standing up your own server.
3. **Email delivery**: Resend free tier as custom SMTP in Supabase Auth — needed the moment you enable email confirmation/OTP.
4. **Domain + website**: Namecheap for the domain, Netlify for free static hosting/auto-deploy, ImprovMX for free email forwarding on that domain.
5. **Legal pages early**: privacy policy, terms (with UGC clause if user content), community guidelines — required before Apple review, easiest to write once and host as static HTML on the same Netlify site.
6. **Native features gate**: Apple Developer Program ($99/yr) unlocks Sign in with Apple, push certs, and TestFlight — budget for this once you're past prototyping. Google Play Console ($25 one-time) similarly gates Android release, with its own 14-day closed-testing clock.
7. **OAuth providers**: Google Cloud Console project for Sign in with Google (web + iOS OAuth clients; Android client needs an EAS build's SHA-1).
8. **Push notifications**: `expo-notifications` + a `push_tokens` table + an Edge Function/DB trigger to actually send at the right moment (device registration alone isn't enough).
9. **Marketing**: Loops (or similar) free tier for a waitlist/launch email is enough pre-launch.
10. **Notes**: Obsidian + an MCP plugin if you want a human-readable running log next to the code, separate from chat history.
