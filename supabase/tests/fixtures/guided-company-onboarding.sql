create role anon; create role authenticated; create role service_role;
create schema auth; create schema app_private;
grant usage on schema auth to authenticated;
create function auth.uid() returns uuid language sql as
  $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, email_confirmed_at timestamptz default now());
insert into auth.users (id,email,raw_user_meta_data) values ('00000000-0000-4000-8000-000000000001','owner@example.test','{}'), ('00000000-0000-4000-8000-000000000002','other@example.test','{}');
create table public.tenants (
  id uuid primary key default gen_random_uuid(), name text, trial_ends_at timestamptz default now() + interval '14 days',
  subscription_status text default 'trialing', current_period_end timestamptz, is_complimentary boolean default false,
  next_plan text, next_interval text, next_billing_seats int, next_billing_managed bool default false,
  billing_fixed_net_cents integer, billing_vat_percent int default 21
);
insert into public.tenants (id,name) values ('00000000-0000-4000-8000-000000000003','Legacy');
create table public.memberships (tenant_id uuid, user_id uuid, role text, created_at timestamptz default now());
create table app_private.referral_codes (tenant_id uuid, code text);
create table app_private.referral_attributions (tenant_id uuid, referrer_id uuid);
create table public.billing_payments (id uuid default gen_random_uuid(), tenant_id uuid, kind text,
  status text, created_at timestamptz default now(), merchant_order text, period text, seats integer);
create table public.billing_catalog (
  plan text,seats int,monthly_cents int,
  yearly_cents int generated always as (monthly_cents * 10) stored,seat_monthly_cents int
);
insert into public.billing_catalog(plan,seats,monthly_cents,seat_monthly_cents) values ('standard',1,3480,800);
create table public.billing_module_catalog (code text primary key,status text,monthly_cents int,yearly_cents int);
insert into public.billing_module_catalog values ('workers','pilot',900,9000),('ai','pilot',375,4500),('supplier_logistics','planned',2900,29000);
create table public.tenant_modules (tenant_id uuid,module_code text,enabled bool,next_enabled bool,monthly_cents int,
  yearly_cents int,updated_by uuid,updated_at timestamptz default now(),gifted bool default false,
  primary key(tenant_id,module_code));
create table app_private.ai_assignments (tenant_id uuid,user_id uuid,enabled bool,valid_until timestamptz);
create table app_private.ai_monthly_usage(tenant_id uuid,user_id uuid,month date,requests int,
  primary key(tenant_id,user_id,month));
create table app_private.ai_credit_balances(tenant_id uuid,user_id uuid,credits int);
create function app_private.tenant_module_enabled(p_tenant uuid,p_module text) returns boolean
  language sql as $$ select exists(select 1 from public.tenant_modules
    where tenant_id = p_tenant and module_code = p_module and enabled) $$;
-- Test double only for the established fiscal/Redsys adapter. The migration under test
-- must pass the correct module selection to it and roll back on failure.
create function public.reserve_subscription_invoice_payment(
  tenant uuid, recipient jsonb, order_id text, actor uuid, action text, plan text,
  period text, seats integer, total integer) returns integer language plpgsql as $$
begin
  if action <> 'checkout' then raise exception 'invalid quote'; end if;
  if plan = 'standard' then
    if not exists(select 1 from public.tenant_modules where tenant_id=tenant
        and module_code='workers' and next_enabled and monthly_cents=900) then
      raise exception 'invalid quote';
    end if;
    if period = 'year' then
      if total is distinct from (
        select round((c.yearly_cents + c.seat_monthly_cents * (reserve_subscription_invoice_payment.seats-1)
          * 12 + coalesce((select sum(m.yearly_cents) from public.tenant_modules m
            where m.tenant_id=tenant and m.next_enabled),0)) * 1.21)
        from public.billing_catalog c where c.plan='standard'
      ) then raise exception 'invalid quote'; end if;
    elsif total is distinct from (select ((monthly_cents + 900)*121)/100
      from public.billing_catalog where billing_catalog.plan='standard') then
      raise exception 'invalid quote';
    end if;
  elsif plan is distinct from 'team' or period is distinct from 'year' or seats is distinct from 5 or total is distinct from 54321 then
    raise exception 'invalid quote';
  end if;
  insert into public.billing_payments(tenant_id,kind,status,merchant_order,period,seats)
    values(tenant,'first','pending',order_id,period,seats);
  return total;
end $$;

create table public.clients(tenant_id uuid);
alter table public.clients enable row level security;
grant select,insert on public.clients to authenticated;
create policy baseline on public.clients for all to authenticated using (true);
create table public.catalog_items(tenant_id uuid);
alter table public.catalog_items enable row level security;
grant select,insert on public.catalog_items to authenticated;
create policy baseline on public.catalog_items for all to authenticated using (true);
create table public.estimates(tenant_id uuid);
alter table public.estimates enable row level security;
grant select,insert on public.estimates to authenticated;
create policy baseline on public.estimates for all to authenticated using (true);
create table public.estimate_lines(tenant_id uuid);
alter table public.estimate_lines enable row level security;
grant select,insert on public.estimate_lines to authenticated;
create policy baseline on public.estimate_lines for all to authenticated using (true);
create table public.estimate_milestones(tenant_id uuid);
alter table public.estimate_milestones enable row level security;
grant select,insert on public.estimate_milestones to authenticated;
create policy baseline on public.estimate_milestones for all to authenticated using (true);
create table public.ledger_entries(tenant_id uuid);
alter table public.ledger_entries enable row level security;
grant select,insert on public.ledger_entries to authenticated;
create policy baseline on public.ledger_entries for all to authenticated using (true);
create table public.invoices(tenant_id uuid);
alter table public.invoices enable row level security;
grant select,insert on public.invoices to authenticated;
create policy baseline on public.invoices for all to authenticated using (true);
create table public.work_orders(tenant_id uuid);
alter table public.work_orders enable row level security;
grant select,insert on public.work_orders to authenticated;
create policy baseline on public.work_orders for all to authenticated using (true);
create table public.service_contracts(tenant_id uuid);
alter table public.service_contracts enable row level security;
grant select,insert on public.service_contracts to authenticated;
create policy baseline on public.service_contracts for all to authenticated using (true);
create table public.service_visits(tenant_id uuid);
alter table public.service_visits enable row level security;
grant select,insert on public.service_visits to authenticated;
create policy baseline on public.service_visits for all to authenticated using (true);
create table public.suppliers(tenant_id uuid);
alter table public.suppliers enable row level security;
grant select,insert on public.suppliers to authenticated;
create policy baseline on public.suppliers for all to authenticated using (true);
create table public.inventory_items(tenant_id uuid);
alter table public.inventory_items enable row level security;
grant select,insert on public.inventory_items to authenticated;
create policy baseline on public.inventory_items for all to authenticated using (true);
create table public.staff_schedules(tenant_id uuid);
alter table public.staff_schedules enable row level security;
grant select,insert on public.staff_schedules to authenticated;
create policy baseline on public.staff_schedules for all to authenticated using (true);
create table public.worker_personal_data(tenant_id uuid);
alter table public.worker_personal_data enable row level security;
grant select,insert on public.worker_personal_data to authenticated;
create policy baseline on public.worker_personal_data for all to authenticated using (true);
