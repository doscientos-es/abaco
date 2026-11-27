-- Correct the public offer only. Existing tenant prices, paid periods and
-- invoice snapshots remain untouched.
update public.billing_catalog
set monthly_cents = 2900
where plan = 'standard' and seats = 1 and monthly_cents = 3480;

-- Expose only public rates. Invoker privileges keep the existing catalogue RLS.
create function public.menoslios_public_pricing() returns jsonb
language sql stable security invoker set search_path = ''
begin atomic
  select jsonb_build_object(
    'base_monthly_cents', c.monthly_cents,
    'base_yearly_cents', c.yearly_cents,
    'seat_monthly_cents', c.seat_monthly_cents,
    'seat_yearly_cents', c.seat_monthly_cents * 12,
    'modules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', m.code,
        'monthly_cents', m.monthly_cents,
        'yearly_cents', m.yearly_cents,
        'unit', case when m.code = 'ai' then 'person' else 'company' end
      ) order by m.code)
      from public.billing_module_catalog m
      where m.status = 'pilot' and m.code in ('workers','procurement','ai','mcp')
    ), '[]'::jsonb)
  )
  from public.billing_catalog c where c.plan = 'standard' and c.seats = 1;
end;
revoke all on function public.menoslios_public_pricing() from public, anon, authenticated;
grant execute on function public.menoslios_public_pricing() to anon, authenticated;

-- Optimistic concurrency updates a catalogue rate only, not negotiated
-- subscriptions. A new activation snapshots the published amount as before.
create function app_private.platform_update_module_price(
  p_code text, p_expected_monthly integer, p_expected_yearly integer,
  p_monthly integer, p_yearly integer
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.is_platform_superadmin() is not true then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_code is null or p_code not in ('workers','procurement','ai','mcp')
    or p_expected_monthly is null or p_expected_yearly is null
    or p_monthly is null or p_monthly not between 1 and 1000000
    or p_yearly is null or p_yearly not between 1 and 12000000 then
    raise exception 'Revisa los importes del módulo.' using errcode = '22023';
  end if;
  update public.billing_module_catalog m
    set monthly_cents = p_monthly, yearly_cents = p_yearly
    where m.code = p_code and m.status = 'pilot'
      and m.monthly_cents = p_expected_monthly and m.yearly_cents = p_expected_yearly;
  if not found then
    raise exception 'El módulo cambió. Recarga el catálogo antes de guardar.' using errcode = '40001';
  end if;
end;
$$;
create function public.superadmin_update_module_price(
  p_code text, p_expected_monthly integer, p_expected_yearly integer,
  p_monthly integer, p_yearly integer
) returns void language sql security invoker set search_path = ''
begin atomic
  select app_private.platform_update_module_price(
    p_code, p_expected_monthly, p_expected_yearly, p_monthly, p_yearly
  );
end;
revoke all on function app_private.platform_update_module_price(text,integer,integer,integer,integer),
  public.superadmin_update_module_price(text,integer,integer,integer,integer)
  from public, anon, authenticated;
grant execute on function app_private.platform_update_module_price(text,integer,integer,integer,integer),
  public.superadmin_update_module_price(text,integer,integer,integer,integer)
  to authenticated;

-- An admin-managed offer must also work for the first checkout, not just renewals.
create or replace function public.reserve_onboarding_payment(
  p_tenant uuid, p_recipient jsonb, p_order text, p_actor uuid,
  p_period text, p_seats integer, p_expected_total integer, p_modules text[]
) returns integer language plpgsql security definer set search_path = '' as $$
declare t public.tenants; v_plan text := 'standard';
begin
  select * into strict t from public.tenants where id = p_tenant for update;
  if not exists(select 1 from app_private.company_onboarding o
      join public.memberships m on m.tenant_id = o.tenant_id and m.user_id = o.owner_id
      where o.tenant_id = p_tenant and o.owner_id = p_actor and o.booked_at is null
      and m.role = 'admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if t.subscription_status in ('active','past_due') or t.is_complimentary then
    raise exception 'La empresa no admite este alta. Contacta con Menoslios.' using errcode = 'P0001';
  end if;
  if t.next_plan is not null then
    if t.next_billing_managed is not true or t.next_interval is distinct from p_period
      or t.next_billing_seats is distinct from p_seats then
      raise exception 'Las condiciones pactadas han cambiado. Revisa el plan antes de pagar.' using errcode = 'P0001';
    end if;
    v_plan := t.next_plan;
  elsif t.billing_fixed_net_cents is not null then
    raise exception 'No hay un plan asignado para la cuota pactada.' using errcode = 'P0001';
  end if;
  if p_modules is null or cardinality(p_modules) > 3 or p_seats is null or p_seats not between 1 and 200
    or p_period is null or p_period not in ('month','year') or p_expected_total is null
    or exists(select 1 from unnest(p_modules) x(code)
       where x.code is null or x.code not in ('workers','procurement','ai')
         or not exists(select 1 from public.billing_module_catalog c where c.code = x.code and c.status = 'pilot')) then
    raise exception 'Selección no válida. Revisa los módulos y las plazas.' using errcode = '22023';
  end if;
  if exists(select 1 from public.billing_payments where tenant_id = p_tenant and status = 'pending') then
    raise exception 'Hay un pago pendiente de verificar. No repitas el pago.' using errcode = 'P0001';
  end if;
  update public.tenant_modules m set next_enabled = case when m.enabled then false else null end,
    updated_at = now(), updated_by = p_actor
    where m.tenant_id = p_tenant and not m.gifted;
  insert into public.tenant_modules(tenant_id,module_code,enabled,next_enabled,monthly_cents,yearly_cents,updated_by)
    select p_tenant,c.code,false,true,c.monthly_cents,c.yearly_cents,p_actor
    from public.billing_module_catalog c where c.code = any(p_modules) and c.status = 'pilot'
    on conflict(tenant_id,module_code) do update set next_enabled = true,
      monthly_cents = excluded.monthly_cents, yearly_cents = excluded.yearly_cents,
      updated_at = now(), updated_by = excluded.updated_by
    where not public.tenant_modules.gifted;
  return public.reserve_subscription_invoice_payment(
    p_tenant,p_recipient,p_order,p_actor,'checkout',v_plan,p_period,p_seats,p_expected_total);
end;
$$;
revoke all on function public.reserve_onboarding_payment(uuid,jsonb,text,uuid,text,integer,integer,text[]) from public, anon, authenticated;
grant execute on function public.reserve_onboarding_payment(uuid,jsonb,text,uuid,text,integer,integer,text[]) to service_role;

notify pgrst, 'reload schema';
