-- Employee documents contain sensitive personal data. Only company administrators
-- may access them; removing a membership must not delete the retained documents.
create table public.worker_documents (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id),
  worker_id uuid not null references public.profiles(id),
  object_path text not null unique,
  name text not null check (char_length(trim(name)) between 1 and 240),
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  check (object_path = tenant_id::text || '/' || worker_id::text || '/' || id::text)
);
create index worker_documents_worker_idx on public.worker_documents(tenant_id, worker_id, created_at desc);
alter table public.worker_documents enable row level security;
revoke all on public.worker_documents from public, anon, authenticated;
grant select on public.worker_documents to authenticated;
create policy worker_documents_read on public.worker_documents for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin']::public.app_role[]));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('worker-documents', 'worker-documents', false, 15728640,
  array['application/pdf','image/jpeg','image/png','image/webp']);

create policy worker_documents_objects_read on storage.objects for select to authenticated using (
  bucket_id = 'worker-documents' and (
    exists (select 1 from public.worker_documents d where d.object_path = name
      and public.has_role(d.tenant_id, array['owner','admin']::public.app_role[]))
    or (owner_id = auth.uid()::text and exists (
      select 1 from public.memberships m
      where m.tenant_id::text = (storage.foldername(name))[1]
        and m.user_id::text = (storage.foldername(name))[2]
        and public.has_role(m.tenant_id, array['owner','admin']::public.app_role[])
    ))
  )
);
create policy worker_documents_objects_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'worker-documents'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (select 1 from public.memberships m
    where m.tenant_id::text = (storage.foldername(name))[1]
      and m.user_id::text = (storage.foldername(name))[2]
      and public.has_role(m.tenant_id, array['owner','admin']::public.app_role[])
      and public.tenant_can_write(m.tenant_id))
);

create function public.register_worker_document(
  p_tenant_id uuid, p_worker_id uuid, p_id uuid, p_name text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  path text := p_tenant_id::text || '/' || p_worker_id::text || '/' || p_id::text;
  document_name text := trim(p_name);
begin
  if auth.uid() is null or not public.has_role(p_tenant_id, array['owner','admin']::public.app_role[])
    or not public.tenant_can_write(p_tenant_id) then
    raise exception 'No tienes permiso para guardar documentos.' using errcode = '42501';
  end if;
  if p_id is null or document_name is null or char_length(document_name) not between 1 and 240
    or not exists (select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = p_worker_id)
    or not exists (select 1 from storage.objects o where o.bucket_id = 'worker-documents'
      and o.name = path and o.owner_id = auth.uid()::text
      and o.metadata->>'mimetype' in ('application/pdf','image/jpeg','image/png','image/webp')
      and (o.metadata->>'size')::bigint between 1 and 15728640) then
    raise exception 'Documento o trabajador no válido.' using errcode = '22023';
  end if;
  insert into public.worker_documents(id, tenant_id, worker_id, object_path, name, created_by)
    values (p_id, p_tenant_id, p_worker_id, path, document_name, auth.uid())
    on conflict (id) do nothing;
  if not exists (select 1 from public.worker_documents d where d.id = p_id and d.tenant_id = p_tenant_id
    and d.worker_id = p_worker_id and d.object_path = path and d.name = document_name and d.created_by = auth.uid()) then
    raise exception 'El identificador del documento ya está en uso.' using errcode = '23505';
  end if;
end;
$$;
revoke all on function public.register_worker_document(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.register_worker_document(uuid,uuid,uuid,text) to authenticated;