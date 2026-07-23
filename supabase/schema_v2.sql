-- Lulu & Loop — schema v2
-- Adds: supervisor role, shipping fields, customer share tokens, payouts,
-- customer uploads, auto-generated content tasks, and email notifications.
-- Idempotent; apply after schema.sql.
--
-- BEFORE APPLYING, substitute the two placeholders below (emails silently
-- stay off otherwise — notify_edge guards against unsubstituted values):
--   __NOTIFY_URL__    → https://<project-ref>.supabase.co/functions/v1/notify
--   __NOTIFY_SECRET__ → the same value set as the NOTIFY_SECRET function secret
-- e.g.: sed -e "s|__NOTIFY_URL__|https://<REF>.supabase.co/functions/v1/notify|" \
--           -e "s|__NOTIFY_SECRET__|$(openssl rand -hex 24)|" schema_v2.sql

-- ============ Roles: owner | supervisor | artisan ============
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('owner', 'supervisor', 'artisan'));

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p
    where p.id = auth.uid() and p.active and p.role in ('owner', 'supervisor'));
$$;

-- Managers (owner + supervisor) run day-to-day order and task operations
drop policy if exists orders_owner_update on public.orders;
create policy orders_owner_update on public.orders for update
  using (is_manager()) with check (is_manager());
drop policy if exists orders_owner_insert on public.orders;
create policy orders_owner_insert on public.orders for insert with check (is_manager());
drop policy if exists tasks_owner_all on public.tasks;
create policy tasks_owner_all on public.tasks for all
  using (is_manager()) with check (is_manager());
-- Staff management stays owner-only (profiles_owner_all unchanged)

-- ============ Orders: shipping + customer share ============
alter table public.orders add column if not exists shipping_name text;
alter table public.orders add column if not exists shipping_address jsonb;
alter table public.orders add column if not exists shipping_rate jsonb;       -- chosen Shippo rate
alter table public.orders add column if not exists label_url text;
alter table public.orders add column if not exists tracking_number text;
alter table public.orders add column if not exists tracking_url text;
alter table public.orders add column if not exists shipped_at timestamptz;
alter table public.orders add column if not exists share_token uuid not null default gen_random_uuid();

-- ============ Payouts (artisan pay = 40% of piece price; owner keeps 100%) ============
create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.profiles(id),
  amount numeric not null,
  note text not null default '',
  order_codes text[] not null default '{}',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.payouts enable row level security;
drop policy if exists payouts_owner_all on public.payouts;
create policy payouts_owner_all on public.payouts for all
  using (is_owner()) with check (is_owner());

-- ============ Customer uploads (photos/videos shared by customers) ============
create table if not exists public.customer_uploads (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  file_path text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table public.customer_uploads enable row level security;
drop policy if exists customer_uploads_select on public.customer_uploads;
create policy customer_uploads_select on public.customer_uploads for select using (is_staff());
-- inserts happen via the customer-upload edge function (service role)

-- ============ Auto-generated content tasks ============
-- Rules from the business plan's social media engine:
--   stage → 3 (In progress, artisan assigned): "From idea to piece" reel task
--   stage → 5 (Shipped): "Reveal & unboxing" repost task
create or replace function public.auto_content_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stage = 3 and coalesce(old.stage, -1) <> 3 and new.artisan_id is not null
     and not exists (select 1 from tasks t where t.order_id = new.id and t.pillar = 'idea-to-piece') then
    insert into tasks (title, details, pillar, assignee_id, order_id, due_date, status)
    values ('Reel: ' || new.item || ' — sketch → piece',
            'Film the WIP next to the customer''s reference. 20–30s vertical, tag #HechoConLulu.',
            'idea-to-piece', new.artisan_id, new.id, (now() + interval '5 days')::date, 'open');
  end if;
  if new.stage = 5 and coalesce(old.stage, -1) <> 5 then
    if new.artisan_id is not null
       and not exists (select 1 from tasks t where t.order_id = new.id and t.pillar = 'reveal-unboxing') then
      insert into tasks (title, details, pillar, assignee_id, order_id, due_date, status)
      values ('Reveal: repost ' || new.customer || '''s unboxing',
              'When the customer shares their photo/video, ask permission and repost. Tag #HechoConLulu.',
              'reveal-unboxing', new.artisan_id, new.id, (now() + interval '14 days')::date, 'open');
    end if;
    new.shipped_at := coalesce(new.shipped_at, now());
  end if;
  return new;
end $$;

drop trigger if exists trg_auto_content_tasks on public.orders;
create trigger trg_auto_content_tasks
  before update on public.orders
  for each row execute function public.auto_content_tasks();

-- ============ Email notifications via the notify edge function ============
create extension if not exists pg_net;

create or replace function public.notify_edge(kind text, rec_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- no-op if the migration was applied without substituting the placeholders
  if '__NOTIFY_URL__' like '\_\_%' escape '\' then
    return;
  end if;
  perform net.http_post(
    url := '__NOTIFY_URL__',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-notify-secret', '__NOTIFY_SECRET__'),
    body := jsonb_build_object('kind', kind, 'id', rec_id)
  );
exception when others then
  null; -- email failures must never block the transaction
end $$;

-- Triggers (SECURITY DEFINER) may call this; API clients may not — the body
-- carries the notify secret
revoke execute on function public.notify_edge(text, uuid) from public, anon, authenticated;
grant execute on function public.notify_edge(text, uuid) to service_role;

create or replace function public.on_task_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is not null then
    perform notify_edge('task_created', new.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_task_created on public.tasks;
create trigger trg_task_created
  after insert on public.tasks
  for each row execute function public.on_task_created();

create or replace function public.on_order_shipped() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stage = 5 and coalesce(old.stage, -1) <> 5 and new.email is not null then
    perform notify_edge('order_shipped', new.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_order_shipped on public.orders;
create trigger trg_order_shipped
  after update on public.orders
  for each row execute function public.on_order_shipped();
