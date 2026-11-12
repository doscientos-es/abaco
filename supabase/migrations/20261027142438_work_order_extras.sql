-- A work extra is a historical offer, separate from the accepted estimate.
-- Financial terms are visible only to office administrators. A later invoice
-- origin must reference an approved row, never infer approval from its presence.
create table public.work_order_extras (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  tenant_id uuid not null,
  work_order_id uuid not null,
  description text not null check (char_length(description) between 1 and 500),
  quantity numeric(12, 3) not null check (quantity > 0),
  unit text not null check (char_length(unit) between 1 and 30),
  unit_price_cents bigint not null check (unit_price_cents > 0),
  unit_cost_cents bigint not null check (unit_cost_cents >= 0),
  vat_rate numeric(5, 2) not null check (vat_rate between 0 and 100),
  price_cents bigint generated always as
    (round(quantity * unit_price_cents)::bigint) stored,
  planned_cost_cents bigint generated always as
    (round(quantity * unit_cost_cents)::bigint) stored,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  proposed_by uuid not null,
  proposed_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (id, tenant_id, work_order_id),
  foreign key (work_order_id, tenant_id)
    references public.work_orders (id, tenant_id) on delete restrict,
  check ((status = 'pending') = (decided_at is null))
);
create index work_order_extras_order_idx
  on public.work_order_extras (tenant_id, work_order_id, proposed_at desc);

create table public.work_extra_decisions (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  tenant_id uuid not null,
  work_order_id uuid not null,
  extra_id uuid not null unique,
  decision text not null check (decision in ('approved', 'rejected')),
  evidence_description text not null
    check (char_length(evidence_description) between 1 and 2000),
  evidence_mode text not null default 'office_manual'
    check (evidence_mode = 'office_manual'),
  customer_name text not null check (char_length(customer_name) between 1 and 200),
  decided_by uuid not null,
  decided_at timestamptz not null default now(),
  foreign key (extra_id, tenant_id, work_order_id)
    references public.work_order_extras (id, tenant_id, work_order_id)
    on delete restrict
);

alter table public.work_order_extras enable row level security;
alter table public.work_extra_decisions enable row level security;
revoke all on public.work_order_extras, public.work_extra_decisions
  from public, anon, authenticated;
grant select on public.work_order_extras, public.work_extra_decisions
  to authenticated, service_role;
create policy work_order_extras_select on public.work_order_extras
  for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin']::public.app_role[])
  );
create policy work_extra_decisions_select on public.work_extra_decisions
  for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin']::public.app_role[])
  );

create function public.protect_work_extra_terms() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if row(new.operation_id, new.tenant_id, new.work_order_id,
         new.description, new.quantity, new.unit, new.unit_price_cents,
         new.unit_cost_cents, new.vat_rate, new.proposed_by, new.proposed_at)
     is distinct from
     row(old.operation_id, old.tenant_id, old.work_order_id,
         old.description, old.quantity, old.unit, old.unit_price_cents,
         old.unit_cost_cents, old.vat_rate, old.proposed_by, old.proposed_at) then
    raise exception 'Las condiciones del extra son inmutables';
  end if;
  return new;
end;
$$;
create trigger work_order_extras_protect_terms
  before update on public.work_order_extras
  for each row execute function public.protect_work_extra_terms();
create trigger work_order_extras_no_delete
  before delete on public.work_order_extras
  for each row execute function public.reject_work_history_change();
create trigger work_extra_decisions_immutable
  before update or delete on public.work_extra_decisions
  for each row execute function public.reject_work_history_change();
revoke execute on function public.protect_work_extra_terms()
  from public, anon, authenticated;

create function public.propose_work_extra(
  p_tenant_id uuid, p_work_order_id uuid, p_description text,
  p_quantity numeric, p_unit text, p_unit_price_cents bigint,
  p_unit_cost_cents bigint, p_vat_rate numeric, p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  prior public.work_order_extras%rowtype;
  clean_description text := trim(p_description);
  clean_unit text := trim(p_unit);
  created_id uuid;
begin
  if p_tenant_id is null or p_work_order_id is null or p_operation_id is null
     or clean_description is null or char_length(clean_description) not between 1 and 500
     or clean_unit is null or char_length(clean_unit) not between 1 and 30
     or p_quantity is null or p_quantity <= 0 or p_quantity > 999999999.999
     or p_quantity <> round(p_quantity, 3)
     or p_unit_price_cents is null or p_unit_price_cents <= 0
     or p_unit_cost_cents is null or p_unit_cost_cents < 0
     or round(p_quantity * p_unit_price_cents) > 9000000000000000
     or round(p_quantity * p_unit_cost_cents) > 9000000000000000
     or p_vat_rate is null or p_vat_rate < 0 or p_vat_rate > 100
     or p_vat_rate <> round(p_vat_rate, 2) then
    raise exception 'Datos del extra inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para proponer extras' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_operation_id::text, 0)
  );
  select * into prior from public.work_order_extras
  where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.work_order_id <> p_work_order_id
       or prior.description <> clean_description or prior.quantity <> p_quantity
       or prior.unit <> clean_unit or prior.unit_price_cents <> p_unit_price_cents
       or prior.unit_cost_cents <> p_unit_cost_cents
       or prior.vat_rate <> p_vat_rate then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return prior.id;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede proponer extras' using errcode = 'P0402';
  end if;
  perform 1 from public.work_orders w
    where w.id = p_work_order_id and w.tenant_id = p_tenant_id
      and w.status not in ('completed', 'canceled')
    for update;
  if not found then
    raise exception 'Trabajo inexistente o cerrado' using errcode = 'P0409';
  end if;
  insert into public.work_order_extras (
    operation_id, tenant_id, work_order_id, description, quantity, unit,
    unit_price_cents, unit_cost_cents, vat_rate, proposed_by
  ) values (
    p_operation_id, p_tenant_id, p_work_order_id, clean_description,
    p_quantity, clean_unit, p_unit_price_cents, p_unit_cost_cents,
    p_vat_rate, (select auth.uid())
  ) returning id into created_id;
  return created_id;
end;
$$;
revoke all on function public.propose_work_extra(
  uuid, uuid, text, numeric, text, bigint, bigint, numeric, uuid
) from public, anon, authenticated;
grant execute on function public.propose_work_extra(
  uuid, uuid, text, numeric, text, bigint, bigint, numeric, uuid
) to authenticated;

create function public.decide_work_extra(
  p_tenant_id uuid, p_extra_id uuid, p_decision text,
  p_customer_name text, p_evidence_description text, p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  target public.work_order_extras%rowtype;
  prior public.work_extra_decisions%rowtype;
  clean_customer text := trim(p_customer_name);
  clean_evidence text := trim(p_evidence_description);
  created_id uuid;
begin
  if p_tenant_id is null or p_extra_id is null or p_operation_id is null
     or p_decision is null or p_decision not in ('approved', 'rejected')
     or clean_customer is null or char_length(clean_customer) not between 1 and 200
     or clean_evidence is null or char_length(clean_evidence) not between 1 and 2000 then
    raise exception 'Datos de decisión inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para decidir extras' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_operation_id::text, 0)
  );
  select * into prior from public.work_extra_decisions
  where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.extra_id <> p_extra_id
       or prior.decision <> p_decision or prior.customer_name <> clean_customer
       or prior.evidence_description <> clean_evidence then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return prior.id;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede decidir extras' using errcode = 'P0402';
  end if;
  select * into target from public.work_order_extras
  where id = p_extra_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Extra no encontrado' using errcode = 'P0002'; end if;
  if target.status <> 'pending' then
    raise exception 'El extra ya tiene una decisión' using errcode = 'P0409';
  end if;
  insert into public.work_extra_decisions (
    operation_id, tenant_id, work_order_id, extra_id, decision,
    evidence_description, customer_name, decided_by
  ) values (
    p_operation_id, p_tenant_id, target.work_order_id, target.id,
    p_decision, clean_evidence, clean_customer, (select auth.uid())
  ) returning id into created_id;
  update public.work_order_extras set status = p_decision, decided_at = now()
  where id = target.id;
  return created_id;
end;
$$;
revoke all on function public.decide_work_extra(
  uuid, uuid, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.decide_work_extra(
  uuid, uuid, text, text, text, uuid
) to authenticated;
