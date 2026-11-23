-- Internal quote only. A payment reservation must revalidate it under the tenant lock.
create function app_private.ai_upgrade_quote(p_tenant uuid, p_user uuid)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  t public.tenants;
  c app_private.billing_paid_cycles;
  a app_private.ai_assignments;
  full_net integer;
  net integer;
  paid boolean;
begin
  select * into t from public.tenants where id = p_tenant;
  if not found or t.is_complimentary or t.subscription_status <> 'active'
    or t.cancel_at_period_end or t.current_period_end is null
    or t.current_period_end <= now() or t.billing_interval not in ('month','year')
    or t.billing_vat_percent is null then
    raise exception 'No hay un ciclo de pago activo para esta ampliación' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.billing_payments where tenant_id = p_tenant and status = 'pending') then
    raise exception 'Hay un pago pendiente de verificar' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.memberships m where m.tenant_id = p_tenant
    and m.user_id = p_user and m.role::text in ('owner','admin','editor')) then
    raise exception 'El usuario no tiene permisos para utilizar IA' using errcode = 'P0001';
  end if;
  select * into c from app_private.billing_paid_cycles where tenant_id = p_tenant;
  if not found or c.ends_at is distinct from t.current_period_end
    or c.starts_at > now() or c.ends_at <= now() then
    raise exception 'No se conoce el ciclo de pago exacto' using errcode = 'P0001';
  end if;
  select * into a from app_private.ai_assignments where tenant_id = p_tenant and user_id = p_user;
  paid := found and a.valid_until >= c.ends_at;
  full_net := case t.billing_interval when 'month' then 375 else 4500 end;
  net := case when paid then 0 else app_private.prorated_upgrade_net(full_net, c.starts_at, c.ends_at, now()) end;
  return jsonb_build_object('already_enabled', paid and coalesce(a.enabled,false),
    'already_paid', paid, 'full_net_cents', full_net, 'net_cents', net,
    'vat_percent', t.billing_vat_percent, 'total_cents', app_private.billing_total(net,t.billing_vat_percent),
    'cycle_start', c.starts_at, 'cycle_end', c.ends_at, 'quoted_at', now());
end;
$$;
revoke all on function app_private.ai_upgrade_quote(uuid,uuid) from public, anon, authenticated, service_role;