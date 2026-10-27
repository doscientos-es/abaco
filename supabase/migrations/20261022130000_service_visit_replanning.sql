-- Replanning is an office command. The original visit keeps its identity and
-- every change keeps an immutable before/after event.
alter table public.service_visit_events
  drop constraint service_visit_events_kind_check;
alter table public.service_visit_events
  add constraint service_visit_events_kind_check
  check (kind in ('created', 'status_changed', 'schedule_changed'));

create function public.replan_service_visit(
  p_tenant_id uuid, p_visit_id uuid, p_expected_updated_at timestamptz,
  p_scheduled_start_at timestamptz, p_scheduled_end_at timestamptz,
  p_assigned_user_id uuid, p_reason text, p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  target public.service_visits%rowtype;
  prior public.service_visit_events%rowtype;
  clean_reason text := trim(coalesce(p_reason, ''));
  requested jsonb;
begin
  if p_tenant_id is null or p_visit_id is null or p_expected_updated_at is null
     or p_operation_id is null or p_scheduled_start_at is null
     or p_scheduled_end_at is null
     or p_scheduled_end_at <= p_scheduled_start_at
     or p_scheduled_end_at > p_scheduled_start_at + interval '12 hours'
     or char_length(clean_reason) not between 1 and 500 then
    raise exception 'Datos de reprogramación inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para reprogramar visitas'
      using errcode = '42501';
  end if;
  select * into target from public.service_visits
  where id = p_visit_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Visita no encontrada' using errcode = 'P0002'; end if;
  requested := pg_catalog.jsonb_build_object(
    'start', p_scheduled_start_at, 'end', p_scheduled_end_at,
    'assignedUserId', p_assigned_user_id
  );
  select * into prior from public.service_visit_events
  where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.visit_id <> p_visit_id
       or prior.kind <> 'schedule_changed'
       or prior.payload->'to' is distinct from requested
       or prior.payload->>'reason' <> clean_reason then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return p_visit_id;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede reprogramar visitas'
      using errcode = 'P0402';
  end if;
  if target.updated_at <> p_expected_updated_at then
    raise exception 'La visita cambió en otra sesión; recarga la agenda'
      using errcode = 'P0409';
  end if;
  if target.status <> 'scheduled' then
    raise exception 'Solo se pueden reprogramar visitas pendientes'
      using errcode = 'P0409';
  end if;
  if target.scheduled_start_at = p_scheduled_start_at
     and target.scheduled_end_at = p_scheduled_end_at
     and target.assigned_user_id is not distinct from p_assigned_user_id then
    raise exception 'La nueva planificación coincide con la actual'
      using errcode = '22023';
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
      where v.tenant_id = p_tenant_id and v.id <> p_visit_id
        and v.assigned_user_id = p_assigned_user_id
        and v.status in ('scheduled', 'in_progress')
        and v.scheduled_start_at < p_scheduled_end_at
        and v.scheduled_end_at > p_scheduled_start_at
    ) then
      raise exception 'El técnico ya tiene una visita en ese horario'
        using errcode = 'P0409';
    end if;
  end if;
  update public.service_visits
  set scheduled_start_at = p_scheduled_start_at,
      scheduled_end_at = p_scheduled_end_at,
      assigned_user_id = p_assigned_user_id
  where id = target.id;
  insert into public.service_visit_events (
    operation_id, tenant_id, visit_id, kind, payload, actor_id
  ) values (
    p_operation_id, p_tenant_id, p_visit_id, 'schedule_changed',
    pg_catalog.jsonb_build_object(
      'from', pg_catalog.jsonb_build_object(
        'start', target.scheduled_start_at, 'end', target.scheduled_end_at,
        'assignedUserId', target.assigned_user_id
      ),
      'to', requested, 'reason', clean_reason
    ),
    (select auth.uid())
  );
  return p_visit_id;
end;
$$;
revoke all on function public.replan_service_visit(
  uuid, uuid, timestamptz, timestamptz, timestamptz, uuid, text, uuid
) from public, anon, authenticated;
grant execute on function public.replan_service_visit(
  uuid, uuid, timestamptz, timestamptz, timestamptz, uuid, text, uuid
) to authenticated;

create function public.replan_service_visit_local(
  p_tenant_id uuid, p_visit_id uuid, p_expected_updated_at timestamptz,
  p_local_start timestamp, p_duration_minutes integer,
  p_assigned_user_id uuid, p_reason text, p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  visit_timezone text;
  utc_start timestamptz;
begin
  if p_local_start is null or p_duration_minutes is null
     or p_duration_minutes not between 15 and 720 then
    raise exception 'Fecha o duración inválida' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para reprogramar visitas'
      using errcode = '42501';
  end if;
  select coalesce(l.timezone, 'Europe/Madrid') into visit_timezone
  from public.service_visits v
  left join public.service_locations l
    on l.id = v.location_id and l.tenant_id = v.tenant_id
  where v.id = p_visit_id and v.tenant_id = p_tenant_id;
  if not found then raise exception 'Visita no encontrada' using errcode = 'P0002'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names
    where name = visit_timezone) then
    raise exception 'Zona horaria de la ubicación inválida' using errcode = '22023';
  end if;
  utc_start := p_local_start at time zone visit_timezone;
  if (utc_start at time zone visit_timezone) <> p_local_start
     or ((utc_start - interval '1 hour') at time zone visit_timezone) = p_local_start
     or ((utc_start + interval '1 hour') at time zone visit_timezone) = p_local_start then
    raise exception 'La hora local es inexistente o ambigua por cambio de horario'
      using errcode = 'P0409';
  end if;
  return public.replan_service_visit(
    p_tenant_id, p_visit_id, p_expected_updated_at,
    utc_start,
    utc_start + pg_catalog.make_interval(mins => p_duration_minutes),
    p_assigned_user_id, p_reason, p_operation_id
  );
end;
$$;
revoke all on function public.replan_service_visit_local(
  uuid, uuid, timestamptz, timestamp, integer, uuid, text, uuid
) from public, anon, authenticated;
grant execute on function public.replan_service_visit_local(
  uuid, uuid, timestamptz, timestamp, integer, uuid, text, uuid
) to authenticated;
