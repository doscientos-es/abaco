begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into public.tenants (id, name) values
  ('45000000-0000-4000-8000-000000000001', 'Empresa extras');
insert into public.clients (id, tenant_id, name) values
  ('45000000-0000-4000-8000-000000000002',
    '45000000-0000-4000-8000-000000000001', 'Cliente extras');
insert into auth.users (id, email) values
  ('45000000-0000-4000-8000-000000000003', 'owner-extra@example.test'),
  ('45000000-0000-4000-8000-000000000004', 'editor-extra@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('45000000-0000-4000-8000-000000000001',
    '45000000-0000-4000-8000-000000000003', 'owner'),
  ('45000000-0000-4000-8000-000000000001',
    '45000000-0000-4000-8000-000000000004', 'editor');

set local role authenticated;
set local request.jwt.claim.sub = '45000000-0000-4000-8000-000000000003';
select set_config('test.extra_work_id', public.create_manual_work_order(
  '45000000-0000-4000-8000-000000000001',
  '45000000-0000-4000-8000-000000000002',
  'Instalación con extra', 'installation', null, null, '',
  '45000000-0000-4000-8000-000000000005'
)::text, true);
select set_config('test.extra_id', public.propose_work_extra(
  '45000000-0000-4000-8000-000000000001',
  current_setting('test.extra_work_id')::uuid,
  'Sustituir bomba', 2.5, 'h', 4000, 1800, 21,
  '45000000-0000-4000-8000-000000000006'
)::text, true);
select is((select status from public.work_order_extras), 'pending',
  'New extra requires an explicit decision');
select is((select price_cents from public.work_order_extras), 10000::bigint,
  'Quoted price is frozen in minor units');
select is((select planned_cost_cents from public.work_order_extras), 4500::bigint,
  'Protected estimated cost is frozen separately from actual cost');
select is(public.propose_work_extra(
  '45000000-0000-4000-8000-000000000001',
  current_setting('test.extra_work_id')::uuid,
  'Sustituir bomba', 2.5, 'h', 4000, 1800, 21,
  '45000000-0000-4000-8000-000000000006'
)::text, current_setting('test.extra_id'),
  'Proposal retry returns the same extra');
select throws_ok(
  $$select public.propose_work_extra(
    '45000000-0000-4000-8000-000000000001',
    current_setting('test.extra_work_id')::uuid,
    'Otra pieza', 2.5, 'h', 4000, 1800, 21,
    '45000000-0000-4000-8000-000000000006')$$,
  '23505', 'La clave de operación ya se utilizó con otros datos',
  'Proposal operation key cannot be reused for different terms');
select throws_ok(
  $$select public.propose_work_extra(
    '45000000-0000-4000-8000-000000000001',
    current_setting('test.extra_work_id')::uuid,
    'Cantidad imprecisa', 1.2345, 'ud', 4000, 1800, 21,
    '45000000-0000-4000-8000-000000000010')$$,
  '22023', 'Datos del extra inválidos',
  'Proposal rejects quantities beyond three decimal places');
select throws_ok(
  $$select public.decide_work_extra(
    '45000000-0000-4000-8000-000000000001',
    current_setting('test.extra_id')::uuid,
    'approved', 'Cliente', '',
    '45000000-0000-4000-8000-000000000007')$$,
  '22023', 'Datos de decisión inválidos',
  'Approval requires a description of customer evidence');
select set_config('test.extra_decision_id', public.decide_work_extra(
  '45000000-0000-4000-8000-000000000001',
  current_setting('test.extra_id')::uuid,
  'approved', 'Ana Cliente', 'Confirmación telefónica registrada por oficina',
  '45000000-0000-4000-8000-000000000007'
)::text, true);
select is((select status from public.work_order_extras), 'approved',
  'Extra becomes approved only after decision evidence is saved');
select is(public.decide_work_extra(
  '45000000-0000-4000-8000-000000000001',
  current_setting('test.extra_id')::uuid,
  'approved', 'Ana Cliente', 'Confirmación telefónica registrada por oficina',
  '45000000-0000-4000-8000-000000000007'
)::text, current_setting('test.extra_decision_id'),
  'Decision retry returns the same decision');
select throws_ok(
  $$select public.decide_work_extra(
    '45000000-0000-4000-8000-000000000001',
    current_setting('test.extra_id')::uuid,
    'rejected', 'Ana Cliente', 'Denegado',
    '45000000-0000-4000-8000-000000000008')$$,
  'P0409', 'El extra ya tiene una decisión',
  'A decided extra cannot be approved or rejected again');
select set_config('test.rejected_extra_id', public.propose_work_extra(
  '45000000-0000-4000-8000-000000000001',
  current_setting('test.extra_work_id')::uuid,
  'Propuesta rechazada', 1, 'ud', 1500, 500, 21,
  '45000000-0000-4000-8000-000000000011'
)::text, true);
select public.decide_work_extra(
  '45000000-0000-4000-8000-000000000001',
  current_setting('test.rejected_extra_id')::uuid,
  'rejected', 'Ana Cliente', 'Correo de rechazo recibido',
  '45000000-0000-4000-8000-000000000012'
);
select is((select status from public.work_order_extras
  where id = current_setting('test.rejected_extra_id')::uuid), 'rejected',
  'A rejected extra remains separate from approved extras');

set local request.jwt.claim.sub = '45000000-0000-4000-8000-000000000004';
select is((select count(*) from public.work_order_extras), 0::bigint,
  'Editor cannot read internal extra prices and costs');
select throws_ok(
  $$select public.propose_work_extra(
    '45000000-0000-4000-8000-000000000001',
    current_setting('test.extra_work_id')::uuid,
    'Otro extra', 1, 'ud', 1000, 500, 21,
    '45000000-0000-4000-8000-000000000009')$$,
  '42501', 'No tienes permiso para proponer extras',
  'Editor cannot bypass extra RLS through privileged command');

set local role postgres;
select throws_ok(
  $$update public.work_order_extras set unit_price_cents = 1
    where id = current_setting('test.extra_id')::uuid$$,
  'P0001', 'Las condiciones del extra son inmutables',
  'Historic price cannot be changed by a privileged update');
select throws_ok(
  $$update public.work_extra_decisions set evidence_description = 'falso'
    where id = current_setting('test.extra_decision_id')::uuid$$,
  'P0001', 'El historial de trabajos es inmutable',
  'Approval evidence is immutable');

select * from finish();
rollback;
