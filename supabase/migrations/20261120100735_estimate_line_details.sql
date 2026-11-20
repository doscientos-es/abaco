alter table public.estimate_lines
  add column details text check (details is null or char_length(details) <= 1000);

create or replace function public.estimate_publication_snapshot(p_estimate_id uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'estimate', jsonb_build_object(
      'id', e.id, 'tenant_id', e.tenant_id, 'number', e.number,
      'client_id', e.client_id, 'title', e.title, 'status', e.status,
      'vat_rate', e.vat_rate, 'discount_type', e.discount_type,
      'discount_value', e.discount_value, 'clauses', e.clauses,
      'valid_until', e.valid_until, 'created_at', e.created_at,
      'responded_at', e.responded_at, 'responded_by', e.responded_by,
      'estimate_lines', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', l.id, 'estimate_id', l.estimate_id,
          'catalog_item_id', l.catalog_item_id, 'position', l.position,
          'description', l.description, 'details', l.details,
          'kind', l.kind, 'unit', l.unit,
          'quantity', l.quantity, 'unit_price_cents', l.unit_price_cents,
          'discount_percent', l.discount_percent
        ) order by l.position, l.id), '[]'::jsonb)
        from public.estimate_lines l
        where l.estimate_id = e.id and l.tenant_id = e.tenant_id
      ),
      'estimate_milestones', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', m.id, 'estimate_id', m.estimate_id, 'position', m.position,
          'label', m.label, 'description', m.description, 'percent', m.percent
        ) order by m.position, m.id), '[]'::jsonb)
        from public.estimate_milestones m
        where m.estimate_id = e.id and m.tenant_id = e.tenant_id
      )
    ),
    'tenant', jsonb_build_object(
      'id', t.id, 'name', t.name, 'legal_name', t.legal_name,
      'tax_id', t.tax_id, 'email', t.email, 'phone', t.phone,
      'address', t.address, 'postal_code', t.postal_code, 'city', t.city,
      'website', t.website, 'brand_color', t.brand_color,
      'logo_url', t.logo_url, 'document_footer', t.document_footer
    ),
    'client', jsonb_build_object(
      'id', c.id, 'tenant_id', c.tenant_id, 'name', c.name,
      'address', c.address
    )
  )
  from public.estimates e
  join public.tenants t on t.id = e.tenant_id
  join public.clients c on c.id = e.client_id and c.tenant_id = e.tenant_id
  where e.id = p_estimate_id;
$$;
