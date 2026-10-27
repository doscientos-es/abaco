-- Accepted milestones create editable billing drafts. Numbering and the immutable
-- invoice snapshot happen only when an owner/admin explicitly issues a draft.
create table public.invoice_milestone_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  estimate_id uuid not null,
  milestone_id uuid not null,
  client_id uuid not null,
  concept text not null check (char_length(concept) between 1 and 200),
  total_cents bigint not null check (total_cents > 0),
  vat_rate numeric(5, 2) not null check (vat_rate between 0 and 100),
  due_date date not null,
  status text not null default 'draft' check (status in ('draft', 'issued')),
  revision integer not null default 1 check (revision > 0),
  issued_invoice_id uuid unique references public.invoices(id) on delete restrict,
  issue_operation_id uuid unique,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (estimate_id, milestone_id),
  foreign key (estimate_id, tenant_id)
    references public.estimates(id, tenant_id) on delete restrict,
  foreign key (milestone_id, tenant_id)
    references public.estimate_milestones(id, tenant_id) on delete restrict,
  foreign key (client_id, tenant_id)
    references public.clients(id, tenant_id) on delete restrict,
  check ((status = 'draft' and issued_invoice_id is null and issue_operation_id is null)
    or (status = 'issued' and issued_invoice_id is not null
      and issue_operation_id is not null))
);
create index invoice_milestone_drafts_open_idx
  on public.invoice_milestone_drafts(tenant_id, created_at desc)
  where status = 'draft';
alter table public.invoice_milestone_drafts enable row level security;
revoke all on public.invoice_milestone_drafts from public, anon, authenticated;
grant select on public.invoice_milestone_drafts to authenticated;
create policy invoice_milestone_drafts_office_read
  on public.invoice_milestone_drafts for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
  );

create function public.build_invoice_milestone_draft(
  p_tenant_id uuid, p_estimate_id uuid, p_milestone_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare target public.estimates%rowtype;
declare milestone public.estimate_milestones%rowtype;
declare existing_id uuid;
declare net_cents numeric;
declare discount_cents numeric;
declare subtotal_cents numeric;
declare gross_cents numeric;
declare milestone_cents numeric;
begin
  if p_tenant_id is null or p_estimate_id is null or p_milestone_id is null then
    raise exception 'Origen del borrador inválido' using errcode = '22023';
  end if;
  select * into target from public.estimates
    where id = p_estimate_id and tenant_id = p_tenant_id;
  if not found or target.status <> 'accepted' then
    raise exception 'Solo se preparan borradores de presupuestos aceptados'
      using errcode = 'P0409';
  end if;
  if target.conversion_destination <> 'work' then
    raise exception 'Los contratos se facturan por periodo, no por hito'
      using errcode = 'P0409';
  end if;
  select * into milestone from public.estimate_milestones
    where id = p_milestone_id and tenant_id = p_tenant_id
      and estimate_id = p_estimate_id;
  if not found then raise exception 'Hito no encontrado' using errcode = 'P0002'; end if;
  select id into existing_id from public.invoice_milestone_drafts
    where estimate_id = p_estimate_id and milestone_id = p_milestone_id
      and tenant_id = p_tenant_id and status = 'draft';
  if found then return existing_id; end if;
  if exists (select 1 from public.invoices
    where estimate_id = p_estimate_id and milestone_id = p_milestone_id) then
    raise exception 'Este hito ya tiene una factura emitida' using errcode = 'P0409';
  end if;
  select coalesce(sum(l.gross_cents - round(l.gross_cents * l.discount_percent / 100)), 0)
    into net_cents from (
      select round(quantity * unit_price_cents) as gross_cents, discount_percent
      from public.estimate_lines
      where estimate_id = p_estimate_id and tenant_id = p_tenant_id
    ) l;
  discount_cents := case target.discount_type
    when 'percent' then round(net_cents * target.discount_value / 100)
    when 'amount' then least(net_cents, round(target.discount_value))
    else 0 end;
  subtotal_cents := net_cents - discount_cents;
  gross_cents := subtotal_cents + round(subtotal_cents * target.vat_rate / 100);
  milestone_cents := round(gross_cents * milestone.percent / 100);
  if milestone_cents <= 0 then
    raise exception 'El hito no tiene importe facturable' using errcode = 'P0410';
  end if;
  if milestone_cents > 9000000000000000 then
    raise exception 'Importe del hito fuera de rango' using errcode = '22003';
  end if;
  insert into public.invoice_milestone_drafts (
    tenant_id, estimate_id, milestone_id, client_id, concept,
    total_cents, vat_rate, due_date
  ) values (
    p_tenant_id, p_estimate_id, p_milestone_id, target.client_id,
    left(target.title || ' · ' || coalesce(nullif(milestone.label, ''), 'Hito'), 200),
    milestone_cents::bigint, target.vat_rate, current_date + 15
  ) on conflict (estimate_id, milestone_id) do nothing returning id into existing_id;
  if existing_id is null then
    select id into existing_id from public.invoice_milestone_drafts
      where estimate_id = p_estimate_id and milestone_id = p_milestone_id
        and tenant_id = p_tenant_id and status = 'draft';
  end if;
  if existing_id is null then
    raise exception 'Este hito ya tiene una factura emitida' using errcode = 'P0409';
  end if;
  return existing_id;
end;
$$;
revoke all on function public.build_invoice_milestone_draft(uuid, uuid, uuid)
  from public, anon, authenticated;

create function public.create_invoice_milestone_draft(
  p_tenant_id uuid, p_estimate_id uuid, p_milestone_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.has_role(p_tenant_id,
      array['owner', 'admin']::public.app_role[])
     or not public.tenant_can_write(p_tenant_id) then
    raise exception 'No tienes permiso para preparar facturas'
      using errcode = '42501';
  end if;
  return public.build_invoice_milestone_draft(
    p_tenant_id, p_estimate_id, p_milestone_id);
end;
$$;
revoke all on function public.create_invoice_milestone_draft(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.create_invoice_milestone_draft(uuid, uuid, uuid)
  to authenticated;

create function public.update_invoice_milestone_draft(
  p_tenant_id uuid, p_draft_id uuid, p_expected_revision integer,
  p_concept text, p_due_date date
) returns integer language plpgsql security definer set search_path = '' as $$
declare new_revision integer;
begin
  if (select auth.uid()) is null or not public.has_role(p_tenant_id,
      array['owner', 'admin']::public.app_role[])
     or not public.tenant_can_write(p_tenant_id) then
    raise exception 'No tienes permiso para editar facturas' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 1
     or p_concept is null or char_length(trim(p_concept)) not between 1 and 200
     or p_due_date is null then
    raise exception 'Datos del borrador inválidos' using errcode = '22023';
  end if;
  update public.invoice_milestone_drafts
    set concept = trim(p_concept), due_date = p_due_date,
      revision = revision + 1, updated_at = clock_timestamp()
    where id = p_draft_id and tenant_id = p_tenant_id
      and status = 'draft' and revision = p_expected_revision
    returning revision into new_revision;
  if not found then
    raise exception 'El borrador cambió o ya se emitió; recarga antes de guardar'
      using errcode = 'P0409';
  end if;
  return new_revision;
end;
$$;
revoke all on function public.update_invoice_milestone_draft(
  uuid, uuid, integer, text, date) from public, anon, authenticated;
grant execute on function public.update_invoice_milestone_draft(
  uuid, uuid, integer, text, date) to authenticated;

create function public.issue_invoice_milestone_draft(
  p_tenant_id uuid, p_draft_id uuid, p_expected_revision integer,
  p_operation_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare target public.invoice_milestone_drafts%rowtype;
declare created_id uuid;
begin
  if (select auth.uid()) is null or not public.has_role(p_tenant_id,
      array['owner', 'admin']::public.app_role[])
     or not public.tenant_can_write(p_tenant_id) then
    raise exception 'No tienes permiso para emitir facturas' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 1
     or p_operation_id is null then
    raise exception 'Datos de emisión inválidos' using errcode = '22023';
  end if;
  select * into target from public.invoice_milestone_drafts
    where id = p_draft_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Borrador no encontrado' using errcode = 'P0002'; end if;
  if target.status = 'issued' then
    if target.issue_operation_id = p_operation_id then
      return target.issued_invoice_id;
    end if;
    raise exception 'El borrador ya se emitió' using errcode = 'P0409';
  end if;
  if target.revision <> p_expected_revision then
    raise exception 'El borrador cambió; recarga antes de emitir'
      using errcode = 'P0409';
  end if;
  if target.due_date < current_date then
    raise exception 'La fecha de vencimiento ya pasó' using errcode = '22023';
  end if;
  if exists (select 1 from public.invoices where estimate_id = target.estimate_id
    and milestone_id = target.milestone_id) then
    raise exception 'Este hito ya se facturó' using errcode = 'P0409';
  end if;
  insert into public.invoices (
    tenant_id, estimate_id, milestone_id, issue_operation_id, client_id,
    concept, total_cents, vat_rate, status, issued_at, due_date
  ) values (
    target.tenant_id, target.estimate_id, target.milestone_id,
    p_operation_id, target.client_id, target.concept,
    target.total_cents, target.vat_rate, 'issued', current_date, target.due_date
  ) returning id into created_id;
  update public.invoice_milestone_drafts
    set status = 'issued', issued_invoice_id = created_id,
      issue_operation_id = p_operation_id, updated_at = clock_timestamp()
    where id = target.id;
  return created_id;
end;
$$;
revoke all on function public.issue_invoice_milestone_draft(
  uuid, uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.issue_invoice_milestone_draft(
  uuid, uuid, integer, uuid) to authenticated;

-- An office client must use the issuance RPC. Direct inserts would bypass draft
-- review while still receiving a server number from the legacy insert trigger.
drop policy if exists invoices_insert on public.invoices;
revoke insert on public.invoices from public, anon, authenticated;

-- Remove the old automatic emission before creating the new acceptance hook.
drop trigger estimates_issue_first_invoice_after_acceptance on public.estimates;
drop function public.issue_first_invoice_on_acceptance();
create function public.prepare_first_invoice_draft_on_acceptance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare first_milestone_id uuid;
begin
  if not (old.status = 'sent' and new.status = 'accepted'
      and old.responded_at is null and new.responded_at is not null) then
    return new;
  end if;
  if new.conversion_destination = 'contract' then return new; end if;
  select m.id into first_milestone_id from public.estimate_milestones m
    where m.estimate_id = new.id and m.tenant_id = new.tenant_id
    order by m.position, m.id limit 1;
  if first_milestone_id is not null then
    begin
      perform public.build_invoice_milestone_draft(
        new.tenant_id, new.id, first_milestone_id);
    exception when sqlstate 'P0410' then
      -- A zero-value milestone must not prevent the customer accepting.
      null;
    end;
  end if;
  return new;
end;
$$;
create trigger estimates_prepare_first_invoice_draft_after_acceptance
  after update of status on public.estimates
  for each row execute function public.prepare_first_invoice_draft_on_acceptance();
revoke all on function public.prepare_first_invoice_draft_on_acceptance()
  from public, anon, authenticated;
