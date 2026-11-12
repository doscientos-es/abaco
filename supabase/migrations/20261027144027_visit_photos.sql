-- Private evidence: the object path encodes company, visit and immutable photo ID.
insert into storage.buckets
  (id, name, public, file_size_limit, allowed_mime_types)
values ('visit-photos', 'visit-photos', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = excluded.allowed_mime_types;

create policy visit_photos_objects_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'visit-photos'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$'
    and exists (select 1 from public.service_visits v
      where v.tenant_id::text = split_part(name, '/', 1)
        and v.id::text = split_part(name, '/', 2)
        and v.status in ('scheduled', 'in_progress')
        and public.tenant_can_write(v.tenant_id)
        and (
          public.has_role(v.tenant_id,
            array['owner', 'admin', 'editor']::public.app_role[])
          or (v.assigned_user_id = (select auth.uid())
            and public.has_role(v.tenant_id,
              array['technician']::public.app_role[]))
        ))
  );
create policy visit_photos_objects_select on storage.objects
  for select to authenticated using (
    bucket_id = 'visit-photos'
    and exists (select 1 from public.service_visits v
      where v.tenant_id::text = split_part(name, '/', 1)
        and v.id::text = split_part(name, '/', 2)
        and (
          public.has_role(v.tenant_id,
            array['owner', 'admin', 'editor']::public.app_role[])
          or (v.assigned_user_id = (select auth.uid())
            and public.has_role(v.tenant_id,
              array['technician']::public.app_role[]))
        ))
  );

create table public.service_visit_photos (
  id uuid primary key,
  operation_id uuid not null unique,
  tenant_id uuid not null,
  visit_id uuid not null,
  phase text not null check (phase in ('before', 'after', 'other')),
  caption text not null default '' check (char_length(caption) <= 300),
  storage_path text not null unique,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (id, tenant_id, visit_id),
  foreign key (visit_id, tenant_id)
    references public.service_visits (id, tenant_id) on delete restrict,
  check (storage_path like tenant_id::text || '/' || visit_id::text || '/' || id::text || '.%')
);
create index service_visit_photos_visit_idx
  on public.service_visit_photos (tenant_id, visit_id, created_at);
create trigger service_visit_photos_immutable
  before update or delete on public.service_visit_photos
  for each row execute function public.reject_work_history_change();
alter table public.service_visit_photos enable row level security;
revoke all on public.service_visit_photos from public, anon, authenticated;
grant select on public.service_visit_photos to authenticated, service_role;
create policy service_visit_photos_select on public.service_visit_photos
  for select to authenticated using (
    public.has_role(tenant_id,
      array['owner', 'admin', 'editor']::public.app_role[])
    or (public.has_role(tenant_id,
      array['technician']::public.app_role[])
      and exists (select 1 from public.service_visits v
        where v.id = service_visit_photos.visit_id
          and v.tenant_id = service_visit_photos.tenant_id
          and v.assigned_user_id = (select auth.uid())))
  );

create function public.register_service_visit_photo(
  p_tenant_id uuid, p_visit_id uuid, p_photo_id uuid,
  p_phase text, p_caption text, p_extension text, p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  target public.service_visits%rowtype;
  prior public.service_visit_photos%rowtype;
  object_row storage.objects%rowtype;
  clean_caption text := pg_catalog.btrim(coalesce(p_caption, ''));
  object_path text;
  expected_mime text;
begin
  if p_tenant_id is null or p_visit_id is null or p_photo_id is null
     or p_operation_id is null or p_phase is null
     or p_phase not in ('before', 'after', 'other')
     or p_extension is null or p_extension not in ('jpg', 'png', 'webp')
     or char_length(clean_caption) > 300 then
    raise exception 'Datos de fotografía inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(p_tenant_id,
    array['owner', 'admin', 'editor', 'technician']::public.app_role[]) then
    raise exception 'No tienes permiso para registrar fotografías'
      using errcode = '42501';
  end if;
  select * into target from public.service_visits
    where id = p_visit_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Visita no encontrada' using errcode = 'P0002'; end if;
  if not (
    public.has_role(p_tenant_id,
      array['owner', 'admin', 'editor']::public.app_role[])
    or (target.assigned_user_id = (select auth.uid())
      and public.has_role(p_tenant_id,
        array['technician']::public.app_role[]))
  ) then
    raise exception 'No tienes permiso para registrar fotografías'
      using errcode = '42501';
  end if;
  object_path := p_tenant_id::text || '/' || p_visit_id::text || '/'
    || p_photo_id::text || '.' || p_extension;
  select * into prior from public.service_visit_photos
    where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.visit_id <> p_visit_id
       or prior.id <> p_photo_id or prior.phase <> p_phase
       or prior.caption <> clean_caption or prior.storage_path <> object_path then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return prior.id;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede registrar fotografías'
      using errcode = 'P0402';
  end if;
  if target.status not in ('scheduled', 'in_progress') then
    raise exception 'La visita cerrada no admite fotografías'
      using errcode = 'P0409';
  end if;
  if (select count(*) from public.service_visit_photos
    where tenant_id = p_tenant_id and visit_id = p_visit_id) >= 20 then
    raise exception 'La visita ya tiene 20 fotografías' using errcode = 'P0409';
  end if;
  select * into object_row from storage.objects
    where bucket_id = 'visit-photos' and name = object_path;
  expected_mime := case p_extension
    when 'jpg' then 'image/jpeg' when 'png' then 'image/png'
    else 'image/webp' end;
  if not found or object_row.owner_id is distinct from (select auth.uid())::text
     or object_row.metadata->>'mimetype' is distinct from expected_mime then
    raise exception 'La fotografía privada no se ha subido con este usuario y formato'
      using errcode = 'P0409';
  end if;
  insert into public.service_visit_photos (
    id, operation_id, tenant_id, visit_id, phase,
    caption, storage_path, created_by
  ) values (
    p_photo_id, p_operation_id, p_tenant_id, p_visit_id,
    p_phase, clean_caption, object_path, (select auth.uid())
  );
  return p_photo_id;
end;
$$;
revoke all on function public.register_service_visit_photo(
  uuid, uuid, uuid, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.register_service_visit_photo(
  uuid, uuid, uuid, text, text, text, uuid
) to authenticated;
