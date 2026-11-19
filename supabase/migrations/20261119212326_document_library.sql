set local lock_timeout = '3s';

create function app_private.document_appearance_is_valid(settings jsonb, invoice boolean)
returns boolean language sql immutable strict set search_path = '' as $$
  select case when jsonb_typeof(settings) = 'object' then (
    settings ->> 'logoSize' in ('standard', 'small', 'large')
    and settings ->> 'logoPosition' in ('auto', 'left', 'center', 'right')
    and jsonb_typeof(settings -> 'accentColor') = 'string'
    and settings ->> 'accentColor' ~* '^(#[0-9a-f]{6})?$'
    and case when invoice then (
      jsonb_typeof(settings -> 'showLogo') = 'boolean'
      and jsonb_typeof(settings -> 'showContact') = 'boolean'
      and settings - array['logoSize', 'logoPosition', 'accentColor', 'showLogo', 'showContact'] = '{}'::jsonb
    ) else settings - array['logoSize', 'logoPosition', 'accentColor'] = '{}'::jsonb end
  ) is true else false end;
$$;
revoke all on function app_private.document_appearance_is_valid(jsonb, boolean)
  from public, anon, authenticated, service_role;

create or replace function app_private.estimate_design_is_valid(design jsonb) returns boolean
language sql immutable strict security definer set search_path = '' as $$
  select case when jsonb_typeof(design) = 'object' then (
    design ->> 'layout' in ('compact', 'proposal', 'minimal', 'editorial')
    and jsonb_typeof(design -> 'showIndex') = 'boolean'
    and jsonb_typeof(design -> 'showLogo') = 'boolean'
    and jsonb_typeof(design -> 'showFooter') = 'boolean'
    and (not (design ? 'appearance') or app_private.document_appearance_is_valid(design -> 'appearance', false))
    and design - array['layout', 'showIndex', 'showLogo', 'showFooter', 'appearance'] = '{}'::jsonb
  ) is true else false end;
$$;

-- Validate through the CHECK constraint without granting access to app_private.
create function app_private.document_library_is_valid(library jsonb) returns boolean
language plpgsql immutable strict security definer set search_path = '' as $$
declare kind text; item jsonb; ids text[]; item_id text; default_key text;
begin
  if jsonb_typeof(library) <> 'object' then return false; end if;
  if octet_length(library::text) > 600000
    or not (library ?& array['estimates', 'invoices', 'blocks', 'defaultEstimateId', 'defaultInvoiceId'])
    or library - array['estimates', 'invoices', 'blocks', 'defaultEstimateId', 'defaultInvoiceId', 'invoiceAppearance'] <> '{}'::jsonb
    or (library ? 'invoiceAppearance' and not app_private.document_appearance_is_valid(library -> 'invoiceAppearance', true)) then
    return false;
  end if;

  foreach kind in array array['estimates', 'invoices', 'blocks'] loop
    if jsonb_typeof(library -> kind) <> 'array' then return false; end if;
    if jsonb_array_length(library -> kind) > (case when kind = 'blocks' then 40 else 30 end) then
      return false;
    end if;
    ids := array[]::text[];
    for item in select value from jsonb_array_elements(library -> kind) loop
      if jsonb_typeof(item) <> 'object' then return false; end if;
      item_id := lower(item ->> 'id');
      if not coalesce(
        item_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and not (item_id = any(ids))
        and jsonb_typeof(item -> 'name') = 'string'
        and char_length(btrim(item ->> 'name')) between 1 and 80
        and case kind
          when 'estimates' then app_private.estimate_design_is_valid(item -> 'design')
            and item - array['id', 'name', 'design'] = '{}'::jsonb
          when 'invoices' then item ->> 'design' in ('classic', 'modern', 'minimal', 'artistic')
            and app_private.document_appearance_is_valid(item -> 'appearance', true)
            and item - array['id', 'name', 'design', 'appearance'] = '{}'::jsonb
          when 'blocks' then item ->> 'category' in ('scope', 'exclusions', 'warranty', 'conditions')
            and jsonb_typeof(item -> 'content') = 'string'
            and char_length(btrim(item ->> 'content')) between 1 and 3000
            and item - array['id', 'name', 'category', 'content'] = '{}'::jsonb
        end, false
      ) then return false; end if;
      ids := array_append(ids, item_id);
    end loop;
    default_key := case kind when 'estimates' then 'defaultEstimateId' when 'invoices' then 'defaultInvoiceId' end;
    if default_key is not null and library -> default_key <> 'null'::jsonb
      and not coalesce(lower(library ->> default_key) = any(ids), false) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function app_private.document_library_is_valid(jsonb) from public, anon;
grant execute on function app_private.document_library_is_valid(jsonb) to authenticated, service_role;

alter table public.tenants add column document_library jsonb
  constraint tenants_document_library_valid check (
    document_library is null or app_private.document_library_is_valid(document_library)
  );

create function app_private.invoice_template_for_issue(library jsonb, requested_id text) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare chosen jsonb;
begin
  select item into chosen from jsonb_array_elements(library -> 'invoices') as t(item)
    where lower(item ->> 'id') = lower(coalesce(requested_id, library ->> 'defaultInvoiceId'));
  if requested_id is not null and chosen is null then
    raise exception 'La plantilla de factura ya no está disponible.' using errcode = '22023';
  end if;
  return chosen;
end;
$$;
revoke all on function app_private.invoice_template_for_issue(jsonb, text) from public, anon, authenticated;

-- Transient context shared with the insert trigger, scoped to this transaction and operation.
create table app_private.invoice_template_issue_context (
  transaction_id xid8 not null,
  tenant_id uuid not null,
  operation_id uuid not null,
  template_id uuid not null,
  primary key (transaction_id, tenant_id, operation_id)
);
revoke all on app_private.invoice_template_issue_context from public, anon, authenticated, service_role;

-- Resolve the company default or the wrapper's per-operation override inside the existing insert.
create or replace function public.capture_invoice_document_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  base_design text; library jsonb; chosen jsonb; appearance jsonb; requested_id text;
begin
  new.document_snapshot := public.invoice_document_snapshot(new, 'issuance');
  if new.document_snapshot is null then
    raise exception 'No se puede emitir una factura sin emisor, cliente y presupuesto válidos';
  end if;
  select coalesce(t.default_invoice_design, 'classic'), t.document_library into base_design, library
    from public.tenants t where t.id = new.tenant_id;
  if new.issue_operation_id is not null then
    select c.template_id::text into requested_id from app_private.invoice_template_issue_context c
      where c.transaction_id = pg_current_xact_id_if_assigned()
        and c.tenant_id = new.tenant_id and c.operation_id = new.issue_operation_id;
  end if;
  chosen := app_private.invoice_template_for_issue(library, requested_id);
  new.document_snapshot := new.document_snapshot || jsonb_build_object('design', coalesce(chosen ->> 'design', base_design));
  appearance := coalesce(chosen -> 'appearance', library -> 'invoiceAppearance');
  if appearance is not null then
    new.document_snapshot := new.document_snapshot || jsonb_build_object('appearance', appearance);
  end if;
  return new;
end;
$$;

-- The existing RPCs still authorize the JWT and enforce revision and idempotency checks.
-- Context is deleted on success; a failed call rolls it back with the invoice insert.
create function public.issue_invoice_draft_with_template(
  p_source text, p_tenant_id uuid, p_draft_id uuid, p_expected_revision integer,
  p_operation_id uuid, p_template_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare context_xid xid8; issued_id uuid;
begin
  if p_template_id is not null and p_tenant_id is not null and p_operation_id is not null then
    context_xid := pg_current_xact_id();
    insert into app_private.invoice_template_issue_context (transaction_id, tenant_id, operation_id, template_id)
      values (context_xid, p_tenant_id, p_operation_id, p_template_id);
  end if;
  case p_source
    when 'milestone' then issued_id := public.issue_invoice_milestone_draft(p_tenant_id, p_draft_id, p_expected_revision, p_operation_id);
    when 'work_extra' then issued_id := public.issue_invoice_work_extra_draft(p_tenant_id, p_draft_id, p_expected_revision, p_operation_id);
    when 'contract_period' then issued_id := public.issue_invoice_contract_period_draft(p_tenant_id, p_draft_id, p_expected_revision, p_operation_id);
    else raise exception 'Origen de factura inválido' using errcode = '22023';
  end case;
  if context_xid is not null then
    delete from app_private.invoice_template_issue_context
      where transaction_id = context_xid and tenant_id = p_tenant_id and operation_id = p_operation_id;
  end if;
  return issued_id;
end;
$$;
revoke all on function public.issue_invoice_draft_with_template(text, uuid, uuid, integer, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.issue_invoice_draft_with_template(text, uuid, uuid, integer, uuid, uuid)
  to authenticated;
