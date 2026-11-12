-- Generalize vacation requests to employee absences without collecting medical details.
alter table public.vacation_requests
  rename to absence_requests;
alter table public.absence_requests
  rename constraint vacation_requests_pkey to absence_requests_pkey;
alter table public.absence_requests
  rename constraint vacation_requests_requester_id_fkey to absence_requests_requester_id_fkey;
alter table public.absence_requests
  rename constraint vacation_requests_decided_by_fkey to absence_requests_decided_by_fkey;
alter table public.absence_requests
  rename constraint vacation_requests_id_tenant_id_key to absence_requests_id_tenant_id_key;
alter table public.absence_requests
  add column absence_type text not null default 'vacation'
    check (absence_type in ('vacation', 'sick_leave', 'personal_leave', 'other')),
  alter column end_date drop not null;
alter table public.absence_requests
  add constraint absence_requests_date_range_check
    check (end_date is null or start_date <= end_date);

-- The existing visit trigger calls this function. Recreate it after the table
-- rename so future trigger executions query the new relation and absence types.
create or replace function app_private.reject_visit_during_approved_vacation() returns trigger
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
    select 1 from public.absence_requests r
    where r.tenant_id = new.tenant_id and r.requester_id = new.assigned_user_id
      and r.status = 'approved' and r.absence_type in ('vacation', 'sick_leave')
      and r.start_date <= local_end and coalesce(r.end_date, 'infinity'::date) >= local_start
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
      'Se ha generado pendiente de asignar: el técnico tiene una ausencia aprobada'
    ) on conflict do nothing;
    new.assigned_user_id := null;
  elsif exists (
    select 1 from public.absence_requests r
    where r.tenant_id = new.tenant_id and r.requester_id = new.assigned_user_id
      and r.status = 'approved' and r.absence_type in ('vacation', 'sick_leave')
      and r.start_date <= local_end and coalesce(r.end_date, 'infinity'::date) >= local_start
  ) then
    raise exception 'La persona tiene una ausencia aprobada durante la visita'
      using errcode = 'P0411';
  end if;
  return new;
end;
$$;
revoke all on function app_private.reject_visit_during_approved_vacation()
  from public, anon, authenticated, service_role;

drop function if exists public.submit_vacation_request(uuid, date, date, text);
alter table public.vacation_decision_notifications
  drop constraint vacation_decision_notifications_request_id_tenant_id_fkey;
alter table public.vacation_decision_notifications
  add constraint vacation_decision_notifications_request_id_tenant_id_fkey
  foreign key (request_id, tenant_id)
  references public.absence_requests(id, tenant_id) on delete cascade;

alter index public.vacation_requests_tenant_history_idx rename to absence_requests_tenant_history_idx;
alter index public.vacation_requests_requester_history_idx rename to absence_requests_requester_history_idx;
alter index public.vacation_requests_pending_idx rename to absence_requests_pending_idx;
alter index public.vacation_requests_approved_overlap_idx rename to absence_requests_approved_overlap_idx;

create function public.submit_absence_request(
  p_tenant_id uuid, p_absence_type text, p_start_date date,
  p_end_date date default null, p_comment text default ''
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  clean_comment text := pg_catalog.btrim(coalesce(p_comment, ''));
  requester_name text;
  request_id uuid;
begin
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['technician', 'user']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para solicitar una ausencia' using errcode = '42501';
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede gestionar ausencias' using errcode = 'P0402';
  end if;
  if p_absence_type is null or p_absence_type not in
    ('vacation', 'sick_leave', 'personal_leave', 'other')
    or p_start_date is null or (p_end_date is not null and p_start_date > p_end_date)
    or pg_catalog.char_length(clean_comment) > 1000 then
    raise exception 'Datos de ausencia inválidos' using errcode = '22023';
  end if;

  select pg_catalog.left(
    coalesce(nullif(pg_catalog.btrim(p.full_name), ''), p.email), 160
  ) into requester_name
  from public.profiles p where p.id = (select auth.uid());
  if requester_name is null or requester_name = '' then
    raise exception 'No se encontró el perfil del trabajador' using errcode = 'P0002';
  end if;

  insert into public.absence_requests (
    tenant_id, requester_id, requester_name, absence_type,
    start_date, end_date, requester_comment
  ) values (
    p_tenant_id, (select auth.uid()), requester_name, p_absence_type,
    p_start_date, p_end_date, clean_comment
  ) returning id into request_id;
  return request_id;
end;
$$;
revoke all on function public.submit_absence_request(uuid, text, date, date, text)
  from public, anon, authenticated;
grant execute on function public.submit_absence_request(uuid, text, date, date, text)
  to authenticated;

create or replace function public.decide_vacation_request(
  p_tenant_id uuid, p_request_id uuid, p_decision text, p_comment text default ''
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  target public.absence_requests%rowtype;
  clean_comment text := pg_catalog.btrim(coalesce(p_comment, ''));
  decision_name text;
begin
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para gestionar ausencias' using errcode = '42501';
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede gestionar ausencias' using errcode = 'P0402';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected')
    or pg_catalog.char_length(clean_comment) > 1000 then
    raise exception 'Decisión de ausencia inválida' using errcode = '22023';
  end if;

  select * into target from public.absence_requests
  where id = p_request_id and tenant_id = p_tenant_id for update;
  if not found then
    raise exception 'Solicitud no encontrada' using errcode = 'P0002';
  end if;
  if target.status <> 'pending' then
    raise exception 'La solicitud ya tiene una decisión' using errcode = 'P0409';
  end if;

  select pg_catalog.left(
    coalesce(nullif(pg_catalog.btrim(p.full_name), ''), p.email), 160
  ) into decision_name
  from public.profiles p where p.id = (select auth.uid());
  if decision_name is null or decision_name = '' then
    raise exception 'No se encontró el perfil de administración' using errcode = 'P0002';
  end if;

  update public.absence_requests set
    status = p_decision,
    decided_by = (select auth.uid()),
    decided_by_name = decision_name,
    decided_at = clock_timestamp(),
    decision_comment = clean_comment
  where id = target.id and tenant_id = p_tenant_id;
  return target.id;
end;
$$;

create or replace function public.list_vacation_coverage(p_tenant_id uuid, p_request_id uuid)
returns table (
  visit_id uuid, title text, client_name text, location_name text, address text,
  timezone text, assigned_user_id uuid, assigned_user_name text,
  scheduled_start_at timestamptz, scheduled_end_at timestamptz,
  status text, updated_at timestamptz, work_team_name text, candidates jsonb
)
language plpgsql stable security definer set search_path = '' as $$
declare
  target public.absence_requests%rowtype;
begin
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para revisar coberturas' using errcode = '42501';
  end if;
  if p_tenant_id is null or p_request_id is null then
    raise exception 'Solicitud de ausencia inválida' using errcode = '22023';
  end if;
  select * into target from public.absence_requests r
  where r.id = p_request_id and r.tenant_id = p_tenant_id;
  if not found or target.status = 'rejected' or target.absence_type not in ('vacation', 'sick_leave') then
    raise exception 'Solicitud no disponible para revisar cobertura' using errcode = 'P0002';
  end if;

  return query
  select v.id, v.title, c.name, coalesce(l.name, ''), coalesce(l.address, ''),
    coalesce(l.timezone, 'Europe/Madrid'), v.assigned_user_id,
    coalesce(nullif(p.full_name, ''), p.email, ''), v.scheduled_start_at,
    v.scheduled_end_at, v.status, v.updated_at, wt.name,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', candidate.user_id,
        'label', coalesce(nullif(cp.full_name, ''), cp.email, 'Usuario'),
        'workTeamMatch', wo.work_team_id is not null
      ) order by coalesce(nullif(cp.full_name, ''), cp.email, 'Usuario'))
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
          where other.tenant_id = p_tenant_id and other.assigned_user_id = candidate.user_id
            and other.id <> v.id and other.status in ('scheduled', 'in_progress')
            and other.scheduled_start_at < v.scheduled_end_at
            and other.scheduled_end_at > v.scheduled_start_at
        )
        and not exists (
          select 1 from public.absence_requests absence
          where absence.tenant_id = p_tenant_id and absence.requester_id = candidate.user_id
            and absence.status = 'approved' and absence.absence_type in ('vacation', 'sick_leave')
            and absence.start_date <= ((v.scheduled_end_at - interval '1 microsecond')
              at time zone coalesce(l.timezone, 'Europe/Madrid'))::date
            and coalesce(absence.end_date, 'infinity'::date) >= (v.scheduled_start_at
              at time zone coalesce(l.timezone, 'Europe/Madrid'))::date
        )
    ), '[]'::jsonb)
  from public.service_visits v
  join public.clients c on c.id = v.client_id and c.tenant_id = v.tenant_id
  left join public.service_locations l on l.id = v.location_id and l.tenant_id = v.tenant_id
  left join public.profiles p on p.id = v.assigned_user_id
  left join public.work_orders wo on wo.id = v.work_order_id and wo.tenant_id = v.tenant_id
  left join public.work_teams wt on wt.id = wo.work_team_id and wt.tenant_id = v.tenant_id
  where v.tenant_id = p_tenant_id and v.assigned_user_id = target.requester_id
    and v.status in ('scheduled', 'in_progress') and v.scheduled_end_at > pg_catalog.now()
    and (v.scheduled_start_at at time zone coalesce(l.timezone, 'Europe/Madrid'))::date
      <= coalesce(target.end_date, 'infinity'::date)
    and ((v.scheduled_end_at - interval '1 microsecond')
      at time zone coalesce(l.timezone, 'Europe/Madrid'))::date >= target.start_date
  order by v.scheduled_start_at, v.id;
end;
$$;
