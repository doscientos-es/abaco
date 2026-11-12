-- A publication owns the exact customer-facing proposal and master-data snapshot.
-- Existing sent documents are reconstructed from current data and explicitly marked.
-- Email delivery is tracked separately from publication; legacy delivery is unknown.
alter table public.estimates add column email_sent_at timestamptz;

create function public.protect_estimate_delivery_marker() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and new.email_sent_at is distinct from old.email_sent_at then
    raise exception 'La confirmación de envío de correo pertenece al servidor';
  end if;
  return new;
end;
$$;
create trigger estimates_protect_email_delivery
  before update on public.estimates
  for each row execute function public.protect_estimate_delivery_marker();

create table public.estimate_publications (
  estimate_id uuid primary key,
  tenant_id uuid not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  source text not null check (source in ('publication', 'migration')),
  captured_at timestamptz not null default now(),
  foreign key (estimate_id, tenant_id)
    references public.estimates (id, tenant_id) on delete restrict
);
create index estimate_publications_tenant_idx
  on public.estimate_publications (tenant_id, captured_at desc);

alter table public.estimate_publications enable row level security;
revoke all on public.estimate_publications from public, anon, authenticated;
grant select on public.estimate_publications to authenticated, service_role;
create policy estimate_publications_select on public.estimate_publications
  for select to authenticated using (public.is_member(tenant_id));

create function public.estimate_publication_snapshot(p_estimate_id uuid) returns jsonb
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
          'description', l.description, 'kind', l.kind, 'unit', l.unit,
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

create function public.capture_estimate_publication() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare payload jsonb;
begin
  if old.status <> 'draft' or new.status <> 'sent' then return new; end if;
  payload := public.estimate_publication_snapshot(new.id);
  if payload is null then
    raise exception 'No se puede publicar un presupuesto sin emisor y cliente válidos';
  end if;
  insert into public.estimate_publications (estimate_id, tenant_id, snapshot, source)
  values (new.id, new.tenant_id, payload, 'publication');
  return new;
end;
$$;
create trigger estimates_capture_publication
  after update of status on public.estimates
  for each row execute function public.capture_estimate_publication();

-- No historical version is invented for documents sent before this migration.
insert into public.estimate_publications (estimate_id, tenant_id, snapshot, source)
select e.id, e.tenant_id, public.estimate_publication_snapshot(e.id), 'migration'
from public.estimates e where e.status <> 'draft';

create function public.reject_estimate_publication_change() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'La versión publicada de un presupuesto es inmutable';
  return old;
end;
$$;
create trigger estimate_publications_immutable
  before update or delete on public.estimate_publications
  for each row execute function public.reject_estimate_publication_change();

revoke execute on function public.estimate_publication_snapshot(uuid)
  from public, anon, authenticated;
revoke execute on function public.protect_estimate_delivery_marker()
  from public, anon, authenticated;
revoke execute on function public.capture_estimate_publication()
  from public, anon, authenticated;
revoke execute on function public.reject_estimate_publication_change()
  from public, anon, authenticated;
