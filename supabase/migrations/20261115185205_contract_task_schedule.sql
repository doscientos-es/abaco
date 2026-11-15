-- Store task-level schedules independently of the legacy job schedule.
alter table public.contract_task_assignments add column schedule jsonb
  check (schedule is null or jsonb_typeof(schedule) = 'object');

do $migration$
declare definition text; updated text;
begin
  select pg_get_functiondef('public.load_contract_assignment_setup(uuid,uuid)'::regprocedure) into definition;
  updated := replace(definition,
    '''assigned_user_ids'',assigned_user_ids,''work_team_id'',work_team_id) order by task_key',
    '''assigned_user_ids'',assigned_user_ids,''work_team_id'',work_team_id,''schedule'',schedule) order by task_key');
  if updated = definition then raise exception 'Unexpected assignment setup definition'; end if;
  execute updated;
end;
$migration$;

-- Retain the original permission, document and idempotency checks.
alter function public.record_contract_signature(uuid,uuid,timestamptz,uuid,text,text,jsonb) set schema app_private;
revoke all on function app_private.record_contract_signature(uuid,uuid,timestamptz,uuid,text,text,jsonb)
  from public,anon,authenticated,service_role;
create function public.record_contract_signature(p_tenant_id uuid,p_contract_id uuid,p_expected_updated_at timestamptz,
  p_operation_id uuid,p_document_path text default null,p_document_name text default null,p_assignments jsonb default null)
returns void language plpgsql security definer set search_path='' as $$
declare item jsonb; task_schedule jsonb; day jsonb; starts date; ends date; is_retry boolean;
begin
  if auth.uid() is null or not public.has_role(p_tenant_id,array['owner','admin']::public.app_role[])
    or not public.tenant_can_write(p_tenant_id) then
    raise exception 'Solo un administrador de la empresa puede registrar la firma.' using errcode='42501'; end if;
  if p_operation_id is not null then perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0)); end if;
  select exists(select 1 from public.service_contract_events where operation_id=p_operation_id) into is_retry;
  perform app_private.record_contract_signature(p_tenant_id,p_contract_id,p_expected_updated_at,p_operation_id,
    p_document_path,p_document_name,p_assignments);
  if is_retry or p_assignments is null then return; end if;
  select starts_on,ends_on into starts,ends from public.service_contracts where id=p_contract_id and tenant_id=p_tenant_id;
  for item in select value from jsonb_array_elements(p_assignments) loop
    task_schedule:=item->'schedule';
    if task_schedule is null or task_schedule='null'::jsonb then continue; end if;
    if item->>'task_key' like 'job:%' or jsonb_typeof(task_schedule) is distinct from 'object'
      or coalesce(task_schedule->>'frequency','') not in ('once','weekly','fortnightly','days15','monthly','semiannual','annual')
      or coalesce(task_schedule->>'anchor_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or coalesce(task_schedule->>'start_minute','') !~ '^[0-9]{1,4}$'
      or coalesce(task_schedule->>'duration_minutes','') !~ '^[0-9]{1,3}$'
      or jsonb_typeof(task_schedule->'weekdays') is distinct from 'array' then
      raise exception 'Programación de tarea inválida' using errcode='22023'; end if;
    if (task_schedule->>'anchor_on')::date < starts or (ends is not null and (task_schedule->>'anchor_on')::date > ends)
      or (task_schedule->>'start_minute')::integer not between 0 and 1439
      or (task_schedule->>'duration_minutes')::integer not between 15 and 720
      or jsonb_array_length(task_schedule->'weekdays') > 7
      or (task_schedule->>'frequency' in ('weekly','fortnightly') and jsonb_array_length(task_schedule->'weekdays')=0)
      then raise exception 'Programación de tarea fuera de la vigencia o con horario inválido' using errcode='22023'; end if;
    for day in select value from jsonb_array_elements(task_schedule->'weekdays') loop
      if jsonb_typeof(day) is distinct from 'number' or day::text !~ '^[1-7]$' then
        raise exception 'Día de tarea inválido' using errcode='22023'; end if;
    end loop;
    if (select count(distinct value) from jsonb_array_elements(task_schedule->'weekdays')) <> jsonb_array_length(task_schedule->'weekdays') then
      raise exception 'Días de tarea duplicados' using errcode='22023'; end if;
    update public.contract_task_assignments set schedule=task_schedule
      where tenant_id=p_tenant_id and contract_id=p_contract_id and task_key=item->>'task_key';
  end loop;
end;
$$;
revoke all on function public.record_contract_signature(uuid,uuid,timestamptz,uuid,text,text,jsonb) from public,anon;
grant execute on function public.record_contract_signature(uuid,uuid,timestamptz,uuid,text,text,jsonb) to authenticated;