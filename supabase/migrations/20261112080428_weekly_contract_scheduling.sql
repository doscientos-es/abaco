-- Additive schedule support: legacy rules and existing occurrence identities are preserved.
alter table public.service_contract_visit_rules
  add column weekly_slots jsonb not null default '[]'
    check (jsonb_typeof(weekly_slots) = 'array' and jsonb_array_length(weekly_slots) <= 56);
alter table public.service_visits add column contract_slot_key text not null default ''
  check (char_length(contract_slot_key) <= 64);
drop index public.service_visits_contract_occurrence_idx;
create unique index service_visits_contract_occurrence_idx on public.service_visits
  (contract_id,contract_rule_id,contract_occurrence_on,contract_schedule_version,contract_slot_key)
  where contract_id is not null;
create unique index service_visits_weekly_slot_occurrence_idx on public.service_visits
  (contract_rule_id,contract_occurrence_on,contract_slot_key) where contract_slot_key <> '';

-- Keep the existing permission, optimistic-version and operation-id checks as a single source.
alter function public.update_draft_contract_details(uuid,uuid,timestamptz,date,date,text,text,uuid) set schema app_private;
revoke all on function app_private.update_draft_contract_details(uuid,uuid,timestamptz,date,date,text,text,uuid) from public,anon,authenticated,service_role;
create function public.update_draft_contract_details(p_tenant_id uuid,p_contract_id uuid,
  p_expected_updated_at timestamptz,p_starts_on date,p_ends_on date,p_renewal_mode text,
  p_notes text,p_operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
begin
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on or p_ends_on > p_starts_on + 3660
    then raise exception 'Indica inicio y fin del contrato, con una vigencia máxima de 10 años' using errcode='22023'; end if;
  return app_private.update_draft_contract_details(p_tenant_id,p_contract_id,p_expected_updated_at,
    p_starts_on,p_ends_on,p_renewal_mode,p_notes,p_operation_id);
end;
$$;
revoke all on function public.update_draft_contract_details(uuid,uuid,timestamptz,date,date,text,text,uuid) from public,anon;
grant execute on function public.update_draft_contract_details(uuid,uuid,timestamptz,date,date,text,text,uuid) to authenticated;

create function app_private.validate_weekly_slots(p_slots jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare slot jsonb;
begin
  if jsonb_typeof(p_slots) is distinct from 'array' or jsonb_array_length(p_slots) not between 1 and 56
    then raise exception 'Marca entre 1 y 56 franjas semanales' using errcode='22023'; end if;
  for slot in select value from jsonb_array_elements(p_slots) loop
    if jsonb_typeof(slot) is distinct from 'object' or coalesce(slot->>'id','') !~ '^[a-zA-Z0-9-]{1,64}$'
      or coalesce(slot->>'weekday','') !~ '^[1-7]$'
      or coalesce(slot->>'start_minute','') !~ '^[0-9]{1,4}$'
      or coalesce(slot->>'duration_minutes','') !~ '^[0-9]{1,3}$'
      then raise exception 'Franja semanal inválida' using errcode='22023'; end if;
    if (slot->>'start_minute')::integer not between 0 and 1425 or mod((slot->>'start_minute')::integer,15)<>0
      or (slot->>'duration_minutes')::integer not between 15 and 720 or mod((slot->>'duration_minutes')::integer,15)<>0
      then raise exception 'Franja semanal inválida' using errcode='22023'; end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_slots)) <> jsonb_array_length(p_slots)
    then raise exception 'Identificadores de franja duplicados' using errcode='22023'; end if;
  if exists(
    select 1 from jsonb_array_elements(p_slots) a cross join jsonb_array_elements(p_slots) b
    cross join (values(-10080),(0),(10080)) shift(minutes)
    where a->>'id'<>b->>'id'
      and ((a->>'weekday')::integer-1)*1440+(a->>'start_minute')::integer
        < ((b->>'weekday')::integer-1)*1440+(b->>'start_minute')::integer+shift.minutes+(b->>'duration_minutes')::integer
      and ((a->>'weekday')::integer-1)*1440+(a->>'start_minute')::integer+(a->>'duration_minutes')::integer
        > ((b->>'weekday')::integer-1)*1440+(b->>'start_minute')::integer+shift.minutes)
    then raise exception 'Las franjas del mismo trabajo no pueden solaparse' using errcode='22023'; end if;
end;
$$;
revoke all on function app_private.validate_weekly_slots(jsonb) from public,anon,authenticated,service_role;

-- One implementation serves cron, explicit month recovery, and contract-scoped activation.
create function app_private.generate_scheduled_contract_visits(p_tenant_id uuid,p_from date,p_through date,p_contract_id uuid default null)
returns integer language plpgsql security definer set search_path='' as $$
declare c public.service_contracts%rowtype; r public.service_contract_visit_rules%rowtype;
  day date; first_day date; last_day date; local_time timestamp; local_end timestamp;
  start_at timestamptz; end_at timestamptz; person uuid; visit_id uuid; total integer:=0;
  horizon integer; zone text; slot jsonb; slot_key text; duration integer; start_minute integer;
begin
  if p_tenant_id is null or (p_from is null)<>(p_through is null) or p_through<p_from
    or (p_contract_id is null and p_through>p_from+179)
    or (p_contract_id is not null and (p_from is null or p_through>p_from+3660))
    then raise exception 'Rango de generación inválido' using errcode='22023'; end if;
  if not public.tenant_can_write(p_tenant_id) then return 0; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text,31));
  select visit_horizon_days into horizon from public.tenants where id=p_tenant_id;
  for c in select * from public.service_contracts where tenant_id=p_tenant_id and status='active'
    and (p_contract_id is null or id=p_contract_id) order by id loop
    for r in select * from public.service_contract_visit_rules where contract_id=c.id and modality='mobile' and configured order by id loop
      select timezone into zone from public.service_locations where id=coalesce(r.location_id,c.location_id) and tenant_id=p_tenant_id and active;
      if not found then raise exception 'Centro no disponible para generar trabajos' using errcode='22023'; end if;
      first_day:=greatest(coalesce(p_from,(now() at time zone zone)::date),c.starts_on,coalesce(r.anchor_on,c.starts_on));
      last_day:=least(coalesce(p_through,first_day+horizon-1),coalesce(c.ends_on,first_day+179),coalesce(r.ends_on,p_through,first_day+179));
      for day in select gs::date from generate_series(first_day::timestamp,last_day::timestamp,interval '1 day') gs loop
        if r.frequency is null then
          if extract(isodow from day)::integer<>r.weekday or not(extract(month from day)::smallint=any(r.months))
            or mod((day-c.starts_on)/7,r.every_n_weeks)<>0 then continue; end if;
        elsif not app_private.cleaning_service_due(day,r.anchor_on,r.frequency,r.weekdays) then continue; end if;
        for slot in select value from jsonb_array_elements(case when jsonb_array_length(r.weekly_slots)>0 then r.weekly_slots else '[{}]'::jsonb end)
          where not(value ? 'weekday') or (value->>'weekday')::integer=extract(isodow from day)::integer loop
          slot_key:=coalesce(slot->>'id','');
          if exists(select 1 from public.service_visits v where v.contract_rule_id=r.id and v.contract_occurrence_on=day
            and v.contract_slot_key=slot_key and (r.frequency is not null or v.contract_schedule_version=c.schedule_version)) then continue; end if;
          start_minute:=coalesce((slot->>'start_minute')::integer,(extract(hour from r.local_start)*60+extract(minute from r.local_start))::integer);
          duration:=coalesce((slot->>'duration_minutes')::integer,r.duration_minutes);
          local_time:=day::timestamp+make_interval(mins=>start_minute);
          local_end:=local_time+make_interval(mins=>duration);
          start_at:=local_time at time zone zone; end_at:=local_end at time zone zone;
          if start_at at time zone zone<>local_time or end_at at time zone zone<>local_end
            or (start_at-interval '1 hour') at time zone zone=local_time or (start_at+interval '1 hour') at time zone zone=local_time
            or (end_at-interval '1 hour') at time zone zone=local_end or (end_at+interval '1 hour') at time zone zone=local_end
            or end_at<=start_at or end_at>start_at+interval '12 hours'
            or local_end>coalesce(least(c.ends_on,r.ends_on),c.ends_on,r.ends_on,'infinity'::date)::timestamp+interval '1 day' then
            insert into public.service_contract_generation_issues(tenant_id,contract_id,rule_id,occurrence_on,schedule_version,kind,detail)
              values(p_tenant_id,c.id,r.id,day,c.schedule_version,'invalid_local_time','Franja '||slot_key||': hora local inexistente, ambigua o fuera de vigencia') on conflict do nothing;
            continue;
          end if;
          person:=coalesce(r.assigned_user_id,case when r.work_team_id is null then c.default_assigned_user_id end);
          if person is not null then
            perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||person::text,1));
            if not exists(select 1 from public.memberships where tenant_id=p_tenant_id and user_id=person and role in ('user','technician'))
              or exists(select 1 from public.service_visits v where v.tenant_id=p_tenant_id and v.assigned_user_id=person
                and v.status in ('scheduled','in_progress') and v.scheduled_start_at<end_at and v.scheduled_end_at>start_at)
              or exists(select 1 from public.absence_requests a where a.tenant_id=p_tenant_id and a.requester_id=person
                and a.status='approved' and a.start_date<=(local_end-interval '1 microsecond')::date and coalesce(a.end_date,'infinity'::date)>=day) then
              insert into public.service_contract_generation_issues(tenant_id,contract_id,rule_id,occurrence_on,schedule_version,kind,detail)
                values(p_tenant_id,c.id,r.id,day,c.schedule_version,'assignment_conflict','Persona no disponible; revisar asignación') on conflict do nothing;
              person:=null;
            end if;
          end if;
          if r.work_team_id is not null and (
            not exists(select 1 from public.work_teams where id=r.work_team_id and tenant_id=p_tenant_id and archived_at is null)
            or exists(select 1 from public.service_visits v where v.tenant_id=p_tenant_id and v.status in ('scheduled','in_progress')
              and v.scheduled_start_at<end_at and v.scheduled_end_at>start_at and (
                v.work_team_id=r.work_team_id or exists(select 1 from public.work_team_members a
                  where a.tenant_id=p_tenant_id and a.team_id=r.work_team_id and (a.user_id=v.assigned_user_id
                    or exists(select 1 from public.work_team_members b where b.tenant_id=p_tenant_id and b.team_id=v.work_team_id and b.user_id=a.user_id)))))
            or exists(select 1 from public.work_team_members m join public.absence_requests a on a.tenant_id=m.tenant_id and a.requester_id=m.user_id
              where m.team_id=r.work_team_id and m.tenant_id=p_tenant_id and a.status='approved'
                and a.start_date<=(local_end-interval '1 microsecond')::date and coalesce(a.end_date,'infinity'::date)>=day)) then
            insert into public.service_contract_generation_issues(tenant_id,contract_id,rule_id,occurrence_on,schedule_version,kind,detail)
              values(p_tenant_id,c.id,r.id,day,c.schedule_version,'assignment_conflict','Equipo con solapamientos, ausencias o archivado; revisar cobertura') on conflict do nothing;
          end if;
          visit_id:=null;
          insert into public.service_visits(operation_id,tenant_id,client_id,location_id,asset_id,title,assigned_user_id,
            scheduled_start_at,scheduled_end_at,contract_id,contract_rule_id,contract_occurrence_on,contract_schedule_version,work_team_id,contract_slot_key)
          values(gen_random_uuid(),p_tenant_id,c.client_id,coalesce(r.location_id,c.location_id),case when r.location_id is null then c.asset_id end,r.title,person,
            start_at,end_at,c.id,r.id,day,c.schedule_version,r.work_team_id,slot_key)
          on conflict do nothing returning id into visit_id;
          if visit_id is not null then
            insert into public.service_visit_events(operation_id,tenant_id,visit_id,kind,payload,actor_id)
              values(gen_random_uuid(),p_tenant_id,visit_id,'created',jsonb_build_object('occurrenceOn',day,'slot',slot_key,'source','contract_generator'),null);
            total:=total+1;
          end if;
        end loop;
      end loop;
    end loop;
  end loop;
  return total;
end;
$$;
revoke all on function app_private.generate_scheduled_contract_visits(uuid,date,date,uuid) from public,anon,authenticated,service_role;
create or replace function app_private.generate_contract_visits(p_tenant_id uuid,p_from date,p_through date)
returns integer language sql security definer set search_path='' as $$
  select app_private.generate_scheduled_contract_visits(p_tenant_id,p_from,p_through,null)
$$;

alter function public.save_contract_job(uuid,uuid,uuid,timestamptz,jsonb,uuid) set schema app_private;
revoke all on function app_private.save_contract_job(uuid,uuid,uuid,timestamptz,jsonb,uuid) from public,anon,authenticated,service_role;
create function public.save_contract_job(p_tenant_id uuid,p_contract_id uuid,p_job_id uuid,
  p_expected_updated_at timestamptz,p_service jsonb,p_operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare slots jsonb:=coalesce(p_service->'weekly_slots','[]'); result uuid; c public.service_contracts%rowtype; days smallint[];
begin
  if auth.uid() is null or not public.has_role(p_tenant_id,array['owner','admin','editor']::public.app_role[])
    or not public.tenant_can_write(p_tenant_id) then raise exception 'No tienes permiso' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text,31));
  select * into c from public.service_contracts where id=p_contract_id and tenant_id=p_tenant_id for update;
  if not found then raise exception 'Contrato no encontrado' using errcode='P0002'; end if;
  -- Replaying an older valid command must never overwrite a later schedule edit.
  if exists(select 1 from public.service_contract_events where operation_id=p_operation_id) then
    return app_private.save_contract_job(p_tenant_id,p_contract_id,p_job_id,p_expected_updated_at,p_service,p_operation_id);
  end if;
  if p_service->>'frequency'<>'once' and (c.ends_on is null or c.ends_on>c.starts_on+3660)
    then raise exception 'Guarda primero inicio y fin del contrato' using errcode='22023'; end if;
  if p_service->>'frequency'<>'once' and p_service->>'modality'='mobile' and nullif(p_service->>'work_team_id','') is null
    then raise exception 'Selecciona el equipo que realizará los trabajos' using errcode='22023'; end if;
  if p_service->>'frequency' in ('monthly','days15') and nullif(p_service->>'local_start','') is null
    then raise exception 'Marca la franja horaria de referencia' using errcode='22023'; end if;
  if p_service->>'frequency' in ('weekly','fortnightly') then
    perform app_private.validate_weekly_slots(slots);
    select array_agg(distinct (value->>'weekday')::smallint order by (value->>'weekday')::smallint) into days from jsonb_array_elements(slots);
    if to_jsonb(days) is distinct from p_service->'weekdays' then raise exception 'Los días no coinciden con el calendario' using errcode='22023'; end if;
  elsif slots<>'[]'::jsonb then raise exception 'Esta frecuencia no admite una semana tipo' using errcode='22023'; end if;
  result:=app_private.save_contract_job(p_tenant_id,p_contract_id,p_job_id,p_expected_updated_at,p_service,p_operation_id);
  update public.service_contract_visit_rules set weekly_slots=slots where id=result and tenant_id=p_tenant_id and weekly_slots is distinct from slots;
  if c.status='active' and c.ends_on is not null then
    perform app_private.generate_scheduled_contract_visits(p_tenant_id,greatest(c.starts_on,(now() at time zone c.timezone)::date),c.ends_on,c.id);
  end if;
  return result;
end;
$$;
revoke all on function public.save_contract_job(uuid,uuid,uuid,timestamptz,jsonb,uuid) from public,anon;
grant execute on function public.save_contract_job(uuid,uuid,uuid,timestamptz,jsonb,uuid) to authenticated;

-- All generation paths acquire the tenant lock before any contract row lock.
alter function public.transition_service_contract(uuid,uuid,timestamptz,text,text,uuid) set schema app_private;
revoke all on function app_private.transition_service_contract(uuid,uuid,timestamptz,text,text,uuid) from public,anon,authenticated,service_role;
create function public.transition_service_contract(p_tenant_id uuid,p_contract_id uuid,p_expected_updated_at timestamptz,
  p_next_status text,p_reason text,p_operation_id uuid) returns text
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.has_role(p_tenant_id,array['owner','admin','editor']::public.app_role[])
    then raise exception 'No tienes permiso para cambiar contratos' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text,31));
  return app_private.transition_service_contract(p_tenant_id,p_contract_id,p_expected_updated_at,p_next_status,p_reason,p_operation_id);
end;
$$;
revoke all on function public.transition_service_contract(uuid,uuid,timestamptz,text,text,uuid) from public,anon;
grant execute on function public.transition_service_contract(uuid,uuid,timestamptz,text,text,uuid) to authenticated;

create function app_private.activate_full_contract_schedule() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='active' and old.status is distinct from new.status then
    -- Legacy seasonal contracts keep their existing month-preparation workflow.
    if not exists(select 1 from public.service_contract_visit_rules where contract_id=new.id and frequency is not null)
      then return new; end if;
    if old.status='draft' and (new.ends_on is null or new.ends_on<new.starts_on or new.ends_on>new.starts_on+3660)
      then raise exception 'Indica inicio y fin del contrato, con una vigencia máxima de 10 años' using errcode='22023'; end if;
    if exists(select 1 from public.service_contract_visit_rules r where r.contract_id=new.id and r.work_team_id is not null
      and not exists(select 1 from public.work_teams t where t.id=r.work_team_id and t.tenant_id=new.tenant_id and t.archived_at is null))
      then raise exception 'El equipo asignado ya no está disponible' using errcode='22023'; end if;
    if new.ends_on is not null then
      perform app_private.generate_scheduled_contract_visits(new.tenant_id,
        case when old.status='draft' then new.starts_on else greatest(new.starts_on,(now() at time zone new.timezone)::date) end,new.ends_on,new.id);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.activate_full_contract_schedule() from public,anon,authenticated,service_role;
create trigger service_contracts_generate_full_schedule after update of status on public.service_contracts
  for each row execute function app_private.activate_full_contract_schedule();