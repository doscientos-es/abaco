begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into public.tenants (id, name) values
  ('40000000-0000-4000-8000-000000000001', 'Empresa de trabajos'),
  ('40000000-0000-4000-8000-000000000002', 'Otra empresa');
insert into public.clients (id, tenant_id, name) values
  ('40000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000001', 'Cliente original'),
  ('40000000-0000-4000-8000-000000000004',
    '40000000-0000-4000-8000-000000000002', 'Cliente ajeno');
insert into public.estimates (id, tenant_id, client_id, title, valid_until) values
  ('40000000-0000-4000-8000-000000000005',
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000003', 'Reparación de piscina', current_date + 30),
  ('40000000-0000-4000-8000-000000000006',
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000003', 'Otro presupuesto', current_date + 30);
insert into public.estimate_lines (
  tenant_id, estimate_id, description, kind, quantity, unit_price_cents
) values (
  '40000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000005',
  'Sustitución de bomba', 'material', 1, 15000
);
update public.estimates set status = 'sent'
where id = '40000000-0000-4000-8000-000000000005';
update public.estimates set status = 'accepted', responded_at = now(),
  responded_by = 'Cliente firmante'
where id = '40000000-0000-4000-8000-000000000005';
insert into auth.users (id, email) values
  ('40000000-0000-4000-8000-000000000007', 'editor-work@example.test'),
  ('40000000-0000-4000-8000-000000000008', 'viewer-work@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000007', 'editor'),
  ('40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000008', 'viewer');

set local role authenticated;
set local request.jwt.claim.sub = '40000000-0000-4000-8000-000000000007';
select set_config('test.work_id', public.convert_accepted_estimate_to_work(
  '40000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000005',
  '40000000-0000-4000-8000-000000000009'
)::text, true);
select is((select count(*) from public.work_orders), 1::bigint,
  'An accepted proposal creates one work order');
select is((select source_snapshot #>> '{acceptance,responded_by}'
  from public.work_orders), 'Cliente firmante',
  'The work order keeps the recorded acceptance identity');
select is((select source_snapshot #>> '{estimate,estimate_lines,0,description}'
  from public.work_orders), 'Sustitución de bomba',
  'The accepted commercial scope is copied without consulting live catalog');
select is(public.convert_accepted_estimate_to_work(
  '40000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000005',
  '40000000-0000-4000-8000-000000000009')::text,
  current_setting('test.work_id'),
  'The same operation key returns the original work order');
select is(public.convert_accepted_estimate_to_work(
  '40000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000005',
  '40000000-0000-4000-8000-000000000010')::text,
  current_setting('test.work_id'),
  'A different key for the same accepted proposal still finds one work order');
select is((select count(*) from public.work_orders), 1::bigint,
  'Retries never create another work order');
select is((select count(*) from public.work_order_events), 1::bigint,
  'Conversion writes one audit event');
select set_config('test.work_version', (
  select updated_at::text from public.work_orders
  where id = current_setting('test.work_id')::uuid
), true);
select lives_ok(
  $$select public.transition_work_order(
    '40000000-0000-4000-8000-000000000001',
    current_setting('test.work_id')::uuid,
    current_setting('test.work_version')::timestamptz,
    'in_progress', '40000000-0000-4000-8000-000000000012')$$,
  'A writer can start an accepted work order');
select is((select status from public.work_orders
  where id = current_setting('test.work_id')::uuid), 'in_progress',
  'The status transition is persisted');
select is(public.transition_work_order(
  '40000000-0000-4000-8000-000000000001',
  current_setting('test.work_id')::uuid,
  current_setting('test.work_version')::timestamptz,
  'in_progress', '40000000-0000-4000-8000-000000000012'),
  'in_progress', 'Retrying the same transition returns its original result');
select throws_ok(
  $$select public.transition_work_order(
    '40000000-0000-4000-8000-000000000001',
    current_setting('test.work_id')::uuid,
    current_setting('test.work_version')::timestamptz,
    'completed', '40000000-0000-4000-8000-000000000013')$$,
  'P0409', 'El trabajo cambió en otra sesión; recarga la ficha',
  'A stale transition cannot overwrite newer progress');
select is((select count(*) from public.work_order_events), 2::bigint,
  'The status transition adds one audit event');
select throws_ok(
  $$select public.transition_work_order(
    '40000000-0000-4000-8000-000000000001',
    current_setting('test.work_id')::uuid,
    (select updated_at from public.work_orders
      where id = current_setting('test.work_id')::uuid),
    'ready', '40000000-0000-4000-8000-000000000014')$$,
  'P0409', 'Transición de trabajo no permitida',
  'A work order cannot return to ready after execution starts');
select throws_ok(
  $$select public.convert_accepted_estimate_to_work(
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000006',
    '40000000-0000-4000-8000-000000000009')$$,
  '23505', 'La clave de operación ya se utilizó con otros datos',
  'Reusing the key for a different proposal is a conflict');

update public.clients set name = 'Cliente cambiado'
where id = '40000000-0000-4000-8000-000000000003';
select is((select source_snapshot #>> '{client,name}' from public.work_orders),
  'Cliente original', 'Changing master data does not rewrite accepted work scope');

set local request.jwt.claim.sub = '40000000-0000-4000-8000-000000000008';
select throws_ok(
  $$select public.convert_accepted_estimate_to_work(
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000005',
    '40000000-0000-4000-8000-000000000011')$$,
  '42501', 'No tienes permiso para crear trabajos',
  'A viewer cannot convert a proposal');

set local role postgres;
select throws_ok(
  $$update public.work_orders set source_snapshot = '{}'::jsonb$$,
  'P0001', 'El origen aceptado de un trabajo es inmutable',
  'A privileged table role cannot rewrite accepted scope');

select * from finish();
rollback;
