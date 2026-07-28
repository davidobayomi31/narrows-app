# Narrows — Security Checklist Status

Worked through 2026-07-28. Code items are done in-repo; **[dashboard]** items need you
to act in the Supabase dashboard. Run `supabase/checklist_hardening.sql` once to apply
the DB-side changes below.

| # | Item | Status | What was done |
|---|------|--------|---------------|
| 1 | Users only access their own data | ✅ + verify | RLS + `WITH CHECK` on all tables. Run the **RLS audit query** at the top of `checklist_hardening.sql` and confirm every public table shows `rls_enabled = true` and no policy is `USING (true)`. |
| 2 | Validate/sanitize inputs | ✅ | Blocklist (`lib/moderation.ts`) + image moderation + `.trim()` already there. Added `maxLength` caps: caption 500, bio 300, region 60, names 50, location 100, catch notes 280, numeric 8. (RN has no HTML/XSS surface; PostgREST parametrizes → no SQLi.) |
| 3 | CORS configured | ✅ | Both Edge Functions set CORS headers. `*` origin is correct for a mobile client (no browser origin). |
| 4 | Rate limiting on all endpoints | ✅ | Auth = Supabase-managed. Table writes: posts/comments/catch_pins (existing) + **added** winterization_requests (30s) and reports (5s) in `checklist_hardening.sql`. Likes intentionally not limited (toggle). |
| 5 | Password reset links expire | **[dashboard]** | OTP-code flow; expiry is a setting. **Verify:** Auth → Providers/Email → OTP expiry ≤ 3600s (1 hr). App already shows a friendly "code expired" message. |
| 6 | Catch unexpected front-end errors | ✅ | Added `<ErrorBoundary>` (wraps whole app, `screens/components/ErrorBoundary.tsx`) + global handler in `App.tsx` for uncaught errors / promise rejections. Both report via `lib/logError.ts`. |
| 7 | Indexing on common DB ops | ✅ | Added indexes for feed sort (`posts.created_at`), `comments(post_id,created_at)`, `likes.post_id`, `notifications(recipient_id,created_at)`, `catch_pins.created_at`. |
| 8 | Alerts when something breaks | ✅ code / **[dashboard]** wire-up | App logs crashes to new `client_errors` table. **You:** Supabase → Database → Webhooks → new webhook on `client_errors` INSERT → send to email/Slack (or point at a Resend function). That's the actual alert. |

## Dashboard actions remaining (only you can do these)

1. **Run** `supabase/checklist_hardening.sql` in the SQL Editor (adds indexes, rate limits, `client_errors`).
2. **Deploy** the new/updated app build (ErrorBoundary + input caps + error logging).
3. **#1 verify:** run the RLS audit query, confirm nothing is unprotected. Turn ON
   Database → "Enable Row Level Security on new tables" so future tables are safe by default.
4. **#5 verify:** Auth → email OTP expiry ≤ 1 hr; enable leaked-password protection + a signup CAPTCHA (Auth → Attack Protection) while you're there.
5. **#8 wire the alert:** Database → Webhooks → on `client_errors` INSERT. Without this, crashes are logged but you won't be *notified*.

## Not a bug, worth knowing
- CORS `*` is fine for the mobile app. Only tighten it if you ever call these Edge Functions from a browser on a known domain.
- The `client_errors` table has no SELECT policy on purpose — read it from the dashboard (service role) only.
