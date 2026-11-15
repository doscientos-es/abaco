-- Qualify set-returning-function columns to avoid PL/pgSQL variable ambiguity.
do $migration$
declare definition text; updated text;
begin
  select pg_get_functiondef('app_private.automatic_daily_contract_slot(uuid,uuid,uuid,date,text)'::regprocedure) into definition;
  updated := replace(definition, 'unnest(people) person', 'unnest(people) as member(user_id)');
  updated := replace(updated, 'm.user_id = person and m.role', 'm.user_id = member.user_id and m.role');
  updated := replace(updated, 's.user_id = person', 's.user_id = member.user_id');
  if updated = definition then raise exception 'Unexpected automatic slot definition'; end if;
  execute updated;
end;
$migration$;