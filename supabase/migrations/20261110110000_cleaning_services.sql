-- Extend existing contract rules into independent services; existing rules remain valid.
alter table public.service_locations
  add column operational_contact text not null default '' check(char_length(operational_contact) <= 1000),
  add column access_notes text not null default '' check(char_length(access_notes) <= 2000),
  add column notes text not null default '' check(char_length(notes) <= 2000);
alter table public.service_contract_visit_rules
  drop constraint service_contract_visit_rules_contract_id_season_weekday_key,
  add column location_id uuid,
  add column modality text not null default 'mobile' check (modality in ('fixed', 'mobile')),
  add column service_type text not null default 'other' check (service_type in ('ordinary', 'windows', 'garage', 'other')),
  add column frequency text check (frequency in ('weekly', 'fortnightly', 'days15', 'monthly')),
  add column anchor_on date,
  add column ends_on date,
  add column weekdays smallint[] not null default '{}',
  add column tasks text not null default '' check (char_length(tasks) <= 10000),
  add column weekly_tasks jsonb not null default '{}' check (jsonb_typeof(weekly_tasks) = 'object'),
  add column instructions text not null default '' check (char_length(instructions) <= 5000),
  add column requires_acceptance boolean not null default false,
  add column time_known boolean not null default true,
  add column assigned_user_id uuid,
  add column work_team_id uuid,
  add foreign key (location_id, tenant_id) references public.service_locations(id, tenant_id),
  add foreign key (tenant_id, assigned_user_id) references public.memberships(tenant_id, user_id),
  add foreign key (work_team_id, tenant_id) references public.work_teams(id, tenant_id),
  add check (ends_on is null or ends_on >= anchor_on);

-- Preserve the legacy seasonal-rule uniqueness without restricting independent services.
create unique index service_contract_legacy_rule_key
  on public.service_contract_visit_rules(contract_id,season,weekday) where frequency is null;

alter table public.service_visits
  add column work_team_id uuid,
  add column route_order integer not null default 0 check (route_order between 0 and 10000),
  add column paper_snapshot jsonb not null default '{}',
  add column performed_on date,
  add column completion_notes text not null default '' check (char_length(completion_notes) <= 5000),
  add foreign key (work_team_id, tenant_id) references public.work_teams(id, tenant_id);

create function public.add_cleaning_service(p_tenant_id uuid, p_contract_id uuid, p_service jsonb, p_operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  c public.service_contracts%rowtype;
  r public.service_contract_visit_rules%rowtype;
  prior public.service_contract_events%rowtype;
  location uuid := (p_service->>'location_id')::uuid;
  person uuid := nullif(p_service->>'assigned_user_id', '')::uuid;
  team uuid := nullif(p_service->>'work_team_id', '')::uuid;
  anchor date := (p_service->>'anchor_on')::date;
  ending date := nullif(p_service->>'ends_on', '')::date;
  days smallint[];
  new_id uuid;
begin
  if auth.uid() is null or not public.has_role(p_tenant_id, array['owner','admin','editor']::public.app_role[])
    then raise exception 'No tienes permiso' using errcode = '42501'; end if;
  if not public.tenant_can_write(p_tenant_id) then raise exception 'Empresa no disponible' using errcode = 'P0402'; end if;
  if p_operation_id is null or p_service->>'frequency' is null or p_service->>'modality' is null
    then raise exception 'Faltan datos del servicio' using errcode = '22023'; end if;
  select * into c from public.service_contracts where id = p_contract_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Contrato no editable' using errcode = 'P0409'; end if;
  select * into r from public.service_contract_visit_rules where id = p_operation_id;
  if found then
    select * into prior from public.service_contract_events where operation_id = p_operation_id;
    if r.tenant_id <> p_tenant_id or r.contract_id <> p_contract_id
      or prior.payload->'service' is distinct from p_service then raise exception 'Operación utilizada' using errcode = '23505'; end if;
    return r.id;
  end if;
  if c.status not in ('draft','active') then raise exception 'Contrato no editable' using errcode = 'P0409'; end if;
  if not exists (select 1 from public.service_locations l where l.id = location and l.tenant_id = p_tenant_id
    and l.client_id = c.client_id and l.active and l.kind <> 'billing')
    then raise exception 'Centro no disponible' using errcode = '22023'; end if;
  if anchor is null or anchor < c.starts_on or (c.ends_on is not null and anchor > c.ends_on)
    or (ending is not null and (ending < anchor or (c.ends_on is not null and ending > c.ends_on)))
    then raise exception 'Vigencia fuera del contrato' using errcode = '22023'; end if;
  if person is not null and not exists (select 1 from public.memberships where tenant_id = p_tenant_id and user_id = person and role in ('user','technician'))
    then raise exception 'Persona no disponible' using errcode = '22023'; end if;
  if team is not null and not exists (select 1 from public.work_teams where id = team and tenant_id = p_tenant_id and archived_at is null)
    then raise exception 'Equipo no disponible' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct d::smallint order by d::smallint), '{}') into days
    from jsonb_array_elements_text(coalesce(p_service->'weekdays','[]')) d;
  if not (days <@ array[1,2,3,4,5,6,7]::smallint[]) or
    (p_service->>'frequency' in ('weekly','fortnightly') and cardinality(days) = 0)
    then raise exception 'Selecciona los días de servicio' using errcode = '22023'; end if;
  insert into public.service_contract_visit_rules (
    id, tenant_id, contract_id, season, months, weekday, every_n_weeks, local_start, duration_minutes, title,
    location_id, modality, service_type, frequency, anchor_on, ends_on, weekdays, tasks, weekly_tasks,
    instructions, requires_acceptance, time_known, assigned_user_id, work_team_id
  ) values (
    p_operation_id, p_tenant_id, c.id, 'high', array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[],
    coalesce(days[1],1), 1, coalesce(nullif(p_service->>'local_start','')::time,'09:00'),
    (p_service->>'duration_minutes')::smallint, trim(p_service->>'title'), location,
    p_service->>'modality', p_service->>'service_type', p_service->>'frequency', anchor, ending, days,
    coalesce(p_service->>'tasks',''), coalesce(p_service->'weekly_tasks','{}'), coalesce(p_service->>'instructions',''),
    coalesce((p_service->>'requires_acceptance')::boolean,false), coalesce(p_service->>'local_start','') <> '', person, team
  ) returning id into new_id;
  insert into public.service_contract_events(operation_id,tenant_id,contract_id,kind,payload,actor_id)
    values(p_operation_id,p_tenant_id,c.id,'rule_added',jsonb_build_object('serviceId',new_id,'service',p_service),auth.uid());
  update public.service_contracts set title = title where id = c.id;
  return new_id;
end;
$$;
revoke all on function public.add_cleaning_service(uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.add_cleaning_service(uuid,uuid,jsonb,uuid) to authenticated;

create function app_private.cleaning_service_due(p_date date, p_anchor date, p_frequency text, p_days smallint[])
returns boolean language sql immutable set search_path = '' as $$
  select p_date >= p_anchor and case p_frequency
    when 'weekly' then extract(isodow from p_date)::smallint = any(p_days)
    when 'fortnightly' then extract(isodow from p_date)::smallint = any(p_days)
      and mod((date_trunc('week',p_date::timestamp)::date - date_trunc('week',p_anchor::timestamp)::date) / 7, 2) = 0
    when 'days15' then mod(p_date - p_anchor, 15) = 0
    when 'monthly' then extract(day from p_date) = least(extract(day from p_anchor),
      extract(day from (date_trunc('month',p_date) + interval '1 month - 1 day')))
    else false end
$$;
revoke all on function app_private.cleaning_service_due(date,date,text,smallint[]) from public,anon,authenticated;

create function app_private.capture_paper_visit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.service_contract_visit_rules%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.paper_snapshot is distinct from old.paper_snapshot then raise exception 'El parte original es inmutable'; end if;
    return new;
  end if;
  select * into r from public.service_contract_visit_rules where id = new.contract_rule_id and tenant_id = new.tenant_id;
  select jsonb_build_object('client',c.name,'center',coalesce(l.name,''),'address',coalesce(l.address,''),
    'tasks',concat_ws(E'\n',nullif(r.tasks,''),nullif(r.weekly_tasks->>extract(isodow from new.contract_occurrence_on)::integer::text,'')),
    'instructions',concat_ws(E'\n',nullif(l.operational_contact,''),nullif(l.access_notes,''),nullif(l.notes,''),nullif(l.opening_hours,''),nullif(r.instructions,''),nullif(new.notes,'')),
    'requiresAcceptance',coalesce(r.requires_acceptance,true),'timeKnown',coalesce(r.time_known,true))
    into new.paper_snapshot from public.clients c left join public.service_locations l
      on l.id = new.location_id and l.tenant_id = c.tenant_id
    where c.id = new.client_id and c.tenant_id = new.tenant_id;
  return new;
end;
$$;
revoke all on function app_private.capture_paper_visit() from public,anon,authenticated;
create trigger service_visits_paper_snapshot before insert or update on public.service_visits
  for each row execute function app_private.capture_paper_visit();

create or replace function app_private.generate_contract_visits(p_tenant_id uuid,p_from date,p_through date)
returns integer language plpgsql security definer set search_path = '' as $$
declare c public.service_contracts%rowtype; r public.service_contract_visit_rules%rowtype;
  day date; first_day date; last_day date; local_time timestamp; start_at timestamptz;
  person uuid; visit_id uuid; total integer := 0; horizon integer; zone text;
begin
  if p_tenant_id is null or (p_from is null) <> (p_through is null) or p_through < p_from or p_through > p_from + 179
    then raise exception 'Rango de generación inválido' using errcode = '22023'; end if;
  if not public.tenant_can_write(p_tenant_id) then return 0; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text,31));
  select visit_horizon_days into horizon from public.tenants where id = p_tenant_id;
  for c in select * from public.service_contracts where tenant_id = p_tenant_id and status = 'active' order by id loop
    for r in select * from public.service_contract_visit_rules where contract_id = c.id and modality = 'mobile' order by id loop
      select timezone into zone from public.service_locations where id = coalesce(r.location_id,c.location_id) and tenant_id = p_tenant_id and active;
      if not found then continue; end if;
      first_day := greatest(coalesce(p_from,(now() at time zone zone)::date),c.starts_on,coalesce(r.anchor_on,c.starts_on));
      last_day := least(coalesce(p_through,first_day + horizon - 1),coalesce(c.ends_on,first_day + 179),coalesce(r.ends_on,first_day + 179));
      for day in select gs::date from generate_series(first_day::timestamp,last_day::timestamp,interval '1 day') gs loop
        if r.frequency is null then
          if extract(isodow from day)::integer <> r.weekday or not (extract(month from day)::smallint = any(r.months))
            or mod((day-c.starts_on)/7,r.every_n_weeks) <> 0 then continue; end if;
        elsif not app_private.cleaning_service_due(day,r.anchor_on,r.frequency,r.weekdays) then continue; end if;
        if exists(select 1 from public.service_visits v where v.contract_rule_id = r.id and v.contract_occurrence_on = day
          and (r.frequency is not null or v.contract_schedule_version = c.schedule_version)) then continue; end if;
        local_time := day + r.local_start;
        start_at := local_time at time zone zone;
        if start_at at time zone zone <> local_time
          or (start_at - interval '1 hour') at time zone zone = local_time
          or (start_at + interval '1 hour') at time zone zone = local_time then
          insert into public.service_contract_generation_issues(tenant_id,contract_id,rule_id,occurrence_on,schedule_version,kind,detail)
            values(p_tenant_id,c.id,r.id,day,c.schedule_version,'invalid_local_time','Hora local inexistente o ambigua') on conflict do nothing;
          continue;
        end if;
        person := coalesce(r.assigned_user_id,case when r.work_team_id is null then c.default_assigned_user_id end);
        if person is not null then
          perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || person::text,1));
          if not exists(select 1 from public.memberships where tenant_id = p_tenant_id and user_id = person and role in ('user','technician'))
            or exists(select 1 from public.service_visits v where v.tenant_id = p_tenant_id and v.assigned_user_id = person
              and v.status in ('scheduled','in_progress') and v.scheduled_start_at < start_at + make_interval(mins=>r.duration_minutes) and v.scheduled_end_at > start_at)
            or exists(select 1 from public.absence_requests a where a.tenant_id = p_tenant_id and a.requester_id = person
              and a.status = 'approved' and a.start_date <= day and coalesce(a.end_date,'infinity'::date) >= day) then
            insert into public.service_contract_generation_issues(tenant_id,contract_id,rule_id,occurrence_on,schedule_version,kind,detail)
              values(p_tenant_id,c.id,r.id,day,c.schedule_version,'assignment_conflict','Persona no disponible; revisar asignación') on conflict do nothing;
            person := null;
          end if;
        end if;
        visit_id := null;
        insert into public.service_visits(operation_id,tenant_id,client_id,location_id,asset_id,title,assigned_user_id,
          scheduled_start_at,scheduled_end_at,contract_id,contract_rule_id,contract_occurrence_on,contract_schedule_version,work_team_id)
        values(gen_random_uuid(),p_tenant_id,c.client_id,coalesce(r.location_id,c.location_id),case when r.location_id is null then c.asset_id end,r.title,person,
          start_at,start_at + make_interval(mins=>r.duration_minutes),c.id,r.id,day,c.schedule_version,r.work_team_id)
        on conflict do nothing returning id into visit_id;
        if visit_id is not null then
          insert into public.service_visit_events(operation_id,tenant_id,visit_id,kind,payload,actor_id)
            values(gen_random_uuid(),p_tenant_id,visit_id,'created',jsonb_build_object('occurrenceOn',day,'source','contract_generator'),auth.uid());
          total := total + 1;
        end if;
      end loop;
    end loop;
  end loop;
  return total;
end;
$$;