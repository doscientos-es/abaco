begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select set_config('test.stripe_event', '{
  "id":"evt_Test123", "object":"event", "account":"acct_Test123", "livemode":false,
  "type":"checkout.session.completed", "created":123,
  "data":{"object":{"id":"cs_test_Test123", "object":"checkout.session",
    "livemode":false, "mode":"payment", "payment_status":"paid", "currency":"eur",
    "amount_total":1234, "client_reference_id":"bd000000-0000-4000-8000-000000000001",
    "payment_intent":"pi_Test123", "customer_email":"private@example.test",
    "metadata":{"operation_id":"bd000000-0000-4000-8000-000000000001", "secret":"private"}}}
}'::text, true);

set local role service_role;
select throws_ok(
  $$select public.receive_stripe_connect_event(current_setting('test.stripe_event')::jsonb)$$,
  '55000', 'stripe_connect_not_ready', 'Ingress remains closed before the processor is ready');
reset role;
select is((select count(*) from app_private.stripe_connect_events), 0::bigint,
  'A disabled ingress does not acknowledge or store events');
select ok(not has_function_privilege('authenticated', 'public.receive_stripe_connect_event(jsonb)', 'execute'),
  'Authenticated users cannot submit events');
select ok(has_function_privilege('service_role', 'public.receive_stripe_connect_event(jsonb)', 'execute'),
  'The server role can submit verified events');
select ok(not has_table_privilege('service_role', 'app_private.stripe_connect_events', 'select'),
  'The event inbox cannot be read directly through the service role');

update app_private.stripe_connect_runtime set ingress_enabled = true where singleton;
set local role service_role;
select lives_ok(
  $$select public.receive_stripe_connect_event(current_setting('test.stripe_event')::jsonb)$$,
  'A verified event can be saved after activation');
select lives_ok(
  $$select public.receive_stripe_connect_event(current_setting('test.stripe_event')::jsonb)$$,
  'Repeating the same event is idempotent');
select throws_ok(
  $$select public.receive_stripe_connect_event(jsonb_set(current_setting('test.stripe_event')::jsonb,
    '{data,object,amount_total}', '9999'))$$,
  '23505', 'stripe_event_conflict', 'A reused event ID with different payment data is rejected');
select throws_ok(
  $$select public.receive_stripe_connect_event('{}'::jsonb)$$,
  '22023', 'invalid_stripe_event', 'Malformed events are rejected');
reset role;
select is((select count(*) from app_private.stripe_connect_events), 1::bigint,
  'A repeated event creates only one inbox row');
select ok((select payload#>'{data,object,customer_email}' is null
  and payload#>'{data,object,metadata,secret}' is null
  and payload#>>'{data,object,metadata,operation_id}' = 'bd000000-0000-4000-8000-000000000001'
  from app_private.stripe_connect_events where event_id = 'evt_Test123'),
  'Only the reconciliation metadata is retained');

select * from finish();
rollback;