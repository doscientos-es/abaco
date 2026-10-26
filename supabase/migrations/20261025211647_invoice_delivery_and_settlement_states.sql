-- Issuance is permanent. Delivery acceptance and settlement are separate facts.
alter table public.invoices add column email_accepted_at timestamptz;

create table public.invoice_delivery_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  invoice_id uuid not null,
  event_type text not null check (event_type in ('accepted', 'legacy_sent')),
  recipient_email text,
  resend_email_id text unique,
  happened_at timestamptz not null default clock_timestamp(),
  recorded_at timestamptz not null default clock_timestamp(),
  foreign key (invoice_id, tenant_id)
    references public.invoices(id, tenant_id) on delete restrict
);
create index invoice_delivery_events_invoice_idx
  on public.invoice_delivery_events(tenant_id, invoice_id, happened_at desc);
create trigger invoice_delivery_events_immutable
  before update or delete on public.invoice_delivery_events
  for each row execute function public.reject_work_history_change();
alter table public.invoice_delivery_events enable row level security;
revoke all on public.invoice_delivery_events from public, anon, authenticated;
grant select on public.invoice_delivery_events to authenticated, service_role;
grant insert on public.invoice_delivery_events to service_role;
create policy invoice_delivery_events_office_read
  on public.invoice_delivery_events for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
  );

create function public.project_invoice_delivery_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.invoices
    set email_accepted_at = coalesce(email_accepted_at, new.happened_at)
    where id = new.invoice_id and tenant_id = new.tenant_id;
  return new;
end;
$$;
create trigger invoice_delivery_events_project
  after insert on public.invoice_delivery_events
  for each row execute function public.project_invoice_delivery_event();
revoke all on function public.project_invoice_delivery_event()
  from public, anon, authenticated;

-- Legacy 'sent' is only evidence of a prior accepted send, without a provider id.
insert into public.invoice_delivery_events (
  tenant_id, invoice_id, event_type, happened_at
)
select tenant_id, id, 'legacy_sent', updated_at from public.invoices
  where status = 'sent';
update public.invoices set status = 'issued' where status <> 'issued';
alter table public.invoices drop constraint invoices_status_check;
alter table public.invoices add constraint invoices_status_check
  check (status = 'issued');

-- Supersede the legacy payment command so a settlement never changes issuance.
create or replace function public.record_invoice_payment(
  p_invoice_id uuid, p_amount_cents bigint, p_payment_date date, p_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  target public.invoices%rowtype;
  prior public.invoice_payment_operations%rowtype;
  ledger_id uuid;
  payment_id uuid;
  new_paid bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión requerida' using errcode = '28000';
  end if;
  if p_invoice_id is null or p_operation_id is null or p_payment_date is null
     or p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Datos de cobro inválidos' using errcode = '22023';
  end if;

  select * into target from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Factura no encontrada' using errcode = 'P0002'; end if;

  if not exists (
    select 1 from public.memberships m
    where m.tenant_id = target.tenant_id and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  ) then
    raise exception 'No tienes permiso para registrar cobros' using errcode = '42501';
  end if;
  if not public.tenant_can_write(target.tenant_id) then
    raise exception 'La empresa no puede registrar nuevos cobros' using errcode = 'P0402';
  end if;

  select * into prior from public.invoice_payment_operations
  where operation_id = p_operation_id;
  if found then
    if prior.invoice_id <> p_invoice_id or prior.amount_cents <> p_amount_cents
       or prior.payment_date <> p_payment_date then
      raise exception 'La clave de operación ya se utilizó con otros datos' using errcode = '23505';
    end if;
    return jsonb_build_object('paymentId', prior.id, 'paidCents', target.paid_cents);
  end if;

  if p_amount_cents > target.total_cents - target.paid_cents then
    raise exception 'El cobro supera el saldo pendiente' using errcode = '22003';
  end if;

  ledger_id := gen_random_uuid();
  insert into public.ledger_entries (
    id, tenant_id, kind, entry_date, concept, category, amount_cents,
    vat_rate, estimate_id, milestone_id
  ) values (
    ledger_id, target.tenant_id, 'income', p_payment_date,
    left(target.number || ' · cobro · ' || target.concept, 200),
    case when target.work_extra_id is null then 'Cobro de presupuesto'
         else 'Cobro de trabajo' end, p_amount_cents,
    target.vat_rate, target.estimate_id, target.milestone_id
  );

  new_paid := target.paid_cents + p_amount_cents;
  update public.invoices
  set paid_cents = new_paid
  where id = target.id;

  insert into public.invoice_payment_operations (
    tenant_id, invoice_id, operation_id, amount_cents, payment_date, ledger_entry_id
  ) values (
    target.tenant_id, target.id, p_operation_id, p_amount_cents, p_payment_date, ledger_id
  ) returning id into payment_id;

  return jsonb_build_object('paymentId', payment_id, 'paidCents', new_paid);
end;
$$;
