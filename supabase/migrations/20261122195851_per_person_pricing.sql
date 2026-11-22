-- Introduce the new offer alongside legacy plans, without changing existing agreements.
alter table public.tenants drop constraint tenants_plan_check;
alter table public.tenants add constraint tenants_plan_check
  check (plan in ('trial', 'solo', 'team', 'business', 'scale', 'standard'));
alter table public.tenants drop constraint tenants_next_plan_check;
alter table public.tenants add constraint tenants_next_plan_check
  check (next_plan in ('solo', 'team', 'business', 'scale', 'standard'));
alter table public.billing_payments drop constraint billing_payments_plan_check;
alter table public.billing_payments add constraint billing_payments_plan_check
  check (plan in ('solo', 'team', 'business', 'scale', 'standard'));
alter table public.billing_plan_display drop constraint billing_plan_display_plan_check;
alter table public.billing_plan_display add constraint billing_plan_display_plan_check
  check (plan in ('solo', 'team', 'business', 'scale', 'standard'));
alter table public.billing_catalog drop constraint billing_catalog_plan_check;
alter table public.billing_catalog add constraint billing_catalog_plan_check
  check (plan in ('solo', 'team', 'business', 'scale', 'standard'));
alter table public.billing_catalog drop constraint billing_catalog_seat_price_plan_check;
alter table public.billing_catalog add constraint billing_catalog_seat_price_plan_check
  check ((plan in ('scale', 'standard')) = (seat_monthly_cents is not null));
alter table public.billing_catalog add constraint billing_catalog_standard_anchor
  check (plan <> 'standard' or seats = 1);

insert into public.billing_plan_display (plan, name, audience, benefit)
values ('standard', 'Ábaco', 'Para profesionales y equipos de cualquier tamaño.',
  'El mismo núcleo para todos, con módulos opcionales por empresa.');
-- The generated yearly price is ten base monthly payments: 348 € / year.
-- Additional seats cost 8 € / month in either period, billed for 12 months annually.
insert into public.billing_catalog (plan, seats, monthly_cents, seat_monthly_cents)
values ('standard', 1, 3480, 800);

-- Existing module subscriptions retain their own agreed price snapshots.
update public.billing_module_catalog set monthly_cents = 900, yearly_cents = 9000
  where code in ('workers', 'mcp');
update public.billing_module_catalog set monthly_cents = 1500, yearly_cents = 15000
  where code = 'procurement';

create or replace function public.plan_member_limit(p_plan text) returns integer
language sql immutable set search_path = '' as $$
  select case p_plan when 'solo' then 1 when 'team' then 5 when 'business' then 15
    when 'scale' then 200 when 'standard' then 200 else 15 end;
$$;

create or replace function public.billing_catalog_net(p_plan text, p_seats integer, p_period text)
returns integer language sql stable set search_path = '' as $$
  select case p_period
    when 'month' then c.monthly_cents + case c.plan
      when 'standard' then c.seat_monthly_cents * (p_seats - 1)
      when 'scale' then c.seat_monthly_cents * p_seats else 0 end
    when 'year' then c.yearly_cents + case c.plan
      when 'standard' then c.seat_monthly_cents * (p_seats - 1) * 12
      when 'scale' then c.seat_monthly_cents * p_seats * 10 else 0 end
  end
  from public.billing_catalog c
  where c.plan = p_plan
    and c.seats = case c.plan when 'scale' then 16 when 'standard' then 1 else p_seats end
    and (c.plan <> 'scale' or p_seats between 16 and 200)
    and (c.plan <> 'standard' or p_seats between 1 and 200)
    and p_period in ('month', 'year');
$$;

-- Keep catalogue editing consistent with the new per-person price.
create or replace function public.superadmin_update_billing_plan(
  p_plan text, p_revision integer, p_name text, p_audience text, p_benefit text, p_rates jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare current_revision integer; expected_count integer;
begin
  if public.is_platform_superadmin() is not true then
    raise exception 'No tienes acceso al catálogo de plataforma.' using errcode = '42501';
  end if;
  select d.revision into current_revision from public.billing_plan_display d
    where d.plan = p_plan for update;
  if not found or p_revision is distinct from current_revision then
    raise exception 'Este plan se ha actualizado. Recarga el catálogo antes de guardar.' using errcode = '40001';
  end if;
  if jsonb_typeof(p_rates) is distinct from 'object' then
    raise exception 'Revisa las tarifas del plan.' using errcode = '22023';
  end if;
  select count(*) + case when p_plan in ('scale', 'standard') then 1 else 0 end into expected_count
    from public.billing_catalog c where c.plan = p_plan;
  if (select count(*) from jsonb_each(p_rates)) is distinct from expected_count
    or exists (
      select 1 from public.billing_catalog c where c.plan = p_plan
        and (jsonb_typeof(p_rates -> c.seats::text) is distinct from 'number'
          or coalesce(p_rates ->> c.seats::text, '') !~ '^[1-9][0-9]{0,6}$'
          or case when (p_rates ->> c.seats::text) ~ '^[1-9][0-9]{0,6}$'
            then (p_rates ->> c.seats::text)::integer > 1000000 else false end)
    ) or (p_plan in ('scale', 'standard') and (
      jsonb_typeof(p_rates -> 'seat_monthly_cents') is distinct from 'number'
      or coalesce(p_rates ->> 'seat_monthly_cents','') !~ '^[1-9][0-9]{0,6}$'
      or case when (p_rates ->> 'seat_monthly_cents') ~ '^[1-9][0-9]{0,6}$'
        then (p_rates ->> 'seat_monthly_cents')::integer > 1000000 else false end
    )) then
    raise exception 'Revisa las tarifas del plan.' using errcode = '22023';
  end if;
  update public.billing_plan_display d set name = btrim(p_name), audience = btrim(p_audience),
    benefit = btrim(p_benefit), revision = current_revision + 1 where d.plan = p_plan;
  update public.billing_catalog c set monthly_cents = (p_rates ->> c.seats::text)::integer,
    seat_monthly_cents = case when c.plan in ('scale', 'standard')
      then (p_rates ->> 'seat_monthly_cents')::integer else null end
    where c.plan = p_plan;
end;
$$;

notify pgrst, 'reload schema';