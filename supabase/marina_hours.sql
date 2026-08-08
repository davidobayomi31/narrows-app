-- ============================================================================
-- Narrows — marina hours of operation
-- Run via `supabase db query --linked -f`, or Supabase → SQL Editor.
-- Safe to re-run (add column if not exists).
--
-- Shape: { mon: {open:"08:00", close:"18:00", closed:false}, tue: {...}, ...,
--          sun: {...} }. Keys are 3-letter lowercase weekday abbreviations.
-- null (the default) means "not set yet" — the app treats that as always-open
-- so existing marinas that haven't filled this in don't suddenly get boaters
-- blocked from booking. No new RLS/GRANT needed: `marinas` is already public-
-- select / owner-update via "marina updates own profile"
-- (marina_profile_edit.sql), exactly like description/amenities today.
-- ============================================================================

alter table public.marinas add column if not exists hours jsonb;
