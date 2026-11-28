-- Office quality follow-up is independent of the visit report, customer output and incidents.
-- One immutable event stream is the current revision as well as the audit trail.
create table public.service_visit_quality_events (
  operation_id uuid primary key,
  tenant_id uuid not null,
  report_version_id uuid not null,
  revision integer not null check (revision > 0),
  status text not null check (status in ('reviewed', 'pending', 'in_progress', 'corrected')),
  category text check (category in ('evidence', 'service', 'follow_up')),
  owner_id uuid,
  actor_id uuid not null,
  recorded_at timestamptz not null default clock_timestamp(),
  foreign key (report_version_id, tenant_id)
    references public.service_visit_report_versions (id, tenant_id) on delete restrict,
  unique (report_version_id, revision),
  check ((status = 'reviewed' and category is null and owner_id is null)
    or (status <> 'reviewed' and category is not null and owner_id is not null))
);
create index service_visit_quality_events_tenant_report_idx
  on public.service_visit_quality_events (tenant_id, report_version_id, revision desc);
create trigger service_visit_quality_events_immutable
  before update or delete on public.service_visit_quality_events
  for each row execute function public.reject_work_history_change();
alter table public.service_visit_quality_events enable row level security;
revoke all on public.service_visit_quality_events from public, anon, authenticated;
grant select on public.service_visit_quality_events to authenticated;
create policy service_visit_quality_events_admin_read
  on public.service_visit_quality_events for select to authenticated
  using (public.has_role(tenant_id, array['owner', 'admin']::public.app_role[]));

-- Sample each visit at most once: cohort is its first closure and the displayed
-- immutable version is the latest available when that ISO week ended in Madrid.
create function app_private.list_visit_quality_reviews(
  p_tenant uuid, p_week date, p_mode text, p_offset integer default 0
)
returns table (
  report_version_id uuid, visit_id uuid, version integer, closed_at timestamptz,
  visit_title text, client_name text, revision integer, status text, category text, owner_id uuid
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  last_closed_week date := (date_trunc('week', now() at time zone 'Europe/Madrid'))::date - 7;
  start_at timestamptz;
  end_at timestamptz;
begin
  if (select auth.uid()) is null
    or not coalesce(public.has_role(p_tenant, array['owner', 'admin']::public.app_role[]), false) then
    raise exception 'No autorizado para supervisar servicios' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('sample', 'open') or p_offset is null or p_offset < 0
     or p_offset > 100000 or p_week is null or p_week < date '2000-01-03'
     or extract(isodow from p_week) <> 1 or p_week > last_closed_week then
    raise exception 'Semana de revisión inválida' using errcode = '22023';
  end if;
  start_at := p_week::timestamp at time zone 'Europe/Madrid';
  end_at := (p_week + 7)::timestamp at time zone 'Europe/Madrid';

  return query
    with cohort as (
      select v.visit_id,
        row_number() over (order by md5(p_tenant::text || ':' ||
          to_char(p_week,'YYYY-MM-DD') || ':' || v.visit_id::text), v.visit_id) as sample_rank,
        count(*) over () as population
      from public.service_visit_report_versions v
      where p_mode = 'sample' and v.tenant_id = p_tenant and v.version = 1
        and v.closed_at >= start_at and v.closed_at < end_at
    ), sampled as (
      select latest.id, c.sample_rank, latest.closed_at as sort_at
      from cohort c
      join lateral (
        select v.id, v.closed_at from public.service_visit_report_versions v
        where v.tenant_id = p_tenant and v.visit_id = c.visit_id and v.closed_at < end_at
        order by v.version desc limit 1
      ) latest on true
      where c.sample_rank <= least(10, (c.population + 9) / 10)
    ), latest_events as (
      select distinct on (e.report_version_id) e.report_version_id, e.status, e.recorded_at
      from public.service_visit_quality_events e
      where p_mode = 'open' and e.tenant_id = p_tenant
      order by e.report_version_id, e.revision desc
    ), chosen as (
      select s.id, s.sample_rank, s.sort_at from sampled s
      union all
      select e.report_version_id, 0::bigint, e.recorded_at from latest_events e
      where e.status in ('pending', 'in_progress')
    )
    select v.id, v.visit_id, v.version, v.closed_at,
      v.snapshot #>> '{visit,title}', v.snapshot #>> '{client,name}',
      coalesce(e.revision, 0), e.status, e.category, e.owner_id
    from chosen c
    join public.service_visit_report_versions v on v.id = c.id and v.tenant_id = p_tenant
    left join lateral (
      select ev.revision, ev.status, ev.category, ev.owner_id
      from public.service_visit_quality_events ev
      where ev.tenant_id = p_tenant and ev.report_version_id = c.id
      order by ev.revision desc limit 1
    ) e on true
    order by c.sample_rank, c.sort_at, c.id
    limit 21 offset p_offset;
end;
$$;

create function app_private.record_visit_quality_review(
  p_tenant uuid, p_report uuid, p_expected_revision integer, p_status text,
  p_category text, p_owner uuid, p_operation uuid
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  prior public.service_visit_quality_events%rowtype;
  current_event public.service_visit_quality_events%rowtype;
  next_revision integer;
begin
  if actor is null
    or not coalesce(public.has_role(p_tenant, array['owner', 'admin']::public.app_role[]), false)
    or not coalesce(public.tenant_can_write(p_tenant), false) then
    raise exception 'No autorizado para registrar una revisión' using errcode = '42501';
  end if;
  if p_report is null or p_expected_revision is null or p_expected_revision < 0
     or p_operation is null or p_status is null
     or p_status not in ('reviewed','pending','in_progress','corrected')
     or (p_status = 'reviewed' and (p_category is not null or p_owner is not null))
     or (p_status <> 'reviewed' and
       (p_category is null or p_category not in ('evidence','service','follow_up') or p_owner is null)) then
    raise exception 'Revisión de calidad inválida' using errcode = '22023';
  end if;
  if not exists (select 1 from public.service_visit_report_versions v
    where v.id = p_report and v.tenant_id = p_tenant) then
    raise exception 'Parte no encontrado' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('visit-quality:' || p_report::text, 0));
  select * into prior from public.service_visit_quality_events e
    where e.operation_id = p_operation and e.tenant_id = p_tenant;
  if found then
    if row(prior.report_version_id, prior.revision - 1, prior.status,
       prior.category, prior.owner_id, prior.actor_id)
       is distinct from row(p_report, p_expected_revision, p_status, p_category, p_owner, actor) then
      raise exception 'La operación ya tiene otro contenido' using errcode = 'P0409';
    end if;
    return prior.revision;
  end if;
  if p_owner is not null and not exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant and m.user_id = p_owner and m.role in ('owner', 'admin')
  ) then raise exception 'Elige un responsable de la administración' using errcode = '22023';
  end if;
  select * into current_event from public.service_visit_quality_events e
    where e.report_version_id = p_report and e.tenant_id = p_tenant
    order by e.revision desc limit 1;
  if coalesce(current_event.revision, 0) <> p_expected_revision then
    raise exception 'La revisión ha cambiado' using errcode = 'P0409';
  end if;
  if not coalesce((
    (current_event.status is null and p_status in ('reviewed','pending'))
    or (current_event.status in ('reviewed','corrected') and p_status = 'pending')
    or (current_event.status in ('pending','in_progress') and p_status in ('pending','in_progress','corrected'))
  ), false) or row(current_event.status, current_event.category, current_event.owner_id)
     is not distinct from row(p_status, p_category, p_owner) then
    raise exception 'El cambio de estado no está permitido' using errcode = '22023';
  end if;
  next_revision := p_expected_revision + 1;
  insert into public.service_visit_quality_events
    (operation_id, tenant_id, report_version_id, revision, status, category, owner_id, actor_id)
  values (p_operation, p_tenant, p_report, next_revision, p_status, p_category, p_owner, actor);
  return next_revision;
end;
$$;

-- Parsed SQL wrappers retain the schema-qualified dependency without granting
-- callers USAGE on app_private. Only the sealed implementations elevate privileges.
create function public.list_visit_quality_reviews(
  p_tenant uuid, p_week date, p_mode text, p_offset integer default 0
)
returns table (
  report_version_id uuid, visit_id uuid, version integer, closed_at timestamptz,
  visit_title text, client_name text, revision integer, status text, category text, owner_id uuid
)
language sql stable security invoker set search_path = ''
begin atomic
  select * from app_private.list_visit_quality_reviews(p_tenant, p_week, p_mode, p_offset);
end;

create function public.record_visit_quality_review(
  p_tenant uuid, p_report uuid, p_expected_revision integer, p_status text,
  p_category text, p_owner uuid, p_operation uuid
)
returns integer
language sql security invoker set search_path = ''
begin atomic
  select app_private.record_visit_quality_review(
    p_tenant, p_report, p_expected_revision, p_status, p_category, p_owner, p_operation
  );
end;

revoke all on function app_private.list_visit_quality_reviews(uuid,date,text,integer),
  app_private.record_visit_quality_review(uuid,uuid,integer,text,text,uuid,uuid),
  public.list_visit_quality_reviews(uuid,date,text,integer),
  public.record_visit_quality_review(uuid,uuid,integer,text,text,uuid,uuid) from public, anon, authenticated;
grant execute on function app_private.list_visit_quality_reviews(uuid,date,text,integer),
  app_private.record_visit_quality_review(uuid,uuid,integer,text,text,uuid,uuid),
  public.list_visit_quality_reviews(uuid,date,text,integer),
  public.record_visit_quality_review(uuid,uuid,integer,text,text,uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
