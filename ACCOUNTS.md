# Narrows — Accounts & Services

> Master list of every account/service behind Narrows (app + website).
> Fill in the "Login email" column yourself so you know which email each is under.
> Last updated: June 27, 2026.

## 🟢 Active accounts (signed up, in use)

| Service | What it does for Narrows | Plan / Cost | Key details | Login email |
|---|---|---|---|---|
| **GitHub** | Stores your code (2 repos) | Free | `davidobayomi31/narrows-landing` (website) + narrows-app (app) | |
| **Supabase** | Database, login/auth, file storage | Free | Project `narrows`, ref `pddfyikqpuuuzgqhwjgu`, Canada Central | |
| **Namecheap** | Owns your domain | Paid (yearly) | `narrows.site` | |
| **Netlify** | Hosts the website (auto-deploys on push) | Free | Serves narrows.site from the narrows-landing repo | |
| **Resend** | Sends app emails (OTP codes, password reset) | Free | Sending domain verified via DNS | |
| **ImprovMX** | Forwards your @narrows.site email | Free | `*@narrows.site` → `davidobayomi3@gmail.com` (incl. hello@, support@) | |
| **Loops** | Waitlist / countdown marketing email | Free | Launch email planned July 17 | |
| **Expo (EAS)** | Runs & (later) builds the app | Free tier | The app is built on Expo SDK 54 | |
| **Obsidian** | Your notes / second brain | Free (local) | Connected to Claude Code via a plugin | |

## 🔌 Free APIs used (no real "account" to manage)

| Service | Use | Notes |
|---|---|---|
| **Open-Meteo** | Weather data | Free, no key/account needed |
| **Apple Maps** | The map screen | Comes via Expo; full features need the Apple Developer account |

## 🟡 Coming very soon (not signed up yet)

| Service | Why | Cost | When |
|---|---|---|---|
| **Apple Developer Program** | Required to build & submit to the App Store | $99 / year | Sunday (after you're paid) |
| **Google Play Console** | Required to publish on Android | $25 one-time | Sunday |

## ⚪ Considered but NOT signed up (future / optional)

| Service | For | Status |
|---|---|---|
| **Cloudflare** | Extra rate-limiting/DDoS protection | Only if ever needed |
| **RainViewer** | Weather radar layer | Post-launch roadmap |
| **AWS Rekognition** | Image/nudity moderation | Post-launch (cheap at low volume) |
| **Ontario Business Name registration** | Show "Narrows" as the App Store seller | Optional, ~$60 |

## 📧 Emails in play
- `davidobayomi3@gmail.com` — where all @narrows.site mail forwards (ImprovMX target); Resend test address
- `david3obayomi@gmail.com` — your general account email
- `support@narrows.site` — public contact (forwards to gmail)
- `hello@narrows.site` — website contact (forwards to gmail)

## 🔑 Security reminders
- Turn on **2-factor authentication** on GitHub, Supabase, Namecheap, and your Apple/Google accounts especially — those are the "keys to the kingdom."
- Namecheap (domain) + GitHub (code) + Supabase (data) are the three you most don't want to lose access to.
- Consider a **password manager** (e.g. Apple Passwords, Bitwarden free) to hold all these logins in one place.
