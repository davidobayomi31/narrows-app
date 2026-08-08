-- ============================================================================
-- Narrows — merchandise product photo storage bucket
-- Run this in Supabase → SQL Editor, or `supabase db query --linked -f`.
-- Safe to re-run.
--
-- PUBLIC bucket (mirrors marina-photos) — product photos are shown in the
-- app's Shop section to every boater, unauthenticated included.
-- Path convention: {marina_id}/{product_id}/{timestamp}-{filename} — a
-- product can have several photos (merch_products.photos text[]), unlike the
-- one-per-marina marina-photos bucket.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('merch-photos', 'merch-photos', true, 5242880) -- 5 MB
on conflict (id) do update set public = true, file_size_limit = 5242880;

drop policy if exists "public reads merch photos" on storage.objects;
create policy "public reads merch photos" on storage.objects
  for select
  using (bucket_id = 'merch-photos');

drop policy if exists "marina writes own merch photos" on storage.objects;
create policy "marina writes own merch photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'merch-photos'
    and exists (
      select 1 from public.marinas m
      where m.id::text = (storage.foldername(name))[1]
        and m.profile_id = (select auth.uid())
    )
  );

drop policy if exists "marina deletes own merch photos" on storage.objects;
create policy "marina deletes own merch photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'merch-photos'
    and exists (
      select 1 from public.marinas m
      where m.id::text = (storage.foldername(name))[1]
        and m.profile_id = (select auth.uid())
    )
  );
