-- A scheduled visit has either an individual assignee or a team. Serialize
-- assignments per person, including members shared by different teams.
create function app_private.guard_team_visit_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare person uuid; people uuid[]; zone text; conflict_found boolean := false;
begin
  if new.status not in ('scheduled', 'in_progress') then return new; end if;
  if tg_op = 'UPDATE' and new.tenant_id = old.tenant_id
    and new.work_team_id is not distinct from old.work_team_id
    and new.assigned_user_id is not distinct from old.assigned_user_id
    and new.scheduled_start_at = old.scheduled_start_at
    and new.scheduled_end_at = old.scheduled_end_at
    and new.location_id is not distinct from old.location_id then return new; end if;
  if new.work_team_id is not null then
    new.assigned_user_id := null;
    if not exists (select 1 from public.work_teams t where t.id = new.work_team_id
      and t.tenant_id = new.tenant_id and t.archived_at is null) then
      conflict_found := true;
    end if;
    select array_agg(m.user_id order by m.user_id) into people
      from public.work_team_members m
      where m.tenant_id = new.tenant_id and m.team_id = new.work_team_id;
    if coalesce(array_length(people, 1), 0) = 0 then conflict_found := true; end if;
  elsif new.assigned_user_id is not null then
    people := array[new.assigned_user_id];
  else
    return new;
  end if;
  foreach person in array coalesce(people, array[]::uuid[]) loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(new.tenant_id::text || ':' || person::text, 1));
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(new.tenant_id::text || ':' || person::text, 2));
  end loop;
  select coalesce(l.timezone, 'Europe/Madrid') into zone from public.service_locations l
    where l.tenant_id = new.tenant_id and l.id = new.location_id;
  zone := coalesce(zone, 'Europe/Madrid');
  if exists (select 1 from public.service_visits v
    where v.tenant_id = new.tenant_id and v.id <> new.id
      and v.status in ('scheduled', 'in_progress')
      and v.scheduled_start_at < new.scheduled_end_at
      and v.scheduled_end_at > new.scheduled_start_at
      and (v.assigned_user_id = any(people) or exists (
        select 1 from public.work_team_members m where m.tenant_id = v.tenant_id
          and m.team_id = v.work_team_id and m.user_id = any(people)
      ))) or exists (select 1 from public.absence_requests a
        where a.tenant_id = new.tenant_id and a.requester_id = any(people)
          and a.status = 'approved' and a.absence_type in ('vacation', 'sick_leave')
          and a.start_date <= ((new.scheduled_end_at - interval '1 microsecond') at time zone zone)::date
          and coalesce(a.end_date, 'infinity'::date) >= (new.scheduled_start_at at time zone zone)::date)
  then conflict_found := true; end if;
  if conflict_found then
    if tg_op = 'INSERT' and new.contract_id is not null and new.contract_rule_id is not null
      and new.contract_occurrence_on is not null then
      insert into public.service_contract_generation_issues
        (tenant_id, contract_id, rule_id, occurrence_on, schedule_version, kind, detail)
      values (new.tenant_id, new.contract_id, new.contract_rule_id, new.contract_occurrence_on,
        new.contract_schedule_version, 'assignment_conflict',
        'Visita pendiente de asignar: equipo o persona no disponible') on conflict do nothing;
      new.work_team_id := null;
      new.assigned_user_id := null;
    else
      raise exception 'El equipo o una de sus personas no está disponible en ese horario'
        using errcode = 'P0409';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_team_visit_assignment() from public, anon, authenticated, service_role;
create trigger service_visits_team_guard before insert or update of work_team_id,
  assigned_user_id, scheduled_start_at, scheduled_end_at, location_id on public.service_visits
  for each row execute function app_private.guard_team_visit_assignment();

-- Do not silently create conflicts when a person joins an already planned team.
create function app_private.guard_team_member_visit_conflicts() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.tenant_id::text || ':' || new.user_id::text, 1));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.tenant_id::text || ':' || new.user_id::text, 2));
  if exists (select 1 from public.service_visits v
    where v.tenant_id = new.tenant_id and v.work_team_id = new.team_id
      and v.status in ('scheduled', 'in_progress') and (
        exists (select 1 from public.service_visits other
          where other.tenant_id = v.tenant_id and other.id <> v.id
            and other.work_team_id is distinct from new.team_id
            and other.status in ('scheduled', 'in_progress')
            and other.scheduled_start_at < v.scheduled_end_at
            and other.scheduled_end_at > v.scheduled_start_at
            and (other.assigned_user_id = new.user_id or exists (
              select 1 from public.work_team_members m where m.tenant_id = other.tenant_id
                and m.team_id = other.work_team_id and m.user_id = new.user_id)))
        or exists (select 1 from public.absence_requests a
          left join public.service_locations l on l.id = v.location_id and l.tenant_id = v.tenant_id
          where a.tenant_id = v.tenant_id and a.requester_id = new.user_id
            and a.status = 'approved' and a.absence_type in ('vacation', 'sick_leave')
            and a.start_date <= ((v.scheduled_end_at - interval '1 microsecond')
              at time zone coalesce(l.timezone, 'Europe/Madrid'))::date
            and coalesce(a.end_date, 'infinity'::date) >= (v.scheduled_start_at
              at time zone coalesce(l.timezone, 'Europe/Madrid'))::date))) then
    raise exception 'La persona tiene visitas o ausencias que coinciden con este equipo'
      using errcode = 'P0409';
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_team_member_visit_conflicts() from public, anon, authenticated, service_role;
create trigger work_team_members_visit_guard before insert on public.work_team_members
  for each row execute function app_private.guard_team_member_visit_conflicts();

-- Keep assignment changes atomic and preserve the original command's retry checks.
do $commands$
declare definition text; updated text;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into strict definition
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'update_paper_visit';
  updated := replace(definition,
    'set work_team_id = team, route_order = (p_change->>''route_order'')::integer',
    'set work_team_id = team, assigned_user_id = case when team is not null then null else v.assigned_user_id end, route_order = (p_change->>''route_order'')::integer');
  if updated = definition then raise exception 'Unexpected update_paper_visit definition'; end if;
  execute updated;
  select pg_catalog.pg_get_functiondef(p.oid) into strict definition
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'replan_service_visit';
  updated := replace(definition, E'assigned_user_id = p_assigned_user_id\n  where id = target.id;',
    E'assigned_user_id = p_assigned_user_id,\n      work_team_id = case when p_assigned_user_id is not null then null else target.work_team_id end\n  where id = target.id;');
  if updated = definition then raise exception 'Unexpected replan_service_visit definition'; end if;
  execute updated;
end;
$commands$;
