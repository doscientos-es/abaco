-- Record only real decisions, atomically with the vacation request change.
create table public.vacation_decision_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  request_id uuid not null,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  decision text not null check (decision in ('approved', 'rejected')),
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  foreign key (request_id, tenant_id) references public.vacation_requests(id, tenant_id) on delete cascade,
  unique (request_id)
);

create index vacation_decision_notifications_recipient_idx
  on public.vacation_decision_notifications (recipient_id, tenant_id, created_at desc);
alter table public.vacation_decision_notifications enable row level security;
revoke all on public.vacation_decision_notifications from public, anon, authenticated;
grant select on public.vacation_decision_notifications to authenticated;
grant all on public.vacation_decision_notifications to service_role;
create policy vacation_decision_notifications_read on public.vacation_decision_notifications
  for select to authenticated using (
    recipient_id = (select auth.uid()) and exists (
      select 1 from public.memberships m
      where m.tenant_id = vacation_decision_notifications.tenant_id
        and m.user_id = (select auth.uid())
    )
  );

create function public.record_vacation_decision_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'pending' and new.status in ('approved', 'rejected') then
    insert into public.vacation_decision_notifications (tenant_id, request_id, recipient_id, decision)
    values (new.tenant_id, new.id, new.requester_id, new.status);
  end if;
  return new;
end;
$$;
create trigger vacation_requests_record_decision_notification
  after update of status on public.vacation_requests
  for each row execute function public.record_vacation_decision_notification();
revoke all on function public.record_vacation_decision_notification() from public, anon, authenticated;

create function public.read_vacation_decision_notification(p_notification_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.vacation_decision_notifications n set read_at = coalesce(n.read_at, clock_timestamp())
  where n.id = p_notification_id and n.recipient_id = (select auth.uid())
    and exists (select 1 from public.memberships m
                where m.tenant_id = n.tenant_id and m.user_id = (select auth.uid()));
  return found;
end;
$$;
revoke all on function public.read_vacation_decision_notification(uuid) from public, anon, authenticated;
grant execute on function public.read_vacation_decision_notification(uuid) to authenticated;