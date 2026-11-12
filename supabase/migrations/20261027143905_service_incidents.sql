-- M16: incidents retain their customer/asset context and an auditable lifecycle.
alter table public.installed_equipment
  add constraint installed_equipment_id_tenant_asset_unique
  unique (id, tenant_id, asset_id);

create table public.service_incidents (
  id uuid primary key default gen_random_uuid(),
  creation_operation_id uuid not null unique,
  tenant_id uuid not null,
  client_id uuid not null,
  location_id uuid,
  asset_id uuid,
  equipment_id uuid,
  source_visit_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  description text not null check (char_length(description) between 1 and 4000),
  priority text not null check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'reopened', 'canceled')),
  assigned_user_id uuid,
  due_at timestamptz,
  coverage_kind text not null default 'unassessed'
    check (coverage_kind in (
      'unassessed', 'contract', 'warranty', 'chargeable', 'excluded'
    )),
  coverage_evidence text not null default ''
    check (char_length(coverage_evidence) <= 1000),
  diagnosis text not null default '' check (char_length(diagnosis) <= 4000),
  resolution text not null default '' check (char_length(resolution) <= 4000),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (id, tenant_id),
  foreign key (client_id, tenant_id)
    references public.clients (id, tenant_id) on delete restrict,
  foreign key (location_id, tenant_id, client_id)
    references public.service_locations (id, tenant_id, client_id) on delete restrict,
  foreign key (asset_id, tenant_id, location_id)
    references public.service_assets (id, tenant_id, location_id) on delete restrict,
  foreign key (equipment_id, tenant_id, asset_id)
    references public.installed_equipment (id, tenant_id, asset_id) on delete restrict,
  foreign key (source_visit_id, tenant_id)
    references public.service_visits (id, tenant_id) on delete restrict,
  foreign key (tenant_id, assigned_user_id)
    references public.memberships (tenant_id, user_id) on delete restrict,
  check (asset_id is null or location_id is not null),
  check (equipment_id is null or asset_id is not null),
  check (coverage_kind = 'unassessed' or char_length(coverage_evidence) >= 5),
  check ((status = 'resolved') = (resolved_at is not null))
);
create function public.protect_service_incident_context() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and row(
    new.tenant_id, new.client_id, new.location_id, new.asset_id,
    new.equipment_id, new.source_visit_id, new.creation_operation_id,
    new.created_by, new.created_at
  ) is distinct from row(
    old.tenant_id, old.client_id, old.location_id, old.asset_id,
    old.equipment_id, old.source_visit_id, old.creation_operation_id,
    old.created_by, old.created_at
  ) then
    raise exception 'El origen de la incidencia es inmutable'
      using errcode = 'P0409';
  end if;
  if new.source_visit_id is not null and not exists (
    select 1 from public.service_visits v
    where v.id = new.source_visit_id and v.tenant_id = new.tenant_id
      and v.client_id = new.client_id
      and v.location_id is not distinct from new.location_id
      and v.asset_id is not distinct from new.asset_id
  ) then
    raise exception 'La incidencia no coincide con la visita'
      using errcode = 'P0409';
  end if;
  return new;
end;
$$;
create trigger service_incidents_protect_context
  before insert or update on public.service_incidents
  for each row execute function public.protect_service_incident_context();
revoke all on function public.protect_service_incident_context()
  from public, anon, authenticated;
create index service_incidents_client_idx
  on public.service_incidents (tenant_id, client_id, created_at desc);
create index service_incidents_due_idx
  on public.service_incidents (tenant_id, status, due_at)
  where due_at is not null;
create index service_incidents_assignee_idx
  on public.service_incidents (tenant_id, assigned_user_id, status)
  where assigned_user_id is not null;
create index service_incidents_visit_idx
  on public.service_incidents (tenant_id, source_visit_id)
  where source_visit_id is not null;
create trigger service_incidents_touch
  before update on public.service_incidents
  for each row execute function public.touch_service_visit_version();

create table public.service_incident_events (
  operation_id uuid primary key,
  tenant_id uuid not null,
  incident_id uuid not null,
  kind text not null check (kind in ('created', 'updated')),
  request jsonb not null check (jsonb_typeof(request) = 'object'),
  before_state jsonb,
  after_state jsonb not null check (jsonb_typeof(after_state) = 'object'),
  actor_id uuid not null,
  occurred_at timestamptz not null default now(),
  foreign key (incident_id, tenant_id)
    references public.service_incidents (id, tenant_id) on delete restrict
);
create index service_incident_events_incident_idx
  on public.service_incident_events (tenant_id, incident_id, occurred_at desc);
create trigger service_incident_events_immutable
  before update or delete on public.service_incident_events
  for each row execute function public.reject_work_history_change();

alter table public.service_incidents enable row level security;
alter table public.service_incident_events enable row level security;
revoke all on public.service_incidents, public.service_incident_events
  from public, anon, authenticated;
grant select on public.service_incidents, public.service_incident_events
  to authenticated, service_role;
create policy service_incidents_select on public.service_incidents
  for select to authenticated using (
    public.has_role(tenant_id,
      array['owner', 'admin', 'editor']::public.app_role[])
    or (public.has_role(tenant_id, array['technician']::public.app_role[])
      and (assigned_user_id = (select auth.uid()) or exists (
        select 1 from public.service_visits v
        where v.id = service_incidents.source_visit_id
          and v.tenant_id = service_incidents.tenant_id
          and v.assigned_user_id = (select auth.uid())
      )))
  );
create policy service_incident_events_select on public.service_incident_events
  for select to authenticated using (
    exists (
      select 1 from public.service_incidents i
      where i.id = service_incident_events.incident_id
        and i.tenant_id = service_incident_events.tenant_id
    )
  );

create function public.create_service_incident(
  p_tenant_id uuid, p_client_id uuid, p_location_id uuid,
  p_asset_id uuid, p_equipment_id uuid, p_source_visit_id uuid,
  p_title text, p_description text, p_priority text,
  p_assigned_user_id uuid, p_due_at timestamptz, p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  source_visit public.service_visits%rowtype;
  prior public.service_incident_events%rowtype;
  clean_title text := pg_catalog.btrim(p_title);
  clean_description text := pg_catalog.btrim(p_description);
  office boolean;
  technician boolean;
  target_client_id uuid;
  target_location_id uuid;
  target_asset_id uuid;
  assignee uuid;
  requested jsonb;
  created_id uuid;
begin
  if p_tenant_id is null or p_operation_id is null
     or clean_title is null or char_length(clean_title) not between 1 and 200
     or clean_description is null
     or char_length(clean_description) not between 1 and 4000
     or p_priority is null
     or p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Datos de incidencia inválidos' using errcode = '22023';
  end if;
  office := public.has_role(p_tenant_id,
    array['owner', 'admin', 'editor']::public.app_role[]);
  technician := public.has_role(p_tenant_id,
    array['technician']::public.app_role[]);
  if (select auth.uid()) is null or not (office or technician) then
    raise exception 'No tienes permiso para crear incidencias'
      using errcode = '42501';
  end if;
  if p_source_visit_id is not null then
    select * into source_visit from public.service_visits
    where id = p_source_visit_id and tenant_id = p_tenant_id;
    if not found then raise exception 'Visita no encontrada' using errcode = 'P0002'; end if;
    if technician and not office and source_visit.assigned_user_id
       is distinct from (select auth.uid()) then
      raise exception 'No tienes permiso para crear incidencias'
        using errcode = '42501';
    end if;
    if (p_client_id is not null and p_client_id <> source_visit.client_id)
       or (p_location_id is not null
         and p_location_id is distinct from source_visit.location_id)
       or (p_asset_id is not null
         and p_asset_id is distinct from source_visit.asset_id) then
      raise exception 'La incidencia no coincide con la visita'
        using errcode = 'P0409';
    end if;
    target_client_id := source_visit.client_id;
    target_location_id := source_visit.location_id;
    target_asset_id := source_visit.asset_id;
  else
    if not office then
      raise exception 'El técnico necesita una visita asignada'
        using errcode = '42501';
    end if;
    target_client_id := p_client_id;
    target_location_id := p_location_id;
    target_asset_id := p_asset_id;
  end if;
  if target_client_id is null or (target_asset_id is not null and target_location_id is null)
     or (p_equipment_id is not null and target_asset_id is null) then
    raise exception 'Contexto de incidencia inválido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.clients c
    where c.id = target_client_id and c.tenant_id = p_tenant_id) then
    raise exception 'Cliente no encontrado' using errcode = 'P0002';
  end if;
  if target_location_id is not null and not exists (
    select 1 from public.service_locations l
    where l.id = target_location_id and l.tenant_id = p_tenant_id
      and l.client_id = target_client_id
  ) then raise exception 'Ubicación no encontrada' using errcode = 'P0002'; end if;
  if target_asset_id is not null and not exists (
    select 1 from public.service_assets a
    where a.id = target_asset_id and a.tenant_id = p_tenant_id
      and a.location_id = target_location_id
  ) then raise exception 'Activo no encontrado' using errcode = 'P0002'; end if;
  if p_equipment_id is not null and not exists (
    select 1 from public.installed_equipment e
    where e.id = p_equipment_id and e.tenant_id = p_tenant_id
      and e.asset_id = target_asset_id
  ) then raise exception 'Equipo no encontrado' using errcode = 'P0002'; end if;
  if technician and not office and (p_assigned_user_id is not null or p_due_at is not null) then
    raise exception 'Solo oficina puede asignar o fijar plazos'
      using errcode = '42501';
  end if;
  assignee := case when office then p_assigned_user_id else (select auth.uid()) end;
  if assignee is not null and not exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant_id and m.user_id = assignee
      and m.role in ('owner', 'admin', 'editor', 'technician')
  ) then raise exception 'Responsable no válido' using errcode = 'P0409'; end if;
  requested := pg_catalog.jsonb_build_object(
    'client', p_client_id, 'location', p_location_id, 'asset', p_asset_id,
    'equipment', p_equipment_id, 'visit', p_source_visit_id,
    'title', clean_title, 'description', clean_description,
    'priority', p_priority, 'assignee', p_assigned_user_id,
    'due', p_due_at
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_operation_id::text, 0)
  );
  select * into prior from public.service_incident_events
  where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.actor_id <> (select auth.uid())
       or prior.kind <> 'created' or prior.request <> requested then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return prior.incident_id;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede crear incidencias'
      using errcode = 'P0402';
  end if;
  insert into public.service_incidents (
    creation_operation_id, tenant_id, client_id, location_id,
    asset_id, equipment_id, source_visit_id, title, description,
    priority, assigned_user_id, due_at, created_by
  ) values (
    p_operation_id, p_tenant_id, target_client_id, target_location_id,
    target_asset_id, p_equipment_id, p_source_visit_id, clean_title,
    clean_description, p_priority, assignee, p_due_at, (select auth.uid())
  ) returning id into created_id;
  insert into public.service_incident_events (
    operation_id, tenant_id, incident_id, kind, request,
    after_state, actor_id
  ) values (
    p_operation_id, p_tenant_id, created_id, 'created', requested,
    (select pg_catalog.to_jsonb(i) from public.service_incidents i
     where i.id = created_id), (select auth.uid())
  );
  return created_id;
end;
$$;
revoke all on function public.create_service_incident(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, uuid, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.create_service_incident(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, uuid, timestamptz, uuid
) to authenticated;

create function public.update_service_incident(
  p_tenant_id uuid, p_incident_id uuid, p_expected_updated_at timestamptz,
  p_status text, p_priority text, p_assigned_user_id uuid,
  p_due_at timestamptz, p_coverage_kind text, p_coverage_evidence text,
  p_diagnosis text, p_resolution text, p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  target public.service_incidents%rowtype;
  prior public.service_incident_events%rowtype;
  office boolean;
  technician boolean;
  clean_evidence text := pg_catalog.btrim(p_coverage_evidence);
  clean_diagnosis text := pg_catalog.btrim(p_diagnosis);
  clean_resolution text := pg_catalog.btrim(p_resolution);
  requested jsonb;
begin
  if p_tenant_id is null or p_incident_id is null
     or p_expected_updated_at is null or p_operation_id is null
     or p_status is null
     or p_status not in ('open', 'in_progress', 'resolved', 'reopened', 'canceled')
     or p_priority is null or p_priority not in ('low', 'normal', 'high', 'urgent')
     or p_coverage_kind is null or p_coverage_kind not in (
       'unassessed', 'contract', 'warranty', 'chargeable', 'excluded'
     ) or clean_evidence is null or char_length(clean_evidence) > 1000
     or (p_coverage_kind <> 'unassessed' and char_length(clean_evidence) < 5)
     or clean_diagnosis is null or char_length(clean_diagnosis) > 4000
     or clean_resolution is null or char_length(clean_resolution) > 4000
     or (p_status in ('resolved', 'canceled') and clean_resolution = '') then
    raise exception 'Datos de incidencia inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null then
    raise exception 'Sesión requerida' using errcode = '28000';
  end if;
  select * into target from public.service_incidents
  where id = p_incident_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Incidencia no encontrada' using errcode = 'P0002'; end if;
  office := public.has_role(p_tenant_id,
    array['owner', 'admin', 'editor']::public.app_role[]);
  technician := public.has_role(p_tenant_id,
    array['technician']::public.app_role[])
    and (target.assigned_user_id = (select auth.uid()) or exists (
      select 1 from public.service_visits v
      where v.id = target.source_visit_id and v.tenant_id = p_tenant_id
        and v.assigned_user_id = (select auth.uid())
    ));
  if not office and not technician then
    raise exception 'No tienes permiso para cambiar la incidencia'
      using errcode = '42501';
  end if;
  requested := pg_catalog.jsonb_build_object(
    'expected', p_expected_updated_at, 'status', p_status,
    'priority', p_priority, 'assignee', p_assigned_user_id,
    'due', p_due_at, 'coverage', p_coverage_kind,
    'coverage_evidence', clean_evidence,
    'diagnosis', clean_diagnosis, 'resolution', clean_resolution
  );
  select * into prior from public.service_incident_events
  where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.incident_id <> p_incident_id
       or prior.actor_id <> (select auth.uid()) or prior.kind <> 'updated'
       or prior.request <> requested then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return target.id;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede cambiar incidencias'
      using errcode = 'P0402';
  end if;
  if target.updated_at <> p_expected_updated_at then
    raise exception 'La incidencia cambió en otra sesión; recarga la ficha'
      using errcode = 'P0409';
  end if;
  if technician and not office and (
    p_priority <> target.priority
    or p_assigned_user_id is distinct from target.assigned_user_id
    or p_due_at is distinct from target.due_at
    or p_coverage_kind <> target.coverage_kind
    or clean_evidence <> target.coverage_evidence
    or p_status = 'canceled'
  ) then
    raise exception 'Solo oficina puede cambiar prioridad, responsable, plazo o cobertura'
      using errcode = '42501';
  end if;
  if p_assigned_user_id is not null and not exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant_id and m.user_id = p_assigned_user_id
      and m.role in ('owner', 'admin', 'editor', 'technician')
  ) then raise exception 'Responsable no válido' using errcode = 'P0409'; end if;
  if p_status <> target.status and not (
    (target.status = 'open' and p_status in ('in_progress', 'resolved', 'canceled'))
    or (target.status = 'in_progress' and p_status in ('resolved', 'canceled'))
    or (target.status = 'resolved' and p_status = 'reopened')
    or (target.status = 'reopened' and p_status in ('in_progress', 'resolved', 'canceled'))
  ) then
    raise exception 'Transición de incidencia no permitida'
      using errcode = 'P0409';
  end if;
  update public.service_incidents set
    status = p_status, priority = p_priority,
    assigned_user_id = p_assigned_user_id, due_at = p_due_at,
    coverage_kind = p_coverage_kind,
    coverage_evidence = clean_evidence,
    diagnosis = clean_diagnosis, resolution = clean_resolution,
    resolved_at = case when p_status = 'resolved'
      then coalesce(target.resolved_at, clock_timestamp()) else null end
  where id = target.id;
  insert into public.service_incident_events (
    operation_id, tenant_id, incident_id, kind, request,
    before_state, after_state, actor_id
  ) values (
    p_operation_id, p_tenant_id, target.id, 'updated', requested,
    pg_catalog.to_jsonb(target),
    (select pg_catalog.to_jsonb(i) from public.service_incidents i
     where i.id = target.id), (select auth.uid())
  );
  return target.id;
end;
$$;
revoke all on function public.update_service_incident(
  uuid, uuid, timestamptz, text, text, uuid,
  timestamptz, text, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.update_service_incident(
  uuid, uuid, timestamptz, text, text, uuid,
  timestamptz, text, text, text, text, uuid
) to authenticated;
