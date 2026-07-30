-- Lulu & Loop — schema v6
-- Persistent Lulu AI conversations: every chat (web widget + mobile app) is
-- logged per visitor, viewable in the Studio by date, and staff can reply
-- into the same thread. Idempotent; apply after schema_v5.sql.

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  visitor_id text unique not null,
  email text,
  source text not null default 'web' check (source in ('web', 'app')),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  role text not null check (role in ('user', 'lulu', 'staff')),
  body text not null default '',
  meta jsonb,          -- structured actions on lulu messages (concept/checkout/orders)
  staff_name text,     -- who wrote it, for staff messages
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_chat_idx on public.chat_messages (chat_id, created_at);
create index if not exists chats_last_msg_idx on public.chats (last_message_at desc);

alter table public.chats enable row level security;
alter table public.chat_messages enable row level security;

-- Studio: staff read everything; staff may insert human replies only
drop policy if exists chats_staff_select on public.chats;
create policy chats_staff_select on public.chats for select using (is_staff());
drop policy if exists chat_messages_staff_select on public.chat_messages;
create policy chat_messages_staff_select on public.chat_messages for select using (is_staff());
drop policy if exists chat_messages_staff_insert on public.chat_messages;
create policy chat_messages_staff_insert on public.chat_messages for insert
  with check (is_staff() and role = 'staff');

-- staff replies bump the conversation so it sorts to the top of the Studio list
create or replace function public.touch_chat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update chats set last_message_at = now() where id = new.chat_id;
  return new;
end $$;
drop trigger if exists trg_touch_chat on public.chat_messages;
create trigger trg_touch_chat after insert on public.chat_messages
  for each row execute function public.touch_chat();
