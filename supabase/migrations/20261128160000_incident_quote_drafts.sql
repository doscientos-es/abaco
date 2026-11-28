-- Internal references, never estimate document data; no copied objects, URLs or notes.
create table app_private.incident_quote_reviews (
  operation_id uuid primary key references public.service_incident_conversions(operation_id) on delete restrict,
  tenant_id uuid not null,
  estimate_id uuid not null unique,
  client_id uuid not null,
  centre_id uuid,
  centre_name text,
  centre_address text,
  visit_id uuid,
  photo_ids uuid[] not null check (cardinality(photo_ids) <= 5),
  request jsonb not null check (jsonb_typeof(request) = 'object'),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (estimate_id, tenant_id) references public.estimates(id, tenant_id) on delete restrict,
  check (cardinality(photo_ids) = 0 or visit_id is not null)
);
alter table app_private.incident_quote_reviews enable row level security;
revoke all on app_private.incident_quote_reviews from public, anon, authenticated, service_role;

create function app_private.require_incident_quote_office(p_tenant_id uuid, p_write boolean)
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  if p_tenant_id is null or (select auth.uid()) is null or not coalesce(
    public.has_role(p_tenant_id, array['owner','admin','editor']::public.app_role[]), false
  ) then
    raise exception 'No tienes permiso para revisar presupuestos desde hallazgos' using errcode = '42501';
  end if;
  if p_write and not coalesce(public.tenant_can_write(p_tenant_id), false) then
    raise exception 'La empresa no puede crear presupuestos' using errcode = 'P0402';
  end if;
end;
$$;

create function app_private.get_incident_quote_review(p_tenant_id uuid, p_incident_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  finding public.service_incidents%rowtype;
  customer public.clients%rowtype;
  centre public.service_locations%rowtype;
  photos jsonb := '[]'::jsonb;
begin
  perform app_private.require_incident_quote_office(p_tenant_id, false);
  if p_incident_id is null then raise exception 'Falta el hallazgo' using errcode = '22023'; end if;
  select * into finding from public.service_incidents where tenant_id = p_tenant_id and id = p_incident_id;
  if not found then raise exception 'Hallazgo no encontrado' using errcode = 'P0002'; end if;
  select * into customer from public.clients where tenant_id = p_tenant_id and id = finding.client_id;
  if not found or customer.archived_at is not null or finding.status = 'canceled' then
    raise exception 'Este hallazgo no admite un presupuesto' using errcode = 'P0409';
  end if;
  if finding.location_id is not null then
    select * into centre from public.service_locations l
    where l.tenant_id = p_tenant_id and l.id = finding.location_id and l.client_id = finding.client_id;
    if not found then raise exception 'El centro ya no corresponde al cliente' using errcode = 'P0409'; end if;
  end if;

  if finding.source_visit_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'phase', p.phase, 'caption', p.caption
    ) order by p.created_at desc, p.id), '[]'::jsonb) into photos
    from (
      select p.id, p.phase, p.caption, p.created_at from public.service_visit_photos p
      join public.service_visits v on v.id = p.visit_id and v.tenant_id = p.tenant_id
      where p.tenant_id = p_tenant_id and p.visit_id = finding.source_visit_id
        and v.client_id = finding.client_id and v.location_id is not distinct from finding.location_id
      order by p.created_at desc, p.id limit 24
    ) p;
  end if;
  return jsonb_build_object(
    'client_id', customer.id, 'client_name', customer.name,
    'centre_id', centre.id, 'centre_name', centre.name, 'centre_address', centre.address,
    'incident_version', finding.updated_at, 'visit_id', finding.source_visit_id, 'photos', photos
  );
end;
$$;

create function app_private.create_incident_quote_draft(
  p_tenant_id uuid, p_incident_id uuid, p_client_id uuid, p_centre_id uuid,
  p_incident_version timestamptz, p_title text, p_lines jsonb, p_photo_ids uuid[], p_operation_id uuid
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  finding public.service_incidents%rowtype;
  customer public.clients%rowtype;
  centre public.service_locations%rowtype;
  prior app_private.incident_quote_reviews%rowtype;
  reviewed_title text := btrim(p_title);
  lines text[] := array[]::text[];
  item jsonb;
  label text;
  request_data jsonb;
  destination uuid;
begin
  perform app_private.require_incident_quote_office(p_tenant_id, true);
  if p_incident_id is null or p_client_id is null or p_incident_version is null or p_operation_id is null
     or reviewed_title is null or char_length(reviewed_title) not between 1 and 200
     or reviewed_title ~ '[[:cntrl:]]'
     or p_lines is null or jsonb_typeof(p_lines) <> 'array' or octet_length(p_lines::text) > 8000
     or p_photo_ids is null or cardinality(p_photo_ids) > 5
     or coalesce(array_ndims(p_photo_ids),1) <> 1 then
    raise exception 'Revisa el cliente, el título y las partidas del borrador' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lines) not between 1 and 10 then
    raise exception 'Indica entre 1 y 10 partidas revisadas' using errcode = '22023';
  end if;
  if cardinality(p_photo_ids) <> (select count(distinct value) from unnest(p_photo_ids) as photo(value)) then
    raise exception 'La selección de fotos no es válida' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(p_lines) loop
    label := btrim(item #>> '{}');
    if jsonb_typeof(item) <> 'string' or char_length(label) not between 1 and 160 or label ~ '[[:cntrl:]]' then
      raise exception 'Revisa el texto de las partidas' using errcode = '22023';
    end if;
    lines := array_append(lines, label);
  end loop;
  request_data := jsonb_build_object('incident', p_incident_id, 'client', p_client_id,
    'centre', p_centre_id, 'version', p_incident_version, 'title', reviewed_title,
    'lines', lines, 'photos', p_photo_ids);

  -- Serialize with the existing conversion (and its legacy endpoint) on the same finding.
  select * into finding from public.service_incidents
    where tenant_id = p_tenant_id and id = p_incident_id for update;
  if not found then raise exception 'Hallazgo no encontrado' using errcode = 'P0002'; end if;
  select * into prior from app_private.incident_quote_reviews where operation_id = p_operation_id;
  if found then
    if prior.tenant_id is distinct from p_tenant_id or prior.actor_id is distinct from (select auth.uid())
       or prior.request is distinct from request_data then
      raise exception 'La revisión de esta operación ya cambió' using errcode = '23505';
    end if;
    return prior.estimate_id;
  end if;
  if exists (select 1 from public.service_incident_conversions c
    where c.operation_id = p_operation_id
       or (c.tenant_id = p_tenant_id and c.incident_id = p_incident_id and c.kind = 'estimate')) then
    raise exception 'Ya existe un presupuesto para el hallazgo; abre el borrador existente' using errcode = 'P0409';
  end if;
  if finding.status = 'canceled' or finding.updated_at is distinct from p_incident_version
     or finding.client_id is distinct from p_client_id or finding.location_id is distinct from p_centre_id then
    raise exception 'El hallazgo, el cliente o el centro cambiaron. Vuelve a revisarlos' using errcode = 'P0409';
  end if;
  select * into customer from public.clients where tenant_id = p_tenant_id and id = p_client_id for share;
  if not found or customer.archived_at is not null then
    raise exception 'El cliente ya no está disponible' using errcode = 'P0409';
  end if;
  if p_centre_id is not null then
    select * into centre from public.service_locations l
      where l.tenant_id = p_tenant_id and l.id = p_centre_id and l.client_id = p_client_id for share;
    if not found then raise exception 'El centro no corresponde al cliente' using errcode = 'P0409'; end if;
  end if;
  if cardinality(p_photo_ids) > 0 then
    perform 1 from public.service_visits v
      where v.id = finding.source_visit_id and v.tenant_id = p_tenant_id
        and v.client_id = p_client_id and v.location_id is not distinct from p_centre_id for share;
    if not found then
      raise exception 'La visita de origen ya no corresponde al cliente y al centro' using errcode = '42501';
    end if;
  end if;
  if cardinality(p_photo_ids) <> (
    select count(*) from public.service_visit_photos p
    join public.service_visits v on v.id = p.visit_id and v.tenant_id = p.tenant_id
    where p.tenant_id = p_tenant_id and p.visit_id = finding.source_visit_id
      and v.client_id = p_client_id and v.location_id is not distinct from p_centre_id
      and p.id = any(p_photo_ids)
  ) then
    raise exception 'Solo puedes referenciar fotos de la visita de origen y del mismo centro' using errcode = '42501';
  end if;

  destination := public.convert_service_incident(p_tenant_id, p_incident_id, 'estimate', null, null, null, p_operation_id);
  update public.estimates set title = reviewed_title
     where tenant_id = p_tenant_id and id = destination and client_id = p_client_id and status = 'draft';
  if not found then raise exception 'No se obtuvo un borrador nuevo válido' using errcode = 'P0409'; end if;
  insert into public.estimate_lines(tenant_id, estimate_id, position, description, kind, unit, quantity, unit_price_cents)
    select p_tenant_id, destination, (n - 1)::integer, description, 'other', 'ud', 1, 0
    from unnest(lines) with ordinality a(description,n);

  insert into app_private.incident_quote_reviews (operation_id, tenant_id, estimate_id, client_id,
    centre_id, centre_name, centre_address, visit_id, photo_ids, request, actor_id)
  values (p_operation_id, p_tenant_id, destination, p_client_id, centre.id, centre.name, centre.address,
    finding.source_visit_id, p_photo_ids, request_data, (select auth.uid()));
  return destination;
end;
$$;

create function app_private.get_incident_quote_draft_context(p_tenant_id uuid, p_estimate_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform app_private.require_incident_quote_office(p_tenant_id, false);
  if p_estimate_id is null then raise exception 'Falta el presupuesto' using errcode = '22023'; end if;
  return (
    select jsonb_build_object('client_id', c.client_id, 'centre_id', c.centre_id, 'centre_name', c.centre_name,
      'centre_address', c.centre_address, 'visit_id', c.visit_id,
      'photos', coalesce((
        select jsonb_agg(jsonb_build_object('id', p.id, 'phase', p.phase, 'caption', p.caption)
          order by array_position(c.photo_ids, p.id))
        from public.service_visit_photos p
        join public.service_visits v on v.id = p.visit_id and v.tenant_id = p.tenant_id
        where p.tenant_id = c.tenant_id and p.visit_id = c.visit_id and p.id = any(c.photo_ids)
          and v.client_id = c.client_id and v.location_id is not distinct from c.centre_id
      ), '[]'::jsonb))
    from app_private.incident_quote_reviews c
    join public.estimates e on e.id = c.estimate_id and e.tenant_id = c.tenant_id and e.client_id = c.client_id
    where c.tenant_id = p_tenant_id and c.estimate_id = p_estimate_id and e.status = 'draft'
  );
end;
$$;

create function public.get_incident_quote_review(p_tenant_id uuid, p_incident_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
begin atomic select app_private.get_incident_quote_review(p_tenant_id, p_incident_id); end;
create function public.create_incident_quote_draft(
  p_tenant_id uuid, p_incident_id uuid, p_client_id uuid, p_centre_id uuid,
  p_incident_version timestamptz, p_title text, p_lines jsonb, p_photo_ids uuid[], p_operation_id uuid
) returns uuid language sql security invoker set search_path = ''
begin atomic select app_private.create_incident_quote_draft(p_tenant_id, p_incident_id, p_client_id,
  p_centre_id, p_incident_version, p_title, p_lines, p_photo_ids, p_operation_id); end;
create function public.get_incident_quote_draft_context(p_tenant_id uuid, p_estimate_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
begin atomic select app_private.get_incident_quote_draft_context(p_tenant_id, p_estimate_id); end;

revoke all on function app_private.require_incident_quote_office(uuid,boolean)
  from public, anon, authenticated, service_role;
revoke all on function
  app_private.get_incident_quote_review(uuid,uuid),
  app_private.create_incident_quote_draft(uuid,uuid,uuid,uuid,timestamptz,text,jsonb,uuid[],uuid),
  app_private.get_incident_quote_draft_context(uuid,uuid),
  public.get_incident_quote_review(uuid,uuid),
  public.create_incident_quote_draft(uuid,uuid,uuid,uuid,timestamptz,text,jsonb,uuid[],uuid),
  public.get_incident_quote_draft_context(uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  app_private.get_incident_quote_review(uuid,uuid),
  app_private.create_incident_quote_draft(uuid,uuid,uuid,uuid,timestamptz,text,jsonb,uuid[],uuid),
  app_private.get_incident_quote_draft_context(uuid,uuid),
  public.get_incident_quote_review(uuid,uuid),
  public.create_incident_quote_draft(uuid,uuid,uuid,uuid,timestamptz,text,jsonb,uuid[],uuid),
  public.get_incident_quote_draft_context(uuid,uuid)
  to authenticated;
notify pgrst, 'reload schema';
