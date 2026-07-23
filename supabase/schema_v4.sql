-- Lulu & Loop — schema v4
-- Adds: shipping cost vs customer price (markup / courtesy waive with loss
-- accounting), customer reviews with an automated follow-up email job,
-- customer profile preferences, and invoice-grade payment visibility.
-- Idempotent; apply after schema_v3.sql.
-- Substitute __NOTIFY_URL__ / __NOTIFY_SECRET__ as in schema_v2 (see header there).

-- ============ Orders: shipping economics + follow-up tracking ============
-- `shipping`      = what the customer pays (may be marked up, or 0 if waived)
-- `shipping_cost` = what the label actually costs us (from the chosen rate)
alter table public.orders add column if not exists shipping_cost numeric;
alter table public.orders add column if not exists shipping_waived boolean not null default false;
alter table public.orders add column if not exists review_request_sent_at timestamptz;
-- orders shipped before this feature existed never get a surprise follow-up
update public.orders set review_request_sent_at = coalesce(review_request_sent_at, now())
  where stage = 4 and shipped_at < now() - interval '14 days';

-- ============ Reviews (one per order, written by the customer) ============
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  body text not null default '',
  photo_path text,
  published boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.reviews enable row level security;
drop policy if exists reviews_staff_select on public.reviews;
create policy reviews_staff_select on public.reviews for select using (is_staff());
drop policy if exists reviews_manager_update on public.reviews;
create policy reviews_manager_update on public.reviews for update
  using (is_manager()) with check (is_manager());
-- inserts happen via the order-portal edge function (service role)

-- ============ Customer preferences (portal profile) ============
create table if not exists public.customer_prefs (
  email text primary key,
  display_name text not null default '',
  lang text not null default 'en' check (lang in ('en', 'es')),
  marketing boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.customer_prefs enable row level security;
drop policy if exists customer_prefs_staff_select on public.customer_prefs;
create policy customer_prefs_staff_select on public.customer_prefs for select using (is_staff());
-- customer reads/writes go through the order-portal edge function (service role)

-- ============ Review follow-up job ============
-- Emails a friendly review request ~3 days after estimated delivery
-- (shipped_at + carrier estimate, default 5 days, + 3 days).
create or replace function public.send_review_followups() returns int
language plpgsql security definer set search_path = public as $$
declare
  o record;
  sent int := 0;
begin
  for o in
    select id from orders
    where stage = 4
      and email is not null
      and review_request_sent_at is null
      and shipped_at is not null
      and shipped_at > now() - interval '30 days'   -- never blast historical orders
      and shipped_at + make_interval(days =>
            coalesce(nullif(shipping_rate->>'days', '')::int, 5) + 3) < now()
      and not exists (select 1 from reviews r where r.order_id = orders.id)
  loop
    -- the notify function stamps review_request_sent_at only after Resend
    -- accepts the email, so failed sends retry on the next daily run
    perform notify_edge('review_request', o.id);
    sent := sent + 1;
  end loop;
  return sent;
end $$;

revoke execute on function public.send_review_followups() from public, anon, authenticated;
grant execute on function public.send_review_followups() to service_role;

create extension if not exists pg_cron;
select cron.schedule('lulu-review-followups', '0 15 * * *',
  $$select public.send_review_followups()$$)
where not exists (select 1 from cron.job where jobname = 'lulu-review-followups');
