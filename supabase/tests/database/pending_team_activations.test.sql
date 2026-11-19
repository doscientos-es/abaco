begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.tenants(id, name) values
  ('d1000000-0000-4000-8000-000000000001', 'Example A'),
  ('d1000000-0000-4000-8000-000000000002', 'Example B');
insert into auth.users(id, email, invited_at, email_confirmed_at, last_sign_in_at) values
  ('d1000000-0000-4000-8000-000000000003', 'admin-a@example.test', null, now(), now()),
  ('d1000000-0000-4000-8000-000000000004', 'pending-a@example.test', now(), null, null),
  ('d1000000-0000-4000-8000-000000000005', 'active-a@example.test', now(), now(), now()),
  ('d1000000-0000-4000-8000-000000000006', 'pending-b@example.test', now(), null, null),
  ('d1000000-0000-4000-8000-000000000007', 'regular-a@example.test', null, null, null);
insert into public.memberships(tenant_id, user_id, role) values
  ('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000003', 'admin'),
  ('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000004', 'user'),
  ('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000005', 'user'),
  ('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000007', 'user'),
  ('d1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000006', 'user');

set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000003';
select results_eq(
  $$select user_id from public.pending_team_activations('d1000000-0000-4000-8000-000000000001')$$,
  $$values ('d1000000-0000-4000-8000-000000000004'::uuid)$$,
  'Only invited and unactivated accounts in this company are returned'
);
select throws_ok(
  $$select * from public.pending_team_activations('d1000000-0000-4000-8000-000000000002')$$,
  '42501', 'No tienes permiso para gestionar el equipo', 'An admin cannot access another company'
);
set local request.jwt.claim.sub = 'd1000000-0000-4000-8000-000000000004';
select throws_ok(
  $$select * from public.pending_team_activations('d1000000-0000-4000-8000-000000000001')$$,
  '42501', 'No tienes permiso para gestionar el equipo', 'A regular member cannot list activations'
);
select * from finish();
rollback;