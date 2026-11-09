-- Serialize schedule changes with vacation approvals for the same tenant member.
create index vacation_requests_approved_overlap_idx
  on public.vacation_requests (tenant_id, requester_id, start_date, end_date)
  where status = 'approved';

create function app_private.lock_vacation_assignment_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status and new.status = 'approved' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(new.tenant_id::text || ':' || new.requester_id::text, 2)
    );
  end if;
  return new;
end;
$$;
revoke all on function app_private.lock_vacation_assignment_change()
  from public, anon, authenticated, service_role;
create trigger vacation_requests_lock_assignment
  before update of status on public.vacation_requests
  for each row execute function app_private.lock_vacation_assignment_change();

-- The database is the final authority for assigned service-visit availability.
create function app_private.reject_visit_during_approved_vacation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  visit_timezone text := 'Europe/Madrid';
  local_start date;
  local_end date;
begin
  if tg_op = 'UPDATE' then
    if old.assigned_user_id is not null and (
      new.assigned_user_id is distinct from old.assigned_user_id
      or new.tenant_id is distinct from old.tenant_id
    ) then
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(old.tenant_id::text || ':' || old.assigned_user_id::text, 2)
      );
    end if;
    if new.assigned_user_id is not null and (
      new.assigned_user_id is distinct from old.assigned_user_id
      or new.tenant_id is distinct from old.tenant_id
    ) then
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(new.tenant_id::text || ':' || new.assigned_user_id::text, 2)
      );
    end if;
    if new.assigned_user_id is not distinct from old.assigned_user_id
      and new.scheduled_start_at = old.scheduled_start_at
      and new.scheduled_end_at = old.scheduled_end_at
      and new.location_id is not distinct from old.location_id then
      return new;
    end if;
  end if;
  if new.assigned_user_id is null then return new; end if;

  if tg_op = 'INSERT' and new.contract_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(new.tenant_id::text, 31)
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.tenant_id::text || ':' || new.assigned_user_id::text, 2)
  );
  select coalesce(l.timezone, 'Europe/Madrid') into visit_timezone
  from public.service_locations l
  where l.id = new.location_id and l.tenant_id = new.tenant_id;
  visit_timezone := coalesce(visit_timezone, 'Europe/Madrid');
  local_start := (new.scheduled_start_at at time zone visit_timezone)::date;
  local_end := ((new.scheduled_end_at - interval '1 microsecond')
    at time zone visit_timezone)::date;

  if new.contract_id is not null and exists (
    select 1 from public.service_contracts sc
    where sc.id = new.contract_id and sc.tenant_id = new.tenant_id
      and sc.default_assigned_user_id = new.assigned_user_id
  ) and exists (
    select 1 from public.vacation_requests r
    where r.tenant_id = new.tenant_id and r.requester_id = new.assigned_user_id
      and r.status = 'approved'
      and r.start_date <= local_end and r.end_date >= local_start
  ) then
    -- Contract generation is best-effort per occurrence: keep the occurrence
    -- and its idempotent issue record, but leave assignment for an admin.
    insert into public.service_contract_generation_issues (
      tenant_id, contract_id, rule_id, occurrence_on,
      schedule_version, kind, detail
    ) values (
      new.tenant_id, new.contract_id, new.contract_rule_id,
      new.contract_occurrence_on, new.contract_schedule_version,
      'assignment_conflict',
      'Se ha generado pendiente de asignar: el técnico tiene vacaciones aprobadas'
    ) on conflict do nothing;
    new.assigned_user_id := null;
  elsif exists (
    select 1 from public.vacation_requests r
    where r.tenant_id = new.tenant_id and r.requester_id = new.assigned_user_id
      and r.status = 'approved'
      and r.start_date <= local_end and r.end_date >= local_start
  ) then
    raise exception 'La persona tiene vacaciones aprobadas durante la visita'
      using errcode = 'P0411';
  end if;
  return new;
end;
$$;
revoke all on function app_private.reject_visit_during_approved_vacation()
  from public, anon, authenticated, service_role;
create trigger service_visits_vacation_guard
  before insert or update of assigned_user_id, scheduled_start_at, scheduled_end_at, location_id
  on public.service_visits
  for each row execute function app_private.reject_visit_during_approved_vacation();

-- Return affected visits and schedule-eligible suggestions for an admin to review.
create function public.list_vacation_coverage(p_tenant_id uuid, p_request_id uuid)
returns table (
  visit_id uuid,
  title text,
  client_name text,
  location_name text,
  address text,
  timezone text,
  assigned_user_id uuid,
  assigned_user_name text,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  status text,
  updated_at timestamptz,
  work_team_name text,
  candidates jsonb
)
language plpgsql stable security definer set search_path = '' as $$
declare
  target public.vacation_requests%rowtype;
begin
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para revisar coberturas'
      using errcode = '42501';
  end if;
  if p_tenant_id is null or p_request_id is null then
    raise exception 'Solicitud de vacaciones inválida' using errcode = '22023';
  end if;
  select * into target from public.vacation_requests r
  where r.id = p_request_id and r.tenant_id = p_tenant_id;
  if not found or target.status = 'rejected' then
    raise exception 'Solicitud de vacaciones no disponible' using errcode = 'P0002';
  end if;

  return query
  select
    v.id,
    v.title,
    c.name,
    coalesce(l.name, ''),
    coalesce(l.address, ''),
    coalesce(l.timezone, 'Europe/Madrid'),
    v.assigned_user_id,
    coalesce(nullif(p.full_name, ''), p.email, ''),
    v.scheduled_start_at,
    v.scheduled_end_at,
    v.status,
    v.updated_at,
    wt.name,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'userId', candidate.user_id,
          'label', coalesce(nullif(cp.full_name, ''), cp.email, 'Usuario'),
          'workTeamMatch', wo.work_team_id is not null
        ) order by coalesce(nullif(cp.full_name, ''), cp.email, 'Usuario')
      )
      from public.memberships candidate
      left join public.profiles cp on cp.id = candidate.user_id
      where candidate.tenant_id = p_tenant_id
        and candidate.role in ('user', 'technician')
        and candidate.user_id <> target.requester_id
        and (wo.work_team_id is null or exists (
          select 1 from public.work_team_members tm
          where tm.tenant_id = p_tenant_id and tm.team_id = wo.work_team_id
            and tm.user_id = candidate.user_id
        ))
        and not exists (
          select 1 from public.service_visits other
          where other.tenant_id = p_tenant_id
            and other.assigned_user_id = candidate.user_id
            and other.id <> v.id
            and other.status in ('scheduled', 'in_progress')
            and other.scheduled_start_at < v.scheduled_end_at
            and other.scheduled_end_at > v.scheduled_start_at
        )
        and not exists (
          select 1 from public.vacation_requests absence
          where absence.tenant_id = p_tenant_id
            and absence.requester_id = candidate.user_id
            and absence.status = 'approved'
            and absence.start_date <= ((v.scheduled_end_at - interval '1 microsecond')
              at time zone coalesce(l.timezone, 'Europe/Madrid'))::date
            and absence.end_date >= (v.scheduled_start_at
              at time zone coalesce(l.timezone, 'Europe/Madrid'))::date
        )
    ), '[]'::jsonb)
  from public.service_visits v
  join public.clients c on c.id = v.client_id and c.tenant_id = v.tenant_id
  left join public.service_locations l
    on l.id = v.location_id and l.tenant_id = v.tenant_id
  left join public.profiles p on p.id = v.assigned_user_id
  left join public.work_orders wo
    on wo.id = v.work_order_id and wo.tenant_id = v.tenant_id
  left join public.work_teams wt
    on wt.id = wo.work_team_id and wt.tenant_id = v.tenant_id
  where v.tenant_id = p_tenant_id
    and v.assigned_user_id = target.requester_id
    and v.status in ('scheduled', 'in_progress')
    and v.scheduled_end_at > pg_catalog.now()
    and (v.scheduled_start_at at time zone coalesce(l.timezone, 'Europe/Madrid'))::date
      <= target.end_date
    and ((v.scheduled_end_at - interval '1 microsecond')
      at time zone coalesce(l.timezone, 'Europe/Madrid'))::date >= target.start_date
  order by v.scheduled_start_at, v.id;
end;
$$;
revoke all on function public.list_vacation_coverage(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.list_vacation_coverage(uuid, uuid) to authenticated;
