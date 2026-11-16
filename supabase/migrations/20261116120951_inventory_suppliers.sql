-- Supplier contacts and opt-in inventory, separate from legacy catalog writes.
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  email text not null default '' check (char_length(email) <= 254 and email !~ E'[\r\n]'),
  phone text not null default '' check (char_length(phone) <= 50),
  created_at timestamptz not null default now(),
  unique (id, tenant_id)
);
create index suppliers_tenant_idx on public.suppliers(tenant_id, name);
alter table public.suppliers enable row level security;
revoke all on public.suppliers from public, anon, authenticated;
grant select, insert, update on public.suppliers to authenticated;
grant all on public.suppliers to service_role;
create policy suppliers_read on public.suppliers for select to authenticated using (public.has_role(tenant_id, array['owner','admin','editor']::public.app_role[]));
create policy suppliers_insert on public.suppliers for insert to authenticated with check (public.has_role(tenant_id, array['owner','admin','editor']::public.app_role[]));
create policy suppliers_update on public.suppliers for update to authenticated using (public.has_role(tenant_id, array['owner','admin','editor']::public.app_role[])) with check (public.has_role(tenant_id, array['owner','admin','editor']::public.app_role[]));
create trigger suppliers_lock_tenant before update on public.suppliers for each row execute function public.lock_tenant_id();
create trigger suppliers_require_plan before insert or update on public.suppliers for each row execute function public.require_active_plan();

create table public.inventory_items (
  tenant_id uuid not null,
  catalog_item_id uuid not null,
  quantity numeric(12,3) not null check (quantity >= 0),
  supplier_id uuid,
  version bigint not null default 1 check (version > 0),
  primary key (catalog_item_id, tenant_id),
  foreign key (catalog_item_id, tenant_id) references public.catalog_items(id, tenant_id) on delete cascade,
  foreign key (supplier_id, tenant_id) references public.suppliers(id, tenant_id) on delete restrict
);
create index inventory_items_tenant_idx on public.inventory_items(tenant_id);
alter table public.inventory_items enable row level security;
revoke all on public.inventory_items from public, anon, authenticated;
grant select on public.inventory_items to authenticated;
grant all on public.inventory_items to service_role;
create policy inventory_items_read on public.inventory_items for select to authenticated using (public.has_role(tenant_id, array['owner','admin','editor']::public.app_role[]));

create table public.inventory_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  estimate_id uuid not null,
  catalog_item_id uuid not null,
  unit text not null,
  requested_quantity numeric(18,3) not null check (requested_quantity > 0),
  deducted_quantity numeric(18,3) not null check (deducted_quantity >= 0 and deducted_quantity <= requested_quantity),
  created_at timestamptz not null default now(),
  unique (estimate_id, catalog_item_id, unit),
  foreign key (estimate_id, tenant_id) references public.estimates(id, tenant_id) on delete restrict,
  foreign key (catalog_item_id, tenant_id) references public.catalog_items(id, tenant_id) on delete restrict
);
create index inventory_allocations_tenant_estimate_idx on public.inventory_allocations(tenant_id, estimate_id);
alter table public.inventory_allocations enable row level security;
revoke all on public.inventory_allocations from public, anon, authenticated;
grant select on public.inventory_allocations to authenticated;
grant all on public.inventory_allocations to service_role;
create policy inventory_allocations_read on public.inventory_allocations for select to authenticated using (public.has_role(tenant_id, array['owner','admin','editor']::public.app_role[]));

create table public.inventory_shortages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  estimate_id uuid not null,
  catalog_item_id uuid,
  supplier_id uuid,
  name text not null,
  sku text not null,
  unit text not null,
  missing_quantity numeric(18,3) not null check (missing_quantity > 0),
  reason text not null default 'insufficient' check (reason in ('insufficient','unit_mismatch')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (estimate_id, tenant_id) references public.estimates(id, tenant_id) on delete restrict,
  foreign key (catalog_item_id, tenant_id) references public.catalog_items(id, tenant_id) on delete set null (catalog_item_id),
  foreign key (supplier_id, tenant_id) references public.suppliers(id, tenant_id) on delete restrict
);
create index inventory_shortages_pending_idx on public.inventory_shortages(tenant_id, created_at desc) where resolved_at is null;
alter table public.inventory_shortages enable row level security;
revoke all on public.inventory_shortages from public, anon, authenticated;
grant select on public.inventory_shortages to authenticated;
grant all on public.inventory_shortages to service_role;
create policy inventory_shortages_read on public.inventory_shortages for select to authenticated using (public.has_role(tenant_id, array['owner','admin','editor']::public.app_role[]));

create function public.save_inventory_item(p_tenant_id uuid, p_catalog_item_id uuid, p_quantity numeric, p_supplier_id uuid, p_expected_version bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare item public.catalog_items%rowtype; current_stock public.inventory_items%rowtype;
begin
  if not public.has_role(p_tenant_id, array['owner','admin','editor']::public.app_role[]) then
    raise exception 'No tienes permiso para gestionar el stock' using errcode = '42501';
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'Tu prueba ha terminado. Elige un plan para seguir editando.' using errcode = 'P0402';
  end if;
  if p_quantity is null or p_quantity < 0 or p_quantity > 999999999.999 or p_quantity <> round(p_quantity, 3) then
    raise exception 'Cantidad de stock inválida' using errcode = '22023';
  end if;
  select * into item from public.catalog_items where id = p_catalog_item_id and tenant_id = p_tenant_id for update;
  if not found or item.kind <> 'material' then raise exception 'El material no existe' using errcode = '22023'; end if;
  if p_supplier_id is not null and not exists(select 1 from public.suppliers where id = p_supplier_id and tenant_id = p_tenant_id) then
    raise exception 'El proveedor no existe en esta empresa' using errcode = '22023';
  end if;
  select * into current_stock from public.inventory_items where catalog_item_id = p_catalog_item_id and tenant_id = p_tenant_id for update;
  if found then
    if p_expected_version is distinct from current_stock.version then
      raise exception 'El stock ha cambiado desde que abriste el formulario' using errcode = 'P0409';
    end if;
    update public.inventory_items set quantity = p_quantity, supplier_id = p_supplier_id, version = version + 1
      where catalog_item_id = p_catalog_item_id and tenant_id = p_tenant_id;
  else
    if p_expected_version is not null then raise exception 'El stock ha cambiado desde que abriste el formulario' using errcode = 'P0409'; end if;
    insert into public.inventory_items(tenant_id, catalog_item_id, quantity, supplier_id) values (p_tenant_id, p_catalog_item_id, p_quantity, p_supplier_id);
  end if;
end;
$$;
revoke all on function public.save_inventory_item(uuid,uuid,numeric,uuid,bigint) from public, anon;
grant execute on function public.save_inventory_item(uuid,uuid,numeric,uuid,bigint) to authenticated;

create function public.resolve_inventory_shortage(p_tenant_id uuid, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role(p_tenant_id, array['owner','admin','editor']::public.app_role[]) then
    raise exception 'No tienes permiso para gestionar faltantes' using errcode = '42501';
  end if;
  if not public.tenant_can_write(p_tenant_id) then raise exception 'Tu prueba ha terminado. Elige un plan para seguir editando.' using errcode = 'P0402'; end if;
  update public.inventory_shortages set resolved_at = coalesce(resolved_at, now()) where id = p_id and tenant_id = p_tenant_id;
  if not found then raise exception 'Faltante no encontrado' using errcode = '22023'; end if;
end;
$$;
revoke all on function public.resolve_inventory_shortage(uuid,uuid) from public, anon;
grant execute on function public.resolve_inventory_shortage(uuid,uuid) to authenticated;

create function public.allocate_estimate_inventory() returns trigger
language plpgsql security definer set search_path = '' as $$
declare line record; item public.catalog_items%rowtype; stock public.inventory_items%rowtype; used numeric; missing numeric; reason text;
begin
  if old.status = new.status or new.status <> 'accepted' then return new; end if;
  for line in select l.catalog_item_id, l.unit, sum(l.quantity) as quantity
    from public.estimate_lines l where l.estimate_id = new.id and l.tenant_id = new.tenant_id
      and l.kind = 'material' and l.catalog_item_id is not null and l.quantity > 0
    group by l.catalog_item_id, l.unit order by l.catalog_item_id, l.unit loop
    -- The same lock order is used by stock edits. It prevents concurrent acceptances overselling.
    select * into item from public.catalog_items where id = line.catalog_item_id and tenant_id = new.tenant_id for update;
    if not found then continue; end if;
    select * into stock from public.inventory_items where catalog_item_id = item.id and tenant_id = new.tenant_id for update;
    if not found then continue; end if; -- legacy articles are not tracked until explicitly configured.
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
revoke all on function public.allocate_estimate_inventory() from public, anon, authenticated;
create trigger estimates_allocate_inventory after update of status on public.estimates
  for each row when (old.status is distinct from new.status and new.status = 'accepted') execute function public.allocate_estimate_inventory();