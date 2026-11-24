-- Membership permits inspection and disconnection; active company access is
-- additionally required to connect or synchronize.
create function public.is_google_calendar_member(p_tenant_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_tenant_id is not null and p_user_id is not null and exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant_id and m.user_id = p_user_id
  );
$$;
revoke all on function public.is_google_calendar_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_google_calendar_member(uuid, uuid) to service_role;

create or replace function public.authorize_google_calendar_actor(p_tenant_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_google_calendar_member(p_tenant_id, p_user_id)
    and public.tenant_can_write(p_tenant_id);
$$;

create or replace function app_private.enqueue_google_calendar_visit(
  p_tenant_id uuid, p_user_id uuid, p_visit_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_tenant_id is null or p_user_id is null or p_visit_id is null then return; end if;
  insert into public.google_calendar_sync_jobs(tenant_id, user_id, visit_id)
    select p_tenant_id, p_user_id, p_visit_id
    where exists (
      select 1 from public.google_calendar_connections c
      where c.tenant_id = p_tenant_id and c.user_id = p_user_id and c.status = 'connected'
    ) and (
      public.is_google_calendar_member(p_tenant_id, p_user_id)
      or exists (select 1 from public.google_calendar_sync_events e
        where e.tenant_id = p_tenant_id and e.user_id = p_user_id and e.visit_id = p_visit_id)
    )
    on conflict (tenant_id, user_id, visit_id) do update
      set available_at = clock_timestamp(), generation = google_calendar_sync_jobs.generation + 1,
        last_error = null;
end;
$$;

create or replace function public.disconnect_google_calendar_connection(p_tenant_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role'
    or not public.is_google_calendar_member(p_tenant_id, p_user_id) then
    raise exception 'No se puede desconectar este calendario' using errcode = '42501';
  end if;
  update public.google_calendar_connections set status = 'disconnected',
    refresh_token_ciphertext = null, last_error = null, sync_lease_token = null,
    sync_lease_until = null, updated_at = clock_timestamp()
    where tenant_id = p_tenant_id and user_id = p_user_id;
  if not found then return false; end if;
  delete from public.google_calendar_sync_jobs where tenant_id = p_tenant_id and user_id = p_user_id;
  return true;
end;
$$;

create or replace function public.disconnect_my_google_calendar(p_tenant_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_google_calendar_member(p_tenant_id, auth.uid()) then
    raise exception 'No tienes permiso para desconectar este calendario' using errcode = '42501';
  end if;
  update public.google_calendar_connections set status = 'disconnected',
    refresh_token_ciphertext = null, last_error = null, sync_lease_token = null,
    sync_lease_until = null, updated_at = clock_timestamp()
    where tenant_id = p_tenant_id and user_id = auth.uid();
  if not found then return false; end if;
  delete from public.google_calendar_sync_jobs where tenant_id = p_tenant_id and user_id = auth.uid();
  return true;
end;
$$;

create or replace function public.queue_my_google_calendar_sync(p_tenant_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare queued integer;
begin
  if not public.authorize_google_calendar_actor(p_tenant_id, auth.uid()) then
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
          select 1 from public.work_team_members m where m.tenant_id = v.tenant_id
            and m.team_id = v.work_team_id and m.user_id = auth.uid()
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

create or replace function public.claim_google_calendar_sync_job()
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
        and public.tenant_can_write(q.tenant_id)
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
      set sync_lease_token = l.lease_token, sync_lease_until = clock_timestamp() + interval '3 minutes'
      from leased l where c.tenant_id = l.tenant_id and c.user_id = l.user_id
      returning c.tenant_id, c.user_id
    )
    select l.id, l.tenant_id, l.user_id, l.visit_id, l.lease_token, l.generation
    from leased l join connection_lease c using (tenant_id, user_id);
end;
$$;
notify pgrst, 'reload schema';