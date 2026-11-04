-- Forecasts are separate from the ledger until an actual payment is recorded.
create table public.scheduled_payments (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  concept text not null check (char_length(btrim(concept)) between 1 and 200),
  supplier text not null default '' check (char_length(supplier) <= 200),
  category text not null default '' check (char_length(category) <= 120),
  amount_cents bigint not null check (amount_cents between 1 and 99999999999),
  vat_rate numeric(5,2) not null check (vat_rate between 0 and 100),
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  paid_on date,
  ledger_entry_id uuid unique,
  created_at timestamptz not null default now(),
  foreign key (ledger_entry_id, tenant_id) references public.ledger_entries(id, tenant_id) on delete restrict,
  check ((status = 'paid' and paid_on is not null and ledger_entry_id is not null)
    or (status <> 'paid' and paid_on is null and ledger_entry_id is null))
);
create index scheduled_payments_tenant_due_idx on public.scheduled_payments (tenant_id, due_date);
alter table public.scheduled_payments enable row level security;
revoke all on public.scheduled_payments from public, anon, authenticated;
grant select on public.scheduled_payments to authenticated;
create policy scheduled_payments_select on public.scheduled_payments for select to authenticated
  using (public.has_role(tenant_id, array['owner', 'admin']::public.app_role[]));

create function public.save_scheduled_payment(
  p_id uuid, p_tenant_id uuid, p_concept text, p_supplier text, p_category text,
  p_amount_cents bigint, p_vat_rate numeric, p_due_date date
) returns uuid language plpgsql security definer set search_path = '' as $$
declare existing public.scheduled_payments%rowtype;
begin
  if (select auth.uid()) is null or not public.has_role(p_tenant_id, array['owner', 'admin']::public.app_role[]) then
    raise exception 'Sin permiso para gestionar pagos' using errcode = '42501';
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede gestionar pagos' using errcode = 'P0402';
  end if;
  if p_id is null or p_due_date is null or p_concept is null or length(btrim(p_concept)) not between 1 and 200
    or p_supplier is null or length(btrim(p_supplier)) > 200 or p_category is null or length(btrim(p_category)) > 120
    or p_amount_cents is null or p_amount_cents not between 1 and 99999999999
    or p_vat_rate is null or p_vat_rate not between 0 and 100 then
    raise exception 'Comprueba los datos del pago' using errcode = '22023';
  end if;
  select * into existing from public.scheduled_payments where id = p_id for update;
  if found then
    if existing.tenant_id <> p_tenant_id or existing.status <> 'pending' then
      raise exception 'El pago no está pendiente' using errcode = '22023';
    end if;
    update public.scheduled_payments set concept = btrim(p_concept), supplier = btrim(p_supplier),
      category = btrim(p_category), amount_cents = p_amount_cents, vat_rate = p_vat_rate,
      due_date = p_due_date where id = p_id;
  else
    insert into public.scheduled_payments (id, tenant_id, concept, supplier, category, amount_cents, vat_rate, due_date)
    values (p_id, p_tenant_id, btrim(p_concept), btrim(p_supplier), btrim(p_category), p_amount_cents, p_vat_rate, p_due_date);
  end if;
  return p_id;
end;
$$;

create function public.settle_scheduled_payment(p_tenant_id uuid, p_id uuid, p_paid_on date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare payment public.scheduled_payments%rowtype; entry_id uuid;
begin
  if (select auth.uid()) is null or not public.has_role(p_tenant_id, array['owner', 'admin']::public.app_role[]) then
    raise exception 'Sin permiso para gestionar pagos' using errcode = '42501';
  end if;
  if p_paid_on is null then raise exception 'Indica la fecha de pago' using errcode = '22023'; end if;
  select * into payment from public.scheduled_payments where id = p_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Pago no encontrado' using errcode = 'P0002'; end if;
  if payment.status = 'paid' then
    if payment.paid_on <> p_paid_on then raise exception 'El pago ya está registrado con otra fecha' using errcode = '22023'; end if;
    return payment.ledger_entry_id;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede gestionar pagos' using errcode = 'P0402';
  end if;
  if payment.status <> 'pending' then raise exception 'El pago no está pendiente' using errcode = '22023'; end if;
  entry_id := gen_random_uuid();
  insert into public.ledger_entries (id, tenant_id, kind, entry_date, concept, category, amount_cents, vat_rate)
    values (entry_id, p_tenant_id, 'expense', p_paid_on, payment.concept, payment.category, payment.amount_cents, payment.vat_rate);
  update public.scheduled_payments set status = 'paid', paid_on = p_paid_on, ledger_entry_id = entry_id where id = p_id;
  return entry_id;
end;
$$;

create function public.cancel_scheduled_payment(p_tenant_id uuid, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.has_role(p_tenant_id, array['owner', 'admin']::public.app_role[]) then
    raise exception 'Sin permiso para gestionar pagos' using errcode = '42501';
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede gestionar pagos' using errcode = 'P0402';
  end if;
  update public.scheduled_payments set status = 'cancelled'
    where id = p_id and tenant_id = p_tenant_id and status = 'pending';
  if not found then raise exception 'El pago no está pendiente' using errcode = '22023'; end if;
end;
$$;
revoke all on function public.save_scheduled_payment(uuid, uuid, text, text, text, bigint, numeric, date) from public, anon;
revoke all on function public.settle_scheduled_payment(uuid, uuid, date) from public, anon;
revoke all on function public.cancel_scheduled_payment(uuid, uuid) from public, anon;
grant execute on function public.save_scheduled_payment(uuid, uuid, text, text, text, bigint, numeric, date) to authenticated;
grant execute on function public.settle_scheduled_payment(uuid, uuid, date) to authenticated;
grant execute on function public.cancel_scheduled_payment(uuid, uuid) to authenticated;