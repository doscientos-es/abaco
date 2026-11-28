-- In-app notices only. Keep the authoritative audit events and their payloads private.
create table app_private.visit_agenda_change_notices (
  change_id uuid not null,
  tenant_id uuid not null,
  visit_id uuid not null,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  change_kind text not null check (change_kind in ('assigned', 'rescheduled', 'skipped', 'canceled')),
  changed_at timestamptz not null,
  seen_at timestamptz,
  before_start_at timestamptz,
  before_end_at timestamptz,
  before_timezone text,
  after_start_at timestamptz,
  after_end_at timestamptz,
  after_timezone text,
  primary key (change_id, recipient_id),
  foreign key (visit_id, tenant_id) references public.service_visits(id, tenant_id) on delete cascade,
  check ((change_kind = 'assigned') = (before_start_at is null)),
  check ((change_kind in ('skipped', 'canceled')) = (after_start_at is null)),
  check ((before_start_at is null) = (before_end_at is null)
    and (before_start_at is null) = (before_timezone is null)),
  check ((after_start_at is null) = (after_end_at is null)
    and (after_start_at is null) = (after_timezone is null))
);
alter table app_private.visit_agenda_change_notices enable row level security;
revoke all on app_private.visit_agenda_change_notices from public, anon, authenticated, service_role;
create index visit_agenda_change_notices_recipient_idx
  on app_private.visit_agenda_change_notices
  (tenant_id, recipient_id, (seen_at is null) desc, changed_at desc, change_id desc);
create index visit_agenda_change_notices_visit_idx
  on app_private.visit_agenda_change_notices (visit_id, tenant_id);

create function app_private.record_visit_agenda_change_notice() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  change uuid;
  recorded_at timestamptz;
  times_changed boolean := old.scheduled_start_at is distinct from new.scheduled_start_at
    or old.scheduled_end_at is distinct from new.scheduled_end_at;
  assignment_changed boolean := old.assigned_user_id is distinct from new.assigned_user_id
    or old.work_team_id is distinct from new.work_team_id;
  closed_kind text;
  old_zone text;
  new_zone text;
begin
  if new.tenant_id is distinct from old.tenant_id or old.status not in ('scheduled', 'in_progress')
    or new.status not in ('scheduled', 'in_progress', 'skipped', 'canceled') then
    return new;
  end if;
  if new.status in ('skipped', 'canceled') and new.status is distinct from old.status then
    closed_kind := new.status;
  elsif not times_changed and not assignment_changed then
    return new;
  end if;
  if new.assigned_user_id is null and new.work_team_id is null then return new; end if;

  change := pg_catalog.gen_random_uuid();
  recorded_at := pg_catalog.clock_timestamp();
  select l.timezone into old_zone from public.service_locations l
    where l.tenant_id = old.tenant_id and l.id = old.location_id;
  select l.timezone into new_zone from public.service_locations l
    where l.tenant_id = new.tenant_id and l.id = new.location_id;

  with candidates as (
    select new.assigned_user_id as user_id where new.assigned_user_id is not null
    union all
    select tm.user_id from public.work_team_members tm
      where new.assigned_user_id is null
        and tm.tenant_id = new.tenant_id and tm.team_id = new.work_team_id
  ), recipients as (
    select m.user_id,
      (case when old.assigned_user_id is not null then old.assigned_user_id = m.user_id
        else exists (
          select 1 from public.work_team_members previous_member
          where previous_member.tenant_id = old.tenant_id
            and previous_member.team_id = old.work_team_id
            and previous_member.user_id = m.user_id
        ) end) as was_assigned
    from candidates c
    join public.memberships m on m.tenant_id = new.tenant_id and m.user_id = c.user_id
    where m.role in ('technician', 'user')
  ), relevant as (
    select user_id, case
      when closed_kind is not null and was_assigned then closed_kind
      when closed_kind is null and not was_assigned then 'assigned'
      when closed_kind is null and times_changed then 'rescheduled'
    end as kind
    from recipients
  )
  insert into app_private.visit_agenda_change_notices (
    change_id, tenant_id, visit_id, recipient_id, change_kind, changed_at,
    before_start_at, before_end_at, before_timezone, after_start_at, after_end_at, after_timezone
  )
  select change, new.tenant_id, new.id, r.user_id, r.kind, recorded_at,
    case when r.kind <> 'assigned' then old.scheduled_start_at end,
    case when r.kind <> 'assigned' then old.scheduled_end_at end,
    case when r.kind <> 'assigned' then coalesce(old_zone, 'Europe/Madrid') end,
    case when closed_kind is null then new.scheduled_start_at end,
    case when closed_kind is null then new.scheduled_end_at end,
    case when closed_kind is null then coalesce(new_zone, 'Europe/Madrid') end
  from relevant r where r.kind is not null;

  return new;
end;
$$;
revoke all on function app_private.record_visit_agenda_change_notice() from public, anon, authenticated, service_role;
create trigger service_visits_record_agenda_change_notice
  after update of scheduled_start_at, scheduled_end_at, assigned_user_id, work_team_id, status
  on public.service_visits
  for each row execute function app_private.record_visit_agenda_change_notice();

create function app_private.list_my_visit_agenda_change_notices(p_tenant_id uuid)
returns table (
  id uuid, visit_id uuid, visit_title text, change_kind text, changed_at timestamptz,
  seen_at timestamptz, before_start_at timestamptz, before_end_at timestamptz, before_timezone text,
  after_start_at timestamptz, after_end_at timestamptz, after_timezone text
)
language sql stable security definer set search_path = '' as $$
  select n.change_id, n.visit_id, v.title, n.change_kind, n.changed_at,
    n.seen_at, n.before_start_at, n.before_end_at, n.before_timezone,
    n.after_start_at, n.after_end_at, n.after_timezone
  from app_private.visit_agenda_change_notices n
  join public.service_visits v on v.id = n.visit_id and v.tenant_id = n.tenant_id
  where n.tenant_id = p_tenant_id
    and n.recipient_id = (select auth.uid())
    and public.can_access_assigned_visit(n.tenant_id, n.visit_id)
  order by (n.seen_at is null) desc, n.changed_at desc, n.change_id desc
  limit 40;
$$;

create function app_private.mark_my_visit_agenda_change_seen(p_tenant_id uuid, p_change_id uuid)
returns timestamptz
language sql security definer set search_path = '' as $$
  update app_private.visit_agenda_change_notices n
  set seen_at = coalesce(n.seen_at, pg_catalog.clock_timestamp())
  where n.tenant_id = p_tenant_id and n.change_id = p_change_id
    and n.recipient_id = (select auth.uid())
    and public.can_access_assigned_visit(n.tenant_id, n.visit_id)
  returning n.seen_at;
$$;

-- Exposed invoker wrappers call parsed function references. No schema USAGE grant
-- for app_private, and no access to the table, worker or underlying history.
create function public.list_my_visit_agenda_change_notices(p_tenant_id uuid)
returns table (
  id uuid, visit_id uuid, visit_title text, change_kind text, changed_at timestamptz,
  seen_at timestamptz, before_start_at timestamptz, before_end_at timestamptz, before_timezone text,
  after_start_at timestamptz, after_end_at timestamptz, after_timezone text
)
language sql stable security invoker set search_path = ''
begin atomic
  select * from app_private.list_my_visit_agenda_change_notices(p_tenant_id);
end;

create function public.mark_my_visit_agenda_change_seen(p_tenant_id uuid, p_change_id uuid)
returns timestamptz
language sql security invoker set search_path = ''
begin atomic
  select app_private.mark_my_visit_agenda_change_seen(p_tenant_id, p_change_id);
end;

revoke all on function app_private.list_my_visit_agenda_change_notices(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.mark_my_visit_agenda_change_seen(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.list_my_visit_agenda_change_notices(uuid) from public, anon, authenticated, service_role;
revoke all on function public.mark_my_visit_agenda_change_seen(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function app_private.list_my_visit_agenda_change_notices(uuid) to authenticated;
grant execute on function app_private.mark_my_visit_agenda_change_seen(uuid, uuid) to authenticated;
grant execute on function public.list_my_visit_agenda_change_notices(uuid) to authenticated;
grant execute on function public.mark_my_visit_agenda_change_seen(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
