-- ============================================================================
-- Narrows — video posts support.
-- Run this in Supabase → SQL Editor. Safe to re-run (uses IF NOT EXISTS / drops).
-- Creates: post-videos storage bucket + RLS, adds posts.video_url column.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. posts.video_url — a post has either an image OR a video, never both.
--    App-side (PostComposer) already enforces this; no DB check needed.
-- ----------------------------------------------------------------------------
alter table public.posts add column if not exists video_url text;


-- ----------------------------------------------------------------------------
-- 2. post-videos bucket — public read (feed needs to play it for anyone),
--    50 MB cap matches the app's client-side 15-second recording limit.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('post-videos', 'post-videos', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = 52428800;

drop policy if exists "public read post-videos" on storage.objects;
create policy "public read post-videos" on storage.objects
  for select to public
  using (bucket_id = 'post-videos');

drop policy if exists "authenticated upload post-videos" on storage.objects;
create policy "authenticated upload post-videos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'post-videos');
