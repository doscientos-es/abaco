-- Keep the drawn client signature as response evidence, separate from the immutable proposal.
alter table public.estimates
  add column responded_signature jsonb,
  add constraint estimates_responded_signature_check check (
    responded_signature is null or case
      when jsonb_typeof(responded_signature) = 'array' then
        status = 'accepted'
        and jsonb_array_length(responded_signature) between 1 and 10
        and octet_length(responded_signature::text) <= 16384
      else false
    end
  );

-- Signature data may change only as part of the server-owned sent -> accepted transition.
create or replace function public.protect_published_estimate() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Un presupuesto enviado o respondido no se elimina';
    end if;
    return old;
  end if;

  if old.status <> 'draft' then
    if to_jsonb(new) - 'status' - 'responded_at' - 'responded_by' - 'responded_signature'
      - 'viewed_at' - 'followup_sent_at' - 'reminder_sent_at' - 'sent_at' - 'email_sent_at' - 'updated_at'
      is distinct from
       to_jsonb(old) - 'status' - 'responded_at' - 'responded_by' - 'responded_signature'
      - 'viewed_at' - 'followup_sent_at' - 'reminder_sent_at' - 'sent_at' - 'email_sent_at' - 'updated_at' then
      raise exception 'El contenido de un presupuesto enviado es inmutable; crea una copia';
    end if;
    if old.status = 'sent' and new.status not in ('sent', 'accepted', 'rejected') then
      raise exception 'Transición de presupuesto no permitida';
    end if;
    if old.status = 'sent' and new.status in ('accepted', 'rejected')
       and current_user = 'authenticated' then
      raise exception 'La respuesta del cliente requiere una operación de servidor';
    end if;
    if old.status = 'sent' and new.status = 'sent'
       and new.responded_signature is distinct from old.responded_signature then
      raise exception 'La firma requiere aceptar el presupuesto';
    end if;
    if old.status in ('accepted', 'rejected') and (
      new.status is distinct from old.status
      or new.responded_at is distinct from old.responded_at
      or new.responded_by is distinct from old.responded_by
      or new.responded_signature is distinct from old.responded_signature
    ) then
      raise exception 'La respuesta del cliente es inmutable';
    end if;
  end if;
  return new;
end;
$$;

-- Payment instructions are captured with each new publication but returned only after acceptance.
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
          'description', l.description, 'details', l.details, 'kind', l.kind, 'unit', l.unit,
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
      'website', t.website, 'iban', t.iban, 'brand_color', t.brand_color,
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

revoke execute on function public.protect_published_estimate() from public, anon, authenticated;
revoke execute on function public.estimate_publication_snapshot(uuid) from public, anon, authenticated;