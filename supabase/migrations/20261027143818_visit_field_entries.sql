-- M14/M17: field evidence is append only and belongs to its visit and origin.
-- Quantities do not expose internal unit costs to technicians.
create table public.service_visit_field_entries (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  tenant_id uuid not null,
  visit_id uuid not null,
  work_order_id uuid,
  contract_id uuid,
  kind text not null check (kind in (
    'labor', 'travel', 'material', 'spare', 'product', 'corrective_action'
  )),
  description text not null check (char_length(description) between 1 and 300),
  quantity numeric(12, 3) not null check (quantity > 0 and quantity <= 999999999.999),
  unit text not null check (char_length(unit) between 1 and 30),
  occurred_at timestamptz not null,
  recorded_by uuid not null,
  recorded_at timestamptz not null default now(),
  supersedes_id uuid,
  unique (id, tenant_id, visit_id),
  foreign key (visit_id, tenant_id)
    references public.service_visits (id, tenant_id) on delete restrict,
  foreign key (work_order_id, tenant_id)
    references public.work_orders (id, tenant_id) on delete restrict,
  foreign key (contract_id, tenant_id)
    references public.service_contracts (id, tenant_id) on delete restrict,
  foreign key (supersedes_id, tenant_id, visit_id)
    references public.service_visit_field_entries (id, tenant_id, visit_id)
    on delete restrict,
  check (work_order_id is null or contract_id is null),
  check (kind <> 'labor' or (unit = 'min' and quantity <= 1440)),
  check (kind <> 'travel' or (unit in ('min', 'km') and quantity <= 1440)),
  check (kind <> 'corrective_action' or (quantity = 1 and unit = 'ud'))
);
create unique index service_visit_field_entries_one_successor_idx
  on public.service_visit_field_entries (supersedes_id)
  where supersedes_id is not null;
create index service_visit_field_entries_visit_idx
  on public.service_visit_field_entries (tenant_id, visit_id, occurred_at desc);
create index service_visit_field_entries_work_idx
  on public.service_visit_field_entries (tenant_id, work_order_id, occurred_at desc)
  where work_order_id is not null;
create index service_visit_field_entries_contract_idx
  on public.service_visit_field_entries (tenant_id, contract_id, occurred_at desc)
  where contract_id is not null;
create trigger service_visit_field_entries_immutable
  before update or delete on public.service_visit_field_entries
  for each row execute function public.reject_work_history_change();
alter table public.service_visit_field_entries enable row level security;
revoke all on public.service_visit_field_entries from public, anon, authenticated;
grant select on public.service_visit_field_entries to authenticated, service_role;
create policy service_visit_field_entries_select
  on public.service_visit_field_entries for select to authenticated using (
    public.has_role(tenant_id,
      array['owner', 'admin', 'editor']::public.app_role[])
    or exists (
      select 1 from public.service_visits v
      where v.id = service_visit_field_entries.visit_id
        and v.tenant_id = service_visit_field_entries.tenant_id
        and v.assigned_user_id = (select auth.uid())
        and public.has_role(service_visit_field_entries.tenant_id,
          array['technician']::public.app_role[])
    )
  );

create function public.record_service_visit_field_entry(
  p_tenant_id uuid, p_visit_id uuid, p_kind text,
  p_description text, p_quantity numeric, p_unit text,
  p_occurred_at timestamptz, p_supersedes_id uuid, p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  target public.service_visits%rowtype;
  prior public.service_visit_field_entries%rowtype;
  superseded public.service_visit_field_entries%rowtype;
  clean_description text := pg_catalog.btrim(p_description);
  clean_unit text := pg_catalog.btrim(p_unit);
  created_id uuid;
begin
  if p_tenant_id is null or p_visit_id is null or p_operation_id is null
     or p_kind is null or p_kind not in (
       'labor', 'travel', 'material', 'spare', 'product', 'corrective_action'
     ) or clean_description is null
     or char_length(clean_description) not between 1 and 300
     or clean_unit is null or char_length(clean_unit) not between 1 and 30
     or p_quantity is null or p_quantity <= 0 or p_quantity > 999999999.999
     or p_quantity <> round(p_quantity, 3)
     or p_occurred_at is null
     or p_occurred_at > clock_timestamp() + interval '5 minutes'
     or (p_kind = 'labor' and (clean_unit <> 'min' or p_quantity > 1440))
     or (p_kind = 'travel' and (
       clean_unit not in ('min', 'km') or p_quantity > 1440
     ))
     or (p_kind = 'corrective_action' and (
       p_quantity <> 1 or clean_unit <> 'ud'
     )) then
    raise exception 'Datos de actividad inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(p_tenant_id,
    array['owner', 'admin', 'editor', 'technician']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para registrar actividad'
      using errcode = '42501';
  end if;
  select * into target from public.service_visits
  where id = p_visit_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Visita no encontrada' using errcode = 'P0002'; end if;
  if not (public.has_role(p_tenant_id,
      array['owner', 'admin', 'editor']::public.app_role[])
    or (target.assigned_user_id = (select auth.uid())
      and public.has_role(p_tenant_id, array['technician']::public.app_role[]))) then
    raise exception 'No tienes permiso para registrar actividad'
      using errcode = '42501';
  end if;
  select * into prior from public.service_visit_field_entries
  where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.visit_id <> p_visit_id
       or prior.kind <> p_kind or prior.description <> clean_description
       or prior.quantity <> p_quantity or prior.unit <> clean_unit
       or prior.occurred_at <> p_occurred_at
       or prior.supersedes_id is distinct from p_supersedes_id then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return prior.id;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede registrar actividad'
      using errcode = 'P0402';
  end if;
  if target.status not in ('scheduled', 'in_progress') then
    raise exception 'La visita cerrada no admite nuevas actividades'
      using errcode = 'P0409';
  end if;
  if target.work_order_id is not null and target.contract_id is not null then
    raise exception 'La visita tiene dos orígenes de coste'
      using errcode = 'P0409';
  end if;
  if p_supersedes_id is not null then
    select * into superseded from public.service_visit_field_entries
    where id = p_supersedes_id and tenant_id = p_tenant_id
      and visit_id = p_visit_id and kind = p_kind;
    if not found then raise exception 'Actividad original no encontrada'
      using errcode = 'P0002'; end if;
    if exists (select 1 from public.service_visit_field_entries e
      where e.supersedes_id = p_supersedes_id) then
      raise exception 'Esta actividad ya tiene una corrección'
        using errcode = 'P0409';
    end if;
  end if;
  insert into public.service_visit_field_entries (
    operation_id, tenant_id, visit_id, work_order_id, contract_id,
    kind, description, quantity, unit, occurred_at, recorded_by,
    supersedes_id
  ) values (
    p_operation_id, p_tenant_id, p_visit_id,
    target.work_order_id, target.contract_id,
    p_kind, clean_description, p_quantity, clean_unit,
    p_occurred_at, (select auth.uid()), p_supersedes_id
  ) returning id into created_id;
  return created_id;
end;
$$;
revoke all on function public.record_service_visit_field_entry(
  uuid, uuid, text, text, numeric, text, timestamptz, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.record_service_visit_field_entry(
  uuid, uuid, text, text, numeric, text, timestamptz, uuid, uuid
) to authenticated;
