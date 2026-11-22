-- Keep ingress disabled until a durable processor has been deployed and tested.
create table app_private.stripe_connect_runtime (
  singleton boolean primary key default true check (singleton),
  ingress_enabled boolean not null default false
);
insert into app_private.stripe_connect_runtime (singleton) values (true);
revoke all on app_private.stripe_connect_runtime from public, anon, authenticated, service_role;

-- Keep only the fields needed for reconciliation; other Stripe data can be retrieved by event ID.
create table app_private.stripe_connect_events (
  event_id text primary key,
  account_id text not null,
  livemode boolean not null,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz
);
revoke all on app_private.stripe_connect_events from public, anon, authenticated, service_role;

create function public.receive_stripe_connect_event(p_event jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_object jsonb;
  v_payload jsonb;
  v_existing jsonb;
begin
  if not coalesce((select ingress_enabled from app_private.stripe_connect_runtime where singleton), false) then
    raise exception 'stripe_connect_not_ready' using errcode = '55000';
  end if;
  if jsonb_typeof(p_event) is distinct from 'object'
    or p_event->>'object' is distinct from 'event'
    or not coalesce((p_event->>'id') ~ '^evt_[a-zA-Z0-9]+$', false)
    or not coalesce((p_event->>'account') ~ '^acct_[a-zA-Z0-9]+$', false)
    or jsonb_typeof(p_event->'livemode') is distinct from 'boolean'
    or coalesce(length(p_event->>'type'), 0) not between 1 and 200
    or jsonb_typeof(p_event#>'{data,object}') is distinct from 'object'
    or octet_length(p_event::text) > 2097152 then
    raise exception 'invalid_stripe_event' using errcode = '22023';
  end if;
  v_object := p_event#>'{data,object}';
  v_payload := jsonb_build_object(
    'id', p_event->'id', 'object', p_event->'object', 'account', p_event->'account',
    'livemode', p_event->'livemode', 'type', p_event->'type', 'created', p_event->'created',
    'data', jsonb_build_object('object', jsonb_strip_nulls(jsonb_build_object(
      'id', v_object->'id', 'object', v_object->'object', 'livemode', v_object->'livemode',
      'mode', v_object->'mode', 'payment_status', v_object->'payment_status',
      'currency', v_object->'currency', 'amount_total', v_object->'amount_total',
      'client_reference_id', v_object->'client_reference_id', 'payment_intent', v_object->'payment_intent',
      'metadata', jsonb_strip_nulls(jsonb_build_object('operation_id', v_object#>'{metadata,operation_id}'))
    )))
  );
  insert into app_private.stripe_connect_events (event_id, account_id, livemode, event_type, payload)
  values (p_event->>'id', p_event->>'account', (p_event->>'livemode')::boolean, p_event->>'type', v_payload)
  on conflict (event_id) do nothing;
  if not found then
    select payload into v_existing from app_private.stripe_connect_events where event_id = p_event->>'id';
    if v_existing is distinct from v_payload then
      raise exception 'stripe_event_conflict' using errcode = '23505';
    end if;
  end if;
end;
$$;
revoke all on function public.receive_stripe_connect_event(jsonb) from public, anon, authenticated;
grant execute on function public.receive_stripe_connect_event(jsonb) to service_role;