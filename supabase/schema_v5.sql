-- Lulu & Loop — schema v5
-- Adds: per-artisan ship-from addresses (Mexico-based artisans ship their own
-- finished pieces), ready-to-ship handoff, and AI concept images from the
-- dictation design agent. Idempotent; apply after schema_v4.sql.

-- Artisans can ship from their own studio (e.g. Mexico). JSON shape mirrors
-- Shippo/Envia addresses: {name, street1, city, state, zip, country, phone}
alter table public.profiles add column if not exists ship_from jsonb;

-- Artisan marks the piece ready; Lulu reviews shipping cost before any label
alter table public.orders add column if not exists ready_to_ship_at timestamptz;

-- Concept image generated from the customer's dictated idea (storage path)
alter table public.orders add column if not exists concept_path text;

-- Artisans may update ready_to_ship_at on their own pieces (column grant;
-- row access still comes from the artisan stage policy)
grant update (ready_to_ship_at) on public.orders to authenticated;

-- Email the studio when an artisan marks a piece ready to ship, so Lulu can
-- review the shipping cost (artisan-warehouse) before any label is generated
create or replace function public.on_ready_to_ship() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.ready_to_ship_at is not null and old.ready_to_ship_at is null then
    perform notify_edge('ready_to_ship', new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_ready_to_ship on public.orders;
create trigger trg_ready_to_ship after update on public.orders
  for each row execute function public.on_ready_to_ship();
