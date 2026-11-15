-- Company-wide reusable prose, copied into each new contract rather than read live.
create table public.contract_document_templates (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  sections jsonb not null,
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.contract_document_templates enable row level security;
revoke all on public.contract_document_templates from public, anon, authenticated;
grant select on public.contract_document_templates to authenticated;
create policy contract_document_templates_select on public.contract_document_templates
  for select to authenticated using (
    public.has_role(tenant_id, array['owner','admin','editor']::public.app_role[])
  );

alter table public.service_contracts add column document_sections jsonb;

create function public.save_contract_document_template(
  p_tenant_id uuid, p_expected_revision integer, p_sections jsonb
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  current_revision integer;
  position text;
  item jsonb;
  ids text[] := array[]::text[];
begin
  if auth.uid() is null or not public.has_role(p_tenant_id, array['owner','admin','editor']::public.app_role[])
     or not public.tenant_can_write(p_tenant_id) then
    raise exception 'No tienes permiso para editar la plantilla' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_sections is null
     or jsonb_typeof(p_sections) <> 'object'
     or jsonb_typeof(p_sections->'before') is distinct from 'array'
     or jsonb_typeof(p_sections->'after') is distinct from 'array'
     or (select count(*) from jsonb_object_keys(p_sections)) <> 2 then
    raise exception 'Plantilla no válida' using errcode = '22023';
  end if;
  foreach position in array array['before','after'] loop
    if jsonb_array_length(p_sections->position) > 20 then
      raise exception 'Demasiadas secciones' using errcode = '22023';
    end if;
    for item in select value from jsonb_array_elements(p_sections->position) loop
      if jsonb_typeof(item) <> 'object' or (select count(*) from jsonb_object_keys(item)) <> 4
         or jsonb_typeof(item->'id') is distinct from 'string'
         or char_length(item->>'id') not between 1 and 100
         or item->>'id' = any(ids)
         or jsonb_typeof(item->'title') is distinct from 'string'
         or char_length(item->>'title') > 200
         or jsonb_typeof(item->'content') is distinct from 'string'
         or char_length(item->>'content') > 10000
         or jsonb_typeof(item->'pageBreakBefore') is distinct from 'boolean' then
        raise exception 'Sección no válida' using errcode = '22023';
      end if;
      ids := array_append(ids, item->>'id');
    end loop;
  end loop;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('contract-template:' || p_tenant_id::text, 0));
  select revision into current_revision from public.contract_document_templates where tenant_id = p_tenant_id;
  if coalesce(current_revision, 0) <> p_expected_revision then
    raise exception 'La plantilla ha cambiado. Recarga antes de guardar.' using errcode = '40001';
  end if;
  insert into public.contract_document_templates(tenant_id, sections, revision)
    values(p_tenant_id, p_sections, 1)
  on conflict (tenant_id) do update set sections = excluded.sections,
    revision = public.contract_document_templates.revision + 1, updated_at = clock_timestamp()
  returning revision into current_revision;
  return current_revision;
end;
$$;
revoke all on function public.save_contract_document_template(uuid,integer,jsonb) from public, anon;
grant execute on function public.save_contract_document_template(uuid,integer,jsonb) to authenticated;

create function public.snapshot_contract_document_template() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select sections into new.document_sections from public.contract_document_templates where tenant_id = new.tenant_id;
  new.document_sections := coalesce(new.document_sections, '{"before":[],"after":[]}'::jsonb);
  return new;
end;
$$;
revoke all on function public.snapshot_contract_document_template() from public, anon, authenticated;
create trigger service_contracts_snapshot_document before insert on public.service_contracts
  for each row execute function public.snapshot_contract_document_template();

create function public.apply_contract_document_template(
  p_tenant_id uuid, p_contract_id uuid, p_expected_updated_at timestamptz, p_operation_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare
  target public.service_contracts%rowtype;
  prior public.service_contract_events%rowtype;
  template jsonb;
begin
  if auth.uid() is null or not public.has_role(p_tenant_id, array['owner','admin','editor']::public.app_role[])
     or not public.tenant_can_write(p_tenant_id) then
    raise exception 'No tienes permiso para editar el contrato' using errcode = '42501';
  end if;
  if p_contract_id is null or p_expected_updated_at is null or p_operation_id is null then
    raise exception 'Datos de operación no válidos' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text, 0));
  select * into target from public.service_contracts where tenant_id = p_tenant_id and id = p_contract_id for update;
  if not found then raise exception 'Contrato no encontrado' using errcode = 'P0002'; end if;
  select * into prior from public.service_contract_events where operation_id = p_operation_id;
  if found then
    if prior.tenant_id = p_tenant_id and prior.contract_id = p_contract_id and prior.actor_id = auth.uid()
       and prior.kind = 'details_updated' and prior.payload->>'action' = 'document_template_applied' then return; end if;
    raise exception 'La operación ya se utilizó' using errcode = '23505';
  end if;
  if target.status <> 'draft' or target.signed_at is not null then
    raise exception 'Solo se puede actualizar un borrador sin firmar' using errcode = '22023';
  end if;
  if target.updated_at <> p_expected_updated_at then
    raise exception 'El contrato ha cambiado. Recarga antes de continuar.' using errcode = '40001';
  end if;
  select sections into template from public.contract_document_templates where tenant_id = p_tenant_id;
  template := coalesce(template, '{"before":[],"after":[]}'::jsonb);
  update public.service_contracts set document_sections = template where id = target.id and tenant_id = p_tenant_id;
  insert into public.service_contract_events(operation_id,tenant_id,contract_id,kind,payload,actor_id)
    values(p_operation_id,p_tenant_id,p_contract_id,'details_updated',
      jsonb_build_object('action','document_template_applied','before',target.document_sections,'sections',template),auth.uid());
end;
$$;
revoke all on function public.apply_contract_document_template(uuid,uuid,timestamptz,uuid) from public, anon;
grant execute on function public.apply_contract_document_template(uuid,uuid,timestamptz,uuid) to authenticated;