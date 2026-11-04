begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.tenants (id, name) values
  ('79000000-0000-4000-8000-000000000001', 'Calendario A'),
  ('79000000-0000-4000-8000-000000000002', 'Calendario B');
insert into auth.users (id, email) values
  ('79000000-0000-4000-8000-000000000003', 'calendar-owner@example.test'),
  ('79000000-0000-4000-8000-000000000004', 'calendar-editor@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('79000000-0000-4000-8000-000000000001', '79000000-0000-4000-8000-000000000003', 'owner'),
  ('79000000-0000-4000-8000-000000000001', '79000000-0000-4000-8000-000000000004', 'editor');
set local role authenticated;
set local request.jwt.claim.sub = '79000000-0000-4000-8000-000000000003';

select lives_ok($$select public.save_scheduled_payment(
  '79000000-0000-4000-8000-000000000005', '79000000-0000-4000-8000-000000000001',
  'Material', 'Proveedor', 'Materiales', 12100, 21, '2026-11-20')$$, 'Owner can create a forecast');
select is((select count(*) from public.ledger_entries where tenant_id = '79000000-0000-4000-8000-000000000001'), 0::bigint,
  'A forecast does not create a ledger entry');
select lives_ok($$select public.save_scheduled_payment(
  '79000000-0000-4000-8000-000000000005', '79000000-0000-4000-8000-000000000001',
  'Material', 'Proveedor', 'Materiales', 12100, 21, '2026-11-21')$$, 'Pending forecast can be rescheduled');
select set_config('test.calendar_entry', public.settle_scheduled_payment(
  '79000000-0000-4000-8000-000000000001', '79000000-0000-4000-8000-000000000005', '2026-11-22')::text, true);
select is(public.settle_scheduled_payment(
  '79000000-0000-4000-8000-000000000001', '79000000-0000-4000-8000-000000000005', '2026-11-22')::text,
  current_setting('test.calendar_entry'), 'Retry returns the same ledger entry');
select is((select count(*) from public.ledger_entries where tenant_id = '79000000-0000-4000-8000-000000000001'), 1::bigint,
  'Retry does not duplicate the expense');
select is((select entry_date from public.ledger_entries where id = current_setting('test.calendar_entry')::uuid),
  '2026-11-22'::date, 'Ledger uses the actual payment date');
select throws_ok($$select public.settle_scheduled_payment(
  '79000000-0000-4000-8000-000000000001', '79000000-0000-4000-8000-000000000005', '2026-11-23')$$,
  '22023', 'El pago ya está registrado con otra fecha', 'Different retry date is rejected');
select throws_ok($$select public.cancel_scheduled_payment(
  '79000000-0000-4000-8000-000000000001', '79000000-0000-4000-8000-000000000005')$$,
  '22023', 'El pago no está pendiente', 'Paid forecasts cannot be cancelled');
select throws_ok($$select public.settle_scheduled_payment(
  '79000000-0000-4000-8000-000000000002', '79000000-0000-4000-8000-000000000005', '2026-11-22')$$,
  '42501', 'Sin permiso para gestionar pagos', 'Other tenant is forbidden');
set local request.jwt.claim.sub = '79000000-0000-4000-8000-000000000004';
select is((select count(*) from public.scheduled_payments), 0::bigint, 'Editors cannot read the calendar');
select throws_ok($$select public.save_scheduled_payment(
  '79000000-0000-4000-8000-000000000006', '79000000-0000-4000-8000-000000000001',
  'Material', '', '', 12100, 21, '2026-11-20')$$,
  '42501', 'Sin permiso para gestionar pagos', 'Editors cannot create forecasts');
set local role postgres;
update public.tenants set subscription_status = 'canceled' where id = '79000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '79000000-0000-4000-8000-000000000003';
select throws_ok($$select public.save_scheduled_payment(
  '79000000-0000-4000-8000-000000000006', '79000000-0000-4000-8000-000000000001',
  'Material', '', '', 12100, 21, '2026-11-20')$$,
  'P0402', 'La empresa no puede gestionar pagos', 'Inactive tenants cannot write');
select is(public.settle_scheduled_payment(
  '79000000-0000-4000-8000-000000000001', '79000000-0000-4000-8000-000000000005', '2026-11-22')::text,
  current_setting('test.calendar_entry'), 'A completed payment can still be retried after expiration');
select * from finish();
rollback;