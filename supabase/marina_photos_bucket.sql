-- ============================================================================
-- Narrows — marina photo storage bucket
-- Run this in Supabase → SQL Editor, or `supabase db query --linked -f`.
-- Safe to re-run.
--
-- PUBLIC bucket (mirrors post-images/post-videos) — a marina's hero photo is
-- shown on its profile page to every boater, unauthenticated included.
-- Path convention: {marina_id}/photo.{ext}, one file per marina (portal
-- uploads with upsert:true so a re-upload replaces rather than accumulates).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('marina-photos', 'marina-photos', true, 5242880) -- 5 MB
on conflict (id) do update set public = true, file_size_limit = 5242880;

drop policy if exists "public reads marina photos" on storage.objects;
create policy "public reads marina photos" on storage.objects
  for select
  using (bucket_id = 'marina-photos');

drop policy if exists "marina writes own photo" on storage.objects;
create policy "marina writes own photo" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'marina-photos'
    and exists (
      select 1 from public.marinas m
      where m.id::text = (storage.foldername(name))[1]
        and m.profile_id = (select auth.uid())
    )
  );

drop policy if exists "marina updates own photo" on storage.objects;
create policy "marina updates own photo" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'marina-photos'
    and exists (
      select 1 from public.marinas m
      where m.id::text = (storage.foldername(name))[1]
        and m.profile_id = (select auth.uid())
    )
  );

drop policy if exists "marina deletes own photo" on storage.objects;
create policy "marina deletes own photo" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'marina-photos'
    and exists (
      select 1 from public.marinas m
      where m.id::text = (storage.foldername(name))[1]
        and m.profile_id = (select auth.uid())
    )
  );
