-- Internal actual costs are separate from the technical work projection.
-- Every entry preserves its unit rate; corrections append a reversal instead of
-- rewriting history or silently changing prior profitability.
create table public.work_cost_entries (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  tenant_id uuid not null,
  work_order_id uuid not null,
  task_id uuid,
  reversal_of uuid unique,
  kind text not null check (kind in (
    'labor', 'material', 'product', 'travel', 'subcontract', 'other'
  )),
  description text not null check (char_length(description) between 1 and 300),
  quantity numeric(12, 3) not null check (quantity > 0),
  unit text not null check (char_length(unit) between 1 and 30),
  unit_cost_cents bigint not null check (unit_cost_cents > 0),
  signed_total_cost_cents bigint generated always as (
    case when reversal_of is null then 1 else -1 end
    * round(quantity * unit_cost_cents)::bigint
  ) stored,
  incurred_on date not null,
  supplier text not null default '' check (char_length(supplier) <= 200),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (id, tenant_id, work_order_id),
  foreign key (work_order_id, tenant_id)
    references public.work_orders (id, tenant_id) on delete restrict,
  foreign key (task_id, tenant_id, work_order_id)
    references public.work_order_tasks (id, tenant_id, work_order_id) on delete restrict,
  foreign key (reversal_of, tenant_id, work_order_id)
    references public.work_cost_entries (id, tenant_id, work_order_id) on delete restrict
);
create index work_cost_entries_order_idx
  on public.work_cost_entries (tenant_id, work_order_id, incurred_on desc);
alter table public.work_cost_entries enable row level security;
revoke all on public.work_cost_entries from public, anon, authenticated;
grant select on public.work_cost_entries to authenticated, service_role;
create policy work_cost_entries_select on public.work_cost_entries
  for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin']::public.app_role[])
  );
create function public.reject_work_cost_change() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'El coste registrado es inmutable; crea una anulación';
  return old;
end;
$$;
create trigger work_cost_entries_immutable
  before update or delete on public.work_cost_entries
  for each row execute function public.reject_work_cost_change();
revoke execute on function public.reject_work_cost_change()
  from public, anon, authenticated;

create function public.record_work_cost(
  p_tenant_id uuid, p_work_order_id uuid, p_task_id uuid,
  p_kind text, p_description text, p_quantity numeric, p_unit text,
  p_unit_cost_cents bigint, p_incurred_on date, p_supplier text,
  p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  prior public.work_cost_entries%rowtype;
  work public.work_orders%rowtype;
  clean_description text := trim(p_description);
  clean_unit text := trim(p_unit);
  clean_supplier text := trim(coalesce(p_supplier, ''));
  created_id uuid;
begin
  if p_tenant_id is null or p_work_order_id is null or p_operation_id is null
     or p_kind is null or p_kind not in (
       'labor', 'material', 'product', 'travel', 'subcontract', 'other'
     ) or clean_description is null or char_length(clean_description) not between 1 and 300
     or clean_unit is null or char_length(clean_unit) not between 1 and 30
     or char_length(clean_supplier) > 200
     or p_quantity is null or p_quantity <= 0 or p_quantity > 999999999.999
     or p_quantity <> round(p_quantity, 3)
     or p_unit_cost_cents is null or p_unit_cost_cents <= 0
     or round(p_quantity * p_unit_cost_cents) > 9000000000000000
     or p_incurred_on is null then
    raise exception 'Datos de coste inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para registrar costes' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_operation_id::text, 0)
  );
  select * into prior from public.work_cost_entries where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.work_order_id <> p_work_order_id
       or prior.task_id is distinct from p_task_id or prior.reversal_of is not null
       or prior.kind <> p_kind or prior.description <> clean_description
       or prior.quantity <> p_quantity or prior.unit <> clean_unit
       or prior.unit_cost_cents <> p_unit_cost_cents
       or prior.incurred_on <> p_incurred_on or prior.supplier <> clean_supplier then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return prior.id;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede registrar costes' using errcode = 'P0402';
  end if;
  select * into work from public.work_orders
  where id = p_work_order_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Trabajo no encontrado' using errcode = 'P0002'; end if;
  if p_task_id is not null and not exists (
    select 1 from public.work_order_tasks t
    where t.id = p_task_id and t.tenant_id = p_tenant_id
      and t.work_order_id = p_work_order_id
  ) then
    raise exception 'La tarea no pertenece al trabajo' using errcode = 'P0409';
  end if;
  insert into public.work_cost_entries (
    operation_id, tenant_id, work_order_id, task_id, kind,
    description, quantity, unit, unit_cost_cents, incurred_on, supplier, created_by
  ) values (
    p_operation_id, p_tenant_id, p_work_order_id, p_task_id, p_kind,
    clean_description, p_quantity, clean_unit, p_unit_cost_cents,
    p_incurred_on, clean_supplier, (select auth.uid())
  ) returning id into created_id;
  return created_id;
end;
$$;
revoke all on function public.record_work_cost(
  uuid, uuid, uuid, text, text, numeric, text, bigint, date, text, uuid
) from public, anon, authenticated;
grant execute on function public.record_work_cost(
  uuid, uuid, uuid, text, text, numeric, text, bigint, date, text, uuid
) to authenticated;

create function public.reverse_work_cost(
  p_tenant_id uuid, p_entry_id uuid, p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  original public.work_cost_entries%rowtype;
  prior public.work_cost_entries%rowtype;
  created_id uuid;
begin
  if p_tenant_id is null or p_entry_id is null or p_operation_id is null then
    raise exception 'Datos de anulación inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para anular costes' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_operation_id::text, 0)
  );
  select * into prior from public.work_cost_entries where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.reversal_of is distinct from p_entry_id then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return prior.id;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede anular costes' using errcode = 'P0402';
  end if;
  select * into original from public.work_cost_entries
  where id = p_entry_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Coste no encontrado' using errcode = 'P0002'; end if;
  if original.reversal_of is not null or exists (
    select 1 from public.work_cost_entries e where e.reversal_of = original.id
  ) then
    raise exception 'El coste ya se anuló' using errcode = 'P0409';
  end if;
  insert into public.work_cost_entries (
    operation_id, tenant_id, work_order_id, task_id, reversal_of,
    kind, description, quantity, unit, unit_cost_cents, incurred_on,
    supplier, created_by
  ) values (
    p_operation_id, original.tenant_id, original.work_order_id, original.task_id,
    original.id, original.kind, original.description, original.quantity,
    original.unit, original.unit_cost_cents, current_date,
    original.supplier, (select auth.uid())
  ) returning id into created_id;
  return created_id;
end;
$$;
revoke all on function public.reverse_work_cost(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reverse_work_cost(uuid, uuid, uuid)
  to authenticated;

create function public.work_cost_summary(
  p_tenant_id uuid, p_work_order_id uuid
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  total_cents bigint;
  entry_count bigint;
begin
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para consultar costes' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.work_orders w
    where w.id = p_work_order_id and w.tenant_id = p_tenant_id
  ) then
    raise exception 'Trabajo no encontrado' using errcode = 'P0002';
  end if;
  select coalesce(sum(signed_total_cost_cents), 0)::bigint, count(*)
  into total_cents, entry_count from public.work_cost_entries
  where tenant_id = p_tenant_id and work_order_id = p_work_order_id;
  return jsonb_build_object('netCents', total_cents, 'entryCount', entry_count);
end;
$$;
revoke all on function public.work_cost_summary(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.work_cost_summary(uuid, uuid) to authenticated;
