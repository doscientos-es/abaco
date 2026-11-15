-- Vacations and other absences share the absence_requests table.
do $migration$
declare definition text; updated text;
begin
  select pg_get_functiondef('app_private.automatic_daily_contract_slot(uuid,uuid,uuid,date,text)'::regprocedure) into definition;
  updated := replace(definition, '    or exists (select 1 from public.vacation_requests v where v.tenant_id = p_tenant_id
      and v.requester_id = any(people) and v.status = ''approved''
      and v.start_date <= p_day and coalesce(v.end_date, ''infinity''::date) >= p_day)
', '');
  if updated = definition then raise exception 'Unexpected automatic slot absence definition'; end if;
  execute updated;
end;
$migration$;