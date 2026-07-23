-- Lulu & Loop — database schema (Supabase / Postgres)
-- Apply with: supabase db push, or paste into the SQL editor.

-- ============ Profiles (staff) ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  role text not null default 'artisan' check (role in ('owner', 'artisan')),
  specialty text not null default '',
  color text not null default '#8A6FA8',
  capacity int not null default 4,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============ Orders ============
create sequence if not exists public.order_seq start 160;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  customer text not null default 'Web order',
  email text,
  where_from text not null default 'Online',
  item text not null,
  size_label text not null default '',
  desc_text text not null default '',
  colors text not null default '—',
  rush boolean not null default false,
  lang text not null default 'en',
  price numeric not null,
  deposit numeric not null,
  balance numeric not null,
  stage int not null default 0 check (stage between 0 and 5),
  pending boolean not null default false,          -- true until deposit webhook confirms
  artisan_id uuid references public.profiles(id),
  img text not null default '/assets/doll-blonde.jpg',
  deposit_session_id text,
  deposit_paid_at timestamptz,
  deposit_ref text,
  balance_url text,
  balance_session_id text,
  balance_sent_at timestamptz,
  balance_paid_at timestamptz,
  balance_ref text,
  shipping numeric,
  created_at timestamptz not null default now()
);

-- ============ Stage reports (workers reporting progress) ============
create table if not exists public.stage_reports (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  from_stage int not null,
  to_stage int not null,
  note text not null default '',
  photo_path text,
  created_at timestamptz not null default now()
);

-- ============ Tasks (social media engine + general) ============
-- Pillars from the business plan: idea-to-piece, abuela-at-work, queue-story,
-- reveal-unboxing, mini-drop, general
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  details text not null default '',
  pillar text not null default 'general' check (pillar in
    ('idea-to-piece', 'abuela-at-work', 'queue-story', 'reveal-unboxing', 'mini-drop', 'general')),
  assignee_id uuid references public.profiles(id),
  order_id uuid references public.orders(id) on delete set null,
  due_date date,
  status text not null default 'open' check (status in ('open', 'submitted', 'approved', 'rejected')),
  evidence_path text,
  evidence_link text,
  evidence_note text not null default '',
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ============ Helper functions ============
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.active);
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.active and p.role = 'owner');
$$;

create or replace function public.next_order_code() returns text
language sql volatile security definer set search_path = public as $$
  select 'LU-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('order_seq')::text, 4, '0');
$$;

-- Only the service role (edge functions) may allocate order codes
revoke execute on function public.next_order_code() from public, anon, authenticated;
grant execute on function public.next_order_code() to service_role;

-- ============ Row Level Security ============
alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.stage_reports enable row level security;
alter table public.tasks enable row level security;

-- Profiles: staff can read the team; owner manages; users may update their own display fields
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (is_staff());
drop policy if exists profiles_owner_all on public.profiles;
create policy profiles_owner_all on public.profiles for all
  using (is_owner()) with check (is_owner());

-- Orders: staff read confirmed orders; owner updates anything; artisans update their own pieces
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select using (is_staff());
drop policy if exists orders_owner_update on public.orders;
create policy orders_owner_update on public.orders for update
  using (is_owner()) with check (is_owner());
drop policy if exists orders_owner_insert on public.orders;
create policy orders_owner_insert on public.orders for insert with check (is_owner());
drop policy if exists orders_artisan_update on public.orders;
create policy orders_artisan_update on public.orders for update
  using (is_staff() and artisan_id = auth.uid())
  -- artisans may only move their pieces to 'In progress' (3) or 'Ready' (4);
  -- payment-driven stages (2, 5) are set by the webhook / owner
  with check (is_staff() and artisan_id = auth.uid() and stage between 3 and 4);

-- Browser clients may only ever write these two columns; every other column
-- (prices, paid_at stamps, Stripe refs, pending) is service-role/edge-fn only
revoke update on public.orders from anon, authenticated;
grant update (stage, artisan_id) on public.orders to authenticated;

-- Stage reports: any active staff can file reports on orders; staff read all
drop policy if exists reports_select on public.stage_reports;
create policy reports_select on public.stage_reports for select using (is_staff());
drop policy if exists reports_insert on public.stage_reports;
create policy reports_insert on public.stage_reports for insert
  with check (is_staff() and user_id = auth.uid());

-- Tasks: owner everything; assignee reads + submits their own
drop policy if exists tasks_owner_all on public.tasks;
create policy tasks_owner_all on public.tasks for all
  using (is_owner()) with check (is_owner());
drop policy if exists tasks_assignee_select on public.tasks;
create policy tasks_assignee_select on public.tasks for select
  using (is_staff() and assignee_id = auth.uid());
drop policy if exists tasks_assignee_update on public.tasks;
create policy tasks_assignee_update on public.tasks for update
  using (is_staff() and assignee_id = auth.uid())
  -- an assignee's update can only ever produce a fresh submission —
  -- self-approval is impossible (owner review comes via tasks_owner_all)
  with check (is_staff() and assignee_id = auth.uid()
    and status = 'submitted' and reviewed_by is null and reviewed_at is null);

-- ============ Storage: evidence bucket (private) ============
insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false)
on conflict (id) do nothing;

drop policy if exists evidence_insert on storage.objects;
create policy evidence_insert on storage.objects for insert
  with check (bucket_id = 'evidence' and is_staff());
drop policy if exists evidence_select on storage.objects;
create policy evidence_select on storage.objects for select
  using (bucket_id = 'evidence' and is_staff());
