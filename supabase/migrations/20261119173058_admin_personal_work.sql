-- Allow administrators to be selected as participants without changing their permissions.
-- Modify only the existing participant checks and personal entry points; keep their
-- authorization, tenant checks, locking, signatures and privileges intact.
do $migration$
declare
  item record;
  definition text;
  updated text;
  changed integer := 0;
begin
  for item in
    select n.nspname, p.proname, p.oid
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join (values
      ('app_private','automatic_daily_contract_slot'),
      ('app_private','generate_scheduled_contract_visits'),
      ('app_private','record_contract_signature'),
      ('app_private','save_contract_job'),
      ('public','add_cleaning_service'),
      ('public','convert_accepted_estimate_to_contract'),
      ('public','create_manual_service_contract'),
      ('public','create_service_visit'),
      ('public','replan_service_visit'),
      ('public','save_contract_job'),
      ('public','update_contract_general_details'),
      ('public','list_vacation_coverage')
    ) target(schema_name, function_name)
      on n.nspname = target.schema_name and p.proname = target.function_name
    where p.prokind = 'f'
  loop
    definition := pg_catalog.pg_get_functiondef(item.oid);
    updated := replace(definition, 'role in (''user'',''technician'')', 'role in (''user'',''technician'',''admin'')');
    updated := replace(updated, 'role in (''user'', ''technician'')', 'role in (''user'', ''technician'', ''admin'')');
    updated := replace(updated, 'role IN (''technician'', ''user'', ''user'')', 'role IN (''technician'', ''user'', ''admin'')');
    if updated <> definition then
      execute updated;
      changed := changed + 1;
    end if;
  end loop;
  if changed <> 12 then
    raise exception 'Unexpected participant functions: expected 12, found %', changed;
  end if;

  changed := 0;
  for item in
    select p.oid from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname in ('my_assigned_visits', 'submit_absence_request', 'respond_absence_information')
  loop
    definition := pg_catalog.pg_get_functiondef(item.oid);
    updated := replace(definition, 'array[''technician'', ''user'']::public.app_role[]',
      'array[''technician'', ''user'', ''admin'']::public.app_role[]');
    if updated <> definition then
      execute updated;
      changed := changed + 1;
    end if;
  end loop;
  if changed <> 3 then
    raise exception 'Unexpected personal functions: expected 3, found %', changed;
  end if;
end
$migration$;
