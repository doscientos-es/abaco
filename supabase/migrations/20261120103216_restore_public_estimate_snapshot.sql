-- Preserve the versioned document sections and agreement when capturing new publications.
-- Also include the latest optional line details, design, and bank instructions in the snapshot.
create or replace function public.estimate_publication_snapshot(p_estimate_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  captured jsonb;
  captured_lines jsonb;
  design jsonb;
  bank_iban text;
begin
  captured := public.estimate_publication_snapshot_before_agreement(p_estimate_id);
  if captured is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'estimate_id', l.estimate_id,
    'catalog_item_id', l.catalog_item_id, 'position', l.position,
    'description', l.description, 'details', l.details, 'kind', l.kind, 'unit', l.unit,
    'quantity', l.quantity, 'unit_price_cents', l.unit_price_cents,
    'discount_percent', l.discount_percent
  ) order by l.position, l.id), '[]'::jsonb)
  into captured_lines
  from public.estimate_lines l
  join public.estimates e on e.id = l.estimate_id and e.tenant_id = l.tenant_id
  where e.id = p_estimate_id;

  select e.document_design, t.iban into design, bank_iban
  from public.estimates e
  join public.tenants t on t.id = e.tenant_id
  where e.id = p_estimate_id;

  captured := jsonb_set(captured, '{estimate,estimate_lines}', captured_lines, true);
  if design is not null then
    captured := jsonb_set(captured, '{estimate,document_design}', design, true);
  end if;
  captured := jsonb_set(
    captured,
    '{tenant}',
    (captured->'tenant') || jsonb_build_object('iban', bank_iban),
    true
  );

  return captured || jsonb_build_object('agreement', app_private.estimate_agreement_metadata(captured));
end;
$$;

revoke all on function public.estimate_publication_snapshot(uuid) from public, anon, authenticated;