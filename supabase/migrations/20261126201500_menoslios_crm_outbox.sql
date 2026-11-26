-- Keep the CRM handoff independent of signup, checkout, and Cal.com.
create table app_private.menoslios_crm_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app_private.company_onboarding(tenant_id) on delete cascade,
  kind text not null check (kind in ('registration', 'booking')),
  attempts integer not null default 0,
  due_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz,
  delivered_at timestamptz,
  unique (tenant_id, kind)
);
alter table app_private.menoslios_crm_outbox enable row level security;
revoke all on app_private.menoslios_crm_outbox from public, anon, authenticated, service_role;
create index menoslios_crm_outbox_pending on app_private.menoslios_crm_outbox(due_at)
  where delivered_at is null;

create function app_private.queue_menoslios_crm_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into app_private.menoslios_crm_outbox(tenant_id, kind)
  values (new.tenant_id, case tg_op when 'INSERT' then 'registration' else 'booking' end)
  on conflict (tenant_id,kind) do nothing;
  return new;
end;
$$;
revoke all on function app_private.queue_menoslios_crm_event() from public, anon, authenticated;
create trigger menoslios_crm_registration after insert on app_private.company_onboarding
  for each row execute function app_private.queue_menoslios_crm_event();
create trigger menoslios_crm_booking after update of booked_at on app_private.company_onboarding
  for each row when (old.booked_at is null and new.booked_at is not null)
  execute function app_private.queue_menoslios_crm_event();

-- Read only the CRM context. No fiscal data, Cal reference, card data or auth metadata is sent.
create function public.claim_menoslios_crm_event()
returns table (id uuid, lease_id uuid, payload jsonb)
language sql security definer set search_path = '' as $$
  with claimed as (
    update app_private.menoslios_crm_outbox j set lease_id = gen_random_uuid(),
      lease_until = now() + interval '3 minutes', attempts = attempts + 1
    where j.id = (
      select q.id from app_private.menoslios_crm_outbox q
      join app_private.company_onboarding o on o.tenant_id = q.tenant_id
      join auth.users u on u.id = o.owner_id
      where q.delivered_at is null and q.due_at <= now()
        and (q.lease_until is null or q.lease_until < now()) and u.email_confirmed_at is not null
        and nullif(trim(u.email), '') is not null
      order by q.due_at, q.id limit 1 for update of q skip locked
    ) returning j.*
  )
  select j.id, j.lease_id, jsonb_build_object(
    'tenantId', t.id, 'kind', j.kind, 'company', left(t.name,120),
    'name', coalesce(nullif(left(trim(u.raw_user_meta_data->>'full_name'),160),''),t.name),
    'email', lower(trim(u.email)),
    'booking', case when j.kind = 'booking' then jsonb_build_object(
      'start', o.appointment_at,
      'seats', coalesce(p.paid_seats,1),
      'interval', p.period,
      'modules', coalesce((select jsonb_agg(m.module_code order by m.module_code)
        from public.tenant_modules m where m.tenant_id = t.id and m.enabled
        and m.module_code in ('workers','procurement','ai')), '[]'::jsonb)
    ) end
  )
  from claimed j join app_private.company_onboarding o using (tenant_id)
  join public.tenants t on t.id = j.tenant_id join auth.users u on u.id = o.owner_id
  left join lateral (select b.period, b.seats as paid_seats from public.billing_payments b
    where b.tenant_id = t.id and b.kind = 'first' and b.status = 'succeeded'
    order by b.created_at desc, b.id desc limit 1) p on j.kind = 'booking';
$$;

create function public.finish_menoslios_crm_event(p_id uuid, p_lease uuid, p_delivered boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update app_private.menoslios_crm_outbox set lease_id = null, lease_until = null,
    delivered_at = case when p_delivered then now() end,
    due_at = now() + make_interval(mins => least(60, attempts * 2))
  where id = p_id and lease_id = p_lease;
  return found;
end;
$$;
revoke all on function public.claim_menoslios_crm_event() from public, anon, authenticated;
revoke all on function public.finish_menoslios_crm_event(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.claim_menoslios_crm_event() to service_role;
grant execute on function public.finish_menoslios_crm_event(uuid,uuid,boolean) to service_role;

create function app_private.dispatch_menoslios_crm_events() returns void
language plpgsql security definer set search_path = '' as $$
declare project_url text; secret text;
begin
  if not exists (select 1 from app_private.menoslios_crm_outbox where delivered_at is null
    and due_at <= now() and (lease_until is null or lease_until < now())) then return; end if;
  select decrypted_secret into project_url from vault.decrypted_secrets where name = 'abaco_project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  if project_url is null or secret is null then return; end if;
  perform net.http_post(url := rtrim(project_url,'/') || '/functions/v1/menoslios-crm',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',secret),
    body := '{}'::jsonb, timeout_milliseconds := 35000);
end;
$$;
revoke all on function app_private.dispatch_menoslios_crm_events() from public, anon, authenticated;
select cron.schedule('menoslios-crm', '* * * * *', 'select app_private.dispatch_menoslios_crm_events()');
notify pgrst, 'reload schema';
