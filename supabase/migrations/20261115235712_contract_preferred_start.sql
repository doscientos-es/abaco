-- Keep legacy schedules and already generated visits intact; use one preference per contract.
alter table public.service_contracts add column preferred_start time not null default '09:00';

update public.service_contracts c set preferred_start = coalesce(
  (select make_time((a.schedule->>'start_minute')::integer / 60,
                    (a.schedule->>'start_minute')::integer % 60, 0)
   from public.contract_task_assignments a
   where a.contract_id=c.id and a.tenant_id=c.tenant_id
     and coalesce(a.schedule->>'start_minute','') ~ '^[0-9]{1,4}$'
     and (a.schedule->>'start_minute')::integer between 0 and 1439
   order by a.task_key limit 1),
  (select r.local_start from public.service_contract_visit_rules r
   where r.contract_id=c.id and r.tenant_id=c.tenant_id and r.time_known
   order by r.configured desc, r.created_at, r.id limit 1),
  '09:00'::time);

-- Wrap the existing command so its permissions, concurrency and idempotency checks remain in force.
create function public.update_contract_general_details(p_tenant_id uuid,p_contract_id uuid,
  p_expected_updated_at timestamptz,p_starts_on date,p_ends_on date,p_renewal_mode text,
  p_notes text,p_location_id uuid,p_assigned_user_ids uuid[],p_work_team_id uuid,p_operation_id uuid,
  p_preferred_start time) returns uuid language plpgsql security definer set search_path='' as $$
declare prior public.service_contract_events%rowtype; c public.service_contracts%rowtype; result uuid;
begin
  if auth.uid() is null or not public.has_role(p_tenant_id,array['owner','admin','editor']::public.app_role[])
    or not public.tenant_can_write(p_tenant_id) then raise exception 'No tienes permiso' using errcode='42501'; end if;
  if p_preferred_start is null or p_preferred_start >= '24:00'::time or extract(second from p_preferred_start) <> 0 then
    raise exception 'Indica una hora preferente válida' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text,31));
  select * into c from public.service_contracts where id=p_contract_id and tenant_id=p_tenant_id for update;
  select * into prior from public.service_contract_events where operation_id=p_operation_id;
  if found and prior.payload->>'preferred_start' is distinct from p_preferred_start::text then
    raise exception 'Operación utilizada' using errcode='23505'; end if;
  if prior.operation_id is null and c.status='active' and c.preferred_start is distinct from p_preferred_start then
    raise exception 'La hora preferente solo se puede editar en borrador' using errcode='P0409'; end if;
  result:=public.update_contract_general_details(p_tenant_id,p_contract_id,p_expected_updated_at,
    p_starts_on,p_ends_on,p_renewal_mode,p_notes,p_location_id,p_assigned_user_ids,p_work_team_id,p_operation_id);
  if prior.operation_id is null then
    update public.service_contracts set preferred_start=p_preferred_start where id=p_contract_id and tenant_id=p_tenant_id;
    update public.service_contract_events set payload=payload || jsonb_build_object('preferred_start',p_preferred_start::text)
      where operation_id=p_operation_id and tenant_id=p_tenant_id and contract_id=p_contract_id;
  end if;
  return result;
end;
$$;
revoke all on function public.update_contract_general_details(uuid,uuid,timestamptz,date,date,text,text,uuid,uuid[],uuid,uuid,time) from public,anon;
grant execute on function public.update_contract_general_details(uuid,uuid,timestamptz,date,date,text,text,uuid,uuid[],uuid,uuid,time) to authenticated;

-- Automatic daily work selects the available slot closest to the contract preference.
do $migration$
declare definition text; updated text;
begin
  select pg_get_functiondef('app_private.automatic_daily_contract_slot(uuid,uuid,uuid,date,text)'::regprocedure) into definition;
  updated:=replace(definition,
    'preferred := coalesce((task_schedule->>''start_minute'')::integer,
    case when job.time_known then (extract(hour from job.local_start)*60 + extract(minute from job.local_start))::integer else 0 end);',
    'select (extract(hour from preferred_start)*60 + extract(minute from preferred_start))::integer into preferred
    from public.service_contracts where id=p_contract_id and tenant_id=p_tenant_id;');
  if updated=definition then raise exception 'Unexpected automatic slot definition'; end if;
  execute updated;
end;
$migration$;

-- Preserve offsets between multiple legacy slots on the same day.
do $migration$
declare definition text; updated text;
begin
  select pg_get_functiondef('app_private.generate_scheduled_contract_visits(uuid,date,date,uuid)'::regprocedure) into definition;
  updated:=replace(definition,
    'start_minute:=coalesce((slot->>''start_minute'')::integer,(extract(hour from r.local_start)*60+extract(minute from r.local_start))::integer);',
    'start_minute:=case when slot_key like ''auto-daily-%'' then (slot->>''start_minute'')::integer
      else (extract(hour from c.preferred_start)*60+extract(minute from c.preferred_start))::integer
        + coalesce((slot->>''start_minute'')::integer - (select min((s->>''start_minute'')::integer)
          from jsonb_array_elements(r.weekly_slots) s where s->>''weekday''=slot->>''weekday''),0) end;');
  if updated=definition then raise exception 'Unexpected contract generator definition'; end if;
  execute updated;
end;
$migration$;