begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.team_test_id(n integer) returns uuid language sql immutable as $$
  select ('63000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
create function pg_temp.team_version(n integer) returns timestamptz language sql as $$
  select updated_at from public.work_teams where id = pg_temp.team_test_id(n);
$$;
create function pg_temp.save_team(
  team integer, operation integer, people integer[] default array[11,12],
  name text default 'Equipo norte', archived boolean default false,
  expected timestamptz default null, tenant integer default 1
) returns timestamptz language sql as $$
  select public.save_work_team(pg_temp.team_test_id(tenant), pg_temp.team_test_id(team),
    expected, name, 'Operaciones', array(select pg_temp.team_test_id(n) from unnest(people) n),
    archived, pg_temp.team_test_id(operation));
$$;
create function pg_temp.plan_team(team integer, operation integer, expected timestamptz)
returns timestamptz language sql as $$
  select public.plan_work_order(pg_temp.team_test_id(1), current_setting('test.team_work')::uuid,
    expected, pg_temp.team_test_id(12), '2026-11-05 08:00Z', '2026-11-05 10:00Z',
    'Plan del equipo', pg_temp.team_test_id(operation), pg_temp.team_test_id(team));
$$;

insert into public.tenants(id, name) values
  (pg_temp.team_test_id(1), 'Empresa de servicios'), (pg_temp.team_test_id(2), 'Otra empresa');
insert into auth.users(id, email) values
  (pg_temp.team_test_id(11), 'team-owner@example.test'),
  (pg_temp.team_test_id(12), 'team-editor@example.test'),
  (pg_temp.team_test_id(13), 'team-viewer@example.test'),
  (pg_temp.team_test_id(14), 'team-technician@example.test'),
  (pg_temp.team_test_id(15), 'team-outsider@example.test');
insert into public.memberships(tenant_id, user_id, role) values
  (pg_temp.team_test_id(1), pg_temp.team_test_id(11), 'owner'),
  (pg_temp.team_test_id(1), pg_temp.team_test_id(12), 'editor'),
  (pg_temp.team_test_id(1), pg_temp.team_test_id(13), 'viewer'),
  (pg_temp.team_test_id(1), pg_temp.team_test_id(14), 'technician'),
  (pg_temp.team_test_id(2), pg_temp.team_test_id(15), 'owner');
insert into public.clients(id, tenant_id, name) values
  (pg_temp.team_test_id(21), pg_temp.team_test_id(1), 'Cliente de servicios');

set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.team_test_id(11)::text, true);
select lives_ok($$select pg_temp.save_team(31, 101)$$, 'Owner creates a reusable team');
select is((select count(*) from public.work_team_members), 2::bigint, 'Members are saved together');
select is((select name from public.work_teams), 'Equipo norte', 'The team has a neutral name');
select is(pg_temp.save_team(31, 101, array[12,11,11]), pg_temp.team_version(31),
  'Retrying canonical membership returns the original version');
select is((select count(*) from public.work_team_members), 2::bigint, 'A retry never duplicates members');
select throws_ok($$select pg_temp.save_team(31, 101, array[11])$$,
  '23505', 'La clave de operación ya se utilizó con otros datos', 'Operation keys cannot change their meaning');
select throws_ok($$select pg_temp.save_team(32, 102, array[15], 'Intrusos')$$,
  'P0409', 'Hay personas que ya no pertenecen a la empresa', 'Cross-company membership is rejected');
select is((select count(*) from public.work_teams), 1::bigint, 'Invalid members do not leave an empty team');
select throws_ok($$select pg_temp.save_team(32, 102, '{}'::integer[], 'Vacío')$$,
  '22023', 'Selecciona al menos una persona para el equipo', 'Active teams require people');
select throws_ok($$select pg_temp.save_team(32, 102, array[11], ' EQUIPO NORTE ')$$,
  '23505', 'Ya existe un equipo activo con ese nombre', 'Active names are unique ignoring case and whitespace');
select set_config('test.old_team_version', pg_temp.team_version(31)::text, true);
select lives_ok($$select pg_temp.save_team(31, 103, array[11,12], 'Equipo sur', false, pg_temp.team_version(31))$$,
  'An owner edits the team');
select throws_ok($$select pg_temp.save_team(31, 104, array[11], 'Otro', false,
  current_setting('test.old_team_version')::timestamptz)$$,
  'P0409', 'El equipo cambió en otra sesión; vuelve a abrirlo', 'Stale edits cannot overwrite a newer team');
select throws_ok($$update public.work_teams set name = 'Directo'$$, '42501', null,
  'Direct writes cannot bypass team validation');
select throws_ok($$delete from public.work_team_members$$, '42501', null,
  'Direct member deletion is not exposed');

select set_config('test.team_work', public.create_manual_work_order(pg_temp.team_test_id(1),
  pg_temp.team_test_id(21), 'Servicio genérico', 'other', null, null, '', pg_temp.team_test_id(110))::text, true);
select set_config('test.old_work_version', (select updated_at::text from public.work_orders), true);
select set_config('request.jwt.claim.sub', pg_temp.team_test_id(12)::text, true);
select is((select count(*) from public.work_teams), 1::bigint, 'Editors can choose company teams');
select throws_ok($$select pg_temp.save_team(32, 105)$$, '42501',
  'No tienes permiso para gestionar equipos', 'Editors cannot manage team composition');
select lives_ok($$select pg_temp.plan_team(31, 111, current_setting('test.old_work_version')::timestamptz)$$,
  'Editors assign teams and responsible people in one plan');
select is((select work_team_id from public.work_orders), pg_temp.team_test_id(31), 'The team is persisted on the work');
select is((select responsible_user_id from public.work_orders), pg_temp.team_test_id(12),
  'The responsible person remains separate from the team');
select is((select payload #>> '{after,work_team_id}' from public.work_order_events where kind = 'plan_changed'),
  pg_temp.team_test_id(31)::text, 'The assignment is recorded in immutable history');
select set_config('test.planned_version', (select updated_at::text from public.work_orders), true);
select is(pg_temp.plan_team(31, 111, current_setting('test.old_work_version')::timestamptz),
  current_setting('test.planned_version')::timestamptz, 'Planning retries return their original version');
select is((select count(*) from public.work_order_events where kind = 'plan_changed'), 1::bigint,
  'Planning retries do not duplicate history');
select throws_ok($$select pg_temp.plan_team(null, 111, current_setting('test.old_work_version')::timestamptz)$$,
  '23505', 'La clave de operación ya se utilizó con otros datos', 'Planning retries cannot silently change the team');
select throws_ok($$select pg_temp.plan_team(null, 112, current_setting('test.old_work_version')::timestamptz)$$,
  'P0409', 'El trabajo cambió en otra sesión; recarga la ficha', 'Stale plans cannot clear the team');
select lives_ok($$select public.update_work_order_plan(pg_temp.team_test_id(1),
  current_setting('test.team_work')::uuid, current_setting('test.planned_version')::timestamptz,
  pg_temp.team_test_id(12), null, null, 'Cliente anterior', pg_temp.team_test_id(113))$$,
  'Older clients keep using the existing planning command');
select is((select work_team_id from public.work_orders), pg_temp.team_test_id(31),
  'Older clients do not erase the assigned team');

select set_config('request.jwt.claim.sub', pg_temp.team_test_id(11)::text, true);
select lives_ok($$select pg_temp.save_team(31, 106, array[11,12], 'Equipo sur', true, pg_temp.team_version(31))$$,
  'Archiving preserves an assigned team');
select is((select work_team_id from public.work_orders), pg_temp.team_test_id(31), 'Archiving preserves existing work links');
select lives_ok($$select pg_temp.plan_team(31, 114, (select updated_at from public.work_orders))$$,
  'An existing plan can retain its archived team');
select lives_ok($$select pg_temp.plan_team(null, 115, (select updated_at from public.work_orders))$$,
  'An archived team can be unassigned');
select set_config('test.unassigned_version', (select updated_at::text from public.work_orders), true);
select throws_ok($$select pg_temp.plan_team(31, 116, (select updated_at from public.work_orders))$$,
  'P0409', 'Elige un equipo activo con al menos una persona', 'Archived teams cannot receive new assignments');
select is((select updated_at::text from public.work_orders), current_setting('test.unassigned_version'),
  'A failed assignment rolls back the complete plan');
select lives_ok($$select pg_temp.save_team(31, 107, array[11,12], 'Equipo sur', false, pg_temp.team_version(31))$$,
  'A team can be restored');

select set_config('request.jwt.claim.sub', pg_temp.team_test_id(15)::text, true);
select is((select count(*) from public.work_teams), 0::bigint, 'Other tenants cannot read teams');
select is((select count(*) from public.work_team_members), 0::bigint, 'Other tenants cannot read membership');
select lives_ok($$select pg_temp.save_team(33, 108, array[15], 'Equipo externo', false, null, 2)$$,
  'A second tenant can manage its own teams');
select set_config('request.jwt.claim.sub', pg_temp.team_test_id(11)::text, true);
select throws_ok($$select pg_temp.plan_team(33, 117, (select updated_at from public.work_orders))$$,
  'P0002', 'Equipo no encontrado', 'A work order cannot link a team from another tenant');

select set_config('request.jwt.claim.sub', pg_temp.team_test_id(13)::text, true);
select is((select count(*) from public.work_teams), 1::bigint, 'Viewers can read planning labels');
select throws_ok($$select pg_temp.plan_team(31, 118, (select updated_at from public.work_orders))$$,
  '42501', 'No tienes permiso para planificar trabajos', 'Viewers cannot assign teams');
select set_config('request.jwt.claim.sub', pg_temp.team_test_id(14)::text, true);
select is((select count(*) from public.work_teams), 0::bigint, 'Technicians do not gain office team access');
select throws_ok($$select pg_temp.save_team(32, 109)$$, '42501',
  'No tienes permiso para gestionar equipos', 'Technicians cannot manage teams');

set local role postgres;
select set_config('test.before_removal', pg_temp.team_version(31)::text, true);
delete from public.memberships where tenant_id = pg_temp.team_test_id(1) and user_id = pg_temp.team_test_id(12);
select is((select count(*) from public.work_team_members where team_id = pg_temp.team_test_id(31)),
  1::bigint, 'Removing company membership also removes team membership');
select ok(pg_temp.team_version(31) > current_setting('test.before_removal')::timestamptz,
  'Membership removal invalidates the team version');

select * from finish();
rollback;