-- Extend the existing validated estimate preferences without changing published snapshots.
create or replace function app_private.estimate_design_is_valid(design jsonb) returns boolean
language sql immutable strict set search_path = '' as $$
  select case when jsonb_typeof(design) = 'object' then (
    design ->> 'layout' in ('compact', 'proposal', 'minimal', 'editorial')
    and jsonb_typeof(design -> 'showIndex') = 'boolean'
    and jsonb_typeof(design -> 'showLogo') = 'boolean'
    and jsonb_typeof(design -> 'showFooter') = 'boolean'
    and design - array['layout', 'showIndex', 'showLogo', 'showFooter'] = '{}'::jsonb
  ) is true else false end;
$$;

alter table public.tenants add column default_invoice_design text
  check (default_invoice_design is null or default_invoice_design in ('classic', 'modern', 'minimal'));

-- Existing invoices have no design key and keep the classic layout. Capture the setting
-- at issuance, alongside the existing immutable fiscal and customer snapshot.
create or replace function public.capture_invoice_document_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
declare design text;
begin
  new.document_snapshot := public.invoice_document_snapshot(new, 'issuance');
  if new.document_snapshot is null then
    raise exception 'No se puede emitir una factura sin emisor, cliente y presupuesto válidos';
  end if;
  select coalesce(t.default_invoice_design, 'classic') into design
    from public.tenants t where t.id = new.tenant_id;
  new.document_snapshot := new.document_snapshot || jsonb_build_object('design', design);
  return new;
end;
$$;