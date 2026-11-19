-- Display copy is public; internal plan codes, seat tiers and annual pricing rules stay fixed.
create table public.billing_plan_display (
  plan text primary key check (plan in ('solo', 'team', 'business', 'scale')),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  audience text not null check (char_length(btrim(audience)) between 1 and 240),
  benefit text not null check (char_length(btrim(benefit)) between 1 and 240),
  revision integer not null default 1
);
insert into public.billing_plan_display (plan, name, audience, benefit) values
  ('solo', 'Autónomo', 'Para profesionales que llevan el negocio por su cuenta.', 'Lleva presupuestos, facturas y cobros en un mismo flujo.'),
  ('team', 'Equipo', 'Para una cuadrilla que comparte la gestión del negocio.', 'Comparte el trabajo y asigna accesos según el rol de cada persona.'),
  ('business', 'Empresa', 'Para una oficina que coordina varias cuadrillas.', 'Organiza equipos y trabajos, y consulta costes y márgenes en un mismo sitio.'),
  ('scale', 'Escala', 'Para empresas de 16 a 200 personas con acceso.', 'Elige la capacidad que necesitas para operar con varias cuadrillas.');

alter table public.billing_catalog add constraint billing_catalog_plan_display_fk
  foreign key (plan) references public.billing_plan_display(plan);
alter table public.billing_plan_display enable row level security;
revoke all on public.billing_plan_display from public, anon, authenticated;
grant select on public.billing_plan_display to anon, authenticated;
create policy billing_plan_display_public on public.billing_plan_display
  for select to anon, authenticated using (true);

create function public.superadmin_update_billing_plan(
  p_plan text, p_revision integer, p_name text, p_audience text, p_benefit text, p_rates jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare current_revision integer;
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
  if (select count(*) from jsonb_each(p_rates)) is distinct from
       (select count(*) from public.billing_catalog c where c.plan = p_plan)
    or exists (
      select 1 from public.billing_catalog c where c.plan = p_plan
        and (jsonb_typeof(p_rates -> c.seats::text) is distinct from 'number'
          or coalesce(p_rates ->> c.seats::text, '') !~ '^[1-9][0-9]{0,6}$'
          or case when (p_rates ->> c.seats::text) ~ '^[1-9][0-9]{0,6}$'
            then (p_rates ->> c.seats::text)::integer > 1000000 else false end)
    ) then
    raise exception 'Revisa las tarifas del plan.' using errcode = '22023';
  end if;

  update public.billing_plan_display d set name = btrim(p_name), audience = btrim(p_audience),
    benefit = btrim(p_benefit), revision = current_revision + 1 where d.plan = p_plan;
  update public.billing_catalog c set monthly_cents = (p_rates ->> c.seats::text)::integer
    where c.plan = p_plan;
end;
$$;
revoke all on function public.superadmin_update_billing_plan(text,integer,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.superadmin_update_billing_plan(text,integer,text,text,text,jsonb)
  to authenticated;

create index billing_payments_subscription_invoices_idx
  on public.billing_payments ((coalesce(settled_at, created_at)) desc, id desc)
  where status = 'succeeded' and (invoice_status is not null or invoice_number is not null);

create function public.superadmin_subscription_invoices(
  p_search text, p_offset integer, p_filter text
) returns table (
  id uuid, tenant_id uuid, company_name text, invoice_number text, invoice_status text,
  invoice_portal_url text, merchant_order text, amount_cents integer, paid_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
declare needle text := lower(left(btrim(coalesce(p_search, '')), 120));
begin
  if public.is_platform_superadmin() is not true then
    raise exception 'No tienes acceso a las facturas de plataforma.' using errcode = '42501';
  end if;
  if p_filter is not null and p_filter not in ('issued', 'in_progress') then
    raise exception 'Filtro de factura no válido.' using errcode = '22023';
  end if;

  return query
    select p.id, p.tenant_id, t.name, p.invoice_number, p.invoice_status,
      p.invoice_portal_url, p.merchant_order, p.amount_cents, coalesce(p.settled_at, p.created_at)
    from public.billing_payments p join public.tenants t on t.id = p.tenant_id
    where p.status = 'succeeded' and (p.invoice_status is not null or p.invoice_number is not null)
      and (p_filter is null or (p_filter = 'issued' and p.invoice_number is not null)
        or (p_filter = 'in_progress' and p.invoice_number is null))
      and (needle = '' or strpos(lower(t.name), needle) > 0
        or strpos(lower(p.invoice_number), needle) > 0
        or strpos(lower(p.merchant_order), needle) > 0)
    order by coalesce(p.settled_at, p.created_at) desc, p.id desc
    limit 51 offset greatest(p_offset, 0);
end;
$$;
revoke all on function public.superadmin_subscription_invoices(text,integer,text)
  from public, anon, authenticated;
grant execute on function public.superadmin_subscription_invoices(text,integer,text) to authenticated;

notify pgrst, 'reload schema';