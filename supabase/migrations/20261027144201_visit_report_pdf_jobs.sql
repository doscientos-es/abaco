-- Closing a visit creates a durable PDF job in the same transaction as the
-- immutable report version. A service worker stores the customer projection.
alter table public.service_visit_report_versions
  add constraint service_visit_report_versions_identity_unique
  unique (id, tenant_id);

create table public.service_visit_report_pdf_jobs (
  report_version_id uuid primary key,
  tenant_id uuid not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'retry', 'ready', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default clock_timestamp(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error_code text,
  ready_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (report_version_id, tenant_id)
    references public.service_visit_report_versions(id, tenant_id) on delete restrict,
  check ((lease_token is null and lease_expires_at is null)
    or (lease_token is not null and lease_expires_at is not null)),
  check (status = 'processing' or lease_token is null),
  check ((status = 'ready') = (ready_at is not null))
);
create index service_visit_report_pdf_jobs_due_idx
  on public.service_visit_report_pdf_jobs (next_attempt_at, created_at)
  where status in ('queued', 'retry', 'processing');

alter table public.service_visit_report_pdf_jobs enable row level security;
revoke all on public.service_visit_report_pdf_jobs from public, anon, authenticated;
grant select (report_version_id, tenant_id, status, attempts,
  last_error_code, ready_at, created_at)
  on public.service_visit_report_pdf_jobs to authenticated;
grant all on public.service_visit_report_pdf_jobs to service_role;
create policy service_visit_report_pdf_jobs_office_read
  on public.service_visit_report_pdf_jobs for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
  );

create function public.enqueue_service_visit_report_pdf() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.service_visit_report_pdf_jobs (report_version_id, tenant_id)
    values (new.id, new.tenant_id);
  return new;
end;
$$;
create trigger service_visit_report_versions_enqueue_pdf
  after insert on public.service_visit_report_versions
  for each row execute function public.enqueue_service_visit_report_pdf();
revoke all on function public.enqueue_service_visit_report_pdf()
  from public, anon, authenticated;

-- Historical versions need a PDF too. Existing objects are detected by worker.
insert into public.service_visit_report_pdf_jobs (report_version_id, tenant_id)
select id, tenant_id from public.service_visit_report_versions
where true
on conflict (report_version_id) do nothing;

create function public.claim_service_visit_report_pdf_job()
returns setof public.service_visit_report_pdf_jobs
language plpgsql security definer set search_path = '' as $$
declare target_id uuid;
begin
  select report_version_id into target_id
    from public.service_visit_report_pdf_jobs
    where (status in ('queued', 'retry') and next_attempt_at <= clock_timestamp())
      or (status = 'processing' and lease_expires_at <= clock_timestamp())
    order by next_attempt_at, created_at, report_version_id
    for update skip locked limit 1;
  if not found then return; end if;
  return query update public.service_visit_report_pdf_jobs
    set status = 'processing', attempts = attempts + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = clock_timestamp() + interval '6 minutes'
    where report_version_id = target_id returning *;
end;
$$;
revoke all on function public.claim_service_visit_report_pdf_job()
  from public, anon, authenticated;
grant execute on function public.claim_service_visit_report_pdf_job() to service_role;

create function public.finish_service_visit_report_pdf_job(
  p_report_version_id uuid, p_lease_token uuid, p_ready boolean,
  p_error_code text default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare target public.service_visit_report_pdf_jobs%rowtype;
declare final_status text;
begin
  select * into target from public.service_visit_report_pdf_jobs
    where report_version_id = p_report_version_id
      and status = 'processing' and lease_token = p_lease_token for update;
  if not found then return false; end if;
  final_status := case when p_ready then 'ready'
    when target.attempts >= 8 then 'failed' else 'retry' end;
  update public.service_visit_report_pdf_jobs
    set status = final_status,
      next_attempt_at = case when final_status = 'retry'
        then clock_timestamp() + interval '1 minute'
          * least(60, power(2, target.attempts)::integer)
        else next_attempt_at end,
      lease_token = null, lease_expires_at = null,
      ready_at = case when final_status = 'ready' then clock_timestamp()
        else null end,
      last_error_code = case when final_status = 'ready' then null
        else left(coalesce(p_error_code, 'render_failed'), 80) end
    where report_version_id = p_report_version_id;
  return true;
end;
$$;
revoke all on function public.finish_service_visit_report_pdf_job(
  uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.finish_service_visit_report_pdf_job(
  uuid, uuid, boolean, text) to service_role;

create function public.retry_failed_service_visit_report_pdf_job(
  p_tenant_id uuid, p_report_version_id uuid
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role(p_tenant_id,
      array['owner', 'admin']::public.app_role[])
     or not public.tenant_can_write(p_tenant_id) then
    raise exception 'No autorizado para reintentar el PDF' using errcode = '42501';
  end if;
  update public.service_visit_report_pdf_jobs
    set status = 'queued', attempts = 0,
      next_attempt_at = clock_timestamp(), last_error_code = null
    where tenant_id = p_tenant_id and report_version_id = p_report_version_id
      and status = 'failed';
  return found;
end;
$$;
revoke all on function public.retry_failed_service_visit_report_pdf_job(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.retry_failed_service_visit_report_pdf_job(uuid, uuid)
  to authenticated;

-- A database cron invokes the Vercel Python worker. URL is environment scoped.
create function public.run_visit_report_pdf_dispatch() returns void
language plpgsql security definer set search_path = '' as $$
declare secret text;
declare worker_url text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets
    where name = 'cron_secret' limit 1;
  select decrypted_secret into worker_url from vault.decrypted_secrets
    where name = 'visit_report_pdf_worker_url' limit 1;
  if secret is null or worker_url is null
     or worker_url !~ '^https://[a-z0-9.-]+/api/visit_report_pdf_worker$' then
    raise warning 'run_visit_report_pdf_dispatch: faltan secretos del trabajador en Vault';
    return;
  end if;
  perform net.http_post(
    url := worker_url,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret),
    body := '{}'::jsonb
  );
end;
$$;
revoke all on function public.run_visit_report_pdf_dispatch()
  from public, anon, authenticated;
select cron.schedule('visit-report-pdf-dispatch', '* * * * *',
  'select public.run_visit_report_pdf_dispatch()');
