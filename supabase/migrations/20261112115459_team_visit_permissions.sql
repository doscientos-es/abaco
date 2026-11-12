-- Resolve visit access as the current user, bypassing team-membership RLS only
-- inside this tenant-scoped predicate. Individual assignments take precedence.
create function public.can_access_assigned_visit(p_tenant_id uuid, p_visit_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select public.has_role(v.tenant_id,
      array['technician', 'user']::public.app_role[])
    and (v.assigned_user_id = (select auth.uid()) or
      (v.assigned_user_id is null and exists (
        select 1 from public.work_team_members m
        where m.tenant_id = v.tenant_id and m.team_id = v.work_team_id
          and m.user_id = (select auth.uid())
      )))
    from public.service_visits v
    where v.tenant_id = p_tenant_id and v.id = p_visit_id), false);
$$;
revoke all on function public.can_access_assigned_visit(uuid, uuid) from public, anon;
grant execute on function public.can_access_assigned_visit(uuid, uuid) to authenticated;

alter policy service_visits_select on public.service_visits using (
  public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
  or public.can_access_assigned_visit(tenant_id, id)
);

-- All evidence uses the same visit predicate as the visit itself.
do $policies$
declare item record;
begin
  for item in select * from (values
    ('service_visit_reports', 'service_visit_reports_select'),
    ('service_visit_report_writes', 'service_visit_report_writes_select'),
    ('service_visit_report_versions', 'service_visit_report_versions_select'),
    ('service_visit_field_entries', 'service_visit_field_entries_select'),
    ('service_visit_photos', 'service_visit_photos_select')
  ) as p(table_name, policy_name) loop
    execute format('alter policy %I on public.%I using (public.has_role(tenant_id, array[''owner'',''admin'',''editor'']::public.app_role[]) or public.can_access_assigned_visit(tenant_id, visit_id))',
      item.policy_name, item.table_name);
  end loop;
end;
$policies$;
alter policy service_visit_measurements_select on public.service_visit_measurements using (
  public.has_role(tenant_id, array['owner', 'admin', 'editor', 'viewer']::public.app_role[])
  or public.can_access_assigned_visit(tenant_id, visit_id)
);
alter policy service_incidents_select on public.service_incidents using (
  public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
  or (public.has_role(tenant_id, array['technician', 'user']::public.app_role[])
    and (assigned_user_id = (select auth.uid())
      or public.can_access_assigned_visit(tenant_id, source_visit_id)))
);

alter policy visit_photos_objects_select on storage.objects using (
  bucket_id = 'visit-photos' and exists (
    select 1 from public.service_visits v
    where v.tenant_id::text = split_part(name, '/', 1)
      and v.id::text = split_part(name, '/', 2)
      and (public.has_role(v.tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
        or public.can_access_assigned_visit(v.tenant_id, v.id))
  )
);
alter policy visit_photos_objects_insert on storage.objects with check (
  bucket_id = 'visit-photos'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$'
  and exists (select 1 from public.service_visits v
    where v.tenant_id::text = split_part(name, '/', 1)
      and v.id::text = split_part(name, '/', 2)
      and v.status in ('scheduled', 'in_progress') and public.tenant_can_write(v.tenant_id)
      and (public.has_role(v.tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
        or public.can_access_assigned_visit(v.tenant_id, v.id)))
);

-- Preserve the existing validation, idempotency and grants of each command.
-- Fail the whole migration if an upstream definition no longer matches.
do $commands$
declare item record; definition text; updated text;
begin
  for item in select p.oid, p.proname from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'record_service_visit_field_entry', 'record_service_visit_measurement',
      'register_service_visit_photo', 'save_service_visit_report',
      'visit_measurement_parameters', 'transition_service_visit'
    ) loop
    definition := pg_catalog.pg_get_functiondef(item.oid);
    updated := replace(definition, 'target.assigned_user_id = (select auth.uid())',
      'public.can_access_assigned_visit(p_tenant_id, p_visit_id)');
    if updated = definition then raise exception 'Unexpected definition: %', item.proname; end if;
    execute updated;
  end loop;
  select pg_catalog.pg_get_functiondef(p.oid) into strict definition
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_service_incident';
  updated := regexp_replace(definition,
    'source_visit[.]assigned_user_id[[:space:]]+is distinct from [(]select auth[.]uid[(][)][)]',
    'not public.can_access_assigned_visit(p_tenant_id, p_source_visit_id)');
  if updated = definition then raise exception 'Unexpected create_service_incident definition'; end if;
  execute updated;
  select pg_catalog.pg_get_functiondef(p.oid) into strict definition
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'update_service_incident';
  updated := replace(definition, 'v.assigned_user_id = (select auth.uid())',
    'public.can_access_assigned_visit(p_tenant_id, v.id)');
  if updated = definition then raise exception 'Unexpected update_service_incident definition'; end if;
  execute updated;
end;
$commands$;

-- Record the team composition at closure without rewriting earlier reports.
create or replace function public.close_service_visit_report() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.service_visit_report_versions (tenant_id, visit_id, snapshot, closed_by, closed_at)
  values (new.tenant_id, new.id,
    public.build_closed_visit_report_snapshot(new.id) || pg_catalog.jsonb_build_object(
      'assignment', pg_catalog.jsonb_build_object('team_id', new.work_team_id,
        'assigned_user_id', new.assigned_user_id, 'member_ids', coalesce((
          select pg_catalog.jsonb_agg(m.user_id order by m.user_id)
          from public.work_team_members m where m.tenant_id = new.tenant_id
            and m.team_id = new.work_team_id
        ), '[]'::jsonb))), (select auth.uid()),
    coalesce(new.actual_end_at, pg_catalog.clock_timestamp()));
  return new;
end;
$$;