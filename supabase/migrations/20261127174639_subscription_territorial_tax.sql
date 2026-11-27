-- Fiscal treatment of Doscientos subscriptions, not the tenant's own invoices.
create table app_private.subscription_tax_overrides (
  tenant_id uuid primary key,
  postal_code text not null,
  territory text check (territory in ('mainland','balearic','canary','ceuta','melilla','review')),
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);
alter table app_private.subscription_tax_overrides enable row level security;
revoke all on app_private.subscription_tax_overrides from public, anon, authenticated;

create function app_private.spanish_subscription_territory(p_postal text)
returns text language sql immutable set search_path = '' as $$
  select case when btrim(coalesce(p_postal,'')) !~ '^(0[1-9]|[1-4][0-9]|5[0-2])[0-9]{3}$' then 'review'
    when left(btrim(p_postal),2) = '07' then 'balearic'
    when left(btrim(p_postal),2) in ('35','38') then 'canary'
    when left(btrim(p_postal),2) = '51' then 'ceuta'
    when left(btrim(p_postal),2) = '52' then 'melilla'
    else 'mainland' end;
$$;

create function app_private.subscription_tax_decision(p_tenant uuid, p_postal text, p_vat integer)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('detected', d.detected, 'override', o.territory,
    'territory', coalesce(o.territory,d.detected),
    'status', case
      when o.territory is not null and o.territory <> d.detected then 'review'
      when d.detected = 'review' then 'review'
      when d.detected in ('canary','ceuta','melilla') then 'outside_iva'
      when p_vat is distinct from 21 then 'review'
      else 'ready' end)
  from (select app_private.spanish_subscription_territory(p_postal) as detected) d
  left join app_private.subscription_tax_overrides o on o.tenant_id = p_tenant and o.postal_code = btrim(p_postal);
$$;

create function app_private.read_subscription_tax(p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' and public.is_platform_superadmin() is not true
    and public.has_role(p_tenant, array['owner','admin']::public.app_role[]) is not true then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return (select app_private.subscription_tax_decision(t.id,p.postal_code,t.billing_vat_percent)
    from public.tenants t left join public.subscription_billing_profiles p on p.tenant_id=t.id
    where t.id=p_tenant);
end;
$$;

create function app_private.set_subscription_tax_territory(p_tenant uuid, p_territory text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_postal text; v_company public.tenants; v_actor uuid := (select auth.uid());
begin
  if v_actor is null or public.is_platform_superadmin() is not true then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_territory is not null and p_territory not in ('mainland','balearic','canary','ceuta','melilla','review') then
    raise exception 'Territorio no válido' using errcode = '22023';
  end if;
  select * into strict v_company from public.tenants where id=p_tenant for update;
  if exists(select 1 from public.billing_payments where tenant_id=p_tenant and status='pending') then
    raise exception 'Espera a que se resuelva el pago en curso.' using errcode = 'P0001';
  end if;
  select btrim(postal_code) into v_postal from public.subscription_billing_profiles where tenant_id=p_tenant;
  if app_private.spanish_subscription_territory(v_postal) = 'review' then
    raise exception 'Primero guarda un código postal fiscal válido.' using errcode = 'P0001';
  end if;
  insert into app_private.subscription_tax_overrides(tenant_id,postal_code,territory,updated_by)
    values(p_tenant,v_postal,p_territory,v_actor)
    on conflict(tenant_id) do update set postal_code=excluded.postal_code,territory=excluded.territory,
      updated_by=excluded.updated_by,updated_at=now();
end;
$$;

create function public.subscription_billing_tax(p_tenant uuid)
returns jsonb language sql stable security invoker set search_path = ''
begin atomic
  select app_private.read_subscription_tax(p_tenant);
end;

create function public.superadmin_set_subscription_tax_territory(p_tenant uuid,p_territory text)
returns void language sql security invoker set search_path = ''
begin atomic
  select app_private.set_subscription_tax_territory(p_tenant,p_territory);
end;

-- The current invoice issuer can only emit Spanish VAT at 21%. Reject other
-- treatments on reservation, before a payment can reach Redsys or be settled.
create function app_private.guard_subscription_invoice_territory()
returns trigger language plpgsql security definer set search_path = '' as $$
declare payment public.billing_payments;
begin
  select * into strict payment from public.billing_payments where id=new.payment_id;
  if app_private.subscription_tax_decision(payment.tenant_id,new.recipient->>'postal_code',
    payment.vat_percent)->>'status' is distinct from 'ready' then
    raise exception 'La facturación de esta dirección necesita revisión. No se ha iniciado ningún cobro.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger guard_subscription_invoice_territory before insert on app_private.subscription_invoice_handoffs
  for each row execute function app_private.guard_subscription_invoice_territory();

revoke all on function app_private.spanish_subscription_territory(text),
  app_private.subscription_tax_decision(uuid,text,integer), app_private.read_subscription_tax(uuid),
  app_private.set_subscription_tax_territory(uuid,text), app_private.guard_subscription_invoice_territory(),
  public.subscription_billing_tax(uuid), public.superadmin_set_subscription_tax_territory(uuid,text)
  from public,anon,authenticated;
grant execute on function app_private.read_subscription_tax(uuid), public.subscription_billing_tax(uuid)
  to authenticated,service_role;
grant execute on function app_private.set_subscription_tax_territory(uuid,text),
  public.superadmin_set_subscription_tax_territory(uuid,text) to authenticated;

notify pgrst, 'reload schema';
