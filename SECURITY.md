# Narrows — Security, Scaling & Legal Hardening

> Research + audit completed June 2026, before App Store / Play submission.
> Sources are linked at the bottom. Items are tagged:
> 🔴 **LAUNCH BLOCKER** (app gets rejected or you get exposed) · 🟡 **Important** · 🟢 **Post-launch**
> and by owner: **[code]** = in-app (Claude can do) · **[dashboard]** = Supabase/Apple dashboard (David) · **[legal]** = hosted doc on narrows.site.

---

## 0. Current posture (audit result)

**Good already:**
- Client uses only the Supabase **publishable (anon) key** — no `service_role` key anywhere in the app. ✅ (This is the #1 cause of real Supabase breaches — see CVE-2025-48757.)
- RLS is on for the core tables with `WITH CHECK` tightening done last session (profiles, posts, likes, comments, catch_pins).
- Text moderation blocklist exists (`lib/moderation.ts`) on posts + comments.
- Privacy Policy + Terms of Service are live and hosted.

**Critical gaps found:**
| Gap | Why it matters | Tag |
|---|---|---|
| **No in-app account deletion** | Apple Guideline **5.1.1(v)** — REQUIRED since 2022 for any app with accounts. Was removed last session → **guaranteed rejection.** | 🔴 |
| **No "Report content" mechanism** | Apple Guideline **1.2** — UGC apps MUST let users report objectionable posts/comments. | 🔴 |
| **No "Block user" mechanism** | Apple Guideline **1.2** — UGC apps MUST let users block abusive accounts. | 🔴 |
| **No EULA / zero-tolerance UGC terms** | Apple 1.2 requires terms stating there's no tolerance for objectionable content/abuse, agreed to at signup. | 🔴 |
| **No copyright/DMCA takedown policy** | Without a notice-and-takedown process you lose DMCA safe-harbor → you are personally liable for users' infringing photos. | 🟡 |
| **No age gate** | Apple 1.2.1 now requires age-restriction on UGC apps; min age 13 is stated in ToS but never enforced at signup. | 🟡 |
| **No app-level rate limiting** | A script with a logged-in token could spam posts/pins/comments. Supabase auth endpoints are rate-limited; your *data* writes are not. | 🟡 |
| **No bundle identifier set** | `app.json` has no iOS `bundleIdentifier` / Android `package` — required before any build. | 🟡 |

---

## 1. App Store / Play UGC compliance (🔴 these block launch)

Apple reviews social apps hard against **Guideline 1.2 (Safety → User-Generated Content)**. To pass you must ship ALL of:

1. **A method to filter objectionable material** — partially done (text blocklist). Image moderation is deferred (manual review fallback is acceptable to Apple if reporting exists).
2. **A mechanism to report content** — ❌ build this. *(see §4 build plan)*
3. **A mechanism to block abusive users** — ❌ build this.
4. **A way to act on reports** — you must remove flagged content and ejecting offenders, within ~24h. A simple admin step (you, querying the `reports` table) is fine at launch scale.
5. **Published developer contact** — ✅ `support@narrows.site`.
6. **EULA with zero-tolerance terms**, agreed at signup — ❌ add. Apple accepts either their standard EULA or your own; your ToS must include the no-tolerance-for-objectionable-content + no-abusive-users clauses.

Plus **5.1.1(v): in-app account deletion** — ❌ build. Must delete the account *and* personal data, not just deactivate. Cannot be email-only.

---

## 2. Supabase security hardening

### 2.1 RLS — the #1 risk (CVE-2025-48757 pattern) **[dashboard]**
- Verify **every** table has RLS *enabled* (not just policies written). A table with RLS off is fully readable/writable by anyone holding the publishable key.
- Audit each table for a lazy `USING (true)` policy — that's effectively "public," same as no RLS for reads.
- Tables to re-verify: `profiles, posts, likes, comments, catch_pins, marinas, notifications` + any new `reports`/`blocked_users`.
- Turn ON the project toggle **Database → "Enable RLS on new tables"** so future tables aren't born insecure.

### 2.2 Performance/scaling of RLS **[dashboard]**
- Add an index on every column used in a policy's `auth.uid() = <col>` check (e.g. `posts.user_id`, `catch_pins.user_id`, `notifications.recipient_id`, `likes.user_id`, `comments.user_id`). 100×+ speedup at scale.
- Wrap `auth.uid()` in a subselect in policies — `(select auth.uid())` — so Postgres caches it per-statement instead of per-row.

### 2.3 Auth & attack protection **[dashboard]**
- **Authentication → Attack Protection**: enable leaked-password protection + CAPTCHA (hCaptcha/Turnstile) on signup to stop bot signups burning your Resend quota.
- **Authentication → Rate Limits**: confirm sane limits (custom-SMTP default is 30 new users/hr — fine now, but know it's there if signups spike at launch).
- Set a minimum password length/strength in Auth settings.

### 2.4 Storage hardening (`post-images` bucket) **[dashboard + code]**
- Bucket is **public** (fine for read), but verify the **upload (INSERT) policy** is restricted to `authenticated` only — otherwise anyone with the anon key can fill your storage.
- Set a **file size limit** + allowed MIME types on the bucket (e.g. ≤5 MB, image/jpeg + image/png). Right now `PostComposer` uploads any file the picker returns with no size cap.
- Consider per-user folders (`{user_id}/...`) so a storage policy can scope writes to the owner.

### 2.5 Secrets **[dashboard]**
- `service_role` key must NEVER ship in the app. (Confirmed clean today — keep it that way; any "admin" work goes in an Edge Function.)
- Enable **SSL enforcement** (Database settings).
- Network restrictions are impractical for a mobile app (clients have random IPs) — skip.

---

## 3. App-level rate limiting & abuse **[dashboard/code]**

Supabase rate-limits *auth* endpoints, not your table writes. A logged-in token can spam. Defenses, cheapest first:
1. **DB triggers** that reject inserts above a threshold (e.g. >N posts/min per `user_id`) — a `BEFORE INSERT` trigger counting recent rows. Free, runs in Postgres.
2. **Report + block** (below) handle the social-abuse side.
3. **Edge Function gateway** for writes if you ever need true token-bucket limiting (post-launch; adds latency).
4. **Cloudflare** in front (post-launch, only if abused).

At launch scale (Orillia, small user base) a simple per-user "max 1 post / 10s" trigger + report/block is plenty.

---

## 4. Build plan — in-app code (what Claude implements)

Each needs a paired Supabase table/function you create (SQL provided when we build it):

- **A. Account deletion** 🔴 — Settings → "Delete Account" (confirm dialog → typed confirmation). Real deletion of the `auth.users` row needs admin rights, so it calls a **Supabase Edge Function** (`delete-account`) that uses the service role server-side to delete the user + cascade their rows. Client UI + function code from Claude; you deploy the function + set the secret.
- **B. Report content** 🔴 — long-press / "⋯" on each post & comment → "Report" → reason picker → insert into a new `reports` table. You review that table.
- **C. Block user** 🔴 — "⋯" on a post/profile → "Block" → insert into `blocked_users`; Feed/Map/Comments queries filter out blocked authors both ways.
- **D. Age gate** 🟡 — date-of-birth (or 13+ confirm) step at signup; reject under-13.
- **E. Rate-limit trigger** 🟡 — SQL trigger on `posts`/`catch_pins`/`comments`.
- **F. Storage size cap** 🟡 — client-side check in `PostComposer` before upload + bucket-level limit.
- **G. app.json** 🟡 — add `ios.bundleIdentifier` + `android.package` + background-location usage strings (for when tracking ships).

---

## 5. Legal documents needed **[legal — hosted on narrows.site]**

You have Privacy + Terms. For a UGC social app you also need:

- **Community Guidelines / Acceptable Use Policy** 🔴 — defines "objectionable content," prohibits harassment/abuse, states zero tolerance + consequences (content removal, bans). Required language for Apple 1.2.
- **EULA** 🔴 — either adopt Apple's standard EULA (link it) or host your own; must include the UGC zero-tolerance clause. ToS can absorb this.
- **Copyright / DMCA Policy** 🟡 — notice-and-takedown instructions, designated agent contact (`support@narrows.site`), counter-notice process, repeat-infringer policy. Preserves your safe-harbor.
- **Privacy Policy updates** 🟡 — confirm it covers, for **PIPEDA (Canada)** + **Quebec Law 25**: what you collect (incl. **precise GPS location**, photos), purpose, consent, retention, how to request access/correction/**deletion**, breach contact, and that you store data with Supabase (note region — your project is Canada Central, which is good for data-residency). Law 25 wants *express* consent for location tracking — make the location permission prompt purpose-specific (already is).
- **Children:** state 13+ and that you don't knowingly collect from under-13 (COPPA-style, good practice even in Canada).

---

## 6. Scaling notes (free tier → growth)

- **Free tier ceilings:** 500MB DB, 1GB storage, 2GB egress/mo, 50K MAU auth, project pauses after 7 days inactivity. Fine for Orillia launch; watch storage (photos) first.
- **Indexes** (see §2.2) are the single biggest scaling lever.
- **Images:** consider downscaling on-device before upload (you already pass `quality: 0.7`) and/or Supabase image transformations to serve smaller variants — saves egress.
- **N+1 queries:** `FeedScreen`/`MapScreen` fetch all profiles then merge client-side — fine now, switch to a Postgres view or `select(..., author:profiles(...))` join as data grows.
- **Connection pooling:** the JS client uses PostgREST (stateless HTTP) so no pooling concern; if you add Edge Functions hitting Postgres directly, use the pooler URL.
- **Monitoring:** turn on Supabase log drains / check the dashboard's API & DB usage graphs weekly post-launch.

---

## Sources
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple account deletion (5.1.1(v)): https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Supabase production checklist: https://supabase.com/docs/guides/deployment/going-into-prod
- Supabase RLS performance: https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv
- CVE-2025-48757 (Supabase RLS exposure, 170+ apps): https://mattpalmer.io/posts/2025/05/CVE-2025-48757/
- PIPEDA in brief (Privacy Commissioner of Canada): https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/pipeda_brief/
- Quebec Law 25 overview: https://www.onetrust.com/blog/quebecs-law-25-what-is-it-and-what-do-you-need-to-know/
- DMCA / U.S. Copyright Office: https://www.copyright.gov/dmca/
