-- ============================================================================
-- Narrows — "Narrows Test Marina" for QA (Phase A testing)
-- Second marina alongside Blue Beacon so both a boater and a marina-owner
-- account can be tested side by side without fighting over one marina's data.
--
-- profile_id is left NULL — there's no real login for this marina yet. To
-- actually manage it (Requests inbox, Messages), sign up as a marina in the
-- app with a second test account, then set this row's profile_id to that
-- account's user_id (same manual-approval step already used for Blue Beacon).
-- ============================================================================

insert into public.marinas (
  id, name, lake, address, phone, amenities,
  latitude, longitude, featured, winterization_enabled
)
select
  gen_random_uuid(),
  'Narrows Test Marina',
  'Lake Simcoe (The Narrows)',
  '250 Test Marina Lane, Orillia ON L3V 0A1',
  '705-555-0100',
  array['Fuel Dock', 'WiFi', 'Showers'],
  44.6110, -79.3720,
  true,
  true
where not exists (select 1 from public.marinas where name = 'Narrows Test Marina');

-- ----------------------------------------------------------------------------
-- Listings — bypasses the normal marina_applications provisioning trigger
-- (there's no application behind this row), so these are created directly.
-- Real prices set (unlike a normal auto-provisioned marina, which starts at
-- null/"contact for pricing") specifically so the rental wizard's estimate
-- and payment amount have something real to work with during QA.
-- ----------------------------------------------------------------------------
insert into public.marina_listings (marina_id, listing_type, name, exclusive, price_unit, price_cents, max_length_ft, power)
select m.id, l.listing_type, l.name, l.exclusive, l.price_unit, l.price_cents, l.max_length_ft, l.power
from public.marinas m
cross join (values
  ('winterization', 'Winterization',        false, 'flat',   35000, null::numeric, null::text),
  ('slip',          'Slip A1',               true,  'season', 250000, 40, '30A'),
  ('storage',       'Covered Storage',       false, 'season', 80000, 35, null),
  ('haul_out',      'Haul-Out Service',      false, 'flat',   15000, null, null),
  ('rental',        'Seadoo GTI #1',         true,  'hour',   4500, null, null),
  ('rental',        'Seadoo GTI #2',         true,  'hour',   4500, null, null)
) as l(listing_type, name, exclusive, price_unit, price_cents, max_length_ft, power)
where m.name = 'Narrows Test Marina'
  and not exists (
    select 1 from public.marina_listings ml
     where ml.marina_id = m.id and ml.listing_type = l.listing_type and ml.name = l.name
  );
