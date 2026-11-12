-- Preserve the legacy setting column and RPC result shape for older clients.
-- Both old and new clients must request location; the stored setting is ignored.
do $migration$
declare
  definition text;
  updated text;
begin
  definition := pg_catalog.pg_get_functiondef(
    'public.transition_service_visit(uuid,uuid,timestamptz,text,text,uuid,double precision,double precision)'::regprocedure
  );
  updated := replace(definition,
    'select coalesce(t.collect_visit_start_location, false) into collect_location',
    'select true into collect_location');
  if updated = definition then
    raise exception 'Unexpected transition_service_visit definition';
  end if;
  execute updated;

  definition := pg_catalog.pg_get_functiondef('public.my_company_memberships()'::regprocedure);
  updated := replace(definition, 't.collect_visit_start_location', 'true');
  if updated = definition then
    raise exception 'Unexpected my_company_memberships definition';
  end if;
  execute updated;
end;
$migration$;