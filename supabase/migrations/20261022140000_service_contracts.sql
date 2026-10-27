-- M12: a contract holds commercial terms separately from technician visits.
-- The rule months and local start time are interpreted in the contract timezone.
create table public.service_contracts (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  tenant_id uuid not null,
  client_id uuid not null,
  location_id uuid not null,
  asset_id uuid,
  origin_estimate_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'expired', 'canceled')),
  starts_on date not null,
  ends_on date,
  timezone text not null,
  price_cents bigint not null check (price_cents between 0 and 9000000000000000),
  billing_frequency text not null
    check (billing_frequency in ('monthly', 'quarterly', 'yearly')),
  renewal_mode text not null default 'manual'
    check (renewal_mode in ('manual', 'automatic')),
  renewal_notice_days integer not null default 30
    check (renewal_notice_days between 0 and 365),
  included_scope jsonb not null default '[]'::jsonb
    check (jsonb_typeof(included_scope) = 'array'),
  extras_policy jsonb not null default '{}'::jsonb
    check (jsonb_typeof(extras_policy) = 'object'),
  source_snapshot jsonb not null
    check (jsonb_typeof(source_snapshot) = 'object'),
  default_assigned_user_id uuid,
  schedule_version integer not null default 1 check (schedule_version > 0),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (id, tenant_id, client_id),
  foreign key (client_id, tenant_id)
    references public.clients (id, tenant_id) on delete restrict,
  foreign key (location_id, tenant_id, client_id)
    references public.service_locations (id, tenant_id, client_id) on delete restrict,
  foreign key (asset_id, tenant_id, location_id)
    references public.service_assets (id, tenant_id, location_id) on delete restrict,
  foreign key (origin_estimate_id, tenant_id)
    references public.estimates (id, tenant_id) on delete restrict,
  foreign key (tenant_id, default_assigned_user_id)
    references public.memberships (tenant_id, user_id) on delete restrict,
  check (ends_on is null or ends_on >= starts_on)
);
create index service_contracts_tenant_status_idx
  on public.service_contracts (tenant_id, status, starts_on);
create index service_contracts_client_idx
  on public.service_contracts (tenant_id, client_id, created_at desc);
create index service_contracts_location_idx
  on public.service_contracts (location_id);
create index service_contracts_asset_idx
  on public.service_contracts (asset_id) where asset_id is not null;

create table public.service_contract_visit_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contract_id uuid not null,
  season text not null check (season in ('high', 'low')),
  months smallint[] not null,
  weekday smallint not null check (weekday between 1 and 7),
  every_n_weeks smallint not null default 1
    check (every_n_weeks between 1 and 12),
  local_start time without time zone not null,
  duration_minutes smallint not null
    check (duration_minutes between 15 and 720),
  title text not null check (char_length(title) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (id, tenant_id, contract_id),
  unique (contract_id, season, weekday),
  foreign key (contract_id, tenant_id)
    references public.service_contracts (id, tenant_id) on delete restrict,
  check (cardinality(months) between 1 and 12)
);
create index service_contract_rules_contract_idx
  on public.service_contract_visit_rules (tenant_id, contract_id);

create table public.service_contract_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  tenant_id uuid not null,
  contract_id uuid not null,
  kind text not null check (kind in ('created', 'rule_added', 'status_changed')),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  actor_id uuid not null,
  occurred_at timestamptz not null default now(),
  foreign key (contract_id, tenant_id)
    references public.service_contracts (id, tenant_id) on delete restrict
);
create index service_contract_events_contract_idx
  on public.service_contract_events (tenant_id, contract_id, occurred_at desc);
create trigger service_contract_events_immutable
  before update or delete on public.service_contract_events
  for each row execute function public.reject_work_history_change();

alter table public.service_contracts enable row level security;
alter table public.service_contract_visit_rules enable row level security;
alter table public.service_contract_events enable row level security;
revoke all on public.service_contracts, public.service_contract_visit_rules,
  public.service_contract_events from public, anon, authenticated;
grant select on public.service_contracts, public.service_contract_visit_rules,
  public.service_contract_events to authenticated, service_role;
create policy service_contracts_select on public.service_contracts
  for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
  );
create policy service_contract_rules_select on public.service_contract_visit_rules
  for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
  );
create policy service_contract_events_select on public.service_contract_events
  for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
  );

create function public.touch_service_contract_version() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;
create trigger service_contracts_touch
  before update on public.service_contracts
  for each row execute function public.touch_service_contract_version();
revoke execute on function public.touch_service_contract_version()
  from public, anon, authenticated;

create function public.create_manual_service_contract(
  p_tenant_id uuid, p_client_id uuid, p_location_id uuid, p_asset_id uuid,
  p_title text, p_starts_on date, p_ends_on date, p_price_cents bigint,
  p_billing_frequency text, p_default_assigned_user_id uuid,
  p_included_scope jsonb, p_extras_policy jsonb, p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  prior public.service_contracts%rowtype;
  location_timezone text;
  clean_title text := trim(p_title);
  clean_scope jsonb := coalesce(p_included_scope, '[]'::jsonb);
  clean_extras jsonb := coalesce(p_extras_policy, '{}'::jsonb);
  created_id uuid;
begin
  if p_tenant_id is null or p_client_id is null or p_location_id is null
     or p_operation_id is null or clean_title is null
     or char_length(clean_title) not between 1 and 200
     or p_starts_on is null or (p_ends_on is not null and p_ends_on < p_starts_on)
     or p_price_cents is null or p_price_cents not between 0 and 9000000000000000
     or p_billing_frequency is null
     or p_billing_frequency not in ('monthly', 'quarterly', 'yearly')
     or pg_catalog.jsonb_typeof(clean_scope) <> 'array'
     or pg_catalog.jsonb_typeof(clean_extras) <> 'object' then
    raise exception 'Datos de contrato inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para crear contratos'
      using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_operation_id::text, 0)
  );
  select * into prior from public.service_contracts where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.client_id <> p_client_id
       or prior.location_id <> p_location_id
       or prior.asset_id is distinct from p_asset_id
       or prior.title <> clean_title or prior.starts_on <> p_starts_on
       or prior.ends_on is distinct from p_ends_on
       or prior.price_cents <> p_price_cents
       or prior.billing_frequency <> p_billing_frequency
       or prior.default_assigned_user_id is distinct from p_default_assigned_user_id
       or prior.included_scope <> clean_scope
       or prior.extras_policy <> clean_extras then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return prior.id;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede crear contratos' using errcode = 'P0402';
  end if;
  if not exists (
    select 1 from public.clients c
    where c.id = p_client_id and c.tenant_id = p_tenant_id and c.archived_at is null
  ) then
    raise exception 'Cliente no disponible' using errcode = 'P0002';
  end if;
  select l.timezone into location_timezone
  from public.service_locations l
  where l.id = p_location_id and l.tenant_id = p_tenant_id
    and l.client_id = p_client_id and l.active;
  if not found then raise exception 'Ubicación no disponible' using errcode = 'P0409'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names
    where name = location_timezone) then
    raise exception 'Zona horaria de la ubicación inválida' using errcode = '22023';
  end if;
  if p_asset_id is not null and not exists (
    select 1 from public.service_assets a
    where a.id = p_asset_id and a.tenant_id = p_tenant_id
      and a.location_id = p_location_id and a.status <> 'retired'
  ) then
    raise exception 'Activo no disponible' using errcode = 'P0409';
  end if;
  if p_default_assigned_user_id is not null and not exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant_id and m.user_id = p_default_assigned_user_id
      and m.role = 'technician'
  ) then
    raise exception 'Técnico no disponible' using errcode = 'P0409';
  end if;
  insert into public.service_contracts (
    operation_id, tenant_id, client_id, location_id, asset_id, title,
    starts_on, ends_on, timezone, price_cents, billing_frequency,
    default_assigned_user_id, included_scope, extras_policy,
    source_snapshot, created_by
  ) values (
    p_operation_id, p_tenant_id, p_client_id, p_location_id, p_asset_id,
    clean_title, p_starts_on, p_ends_on, location_timezone,
    p_price_cents, p_billing_frequency, p_default_assigned_user_id,
    clean_scope, clean_extras,
    pg_catalog.jsonb_build_object('origin', 'manual'), (select auth.uid())
  ) returning id into created_id;
  insert into public.service_contract_events (
    operation_id, tenant_id, contract_id, kind, payload, actor_id
  ) values (
    p_operation_id, p_tenant_id, created_id, 'created',
    pg_catalog.jsonb_build_object(
      'startsOn', p_starts_on, 'endsOn', p_ends_on,
      'priceCents', p_price_cents, 'billingFrequency', p_billing_frequency
    ),
    (select auth.uid())
  );
  return created_id;
end;
$$;
revoke all on function public.create_manual_service_contract(
  uuid, uuid, uuid, uuid, text, date, date, bigint,
  text, uuid, jsonb, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.create_manual_service_contract(
  uuid, uuid, uuid, uuid, text, date, date, bigint,
  text, uuid, jsonb, jsonb, uuid
) to authenticated;

create function public.add_contract_visit_rule(
  p_tenant_id uuid, p_contract_id uuid, p_expected_updated_at timestamptz,
  p_season text, p_months smallint[], p_weekday smallint,
  p_every_n_weeks smallint, p_local_start time without time zone,
  p_duration_minutes smallint, p_title text, p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  target public.service_contracts%rowtype;
  prior public.service_contract_events%rowtype;
  prior_rule public.service_contract_visit_rules%rowtype;
  clean_months smallint[];
  clean_title text := trim(p_title);
  created_id uuid;
begin
  if p_tenant_id is null or p_contract_id is null
     or p_expected_updated_at is null or p_operation_id is null
     or p_season is null or p_season not in ('high', 'low')
     or p_months is null or cardinality(p_months) not between 1 and 12
     or exists (select 1 from pg_catalog.unnest(p_months) month_number
       where month_number is null or month_number not between 1 and 12)
     or p_weekday is null or p_weekday not between 1 and 7
     or p_every_n_weeks is null or p_every_n_weeks not between 1 and 12
     or p_local_start is null or p_duration_minutes is null
     or p_duration_minutes not between 15 and 720
     or clean_title is null or char_length(clean_title) not between 1 and 200 then
    raise exception 'Datos de frecuencia inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para cambiar contratos'
      using errcode = '42501';
  end if;
  select pg_catalog.array_agg(distinct month_number order by month_number)
    into clean_months from pg_catalog.unnest(p_months) month_number;
  select * into target from public.service_contracts
  where id = p_contract_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Contrato no encontrado' using errcode = 'P0002'; end if;
  select * into prior from public.service_contract_events
  where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.contract_id <> p_contract_id
       or prior.kind <> 'rule_added' then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    select * into prior_rule from public.service_contract_visit_rules
    where id = (prior.payload->>'ruleId')::uuid;
    if not found or prior_rule.season <> p_season
       or prior_rule.months <> clean_months
       or prior_rule.weekday <> p_weekday
       or prior_rule.every_n_weeks <> p_every_n_weeks
       or prior_rule.local_start <> p_local_start
       or prior_rule.duration_minutes <> p_duration_minutes
       or prior_rule.title <> clean_title then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return prior_rule.id;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede cambiar contratos' using errcode = 'P0402';
  end if;
  if target.updated_at <> p_expected_updated_at then
    raise exception 'El contrato cambió en otra sesión; recarga la ficha'
      using errcode = 'P0409';
  end if;
  if target.status <> 'draft' then
    raise exception 'La frecuencia de un contrato activo requiere una revisión'
      using errcode = 'P0409';
  end if;
  if exists (
    select 1 from public.service_contract_visit_rules r
    where r.contract_id = p_contract_id and r.season <> p_season
      and r.months && clean_months
  ) then
    raise exception 'Las temporadas se solapan' using errcode = 'P0409';
  end if;
  insert into public.service_contract_visit_rules (
    tenant_id, contract_id, season, months, weekday,
    every_n_weeks, local_start, duration_minutes, title
  ) values (
    p_tenant_id, p_contract_id, p_season, clean_months, p_weekday,
    p_every_n_weeks, p_local_start, p_duration_minutes, clean_title
  ) returning id into created_id;
  insert into public.service_contract_events (
    operation_id, tenant_id, contract_id, kind, payload, actor_id
  ) values (
    p_operation_id, p_tenant_id, p_contract_id, 'rule_added',
    pg_catalog.jsonb_build_object('ruleId', created_id, 'season', p_season),
    (select auth.uid())
  );
  update public.service_contracts set updated_at = now() where id = p_contract_id;
  return created_id;
end;
$$;
revoke all on function public.add_contract_visit_rule(
  uuid, uuid, timestamptz, text, smallint[], smallint,
  smallint, time without time zone, smallint, text, uuid
) from public, anon, authenticated;
grant execute on function public.add_contract_visit_rule(
  uuid, uuid, timestamptz, text, smallint[], smallint,
  smallint, time without time zone, smallint, text, uuid
) to authenticated;
