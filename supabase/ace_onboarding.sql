-- ============================================================================
-- Narrows — "Ace" AI-assisted marina onboarding (Phase C, website)
-- Run via `supabase db query --linked -f`, or Supabase → SQL Editor.
-- Safe to re-run (IF NOT EXISTS / drops before create).
--
-- Ace is a SCRIPTED conversational wizard (marina/apply.html) — no LLM
-- per-question. Once the applicant finishes, ONE Claude API call (the
-- ace-summarize Edge Function) writes a friendly profile summary and
-- extracts amenity suggestions from their free-text answer. Nothing else
-- about marina review changes: David still manually approves every
-- application by linking marinas.profile_id, exactly as before.
--
-- WHY marina_apply_drafts EXISTS
-- The applicant fills out the whole conversation BEFORE we ask for their
-- email (better UX — they see their AI-written summary before committing).
-- But marina_applications.user_id is NOT NULL and RLS requires
-- auth.uid() = user_id, so we can't insert the real application until
-- they're authenticated — which only happens after they click the magic
-- link email, often on a DIFFERENT device/browser than the one they filled
-- the form out on. So their answers are staged here first, keyed by an
-- unguessable token that rides along in the magic link's redirect URL
-- (?draft=<id>) instead of relying on localStorage/sessionStorage, which
-- would silently lose the draft on a cross-device open. apply-confirm.html
-- reads the draft by id once a real session exists, inserts the real
-- application, then deletes the draft row.
-- ============================================================================

create table if not exists public.marina_apply_drafts (
  id          uuid primary key default gen_random_uuid(),
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);

alter table public.marina_apply_drafts enable row level security;

-- The id itself is the unguessable capability (same trust model as a Stripe
-- Checkout session URL or an unlisted share link) — anyone with the id can
-- read/delete it, but there's no way to enumerate ids, and the payload is
-- just the applicant's own not-yet-submitted answers, not account data.
drop policy if exists "anyone can create a draft" on public.marina_apply_drafts;
create policy "anyone can create a draft" on public.marina_apply_drafts
  for insert to anon, authenticated
  with check (true);

drop policy if exists "anyone with the id can read a draft" on public.marina_apply_drafts;
create policy "anyone with the id can read a draft" on public.marina_apply_drafts
  for select to anon, authenticated
  using (true);

drop policy if exists "authenticated can delete a draft after claiming it" on public.marina_apply_drafts;
create policy "authenticated can delete a draft after claiming it" on public.marina_apply_drafts
  for delete to authenticated
  using (true);

-- No scheduled cleanup yet (would need a cron Edge Function) — an
-- unclaimed draft just sits here harmlessly. Known follow-up, not required
-- for launch: delete rows older than ~7 days.

-- ----------------------------------------------------------------------------
-- ai_summary / ai_suggested_amenities on the application — Ace's output,
-- shown to the applicant to edit before they submit, and reviewed by David
-- alongside everything else at approval time. suggested_amenities is never
-- auto-merged into a live listing — David (or the applicant, in the Ace
-- flow itself) has to actually accept them.
-- ----------------------------------------------------------------------------
alter table public.marina_applications add column if not exists ai_summary text;
alter table public.marina_applications add column if not exists ai_suggested_amenities text[];

-- description on the marina itself — where ai_summary ends up once approved.
alter table public.marinas add column if not exists description text;

-- ----------------------------------------------------------------------------
-- Extend the existing provisioning trigger (provision_listings.sql) to also
-- sync ai_summary -> marinas.description on the same profile_id link. This
-- is the SAME function body as provision_listings.sql, plus two additions
-- (marked below) — it's a create-or-replace of the same function, not a
-- separate one, so there's still exactly one trigger doing this work.
--
-- Fix bundled in here since Ace exercises this exact path for every new
-- marina: a marina whose services include 'winterization' got a
-- marina_listings row for it, but marinas.winterization_enabled was never
-- set — and MarinaServicesScreen.tsx in the app gates the "Winterize My
-- Boat" button on that flag specifically (winterization has requestFlow:
-- false, so it never shows via the generic per-listing-type button either).
-- Net effect: a marina that picked winterization had no way to actually be
-- booked for it. Pre-existing gap, not introduced here — fixing it now
-- since any marina Ace onboards would otherwise hit it immediately.
-- ----------------------------------------------------------------------------
create or replace function public.provision_listings_from_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  app_services  text[];
  app_amenities text[];
  app_location  text;
  app_phone     text;
  app_lat       numeric;
  app_lng       numeric;
  app_summary   text;
  svc           text;
begin
  if new.profile_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.profile_id is not distinct from new.profile_id then
    return new;
  end if;

  select services, amenities, location, contact_phone, location_lat, location_lng, ai_summary
    into app_services, app_amenities, app_location, app_phone, app_lat, app_lng, app_summary
    from public.marina_applications
   where user_id = new.profile_id
   order by created_at desc
   limit 1;

  -- ADDED: description = coalesce(app_summary, description)
  if app_location is not null or app_phone is not null or app_amenities is not null
     or app_lat is not null or app_summary is not null then
    update public.marinas
       set address     = coalesce(app_location, address),
           phone       = coalesce(app_phone, phone),
           amenities   = case when app_amenities is not null and array_length(app_amenities, 1) > 0
                               then app_amenities else amenities end,
           latitude    = coalesce(app_lat, latitude),
           longitude   = coalesce(app_lng, longitude),
           description = coalesce(app_summary, description)
     where id = new.id;
  end if;

  if app_services is null then
    return new;
  end if;

  foreach svc in array app_services loop
    insert into public.marina_listings (marina_id, listing_type, name, exclusive, price_unit)
    select
      new.id,
      svc,
      initcap(replace(svc, '_', ' ')),
      svc in ('slip', 'day_slip', 'rental'),
      case svc
        when 'slip'     then 'season'
        when 'day_slip' then 'night'
        when 'rental'   then 'hour'
        else 'flat'
      end
    where not exists (
      select 1 from public.marina_listings
       where marina_id = new.id and listing_type = svc
    );
  end loop;

  -- ADDED: flip the flag the app actually gates the Winterize button on.
  if 'winterization' = any(app_services) then
    update public.marinas set winterization_enabled = true where id = new.id;
  end if;

  return new;
end;
$$;
