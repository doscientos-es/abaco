-- Workers may attach and consult signed sheets only for visits assigned to them.
create policy worker_signed_documents_read on public.visit_signed_documents
  for select to authenticated using (public.can_access_assigned_visit(tenant_id, visit_id));

create policy worker_signed_documents_insert on public.visit_signed_documents
  for insert to authenticated with check (
    created_by = (select auth.uid()) and public.tenant_can_write(tenant_id)
    and public.can_access_assigned_visit(tenant_id, visit_id)
    and exists (select 1 from public.service_visits v where v.id = visit_signed_documents.visit_id
      and v.tenant_id = visit_signed_documents.tenant_id and v.status in ('scheduled', 'in_progress', 'completed'))
    and exists (select 1 from storage.objects o
      where o.bucket_id = 'signed-work-sheets' and o.name = object_path)
  );

create policy worker_signed_sheets_read on storage.objects
  for select to authenticated using (
    bucket_id = 'signed-work-sheets' and exists (
      select 1 from public.service_visits v
      where v.tenant_id::text = split_part(storage.objects.name, '/', 1)
        and v.id::text = split_part(storage.objects.name, '/', 2)
        and public.can_access_assigned_visit(v.tenant_id, v.id)
    )
  );

create policy worker_signed_sheets_upload on storage.objects
  for insert to authenticated with check (
    bucket_id = 'signed-work-sheets'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (select 1 from public.service_visits v
      where v.tenant_id::text = split_part(storage.objects.name, '/', 1)
        and v.id::text = split_part(storage.objects.name, '/', 2)
        and v.status in ('scheduled', 'in_progress', 'completed')
        and public.tenant_can_write(v.tenant_id)
        and public.can_access_assigned_visit(v.tenant_id, v.id))
  );