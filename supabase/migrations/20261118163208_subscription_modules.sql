-- Existing access stays free. New selections store the rates shown when confirmed.
alter table public.tenant_modules
  add column next_enabled boolean,
  add column monthly_cents integer not null default 0 check (monthly_cents >= 0),
  add column yearly_cents integer not null default 0 check (yearly_cents >= 0);
grant select (next_enabled, monthly_cents, yearly_cents) on public.tenant_modules to authenticated;

create or replace function app_private.billing_module_net(p_tenant uuid, p_period text) returns integer
language sql stable set search_path = '' as $$
  select coalesce(sum(case p_period when 'month' then m.monthly_cents when 'year' then m.yearly_cents end), 0)::integer
  from public.tenant_modules m join public.billing_module_catalog c on c.code = m.module_code
  where m.tenant_id = p_tenant and coalesce(m.next_enabled,m.enabled) and c.status = 'pilot'
$$;

create or replace function app_private.apply_paid_modules(p_tenant uuid) returns void
language plpgsql set search_path = '' as $$
begin
  update public.tenant_modules set enabled = next_enabled, next_enabled = null
  where tenant_id = p_tenant and next_enabled is not null;
end;
$$;

-- Every paid change uses the same tenant lock as checkout and the renewal worker.
create function public.schedule_tenant_module(
  p_tenant uuid, p_module text, p_enabled boolean, p_monthly integer, p_yearly integer
) returns void language plpgsql security definer set search_path = '' as $$
declare
  platform boolean := public.is_platform_superadmin();
  t public.tenants;
  m public.tenant_modules;
  rate public.billing_module_catalog;
  current_enabled boolean;
begin
  if not platform and not exists(select 1 from public.memberships
    where tenant_id = p_tenant and user_id = (select auth.uid()) and role = 'admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into strict t from public.tenants where id = p_tenant for update;
  select * into rate from public.billing_module_catalog where code = p_module and status = 'pilot';
  if p_enabled is null or rate.code is null then
    raise exception 'Módulo no disponible' using errcode = '22023';
  end if;
  select * into m from public.tenant_modules where tenant_id = p_tenant and module_code = p_module;
  current_enabled := coalesce(m.enabled,false);

  if t.is_complimentary then
    if not platform then raise exception 'Contacta con Ábaco para cambiar los módulos de cortesía'; end if;
    insert into public.tenant_modules (tenant_id,module_code,enabled,updated_by)
      values (p_tenant,p_module,p_enabled,(select auth.uid()))
      on conflict (tenant_id,module_code) do update set enabled = excluded.enabled,
        next_enabled = null, monthly_cents = 0, yearly_cents = 0,
        updated_at = now(), updated_by = excluded.updated_by;
    return;
  end if;

  if t.cancel_at_period_end or t.subscription_status = 'past_due' or exists(
    select 1 from public.billing_payments where tenant_id = p_tenant and status = 'pending'
  ) then raise exception 'Resuelve primero la cancelación o el pago en curso'; end if;
  if p_enabled = coalesce(m.next_enabled,current_enabled) then return; end if;

  if p_enabled and not current_enabled and (
    p_monthly is distinct from rate.monthly_cents or p_yearly is distinct from rate.yearly_cents
  ) then raise exception 'La tarifa del módulo ha cambiado. Actualiza y confirma de nuevo'; end if;

  insert into public.tenant_modules as tm (tenant_id,module_code,enabled,next_enabled,monthly_cents,yearly_cents,updated_by)
    values (p_tenant,p_module,current_enabled,nullif(p_enabled,current_enabled),
      case when p_enabled and not current_enabled then rate.monthly_cents else coalesce(m.monthly_cents,0) end,
      case when p_enabled and not current_enabled then rate.yearly_cents else coalesce(m.yearly_cents,0) end,
      (select auth.uid()))
    on conflict (tenant_id,module_code) do update set next_enabled = excluded.next_enabled,
      monthly_cents = excluded.monthly_cents, yearly_cents = excluded.yearly_cents,
      updated_at = now(), updated_by = excluded.updated_by;
end;
$$;
revoke all on function public.schedule_tenant_module(uuid,text,boolean,integer,integer) from public, anon;
grant execute on function public.schedule_tenant_module(uuid,text,boolean,integer,integer) to authenticated;

-- Do not let older clients bypass payment by granting access directly.
revoke execute on function public.superadmin_set_tenant_module(uuid,text,boolean) from authenticated;

revoke all on function app_private.billing_module_net(uuid,text) from public, anon, authenticated;
revoke all on function app_private.apply_paid_modules(uuid) from public, anon, authenticated;