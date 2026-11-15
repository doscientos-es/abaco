-- Qualify the object name: worker_documents also has a name column.
drop policy worker_documents_objects_read on storage.objects;
create policy worker_documents_objects_read on storage.objects for select to authenticated using (
  bucket_id = 'worker-documents' and (
    exists (select 1 from public.worker_documents d where d.object_path = storage.objects.name
      and public.has_role(d.tenant_id, array['owner','admin']::public.app_role[]))
    or (owner_id = auth.uid()::text and exists (
      select 1 from public.memberships m
      where m.tenant_id::text = (storage.foldername(storage.objects.name))[1]
        and m.user_id::text = (storage.foldername(storage.objects.name))[2]
        and public.has_role(m.tenant_id, array['owner','admin']::public.app_role[])
    ))
  )
);