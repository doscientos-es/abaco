insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('ledger-attachments', 'ledger-attachments', false, 15728640,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  ('brand-logos', 'brand-logos', true, 2097152,
    array['image/jpeg', 'image/png', 'image/webp']);

-- Objects are the attachment records. Keep their parent and permissions tied to the ledger.
create function public.can_access_ledger_attachment(object_name text, writing boolean)
returns boolean language plpgsql set search_path = '' as $$
declare
  tenant uuid;
  entry_id uuid;
  uuid_pattern constant text := '[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}';
begin
  if object_name !~ ('^' || uuid_pattern || '/' || uuid_pattern || '/' || uuid_pattern ||
      '_[a-zA-Z0-9_-]{1,120}\.(pdf|jpg|png|webp)$') then
    return false;
  end if;
  tenant := split_part(object_name, '/', 1)::uuid;
  entry_id := split_part(object_name, '/', 2)::uuid;
  if not public.has_role(tenant, array['owner','admin']::public.app_role[]) then
    return false;
  end if;
  if writing then
    if not public.tenant_can_write(tenant) then return false; end if;
    -- Serialize an upload and a concurrent removal or move of its parent ledger entry.
    perform 1 from public.ledger_entries l where l.tenant_id = tenant and l.id = entry_id for share;
    return found;
  end if;
  return exists (select 1 from public.ledger_entries l where l.tenant_id = tenant and l.id = entry_id);
end;
$$;
revoke all on function public.can_access_ledger_attachment(text, boolean) from public, anon;
grant execute on function public.can_access_ledger_attachment(text, boolean) to authenticated;

create policy ledger_attachments_read on storage.objects for select to authenticated
  using (bucket_id = 'ledger-attachments' and public.can_access_ledger_attachment(name, false));
create policy ledger_attachments_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'ledger-attachments' and public.can_access_ledger_attachment(name, true));
create policy ledger_attachments_remove on storage.objects for delete to authenticated
  using (bucket_id = 'ledger-attachments' and public.can_access_ledger_attachment(name, true));

-- Never delete storage rows via SQL: remove files through the Storage API first.
create function public.guard_ledger_attachment_parent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.tenant_id = old.tenant_id and new.id = old.id then return new; end if;
  end if;
  if exists (select 1 from storage.objects o where o.bucket_id = 'ledger-attachments'
      and o.name like old.tenant_id::text || '/' || old.id::text || '/%') then
    raise exception 'Quita los justificantes antes de eliminar o mover el apunte.' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;
revoke all on function public.guard_ledger_attachment_parent() from public, anon, authenticated;
create trigger ledger_attachments_guard_parent before delete or update of tenant_id, id on public.ledger_entries
  for each row execute function public.guard_ledger_attachment_parent();

-- Public by design for documents and shared links. Files are immutable so issued documents
-- referencing an earlier logo keep rendering it after a replacement.
create policy brand_logos_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'brand-logos' and case
    when name ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(jpg|png|webp)$'
    then public.has_role(split_part(name, '/', 1)::uuid, array['owner','admin']::public.app_role[])
      and public.tenant_can_write(split_part(name, '/', 1)::uuid)
    else false end
);
