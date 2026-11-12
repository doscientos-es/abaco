-- Contract occurrences keep their original rule/date/version even if the visit
-- is later moved. This key makes retries and concurrent generators harmless.
alter table public.tenants
  add column visit_horizon_days integer not null default 30
  check (visit_horizon_days between 1 and 180);
alter table public.service_visits
  alter column created_by drop not null,
  add column contract_id uuid,
  add column contract_rule_id uuid,
  add column contract_occurrence_on date,
  add column contract_schedule_version integer,
  add constraint service_visits_contract_origin_complete check (
    (contract_id is null and contract_rule_id is null
      and contract_occurrence_on is null and contract_schedule_version is null)
    or (contract_id is not null and contract_rule_id is not null
      and contract_occurrence_on is not null and contract_schedule_version > 0)
  ),
  add constraint service_visits_contract_client_fk
    foreign key (contract_id, tenant_id, client_id)
    references public.service_contracts (id, tenant_id, client_id) on delete restrict,
  add constraint service_visits_contract_rule_fk
    foreign key (contract_rule_id, tenant_id, contract_id)
    references public.service_contract_visit_rules (id, tenant_id, contract_id)
    on delete restrict;
alter table public.service_visit_events alter column actor_id drop not null;
create unique index service_visits_contract_occurrence_idx
  on public.service_visits (
    contract_id, contract_rule_id, contract_occurrence_on,
    contract_schedule_version
  ) where contract_id is not null;
create index service_visits_contract_idx
  on public.service_visits (tenant_id, contract_id, scheduled_start_at)
  where contract_id is not null;

create table public.service_contract_generation_issues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contract_id uuid not null,
  rule_id uuid not null,
  occurrence_on date not null,
  schedule_version integer not null check (schedule_version > 0),
  kind text not null check (kind in ('invalid_local_time', 'assignment_conflict')),
  detail text not null,
  created_at timestamptz not null default now(),
  unique (contract_id, rule_id, occurrence_on, schedule_version, kind),
  foreign key (rule_id, tenant_id, contract_id)
    references public.service_contract_visit_rules (id, tenant_id, contract_id)
    on delete restrict
);
create index service_contract_generation_issues_tenant_idx
  on public.service_contract_generation_issues (tenant_id, created_at desc);
alter table public.service_contract_generation_issues enable row level security;
revoke all on public.service_contract_generation_issues
  from public, anon, authenticated;
grant select on public.service_contract_generation_issues
  to authenticated, service_role;
create policy service_contract_generation_issues_select
  on public.service_contract_generation_issues
  for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
  );

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create function app_private.generate_contract_visits(
  p_tenant_id uuid, p_from date, p_through date
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  contract_row public.service_contracts%rowtype;
  rule_row public.service_contract_visit_rules%rowtype;
  occurrence date;
  first_day date;
  last_day date;
  local_start timestamp;
  utc_start timestamptz;
  utc_end timestamptz;
  assignee uuid;
  created_id uuid;
  inserted_count integer := 0;
  horizon integer;
begin
  if p_tenant_id is null or (p_from is null) <> (p_through is null)
     or (p_from is not null and (p_through < p_from
       or p_through > p_from + 179)) then
    raise exception 'Rango de generación inválido' using errcode = '22023';
  end if;
  if not public.tenant_can_write(p_tenant_id) then return 0; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_tenant_id::text, 31)
  );
  select t.visit_horizon_days into horizon
  from public.tenants t where t.id = p_tenant_id;
  for contract_row in
    select c.* from public.service_contracts c
    where c.tenant_id = p_tenant_id and c.status = 'active'
    order by c.id
  loop
    first_day := greatest(
      coalesce(p_from, (now() at time zone contract_row.timezone)::date),
      contract_row.starts_on
    );
    last_day := least(
      coalesce(p_through, first_day + horizon - 1),
      coalesce(contract_row.ends_on, first_day + 179)
    );
    if last_day < first_day then continue; end if;
    for rule_row in
      select r.* from public.service_contract_visit_rules r
      where r.tenant_id = p_tenant_id and r.contract_id = contract_row.id
      order by r.id
    loop
      for occurrence in
        select gs::date
        from pg_catalog.generate_series(
          first_day::timestamp, last_day::timestamp, interval '1 day'
        ) gs
        where extract(isodow from gs)::integer = rule_row.weekday
          and extract(month from gs)::smallint = any(rule_row.months)
          and mod(((gs::date - contract_row.starts_on) / 7),
            rule_row.every_n_weeks) = 0
      loop
        if exists (
          select 1 from public.service_visits v
          where v.contract_id = contract_row.id
            and v.contract_rule_id = rule_row.id
            and v.contract_occurrence_on = occurrence
            and v.contract_schedule_version = contract_row.schedule_version
        ) then continue; end if;
        local_start := occurrence + rule_row.local_start;
        utc_start := local_start at time zone contract_row.timezone;
        if (utc_start at time zone contract_row.timezone) <> local_start
           or ((utc_start - interval '1 hour') at time zone contract_row.timezone)
             = local_start
           or ((utc_start + interval '1 hour') at time zone contract_row.timezone)
             = local_start then
          insert into public.service_contract_generation_issues (
            tenant_id, contract_id, rule_id, occurrence_on,
            schedule_version, kind, detail
          ) values (
            p_tenant_id, contract_row.id, rule_row.id, occurrence,
            contract_row.schedule_version, 'invalid_local_time',
            'La hora local no existe o es ambigua por el cambio de horario'
          ) on conflict do nothing;
          continue;
        end if;
        utc_end := utc_start + pg_catalog.make_interval(mins => rule_row.duration_minutes);
        assignee := contract_row.default_assigned_user_id;
        if assignee is not null then
          perform pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended(p_tenant_id::text || ':' || assignee::text, 1)
          );
          if not exists (
            select 1 from public.memberships m
            where m.tenant_id = p_tenant_id and m.user_id = assignee
              and m.role = 'technician'
          ) or exists (
            select 1 from public.service_visits v
            where v.tenant_id = p_tenant_id and v.assigned_user_id = assignee
              and v.status in ('scheduled', 'in_progress')
              and v.scheduled_start_at < utc_end
              and v.scheduled_end_at > utc_start
          ) then
            insert into public.service_contract_generation_issues (
              tenant_id, contract_id, rule_id, occurrence_on,
              schedule_version, kind, detail
            ) values (
              p_tenant_id, contract_row.id, rule_row.id, occurrence,
              contract_row.schedule_version, 'assignment_conflict',
              'Se ha generado pendiente de asignar: técnico no disponible'
            ) on conflict do nothing;
            assignee := null;
          end if;
        end if;
        created_id := null;
        insert into public.service_visits (
          operation_id, tenant_id, client_id, location_id, asset_id,
          title, priority, status, assigned_user_id,
          scheduled_start_at, scheduled_end_at, notes, created_by,
          contract_id, contract_rule_id, contract_occurrence_on,
          contract_schedule_version
        ) values (
          gen_random_uuid(), p_tenant_id, contract_row.client_id,
          contract_row.location_id, contract_row.asset_id,
          rule_row.title, 'normal', 'scheduled', assignee,
          utc_start, utc_end, '', null,
          contract_row.id, rule_row.id, occurrence,
          contract_row.schedule_version
        ) on conflict do nothing returning id into created_id;
        if created_id is not null then
          insert into public.service_visit_events (
            operation_id, tenant_id, visit_id, kind, payload, actor_id
          ) values (
            gen_random_uuid(), p_tenant_id, created_id, 'created',
            pg_catalog.jsonb_build_object(
              'source', 'contract_generator', 'contractId', contract_row.id,
              'ruleId', rule_row.id, 'occurrenceOn', occurrence,
              'scheduleVersion', contract_row.schedule_version,
              'assignedUserId', assignee
            ), null
          );
          inserted_count := inserted_count + 1;
        end if;
      end loop;
    end loop;
  end loop;
  return inserted_count;
end;
$$;
revoke all on function app_private.generate_contract_visits(uuid, date, date)
  from public, anon, authenticated, service_role;

create function public.generate_contract_visits(
  p_tenant_id uuid, p_from date, p_through date
) returns integer
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para generar visitas'
      using errcode = '42501';
  end if;
  return app_private.generate_contract_visits(p_tenant_id, p_from, p_through);
end;
$$;
revoke all on function public.generate_contract_visits(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.generate_contract_visits(uuid, date, date)
  to authenticated;

create function public.transition_service_contract(
  p_tenant_id uuid, p_contract_id uuid, p_expected_updated_at timestamptz,
  p_next_status text, p_reason text, p_operation_id uuid
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  target public.service_contracts%rowtype;
  prior public.service_contract_events%rowtype;
  changed_visit record;
  clean_reason text := trim(coalesce(p_reason, ''));
begin
  if p_tenant_id is null or p_contract_id is null
     or p_expected_updated_at is null or p_operation_id is null
     or p_next_status is null
     or p_next_status not in ('active', 'paused', 'expired', 'canceled')
     or char_length(clean_reason) > 500 then
    raise exception 'Datos de cambio de contrato inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para cambiar contratos'
      using errcode = '42501';
  end if;
  select * into target from public.service_contracts
  where id = p_contract_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Contrato no encontrado' using errcode = 'P0002'; end if;
  select * into prior from public.service_contract_events
  where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.contract_id <> p_contract_id
       or prior.kind <> 'status_changed'
       or prior.payload->>'to' <> p_next_status
       or prior.payload->>'reason' <> clean_reason then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return p_next_status;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede cambiar contratos' using errcode = 'P0402';
  end if;
  if target.updated_at <> p_expected_updated_at then
    raise exception 'El contrato cambió en otra sesión; recarga la ficha'
      using errcode = 'P0409';
  end if;
  if not (
    (target.status = 'draft' and p_next_status in ('active', 'canceled'))
    or (target.status = 'active' and p_next_status in ('paused', 'expired', 'canceled'))
    or (target.status = 'paused' and p_next_status in ('active', 'expired', 'canceled'))
  ) then
    raise exception 'Transición de contrato no permitida' using errcode = 'P0409';
  end if;
  if p_next_status in ('paused', 'expired', 'canceled')
     and clean_reason = '' then
    raise exception 'Indica el motivo del cambio' using errcode = '22023';
  end if;
  if p_next_status = 'active' then
    if target.ends_on is not null
       and target.ends_on < (now() at time zone target.timezone)::date then
      raise exception 'El contrato está vencido' using errcode = 'P0409';
    end if;
    if not exists (
      select 1 from public.service_contract_visit_rules r
      where r.contract_id = target.id and r.tenant_id = p_tenant_id
    ) then
      raise exception 'Añade una frecuencia antes de activar el contrato'
        using errcode = 'P0409';
    end if;
  end if;
  update public.service_contracts
  set status = p_next_status,
      schedule_version = case when target.status = 'paused'
        and p_next_status = 'active' then schedule_version + 1
        else schedule_version end
  where id = target.id;
  if target.status = 'active'
     and p_next_status in ('paused', 'expired', 'canceled') then
    for changed_visit in
      update public.service_visits
      set status = 'canceled'
      where tenant_id = p_tenant_id and contract_id = p_contract_id
        and status = 'scheduled' and scheduled_start_at >= now()
      returning id, contract_occurrence_on
    loop
      insert into public.service_visit_events (
        operation_id, tenant_id, visit_id, kind, payload, actor_id
      ) values (
        gen_random_uuid(), p_tenant_id, changed_visit.id, 'status_changed',
        pg_catalog.jsonb_build_object(
          'from', 'scheduled', 'to', 'canceled',
          'reason', 'Contrato ' || p_next_status || ': ' || clean_reason,
          'contractId', p_contract_id
        ),
        (select auth.uid())
      );
    end loop;
  end if;
  insert into public.service_contract_events (
    operation_id, tenant_id, contract_id, kind, payload, actor_id
  ) values (
    p_operation_id, p_tenant_id, p_contract_id, 'status_changed',
    pg_catalog.jsonb_build_object(
      'from', target.status, 'to', p_next_status, 'reason', clean_reason
    ),
    (select auth.uid())
  );
  return p_next_status;
end;
$$;
revoke all on function public.transition_service_contract(
  uuid, uuid, timestamptz, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.transition_service_contract(
  uuid, uuid, timestamptz, text, text, uuid
) to authenticated;

create function public.run_contract_visit_generation() returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  company record;
  total integer := 0;
begin
  for company in
    select distinct c.tenant_id from public.service_contracts c
    where c.status = 'active'
  loop
    total := total + app_private.generate_contract_visits(
      company.tenant_id, null, null
    );
  end loop;
  return total;
end;
$$;
revoke all on function public.run_contract_visit_generation()
  from public, anon, authenticated, service_role;
select cron.schedule(
  'contract-visits', '0 6 * * *',
  'select public.run_contract_visit_generation()'
);
