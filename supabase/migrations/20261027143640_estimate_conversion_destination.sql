-- The destination and recurrence term form part of the immutable proposal.
alter table public.estimates
  add column conversion_destination text not null default 'work'
    check (conversion_destination in ('work', 'contract')),
  add column contract_billing_frequency text not null default 'monthly'
    check (contract_billing_frequency in ('monthly', 'quarterly', 'yearly'));

alter function public.estimate_publication_snapshot(uuid)
  rename to estimate_publication_snapshot_legacy;
create function public.estimate_publication_snapshot(p_estimate_id uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      public.estimate_publication_snapshot_legacy(p_estimate_id),
      '{estimate,conversion_destination}', pg_catalog.to_jsonb(e.conversion_destination), true
    ),
    '{estimate,contract_billing_frequency}', pg_catalog.to_jsonb(e.contract_billing_frequency), true
  )
  from public.estimates e where e.id = p_estimate_id;
$$;
revoke all on function public.estimate_publication_snapshot(uuid)
  from public, anon, authenticated;

-- Claims are inserted by destination triggers. The primary key arbitrates concurrent
-- conversions and prevents even privileged direct inserts from creating both targets.
create table public.estimate_conversion_destinations (
  tenant_id uuid not null,
  estimate_id uuid not null,
  destination text not null check (destination in ('work', 'contract')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, estimate_id),
  unique (tenant_id, destination, target_id),
  foreign key (estimate_id, tenant_id)
    references public.estimates (id, tenant_id) on delete restrict
);
alter table public.estimate_conversion_destinations enable row level security;
revoke all on public.estimate_conversion_destinations from public, anon, authenticated;
grant select on public.estimate_conversion_destinations to authenticated, service_role;
create policy estimate_conversion_destinations_select
  on public.estimate_conversion_destinations for select to authenticated
  using (public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[]));

insert into public.estimate_conversion_destinations
  (tenant_id, estimate_id, destination, target_id)
select tenant_id, origin_estimate_id, 'work', id from public.work_orders
where origin_estimate_id is not null;
insert into public.estimate_conversion_destinations
  (tenant_id, estimate_id, destination, target_id)
select tenant_id, origin_estimate_id, 'contract', id from public.service_contracts
where origin_estimate_id is not null;

create function public.claim_estimate_conversion() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  claimed integer;
  published_destination text;
  target_destination text := case tg_table_name when 'work_orders' then 'work' else 'contract' end;
begin
  if new.origin_estimate_id is null then return new; end if;
  select coalesce(p.snapshot #>> '{estimate,conversion_destination}', 'work')
    into published_destination
  from public.estimate_publications p
  join public.estimates e on e.id = p.estimate_id and e.tenant_id = p.tenant_id
  where p.tenant_id = new.tenant_id and p.estimate_id = new.origin_estimate_id
    and e.status = 'accepted' and e.client_id = new.client_id;
  if published_destination is distinct from target_destination then
    raise exception 'El destino publicado no coincide con esta conversión'
      using errcode = 'P0409';
  end if;
  insert into public.estimate_conversion_destinations
    (tenant_id, estimate_id, destination, target_id)
  values (new.tenant_id, new.origin_estimate_id, target_destination, new.id)
  on conflict (tenant_id, estimate_id) do nothing;
  get diagnostics claimed = row_count;
  if claimed <> 1 then
    raise exception 'Este presupuesto ya se convirtió en otro destino'
      using errcode = 'P0409';
  end if;
  return new;
end;
$$;
create trigger work_orders_claim_estimate after insert on public.work_orders
  for each row execute function public.claim_estimate_conversion();
create trigger service_contracts_claim_estimate after insert on public.service_contracts
  for each row execute function public.claim_estimate_conversion();
revoke all on function public.claim_estimate_conversion()
  from public, anon, authenticated;

-- Preserve the existing accepted-copy and idempotency implementation while adding
-- the published-destination gate. Old publications have no destination and mean work.
alter function public.convert_accepted_estimate_to_work(uuid, uuid, uuid)
  rename to convert_accepted_estimate_to_work_legacy;
create function public.convert_accepted_estimate_to_work(
  p_tenant_id uuid, p_estimate_id uuid, p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare destination text;
begin
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para crear trabajos' using errcode = '42501';
  end if;
  select coalesce(p.snapshot #>> '{estimate,conversion_destination}', 'work')
    into destination from public.estimate_publications p
  where p.tenant_id = p_tenant_id and p.estimate_id = p_estimate_id;
  if destination = 'contract' then
    raise exception 'El destino publicado de este presupuesto es contrato'
      using errcode = 'P0409';
  end if;
  return public.convert_accepted_estimate_to_work_legacy(
    p_tenant_id, p_estimate_id, p_operation_id
  );
end;
$$;
revoke all on function public.convert_accepted_estimate_to_work(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.convert_accepted_estimate_to_work(uuid, uuid, uuid)
  to authenticated;
revoke all on function public.convert_accepted_estimate_to_work_legacy(uuid, uuid, uuid)
  from public, anon, authenticated;

create function public.convert_accepted_estimate_to_contract(
  p_tenant_id uuid, p_estimate_id uuid, p_location_id uuid, p_asset_id uuid,
  p_starts_on date, p_ends_on date, p_default_assigned_user_id uuid,
  p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  proposal public.estimates%rowtype;
  published public.estimate_publications%rowtype;
  manual public.estimate_manual_acceptances%rowtype;
  prior public.service_contracts%rowtype;
  destination public.estimate_conversion_destinations%rowtype;
  location_timezone text;
  frequency text;
  net_cents numeric;
  discount_cents numeric;
  price numeric;
  accepted_copy jsonb;
  scope jsonb;
  acceptance_mode text;
  created_id uuid;
begin
  if p_tenant_id is null or p_estimate_id is null or p_location_id is null
     or p_starts_on is null or p_operation_id is null
     or (p_ends_on is not null and p_ends_on < p_starts_on) then
    raise exception 'Datos de conversión inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para crear contratos' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_operation_id::text, 0)
  );
  select * into prior from public.service_contracts where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id
       or prior.origin_estimate_id is distinct from p_estimate_id
       or prior.location_id <> p_location_id
       or prior.asset_id is distinct from p_asset_id
       or prior.starts_on <> p_starts_on
       or prior.ends_on is distinct from p_ends_on
       or prior.default_assigned_user_id is distinct from p_default_assigned_user_id then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return prior.id;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede crear contratos' using errcode = 'P0402';
  end if;
  select * into proposal from public.estimates
  where id = p_estimate_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Presupuesto no encontrado' using errcode = 'P0002'; end if;
  if proposal.status <> 'accepted' then
    raise exception 'Solo se convierte un presupuesto aceptado' using errcode = 'P0409';
  end if;
  select * into published from public.estimate_publications
  where estimate_id = p_estimate_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'Falta la versión publicada del presupuesto' using errcode = 'P0409';
  end if;
  if published.snapshot #>> '{estimate,conversion_destination}' is distinct from 'contract' then
    raise exception 'El destino publicado de este presupuesto es trabajo'
      using errcode = 'P0409';
  end if;
  frequency := published.snapshot #>> '{estimate,contract_billing_frequency}';
  if frequency not in ('monthly', 'quarterly', 'yearly') then
    raise exception 'La periodicidad publicada es inválida' using errcode = 'P0409';
  end if;
  select * into destination from public.estimate_conversion_destinations
  where tenant_id = p_tenant_id and estimate_id = p_estimate_id;
  if found then
    if destination.destination = 'contract' then return destination.target_id; end if;
    raise exception 'Este presupuesto ya se convirtió en un trabajo'
      using errcode = 'P0409';
  end if;
  select l.timezone into location_timezone from public.service_locations l
  where l.id = p_location_id and l.tenant_id = p_tenant_id
    and l.client_id = proposal.client_id and l.active;
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

  select coalesce(sum(l.gross_cents - pg_catalog.round(
    l.gross_cents * l.discount_percent / 100
  )), 0) into net_cents
  from (
    select pg_catalog.round((line->>'quantity')::numeric *
      (line->>'unit_price_cents')::numeric) as gross_cents,
      (line->>'discount_percent')::numeric as discount_percent
    from pg_catalog.jsonb_array_elements(
      published.snapshot #> '{estimate,estimate_lines}'
    ) line
  ) l;
  discount_cents := case published.snapshot #>> '{estimate,discount_type}'
    when 'percent' then pg_catalog.round(net_cents *
      (published.snapshot #>> '{estimate,discount_value}')::numeric / 100)
    when 'amount' then least(net_cents,
      pg_catalog.round((published.snapshot #>> '{estimate,discount_value}')::numeric))
    else 0
  end;
  price := net_cents - discount_cents;
  if price not between 0 and 9000000000000000 then
    raise exception 'Precio publicado fuera de rango' using errcode = '22023';
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'description', line->>'description', 'quantity', line->'quantity',
    'unit', line->>'unit', 'kind', line->>'kind'
  )), '[]'::jsonb) into scope
  from pg_catalog.jsonb_array_elements(
    published.snapshot #> '{estimate,estimate_lines}'
  ) line;

  select * into manual from public.estimate_manual_acceptances
  where estimate_id = proposal.id and tenant_id = proposal.tenant_id;
  acceptance_mode := case when found then 'office_manual'
    when proposal.responded_at is null then 'legacy_unverified' else 'public_link' end;
  accepted_copy := published.snapshot || pg_catalog.jsonb_build_object(
    'acceptance', pg_catalog.jsonb_build_object(
      'mode', acceptance_mode, 'responded_at', proposal.responded_at,
      'responded_by', proposal.responded_by,
      'evidence_description', case when manual.estimate_id is not null
        then manual.evidence_description else null end,
      'recorded_by', manual.recorded_by
    ),
    'publication_source', published.source
  );
  insert into public.service_contracts (
    operation_id, tenant_id, client_id, location_id, asset_id,
    origin_estimate_id, title, starts_on, ends_on, timezone,
    price_cents, billing_frequency, included_scope, extras_policy,
    source_snapshot, default_assigned_user_id, created_by
  ) values (
    p_operation_id, p_tenant_id, proposal.client_id, p_location_id, p_asset_id,
    p_estimate_id, published.snapshot #>> '{estimate,title}', p_starts_on,
    p_ends_on, location_timezone, price::bigint, frequency,
    scope, '{}'::jsonb, accepted_copy, p_default_assigned_user_id,
    (select auth.uid())
  ) returning id into created_id;
  insert into public.service_contract_events (
    operation_id, tenant_id, contract_id, kind, payload, actor_id
  ) values (
    p_operation_id, p_tenant_id, created_id, 'created',
    pg_catalog.jsonb_build_object('estimate_id', p_estimate_id,
      'acceptance_mode', acceptance_mode), (select auth.uid())
  );
  return created_id;
end;
$$;
revoke all on function public.convert_accepted_estimate_to_contract(
  uuid, uuid, uuid, uuid, date, date, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.convert_accepted_estimate_to_contract(
  uuid, uuid, uuid, uuid, date, date, uuid, uuid
) to authenticated;


create or replace function public.issue_first_invoice_on_acceptance() returns trigger
language plpgsql set search_path = ''
as $$
declare
  first_milestone record;
  net_cents numeric;
  discount_cents numeric;
  subtotal_cents numeric;
  total_cents numeric;
  first_cents numeric;
begin
  -- Recurring offers are billed by contract rules, never by work milestones.
  if new.conversion_destination = 'contract' then return new; end if;
  if not (old.status = 'sent' and new.status = 'accepted'
          and old.responded_at is null and new.responded_at is not null) then
    return new;
  end if;

  select m.id, m.label, m.percent into first_milestone
  from public.estimate_milestones m
  where m.estimate_id = new.id and m.tenant_id = new.tenant_id
  order by m.position, m.id limit 1;
  if not found then return new; end if;

  select coalesce(sum(l.gross_cents - round(l.gross_cents * l.discount_percent / 100)), 0)
  into net_cents
  from (
    select round(quantity * unit_price_cents) as gross_cents, discount_percent
    from public.estimate_lines
    where estimate_id = new.id and tenant_id = new.tenant_id
  ) l;

  discount_cents := case new.discount_type
    when 'percent' then round(net_cents * new.discount_value / 100)
    when 'amount' then least(net_cents, round(new.discount_value))
    else 0
  end;
  subtotal_cents := net_cents - discount_cents;
  total_cents := subtotal_cents + round(subtotal_cents * new.vat_rate / 100);
  first_cents := round(total_cents * first_milestone.percent / 100);
  if first_cents <= 0 then return new; end if;

  if not exists (
    select 1 from public.invoices i
    where i.estimate_id = new.id and i.milestone_id = first_milestone.id
  ) then
    insert into public.invoices (
      tenant_id, estimate_id, milestone_id, client_id, concept, total_cents,
      vat_rate, status, issued_at, due_date
    ) values (
      new.tenant_id, new.id, first_milestone.id, new.client_id,
      new.title || ' · ' || coalesce(nullif(first_milestone.label, ''), 'Hito'),
      first_cents::bigint, new.vat_rate, 'issued', current_date, current_date + 15
    );
  end if;
  return new;
end;
$$;
