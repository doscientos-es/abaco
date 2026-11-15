-- Keep legacy templates and existing contract copies untouched.
create table public.contract_template_sections (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  title text not null check (char_length(title) <= 200),
  content text not null check (char_length(content) <= 10000),
  page_break_before boolean not null default false,
  format text not null check (format in ('plain', 'markdown')),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id)
);
create table public.contract_template_library (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 200),
  before_ids text[] not null default '{}',
  after_ids text[] not null default '{}',
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id)
);
alter table public.contract_template_sections enable row level security;
alter table public.contract_template_library enable row level security;
revoke all on public.contract_template_sections, public.contract_template_library from public, anon, authenticated;
grant select on public.contract_template_sections, public.contract_template_library to authenticated;
create policy contract_template_sections_read on public.contract_template_sections for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','editor']::public.app_role[]));
create policy contract_template_library_read on public.contract_template_library for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','editor']::public.app_role[]));

-- Import the old configuration as plain text; do not reinterpret legal prose as Markdown.
insert into public.contract_template_sections (tenant_id,id,title,content,page_break_before,format)
select t.tenant_id, s.value->>'id', s.value->>'title', s.value->>'content',
  (s.value->>'pageBreakBefore')::boolean, 'plain'
from public.contract_document_templates t
cross join lateral jsonb_array_elements((t.sections->'before') || (t.sections->'after')) s;
insert into public.contract_template_library (tenant_id,id,name,before_ids,after_ids)
select t.tenant_id, gen_random_uuid(), 'Plantilla anterior',
  array(select value->>'id' from jsonb_array_elements(t.sections->'before')),
  array(select value->>'id' from jsonb_array_elements(t.sections->'after'))
from public.contract_document_templates t;

alter table public.service_contracts add column document_template_id uuid,
  add column document_template_name text;

create function public.save_contract_template_section(
  p_tenant_id uuid, p_id text, p_expected_revision integer, p_title text, p_content text,
  p_page_break_before boolean, p_format text
) returns integer language plpgsql security definer set search_path = '' as $$
declare current_revision integer;
begin
  if auth.uid() is null or not public.has_role(p_tenant_id, array['owner','admin','editor']::public.app_role[])
     or not public.tenant_can_write(p_tenant_id) then
    raise exception 'No tienes permiso para editar secciones' using errcode='42501';
  end if;
  if p_id is null or char_length(p_id) not between 1 and 100 or p_expected_revision is null or p_expected_revision < 0
     or p_title is null or char_length(p_title) > 200 or p_content is null or char_length(p_content) > 10000
     or p_page_break_before is null or p_format is null or p_format not in ('plain','markdown') then
    raise exception 'Sección no válida' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('contract-library:' || p_tenant_id::text, 0));
  select revision into current_revision from public.contract_template_sections where tenant_id=p_tenant_id and id=p_id;
  if coalesce(current_revision,0) <> p_expected_revision then
    raise exception 'La sección ha cambiado. Recarga antes de guardar.' using errcode='40001';
  end if;
  insert into public.contract_template_sections (tenant_id,id,title,content,page_break_before,format)
    values (p_tenant_id,p_id,p_title,p_content,p_page_break_before,p_format)
  on conflict (tenant_id,id) do update set title=excluded.title, content=excluded.content,
    page_break_before=excluded.page_break_before, format=excluded.format,
    revision=public.contract_template_sections.revision+1, updated_at=clock_timestamp()
  returning revision into current_revision;
  return current_revision;
end $$;

create function public.save_contract_library_template(
  p_tenant_id uuid, p_id uuid, p_expected_revision integer, p_name text, p_before_ids text[], p_after_ids text[]
) returns integer language plpgsql security definer set search_path = '' as $$
declare current_revision integer; all_ids text[];
begin
  if auth.uid() is null or not public.has_role(p_tenant_id, array['owner','admin','editor']::public.app_role[])
     or not public.tenant_can_write(p_tenant_id) then
    raise exception 'No tienes permiso para editar plantillas' using errcode='42501';
  end if;
  if p_id is null or p_expected_revision is null or p_expected_revision < 0 or p_name is null
     or char_length(trim(p_name)) not between 1 and 200 or p_before_ids is null or p_after_ids is null
     or cardinality(p_before_ids) > 20 or cardinality(p_after_ids) > 20 then
    raise exception 'Plantilla no válida' using errcode='22023';
  end if;
  all_ids := p_before_ids || p_after_ids;
  if array_position(all_ids,null) is not null or cardinality(all_ids) <> (select count(distinct v) from unnest(all_ids) v) then
    raise exception 'Las secciones deben ser únicas' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('contract-library:' || p_tenant_id::text, 0));
  if cardinality(all_ids) <> (select count(*) from public.contract_template_sections where tenant_id=p_tenant_id and id=any(all_ids)) then
    raise exception 'Hay secciones inexistentes' using errcode='22023';
  end if;
  select revision into current_revision from public.contract_template_library where tenant_id=p_tenant_id and id=p_id;
  if coalesce(current_revision,0) <> p_expected_revision then
    raise exception 'La plantilla ha cambiado. Recarga antes de guardar.' using errcode='40001';
  end if;
  insert into public.contract_template_library (tenant_id,id,name,before_ids,after_ids)
    values (p_tenant_id,p_id,trim(p_name),p_before_ids,p_after_ids)
  on conflict (tenant_id,id) do update set name=excluded.name, before_ids=excluded.before_ids,
    after_ids=excluded.after_ids, revision=public.contract_template_library.revision+1, updated_at=clock_timestamp()
  returning revision into current_revision;
  return current_revision;
end $$;

create function public.apply_contract_library_template(
  p_tenant_id uuid, p_contract_id uuid, p_template_id uuid, p_template_revision integer,
  p_expected_updated_at timestamptz, p_operation_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare target public.service_contracts%rowtype; prior public.service_contract_events%rowtype;
  template public.contract_template_library%rowtype; snapshot jsonb; expected_count integer;
begin
  if auth.uid() is null or not public.has_role(p_tenant_id, array['owner','admin','editor']::public.app_role[])
     or not public.tenant_can_write(p_tenant_id) then
    raise exception 'No tienes permiso para editar el contrato' using errcode='42501';
  end if;
  if p_contract_id is null or p_template_id is null or p_template_revision is null
     or p_expected_updated_at is null or p_operation_id is null then
    raise exception 'Datos de operación no válidos' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text, 0));
  select * into target from public.service_contracts where tenant_id=p_tenant_id and id=p_contract_id for update;
  if not found then raise exception 'Contrato no encontrado' using errcode='P0002'; end if;
  select * into prior from public.service_contract_events where operation_id=p_operation_id;
  if found then
    if prior.tenant_id=p_tenant_id and prior.contract_id=p_contract_id and prior.actor_id=auth.uid()
       and prior.kind='details_updated' and prior.payload->>'action'='library_template_applied'
       and prior.payload->>'template_id'=p_template_id::text then return; end if;
    raise exception 'La operación ya se utilizó' using errcode='23505';
  end if;
  if target.status <> 'draft' or target.signed_at is not null then
    raise exception 'Solo se puede actualizar un borrador sin firmar' using errcode='22023';
  end if;
  if target.updated_at <> p_expected_updated_at then
    raise exception 'El contrato ha cambiado. Recarga antes de continuar.' using errcode='40001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('contract-library:' || p_tenant_id::text, 0));
  select * into template from public.contract_template_library where tenant_id=p_tenant_id and id=p_template_id;
  if not found or template.revision <> p_template_revision then
    raise exception 'La plantilla ha cambiado. Recarga antes de continuar.' using errcode='40001';
  end if;
  expected_count := cardinality(template.before_ids) + cardinality(template.after_ids);
  if expected_count <> (select count(*) from public.contract_template_sections where tenant_id=p_tenant_id and id=any(template.before_ids || template.after_ids)) then
    raise exception 'Faltan secciones de la plantilla' using errcode='22023';
  end if;
  select jsonb_build_object('before', coalesce(jsonb_agg(item order by position) filter (where part='before'),'[]'::jsonb),
    'after', coalesce(jsonb_agg(item order by position) filter (where part='after'),'[]'::jsonb)) into snapshot
  from (
    select refs.part, refs.position, jsonb_build_object('id',s.id,'title',s.title,'content',s.content,'pageBreakBefore',s.page_break_before)
      || case when s.format='markdown' then '{"format":"markdown"}'::jsonb else '{}'::jsonb end as item
    from (select 'before'::text as part, id, position from unnest(template.before_ids) with ordinality r(id,position)
      union all select 'after', id, position from unnest(template.after_ids) with ordinality r(id,position)) refs
    join public.contract_template_sections s on s.tenant_id=p_tenant_id and s.id=refs.id
  ) ordered;
  update public.service_contracts set document_sections=snapshot, document_template_id=template.id,
    document_template_name=template.name where id=target.id and tenant_id=p_tenant_id;
  insert into public.service_contract_events(operation_id,tenant_id,contract_id,kind,payload,actor_id)
    values(p_operation_id,p_tenant_id,p_contract_id,'details_updated',jsonb_build_object(
      'action','library_template_applied','template_id',template.id,'template_name',template.name,
      'before',target.document_sections,'sections',snapshot),auth.uid());
end $$;
revoke all on function public.save_contract_template_section(uuid,text,integer,text,text,boolean,text) from public, anon;
revoke all on function public.save_contract_library_template(uuid,uuid,integer,text,text[],text[]) from public, anon;
revoke all on function public.apply_contract_library_template(uuid,uuid,uuid,integer,timestamptz,uuid) from public, anon;
grant execute on function public.save_contract_template_section(uuid,text,integer,text,text,boolean,text) to authenticated;
grant execute on function public.save_contract_library_template(uuid,uuid,integer,text,text[],text[]) to authenticated;
grant execute on function public.apply_contract_library_template(uuid,uuid,uuid,integer,timestamptz,uuid) to authenticated;