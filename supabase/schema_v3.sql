-- Lulu & Loop — schema v3
-- Reworks the order lifecycle around upfront deposits and adds customer
-- communication:
--   stages: 0 New request → 1 Quote review → 2 In progress → 3 Ready → 4 Shipped
--   · deposit is always paid at creation (webhook lands orders at stage 0)
--   · price is editable during Quote review (balance recomputed; deposit fixed)
--   · In progress requires an assigned artisan; Shipped requires customer
--     approval + paid balance
--   · order-tied messages both ways (with photos), customer portal access by
--     order code + share token or a customer account (email match)
--   · every customer email is logged (email_log) for the Customers view
-- Idempotent; apply after schema.sql + schema_v2.sql.
-- Substitute __NOTIFY_URL__ / __NOTIFY_SECRET__ as in schema_v2 (see header there).

-- ============ Orders: approval + quote-review support ============
alter table public.orders add column if not exists approved_at timestamptz;
alter table public.orders add column if not exists quote_note text not null default '';

-- ============ Messages (order-tied, both directions, photos) ============
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  sender_kind text not null check (sender_kind in ('customer', 'staff', 'system')),
  sender_id uuid references public.profiles(id),
  sender_name text not null default '',
  kind text not null default 'chat' check (kind in ('chat', 'approval_request', 'system')),
  body text not null default '',
  photo_path text,
  created_at timestamptz not null default now()
);
create index if not exists messages_order_idx on public.messages(order_id, created_at);
alter table public.messages enable row level security;

drop policy if exists messages_staff_select on public.messages;
create policy messages_staff_select on public.messages for select using (is_staff());
drop policy if exists messages_staff_insert on public.messages;
create policy messages_staff_insert on public.messages for insert
  with check (is_staff() and sender_kind = 'staff' and sender_id = auth.uid()
    and (is_manager() or exists (select 1 from orders o where o.id = order_id and o.artisan_id = auth.uid())));

-- Customer accounts see their own orders + messages (matched by login email)
drop policy if exists orders_customer_select on public.orders;
create policy orders_customer_select on public.orders for select
  using (email is not null and lower(email) = lower(auth.jwt() ->> 'email') and pending = false);
drop policy if exists messages_customer_select on public.messages;
create policy messages_customer_select on public.messages for select
  using (exists (select 1 from orders o where o.id = order_id and lower(o.email) = lower(auth.jwt() ->> 'email')));
drop policy if exists messages_customer_insert on public.messages;
create policy messages_customer_insert on public.messages for insert
  with check (sender_kind = 'customer' and kind = 'chat'
    and exists (select 1 from orders o where o.id = order_id and lower(o.email) = lower(auth.jwt() ->> 'email')));

-- ============ Email log (everything sent to customers, for the Customers view) ============
create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  to_email text not null,
  kind text not null,
  subject text not null default '',
  created_at timestamptz not null default now()
);
alter table public.email_log enable row level security;
drop policy if exists email_log_select on public.email_log;
create policy email_log_select on public.email_log for select using (is_staff());

-- ============ Migrate existing orders to the 5-stage flow ============
-- old: 0 new · 1 quoted · 2 queue-paid · 3 in-progress · 4 ready · 5 shipped
-- new: 0 new request · 1 quote review · 2 in progress · 3 ready · 4 shipped
-- One-shot: keyed off the old 0-5 check constraint, which is tightened to 0-4
-- in the same block — re-applying this file is then a no-op.
do $$ begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_stage_check'
      and pg_get_constraintdef(oid) like '%5%'
  ) then
    -- v2's old-numbered auto-task trigger must not fire during the remap
    alter table public.orders disable trigger trg_auto_content_tasks;
    update public.orders set stage = case
      when stage = 2 then 1
      when stage = 3 then 2
      when stage = 4 then 3
      when stage = 5 then 4
      else stage end
    where stage > 1;
    alter table public.orders enable trigger trg_auto_content_tasks;
    alter table public.orders drop constraint orders_stage_check;
    alter table public.orders add constraint orders_stage_check check (stage between 0 and 4);
  end if;
end $$;

-- Artisan clients may move their pieces between In progress (2) and Ready (3)
drop policy if exists orders_artisan_update on public.orders;
create policy orders_artisan_update on public.orders for update
  using (is_staff() and artisan_id = auth.uid())
  with check (is_staff() and artisan_id = auth.uid() and stage between 2 and 3);

-- ============ Stage-transition guards ============
create or replace function public.enforce_stage_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stage <> coalesce(old.stage, -1) then
    if new.stage in (2, 3) and new.artisan_id is null then
      raise exception 'Assign an artisan before moving to “In progress”';
    end if;
    if new.stage = 4 then
      if new.approved_at is null then
        raise exception 'The customer must approve the finished piece before shipping';
      end if;
      if new.balance_paid_at is null then
        raise exception 'The balance must be paid before shipping';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_stage_rules on public.orders;
create trigger trg_stage_rules
  before insert or update on public.orders
  for each row execute function public.enforce_stage_rules();

-- ============ Auto content tasks (rebased to the 5-stage flow) ============
create or replace function public.auto_content_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stage = 2 and coalesce(old.stage, -1) <> 2 and new.artisan_id is not null
     and not exists (select 1 from tasks t where t.order_id = new.id and t.pillar = 'idea-to-piece') then
    insert into tasks (title, details, pillar, assignee_id, order_id, due_date, status)
    values ('Reel: ' || new.item || ' — sketch → piece',
            'Film the WIP next to the customer''s reference. 20–30s vertical, tag #HechoConLulu.',
            'idea-to-piece', new.artisan_id, new.id, (now() + interval '5 days')::date, 'open');
  end if;
  if new.stage = 4 and coalesce(old.stage, -1) <> 4 then
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

-- ============ Notifications (rebased + new kinds) ============
-- order_created: deposit confirmed → welcome email with code + portal link
create or replace function public.on_order_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.pending = true and new.pending = false and new.email is not null then
    perform notify_edge('order_created', new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_order_created on public.orders;
create trigger trg_order_created
  after update on public.orders
  for each row execute function public.on_order_created();

-- shipped email now fires on stage 4
create or replace function public.on_order_shipped() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stage = 4 and coalesce(old.stage, -1) <> 4 and new.email is not null then
    perform notify_edge('order_shipped', new.id);
  end if;
  return new;
end $$;

-- message emails: staff/system → customer; customer → studio inbox
create or replace function public.on_message_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.sender_kind = 'staff' or new.kind = 'approval_request' then
    perform notify_edge(case when new.kind = 'approval_request'
      then 'approval_request' else 'studio_message' end, new.id);
  elsif new.sender_kind = 'customer' then
    perform notify_edge('customer_message', new.id);
  elsif new.sender_kind = 'system' then
    -- e.g. "customer approved the piece" → tell the studio
    perform notify_edge('order_event', new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_message_created on public.messages;
create trigger trg_message_created
  after insert on public.messages
  for each row execute function public.on_message_created();
