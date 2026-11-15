-- A manual contract may not have budget-task assignments. Its configured job
-- duration is the existing default; without a preferred time choose the earliest slot.
do $migration$
declare definition text; updated text;
begin
  select pg_get_functiondef('app_private.automatic_daily_contract_slot(uuid,uuid,uuid,date,text)'::regprocedure) into definition;
  updated := replace(definition,
    'if (select count(*) from public.contract_task_assignments
      where tenant_id = p_tenant_id and contract_id = p_contract_id and job_id = p_rule_id
        and task_key not like ''job:%'' and schedule is not null) <> 1 then return null; end if;',
    'if (select count(*) from public.contract_task_assignments
      where tenant_id = p_tenant_id and contract_id = p_contract_id and job_id = p_rule_id
        and task_key not like ''job:%'' and schedule is not null) > 1 then return null; end if;');
  updated := replace(updated,
    'preferred := (task_schedule->>''start_minute'')::integer;
  duration := (task_schedule->>''duration_minutes'')::integer;',
    'preferred := coalesce((task_schedule->>''start_minute'')::integer,
    case when job.time_known then (extract(hour from job.local_start)*60 + extract(minute from job.local_start))::integer else 0 end);
  duration := coalesce((task_schedule->>''duration_minutes'')::integer, job.duration_minutes);');
  if updated = definition or position('> 1 then return null' in updated)=0
    or position('job.time_known' in updated)=0 then raise exception 'Unexpected automatic slot definition'; end if;
  execute updated;
end;
$migration$;