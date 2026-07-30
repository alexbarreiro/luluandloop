-- Lulu & Loop — schema v7
-- Order pictures + customer shipping address on file. Idempotent; apply after schema_v6.sql.

-- Final approved photo becomes the order's picture (precedence: photo > AI concept > stock img)
alter table public.orders add column if not exists photo_path text;

-- Shipping address kept on the customer record (collected in the wizard,
-- editable from the portal; propagated to un-shipped orders)
alter table public.customer_prefs add column if not exists ship_name text;
alter table public.customer_prefs add column if not exists ship_to jsonb;
