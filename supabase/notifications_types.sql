-- ============================================================================
-- Narrows — widen notifications.type
-- Run this in Supabase → SQL Editor, or `supabase db query --linked -f`.
-- Safe to re-run.
--
-- BUG FIXED (found 2026-07-31): the `notifications` table (created directly
-- in the dashboard, before this repo tracked its schema -- see
-- security_setup.sql, which only adds an index on it) had a CHECK constraint
-- limiting `type` to 'like'/'comment' only. Every winterization notification
-- insert (new request -> marina, approved/declined -> boater, in
-- WinterizeRequestModal.tsx / MarinaRequestsScreen.tsx) has been silently
-- REJECTED by this constraint since winterization shipped -- the inserts
-- never checked their own error, so nobody noticed. Confirmed live: the
-- table was completely empty despite documented end-to-end testing of the
-- request -> approve flow. This widens it to the types the app actually
-- uses, including 'message' for the new boater<->marina DM feature.
-- ============================================================================

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array['like'::text, 'comment'::text, 'winterization'::text, 'message'::text]));
