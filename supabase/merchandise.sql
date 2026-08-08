-- ============================================================================
-- Narrows — marina merchandise (products + orders)
-- Run this in Supabase → SQL Editor, or `supabase db query --linked -f`.
-- Safe to re-run (IF NOT EXISTS / drops before create).
--
-- Deliberately its own tables, not folded into bookings/marina_listings —
-- those model a date/time-exclusive BOOKABLE UNIT ("three identical seadoos
-- = three rows," no quantity concept at all), which doesn't fit a retail SKU
-- with a stock count. Fulfillment is pickup-at-marina or ship-to-buyer, no
-- carrier integration — a "ship" order collects a shipping address at
-- checkout and the marina manually marks it shipped with an optional
-- tracking number in the portal (see marina/merchandise.html).
--
-- Payment reuses the exact Stripe Connect destination-charge pattern already
-- proven for bookings (see stripe_connect.sql / create-payment-intent):
-- create-merch-payment-intent creates a PaymentIntent with
-- transfer_data.destination = the marina's connected account, and
-- stripe-webhook's payment_intent.succeeded handler flips a matching
-- merch_orders row from 'pending_payment' to 'paid'.
-- ============================================================================

create table if not exists public.merch_products (
  id              uuid primary key default gen_random_uuid(),
  marina_id       uuid not null references public.marinas(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 200),
  description     text check (description is null or char_length(description) <= 2000),
  price_cents     integer not null check (price_cents > 0),
  currency        text not null default 'CAD',
  photos          text[] not null default '{}',
  stock_quantity  integer check (stock_quantity is null or stock_quantity >= 0), -- null = unlimited/not tracked
  fulfillment_type text not null check (fulfillment_type in ('pickup', 'ship')),
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists merch_products_marina_idx on public.merch_products (marina_id);

create table if not exists public.merch_orders (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references public.merch_products(id),
  marina_id          uuid not null references public.marinas(id),
  buyer_id           uuid not null references auth.users(id),
  quantity           integer not null default 1 check (quantity > 0),
  unit_price_cents   integer not null,           -- snapshot at purchase time, stamped server-side (see trigger below)
  amount_paid_cents  integer not null default 0,
  currency           text not null default 'CAD',
  payment_intent_id  text,
  status             text not null default 'pending_payment'
                        check (status in ('pending_payment', 'paid', 'shipped', 'fulfilled', 'cancelled')),
  shipping_address   jsonb,                       -- null when fulfillment_type = 'pickup'
  tracking_number    text,
  created_at         timestamptz not null default now()
);

create index if not exists merch_orders_marina_idx on public.merch_orders (marina_id, created_at desc);
create index if not exists merch_orders_buyer_idx on public.merch_orders (buyer_id, created_at desc);

-- Same defense-in-depth as set_booking_from_listing() for bookings — the
-- client picks a product, but marina_id and the price actually charged are
-- stamped server-side from the product row so a tampered client insert can't
-- fake either.
create or replace function public.set_merch_order_from_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select marina_id, price_cents
    into new.marina_id, new.unit_price_cents
    from public.merch_products
   where id = new.product_id;

  if new.marina_id is null then
    raise exception 'merch product % not found', new.product_id;
  end if;

  return new;
end;
$$;

drop trigger if exists merch_orders_set_from_product on public.merch_orders;
create trigger merch_orders_set_from_product
  before insert on public.merch_orders
  for each row execute function public.set_merch_order_from_product();

-- Called by stripe-webhook (service_role) once a merch PaymentIntent
-- succeeds. `where stock_quantity >= p_quantity` makes this safe under a
-- race (two payments succeeding for the last unit at nearly the same time)
-- without needing a separate row lock — the update simply affects 0 rows if
-- stock already ran out, same no-oversell guarantee bookings gets from their
-- exclusion constraint, just expressed as a guarded UPDATE instead since
-- stock is a count, not a date range. A null stock_quantity (unlimited/not
-- tracked) is left untouched.
create or replace function public.decrement_merch_stock(p_product_id uuid, p_quantity integer)
returns void
language sql
security definer
set search_path = public
as $$
  update public.merch_products
     set stock_quantity = stock_quantity - p_quantity
   where id = p_product_id
     and stock_quantity is not null
     and stock_quantity >= p_quantity;
$$;

grant execute on function public.decrement_merch_stock(uuid, integer) to service_role;

alter table public.merch_products enable row level security;
alter table public.merch_orders enable row level security;

-- Products: anyone can see a marina's ACTIVE products (the app's Shop
-- section needs this pre-auth-agnostic, same as marina_listings today);
-- the owning marina can see/manage all of its own, active or not.
drop policy if exists "merch_products_select_active" on public.merch_products;
create policy "merch_products_select_active" on public.merch_products
  for select using (active or marina_id in (select id from public.marinas where profile_id = auth.uid()));

drop policy if exists "merch_products_owner_insert" on public.merch_products;
create policy "merch_products_owner_insert" on public.merch_products
  for insert to authenticated
  with check (marina_id in (select id from public.marinas where profile_id = auth.uid()));

drop policy if exists "merch_products_owner_update" on public.merch_products;
create policy "merch_products_owner_update" on public.merch_products
  for update to authenticated
  using (marina_id in (select id from public.marinas where profile_id = auth.uid()))
  with check (marina_id in (select id from public.marinas where profile_id = auth.uid()));

drop policy if exists "merch_products_owner_delete" on public.merch_products;
create policy "merch_products_owner_delete" on public.merch_products
  for delete to authenticated
  using (marina_id in (select id from public.marinas where profile_id = auth.uid()));

-- Orders: a buyer sees/creates their own; the marina sees/updates orders
-- against its own products (to mark shipped/fulfilled, add a tracking
-- number). No buyer update policy — a buyer can't self-mark their own order
-- fulfilled.
drop policy if exists "merch_orders_select_participants" on public.merch_orders;
create policy "merch_orders_select_participants" on public.merch_orders
  for select using (
    buyer_id = auth.uid()
    or marina_id in (select id from public.marinas where profile_id = auth.uid())
  );

drop policy if exists "merch_orders_buyer_insert" on public.merch_orders;
create policy "merch_orders_buyer_insert" on public.merch_orders
  for insert to authenticated
  with check (buyer_id = auth.uid());

drop policy if exists "merch_orders_marina_update" on public.merch_orders;
create policy "merch_orders_marina_update" on public.merch_orders
  for update to authenticated
  using (marina_id in (select id from public.marinas where profile_id = auth.uid()))
  with check (marina_id in (select id from public.marinas where profile_id = auth.uid()));

-- GRANT TRAP (see HANDOFF.md "Gotchas"): RLS alone is not enough.
grant select, insert, update on table public.merch_products to authenticated;
grant select, insert, update on table public.merch_orders to authenticated;
revoke all on table public.merch_products from anon;
revoke all on table public.merch_orders from anon;
revoke delete on table public.merch_orders from authenticated;

-- Same trap for service_role, bitten once already on marinas/bookings (see
-- stripe_connect.sql) — the merch payment Edge Functions read/write both
-- tables via the admin client.
grant select, insert, update, delete on public.merch_products to service_role;
grant select, insert, update, delete on public.merch_orders to service_role;
