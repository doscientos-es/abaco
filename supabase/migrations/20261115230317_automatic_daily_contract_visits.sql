-- Automatically selected daily occurrences use the accepted task's preference,
-- not a manually drawn weekly work schedule. Existing schedules remain unchanged.
create function app_private.automatic_daily_contract_slot(
  p_tenant_id uuid, p_contract_id uuid, p_rule_id uuid, p_day date, p_zone text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  job public.service_contract_visit_rules%rowtype;
  opening jsonb;
  task_schedule jsonb;
  people uuid[];
  person uuid;
  preferred integer;
  duration integer;
  selected_minute integer;
begin
  select * into job from public.service_contract_visit_rules
    where id = p_rule_id and tenant_id = p_tenant_id and contract_id = p_contract_id;
  if not found then return null; end if;
  select opening_schedule into opening from public.service_locations
    where id = job.location_id and tenant_id = p_tenant_id and active;
  if opening is null then return null; end if;

  -- Do not silently choose one of several task schedules or invent a duration.
  if (select count(*) from public.contract_task_assignments
      where tenant_id = p_tenant_id and contract_id = p_contract_id and job_id = p_rule_id
        and task_key not like 'job:%' and schedule is not null) <> 1 then return null; end if;
  select schedule into task_schedule from public.contract_task_assignments
    where tenant_id = p_tenant_id and contract_id = p_contract_id and job_id = p_rule_id
      and task_key not like 'job:%' and schedule is not null;
  preferred := (task_schedule->>'start_minute')::integer;
  duration := (task_schedule->>'duration_minutes')::integer;
  if preferred not between 0 and 1439 or duration not between 15 and 720 then return null; end if;

  if job.work_team_id is not null then
    if not exists (select 1 from public.work_teams where id = job.work_team_id
      and tenant_id = p_tenant_id and archived_at is null) then return null; end if;
    select array_agg(user_id order by user_id) into people from public.work_team_members
      where tenant_id = p_tenant_id and team_id = job.work_team_id;
  else
    people := job.assigned_user_ids;
    -- Visits currently persist only one individual assignee, not a list.
    if cardinality(people) <> 1 then return null; end if;
  end if;
  if coalesce(cardinality(people), 0) = 0 then return null; end if;
  foreach person in array people loop
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || person::text, 1));
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || person::text, 2));
  end loop;
  if exists (select 1 from unnest(people) person where not exists (
      select 1 from public.memberships m where m.tenant_id = p_tenant_id
        and m.user_id = person and m.role in ('user', 'technician')))
    or exists (select 1 from public.absence_requests a where a.tenant_id = p_tenant_id
      and a.requester_id = any(people) and a.status = 'approved'
      and a.start_date <= p_day and coalesce(a.end_date, 'infinity'::date) >= p_day)
    or exists (select 1 from public.vacation_requests v where v.tenant_id = p_tenant_id
      and v.requester_id = any(people) and v.status = 'approved'
      and v.start_date <= p_day and coalesce(v.end_date, 'infinity'::date) >= p_day)
    then return null; end if;

  select candidate.minute into selected_minute
  from generate_series(0, 1440 - duration) as candidate(minute)
  cross join lateral (select p_day::timestamp + make_interval(mins => candidate.minute) as starts) local
  cross join lateral (select local.starts at time zone p_zone as starts_at,
    (local.starts + make_interval(mins => duration)) at time zone p_zone as ends_at) utc
  where exists (
    select 1 from jsonb_array_elements(opening) slot
    where (slot->>'weekday')::integer = extract(isodow from p_day)::integer
      and (extract(hour from (slot->>'start')::time) * 60 + extract(minute from (slot->>'start')::time)) <= candidate.minute
      and candidate.minute + duration <=
        (extract(hour from (slot->>'end')::time) * 60 + extract(minute from (slot->>'end')::time))
        + case when (slot->>'end')::time <= (slot->>'start')::time then 1440 else 0 end
  ) and not exists (
    select 1 from unnest(people) person where not exists (
      select 1 from public.staff_schedules s cross join lateral jsonb_array_elements(s.slots) slot
      where s.tenant_id = p_tenant_id and s.user_id = person
        and (slot->>'weekday')::integer = extract(isodow from p_day)::integer
        and (slot->>'start')::integer <= candidate.minute
        and (slot->>'end')::integer >= candidate.minute + duration
    )
  ) and utc.starts_at at time zone p_zone = local.starts
    and utc.ends_at at time zone p_zone = local.starts + make_interval(mins => duration)
    and (utc.starts_at - interval '1 hour') at time zone p_zone <> local.starts
    and (utc.starts_at + interval '1 hour') at time zone p_zone <> local.starts
    and (utc.ends_at - interval '1 hour') at time zone p_zone <> local.starts + make_interval(mins => duration)
    and (utc.ends_at + interval '1 hour') at time zone p_zone <> local.starts + make_interval(mins => duration)
    and utc.ends_at > utc.starts_at and utc.ends_at <= utc.starts_at + interval '12 hours'
    and not exists (
      select 1 from public.service_visits v where v.tenant_id = p_tenant_id
        and v.status in ('scheduled', 'in_progress') and v.scheduled_start_at < utc.ends_at
        and v.scheduled_end_at > utc.starts_at and (v.assigned_user_id = any(people)
          or exists (select 1 from public.work_team_members m where m.tenant_id = p_tenant_id
            and m.team_id = v.work_team_id and m.user_id = any(people)))
    )
  order by abs(candidate.minute - preferred), candidate.minute limit 1;
  if selected_minute is null then return null; end if;
  return jsonb_build_object('start_minute', selected_minute, 'duration_minutes', duration);
end;
$$;
revoke all on function app_private.automatic_daily_contract_slot(uuid,uuid,uuid,date,text)
  from public, anon, authenticated, service_role;

-- Preserve the existing generator, identities, permissions and legacy schedule behavior.
do $migration$
declare definition text; updated text;
begin
  select pg_get_functiondef('app_private.generate_scheduled_contract_visits(uuid,date,date,uuid)'::regprocedure) into definition;
  updated := replace(definition,
    'start_minute:=coalesce((slot->>''start_minute'')::integer',
    'if slot_key like ''auto-daily-%'' then
            slot:=app_private.automatic_daily_contract_slot(p_tenant_id,c.id,r.id,day,zone);
            if slot is null then
              insert into public.service_contract_generation_issues(tenant_id,contract_id,rule_id,occurrence_on,schedule_version,kind,detail)
                values(p_tenant_id,c.id,r.id,day,c.schedule_version,''assignment_conflict'',''No se encontró una franja válida: revisa el horario del centro, las personas y la programación de la tarea'') on conflict do nothing;
              continue;
            end if;
          end if;
          start_minute:=coalesce((slot->>''start_minute'')::integer');
  if updated = definition then raise exception 'Unexpected contract generator definition'; end if;
  execute updated;
end;
$migration$;