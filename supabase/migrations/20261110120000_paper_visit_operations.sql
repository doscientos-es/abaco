create function public.update_paper_visit(p_tenant_id uuid,p_visit_id uuid,p_expected_updated_at timestamptz,p_change jsonb,p_operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.service_visits%rowtype; prior public.service_visit_events%rowtype;
  team uuid := nullif(p_change->>'work_team_id','')::uuid;
  action text := p_change->>'action';
  reason text := trim(coalesce(p_change->>'reason',''));
begin
  if auth.uid() is null or not public.has_role(p_tenant_id,array['owner','admin','editor']::public.app_role[])
    then raise exception 'No tienes permiso' using errcode = '42501'; end if;
  select * into v from public.service_visits where id = p_visit_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Visita no encontrada' using errcode = 'P0002'; end if;
  select * into prior from public.service_visit_events where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.visit_id <> p_visit_id or prior.payload->'request' is distinct from p_change
      then raise exception 'Operación utilizada' using errcode = '23505'; end if;
    return v.id;
  end if;
  if not public.tenant_can_write(p_tenant_id) then raise exception 'Empresa no disponible' using errcode = 'P0402'; end if;
  if p_expected_updated_at is null or v.updated_at <> p_expected_updated_at or v.status not in ('scheduled','in_progress')
    then raise exception 'La visita cambió; vuelve a cargarla' using errcode = 'P0409'; end if;
  if action = 'assign' then
    if team is not null and not exists(select 1 from public.work_teams where id = team and tenant_id = p_tenant_id and archived_at is null)
      then raise exception 'Equipo no disponible' using errcode = '22023'; end if;
    update public.service_visits set work_team_id = team, route_order = (p_change->>'route_order')::integer where id = v.id;
  elsif action = 'complete' then
    if nullif(p_change->>'performed_on','') is null then raise exception 'Indica la fecha real' using errcode = '22023'; end if;
    update public.service_visits set performed_on = (p_change->>'performed_on')::date,
      completion_notes = coalesce(p_change->>'completion_notes',''), status = 'completed' where id = v.id;
  elsif action = 'cancel' and length(reason) between 1 and 500 then
    update public.service_visits set status = 'canceled' where id = v.id;
  else raise exception 'Cambio inválido; la cancelación requiere motivo' using errcode = '22023'; end if;
  insert into public.service_visit_events(operation_id,tenant_id,visit_id,kind,payload,actor_id)
    values(p_operation_id,p_tenant_id,v.id,case when action = 'assign' then 'schedule_changed' else 'status_changed' end,
      jsonb_build_object('request',p_change,'reason',reason,'from',jsonb_build_object('status',v.status,'team',v.work_team_id,'order',v.route_order),
        'to',case when action = 'complete' then '"completed"'::jsonb when action = 'cancel' then '"canceled"'::jsonb else p_change end),auth.uid());
  return v.id;
end;
$$;
revoke all on function public.update_paper_visit(uuid,uuid,timestamptz,jsonb,uuid) from public,anon;
grant execute on function public.update_paper_visit(uuid,uuid,timestamptz,jsonb,uuid) to authenticated;

-- Separate from field photographs: administration may attach a signed PDF after closure.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('signed-work-sheets','signed-work-sheets',false,15728640,array['application/pdf','image/jpeg','image/png','image/webp']);
create table public.visit_signed_documents (
  id uuid primary key,
  tenant_id uuid not null,
  visit_id uuid not null,
  object_path text not null unique,
  name text not null check(char_length(name) between 1 and 240),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.profiles(id),
  foreign key(visit_id,tenant_id) references public.service_visits(id,tenant_id),
  check(object_path = tenant_id::text || '/' || visit_id::text || '/' || id::text)
);
alter table public.visit_signed_documents enable row level security;
revoke all on public.visit_signed_documents from public,anon,authenticated;
grant select,insert on public.visit_signed_documents to authenticated;
create policy signed_documents_read on public.visit_signed_documents for select to authenticated
  using(public.has_role(tenant_id,array['owner','admin','editor']::public.app_role[]));
create policy signed_documents_insert on public.visit_signed_documents for insert to authenticated
  with check(created_by = auth.uid() and public.tenant_can_write(tenant_id)
    and public.has_role(tenant_id,array['owner','admin','editor']::public.app_role[])
    and exists(select 1 from storage.objects o where o.bucket_id = 'signed-work-sheets' and o.name = object_path));
create policy signed_sheets_read on storage.objects for select to authenticated using(
  bucket_id = 'signed-work-sheets' and exists(select 1 from public.service_visits v
    where v.tenant_id::text = (storage.foldername(name))[1] and v.id::text = (storage.foldername(name))[2]
      and public.has_role(v.tenant_id,array['owner','admin','editor']::public.app_role[])));
create policy signed_sheets_upload on storage.objects for insert to authenticated with check(
  bucket_id = 'signed-work-sheets' and exists(select 1 from public.service_visits v
    where v.tenant_id::text = (storage.foldername(name))[1] and v.id::text = (storage.foldername(name))[2]
      and public.tenant_can_write(v.tenant_id)
      and public.has_role(v.tenant_id,array['owner','admin','editor']::public.app_role[])));