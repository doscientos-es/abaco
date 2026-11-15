-- Use the same person lock as visit and team-member assignment guards.
create or replace function app_private.lock_vacation_assignment_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.tenant_id::text || ':' || new.requester_id::text, 2));

  if new.status <> 'approved' or new.absence_type <> 'vacation' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'approved' and old.absence_type = 'vacation'
    and new.tenant_id = old.tenant_id and new.requester_id = old.requester_id
    and new.start_date = old.start_date and new.end_date is not distinct from old.end_date then
    return new;
  end if;

  if exists (
    select 1 from public.service_visits v
    left join public.service_locations l on l.id = v.location_id and l.tenant_id = v.tenant_id
    where v.tenant_id = new.tenant_id and v.status in ('scheduled', 'in_progress')
      and v.scheduled_end_at > pg_catalog.now()
      and (v.assigned_user_id = new.requester_id or exists (
        select 1 from public.work_team_members m
        where m.tenant_id = v.tenant_id and m.team_id = v.work_team_id
          and m.user_id = new.requester_id))
      and (v.scheduled_start_at at time zone coalesce(l.timezone, 'Europe/Madrid'))::date
        <= coalesce(new.end_date, 'infinity'::date)
      and ((v.scheduled_end_at - interval '1 microsecond')
        at time zone coalesce(l.timezone, 'Europe/Madrid'))::date >= new.start_date
  ) then
    raise exception 'Reasigna todas las visitas afectadas antes de aprobar las vacaciones'
      using errcode = 'P0411';
  end if;
  return new;
end;
$$;

-- Include team visits in the same review list; replacing an entire team with one
-- person requires an explicit manual decision, not a suggested substitution.
do $migration$
declare definition text; updated text;
begin
  select pg_catalog.pg_get_functiondef('public.list_vacation_coverage(uuid,uuid)'::regprocedure) into definition;
  updated := replace(definition,
    'v.scheduled_end_at, v.status, v.updated_at, wt.name,',
    'v.scheduled_end_at, v.status, v.updated_at, coalesce(vt.name, wt.name),');
  if updated = definition then raise exception 'Unexpected coverage projection'; end if;
  definition := updated;
  updated := replace(definition,
    E'    coalesce((\n      select jsonb_agg',
    E'    case when v.work_team_id is not null then ''[]''::jsonb else coalesce((\n      select jsonb_agg');
  if updated = definition then raise exception 'Unexpected coverage candidates'; end if;
  definition := updated;
  updated := replace(definition,
    E'    ), ''[]''::jsonb)\n  from public.service_visits v',
    E'    ), ''[]''::jsonb) end\n  from public.service_visits v');
  if updated = definition then raise exception 'Unexpected coverage candidate terminator'; end if;
  definition := updated;
  updated := replace(definition,
    '  where v.tenant_id = p_tenant_id and v.assigned_user_id = target.requester_id',
    E'  left join public.work_teams vt on vt.id = v.work_team_id and vt.tenant_id = v.tenant_id\n  where v.tenant_id = p_tenant_id and (v.assigned_user_id = target.requester_id or exists (\n    select 1 from public.work_team_members tm where tm.tenant_id = v.tenant_id\n      and tm.team_id = v.work_team_id and tm.user_id = target.requester_id))');
  if updated = definition then raise exception 'Unexpected coverage filter'; end if;
  execute updated;
end;
$migration$;