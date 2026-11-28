-- Stable workbook identifiers belong to an explicit tenant namespace. No existing
-- fiscal/contact/address values acquire a uniqueness constraint or are rewritten.
create table public.directory_workbook_client_keys (
  tenant_id uuid not null,
  source_namespace text not null check (source_namespace ~ '^[a-z0-9][a-z0-9._-]{0,39}$'),
  source_key text not null check (source_key ~ '^[a-z0-9][a-z0-9._/-]{0,79}$'),
  client_id uuid not null,
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, source_namespace, source_key),
  foreign key (client_id, tenant_id) references public.clients (id, tenant_id) on delete cascade
);
create index directory_workbook_client_keys_client_idx
  on public.directory_workbook_client_keys (client_id, tenant_id);

create table public.directory_workbook_location_keys (
  tenant_id uuid not null,
  source_namespace text not null check (source_namespace ~ '^[a-z0-9][a-z0-9._-]{0,39}$'),
  source_key text not null check (source_key ~ '^[a-z0-9][a-z0-9._/-]{0,79}$'),
  client_id uuid not null,
  location_id uuid not null,
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, source_namespace, client_id, source_key),
  foreign key (location_id, tenant_id, client_id)
    references public.service_locations (id, tenant_id, client_id) on delete cascade
);
create index directory_workbook_location_keys_location_idx
  on public.directory_workbook_location_keys (location_id, tenant_id, client_id);

alter table public.directory_workbook_client_keys enable row level security;
alter table public.directory_workbook_location_keys enable row level security;
revoke all on public.directory_workbook_client_keys, public.directory_workbook_location_keys
  from public, anon, authenticated;
grant select on public.directory_workbook_client_keys, public.directory_workbook_location_keys
  to authenticated;
create policy directory_workbook_client_keys_admin_read on public.directory_workbook_client_keys
  for select to authenticated using (
    public.has_role(tenant_id, array['owner','admin']::public.app_role[])
    and public.company_onboarding_allows_workspace(tenant_id)
  );
create policy directory_workbook_location_keys_admin_read on public.directory_workbook_location_keys
  for select to authenticated using (
    public.has_role(tenant_id, array['owner','admin']::public.app_role[])
    and public.company_onboarding_allows_workspace(tenant_id)
  );

create function app_private.import_directory_workbook_row(
  p_tenant_id uuid, p_namespace text, p_source_key text, p_target text,
  p_parent_client_id uuid, p_values jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  ns text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_namespace,'')));
  src text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_source_key,'')));
  clean_name text := pg_catalog.btrim(coalesce(p_values->>'name',''));
  clean_tax_id text := pg_catalog.btrim(coalesce(p_values->>'taxId',''));
  clean_email text := pg_catalog.btrim(coalesce(p_values->>'email',''));
  clean_address text := pg_catalog.btrim(coalesce(p_values->>'address',''));
  clean_city text := pg_catalog.btrim(coalesce(p_values->>'city',''));
  clean_postal text := pg_catalog.btrim(coalesce(p_values->>'postalCode',''));
  clean_kind text := pg_catalog.btrim(coalesce(p_values->>'kind',''));
  created_id uuid;
begin
  if actor is null or not coalesce(public.has_role(p_tenant_id, array['owner','admin']::public.app_role[]), false)
     or not coalesce(public.tenant_can_write(p_tenant_id), false)
     or not coalesce(public.company_onboarding_allows_workspace(p_tenant_id), false) then
    raise exception 'No tienes permiso para importar en esta empresa' using errcode = '42501';
  end if;
  if ns !~ '^[a-z0-9][a-z0-9._-]{0,39}$' or src !~ '^[a-z0-9][a-z0-9._/-]{0,79}$'
     or p_target is null or p_target not in ('client','location')
     or (p_target = 'client') is distinct from (p_parent_client_id is null)
     or p_values is null or pg_catalog.jsonb_typeof(p_values) <> 'object'
     or pg_catalog.octet_length(p_values::text) > 10000
     or char_length(clean_name) not between 1 and 160 then
    raise exception 'Fila o identificador de importación no válido' using errcode = '22023';
  end if;

  if exists (
    select 1 from pg_catalog.jsonb_each(p_values) part
    where pg_catalog.jsonb_typeof(part.value) <> 'string'
       or (p_target = 'client' and part.key not in ('name','taxId','email','kind'))
       or (p_target = 'location' and part.key not in ('name','address','city','postalCode'))
  ) then
    raise exception 'La fila contiene campos no reconocidos' using errcode = '22023';
  end if;

  -- Serialize this importer within a tenant even across distinct source namespaces.
  -- Natural-value checks are conservative collision hints, not entity identities.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'directory_workbook:' || p_tenant_id::text, 0
  ));
  if p_target = 'client' then
    if exists (select 1 from public.directory_workbook_client_keys
      where tenant_id = p_tenant_id and source_namespace = ns and source_key = src) then
      return jsonb_build_object('status','repeated');
    end if;
    if char_length(clean_tax_id) > 32 or char_length(clean_email) > 254
       or (clean_email <> '' and clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
       or not exists (select 1 from public.client_types
         where tenant_id = p_tenant_id and value = clean_kind) then
      raise exception 'Nombre, identificación fiscal, correo o tipo no válidos' using errcode = '22023';
    end if;
    if exists (select 1 from public.clients c where c.tenant_id = p_tenant_id and (
      pg_catalog.lower(pg_catalog.btrim(c.name)) = pg_catalog.lower(clean_name)
      or (clean_tax_id <> '' and nullif(pg_catalog.regexp_replace(pg_catalog.upper(clean_tax_id),'[[:space:]-]','','g'),'')
        = pg_catalog.regexp_replace(pg_catalog.upper(c.tax_id),'[[:space:]-]','','g'))
      or (clean_email <> '' and pg_catalog.lower(pg_catalog.btrim(c.email)) = pg_catalog.lower(clean_email))
    )) then
      return jsonb_build_object('status','collision');
    end if;
    insert into public.clients (tenant_id, name, tax_id, email, kind)
      values (p_tenant_id, clean_name, clean_tax_id, clean_email, clean_kind)
      returning id into created_id;
    insert into public.directory_workbook_client_keys
      (tenant_id,source_namespace,source_key,client_id,created_by)
      values (p_tenant_id,ns,src,created_id,actor);
  else
    if exists (select 1 from public.directory_workbook_location_keys
      where tenant_id = p_tenant_id and source_namespace = ns and client_id = p_parent_client_id and source_key = src) then
      return jsonb_build_object('status','repeated');
    end if;
    perform 1 from public.clients where id = p_parent_client_id and tenant_id = p_tenant_id
      and archived_at is null for share;
    if not found then
      return jsonb_build_object('status','invalid_parent');
    end if;
    if char_length(clean_address) not between 1 and 500
       or char_length(clean_city) > 160 or char_length(clean_postal) > 32 then
      raise exception 'Dirección, municipio o código postal no válidos' using errcode = '22023';
    end if;
    if exists (select 1 from public.service_locations l
      where l.tenant_id = p_tenant_id and l.client_id = p_parent_client_id and (
        pg_catalog.lower(pg_catalog.btrim(l.name)) = pg_catalog.lower(clean_name)
        or pg_catalog.lower(pg_catalog.btrim(l.address)) = pg_catalog.lower(clean_address)
    )) then return jsonb_build_object('status','collision'); end if;
    insert into public.service_locations (tenant_id,client_id,name,address,city,postal_code)
      values (p_tenant_id,p_parent_client_id,clean_name,clean_address,clean_city,clean_postal)
      returning id into created_id;
    insert into public.directory_workbook_location_keys
      (tenant_id,source_namespace,source_key,client_id,location_id,created_by)
      values (p_tenant_id,ns,src,p_parent_client_id,created_id,actor);
  end if;
  return jsonb_build_object('status','created','id',created_id);
end;
$$;
revoke all on function app_private.import_directory_workbook_row(uuid,text,text,text,uuid,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function app_private.import_directory_workbook_row(uuid,text,text,text,uuid,jsonb)
  to authenticated;

create function public.import_directory_workbook_row(
  p_tenant_id uuid, p_namespace text, p_source_key text, p_target text,
  p_parent_client_id uuid, p_values jsonb
) returns jsonb language sql security invoker set search_path = ''
return app_private.import_directory_workbook_row(
  p_tenant_id,p_namespace,p_source_key,p_target,p_parent_client_id,p_values
);
revoke all on function public.import_directory_workbook_row(uuid,text,text,text,uuid,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.import_directory_workbook_row(uuid,text,text,text,uuid,jsonb)
  to authenticated;

notify pgrst, 'reload schema';
