-- Internal review marker follows the existing immutable field-entry ledger.
-- Closed snapshots, shares, stock movements and financial flows are unchanged.
alter table public.service_visit_field_entries
  add column office_review_requested boolean not null default false,
  add constraint service_visit_field_entries_office_review_material_only
    check (not office_review_requested or kind in ('material', 'spare', 'product'));

create function app_private.record_service_visit_material(
  p_tenant_id uuid, p_visit_id uuid, p_kind text,
  p_description text, p_quantity numeric, p_unit text,
  p_occurred_at timestamptz, p_supersedes_id uuid, p_operation_id uuid,
  p_office_review_requested boolean
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target public.service_visits%rowtype;
  prior public.service_visit_field_entries%rowtype;
  superseded public.service_visit_field_entries%rowtype;
  clean_description text := pg_catalog.btrim(p_description);
  clean_unit text := pg_catalog.btrim(p_unit);
  created_id uuid;
begin
  if p_tenant_id is null or p_visit_id is null or p_operation_id is null
     or p_kind is null or p_kind not in ('material', 'spare', 'product')
     or p_office_review_requested is null
     or clean_description is null
     or char_length(clean_description) not between 1 and 300
     or clean_unit is null or char_length(clean_unit) not between 1 and 30
     or p_quantity is null or p_quantity <= 0 or p_quantity > 999999999.999
     or p_quantity <> round(p_quantity, 3)
     or p_occurred_at is null
     or p_occurred_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'Datos de actividad inválidos' using errcode = '22023';
  end if;
  if actor is null or not (
    coalesce(public.has_role(p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]), false)
    or coalesce(public.can_access_assigned_visit(p_tenant_id, p_visit_id), false)
  ) then
    raise exception 'No tienes permiso para registrar actividad'
      using errcode = '42501';
  end if;
  select * into target from public.service_visits
  where id = p_visit_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Visita no encontrada' using errcode = 'P0002'; end if;
  if not (
    coalesce(public.has_role(p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]), false)
    or coalesce(public.can_access_assigned_visit(p_tenant_id, p_visit_id), false)
  ) then
    raise exception 'No tienes permiso para registrar actividad'
      using errcode = '42501';
  end if;
  select * into prior from public.service_visit_field_entries
  where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.visit_id <> p_visit_id
       or prior.recorded_by <> actor
       or prior.kind <> p_kind or prior.description <> clean_description
       or prior.quantity <> p_quantity or prior.unit <> clean_unit
       or prior.occurred_at <> p_occurred_at
       or prior.supersedes_id is distinct from p_supersedes_id
       or prior.office_review_requested is distinct from p_office_review_requested then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return prior.id;
  end if;
  if not coalesce(public.tenant_can_write(p_tenant_id), false) then
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
    supersedes_id, office_review_requested
  ) values (
    p_operation_id, p_tenant_id, p_visit_id,
    target.work_order_id, target.contract_id,
    p_kind, clean_description, p_quantity, clean_unit,
    p_occurred_at, actor, p_supersedes_id, p_office_review_requested
  ) returning id into created_id;
  return created_id;
end;
$$;

-- The previous record_service_visit_field_entry RPC is deliberately unchanged.
create function public.record_service_visit_material(
  p_tenant_id uuid, p_visit_id uuid, p_kind text,
  p_description text, p_quantity numeric, p_unit text,
  p_occurred_at timestamptz, p_supersedes_id uuid, p_operation_id uuid,
  p_office_review_requested boolean
) returns uuid
language sql security invoker set search_path = ''
begin atomic
  select app_private.record_service_visit_material(
    p_tenant_id, p_visit_id, p_kind, p_description, p_quantity, p_unit,
    p_occurred_at, p_supersedes_id, p_operation_id, p_office_review_requested
  );
end;

-- Only project operational material names and units (no price, SKU, cost,
-- inventory, supplier or other catalog data). Initial options are alphabetical.
create function app_private.list_service_visit_material_choices(
  p_tenant_id uuid, p_visit_id uuid, p_search text
) returns table (id uuid, name text, unit text)
language sql stable security definer set search_path = ''
as $$
  select item.id, item.name, coalesce(nullif(left(btrim(item.unit), 30), ''), 'ud') as unit
  from public.catalog_items item
  where item.tenant_id = p_tenant_id and item.kind = 'material'
    and (select auth.uid()) is not null and p_visit_id is not null
    and (
      coalesce(public.has_role(p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]), false)
      or coalesce(public.can_access_assigned_visit(p_tenant_id, p_visit_id), false)
    )
    and exists (
      select 1 from public.service_visits visit
      where visit.id = p_visit_id and visit.tenant_id = p_tenant_id
        and visit.status in ('scheduled', 'in_progress')
    )
    and (
      coalesce(btrim(p_search), '') = ''
      or strpos(lower(item.name), lower(left(btrim(p_search), 80))) > 0
    )
  order by lower(item.name), item.id
  limit 40;
$$;

create function public.list_service_visit_material_choices(
  p_tenant_id uuid, p_visit_id uuid, p_search text
) returns table (id uuid, name text, unit text)
language sql stable security invoker set search_path = ''
begin atomic
  select * from app_private.list_service_visit_material_choices(p_tenant_id, p_visit_id, p_search);
end;

-- Office-only projection for the internal report review inbox. Corrections
-- replace the old flag when the newest ledger row is shown.
create function public.list_service_visit_materials_for_review(
  p_tenant_id uuid, p_visit_id uuid, p_offset integer
) returns table (id uuid, description text, quantity numeric, unit text, occurred_at timestamptz)
language sql stable security invoker set search_path = ''
as $$
  select entry.id, entry.description, entry.quantity, entry.unit, entry.occurred_at
  from public.service_visit_field_entries entry
  where entry.tenant_id = p_tenant_id and entry.visit_id = p_visit_id
    and coalesce(p_offset, 0) between 0 and 5000
    and (select auth.uid()) is not null
    and coalesce(public.has_role(p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]), false)
    and entry.office_review_requested
    and not exists (
      select 1 from public.service_visit_field_entries correction
      where correction.tenant_id = entry.tenant_id and correction.visit_id = entry.visit_id
        and correction.supersedes_id = entry.id
    )
  order by entry.occurred_at desc, entry.id desc
  offset greatest(0, least(coalesce(p_offset, 0), 5000))
  limit 21;
$$;

revoke all on function app_private.record_service_visit_material(uuid, uuid, text, text, numeric, text, timestamptz, uuid, uuid, boolean),
  app_private.list_service_visit_material_choices(uuid, uuid, text),
  public.record_service_visit_material(uuid, uuid, text, text, numeric, text, timestamptz, uuid, uuid, boolean),
  public.list_service_visit_material_choices(uuid, uuid, text),
  public.list_service_visit_materials_for_review(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function app_private.record_service_visit_material(uuid, uuid, text, text, numeric, text, timestamptz, uuid, uuid, boolean),
  app_private.list_service_visit_material_choices(uuid, uuid, text),
  public.record_service_visit_material(uuid, uuid, text, text, numeric, text, timestamptz, uuid, uuid, boolean),
  public.list_service_visit_material_choices(uuid, uuid, text),
  public.list_service_visit_materials_for_review(uuid, uuid, integer)
  to authenticated;

notify pgrst, 'reload schema';
