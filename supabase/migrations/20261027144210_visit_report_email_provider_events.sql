-- Resend may deliver a signed event before the sender stores its response ID.
-- Keep only operational metadata; connect it at read time by provider email ID.
create table public.service_visit_report_email_provider_events (
  event_id text primary key check (char_length(event_id) between 1 and 128),
  provider_message_id text not null
    check (char_length(provider_message_id) between 1 and 128),
  recipient_email text not null
    check (char_length(recipient_email) between 3 and 320),
  event_type text not null check (event_type in (
    'email.delivery_delayed', 'email.delivered', 'email.bounced',
    'email.complained', 'email.failed', 'email.suppressed'
  )),
  occurred_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp()
);
create index service_visit_report_email_events_message_idx
  on public.service_visit_report_email_provider_events
  (provider_message_id, occurred_at desc);

alter table public.service_visit_report_email_provider_events enable row level security;
revoke all on public.service_visit_report_email_provider_events
  from public, anon, authenticated;
grant select (event_id, provider_message_id, recipient_email,
  event_type, occurred_at, received_at)
  on public.service_visit_report_email_provider_events to authenticated;
grant insert, select on public.service_visit_report_email_provider_events
  to service_role;
create policy service_visit_report_email_events_office_read
  on public.service_visit_report_email_provider_events for select to authenticated
  using (exists (
    select 1 from public.service_visit_report_email_deliveries delivery
    where delivery.provider_message_id =
        service_visit_report_email_provider_events.provider_message_id
      and lower(delivery.recipient_email) =
        lower(service_visit_report_email_provider_events.recipient_email)
      and public.has_role(delivery.tenant_id,
        array['owner', 'admin']::public.app_role[])
  ));
