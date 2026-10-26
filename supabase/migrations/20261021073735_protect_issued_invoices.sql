-- Issued invoices retain their displayed issuer, recipient and estimate reference.
-- Legacy rows can only be reconstructed from current master data; mark that provenance explicitly.
alter table public.invoices add column document_snapshot jsonb;

create function public.invoice_document_snapshot(p_invoice public.invoices, p_source text)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'source', p_source,
    'capturedAt', now(),
    'issuer', jsonb_build_object(
      'name', t.name, 'legalName', t.legal_name, 'taxId', t.tax_id,
      'email', t.email, 'phone', t.phone, 'address', t.address,
      'postalCode', t.postal_code, 'city', t.city, 'website', t.website,
      'iban', t.iban, 'brandColor', t.brand_color, 'logoUrl', t.logo_url,
      'documentFooter', t.document_footer
    ),
    'client', jsonb_build_object(
      'name', c.name, 'taxId', c.tax_id, 'address', c.address, 'email', c.email
    ),
    'estimateNumber', e.number
  )
  from public.tenants t
  join public.clients c on c.id = p_invoice.client_id and c.tenant_id = p_invoice.tenant_id
  join public.estimates e on e.id = p_invoice.estimate_id and e.tenant_id = p_invoice.tenant_id
  where t.id = p_invoice.tenant_id;
$$;

update public.invoices i
set document_snapshot = public.invoice_document_snapshot(i, 'migration');

alter table public.invoices
  alter column document_snapshot set not null,
  add constraint invoices_document_snapshot_object
    check (jsonb_typeof(document_snapshot) = 'object');

create function public.capture_invoice_document_snapshot() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.document_snapshot := public.invoice_document_snapshot(new, 'issuance');
  if new.document_snapshot is null then
    raise exception 'No se puede emitir una factura sin emisor, cliente y presupuesto válidos';
  end if;
  return new;
end;
$$;

create trigger invoices_capture_document_snapshot before insert on public.invoices
  for each row execute function public.capture_invoice_document_snapshot();

create function public.protect_issued_invoice() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Las facturas emitidas no se eliminan; emite una rectificativa';
  end if;
  if row(
    new.id, new.tenant_id, new.number, new.estimate_id, new.milestone_id,
    new.client_id, new.concept, new.total_cents, new.vat_rate,
    new.issued_at, new.due_date, new.created_at, new.document_snapshot
  ) is distinct from row(
    old.id, old.tenant_id, old.number, old.estimate_id, old.milestone_id,
    old.client_id, old.concept, old.total_cents, old.vat_rate,
    old.issued_at, old.due_date, old.created_at, old.document_snapshot
  ) then
    raise exception 'El contenido de una factura emitida es inmutable';
  end if;
  return new;
end;
$$;

create trigger invoices_protect_content before update or delete on public.invoices
  for each row execute function public.protect_issued_invoice();

drop policy if exists invoices_delete on public.invoices;
revoke execute on function public.invoice_document_snapshot(public.invoices, text) from public, anon, authenticated;
revoke execute on function public.capture_invoice_document_snapshot() from public, anon, authenticated;
revoke execute on function public.protect_issued_invoice() from public, anon, authenticated;

-- Bridge the existing public acceptance flow to server-side billing. The client must not
-- need to reopen the app for the first milestone to be recorded. A later billing phase
-- can replace this automatic issuance with an explicit draft/obligation policy.
create function public.issue_first_invoice_on_acceptance() returns trigger
language plpgsql set search_path = ''
as $$
declare
  first_milestone record;
  milestone_count integer;
  net_cents numeric;
  discount_cents numeric;
  subtotal_cents numeric;
  total_cents numeric;
  first_cents numeric;
begin
  if not (old.status = 'sent' and new.status = 'accepted'
          and old.responded_at is null and new.responded_at is not null) then
    return new;
  end if;

  select m.id, m.label, m.percent into first_milestone
  from public.estimate_milestones m
  where m.estimate_id = new.id and m.tenant_id = new.tenant_id
  order by m.position, m.id limit 1;
  if not found then return new; end if;

  select count(*) into milestone_count from public.estimate_milestones m
  where m.estimate_id = new.id and m.tenant_id = new.tenant_id;

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
  first_cents := case when milestone_count = 1 then total_cents
    else round(total_cents * first_milestone.percent / 100) end;
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

create trigger estimates_issue_first_invoice_after_acceptance
  after update of status on public.estimates
  for each row execute function public.issue_first_invoice_on_acceptance();

revoke execute on function public.issue_first_invoice_on_acceptance() from public, anon, authenticated;
