-- Lock the team before reading its membership, in the same order as team edits.
-- An upsert of an existing member must remain a no-op.
do $migration$
declare definition text; updated text;
begin
  select pg_catalog.pg_get_functiondef('app_private.guard_team_visit_assignment()'::regprocedure)
    into definition;
  updated := replace(definition, E'  if new.work_team_id is not null then\n    new.assigned_user_id := null;',
    E'  if new.work_team_id is not null then\n    perform 1 from public.work_teams t where t.id = new.work_team_id and t.tenant_id = new.tenant_id for key share;\n    new.assigned_user_id := null;');
  if updated = definition then raise exception 'Unexpected team assignment guard definition'; end if;
  execute updated;

  select pg_catalog.pg_get_functiondef('app_private.guard_team_member_visit_conflicts()'::regprocedure)
    into definition;
  updated := replace(definition, E'begin\n  perform pg_catalog.pg_advisory_xact_lock(',
    E'begin\n  if exists (select 1 from public.work_team_members m where m.team_id = new.team_id and m.tenant_id = new.tenant_id and m.user_id = new.user_id) then return new; end if;\n  perform pg_catalog.pg_advisory_xact_lock(');
  if updated = definition then raise exception 'Unexpected team member guard definition'; end if;
  execute updated;
end;
$migration$;