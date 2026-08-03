-- ============================================================================
-- Narrows — auto-provision listings from a marina's picked services (Phase A2)
-- Run via `supabase db query --linked -f`, or Supabase → SQL Editor.
-- Safe to re-run (drops before create).
--
-- WHY THIS EXISTS
-- MarinaOnboardingScreen now asks a marina which services it offers
-- (marina_applications.services). Approving a marina is still a manual step
-- (David sets marinas.profile_id to link the applicant), but the moment that
-- link is made, this trigger reads that application's services and creates
-- one marina_listings row per service — so a boater sees a "Book X" button
-- for exactly what the marina picked, with zero extra manual SQL.
--
-- KNOWN LIMITATION, on purpose for now: this creates ONE listing per
-- exclusive service (one "Slip" row, not 40 individual slip rows). That one
-- row is enough to make the button appear and the flow bookable end-to-end,
-- but it means only ONE booking can hold that service at a time until a
-- marina (or David) adds more rows manually, or the website listings editor
-- (Phase B) exists to self-serve that. Not a bug — a deliberate placeholder
-- matching how far the listings-management UI has been built so far.
--
-- ALSO syncs marinas.address / phone / amenities from the application the
-- moment profile_id is linked — previously David had to retype these by hand
-- into the marinas row, which is exactly how a marina's real submitted
-- address and amenities ended up never showing in the app (the marinas row
-- kept whatever placeholder was there when David first created it). This
-- only fires on the profile_id link itself (see guard below), so it never
-- touches an already-linked marina whose data was hand-edited afterward.
-- marinas.name is intentionally NOT synced — David may rename on approval
-- (e.g. adding "Marina" / fixing capitalization) and a relink shouldn't undo that.
-- ============================================================================

alter table public.marina_applications add column if not exists amenities text[] not null default '{}';
-- set by lib/geocode.ts's verifyAddress() at onboarding time — the location
-- text is now Nominatim-verified, so its coordinates are real too, and can
-- seed marinas.latitude/longitude on link (previously always manual).
alter table public.marina_applications add column if not exists location_lat numeric;
alter table public.marina_applications add column if not exists location_lng numeric;

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
  svc           text;
begin
  if new.profile_id is null then
    return new;
  end if;

  -- only act when profile_id actually changed (or this is a brand new row
  -- that already has one set) — an unrelated update to the marina shouldn't
  -- re-run this every time.
  if tg_op = 'UPDATE' and old.profile_id is not distinct from new.profile_id then
    return new;
  end if;

  select services, amenities, location, contact_phone, location_lat, location_lng
    into app_services, app_amenities, app_location, app_phone, app_lat, app_lng
    from public.marina_applications
   where user_id = new.profile_id
   order by created_at desc
   limit 1;

  if app_location is not null or app_phone is not null or app_amenities is not null or app_lat is not null then
    update public.marinas
       set address   = coalesce(app_location, address),
           phone     = coalesce(app_phone, phone),
           amenities = case when app_amenities is not null and array_length(app_amenities, 1) > 0
                             then app_amenities else amenities end,
           latitude  = coalesce(app_lat, latitude),
           longitude = coalesce(app_lng, longitude)
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

  return new;
end;
$$;

drop trigger if exists marinas_provision_from_application on public.marinas;
create trigger marinas_provision_from_application
  after insert or update of profile_id on public.marinas
  for each row execute function public.provision_listings_from_application();

-- catch up any marina that was already linked (profile_id set) before this
-- trigger existed, e.g. Blue Beacon. Done as a direct backfill, NOT by faking
-- an UPDATE to re-fire the trigger above — the trigger's own guard (skip if
-- profile_id didn't change) would make that a no-op against itself.
do $$
declare
  m            record;
  app_services text[];
  svc          text;
begin
  for m in select id, profile_id from public.marinas where profile_id is not null loop
    select services into app_services
      from public.marina_applications
     where user_id = m.profile_id
     order by created_at desc
     limit 1;

    if app_services is null then
      continue;
    end if;

    foreach svc in array app_services loop
      insert into public.marina_listings (marina_id, listing_type, name, exclusive, price_unit)
      select
        m.id,
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
         where marina_id = m.id and listing_type = svc
      );
    end loop;
  end loop;
end $$;
