-- A monthly preference is stored in weekdays; an empty array keeps the legacy day-of-month rule.
create or replace function app_private.cleaning_service_due(p_date date,p_anchor date,p_frequency text,p_days smallint[])
returns boolean language sql immutable set search_path='' as $$
  select p_date>=p_anchor and case p_frequency
    when 'once' then p_date=p_anchor
    when 'weekly' then extract(isodow from p_date)::smallint=any(p_days)
    when 'fortnightly' then extract(isodow from p_date)::smallint=any(p_days)
      and mod((date_trunc('week',p_date::timestamp)::date-date_trunc('week',p_anchor::timestamp)::date)/7,2)=0
    when 'days15' then mod(p_date-p_anchor,15)=0
    when 'monthly' then case when cardinality(p_days)=1 then
      extract(isodow from p_date)::smallint=p_days[1] and extract(day from p_date)<=7
      else extract(day from p_date)=least(extract(day from p_anchor),
        extract(day from(date_trunc('month',p_date)+interval '1 month - 1 day'))) end
    else false end
$$;

create or replace function public.save_contract_job(p_tenant_id uuid,p_contract_id uuid,p_job_id uuid,
  p_expected_updated_at timestamptz,p_service jsonb,p_operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare slots jsonb:=coalesce(p_service->'weekly_slots','[]'); result uuid; c public.service_contracts%rowtype;
  days smallint[]; people uuid[]; preferred smallint[]:='{}';
begin
  if auth.uid() is null or not public.has_role(p_tenant_id,array['owner','admin','editor']::public.app_role[])
    or not public.tenant_can_write(p_tenant_id) then raise exception 'No tienes permiso' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text,31));
  select * into c from public.service_contracts where id=p_contract_id and tenant_id=p_tenant_id for update;
  if not found then raise exception 'Contrato no encontrado' using errcode='P0002'; end if;
  if exists(select 1 from public.service_contract_events where operation_id=p_operation_id) then
    return app_private.save_contract_job(p_tenant_id,p_contract_id,p_job_id,p_expected_updated_at,p_service,p_operation_id);
  end if;
  if p_service ? 'assigned_user_ids' then
    if jsonb_typeof(p_service->'assigned_user_ids') is distinct from 'array'
      or jsonb_array_length(p_service->'assigned_user_ids') > 30 then
      raise exception 'Personas no válidas' using errcode='22023'; end if;
    select coalesce(array_agg(distinct u::uuid order by u::uuid),'{}') into people
      from jsonb_array_elements_text(p_service->'assigned_user_ids') u;
  else
    people:=case when nullif(p_service->>'assigned_user_id','') is null then '{}'::uuid[]
      else array[(p_service->>'assigned_user_id')::uuid] end;
  end if;
  if array_position(people,null) is not null
    or (nullif(p_service->>'assigned_user_id','')::uuid is distinct from people[1])
    or (nullif(p_service->>'work_team_id','') is not null and cardinality(people)>0) then
    raise exception 'Asigna personas o un equipo, no ambos' using errcode='22023'; end if;
  perform 1 from public.memberships where tenant_id=p_tenant_id and user_id=any(people) order by user_id for share;
  if exists(select 1 from unnest(people) u where not exists(select 1 from public.memberships
    where tenant_id=p_tenant_id and user_id=u and role in ('user','technician'))) then
    raise exception 'Persona no disponible en esta empresa' using errcode='22023'; end if;
  if p_service->>'frequency'<>'once' and (c.ends_on is null or c.ends_on>c.starts_on+3660)
    then raise exception 'Guarda primero inicio y fin del contrato' using errcode='22023'; end if;
  if p_service->>'frequency'<>'once' and p_service->>'modality'='mobile'
    and nullif(p_service->>'work_team_id','') is null and cardinality(people)=0
    then raise exception 'Selecciona personas o un equipo para realizar los trabajos' using errcode='22023'; end if;
  if p_service->>'frequency' in ('monthly','days15') and nullif(p_service->>'local_start','') is null
    then raise exception 'Marca la franja horaria de referencia' using errcode='22023'; end if;
  if p_service->>'frequency' in ('weekly','fortnightly') then
    perform app_private.validate_weekly_slots(slots);
    select array_agg(distinct (value->>'weekday')::smallint order by (value->>'weekday')::smallint) into days from jsonb_array_elements(slots);
    if to_jsonb(days) is distinct from p_service->'weekdays' then raise exception 'Los días no coinciden con el calendario' using errcode='22023'; end if;
  elsif slots<>'[]'::jsonb then raise exception 'Esta frecuencia no admite una semana tipo' using errcode='22023'; end if;
  if p_service->>'frequency'='monthly' then
    if jsonb_typeof(coalesce(p_service->'weekdays','[]'::jsonb)) is distinct from 'array' then
      raise exception 'Día favorito no válido' using errcode='22023'; end if;
    select coalesce(array_agg(d::smallint),'{}') into preferred
      from jsonb_array_elements_text(coalesce(p_service->'weekdays','[]'::jsonb)) d;
    if cardinality(preferred)>1 or array_position(preferred,null) is not null
      or not(preferred <@ array[1,2,3,4,5,6,7]::smallint[]) then
      raise exception 'Día favorito no válido' using errcode='22023'; end if;
  end if;
  result:=app_private.save_contract_job(p_tenant_id,p_contract_id,p_job_id,p_expected_updated_at,p_service,p_operation_id);
  update public.service_contract_visit_rules set weekly_slots=slots,assigned_user_ids=people,
    weekdays=case when p_service->>'frequency'='monthly' then preferred else weekdays end
    where id=result and tenant_id=p_tenant_id;
  if c.status='active' and c.ends_on is not null then
    perform app_private.generate_scheduled_contract_visits(p_tenant_id,greatest(c.starts_on,(now() at time zone c.timezone)::date),c.ends_on,c.id);
  end if;
  return result;
end;
$$;