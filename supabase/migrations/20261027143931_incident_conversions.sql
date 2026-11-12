-- A conversion is a single atomic command with an immutable origin and destination.
create table public.service_incident_conversions (
  operation_id uuid primary key,
  tenant_id uuid not null,
  incident_id uuid not null,
  kind text not null check (kind in ('estimate', 'work', 'visit')),
  estimate_id uuid,
  work_order_id uuid,
  visit_id uuid,
  request jsonb not null check (jsonb_typeof(request) = 'object'),
  actor_id uuid not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, incident_id, kind),
  check (
    (kind = 'estimate' and estimate_id is not null and work_order_id is null and visit_id is null)
    or (kind = 'work' and work_order_id is not null and estimate_id is null and visit_id is null)
    or (kind = 'visit' and visit_id is not null and estimate_id is null and work_order_id is null)
  ),
  foreign key (incident_id, tenant_id)
    references public.service_incidents (id, tenant_id) on delete restrict,
  foreign key (estimate_id, tenant_id)
    references public.estimates (id, tenant_id) on delete restrict,
  foreign key (work_order_id, tenant_id)
    references public.work_orders (id, tenant_id) on delete restrict,
  foreign key (visit_id, tenant_id)
    references public.service_visits (id, tenant_id) on delete restrict
);
create trigger service_incident_conversions_immutable
  before update or delete on public.service_incident_conversions
  for each row execute function public.reject_work_history_change();
alter table public.service_incident_conversions enable row level security;
revoke all on public.service_incident_conversions from public, anon, authenticated;
grant select on public.service_incident_conversions to authenticated, service_role;
create policy service_incident_conversions_select
  on public.service_incident_conversions for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
  );

create function public.convert_service_incident(
  p_tenant_id uuid, p_incident_id uuid, p_kind text,
  p_local_start timestamp, p_duration_minutes integer,
  p_assigned_user_id uuid, p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  incident public.service_incidents%rowtype;
  prior public.service_incident_conversions%rowtype;
  customer public.clients%rowtype;
  place public.service_locations%rowtype;
  asset public.service_assets%rowtype;
  tenant public.tenants%rowtype;
  request_data jsonb;
  destination_id uuid;
  deposit numeric(5, 2);
  middle numeric(5, 2);
begin
  if p_tenant_id is null or p_incident_id is null or p_operation_id is null
     or p_kind is null or p_kind not in ('estimate', 'work', 'visit')
     or (p_kind <> 'visit' and (p_local_start is not null
       or p_duration_minutes is not null or p_assigned_user_id is not null))
     or (p_kind = 'visit' and (p_local_start is null
       or p_duration_minutes is null or p_duration_minutes not between 15 and 720)) then
    raise exception 'Datos de conversión inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para convertir incidencias'
      using errcode = '42501';
  end if;
  request_data := jsonb_build_object(
    'incident_id', p_incident_id, 'kind', p_kind,
    'local_start', p_local_start, 'duration_minutes', p_duration_minutes,
    'assigned_user_id', p_assigned_user_id
  );
  -- The incident lock serializes attempts with different operation IDs.
  select * into incident from public.service_incidents
    where id = p_incident_id and tenant_id = p_tenant_id for update;
  if not found then
    raise exception 'Incidencia no encontrada' using errcode = 'P0002';
  end if;
  select * into prior from public.service_incident_conversions
    where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.request <> request_data then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return coalesce(prior.estimate_id, prior.work_order_id, prior.visit_id);
  end if;
  if exists (select 1 from public.service_incident_conversions
    where tenant_id = p_tenant_id and incident_id = p_incident_id and kind = p_kind) then
    raise exception 'La incidencia ya tiene este destino' using errcode = 'P0409';
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede convertir incidencias'
      using errcode = 'P0402';
  end if;
  if incident.status = 'canceled' then
    raise exception 'No se puede convertir una incidencia cancelada'
      using errcode = 'P0409';
  end if;
  select * into customer from public.clients
    where id = incident.client_id and tenant_id = p_tenant_id;
  if customer.archived_at is not null then
    raise exception 'El cliente está archivado' using errcode = 'P0409';
  end if;
  select * into tenant from public.tenants where id = p_tenant_id;
  if incident.location_id is not null then
    select * into place from public.service_locations
      where id = incident.location_id and tenant_id = p_tenant_id;
    if not place.active and p_kind <> 'estimate' then
      raise exception 'La ubicación ya no está activa' using errcode = 'P0409';
    end if;
  end if;
  if incident.asset_id is not null then
    select * into asset from public.service_assets
      where id = incident.asset_id and tenant_id = p_tenant_id;
    if asset.status = 'retired' and p_kind <> 'estimate' then
      raise exception 'El activo está retirado' using errcode = 'P0409';
    end if;
  end if;

  if p_kind = 'estimate' then
    insert into public.estimates (
      tenant_id, client_id, title, vat_rate, valid_until
    ) values (
      p_tenant_id, incident.client_id, incident.title,
      tenant.default_vat_rate, current_date + 30
    ) returning id into destination_id;
    deposit := tenant.default_deposit_percent;
    middle := pg_catalog.round((100 - deposit) / 2, 0);
    insert into public.estimate_milestones
      (tenant_id, estimate_id, position, label, percent)
    values
      (p_tenant_id, destination_id, 0, 'Señal a la aceptación', deposit),
      (p_tenant_id, destination_id, 1, 'Mitad de obra', middle),
      (p_tenant_id, destination_id, 2, 'Entrega final', 100 - deposit - middle);
  elsif p_kind = 'work' then
    insert into public.work_orders (
      tenant_id, client_id, location_id, asset_id, title, kind,
      description, responsible_user_id, source_snapshot, created_by
    ) values (
      p_tenant_id, incident.client_id, incident.location_id, incident.asset_id,
      incident.title, 'repair', incident.description, incident.assigned_user_id,
      jsonb_build_object(
        'origin_kind', 'incident', 'incident_id', incident.id,
        'incident_title', incident.title,
        'client', jsonb_build_object('id', customer.id, 'name', customer.name),
        'location', case when incident.location_id is null then null
          else jsonb_build_object('id', place.id, 'name', place.name,
            'address', place.address) end,
        'asset', case when incident.asset_id is null then null
          else jsonb_build_object('id', asset.id, 'name', asset.name,
            'kind', asset.kind) end
      ), (select auth.uid())
    ) returning id into destination_id;
    insert into public.work_order_events
      (operation_id, tenant_id, work_order_id, kind, payload, actor_id)
    values (p_operation_id, p_tenant_id, destination_id, 'created',
      jsonb_build_object('origin_kind', 'incident', 'incident_id', incident.id),
      (select auth.uid()));
  else
    destination_id := public.create_service_visit_local(
      p_tenant_id, incident.client_id, incident.location_id, incident.asset_id,
      null, incident.title, coalesce(p_assigned_user_id, incident.assigned_user_id),
      p_local_start, coalesce(place.timezone, 'Europe/Madrid'),
      p_duration_minutes, incident.priority,
      pg_catalog.left(incident.description, 2000), p_operation_id
    );
  end if;

  insert into public.service_incident_conversions (
    operation_id, tenant_id, incident_id, kind,
    estimate_id, work_order_id, visit_id, request, actor_id
  ) values (
    p_operation_id, p_tenant_id, p_incident_id, p_kind,
    case when p_kind = 'estimate' then destination_id end,
    case when p_kind = 'work' then destination_id end,
    case when p_kind = 'visit' then destination_id end,
    request_data, (select auth.uid())
  );
  return destination_id;
end;
$$;
revoke all on function public.convert_service_incident(
  uuid, uuid, text, timestamp, integer, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.convert_service_incident(
  uuid, uuid, text, timestamp, integer, uuid, uuid
) to authenticated;
