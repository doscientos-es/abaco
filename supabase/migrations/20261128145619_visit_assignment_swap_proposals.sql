-- A technician may request an exchange; only a coordinator can change assignments.
-- No raw colleague calendar or client details are returned to the requester.
create table app_private.visit_assignment_swap_proposals (
  id uuid not null,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requester_id uuid not null,
  colleague_id uuid not null,
  own_visit_id uuid not null,
  other_visit_id uuid not null,
  own_version timestamptz not null,
  other_version timestamptz not null,
  own_start timestamptz not null,
  own_end timestamptz not null,
  other_start timestamptz not null,
  other_end timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  state text not null default 'pending' check (state in ('pending', 'approved', 'rejected', 'withdrawn')),
  decided_at timestamptz,
  decided_by uuid,
  primary key (tenant_id, id),
  check (requester_id <> colleague_id and own_visit_id <> other_visit_id),
  check ((state = 'pending' and decided_at is null and decided_by is null)
    or (state <> 'pending' and decided_at is not null and decided_by is not null))
);
alter table app_private.visit_assignment_swap_proposals enable row level security;
revoke all on app_private.visit_assignment_swap_proposals from public, anon, authenticated, service_role;
create unique index visit_swap_pending_pair on app_private.visit_assignment_swap_proposals
  (tenant_id, (least(own_visit_id, other_visit_id)), (greatest(own_visit_id, other_visit_id)))
  where state = 'pending';
create index visit_swap_inbox on app_private.visit_assignment_swap_proposals
  (tenant_id, (state = 'pending') desc, created_at desc, id desc);
create index visit_swap_requester on app_private.visit_assignment_swap_proposals
  (tenant_id, requester_id, created_at desc, id desc);

-- Like staff schedules elsewhere, weekly shifts are Europe/Madrid wall time.
-- Treat missing shifts, different timezones and offset transitions as unverified.
create function app_private.visit_swap_slot_available(
  visit public.service_visits, outgoing_visit_id uuid, incoming_user_id uuid
) returns boolean language sql stable security invoker set search_path = '' as $$
  with bounds as (
    select visit.scheduled_start_at at time zone 'Europe/Madrid' as first_local,
      visit.scheduled_end_at at time zone 'Europe/Madrid' as last_local
  )
  select
    (visit.location_id is null or exists (
      select 1 from public.service_locations l
      where l.id = visit.location_id and l.tenant_id = visit.tenant_id
        and l.timezone = 'Europe/Madrid'
    ))
    and last_local - first_local = visit.scheduled_end_at - visit.scheduled_start_at
    and not exists (
      select 1 from pg_catalog.generate_series(first_local::date::timestamp,
        (last_local - interval '1 microsecond')::date::timestamp, interval '1 day') as day(midnight)
      where not coalesce((
        select pg_catalog.range_agg(pg_catalog.int4range(
          (slot->>'start')::integer, (slot->>'end')::integer, '[)'
        )) @> pg_catalog.int4range(
          floor(extract(epoch from (greatest(first_local, day.midnight) - day.midnight)) / 60)::integer,
          ceil(extract(epoch from (least(last_local, day.midnight + interval '1 day') - day.midnight)) / 60)::integer,
          '[)'
        )
        from public.staff_schedules s
        cross join lateral pg_catalog.jsonb_array_elements(s.slots) as slots(slot)
        where s.tenant_id = visit.tenant_id and s.user_id = incoming_user_id
          and (slot->>'weekday')::integer = extract(isodow from day.midnight)::integer
      ), false)
    )
    and (visit.work_order_id is null or exists (
      select 1 from public.work_orders w
      where w.tenant_id = visit.tenant_id and w.id = visit.work_order_id
        and (w.work_team_id is null or exists (
          select 1 from public.work_teams t join public.work_team_members m
            on m.tenant_id = t.tenant_id and m.team_id = t.id
          where t.tenant_id = w.tenant_id and t.id = w.work_team_id and t.archived_at is null
            and m.user_id = incoming_user_id
        ))
    ))
    and not exists (
      select 1 from public.service_visits v
      where v.tenant_id = visit.tenant_id and v.id not in (visit.id, outgoing_visit_id)
        and v.status in ('scheduled', 'in_progress')
        and v.scheduled_start_at >= visit.scheduled_start_at - interval '12 hours'
        and v.scheduled_start_at < visit.scheduled_end_at
        and v.scheduled_end_at > visit.scheduled_start_at
        and (v.assigned_user_id = incoming_user_id or exists (
          select 1 from public.work_team_members m
          where m.tenant_id = v.tenant_id and m.team_id = v.work_team_id and m.user_id = incoming_user_id
        ))
    )
    and not exists (
      select 1 from public.absence_requests a
      where a.tenant_id = visit.tenant_id and a.requester_id = incoming_user_id
        and a.status = 'approved' and a.absence_type in ('vacation', 'sick_leave')
        and a.start_date <= (last_local - interval '1 microsecond')::date
        and coalesce(a.end_date, 'infinity'::date) >= first_local::date
    )
  from bounds;
$$;
revoke all on function app_private.visit_swap_slot_available(public.service_visits, uuid, uuid)
  from public, anon, authenticated, service_role;

create function app_private.visit_swap_candidate_ok(visit public.service_visits) returns boolean
language sql stable security invoker set search_path = '' as $$
  select visit.status = 'scheduled' and visit.work_team_id is null
    and coalesce(visit.paper_snapshot->>'timeKnown', 'true') = 'true'
    and visit.assigned_user_id is not null
    and visit.scheduled_start_at > pg_catalog.statement_timestamp()
    and (visit.scheduled_start_at at time zone 'Europe/Madrid')::date
      <= (pg_catalog.statement_timestamp() at time zone 'Europe/Madrid')::date + 14
    and exists (
      select 1 from public.memberships m where m.tenant_id = visit.tenant_id
        and m.user_id = visit.assigned_user_id and m.role in ('technician', 'user')
    );
$$;
revoke all on function app_private.visit_swap_candidate_ok(public.service_visits)
  from public, anon, authenticated, service_role;

create function app_private.list_visit_swap_options(p_tenant_id uuid, p_own_id uuid, p_day date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare own public.service_visits%rowtype;
  actor uuid := (select auth.uid());
  today date := (pg_catalog.statement_timestamp() at time zone 'Europe/Madrid')::date;
begin
  if actor is null or not coalesce(public.has_role(p_tenant_id, array['technician', 'user']::public.app_role[]), false) then
    raise exception 'Sin permiso para proponer intercambios' using errcode = '42501';
  end if;
  if p_day is null or p_day < today or p_day > today + 14 then
    raise exception 'Selecciona un día entre hoy y los próximos 14 días' using errcode = '22023';
  end if;
  select * into own from public.service_visits
  where tenant_id = p_tenant_id and id = p_own_id and assigned_user_id = actor;
  if not found or not coalesce(app_private.visit_swap_candidate_ok(own), false) then
    raise exception 'Tu visita ya no está disponible para intercambio' using errcode = 'P0409';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(c) order by c.start_at, c.id) from (
      select v.id, v.updated_at as version, v.scheduled_start_at as start_at,
        v.scheduled_end_at as end_at, coalesce(nullif(btrim(p.full_name), ''), 'Otro técnico') as colleague
      from public.service_visits v
      join public.profiles p on p.id = v.assigned_user_id
      where v.tenant_id = p_tenant_id and v.assigned_user_id <> actor
        and v.scheduled_start_at >= p_day::timestamp at time zone 'Europe/Madrid'
        and v.scheduled_start_at < (p_day + 1)::timestamp at time zone 'Europe/Madrid'
        and app_private.visit_swap_candidate_ok(v)
        and app_private.visit_swap_slot_available(v, own.id, actor)
        and app_private.visit_swap_slot_available(own, v.id, v.assigned_user_id)
        and not exists (
          select 1 from app_private.visit_assignment_swap_proposals r
          where r.tenant_id = p_tenant_id and r.state = 'pending'
            and least(r.own_visit_id, r.other_visit_id) = least(own.id, v.id)
            and greatest(r.own_visit_id, r.other_visit_id) = greatest(own.id, v.id)
        )
      order by v.scheduled_start_at, v.id
      limit 12
    ) c
  ), '[]'::jsonb);
end;
$$;

create function app_private.create_visit_swap_proposal(p_tenant_id uuid, p_id uuid,
  p_own_id uuid, p_own_version timestamptz, p_other_id uuid, p_other_version timestamptz)
returns text language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
  own public.service_visits%rowtype;
  other public.service_visits%rowtype;
  prior app_private.visit_assignment_swap_proposals%rowtype;
begin
  if actor is null or not coalesce(public.has_role(p_tenant_id, array['technician', 'user']::public.app_role[]), false) then
    raise exception 'Sin permiso para proponer intercambios' using errcode = '42501';
  end if;
  if p_id is null or p_own_id is null or p_other_id is null or p_own_id = p_other_id
    or p_own_version is null or p_other_version is null then
    raise exception 'Selecciona dos visitas válidas' using errcode = '22023';
  end if;
  -- Stable retry id within this tenant; concurrent retries never duplicate proposals.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant_id::text || ':' || p_id::text, 67));
  select * into prior from app_private.visit_assignment_swap_proposals r
    where r.tenant_id = p_tenant_id and r.id = p_id;
  if found then
    if prior.requester_id <> actor or prior.own_visit_id <> p_own_id or prior.other_visit_id <> p_other_id
      or prior.own_version <> p_own_version or prior.other_version <> p_other_version then
      raise exception 'No se pudo registrar esta propuesta' using errcode = 'P0409';
    end if;
    return prior.state;
  end if;
  if not coalesce(public.tenant_can_write(p_tenant_id), false) then
    raise exception 'La empresa no puede registrar propuestas' using errcode = 'P0402';
  end if;

  perform 1 from public.service_visits v where v.tenant_id = p_tenant_id
    and v.id in (p_own_id, p_other_id) order by v.id for share;
  select * into own from public.service_visits v where v.tenant_id = p_tenant_id and v.id = p_own_id;
  select * into other from public.service_visits v where v.tenant_id = p_tenant_id and v.id = p_other_id;
  if own.id is null or other.id is null or own.assigned_user_id is distinct from actor
    or other.assigned_user_id is not distinct from actor
    or own.updated_at is distinct from p_own_version or other.updated_at is distinct from p_other_version
    or not coalesce(app_private.visit_swap_candidate_ok(own), false)
    or not coalesce(app_private.visit_swap_candidate_ok(other), false)
    or not coalesce(app_private.visit_swap_slot_available(own, other.id, other.assigned_user_id), false)
    or not coalesce(app_private.visit_swap_slot_available(other, own.id, actor), false) then
    raise exception 'Estas visitas ya no se pueden intercambiar' using errcode = 'P0409';
  end if;
  insert into app_private.visit_assignment_swap_proposals (
    tenant_id, id, requester_id, colleague_id, own_visit_id, other_visit_id, own_version,
    other_version, own_start, own_end, other_start, other_end
  ) values (p_tenant_id, p_id, actor, other.assigned_user_id, own.id, other.id, own.updated_at,
    other.updated_at, own.scheduled_start_at, own.scheduled_end_at, other.scheduled_start_at, other.scheduled_end_at);
  return 'pending';
exception when unique_violation then
  raise exception 'Ya hay una propuesta pendiente para estas visitas' using errcode = 'P0409';
end;
$$;

create function app_private.list_visit_swap_proposals(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  office boolean := coalesce(public.has_role(p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]), false);
begin
  if actor is null or not (office or coalesce(public.has_role(p_tenant_id, array['technician', 'user']::public.app_role[]), false)) then
    raise exception 'Sin permiso para consultar intercambios' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(r) order by (r.state = 'pending') desc, r.created_at desc, r.id desc) from (
      select s.id, s.state, s.created_at, s.decided_at,
        case when office or own.assigned_user_id = actor then own.title end as own_title,
        case when office then other.title end as other_title,
        case when office then nullif(btrim(requester.full_name), '') end as requester,
        nullif(btrim(colleague.full_name), '') as colleague,
        s.own_start, s.own_end, s.other_start, s.other_end,
        (s.state = 'pending' and (own.updated_at is distinct from s.own_version
          or other.updated_at is distinct from s.other_version
          or own.scheduled_start_at <= pg_catalog.statement_timestamp()
          or other.scheduled_start_at <= pg_catalog.statement_timestamp()
          or not coalesce(requester_member.role in ('technician', 'user'), false)
          or not coalesce(colleague_member.role in ('technician', 'user'), false))) as stale
      from app_private.visit_assignment_swap_proposals s
      left join public.service_visits own on own.tenant_id = s.tenant_id and own.id = s.own_visit_id
      left join public.service_visits other on other.tenant_id = s.tenant_id and other.id = s.other_visit_id
      left join public.memberships requester_member on requester_member.tenant_id = s.tenant_id
        and requester_member.user_id = s.requester_id
      left join public.profiles requester on requester.id = requester_member.user_id
      left join public.memberships colleague_member on colleague_member.tenant_id = s.tenant_id
        and colleague_member.user_id = s.colleague_id
      left join public.profiles colleague on colleague.id = colleague_member.user_id
      where s.tenant_id = p_tenant_id and (office or s.requester_id = actor)
      order by (s.state = 'pending') desc, s.created_at desc, s.id desc
      limit 50
    ) r
  ), '[]'::jsonb);
end;
$$;

create function app_private.decide_visit_swap_proposal(p_tenant_id uuid, p_id uuid,
  p_created_at timestamptz, p_decision text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  proposal app_private.visit_assignment_swap_proposals%rowtype;
  own public.service_visits%rowtype;
  other public.service_visits%rowtype;
  member_id uuid;
  changed integer;
begin
  if p_decision is null or p_decision not in ('approved', 'rejected', 'withdrawn')
    or p_id is null or p_created_at is null then
    raise exception 'Decisión no válida' using errcode = '22023';
  end if;
  if actor is null or (p_decision = 'withdrawn' and not coalesce(public.has_role(p_tenant_id, array['technician', 'user']::public.app_role[]), false))
    or (p_decision <> 'withdrawn' and not coalesce(public.has_role(p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]), false)) then
    raise exception 'Sin permiso para decidir sobre intercambios' using errcode = '42501';
  end if;
  select * into proposal from app_private.visit_assignment_swap_proposals s
  where s.tenant_id = p_tenant_id and s.id = p_id
    and (p_decision <> 'withdrawn' or s.requester_id = actor)
  for update;
  if not found then raise exception 'Propuesta no encontrada' using errcode = 'P0002'; end if;
  if proposal.created_at is distinct from p_created_at
    or (proposal.state <> 'pending' and (proposal.state <> p_decision or proposal.decided_by <> actor)) then
    raise exception 'La propuesta cambió; vuelve a consultarla' using errcode = 'P0409';
  end if;
  if proposal.state = p_decision then return proposal.state; end if;
  if not coalesce(public.tenant_can_write(p_tenant_id), false) then
    raise exception 'La empresa no puede gestionar intercambios' using errcode = 'P0402';
  end if;

  if p_decision = 'approved' then
    -- Acquire the same visit and personnel locks as the scheduling guards. Approval
    -- checks the original versions and the current constraints, not the browser preview.
    perform 1 from public.service_visits v where v.tenant_id = p_tenant_id
      and v.id in (proposal.own_visit_id, proposal.other_visit_id) order by v.id for update;
    select * into own from public.service_visits v where v.tenant_id = p_tenant_id and v.id = proposal.own_visit_id;
    select * into other from public.service_visits v where v.tenant_id = p_tenant_id and v.id = proposal.other_visit_id;
    perform 1 from public.memberships m where m.tenant_id = p_tenant_id
      and m.user_id in (actor, proposal.requester_id, proposal.colleague_id) order by m.user_id for share;
    if not coalesce(public.has_role(p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]), false) then
      raise exception 'Sin permiso para aprobar intercambios' using errcode = '42501';
    end if;
    if own.id is null or other.id is null
      or own.updated_at is distinct from proposal.own_version or other.updated_at is distinct from proposal.other_version
      or own.assigned_user_id is distinct from proposal.requester_id or other.assigned_user_id is distinct from proposal.colleague_id
      or not coalesce(app_private.visit_swap_candidate_ok(own), false)
      or not coalesce(app_private.visit_swap_candidate_ok(other), false) then
      raise exception 'Cambió una visita o su asignación. No se aplicó el intercambio' using errcode = 'P0409';
    end if;
    for member_id in
      select m.user_id from public.memberships m where m.tenant_id = p_tenant_id
        and m.user_id in (proposal.requester_id, proposal.colleague_id) order by m.user_id
    loop
      for changed in 0..2 loop
        perform pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended(p_tenant_id::text || ':' || member_id::text, changed));
      end loop;
    end loop;
    perform 1 from public.service_locations l where l.tenant_id = p_tenant_id
      and l.id in (own.location_id, other.location_id) order by l.id for share;
    perform 1 from public.work_orders w where w.tenant_id = p_tenant_id
      and w.id in (own.work_order_id, other.work_order_id) order by w.id for share;
    perform 1 from public.work_teams t where t.tenant_id = p_tenant_id
      and t.id in (select w.work_team_id from public.work_orders w where w.tenant_id = p_tenant_id
        and w.id in (own.work_order_id, other.work_order_id)) order by t.id for share;
    perform 1 from public.work_team_members m where m.tenant_id = p_tenant_id
      and m.user_id in (proposal.requester_id, proposal.colleague_id)
      and m.team_id in (select w.work_team_id from public.work_orders w where w.tenant_id = p_tenant_id
        and w.id in (own.work_order_id, other.work_order_id))
      order by m.team_id, m.user_id for share;
    if own.scheduled_start_at <= pg_catalog.clock_timestamp() or other.scheduled_start_at <= pg_catalog.clock_timestamp()
      or not coalesce(app_private.visit_swap_slot_available(own, other.id, proposal.colleague_id), false)
      or not coalesce(app_private.visit_swap_slot_available(other, own.id, proposal.requester_id), false) then
      raise exception 'Ya no hay cobertura para ambos horarios. No se aplicó el intercambio' using errcode = 'P0409';
    end if;

    -- For a true same-time exchange, a per-row guard would see the counterpart's
    -- old slot. Clear the pair privately inside the same transaction, then apply
    -- both new assignments through all existing guards. No other reader can see
    -- this intermediate state; any constraint error rolls back the entire change.
    -- DEV-67 ignores the unassigned stage and projects only the new recipient.
    -- Calendar triggers queue old-only then new-only (the same keys as a direct
    -- reassignment); the worker reads current committed assignments, not deltas.
    update public.service_visits v set assigned_user_id = null
      where v.tenant_id = p_tenant_id and v.id in (own.id, other.id);
    update public.service_visits v
      set assigned_user_id = case when v.id = own.id then proposal.colleague_id else proposal.requester_id end
      where v.tenant_id = p_tenant_id and v.id in (own.id, other.id);
    if not exists (select 1 from public.service_visits v
        where v.tenant_id = p_tenant_id and v.id = own.id and v.assigned_user_id = proposal.colleague_id)
      or not exists (select 1 from public.service_visits v
        where v.tenant_id = p_tenant_id and v.id = other.id and v.assigned_user_id = proposal.requester_id) then
      raise exception 'No se aplicaron ambas asignaciones; no se modificó ninguna' using errcode = 'P0409';
    end if;

    insert into public.service_visit_events (operation_id, tenant_id, visit_id, kind, payload, actor_id)
      select pg_catalog.gen_random_uuid(), p_tenant_id, x.id, 'schedule_changed',
        pg_catalog.jsonb_build_object(
          'from', pg_catalog.jsonb_build_object('start', x.start_at, 'end', x.end_at, 'assignedUserId', x.old_user),
          'to', pg_catalog.jsonb_build_object('start', x.start_at, 'end', x.end_at, 'assignedUserId', x.new_user),
          'reason', 'Intercambio aprobado por coordinación', 'swapProposalId', proposal.id
        ), actor
      from (values
        (own.id, own.scheduled_start_at, own.scheduled_end_at, proposal.requester_id, proposal.colleague_id),
        (other.id, other.scheduled_start_at, other.scheduled_end_at, proposal.colleague_id, proposal.requester_id)
      ) x(id, start_at, end_at, old_user, new_user);
  end if;

  update app_private.visit_assignment_swap_proposals
  set state = p_decision, decided_at = pg_catalog.clock_timestamp(), decided_by = actor
    where tenant_id = p_tenant_id and id = p_id;
  return p_decision;
end;
$$;

-- Expose only authorized invocation wrappers, not access to the private schema.
create function public.list_visit_swap_options(p_tenant_id uuid, p_own_id uuid, p_day date)
returns jsonb language sql stable security invoker set search_path = ''
begin atomic select app_private.list_visit_swap_options(p_tenant_id, p_own_id, p_day); end;
create function public.create_visit_swap_proposal(p_tenant_id uuid, p_id uuid,
  p_own_id uuid, p_own_version timestamptz, p_other_id uuid, p_other_version timestamptz)
returns text language sql security invoker set search_path = ''
begin atomic select app_private.create_visit_swap_proposal(p_tenant_id, p_id, p_own_id, p_own_version, p_other_id, p_other_version); end;
create function public.list_visit_swap_proposals(p_tenant_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
begin atomic select app_private.list_visit_swap_proposals(p_tenant_id); end;
create function public.decide_visit_swap_proposal(p_tenant_id uuid, p_id uuid, p_created_at timestamptz, p_decision text)
returns text language sql security invoker set search_path = ''
begin atomic select app_private.decide_visit_swap_proposal(p_tenant_id, p_id, p_created_at, p_decision); end;

do $$
declare scope text;
  signature text;
begin
  foreach scope in array array['public', 'app_private'] loop
    foreach signature in array array[
      'list_visit_swap_options(uuid,uuid,date)',
      'create_visit_swap_proposal(uuid,uuid,uuid,timestamptz,uuid,timestamptz)',
      'list_visit_swap_proposals(uuid)',
      'decide_visit_swap_proposal(uuid,uuid,timestamptz,text)'
    ] loop
      execute format('revoke all on function %I.%s from public, anon, authenticated, service_role', scope, signature);
      execute format('grant execute on function %I.%s to authenticated', scope, signature);
    end loop;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
