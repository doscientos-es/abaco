-- Office visits are operational records. They contain no internal prices or costs.
-- Composite keys keep client, location, asset and work within one company.
alter table public.service_assets
  add constraint service_assets_id_tenant_location_unique
  unique (id, tenant_id, location_id);
alter table public.work_orders
  add constraint work_orders_id_tenant_client_unique
  unique (id, tenant_id, client_id);

create table public.service_visits (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  tenant_id uuid not null,
  client_id uuid not null,
  location_id uuid,
  asset_id uuid,
  work_order_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'completed', 'skipped', 'canceled')),
  assigned_user_id uuid,
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz not null,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  notes text not null default '' check (char_length(notes) <= 2000),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (client_id, tenant_id)
    references public.clients (id, tenant_id) on delete restrict,
  foreign key (location_id, tenant_id, client_id)
    references public.service_locations (id, tenant_id, client_id) on delete restrict,
  foreign key (asset_id, tenant_id, location_id)
    references public.service_assets (id, tenant_id, location_id) on delete restrict,
  foreign key (work_order_id, tenant_id, client_id)
    references public.work_orders (id, tenant_id, client_id) on delete restrict,
  foreign key (tenant_id, assigned_user_id)
    references public.memberships (tenant_id, user_id) on delete restrict,
  check (asset_id is null or location_id is not null),
  check (scheduled_end_at > scheduled_start_at
    and scheduled_end_at <= scheduled_start_at + interval '12 hours'),
  check (actual_end_at is null or actual_start_at is not null)
);
create index service_visits_tenant_time_idx
  on public.service_visits (tenant_id, scheduled_start_at, status);
create index service_visits_assignee_time_idx
  on public.service_visits (assigned_user_id, scheduled_start_at)
  where assigned_user_id is not null;
create index service_visits_client_idx
  on public.service_visits (tenant_id, client_id, scheduled_start_at);
create index service_visits_location_idx
  on public.service_visits (location_id) where location_id is not null;
create index service_visits_asset_idx
  on public.service_visits (asset_id) where asset_id is not null;
create index service_visits_work_idx
  on public.service_visits (work_order_id) where work_order_id is not null;

create table public.service_visit_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  tenant_id uuid not null,
  visit_id uuid not null,
  kind text not null check (kind in ('created', 'status_changed')),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  actor_id uuid not null,
  occurred_at timestamptz not null default now(),
  foreign key (visit_id, tenant_id)
    references public.service_visits (id, tenant_id) on delete restrict
);
create index service_visit_events_visit_idx
  on public.service_visit_events (tenant_id, visit_id, occurred_at desc);

alter table public.service_visits enable row level security;
alter table public.service_visit_events enable row level security;
revoke all on public.service_visits, public.service_visit_events
  from public, anon, authenticated;
grant select on public.service_visits, public.service_visit_events
  to authenticated, service_role;
create policy service_visits_select on public.service_visits
  for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
    or (
      assigned_user_id = (select auth.uid())
      and public.has_role(tenant_id, array['technician']::public.app_role[])
    )
  );
create policy service_visit_events_select on public.service_visit_events
  for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
  );
create trigger service_visit_events_immutable
  before update or delete on public.service_visit_events
  for each row execute function public.reject_work_history_change();
create function public.touch_service_visit_version() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;
create trigger service_visits_touch
  before update on public.service_visits
  for each row execute function public.touch_service_visit_version();
revoke execute on function public.touch_service_visit_version()
  from public, anon, authenticated;

create function public.create_service_visit(
  p_tenant_id uuid, p_client_id uuid, p_location_id uuid,
  p_asset_id uuid, p_work_order_id uuid, p_title text,
  p_assigned_user_id uuid, p_scheduled_start_at timestamptz,
  p_scheduled_end_at timestamptz, p_priority text, p_notes text,
  p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  prior public.service_visits%rowtype;
  clean_title text := trim(p_title);
  clean_notes text := trim(coalesce(p_notes, ''));
  created_id uuid;
begin
  if p_tenant_id is null or p_client_id is null or p_operation_id is null
     or clean_title is null or char_length(clean_title) not between 1 and 200
     or char_length(clean_notes) > 2000
     or p_priority is null or p_priority not in ('low', 'normal', 'high', 'urgent')
     or p_scheduled_start_at is null or p_scheduled_end_at is null
     or p_scheduled_end_at <= p_scheduled_start_at
     or p_scheduled_end_at > p_scheduled_start_at + interval '12 hours'
     or (p_asset_id is not null and p_location_id is null) then
    raise exception 'Datos de visita inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para planificar visitas' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_operation_id::text, 0)
  );
  select * into prior from public.service_visits where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.client_id <> p_client_id
       or prior.location_id is distinct from p_location_id
       or prior.asset_id is distinct from p_asset_id
       or prior.work_order_id is distinct from p_work_order_id
       or prior.title <> clean_title
       or prior.assigned_user_id is distinct from p_assigned_user_id
       or prior.scheduled_start_at <> p_scheduled_start_at
       or prior.scheduled_end_at <> p_scheduled_end_at
       or prior.priority <> p_priority or prior.notes <> clean_notes then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return prior.id;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede planificar visitas' using errcode = 'P0402';
  end if;
  if not exists (
    select 1 from public.clients c
    where c.id = p_client_id and c.tenant_id = p_tenant_id and c.archived_at is null
  ) then
    raise exception 'Cliente no disponible' using errcode = 'P0002';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.service_locations l
    where l.id = p_location_id and l.tenant_id = p_tenant_id
      and l.client_id = p_client_id and l.active
  ) then
    raise exception 'Ubicación no disponible' using errcode = 'P0409';
  end if;
  if p_asset_id is not null and not exists (
    select 1 from public.service_assets a
    where a.id = p_asset_id and a.tenant_id = p_tenant_id
      and a.location_id = p_location_id and a.status <> 'retired'
  ) then
    raise exception 'Activo no disponible' using errcode = 'P0409';
  end if;
  if p_work_order_id is not null and not exists (
    select 1 from public.work_orders w
    where w.id = p_work_order_id and w.tenant_id = p_tenant_id
      and w.client_id = p_client_id and w.status <> 'canceled'
  ) then
    raise exception 'Trabajo no disponible' using errcode = 'P0409';
  end if;
  if p_assigned_user_id is not null then
    if not exists (
      select 1 from public.memberships m
      where m.tenant_id = p_tenant_id and m.user_id = p_assigned_user_id
        and m.role = 'technician'
    ) then
      raise exception 'Técnico no disponible' using errcode = 'P0409';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_tenant_id::text || ':' || p_assigned_user_id::text, 1)
    );
    if exists (
      select 1 from public.service_visits v
      where v.tenant_id = p_tenant_id and v.assigned_user_id = p_assigned_user_id
        and v.status in ('scheduled', 'in_progress')
        and v.scheduled_start_at < p_scheduled_end_at
        and v.scheduled_end_at > p_scheduled_start_at
    ) then
      raise exception 'El técnico ya tiene una visita en ese horario'
        using errcode = 'P0409';
    end if;
  end if;
  insert into public.service_visits (
    operation_id, tenant_id, client_id, location_id, asset_id, work_order_id,
    title, assigned_user_id, scheduled_start_at, scheduled_end_at,
    priority, notes, created_by
  ) values (
    p_operation_id, p_tenant_id, p_client_id, p_location_id, p_asset_id,
    p_work_order_id, clean_title, p_assigned_user_id,
    p_scheduled_start_at, p_scheduled_end_at, p_priority, clean_notes,
    (select auth.uid())
  ) returning id into created_id;
  insert into public.service_visit_events (
    operation_id, tenant_id, visit_id, kind, payload, actor_id
  ) values (
    p_operation_id, p_tenant_id, created_id, 'created',
    jsonb_build_object('start', p_scheduled_start_at,
      'end', p_scheduled_end_at, 'assignedUserId', p_assigned_user_id),
    (select auth.uid())
  );
  return created_id;
end;
$$;
revoke all on function public.create_service_visit(
  uuid, uuid, uuid, uuid, uuid, text, uuid, timestamptz,
  timestamptz, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.create_service_visit(
  uuid, uuid, uuid, uuid, uuid, text, uuid, timestamptz,
  timestamptz, text, text, uuid
) to authenticated;

create function public.transition_service_visit(
  p_tenant_id uuid, p_visit_id uuid, p_expected_updated_at timestamptz,
  p_next_status text, p_reason text, p_operation_id uuid
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  target public.service_visits%rowtype;
  prior public.service_visit_events%rowtype;
  office boolean;
  technician boolean;
  clean_reason text := trim(coalesce(p_reason, ''));
begin
  if p_tenant_id is null or p_visit_id is null or p_expected_updated_at is null
     or p_operation_id is null or p_next_status is null
     or p_next_status not in ('in_progress', 'completed', 'skipped', 'canceled')
     or char_length(clean_reason) > 500 then
    raise exception 'Datos de cambio de visita inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null then
    raise exception 'Sesión requerida' using errcode = '28000';
  end if;
  select * into target from public.service_visits
  where id = p_visit_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Visita no encontrada' using errcode = 'P0002'; end if;
  office := public.has_role(p_tenant_id,
    array['owner', 'admin', 'editor']::public.app_role[]);
  technician := target.assigned_user_id = (select auth.uid())
    and public.has_role(p_tenant_id, array['technician']::public.app_role[]);
  if not office and not technician then
    raise exception 'No tienes permiso para cambiar la visita' using errcode = '42501';
  end if;
  select * into prior from public.service_visit_events
  where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.visit_id <> p_visit_id
       or prior.kind <> 'status_changed'
       or prior.payload->>'to' <> p_next_status
       or prior.payload->>'reason' <> clean_reason then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return p_next_status;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede cambiar visitas' using errcode = 'P0402';
  end if;
  if target.updated_at <> p_expected_updated_at then
    raise exception 'La visita cambió en otra sesión; recarga la agenda'
      using errcode = 'P0409';
  end if;
  if technician and p_next_status not in ('in_progress', 'completed') then
    raise exception 'Solo oficina puede omitir o cancelar visitas'
      using errcode = '42501';
  end if;
  if not (
    (target.status = 'scheduled' and p_next_status in ('in_progress', 'skipped', 'canceled'))
    or (target.status = 'in_progress' and p_next_status in ('completed', 'canceled'))
  ) then
    raise exception 'Transición de visita no permitida' using errcode = 'P0409';
  end if;
  if p_next_status in ('skipped', 'canceled') and clean_reason = '' then
    raise exception 'Indica el motivo de la cancelación' using errcode = '22023';
  end if;
  update public.service_visits
  set status = p_next_status,
      actual_start_at = case when p_next_status = 'in_progress'
        then now() else actual_start_at end,
      actual_end_at = case when p_next_status = 'completed'
        then now() else actual_end_at end
  where id = target.id;
  insert into public.service_visit_events (
    operation_id, tenant_id, visit_id, kind, payload, actor_id
  ) values (
    p_operation_id, p_tenant_id, p_visit_id, 'status_changed',
    jsonb_build_object('from', target.status, 'to', p_next_status,
      'reason', clean_reason), (select auth.uid())
  );
  return p_next_status;
end;
$$;
revoke all on function public.transition_service_visit(
  uuid, uuid, timestamptz, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.transition_service_visit(
  uuid, uuid, timestamptz, text, text, uuid
) to authenticated;

create function public.my_assigned_visits(
  p_tenant_id uuid, p_from date, p_to date
) returns table (
  id uuid, title text, client_name text, location_name text,
  address text, timezone text, scheduled_start_at timestamptz,
  scheduled_end_at timestamptz, status text, priority text,
  notes text, updated_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['technician']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para consultar la jornada' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from
     or p_to > p_from + 31 then
    raise exception 'Rango de agenda inválido' using errcode = '22023';
  end if;
  return query
    select v.id, v.title, c.name, coalesce(l.name, ''),
      coalesce(l.address, ''), coalesce(l.timezone, 'Europe/Madrid'),
      v.scheduled_start_at, v.scheduled_end_at,
      v.status, v.priority, v.notes, v.updated_at
    from public.service_visits v
    join public.clients c on c.id = v.client_id and c.tenant_id = v.tenant_id
    left join public.service_locations l
      on l.id = v.location_id and l.tenant_id = v.tenant_id
    where v.tenant_id = p_tenant_id
      and v.assigned_user_id = (select auth.uid())
      and (v.scheduled_start_at at time zone
        coalesce(l.timezone, 'Europe/Madrid'))::date between p_from and p_to
      and v.status <> 'canceled'
    order by v.scheduled_start_at, v.id;
end;
$$;
revoke all on function public.my_assigned_visits(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.my_assigned_visits(uuid, date, date)
  to authenticated;

create function public.list_office_visits(
  p_tenant_id uuid, p_from date, p_to date,
  p_assigned_user_id uuid, p_page integer
) returns table (
  id uuid, title text, client_name text, location_name text,
  address text, timezone text, assigned_user_id uuid, assigned_user_name text,
  scheduled_start_at timestamptz, scheduled_end_at timestamptz,
  status text, priority text, notes text, updated_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para consultar la agenda' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from
     or p_to > p_from + 31 or p_page is null
     or p_page not between 0 and 10000 then
    raise exception 'Rango de agenda inválido' using errcode = '22023';
  end if;
  return query
    select v.id, v.title, c.name, coalesce(l.name, ''),
      coalesce(l.address, ''), coalesce(l.timezone, 'Europe/Madrid'),
      v.assigned_user_id,
      coalesce(nullif(p.full_name, ''), p.email, ''),
      v.scheduled_start_at, v.scheduled_end_at,
      v.status, v.priority, v.notes, v.updated_at
    from public.service_visits v
    join public.clients c on c.id = v.client_id and c.tenant_id = v.tenant_id
    left join public.service_locations l
      on l.id = v.location_id and l.tenant_id = v.tenant_id
    left join public.profiles p on p.id = v.assigned_user_id
    where v.tenant_id = p_tenant_id
      and (p_assigned_user_id is null
        or v.assigned_user_id = p_assigned_user_id)
      and (v.scheduled_start_at at time zone
        coalesce(l.timezone, 'Europe/Madrid'))::date between p_from and p_to
    order by v.scheduled_start_at, v.id
    limit 50 offset p_page * 50;
end;
$$;
revoke all on function public.list_office_visits(uuid, date, date, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.list_office_visits(uuid, date, date, uuid, integer)
  to authenticated;

create function public.create_service_visit_local(
  p_tenant_id uuid, p_client_id uuid, p_location_id uuid,
  p_asset_id uuid, p_work_order_id uuid, p_title text,
  p_assigned_user_id uuid, p_local_start timestamp,
  p_timezone text, p_duration_minutes integer,
  p_priority text, p_notes text, p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  utc_start timestamptz;
begin
  if p_local_start is null or p_timezone is null
     or not exists (select 1 from pg_catalog.pg_timezone_names
       where name = p_timezone)
     or p_duration_minutes is null
     or p_duration_minutes not between 15 and 720 then
    raise exception 'Fecha, zona horaria o duración inválida'
      using errcode = '22023';
  end if;
  utc_start := p_local_start at time zone p_timezone;
  if (utc_start at time zone p_timezone) <> p_local_start
     or ((utc_start - interval '1 hour') at time zone p_timezone) = p_local_start
     or ((utc_start + interval '1 hour') at time zone p_timezone) = p_local_start then
    raise exception 'La hora local es inexistente o ambigua por cambio de horario'
      using errcode = 'P0409';
  end if;
  return public.create_service_visit(
    p_tenant_id, p_client_id, p_location_id, p_asset_id,
    p_work_order_id, p_title, p_assigned_user_id,
    utc_start,
    utc_start + pg_catalog.make_interval(mins => p_duration_minutes),
    p_priority, p_notes, p_operation_id
  );
end;
$$;
revoke all on function public.create_service_visit_local(
  uuid, uuid, uuid, uuid, uuid, text, uuid, timestamp,
  text, integer, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.create_service_visit_local(
  uuid, uuid, uuid, uuid, uuid, text, uuid, timestamp,
  text, integer, text, text, uuid
) to authenticated;
