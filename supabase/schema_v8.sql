-- Lulu & Loop — schema v8
-- Email visibility + two missing lifecycle emails. Idempotent; apply after schema_v7.sql.

-- email_log now records failures too (Resend sandbox rejections were invisible)
alter table public.email_log add column if not exists status text not null default 'sent';
alter table public.email_log add column if not exists error text;

-- Customer email when work begins (stage → 2 · In progress)
create or replace function public.trg_fn_work_started() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notify_edge('work_started', new.id);
  return new;
end $$;
drop trigger if exists trg_work_started on public.orders;
create trigger trg_work_started after update of stage on public.orders
  for each row when (new.stage = 2 and old.stage is distinct from new.stage)
  execute function trg_fn_work_started();

-- Customer receipt when the balance payment lands
create or replace function public.trg_fn_balance_received() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notify_edge('balance_received', new.id);
  return new;
end $$;
drop trigger if exists trg_balance_received on public.orders;
create trigger trg_balance_received after update of balance_paid_at on public.orders
  for each row when (new.balance_paid_at is not null and old.balance_paid_at is null)
  execute function trg_fn_balance_received();
