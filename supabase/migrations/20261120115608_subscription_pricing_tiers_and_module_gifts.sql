-- Publish the new fixed plans and the Enterprise per-person price.
alter table public.billing_catalog
  add column seat_monthly_cents integer
    check (seat_monthly_cents between 1 and 1000000);

update public.billing_catalog set monthly_cents = case plan
  when 'solo' then 2900
  when 'team' then 6900
  when 'business' then 19900
  else monthly_cents
end
where plan in ('solo', 'team', 'business');

delete from public.billing_catalog where plan = 'scale';
insert into public.billing_catalog (plan, seats, monthly_cents, seat_monthly_cents)
  values ('scale', 16, 24900, 300);

alter table public.billing_catalog
  add constraint billing_catalog_enterprise_anchor check (plan <> 'scale' or seats = 16),
  add constraint billing_catalog_seat_price_plan_check
    check ((plan = 'scale') = (seat_monthly_cents is not null));

update public.billing_plan_display set
  name = 'Autónomo',
  audience = 'Para profesionales que llevan el negocio por su cuenta.',
  benefit = 'Lleva presupuestos, facturas y cobros en un mismo flujo.',
  revision = revision + 1
where plan = 'solo';
update public.billing_plan_display set
  name = 'Equipo pequeño',
  audience = 'Para equipos de hasta 5 personas con acceso.',
  benefit = 'Comparte el trabajo e incluye las herramientas para coordinar trabajadores.',
  revision = revision + 1
where plan = 'team';
update public.billing_plan_display set
  name = 'Equipo grande',
  audience = 'Para equipos de hasta 15 personas con acceso.',
  benefit = 'Organiza equipos y trabajos, y consulta costes y márgenes en un mismo sitio.',
  revision = revision + 1
where plan = 'business';
update public.billing_plan_display set
  name = 'Enterprise',
  audience = 'Para empresas con 16 o más personas con acceso.',
  benefit = 'Todo incluido, con un precio transparente por cada plaza del equipo.',
  revision = revision + 1
where plan = 'scale';

-- Optional modules are charged per company, not per seat.
insert into public.billing_module_catalog (code, status, monthly_cents, yearly_cents)
values ('workers', 'pilot', 500, 5000), ('mcp', 'pilot', 700, 7000)
on conflict (code) do update set
  status = excluded.status,
  monthly_cents = excluded.monthly_cents,
  yearly_cents = excluded.yearly_cents;
update public.billing_module_catalog set monthly_cents = 1000, yearly_cents = 10000
where code = 'procurement';

alter table public.tenant_modules
  add column gifted boolean not null default false;
grant select (gifted) on public.tenant_modules to authenticated;

-- Keep older server-side pricing helpers aligned with the published base tiers.
create or replace function public.plan_price_cents(p_plan text, p_interval text) returns integer
language sql immutable set search_path = '' as $$
  select case p_interval
    when 'month' then case p_plan
      when 'solo' then 2900 when 'team' then 6900 when 'business' then 19900 when 'scale' then 24900 end
    when 'year' then case p_plan
      when 'solo' then 29000 when 'team' then 69000 when 'business' then 199000 when 'scale' then 249000 end
  end;
$$;

create or replace function public.plan_member_limit(p_plan text) returns integer
language sql immutable set search_path = '' as $$
  select case p_plan when 'solo' then 1 when 'team' then 5 when 'business' then 15
    when 'scale' then 200 else 15 end;
$$;

create function public.billing_catalog_net(p_plan text, p_seats integer, p_period text)
returns integer language sql stable set search_path = '' as $$
  select case p_period
    when 'month' then c.monthly_cents + case when c.plan = 'scale'
      then c.seat_monthly_cents * p_seats else 0 end
    when 'year' then c.yearly_cents + case when c.plan = 'scale'
      then c.seat_monthly_cents * p_seats * 10 else 0 end
  end
  from public.billing_catalog c
  where c.plan = p_plan
    and c.seats = case when c.plan = 'scale' then 16 else p_seats end
    and (c.plan <> 'scale' or p_seats between 16 and 200)
    and p_period in ('month', 'year');
$$;
revoke all on function public.billing_catalog_net(text,integer,text) from public, anon, authenticated;

create or replace function app_private.billing_terms(t public.tenants, p_next boolean)
returns table (plan text, period text, seats integer, net_cents integer, vat_percent integer)
language sql stable set search_path = '' as $$
  select s.plan, s.period, s.seats,
    coalesce(s.override_net, public.billing_catalog_net(s.plan,s.seats,s.period),
      public.plan_price_cents(s.plan,s.period)), s.vat_percent
  from lateral (
    select coalesce(case when p_next then t.next_plan end, t.plan) as plan,
      coalesce(case when p_next then t.next_interval end, t.billing_interval) as period,
      case when p_next and t.next_plan is not null
        then coalesce(t.next_billing_seats, public.plan_member_limit(t.next_plan))
        else coalesce(t.billing_seats, public.plan_member_limit(t.plan)) end as seats,
      case when p_next and t.billing_fixed_net_cents is not null then t.billing_fixed_net_cents
        when p_next and t.next_plan is not null then t.next_billing_net_cents
        else t.billing_net_cents end as override_net,
      case when p_next then t.billing_vat_percent else t.billing_paid_vat_percent end as vat_percent
  ) s;
$$;

-- Included and gifted modules must be free in both server-side quotes and charge validation.
create or replace function app_private.billing_module_net(
  p_tenant uuid, p_period text, p_plan text
) returns integer language sql stable set search_path = '' as $$
  select coalesce(sum(case p_period when 'month' then m.monthly_cents
    when 'year' then m.yearly_cents end), 0)::integer
  from public.tenant_modules m
  join public.billing_module_catalog c on c.code = m.module_code
  where m.tenant_id = p_tenant and coalesce(m.next_enabled,m.enabled)
    and not m.gifted and c.status = 'pilot'
    and not (m.module_code = 'workers' and p_plan in ('trial','team','business','scale'))
    and not (m.module_code = 'procurement' and p_plan in ('business','scale'))
    and not (m.module_code = 'mcp' and p_plan = 'scale');
$$;
revoke all on function app_private.billing_module_net(uuid,text,text) from public, anon, authenticated;

create or replace function app_private.billing_charge_preview(t public.tenants, p_next boolean)
returns jsonb language sql stable set search_path = '' as $$
  select to_jsonb(q) || jsonb_build_object('base_net_cents', q.net_cents,
    'module_net_cents', a.net, 'net_cents', q.net_cents + a.net,
    'amount_cents', app_private.billing_total(q.net_cents + a.net,q.vat_percent))
  from app_private.billing_terms(t,p_next) q
  cross join lateral (select case when p_next
    then app_private.billing_module_net(t.id,q.period,q.plan)
    else t.billing_module_net_cents end as net) a
  where q.net_cents is not null
$$;

create or replace function public.billing_preview(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.tenants; next_plan text;
begin
  if not public.is_platform_superadmin() and not exists(select 1 from public.memberships
    where tenant_id = p_tenant and user_id = (select auth.uid()) and role = 'admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into strict t from public.tenants where id = p_tenant;
  next_plan := coalesce(t.next_plan,t.plan);
  return jsonb_build_object(
    'current', app_private.billing_charge_preview(t,false),
    'next', app_private.billing_charge_preview(t,true),
    'fixed_net_cents', t.billing_fixed_net_cents,
    'next_managed', t.next_billing_managed,
    'module_monthly_cents', app_private.billing_module_net(t.id,'month',next_plan),
    'module_yearly_cents', app_private.billing_module_net(t.id,'year',next_plan),
    'vat_percent', t.billing_vat_percent,
    'cancel_at_period_end', t.cancel_at_period_end,
    'pending', exists(select 1 from public.billing_payments where tenant_id = t.id and status = 'pending'));
end;
$$;

create or replace function public.billing_manage(
  p_tenant uuid, p_actor uuid, p_action text, p_plan text, p_period text,
  p_seats integer, p_expected_total integer, p_order text
) returns integer language plpgsql security definer set search_path = '' as $$
declare t public.tenants; q record; net integer; modules integer; total integer;
begin
  select * into strict t from public.tenants where id = p_tenant for update;
  if not exists(select 1 from public.memberships where tenant_id = t.id and user_id = p_actor and role = 'admin') then
    raise exception 'Solo un administrador puede gestionar el plan' using errcode = '42501';
  end if;
  if t.is_complimentary then raise exception 'Esta empresa tiene acceso de cortesía' using errcode = 'P0001'; end if;
  if exists(select 1 from public.billing_payments where tenant_id = t.id and status = 'pending') then
    raise exception 'Hay un pago pendiente de verificar. No repitas el pago; contacta con soporte si sigue pendiente.' using errcode = 'P0001';
  end if;
  if p_action in ('cancel','resume','undo') then
    if t.subscription_status <> 'active' then raise exception 'No hay suscripción activa' using errcode = 'P0001'; end if;
    if p_action = 'undo' then
      if t.next_billing_managed then
        raise exception 'Contacta con Ábaco para modificar las condiciones programadas' using errcode = 'P0001';
      end if;
      update public.tenants set next_plan = null, next_interval = null, next_billing_seats = null,
        next_billing_net_cents = null where id = t.id;
    else
      update public.tenants set cancel_at_period_end = (p_action = 'cancel') where id = t.id;
    end if;
    return 0;
  end if;
  if p_action = 'retry' then
    if t.subscription_status <> 'past_due' then raise exception 'No hay cuotas pendientes' using errcode = 'P0001'; end if;
    select * into q from app_private.billing_terms(t,true);
  else
    if p_action is null or p_action not in ('checkout','change') or p_period is null or p_period not in ('month','year') then
      raise exception 'Acción o periodo no válido' using errcode = '22023';
    end if;
    if (p_action = 'change' and (t.subscription_status <> 'active' or t.cancel_at_period_end))
       or (p_action = 'checkout' and t.subscription_status in ('active','past_due')) then
      raise exception 'El estado de la suscripción ha cambiado. Revisa el plan.' using errcode = 'P0001';
    end if;
    if p_seats is null and p_expected_total is null and p_plan in ('solo','team','business') then
      p_seats := public.plan_member_limit(p_plan);
      p_expected_total := public.plan_charge_cents(p_plan,p_period);
    end if;
    select * into q from app_private.billing_terms(t,true);
    if t.billing_fixed_net_cents is not null and p_period is distinct from q.period then
      raise exception 'Contacta con Ábaco para cambiar el periodo de una tarifa pactada' using errcode = 'P0001';
    end if;
    if t.next_plan is null or row(q.plan,q.period,q.seats) is distinct from row(p_plan,p_period,p_seats) then
      net := coalesce(t.billing_fixed_net_cents,public.billing_catalog_net(p_plan,p_seats,p_period));
      select p_plan as plan, p_period as period, p_seats as seats, net as net_cents,
        t.billing_vat_percent as vat_percent into q;
    end if;
  end if;
  modules := app_private.billing_module_net(t.id,q.period,q.plan);
  total := app_private.billing_total(q.net_cents + modules,q.vat_percent);
  if total is null or total is distinct from p_expected_total then
    raise exception 'El importe ha cambiado. Actualiza la página y confirma de nuevo.' using errcode = 'P0001';
  end if;
  perform app_private.billing_require_capacity(t.id,q.seats);
  if p_action = 'change' then
    if t.next_plan is not null then
      raise exception 'Retira primero el cambio que ya tienes programado' using errcode = 'P0001';
    end if;
    update public.tenants set next_plan = q.plan, next_interval = q.period,
      next_billing_seats = q.seats, next_billing_net_cents = q.net_cents where id = t.id;
  else
    if t.next_plan is not null and row(q.plan,q.period,q.seats) is distinct from
       row(t.next_plan,t.next_interval,t.next_billing_seats) then
      raise exception 'Tienes una oferta acordada. Contacta con Ábaco para cambiarla.' using errcode = 'P0001';
    end if;
    insert into public.billing_payments (tenant_id,merchant_order,kind,plan,period,seats,net_cents,module_net_cents,vat_percent,amount_cents)
      values(t.id,p_order,case when p_action = 'retry' then 'renewal' else 'first' end,
        q.plan,q.period,q.seats,q.net_cents + modules,modules,q.vat_percent,total);
  end if;
  return total;
end;
$$;

create or replace function public.billing_reserve_renewal(p_tenant uuid, p_order text) returns integer
language plpgsql security definer set search_path = '' as $$
declare t public.tenants; q record; modules integer; total integer;
begin
  select * into strict t from public.tenants where id = p_tenant for update;
  if t.is_complimentary or t.subscription_status not in ('active','past_due') or t.cancel_at_period_end
    or t.current_period_end is null or t.current_period_end > now()
    or not exists(select 1 from public.billing_methods where tenant_id = t.id)
    or exists(select 1 from public.billing_payments where tenant_id = t.id
      and (status = 'pending' or created_at > now() - interval '20 hours')) then return null; end if;
  select * into q from app_private.billing_terms(t,true);
  perform app_private.billing_require_capacity(t.id,q.seats);
  modules := app_private.billing_module_net(t.id,q.period,q.plan);
  total := app_private.billing_total(q.net_cents + modules,q.vat_percent);
  if total is null then return null; end if;
  insert into public.billing_payments (tenant_id,merchant_order,kind,plan,period,seats,net_cents,module_net_cents,vat_percent,amount_cents)
    values(t.id,p_order,'renewal',q.plan,q.period,q.seats,q.net_cents + modules,modules,q.vat_percent,total);
  return total;
end;
$$;

create or replace function public.superadmin_schedule_billing(
  p_tenant uuid,p_plan text,p_period text,p_seats integer,p_net integer
) returns void language plpgsql security definer set search_path = '' as $$
declare t public.tenants; previous jsonb; net integer; price_source text;
begin
  if not public.is_platform_superadmin() then raise exception 'No autorizado' using errcode = '42501'; end if;
  select * into strict t from public.tenants where id = p_tenant for update;
  if t.is_complimentary or t.cancel_at_period_end or t.subscription_status = 'past_due' or exists(
    select 1 from public.billing_payments where tenant_id = t.id and status = 'pending'
  ) then raise exception 'Resuelve primero la cancelación o el pago en curso'; end if;
  if p_period is null or p_period not in ('month','year') then raise exception 'Periodo no válido'; end if;
  net := public.billing_catalog_net(p_plan,p_seats,p_period);
  if net is null then raise exception 'Plan o capacidad no disponible'; end if;
  net := coalesce(p_net,net);
  if net < 1 or net > 10000000 then raise exception 'Importe fuera de rango'; end if;
  perform app_private.billing_require_capacity(t.id,p_seats);
  previous := app_private.billing_charge_preview(t,true) || jsonb_build_object('fixed_net_cents',t.billing_fixed_net_cents);
  update public.tenants set next_plan = p_plan, next_interval = p_period, next_billing_seats = p_seats,
    next_billing_net_cents = net, billing_fixed_net_cents = p_net, next_billing_managed = true
    where id = t.id returning * into t;
  price_source := case when p_net is null then 'catalog' else 'fixed' end;
  insert into public.billing_agreement_log(tenant_id,actor_id,previous_terms,scheduled_terms)
    values (t.id,(select auth.uid()),previous,
      app_private.billing_charge_preview(t,true) || jsonb_build_object('price_source',price_source));
end;
$$;

create or replace function public.superadmin_restore_billing_catalog(
  p_tenant uuid, p_expected_net integer
) returns void language plpgsql security definer set search_path = '' as $$
declare t public.tenants; q record; catalog_net integer;
begin
  if not public.is_platform_superadmin() then raise exception 'No autorizado' using errcode = '42501'; end if;
  select * into strict t from public.tenants where id = p_tenant for update;
  select * into q from app_private.billing_terms(t,true);
  catalog_net := public.billing_catalog_net(q.plan,q.seats,q.period);
  if catalog_net is null or catalog_net is distinct from p_expected_net then
    raise exception 'La tarifa de catálogo ha cambiado. Actualiza y confirma de nuevo';
  end if;
  perform public.superadmin_schedule_billing(t.id,q.plan,q.period,q.seats,null);
end;
$$;

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
  select count(*) + case when p_plan = 'scale' then 1 else 0 end into expected_count
    from public.billing_catalog c where c.plan = p_plan;
  if (select count(*) from jsonb_each(p_rates)) is distinct from expected_count
    or exists (
      select 1 from public.billing_catalog c where c.plan = p_plan
        and (jsonb_typeof(p_rates -> c.seats::text) is distinct from 'number'
          or coalesce(p_rates ->> c.seats::text, '') !~ '^[1-9][0-9]{0,6}$'
          or case when (p_rates ->> c.seats::text) ~ '^[1-9][0-9]{0,6}$'
            then (p_rates ->> c.seats::text)::integer > 1000000 else false end)
    ) or (p_plan = 'scale' and (
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
    seat_monthly_cents = case when c.plan = 'scale'
      then (p_rates ->> 'seat_monthly_cents')::integer else null end
    where c.plan = p_plan;
end;
$$;

-- The module gate is authoritative for both included entitlements and superadmin gifts.
create or replace function app_private.tenant_module_enabled(p_tenant uuid, p_module text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tenants t
    where t.id = p_tenant and (
      (p_module = 'workers' and t.plan in ('trial','team','business','scale'))
      or (p_module = 'procurement' and t.plan in ('business','scale'))
      or (p_module = 'mcp' and t.plan = 'scale')
      or exists (
        select 1 from public.tenant_modules m
        join public.billing_module_catalog c on c.code = m.module_code
        where m.tenant_id = p_tenant and m.module_code = p_module
          and (m.enabled or m.gifted) and c.status = 'pilot'
      )
    )
  );
$$;

create or replace function public.can_use_staff(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant and m.user_id = (select auth.uid())
      and app_private.tenant_module_enabled(p_tenant,'workers')
  );
$$;

create function public.superadmin_set_tenant_module_gift(
  p_tenant uuid, p_module text, p_gifted boolean
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_superadmin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_gifted is null or not exists (
    select 1 from public.billing_module_catalog where code = p_module and status = 'pilot'
  ) then
    raise exception 'Módulo no disponible' using errcode = '22023';
  end if;
  if p_gifted then
    insert into public.tenant_modules (tenant_id,module_code,enabled,gifted,updated_by)
      values (p_tenant,p_module,false,true,(select auth.uid()))
      on conflict (tenant_id,module_code) do update set gifted = true,
        updated_by = excluded.updated_by, updated_at = now();
  else
    update public.tenant_modules set gifted = false, updated_by = (select auth.uid()), updated_at = now()
      where tenant_id = p_tenant and module_code = p_module;
  end if;
end;
$$;
revoke all on function public.superadmin_set_tenant_module_gift(uuid,text,boolean) from public, anon;
grant execute on function public.superadmin_set_tenant_module_gift(uuid,text,boolean) to authenticated;

notify pgrst, 'reload schema';
