begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values
  ('ad430000-0000-4000-8000-000000000001', 'issuer-admin@example.test'),
  ('ad430000-0000-4000-8000-000000000002', 'issuer-user@example.test');
insert into public.platform_superadmins (user_id) values ('ad430000-0000-4000-8000-000000000001');

set local role authenticated;
set local request.jwt.claim.sub = 'ad430000-0000-4000-8000-000000000002';
select throws_ok($$select public.superadmin_invoice_issuer()$$, '42501', null, 'Non-superadmins cannot read');
select throws_ok($$select public.superadmin_save_invoice_issuer(0, '{}')$$, '42501', null, 'Non-superadmins cannot write');
select throws_ok($$select * from app_private.platform_invoice_issuer$$, '42501', null, 'Direct reads are denied');

set local request.jwt.claim.sub = 'ad430000-0000-4000-8000-000000000001';
select is((public.superadmin_invoice_issuer()->>'revision')::bigint, 0::bigint, 'Initially unconfigured');
select throws_ok($$select public.superadmin_save_invoice_issuer(0, '{}')$$, '22023', null, 'Missing fields are rejected');
select throws_ok($$select public.superadmin_save_invoice_issuer(0, '{"legal_name":"Test SL","tax_id":"B12345678","street":"Calle 1","postal_code":"08001","city":"Barcelona","province":"Barcelona","series":"A","corrective_series":"a"}')$$,
  '22023', null, 'The ordinary and corrective series must differ');
select throws_ok($$select public.superadmin_save_invoice_issuer(0, '{"legal_name":"Test SL","tax_id":"B12345678","street":"Calle 1","postal_code":"08001","city":"Barcelona","province":"Barcelona","series":"A","corrective_series":"R","extra":true}')$$,
  '22023', null, 'Unexpected fields are rejected');
select throws_ok($$select public.superadmin_save_invoice_issuer(0, '{"legal_name":"\t","tax_id":"B12345678","street":"Calle 1","postal_code":"08001","city":"Barcelona","province":"Barcelona","series":"A","corrective_series":"R"}')$$,
  '23514', null, 'Whitespace-only fiscal names are rejected');
select lives_ok($$select public.superadmin_save_invoice_issuer(0, '{"legal_name":" Test SL ","tax_id":"b12345678","street":"Calle 1","postal_code":"08001","city":"Barcelona","province":"Barcelona","series":"a","corrective_series":"r"}')$$,
  'Superadmins can save valid issuer settings');
select is(public.superadmin_invoice_issuer()->'profile'->>'legal_name', 'Test SL', 'Names are trimmed');
select is(public.superadmin_invoice_issuer()->'profile'->>'series', 'A', 'Series are normalized');
select throws_ok($$select public.superadmin_save_invoice_issuer(0, '{"legal_name":"Test SL","tax_id":"B12345678","street":"Calle 1","postal_code":"08001","city":"Barcelona","province":"Barcelona","series":"A","corrective_series":"R"}')$$,
  '40001', null, 'Stale versions cannot overwrite settings');
reset role;
select is((select count(*) from app_private.platform_invoice_issuer_log), 1::bigint, 'Successful saves are audited');
select * from finish();
rollback;
