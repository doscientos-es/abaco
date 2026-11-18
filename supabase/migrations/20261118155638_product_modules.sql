-- Prices are per company, net of VAT, and are not consumed by Redsys yet.
create table public.billing_module_catalog (
  code text primary key,
  status text not null check (status in ('pilot', 'planned')),
  monthly_cents integer not null check (monthly_cents > 0),
  yearly_cents integer not null check (yearly_cents > 0)
);
insert into public.billing_module_catalog values
  ('procurement', 'pilot', 1900, 19000),
  ('supplier_logistics', 'planned', 2900, 29000);
alter table public.billing_module_catalog enable row level security;
revoke all on public.billing_module_catalog from public, anon, authenticated;
grant select on public.billing_module_catalog to anon, authenticated;
create policy billing_module_catalog_read on public.billing_module_catalog for select
  to anon, authenticated using (status = 'pilot');

create table public.tenant_modules (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_code text not null references public.billing_module_catalog(code),
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (tenant_id, module_code)
);
alter table public.tenant_modules enable row level security;
revoke all on public.tenant_modules from public, anon, authenticated;
grant select (tenant_id, module_code, enabled) on public.tenant_modules to authenticated;
create policy tenant_modules_read on public.tenant_modules for select to authenticated
  using (public.is_member(tenant_id) or (select public.is_platform_superadmin()));

-- Preserve access for existing businesses that already use any part of procurement.
insert into public.tenant_modules (tenant_id, module_code, enabled)
select tenant_id, 'procurement', true from (
  select tenant_id from public.suppliers
  union select tenant_id from public.inventory_items
  union select tenant_id from public.inventory_allocations
  union select tenant_id from public.inventory_shortages
) existing;

create function app_private.tenant_module_enabled(p_tenant uuid, p_module text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tenant_modules m
    join public.billing_module_catalog c on c.code = m.module_code
    where m.tenant_id = p_tenant and m.module_code = p_module and m.enabled and c.status = 'pilot'
  );
$$;
revoke all on function app_private.tenant_module_enabled(uuid,text) from public, anon, authenticated;

-- Policies execute as the caller. Only members can ask about their own tenant.
create function public.can_use_procurement(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_role(p_tenant, array['owner','admin','editor']::public.app_role[])
    and app_private.tenant_module_enabled(p_tenant, 'procurement');
$$;
revoke all on function public.can_use_procurement(uuid) from public, anon;
grant execute on function public.can_use_procurement(uuid) to authenticated;

create function public.superadmin_set_tenant_module(p_tenant uuid, p_module text, p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_superadmin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_enabled is null or not exists (
    select 1 from public.billing_module_catalog where code = p_module and status = 'pilot'
  ) then
    raise exception 'Módulo no disponible' using errcode = '22023';
  end if;
  insert into public.tenant_modules as m (tenant_id, module_code, enabled, updated_by)
    values (p_tenant, p_module, p_enabled, (select auth.uid()))
    on conflict (tenant_id, module_code) do update
      set enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = now()
      where m.enabled is distinct from excluded.enabled;
end;
$$;
revoke all on function public.superadmin_set_tenant_module(uuid,text,boolean) from public, anon;
grant execute on function public.superadmin_set_tenant_module(uuid,text,boolean) to authenticated;

-- Restrictive policies preserve the original role/plan requirements and cover direct REST access.
create policy suppliers_require_module on public.suppliers as restrictive for all to authenticated
  using (public.can_use_procurement(tenant_id)) with check (public.can_use_procurement(tenant_id));
create policy inventory_items_require_module on public.inventory_items as restrictive for select to authenticated
  using (public.can_use_procurement(tenant_id));
create policy inventory_allocations_require_module on public.inventory_allocations as restrictive for select to authenticated
  using (public.can_use_procurement(tenant_id));
create policy inventory_shortages_require_module on public.inventory_shortages as restrictive for select to authenticated
  using (public.can_use_procurement(tenant_id));

-- The stock RPCs bypass RLS by design. Keep their existing checks behind gated entry points.
alter function public.save_inventory_item(uuid,uuid,numeric,uuid,bigint) set schema app_private;
alter function public.resolve_inventory_shortage(uuid,uuid) set schema app_private;
revoke all on function app_private.save_inventory_item(uuid,uuid,numeric,uuid,bigint) from public, anon, authenticated;
revoke all on function app_private.resolve_inventory_shortage(uuid,uuid) from public, anon, authenticated;

create function public.save_inventory_item(p_tenant_id uuid, p_catalog_item_id uuid, p_quantity numeric, p_supplier_id uuid, p_expected_version bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_use_procurement(p_tenant_id) then
    raise exception 'Compras e inventario no está activado en esta empresa' using errcode = '42501';
  end if;
  perform app_private.save_inventory_item(p_tenant_id, p_catalog_item_id, p_quantity, p_supplier_id, p_expected_version);
end;
$$;
revoke all on function public.save_inventory_item(uuid,uuid,numeric,uuid,bigint) from public, anon;
grant execute on function public.save_inventory_item(uuid,uuid,numeric,uuid,bigint) to authenticated;

create function public.resolve_inventory_shortage(p_tenant_id uuid, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_use_procurement(p_tenant_id) then
    raise exception 'Compras e inventario no está activado en esta empresa' using errcode = '42501';
  end if;
  perform app_private.resolve_inventory_shortage(p_tenant_id, p_id);
end;
$$;
revoke all on function public.resolve_inventory_shortage(uuid,uuid) from public, anon;
grant execute on function public.resolve_inventory_shortage(uuid,uuid) to authenticated;

-- Accepting a base-plan estimate must succeed even when no inventory module is enabled.
create or replace function public.allocate_estimate_inventory() returns trigger
language plpgsql security definer set search_path = '' as $$
declare line record; item public.catalog_items%rowtype; stock public.inventory_items%rowtype; used numeric; missing numeric; reason text;
begin
  if old.status = new.status or new.status <> 'accepted'
    or not app_private.tenant_module_enabled(new.tenant_id, 'procurement') then return new; end if;
  for line in select l.catalog_item_id, l.unit, sum(l.quantity) as quantity
    from public.estimate_lines l where l.estimate_id = new.id and l.tenant_id = new.tenant_id
      and l.kind = 'material' and l.catalog_item_id is not null and l.quantity > 0
    group by l.catalog_item_id, l.unit order by l.catalog_item_id, l.unit loop
    -- Keep the same lock order as stock edits to prevent concurrent acceptances overselling.
    select * into item from public.catalog_items where id = line.catalog_item_id and tenant_id = new.tenant_id for update;
    if not found then continue; end if;
    select * into stock from public.inventory_items where catalog_item_id = item.id and tenant_id = new.tenant_id for update;
    if not found then continue; end if;
    reason := case when item.unit <> line.unit then 'unit_mismatch' else 'insufficient' end;
    used := case when reason = 'unit_mismatch' then 0 else least(stock.quantity, line.quantity) end;
    missing := line.quantity - used;
    insert into public.inventory_allocations(tenant_id, estimate_id, catalog_item_id, unit, requested_quantity, deducted_quantity)
      values (new.tenant_id, new.id, item.id, line.unit, line.quantity, used);
    if used > 0 then
      update public.inventory_items set quantity = quantity - used, version = version + 1 where catalog_item_id = item.id and tenant_id = new.tenant_id;
    end if;
    if missing > 0 then
      insert into public.inventory_shortages(tenant_id, estimate_id, catalog_item_id, supplier_id, name, sku, unit, missing_quantity, reason)
      values (new.tenant_id, new.id, item.id, stock.supplier_id, item.name, item.sku, line.unit, missing, reason);
    end if;
  end loop;
  return new;
end;
$$;

notify pgrst, 'reload schema';
