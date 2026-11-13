-- Permit a retry of the same immutable path after registration succeeded but its
-- response was lost. No UPDATE policy exists, so the object cannot be overwritten.
drop policy signed_contracts_upload on storage.objects;
create policy signed_contracts_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'signed-contracts'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'
  and exists (select 1 from public.service_contracts c
    where c.tenant_id::text = (storage.foldername(name))[1]
      and c.id::text = (storage.foldername(name))[2]
      and (c.signed_document_path is null or c.signed_document_path = name)
      and public.has_role(c.tenant_id,array['owner','admin']::public.app_role[])
      and public.tenant_can_write(c.tenant_id))
);