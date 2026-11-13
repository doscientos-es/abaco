-- A recorded signature is independent of operational activation and scheduling.
alter table public.service_contracts
  add column signed_at timestamptz,
  add column signed_by uuid references public.profiles(id),
  add column signed_document_path text unique,
  add column signed_document_name text,
  add constraint service_contract_signature_check check (
    (signed_at is null) = (signed_by is null)
    and (signed_document_path is null) = (signed_document_name is null)
    and (signed_document_path is null or (signed_at is not null
      and char_length(signed_document_name) between 1 and 240
      and signed_document_path ~ ('^' || tenant_id::text || '/' || id::text || '/[0-9a-f-]{36}\.pdf$')))
  );
create index service_contracts_signed_by_idx on public.service_contracts(signed_by)
  where signed_by is not null;

alter table public.service_contract_events drop constraint service_contract_events_kind_check;
alter table public.service_contract_events add constraint service_contract_events_kind_check
  check (kind in ('created','rule_added','status_changed','details_updated','service_updated',
    'signed','signed_document_attached'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('signed-contracts','signed-contracts',false,15728640,array['application/pdf']);

create policy signed_contracts_read on storage.objects for select to authenticated using (
  bucket_id = 'signed-contracts' and exists (
    select 1 from public.service_contracts c where c.signed_document_path = name
      and public.has_role(c.tenant_id,array['owner','admin']::public.app_role[])
  )
);
create policy signed_contracts_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'signed-contracts'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'
  and exists (select 1 from public.service_contracts c
    where c.tenant_id::text = (storage.foldername(name))[1]
      and c.id::text = (storage.foldername(name))[2]
      and c.signed_document_path is null
      and public.has_role(c.tenant_id,array['owner','admin']::public.app_role[])
      and public.tenant_can_write(c.tenant_id))
);

create function public.record_contract_signature(
  p_tenant_id uuid, p_contract_id uuid, p_expected_updated_at timestamptz,
  p_operation_id uuid, p_document_path text default null, p_document_name text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  target public.service_contracts%rowtype;
  prior public.service_contract_events%rowtype;
  event_kind text;
  document_name text := nullif(trim(p_document_name),'');
begin
  if auth.uid() is null or not public.has_role(p_tenant_id,array['owner','admin']::public.app_role[])
    or not public.tenant_can_write(p_tenant_id) then
    raise exception 'Solo un administrador de la empresa puede registrar la firma.' using errcode='42501';
  end if;
  if p_tenant_id is null or p_contract_id is null or p_expected_updated_at is null
    or p_operation_id is null or (p_document_path is null) <> (document_name is null)
    or char_length(document_name) > 240 then
    raise exception 'Datos de firma no válidos.' using errcode='22023';
  end if;
  select * into target from public.service_contracts
    where tenant_id=p_tenant_id and id=p_contract_id for update;
  if not found then raise exception 'Contrato no encontrado.' using errcode='P0002'; end if;
  select * into prior from public.service_contract_events where operation_id=p_operation_id;
  if found then
    if prior.tenant_id=p_tenant_id and prior.contract_id=p_contract_id and prior.actor_id=auth.uid()
      and prior.kind in ('signed','signed_document_attached')
      and (prior.payload->>'document_path') is not distinct from p_document_path
      and (prior.payload->>'document_name') is not distinct from document_name then return; end if;
    raise exception 'La operación ya se utilizó para otra acción.' using errcode='22023';
  end if;
  if target.updated_at is distinct from p_expected_updated_at then
    raise exception 'El contrato ha cambiado. Recarga la lista y vuelve a intentarlo.' using errcode='40001';
  end if;
  if target.signed_at is not null and (p_document_path is null or target.signed_document_path is not null) then
    raise exception 'La firma ya está registrada. El documento firmado no puede sustituirse.' using errcode='22023';
  end if;
  if p_document_path is not null then
    if p_document_path <> p_tenant_id::text || '/' || p_contract_id::text || '/' || p_operation_id::text || '.pdf'
      or not exists (select 1 from storage.objects o
        where o.bucket_id='signed-contracts' and o.name=p_document_path
          and o.owner_id=auth.uid()::text and o.metadata->>'mimetype'='application/pdf'
          and (o.metadata->>'size')::bigint between 1 and 15728640) then
      raise exception 'Adjunta un PDF válido de hasta 15 MB de este contrato.' using errcode='22023';
    end if;
  end if;
  event_kind := case when target.signed_at is null then 'signed' else 'signed_document_attached' end;
  update public.service_contracts set signed_at=coalesce(signed_at,clock_timestamp()),
    signed_by=coalesce(signed_by,auth.uid()), signed_document_path=p_document_path,
    signed_document_name=document_name where id=p_contract_id and tenant_id=p_tenant_id;
  insert into public.service_contract_events(operation_id,tenant_id,contract_id,kind,payload,actor_id)
    values(p_operation_id,p_tenant_id,p_contract_id,event_kind,
      jsonb_build_object('document_path',p_document_path,'document_name',document_name),auth.uid());
end;
$$;
revoke all on function public.record_contract_signature(uuid,uuid,timestamptz,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.record_contract_signature(uuid,uuid,timestamptz,uuid,text,text)
  to authenticated;