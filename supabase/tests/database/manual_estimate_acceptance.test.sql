begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into public.tenants (id, name) values
  ('41000000-0000-4000-8000-000000000001', 'Empresa aceptación manual');
insert into public.clients (id, tenant_id, name) values
  ('41000000-0000-4000-8000-000000000002',
    '41000000-0000-4000-8000-000000000001', 'Cliente manual');
insert into public.estimates (id, tenant_id, client_id, title, valid_until) values
  ('41000000-0000-4000-8000-000000000003',
    '41000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000002', 'Trabajo acordado', current_date + 30),
  ('41000000-0000-4000-8000-000000000004',
    '41000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000002', 'Otro borrador', current_date + 30);
update public.estimates set status = 'sent'
where id = '41000000-0000-4000-8000-000000000003';
insert into auth.users (id, email) values
  ('41000000-0000-4000-8000-000000000005', 'editor-manual@example.test'),
  ('41000000-0000-4000-8000-000000000006', 'viewer-manual@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('41000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000005', 'editor'),
  ('41000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000006', 'viewer');

set local role authenticated;
set local request.jwt.claim.sub = '41000000-0000-4000-8000-000000000005';
select set_config('test.accepted_at', public.accept_estimate_manually(
  '41000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000003',
  '41000000-0000-4000-8000-000000000007',
  'María Pérez', 'Correo de aceptación guardado en expediente 123'
)::text, true);
select is((select status from public.estimates
  where id = '41000000-0000-4000-8000-000000000003'), 'accepted',
  'The accepted published proposal changes state');
select is((select responded_by from public.estimates
  where id = '41000000-0000-4000-8000-000000000003'), 'María Pérez',
  'The declared accepting person is visible on the proposal');
select is((select count(*) from public.estimate_manual_acceptances), 1::bigint,
  'The office action creates one evidence record');
select is(public.accept_estimate_manually(
  '41000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000003',
  '41000000-0000-4000-8000-000000000007',
  'María Pérez', 'Correo de aceptación guardado en expediente 123'
)::text, current_setting('test.accepted_at'),
  'Retrying the same operation returns its original timestamp');
select throws_ok(
  $$select public.accept_estimate_manually(
    '41000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000003',
    '41000000-0000-4000-8000-000000000007',
    'Otra persona', 'Correo de aceptación guardado en expediente 123')$$,
  '23505', 'La clave de operación ya se utilizó con otros datos',
  'Reusing an operation key with different evidence is a conflict');
select throws_ok(
  $$select public.accept_estimate_manually(
    '41000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000004',
    '41000000-0000-4000-8000-000000000008',
    'María Pérez', 'Correo de aceptación guardado en expediente 123')$$,
  'P0409', 'Solo se puede aceptar manualmente una versión enviada',
  'A draft cannot be accepted without a published version');
select set_config('test.manual_work', public.convert_accepted_estimate_to_work(
  '41000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000003',
  '41000000-0000-4000-8000-000000000009'
)::text, true);
select is((select source_snapshot #>> '{acceptance,mode}' from public.work_orders
  where id = current_setting('test.manual_work')::uuid), 'office_manual',
  'The resulting work order identifies office acceptance distinctly');
select is((select source_snapshot #>> '{acceptance,evidence_description}'
  from public.work_orders where id = current_setting('test.manual_work')::uuid),
  'Correo de aceptación guardado en expediente 123',
  'The evidence reference is copied into immutable work scope');

set local request.jwt.claim.sub = '41000000-0000-4000-8000-000000000006';
select throws_ok(
  $$select public.accept_estimate_manually(
    '41000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000004',
    '41000000-0000-4000-8000-000000000010',
    'María Pérez', 'Correo de aceptación guardado en expediente 123')$$,
  '42501', 'No tienes permiso para aceptar presupuestos',
  'A viewer cannot record an office acceptance');

set local role postgres;
select throws_ok(
  $$update public.estimate_manual_acceptances
    set evidence_description = 'Referencia alterada'$$,
  'P0001', 'La evidencia de aceptación manual es inmutable',
  'A privileged table role cannot rewrite acceptance evidence');

select * from finish();
rollback;
