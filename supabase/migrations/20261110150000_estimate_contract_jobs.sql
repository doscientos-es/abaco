-- New proposals have a single route: acceptance -> draft contract -> configured jobs.
-- Existing publications and conversions are deliberately left untouched.
alter table public.estimates add column automatic_contract boolean not null default false;
alter table public.estimates alter column automatic_contract set default true;
alter table public.estimates alter column conversion_destination set default 'contract';
alter table public.estimates drop constraint estimates_contract_billing_frequency_check;
alter table public.estimates add check (contract_billing_frequency in ('once','monthly','quarterly','yearly'));
alter table public.estimates add check (not automatic_contract or conversion_destination = 'contract');
alter table public.service_contracts alter column location_id drop not null;
alter table public.service_contracts alter column created_by drop not null;
alter table public.service_contracts drop constraint service_contracts_billing_frequency_check;
alter table public.service_contracts add check (billing_frequency in ('once','monthly','quarterly','yearly'));
alter table public.service_contracts drop constraint service_contracts_renewal_mode_check;
alter table public.service_contracts add check (renewal_mode in ('pending','manual','automatic'));
alter table public.service_contracts add column notes text not null default '' check (char_length(notes) <= 5000);
alter table public.service_contract_events alter column actor_id drop not null;
alter table public.service_contract_events drop constraint service_contract_events_kind_check;
alter table public.service_contract_events add check (kind in ('created','rule_added','status_changed','details_updated','service_updated'));
alter table public.service_contract_visit_rules drop constraint service_contract_visit_rules_frequency_check;
alter table public.service_contract_visit_rules add check (frequency in ('once','weekly','fortnightly','days15','monthly'));
alter table public.service_contract_visit_rules
  add column configured boolean not null default true,
  add column source_line_id uuid,
  add column materials text not null default '' check (char_length(materials) <= 2000),
  add check (not configured or frequency is distinct from 'once' or modality = 'mobile');

alter function public.estimate_publication_snapshot(uuid) rename to estimate_publication_snapshot_before_jobs;
create function public.estimate_publication_snapshot(p_estimate_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_set(public.estimate_publication_snapshot_before_jobs(e.id),
    '{estimate,automatic_contract}', to_jsonb(e.automatic_contract), true)
  from public.estimates e where e.id = p_estimate_id
$$;
revoke all on function public.estimate_publication_snapshot(uuid) from public,anon,authenticated;

-- Deferred until commit: manual acceptance writes its evidence AFTER changing status.
-- Running in the database also covers acceptance via the anonymous customer link.
create function app_private.create_contract_after_acceptance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  e public.estimates%rowtype; p public.estimate_publications%rowtype;
  m public.estimate_manual_acceptances%rowtype; line jsonb;
  net numeric; discount numeric; contract_id uuid; scope jsonb; accepted_copy jsonb;
  mode text; starts date;
begin
  select * into e from public.estimates where id = new.id;
  select * into p from public.estimate_publications where estimate_id = e.id and tenant_id = e.tenant_id;
  if e.status <> 'accepted' or not coalesce((p.snapshot #>> '{estimate,automatic_contract}')::boolean,false)
    then return null; end if;
  if exists(select 1 from public.estimate_conversion_destinations where tenant_id = e.tenant_id and estimate_id = e.id)
    then return null; end if;
  if not public.tenant_can_write(e.tenant_id) then raise exception 'Empresa no disponible' using errcode = 'P0402'; end if;
  select coalesce(sum(round((l->>'quantity')::numeric * (l->>'unit_price_cents')::numeric)
    - round(round((l->>'quantity')::numeric * (l->>'unit_price_cents')::numeric) * (l->>'discount_percent')::numeric / 100)),0)
    into net from jsonb_array_elements(p.snapshot #> '{estimate,estimate_lines}') l;
  discount := case p.snapshot #>> '{estimate,discount_type}'
    when 'percent' then round(net * (p.snapshot #>> '{estimate,discount_value}')::numeric / 100)
    when 'amount' then least(net,round((p.snapshot #>> '{estimate,discount_value}')::numeric)) else 0 end;
  select coalesce(jsonb_agg(jsonb_build_object('description',l->>'description','quantity',l->'quantity',
    'unit',l->>'unit','kind',l->>'kind')),'[]') into scope
    from jsonb_array_elements(p.snapshot #> '{estimate,estimate_lines}') l;
  select * into m from public.estimate_manual_acceptances where estimate_id = e.id and tenant_id = e.tenant_id;
  mode := case when found then 'office_manual' when e.responded_at is not null then 'public_link' else 'legacy_unverified' end;
  accepted_copy := p.snapshot || jsonb_build_object('publication_source',p.source,'acceptance',jsonb_build_object(
    'mode',mode,'responded_at',e.responded_at,'responded_by',e.responded_by,
    'evidence_description',m.evidence_description,'recorded_by',m.recorded_by));
  starts := (coalesce(e.responded_at,now()) at time zone 'Europe/Madrid')::date;
  insert into public.service_contracts(operation_id,tenant_id,client_id,origin_estimate_id,title,starts_on,
    timezone,price_cents,billing_frequency,renewal_mode,included_scope,source_snapshot,created_by)
    values(gen_random_uuid(),e.tenant_id,e.client_id,e.id,p.snapshot #>> '{estimate,title}',starts,
      'Europe/Madrid',(net-discount)::bigint,p.snapshot #>> '{estimate,contract_billing_frequency}',
      'pending',scope,accepted_copy,m.recorded_by) returning id into contract_id;
  insert into public.service_contract_events(operation_id,tenant_id,contract_id,kind,payload,actor_id)
    values(gen_random_uuid(),e.tenant_id,contract_id,'created',jsonb_build_object(
      'estimate_id',e.id,'acceptance_mode',mode,'source','estimate_acceptance','needs_configuration',true),m.recorded_by);
  -- Technical placeholders are NEVER scheduled or shown as agreed operational data.
  -- The administrator must explicitly configure each quoted item before activation.
  for line in select * from jsonb_array_elements(p.snapshot #> '{estimate,estimate_lines}') loop
    insert into public.service_contract_visit_rules(tenant_id,contract_id,season,months,weekday,
      local_start,duration_minutes,title,tasks,configured,source_line_id)
      values(e.tenant_id,contract_id,'high',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[],1,
        '09:00',60,left(line->>'description',200),line->>'description',false,(line->>'id')::uuid);
  end loop;
  return null;
end;
$$;
revoke all on function app_private.create_contract_after_acceptance() from public,anon,authenticated;
create constraint trigger estimates_create_contract
  after update of status on public.estimates deferrable initially deferred
  for each row when (old.status is distinct from new.status and new.status = 'accepted')
  execute function app_private.create_contract_after_acceptance();

create function public.update_draft_contract_details(p_tenant_id uuid,p_contract_id uuid,
  p_expected_updated_at timestamptz,p_starts_on date,p_ends_on date,p_renewal_mode text,
  p_notes text,p_operation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c public.service_contracts%rowtype; prior public.service_contract_events%rowtype; payload jsonb;
begin
  if auth.uid() is null or not public.has_role(p_tenant_id,array['owner','admin','editor']::public.app_role[])
    or not public.tenant_can_write(p_tenant_id) then raise exception 'No tienes permiso' using errcode = '42501'; end if;
  if p_operation_id is null or p_expected_updated_at is null or p_starts_on is null
    or (p_ends_on is not null and p_ends_on < p_starts_on) or p_renewal_mode is null
    or p_renewal_mode not in ('pending','manual','automatic') or p_notes is null or char_length(p_notes)>5000
    then raise exception 'Datos de contrato inválidos' using errcode = '22023'; end if;
  payload := jsonb_build_object('starts_on',p_starts_on,'ends_on',p_ends_on,'renewal_mode',p_renewal_mode,'notes',p_notes);
  select * into c from public.service_contracts where id=p_contract_id and tenant_id=p_tenant_id for update;
  if not found then raise exception 'Contrato no encontrado' using errcode = 'P0002'; end if;
  select * into prior from public.service_contract_events where operation_id=p_operation_id;
  if found then
    if prior.tenant_id<>p_tenant_id or prior.contract_id<>p_contract_id or prior.kind<>'details_updated'
      or prior.payload->'details' is distinct from payload then raise exception 'Operación utilizada' using errcode='23505'; end if;
    return c.id;
  end if;
  if c.status<>'draft' or c.updated_at<>p_expected_updated_at then raise exception 'Recarga el contrato; no es editable' using errcode='P0409'; end if;
  if exists(select 1 from public.service_contract_visit_rules where contract_id=c.id and configured
    and (anchor_on < p_starts_on or (p_ends_on is not null and coalesce(ends_on,anchor_on)>p_ends_on)))
    then raise exception 'La vigencia deja trabajos fuera del contrato' using errcode='22023'; end if;
  update public.service_contracts set starts_on=p_starts_on,ends_on=p_ends_on,renewal_mode=p_renewal_mode,notes=p_notes where id=c.id;
  insert into public.service_contract_events(operation_id,tenant_id,contract_id,kind,payload,actor_id)
    values(p_operation_id,p_tenant_id,c.id,'details_updated',jsonb_build_object('details',payload,'before',
      jsonb_build_object('starts_on',c.starts_on,'ends_on',c.ends_on,'renewal_mode',c.renewal_mode,'notes',c.notes)),auth.uid());
  return c.id;
end;
$$;
revoke all on function public.update_draft_contract_details(uuid,uuid,timestamptz,date,date,text,text,uuid) from public,anon;
grant execute on function public.update_draft_contract_details(uuid,uuid,timestamptz,date,date,text,text,uuid) to authenticated;

create function public.save_contract_job(p_tenant_id uuid,p_contract_id uuid,p_job_id uuid,
  p_expected_updated_at timestamptz,p_service jsonb,p_operation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c public.service_contracts%rowtype; r public.service_contract_visit_rules%rowtype;
  prior public.service_contract_events%rowtype; job_id uuid := coalesce(p_job_id,p_operation_id);
  location uuid := nullif(p_service->>'location_id','')::uuid;
  person uuid := nullif(p_service->>'assigned_user_id','')::uuid;
  team uuid := nullif(p_service->>'work_team_id','')::uuid;
  anchor date := nullif(p_service->>'anchor_on','')::date;
  ending date := nullif(p_service->>'ends_on','')::date;
  days smallint[]; freq text := p_service->>'frequency'; mode text := p_service->>'modality';
begin
  if auth.uid() is null or not public.has_role(p_tenant_id,array['owner','admin','editor']::public.app_role[])
    or not public.tenant_can_write(p_tenant_id) then raise exception 'No tienes permiso' using errcode='42501'; end if;
  select * into c from public.service_contracts where id=p_contract_id and tenant_id=p_tenant_id for update;
  if not found then raise exception 'Contrato no encontrado' using errcode='P0002'; end if;
  select * into prior from public.service_contract_events where operation_id=p_operation_id;
  if found then
    if prior.tenant_id<>p_tenant_id or prior.contract_id<>p_contract_id or prior.kind not in ('rule_added','service_updated')
      or prior.payload->'service' is distinct from p_service
      or prior.payload->>'serviceId' is distinct from job_id::text then raise exception 'Operación utilizada' using errcode='23505'; end if;
    return job_id;
  end if;
  if p_operation_id is null or p_expected_updated_at is null or c.updated_at<>p_expected_updated_at
    or c.status not in ('draft','active') then raise exception 'Recarga el contrato; no es editable' using errcode='P0409'; end if;
  if p_job_id is not null then
    select * into r from public.service_contract_visit_rules where id=p_job_id and contract_id=c.id and tenant_id=p_tenant_id;
    if not found then raise exception 'Trabajo no encontrado' using errcode='P0002'; end if;
    if (c.status<>'draft' and r.configured) or exists(select 1 from public.service_visits where contract_rule_id=r.id)
      then raise exception 'No se modifica una pauta con órdenes generadas' using errcode='P0409'; end if;
  end if;
  if freq is null or freq not in ('once','weekly','fortnightly','days15','monthly') or mode is null
    or mode not in ('fixed','mobile') or (freq='once' and mode<>'mobile')
    or nullif(trim(p_service->>'title'),'') is null or nullif(trim(p_service->>'tasks'),'') is null
    or coalesce((p_service->>'duration_minutes')::integer,0) not between 15 and 720
    then raise exception 'Completa el trabajo, su duración y modalidad' using errcode='22023'; end if;
  if not exists(select 1 from public.service_locations where id=location and tenant_id=p_tenant_id
    and client_id=c.client_id and active and kind<>'billing') then raise exception 'Centro no disponible' using errcode='22023'; end if;
  if anchor is null or anchor<c.starts_on or (c.ends_on is not null and anchor>c.ends_on)
    or (ending is not null and (ending<anchor or (c.ends_on is not null and ending>c.ends_on)))
    then raise exception 'Vigencia fuera del contrato' using errcode='22023'; end if;
  if person is not null and team is not null then raise exception 'Elige una persona o un equipo' using errcode='22023'; end if;
  if person is not null and not exists(select 1 from public.memberships where tenant_id=p_tenant_id and user_id=person and role in ('user','technician'))
    then raise exception 'Persona no disponible' using errcode='22023'; end if;
  if team is not null and not exists(select 1 from public.work_teams where tenant_id=p_tenant_id and id=team and archived_at is null)
    then raise exception 'Equipo no disponible' using errcode='22023'; end if;
  select coalesce(array_agg(distinct d::smallint order by d::smallint),'{}') into days
    from jsonb_array_elements_text(coalesce(p_service->'weekdays','[]')) d;
  if not(days <@ array[1,2,3,4,5,6,7]::smallint[]) or (freq in ('weekly','fortnightly') and cardinality(days)=0)
    then raise exception 'Selecciona los días de servicio' using errcode='22023'; end if;
  if freq not in ('weekly','fortnightly') then days := '{}'; end if;
  insert into public.service_contract_visit_rules(id,tenant_id,contract_id,season,months,weekday,every_n_weeks,
    local_start,duration_minutes,title,location_id,modality,service_type,frequency,anchor_on,ends_on,weekdays,
    tasks,weekly_tasks,instructions,requires_acceptance,time_known,assigned_user_id,work_team_id,materials,configured)
    values(job_id,p_tenant_id,c.id,'high',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[],coalesce(days[1],1),1,
      coalesce(nullif(p_service->>'local_start','')::time,'09:00'),(p_service->>'duration_minutes')::smallint,
      trim(p_service->>'title'),location,mode,p_service->>'service_type',freq,anchor,ending,days,p_service->>'tasks',
      case when freq in ('weekly','fortnightly') then coalesce(p_service->'weekly_tasks','{}') else '{}' end,
      coalesce(p_service->>'instructions',''),coalesce((p_service->>'requires_acceptance')::boolean,false),
      coalesce(p_service->>'local_start','')<>'',person,team,coalesce(p_service->>'materials',''),true)
    on conflict(id) do update set local_start=excluded.local_start,duration_minutes=excluded.duration_minutes,
      title=excluded.title,location_id=excluded.location_id,modality=excluded.modality,service_type=excluded.service_type,
      frequency=excluded.frequency,anchor_on=excluded.anchor_on,ends_on=excluded.ends_on,weekdays=excluded.weekdays,
      tasks=excluded.tasks,weekly_tasks=excluded.weekly_tasks,instructions=excluded.instructions,
      requires_acceptance=excluded.requires_acceptance,time_known=excluded.time_known,
      assigned_user_id=excluded.assigned_user_id,work_team_id=excluded.work_team_id,materials=excluded.materials,configured=true
    where public.service_contract_visit_rules.tenant_id=p_tenant_id and public.service_contract_visit_rules.contract_id=c.id;
  if not found then raise exception 'Identificador de trabajo utilizado' using errcode='23505'; end if;
  update public.service_contracts set title=title where id=c.id;
  insert into public.service_contract_events(operation_id,tenant_id,contract_id,kind,payload,actor_id)
    values(p_operation_id,p_tenant_id,c.id,case when p_job_id is null then 'rule_added' else 'service_updated' end,
      jsonb_build_object('serviceId',job_id,'service',p_service,'before',case when p_job_id is null then null else to_jsonb(r) end),auth.uid());
  return job_id;
end;
$$;
revoke all on function public.save_contract_job(uuid,uuid,uuid,timestamptz,jsonb,uuid) from public,anon;
grant execute on function public.save_contract_job(uuid,uuid,uuid,timestamptz,jsonb,uuid) to authenticated;

create function app_private.require_configured_contract_jobs() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='active' and old.status is distinct from new.status and exists(
    select 1 from public.service_contract_visit_rules where contract_id=new.id and not configured)
    then raise exception 'Configura todos los trabajos antes de activar el contrato' using errcode='P0409'; end if;
  return new;
end;
$$;
revoke all on function app_private.require_configured_contract_jobs() from public,anon,authenticated;
create trigger service_contracts_require_jobs before update of status on public.service_contracts
  for each row execute function app_private.require_configured_contract_jobs();

create or replace function app_private.cleaning_service_due(p_date date,p_anchor date,p_frequency text,p_days smallint[])
returns boolean language sql immutable set search_path='' as $$
  select p_date>=p_anchor and case p_frequency
    when 'once' then p_date=p_anchor
    when 'weekly' then extract(isodow from p_date)::smallint=any(p_days)
    when 'fortnightly' then extract(isodow from p_date)::smallint=any(p_days)
      and mod((date_trunc('week',p_date::timestamp)::date-date_trunc('week',p_anchor::timestamp)::date)/7,2)=0
    when 'days15' then mod(p_date-p_anchor,15)=0
    when 'monthly' then extract(day from p_date)=least(extract(day from p_anchor),
      extract(day from(date_trunc('month',p_date)+interval '1 month - 1 day')))
    else false end
$$;

-- Reuse the generator, including its locks, DST handling, conflict checks and identity.
-- Unconfigured jobs can never reach it (activation is guarded above).
-- Materials become part of the immutable per-visit paper snapshot.
create or replace function app_private.capture_paper_visit() returns trigger
language plpgsql security definer set search_path='' as $$
declare r public.service_contract_visit_rules%rowtype;
begin
  if tg_op='UPDATE' then
    if new.paper_snapshot is distinct from old.paper_snapshot then raise exception 'El parte original es inmutable'; end if;
    return new;
  end if;
  select * into r from public.service_contract_visit_rules where id=new.contract_rule_id and tenant_id=new.tenant_id;
  if found and not r.configured then raise exception 'Trabajo pendiente de configurar' using errcode='P0409'; end if;
  select jsonb_build_object('client',c.name,'center',coalesce(l.name,''),'address',coalesce(l.address,''),
    'tasks',concat_ws(E'\n',nullif(r.tasks,''),nullif(r.weekly_tasks->>extract(isodow from new.contract_occurrence_on)::integer::text,'')),
    'instructions',concat_ws(E'\n',nullif(l.operational_contact,''),nullif(l.access_notes,''),nullif(l.notes,''),
      nullif(l.opening_hours,''),nullif(r.materials,''),nullif(r.instructions,''),nullif(new.notes,'')),
    'requiresAcceptance',coalesce(r.requires_acceptance,true),'timeKnown',coalesce(r.time_known,true))
    into new.paper_snapshot from public.clients c left join public.service_locations l
      on l.id=new.location_id and l.tenant_id=c.tenant_id where c.id=new.client_id and c.tenant_id=new.tenant_id;
  return new;
end;
$$;

-- One-off commercial terms have exactly ONE obligation, never an annual fallback.
alter function app_private.generate_contract_billing_periods(uuid,uuid,date) rename to generate_recurring_contract_billing_periods;
create function app_private.generate_contract_billing_periods(p_tenant_id uuid,p_contract_id uuid,p_through_on date)
returns integer language plpgsql security definer set search_path='' as $$
declare c public.service_contracts%rowtype; vat numeric; inserted uuid;
begin
  select * into c from public.service_contracts where id=p_contract_id and tenant_id=p_tenant_id for update;
  if not found then raise exception 'Contrato no encontrado' using errcode='P0002'; end if;
  if c.billing_frequency<>'once' then return app_private.generate_recurring_contract_billing_periods(p_tenant_id,p_contract_id,p_through_on); end if;
  if p_through_on is null or p_through_on>current_date+31 then raise exception 'Intervalo de facturación inválido' using errcode='22023'; end if;
  if c.status='draft' then raise exception 'Activa el contrato antes de generar periodos' using errcode='P0409'; end if;
  if c.price_cents<=0 then raise exception 'El contrato no tiene precio facturable' using errcode='P0410'; end if;
  if c.starts_on>p_through_on then return 0; end if;
  vat := (c.source_snapshot #>> '{estimate,vat_rate}')::numeric;
  if vat is null or vat not between 0 and 100 then raise exception 'IVA contractual no disponible' using errcode='P0410'; end if;
  insert into public.contract_billing_periods(tenant_id,contract_id,cycle_index,period_start_on,period_end_on,
    net_cents,vat_rate,pricing_status,review_reason)
    values(p_tenant_id,c.id,0,c.starts_on,coalesce(c.ends_on,c.starts_on),
      case when c.status='active' then c.price_cents end,vat,
      case when c.status='active' then 'priced' else 'requires_review' end,
      case when c.status<>'active' then 'Contrato interrumpido: revisar el importe único' end)
    on conflict(contract_id,cycle_index) do nothing returning id into inserted;
  return case when inserted is null then 0 else 1 end;
end;
$$;
revoke all on function app_private.generate_contract_billing_periods(uuid,uuid,date) from public,anon,authenticated,service_role;