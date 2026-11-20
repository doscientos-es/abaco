-- Google Calendar credentials stay server-side. A user only syncs visits they
-- are currently assigned to, and the Google events contain no client data.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table public.google_calendar_connections (
  tenant_id uuid not null,
  user_id uuid not null,
  status text not null default 'provisioning'
    check (status in ('connected', 'disconnected', 'reauthorize', 'provisioning')),
  calendar_id text,
  refresh_token_ciphertext text,
  last_synced_at timestamptz,
  sync_lease_token uuid,
  sync_lease_until timestamptz,
  last_error text check (last_error is null or last_error in (
    'google_unavailable', 'calendar_conflict', 'invalid_visit', 'reauthorize'
  )),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, user_id),
  foreign key (tenant_id, user_id) references public.memberships(tenant_id, user_id)
    on delete cascade,
  check (calendar_id is null or (char_length(calendar_id) between 1 and 1024
    and calendar_id <> 'primary')),
  check (
    (status = 'disconnected' and refresh_token_ciphertext is null)
    or (status in ('connected', 'reauthorize', 'provisioning')
      and refresh_token_ciphertext is not null)
  ),
  check (status <> 'connected' or calendar_id is not null)
);

create table public.google_calendar_oauth_states (
  state_hash text primary key check (state_hash ~ '^[A-Za-z0-9_-]{43}$'),
  tenant_id uuid not null,
  user_id uuid not null,
  code_verifier text not null check (code_verifier ~ '^[A-Za-z0-9_-]{43}$'),
  return_origin text not null check (char_length(return_origin) between 1 and 512),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (tenant_id, user_id) references public.memberships(tenant_id, user_id)
    on delete cascade
);
create index google_calendar_oauth_states_expiry_idx
  on public.google_calendar_oauth_states(expires_at);

create table public.google_calendar_sync_events (
  tenant_id uuid not null,
  user_id uuid not null,
  visit_id uuid not null,
  calendar_id text not null check (char_length(calendar_id) between 1 and 1024
    and calendar_id <> 'primary'),
  event_id text not null check (event_id ~ '^[0-9a-v]{5,1024}$'),
  ownership_marker text not null check (ownership_marker ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, user_id, visit_id),
  unique (calendar_id, event_id),
  foreign key (tenant_id, user_id)
    references public.google_calendar_connections(tenant_id, user_id) on delete cascade
);

create table public.google_calendar_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  visit_id uuid not null,
  available_at timestamptz not null default clock_timestamp(),
  attempts integer not null default 0 check (attempts >= 0),
  lease_token uuid,
  lease_until timestamptz,
  last_error text check (last_error is null or last_error in (
    'google_unavailable', 'calendar_conflict', 'invalid_visit', 'reauthorize'
  )),
  created_at timestamptz not null default clock_timestamp(),
  generation bigint not null default 0 check (generation >= 0),
  unique (tenant_id, user_id, visit_id),
  foreign key (tenant_id, user_id)
    references public.google_calendar_connections(tenant_id, user_id) on delete cascade
);
create index google_calendar_sync_jobs_claim_idx
  on public.google_calendar_sync_jobs(available_at, lease_until, created_at);

alter table public.google_calendar_connections enable row level security;
alter table public.google_calendar_oauth_states enable row level security;
alter table public.google_calendar_sync_events enable row level security;
alter table public.google_calendar_sync_jobs enable row level security;
revoke all on public.google_calendar_connections, public.google_calendar_oauth_states,
  public.google_calendar_sync_events, public.google_calendar_sync_jobs
  from public, anon, authenticated;
grant all on public.google_calendar_connections, public.google_calendar_oauth_states,
  public.google_calendar_sync_events, public.google_calendar_sync_jobs to service_role;

create function app_private.enqueue_google_calendar_visit(
  p_tenant_id uuid, p_user_id uuid, p_visit_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_tenant_id is null or p_user_id is null or p_visit_id is null then return; end if;
  insert into public.google_calendar_sync_jobs(tenant_id, user_id, visit_id)
    select p_tenant_id, p_user_id, p_visit_id
    where exists (
      select 1 from public.google_calendar_connections c
      where c.tenant_id = p_tenant_id and c.user_id = p_user_id
        and c.status = 'connected'
    )
      and (
        exists (select 1 from public.memberships m
          where m.tenant_id = p_tenant_id and m.user_id = p_user_id
            and m.role in ('user', 'technician'))
        or exists (select 1 from public.google_calendar_sync_events e
          where e.tenant_id = p_tenant_id and e.user_id = p_user_id
            and e.visit_id = p_visit_id)
      )
    on conflict (tenant_id, user_id, visit_id) do update
      set available_at = clock_timestamp(), generation = google_calendar_sync_jobs.generation + 1,
        last_error = null;
end;
$$;
revoke all on function app_private.enqueue_google_calendar_visit(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create function app_private.enqueue_google_calendar_assignment(
  p_tenant_id uuid, p_visit_id uuid, p_assigned_user_id uuid, p_work_team_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare person record;
begin
  if p_assigned_user_id is not null then
    perform app_private.enqueue_google_calendar_visit(p_tenant_id, p_assigned_user_id, p_visit_id);
  end if;
  if p_work_team_id is not null then
    for person in select m.user_id from public.work_team_members m
      where m.tenant_id = p_tenant_id and m.team_id = p_work_team_id
    loop
      perform app_private.enqueue_google_calendar_visit(p_tenant_id, person.user_id, p_visit_id);
    end loop;
  end if;
end;
$$;
revoke all on function app_private.enqueue_google_calendar_assignment(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create function app_private.enqueue_google_calendar_visit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    perform app_private.enqueue_google_calendar_assignment(
      old.tenant_id, old.id, old.assigned_user_id, old.work_team_id
    );
  end if;
  if tg_op <> 'DELETE' then
    perform app_private.enqueue_google_calendar_assignment(
      new.tenant_id, new.id, new.assigned_user_id, new.work_team_id
    );
  end if;
  return null;
end;
$$;
revoke all on function app_private.enqueue_google_calendar_visit_change()
  from public, anon, authenticated, service_role;
create trigger service_visits_google_calendar_insert
  after insert on public.service_visits
  for each row execute function app_private.enqueue_google_calendar_visit_change();
create trigger service_visits_google_calendar_update
  after update of assigned_user_id, work_team_id, scheduled_start_at, scheduled_end_at,
    status, location_id on public.service_visits
  for each row execute function app_private.enqueue_google_calendar_visit_change();
create trigger service_visits_google_calendar_delete
  after delete on public.service_visits
  for each row execute function app_private.enqueue_google_calendar_visit_change();

create function app_private.enqueue_google_calendar_team_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare tenant uuid; team uuid; person uuid; visit record;
begin
  tenant := case when tg_op = 'DELETE' then old.tenant_id else new.tenant_id end;
  team := case when tg_op = 'DELETE' then old.team_id else new.team_id end;
  person := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  for visit in select v.id from public.service_visits v
    where v.tenant_id = tenant and v.work_team_id = team
  loop
    perform app_private.enqueue_google_calendar_visit(tenant, person, visit.id);
  end loop;
  return null;
end;
$$;
revoke all on function app_private.enqueue_google_calendar_team_change()
  from public, anon, authenticated, service_role;
create trigger work_team_members_google_calendar
  after insert or delete on public.work_team_members
  for each row execute function app_private.enqueue_google_calendar_team_change();

create function app_private.enqueue_google_calendar_role_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare visit record;
begin
  if new.role is not distinct from old.role then return null; end if;
  for visit in select v.id from public.service_visits v
    where v.tenant_id = new.tenant_id
      and (v.assigned_user_id = new.user_id or (v.assigned_user_id is null and exists (
        select 1 from public.work_team_members m
        where m.tenant_id = v.tenant_id and m.team_id = v.work_team_id
          and m.user_id = new.user_id
      )))
  loop
    perform app_private.enqueue_google_calendar_visit(new.tenant_id, new.user_id, visit.id);
  end loop;
  return null;
end;
$$;
revoke all on function app_private.enqueue_google_calendar_role_change()
  from public, anon, authenticated, service_role;
create trigger memberships_google_calendar_role_change
  after update of role on public.memberships
  for each row execute function app_private.enqueue_google_calendar_role_change();

create function app_private.enqueue_google_calendar_connection_visits() returns trigger
language plpgsql security definer set search_path = '' as $$
declare visit record;
begin
  if new.status <> 'connected' or new.calendar_id is null
    or new.refresh_token_ciphertext is null then return null; end if;
  for visit in select v.id from public.service_visits v
    where v.tenant_id = new.tenant_id
      and v.status in ('scheduled', 'in_progress')
      and (v.assigned_user_id = new.user_id or (v.assigned_user_id is null and exists (
        select 1 from public.work_team_members m
        where m.tenant_id = v.tenant_id and m.team_id = v.work_team_id
          and m.user_id = new.user_id
      )))
  loop
    perform app_private.enqueue_google_calendar_visit(new.tenant_id, new.user_id, visit.id);
  end loop;
  return null;
end;
$$;
revoke all on function app_private.enqueue_google_calendar_connection_visits()
  from public, anon, authenticated, service_role;
create trigger google_calendar_connection_backfill
  after insert or update of status, calendar_id
  on public.google_calendar_connections
  for each row execute function app_private.enqueue_google_calendar_connection_visits();

create function public.authorize_google_calendar_actor(p_tenant_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_tenant_id is not null and p_user_id is not null and exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant_id and m.user_id = p_user_id
      and m.role in ('user', 'technician')
  );
$$;
revoke all on function public.authorize_google_calendar_actor(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.authorize_google_calendar_actor(uuid, uuid) to service_role;

create function public.save_google_calendar_oauth_state(
  p_state_hash text, p_tenant_id uuid, p_user_id uuid, p_code_verifier text,
  p_return_origin text, p_expires_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role'
    or not public.authorize_google_calendar_actor(p_tenant_id, p_user_id)
    or p_expires_at <= clock_timestamp()
    or p_expires_at > clock_timestamp() + interval '10 minutes' then
    raise exception 'No se puede iniciar la conexión de Calendar' using errcode = '42501';
  end if;
  delete from public.google_calendar_oauth_states where expires_at <= clock_timestamp();
  insert into public.google_calendar_oauth_states
    (state_hash, tenant_id, user_id, code_verifier, return_origin, expires_at)
  values (p_state_hash, p_tenant_id, p_user_id, p_code_verifier, p_return_origin, p_expires_at);
end;
$$;
revoke all on function public.save_google_calendar_oauth_state(text, uuid, uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.save_google_calendar_oauth_state(text, uuid, uuid, text, text, timestamptz)
  to service_role;

create function public.consume_google_calendar_oauth_state(p_state_hash text)
returns table(tenant_id uuid, user_id uuid, code_verifier text, return_origin text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return query delete from public.google_calendar_oauth_states s
    where s.state_hash = p_state_hash and s.expires_at > clock_timestamp()
    returning s.tenant_id, s.user_id, s.code_verifier, s.return_origin, s.expires_at;
end;
$$;
revoke all on function public.consume_google_calendar_oauth_state(text)
  from public, anon, authenticated;
grant execute on function public.consume_google_calendar_oauth_state(text) to service_role;

create function public.save_google_calendar_connection_token(
  p_tenant_id uuid, p_user_id uuid, p_refresh_token_ciphertext text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role'
    or not public.authorize_google_calendar_actor(p_tenant_id, p_user_id)
    or p_refresh_token_ciphertext is null or char_length(p_refresh_token_ciphertext) > 4096 then
    raise exception 'No se puede guardar la conexión de Calendar' using errcode = '42501';
  end if;
  insert into public.google_calendar_connections
    (tenant_id, user_id, status, refresh_token_ciphertext, last_error,
      sync_lease_token, sync_lease_until, updated_at)
  values (p_tenant_id, p_user_id, 'provisioning', p_refresh_token_ciphertext, null,
    null, null, clock_timestamp())
  on conflict (tenant_id, user_id) do update set
    status = 'provisioning', refresh_token_ciphertext = excluded.refresh_token_ciphertext,
    last_error = null, sync_lease_token = null, sync_lease_until = null,
    updated_at = clock_timestamp();
end;
$$;
revoke all on function public.save_google_calendar_connection_token(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.save_google_calendar_connection_token(uuid, uuid, text) to service_role;

create function public.save_google_calendar_calendar_id(
  p_tenant_id uuid, p_user_id uuid, p_calendar_id text
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' or p_calendar_id is null
    or char_length(p_calendar_id) not between 1 and 1024 or p_calendar_id = 'primary'
    or not public.authorize_google_calendar_actor(p_tenant_id, p_user_id) then
    raise exception 'No se puede guardar el calendario de Calendar' using errcode = '42501';
  end if;
  update public.google_calendar_connections set calendar_id = p_calendar_id,
    updated_at = clock_timestamp()
    where tenant_id = p_tenant_id and user_id = p_user_id and status = 'provisioning'
      and refresh_token_ciphertext is not null
      and (calendar_id is null or calendar_id = p_calendar_id);
  return found;
end;
$$;
revoke all on function public.save_google_calendar_calendar_id(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.save_google_calendar_calendar_id(uuid, uuid, text)
  to service_role;

create function public.complete_google_calendar_connection(
  p_tenant_id uuid, p_user_id uuid, p_calendar_id text
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' or p_calendar_id is null
    or char_length(p_calendar_id) not between 1 and 1024 or p_calendar_id = 'primary'
    or not public.authorize_google_calendar_actor(p_tenant_id, p_user_id) then
    raise exception 'No se puede completar la conexión de Calendar' using errcode = '42501';
  end if;
  update public.google_calendar_connections set status = 'connected', calendar_id = p_calendar_id,
    last_error = null, updated_at = clock_timestamp()
    where tenant_id = p_tenant_id and user_id = p_user_id
      and status = 'provisioning' and refresh_token_ciphertext is not null
      and calendar_id = p_calendar_id;
  return found;
end;
$$;
revoke all on function public.complete_google_calendar_connection(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.complete_google_calendar_connection(uuid, uuid, text) to service_role;

create function public.rotate_google_calendar_refresh_token(
  p_tenant_id uuid, p_user_id uuid, p_previous text, p_next text
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' or p_next is null
    or char_length(p_next) > 4096
    or not exists (select 1 from public.memberships m
      where m.tenant_id = p_tenant_id and m.user_id = p_user_id) then
    raise exception 'No se puede renovar la conexión de Calendar' using errcode = '42501';
  end if;
  update public.google_calendar_connections set refresh_token_ciphertext = p_next,
    updated_at = clock_timestamp()
    where tenant_id = p_tenant_id and user_id = p_user_id
      and refresh_token_ciphertext = p_previous and status in ('connected', 'provisioning');
  return found;
end;
$$;
revoke all on function public.rotate_google_calendar_refresh_token(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.rotate_google_calendar_refresh_token(uuid, uuid, text, text)
  to service_role;

create function public.disconnect_google_calendar_connection(p_tenant_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role'
    or not public.authorize_google_calendar_actor(p_tenant_id, p_user_id) then
    raise exception 'No se puede desconectar este calendario' using errcode = '42501';
  end if;
  update public.google_calendar_connections set status = 'disconnected',
    refresh_token_ciphertext = null, last_error = null, sync_lease_token = null,
    sync_lease_until = null, updated_at = clock_timestamp()
    where tenant_id = p_tenant_id and user_id = p_user_id;
  if not found then return false; end if;
  delete from public.google_calendar_sync_jobs
    where tenant_id = p_tenant_id and user_id = p_user_id;
  return true;
end;
$$;
revoke all on function public.disconnect_google_calendar_connection(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.disconnect_google_calendar_connection(uuid, uuid) to service_role;

create function public.disconnect_my_google_calendar(p_tenant_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_tenant_id is null or not public.has_role(
    p_tenant_id, array['user', 'technician']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para desconectar este calendario' using errcode = '42501';
  end if;
  update public.google_calendar_connections set status = 'disconnected',
    refresh_token_ciphertext = null, last_error = null, sync_lease_token = null,
    sync_lease_until = null, updated_at = clock_timestamp()
    where tenant_id = p_tenant_id and user_id = auth.uid();
  if not found then return false; end if;
  delete from public.google_calendar_sync_jobs
    where tenant_id = p_tenant_id and user_id = auth.uid();
  return true;
end;
$$;
revoke all on function public.disconnect_my_google_calendar(uuid)
  from public, anon;
grant execute on function public.disconnect_my_google_calendar(uuid) to authenticated;

create function public.queue_my_google_calendar_sync(p_tenant_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare queued integer;
begin
  if auth.uid() is null or p_tenant_id is null or not public.has_role(
    p_tenant_id, array['user', 'technician']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para sincronizar este calendario' using errcode = '42501';
  end if;
  if not exists (select 1 from public.google_calendar_connections c
    where c.tenant_id = p_tenant_id and c.user_id = auth.uid() and c.status = 'connected') then
    raise exception 'Conecta Google Calendar antes de sincronizar' using errcode = 'P0002';
  end if;
  insert into public.google_calendar_sync_jobs(tenant_id, user_id, visit_id)
    select distinct visits.tenant_id, auth.uid(), visits.visit_id
    from (
      select v.tenant_id, v.id as visit_id from public.service_visits v
      where v.tenant_id = p_tenant_id and v.status in ('scheduled', 'in_progress')
        and (v.assigned_user_id = auth.uid() or (v.assigned_user_id is null and exists (
          select 1 from public.work_team_members m
          where m.tenant_id = v.tenant_id and m.team_id = v.work_team_id
            and m.user_id = auth.uid()
        )))
      union all
      select e.tenant_id, e.visit_id from public.google_calendar_sync_events e
      where e.tenant_id = p_tenant_id and e.user_id = auth.uid()
    ) visits
    on conflict (tenant_id, user_id, visit_id) do update
      set available_at = clock_timestamp(), generation = google_calendar_sync_jobs.generation + 1,
        last_error = null;
  get diagnostics queued = row_count;
  return queued;
end;
$$;
revoke all on function public.queue_my_google_calendar_sync(uuid)
  from public, anon, authenticated;
grant execute on function public.queue_my_google_calendar_sync(uuid) to authenticated;

create function public.claim_google_calendar_sync_job()
returns table(job_id uuid, tenant_id uuid, user_id uuid, visit_id uuid, lease_token uuid, generation bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return query
    with candidate as (
      select q.id, q.tenant_id, q.user_id from public.google_calendar_sync_jobs q
      join public.google_calendar_connections c
        on c.tenant_id = q.tenant_id and c.user_id = q.user_id
      where c.status = 'connected' and q.available_at <= clock_timestamp()
        and (q.lease_until is null or q.lease_until < clock_timestamp())
        and (c.sync_lease_until is null or c.sync_lease_until < clock_timestamp())
      order by q.available_at, q.created_at
      for update of q, c skip locked limit 1
    ), leased as (
      update public.google_calendar_sync_jobs q
      set lease_token = gen_random_uuid(), lease_until = clock_timestamp() + interval '3 minutes',
        attempts = q.attempts + 1
      from candidate c where q.id = c.id
      returning q.id, q.tenant_id, q.user_id, q.visit_id, q.lease_token, q.generation
    ), connection_lease as (
      update public.google_calendar_connections c
      set sync_lease_token = l.lease_token,
        sync_lease_until = clock_timestamp() + interval '3 minutes'
      from leased l where c.tenant_id = l.tenant_id and c.user_id = l.user_id
      returning c.tenant_id, c.user_id
    )
    select l.id, l.tenant_id, l.user_id, l.visit_id, l.lease_token, l.generation
    from leased l join connection_lease c using (tenant_id, user_id);
end;
$$;
revoke all on function public.claim_google_calendar_sync_job()
  from public, anon, authenticated;
grant execute on function public.claim_google_calendar_sync_job() to service_role;

create function public.finish_google_calendar_sync_job(
  p_job_id uuid, p_lease_token uuid, p_generation bigint,
  p_error_code text default null, p_retry_seconds integer default 60
) returns boolean language plpgsql security definer set search_path = '' as $$
declare target public.google_calendar_sync_jobs%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_job_id is null or p_lease_token is null or p_generation is null
    or (p_error_code is not null and p_error_code not in (
      'google_unavailable', 'calendar_conflict', 'invalid_visit', 'reauthorize'
    )) then
    raise exception 'Datos de sincronización inválidos' using errcode = '22023';
  end if;
  select * into target from public.google_calendar_sync_jobs q
    where q.id = p_job_id and q.lease_token = p_lease_token for update;
  if not found then return false; end if;
  if p_error_code = 'reauthorize' then
    update public.google_calendar_connections set status = 'reauthorize',
      last_error = p_error_code, sync_lease_token = null, sync_lease_until = null,
      updated_at = clock_timestamp()
      where tenant_id = target.tenant_id and user_id = target.user_id;
    delete from public.google_calendar_sync_jobs
      where tenant_id = target.tenant_id and user_id = target.user_id;
  elsif p_error_code in ('calendar_conflict', 'invalid_visit') then
    delete from public.google_calendar_sync_jobs where id = target.id;
    update public.google_calendar_connections set last_error = p_error_code,
      sync_lease_token = null, sync_lease_until = null, updated_at = clock_timestamp()
      where tenant_id = target.tenant_id and user_id = target.user_id and status = 'connected';
  elsif p_error_code = 'google_unavailable' then
    update public.google_calendar_sync_jobs set available_at = clock_timestamp()
      + pg_catalog.make_interval(secs => greatest(30, least(86400, coalesce(p_retry_seconds, 60)))),
      lease_token = null, lease_until = null, last_error = p_error_code
      where id = target.id;
    update public.google_calendar_connections set last_error = p_error_code,
      sync_lease_token = null, sync_lease_until = null,
      updated_at = clock_timestamp()
      where tenant_id = target.tenant_id and user_id = target.user_id and status = 'connected';
  elsif target.generation = p_generation then
    delete from public.google_calendar_sync_jobs where id = target.id;
    update public.google_calendar_connections set last_synced_at = clock_timestamp(),
      last_error = null, sync_lease_token = null, sync_lease_until = null,
      updated_at = clock_timestamp()
      where tenant_id = target.tenant_id and user_id = target.user_id and status = 'connected';
  else
    update public.google_calendar_sync_jobs set available_at = clock_timestamp(),
      lease_token = null, lease_until = null, last_error = null
      where id = target.id;
    update public.google_calendar_connections set last_error = null,
      sync_lease_token = null, sync_lease_until = null, updated_at = clock_timestamp()
      where tenant_id = target.tenant_id and user_id = target.user_id and status = 'connected';
  end if;
  return true;
end;
$$;
revoke all on function public.finish_google_calendar_sync_job(uuid, uuid, bigint, text, integer)
  from public, anon, authenticated;
grant execute on function public.finish_google_calendar_sync_job(uuid, uuid, bigint, text, integer)
  to service_role;

do $$ begin
  if not exists (select 1 from vault.secrets where name = 'google_calendar_sync_cron_secret') then
    perform vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text,
      'google_calendar_sync_cron_secret');
  end if;
end $$;

create function public.authorize_google_calendar_sync_worker(p_secret text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_secret is not null and length(p_secret) between 32 and 256 and exists (
    select 1 from vault.decrypted_secrets
    where name = 'google_calendar_sync_cron_secret'
      and extensions.digest(decrypted_secret, 'sha256') = extensions.digest(p_secret, 'sha256')
  );
$$;
revoke all on function public.authorize_google_calendar_sync_worker(text)
  from public, anon, authenticated;
grant execute on function public.authorize_google_calendar_sync_worker(text) to service_role;

create function public.run_google_calendar_sync_worker() returns void
language plpgsql security definer set search_path = '' as $$
declare secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets
    where name = 'google_calendar_sync_cron_secret' limit 1;
  if secret is null then
    raise warning 'google calendar sync worker is not configured';
    return;
  end if;
  perform net.http_post(
    url := 'https://vqyicgarlksirpzrngut.supabase.co/functions/v1/google-calendar-sync-worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb
  );
end;
$$;
revoke all on function public.run_google_calendar_sync_worker()
  from public, anon, authenticated;
select cron.unschedule('google-calendar-sync')
  where exists (select 1 from cron.job where jobname = 'google-calendar-sync');
select cron.schedule('google-calendar-sync', '* * * * *',
  'select public.run_google_calendar_sync_worker()');
