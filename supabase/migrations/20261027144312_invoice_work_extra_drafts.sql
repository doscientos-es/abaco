-- An approved extra becomes a reviewable draft before it can consume an invoice number.
create table public.invoice_work_extra_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  work_extra_id uuid not null unique,
  work_order_id uuid not null,
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
  foreign key (work_extra_id, tenant_id)
    references public.work_order_extras(id, tenant_id) on delete restrict,
  foreign key (work_order_id, tenant_id)
    references public.work_orders(id, tenant_id) on delete restrict,
  foreign key (client_id, tenant_id)
    references public.clients(id, tenant_id) on delete restrict,
  check ((status = 'draft' and issued_invoice_id is null and issue_operation_id is null)
    or (status = 'issued' and issued_invoice_id is not null
      and issue_operation_id is not null))
);
create index invoice_work_extra_drafts_open_idx
  on public.invoice_work_extra_drafts(tenant_id, created_at desc)
  where status = 'draft';
alter table public.invoice_work_extra_drafts enable row level security;
revoke all on public.invoice_work_extra_drafts from public, anon, authenticated;
grant select on public.invoice_work_extra_drafts to authenticated;
create policy invoice_work_extra_drafts_office_read
  on public.invoice_work_extra_drafts for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
  );

create function public.create_invoice_work_extra_draft(
  p_tenant_id uuid, p_extra_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare extra public.work_order_extras%rowtype;
declare target_client_id uuid;
declare draft_id uuid;
declare amount numeric;
begin
  if (select auth.uid()) is null or not public.has_role(p_tenant_id,
      array['owner', 'admin']::public.app_role[])
     or not public.tenant_can_write(p_tenant_id) then
    raise exception 'No tienes permiso para preparar facturas' using errcode = '42501';
  end if;
  select * into extra from public.work_order_extras
    where id = p_extra_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Extra no encontrado' using errcode = 'P0002'; end if;
  if extra.status <> 'approved' or not exists (
    select 1 from public.work_extra_decisions
      where extra_id = extra.id and tenant_id = p_tenant_id and decision = 'approved'
  ) then
    raise exception 'Solo se prepara un extra aprobado con evidencia'
      using errcode = 'P0409';
  end if;
  select id into draft_id from public.invoice_work_extra_drafts
    where work_extra_id = extra.id and status = 'draft';
  if found then return draft_id; end if;
  if exists (select 1 from public.invoices where work_extra_id = extra.id) then
    raise exception 'El extra ya se facturó' using errcode = 'P0409';
  end if;
  select client_id into target_client_id from public.work_orders
    where id = extra.work_order_id and tenant_id = p_tenant_id;
  amount := extra.price_cents + round(extra.price_cents * extra.vat_rate / 100);
  if amount <= 0 or amount > 9000000000000000 then
    raise exception 'Importe de factura fuera de rango' using errcode = '22003';
  end if;
  insert into public.invoice_work_extra_drafts (
    tenant_id, work_extra_id, work_order_id, client_id,
    concept, total_cents, vat_rate, due_date
  ) values (
    p_tenant_id, extra.id, extra.work_order_id, target_client_id,
    left('Extra · ' || extra.description, 200), amount::bigint,
    extra.vat_rate, current_date + 15
  ) on conflict (work_extra_id) do nothing returning id into draft_id;
  if draft_id is null then
    select id into draft_id from public.invoice_work_extra_drafts
      where work_extra_id = extra.id and status = 'draft';
  end if;
  if draft_id is null then
    raise exception 'El extra ya se facturó' using errcode = 'P0409';
  end if;
  return draft_id;
end;
$$;
revoke all on function public.create_invoice_work_extra_draft(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.create_invoice_work_extra_draft(uuid, uuid)
  to authenticated;

create function public.update_invoice_work_extra_draft(
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
  update public.invoice_work_extra_drafts
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
revoke all on function public.update_invoice_work_extra_draft(
  uuid, uuid, integer, text, date) from public, anon, authenticated;
grant execute on function public.update_invoice_work_extra_draft(
  uuid, uuid, integer, text, date) to authenticated;

create function public.issue_invoice_work_extra_draft(
  p_tenant_id uuid, p_draft_id uuid, p_expected_revision integer,
  p_operation_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare target public.invoice_work_extra_drafts%rowtype;
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
  select * into target from public.invoice_work_extra_drafts
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
  if exists (select 1 from public.invoices where work_extra_id = target.work_extra_id) then
    raise exception 'El extra ya se facturó' using errcode = 'P0409';
  end if;
  insert into public.invoices (
    tenant_id, work_extra_id, issue_operation_id, client_id,
    concept, total_cents, vat_rate, status, issued_at, due_date
  ) values (
    target.tenant_id, target.work_extra_id, p_operation_id, target.client_id,
    target.concept, target.total_cents, target.vat_rate,
    'issued', current_date, target.due_date
  ) returning id into created_id;
  update public.invoice_work_extra_drafts
    set status = 'issued', issued_invoice_id = created_id,
      issue_operation_id = p_operation_id, updated_at = clock_timestamp()
    where id = target.id;
  return created_id;
end;
$$;
revoke all on function public.issue_invoice_work_extra_draft(
  uuid, uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.issue_invoice_work_extra_draft(
  uuid, uuid, integer, uuid) to authenticated;

-- The legacy direct command remains present for old migrations, but office clients
-- must prepare and review a draft before issuing a new extra invoice.
revoke execute on function public.issue_work_extra_invoice(uuid, uuid, date, uuid)
  from public, anon, authenticated;
