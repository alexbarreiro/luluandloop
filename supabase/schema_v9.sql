-- Lulu & Loop — schema v9
-- Payout payment details + staff-editable customer profiles. Idempotent; apply after schema_v8.sql.

-- How each artisan payout was actually paid
alter table public.payouts add column if not exists method text not null default '';
alter table public.payouts add column if not exists reference text not null default '';

-- Studio can edit customer profiles (Customers view)
drop policy if exists customer_prefs_staff_update on public.customer_prefs;
create policy customer_prefs_staff_update on public.customer_prefs
  for update using (is_staff()) with check (is_staff());
drop policy if exists customer_prefs_staff_insert on public.customer_prefs;
create policy customer_prefs_staff_insert on public.customer_prefs
  for insert with check (is_staff());
