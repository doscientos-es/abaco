-- A narrowly scoped office action; the parent service asset never changes.
create table app_private.equipment_registration_receipts (
  tenant_id uuid not null,
  actor_id uuid not null,
  operation_id uuid not null,
  input_digest bytea not null,
  equipment_id uuid not null,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, actor_id, operation_id),
  unique (equipment_id, tenant_id),
  foreign key (equipment_id,tenant_id) references public.installed_equipment(id,tenant_id)
    on delete restrict
);
alter table app_private.equipment_registration_receipts enable row level security;
revoke all on app_private.equipment_registration_receipts from public,anon,authenticated;
create trigger equipment_registration_receipts_immutable before update or delete
  on app_private.equipment_registration_receipts
  for each row execute function public.reject_work_history_change();

create function app_private.list_equipment_registration_assets(p_tenant uuid,p_location uuid,p_offset integer)
returns table (id uuid,name text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not coalesce(public.has_role(
    p_tenant,array['owner','admin','editor']::public.app_role[]),false) then
    raise exception 'No autorizado para consultar activos' using errcode='42501';
  end if;
  if p_location is null or p_offset is null or p_offset < 0 or p_offset > 100000 then
    raise exception 'Página o centro inválido' using errcode='22023';
  end if;
  return query
    select a.id,a.name
    from public.service_assets a
    join public.service_locations l on l.id=a.location_id and l.tenant_id=a.tenant_id
      and l.active and l.kind <> 'billing'
    where a.tenant_id=p_tenant and a.location_id=p_location and a.status='active'
    order by lower(a.name),a.id limit 21 offset p_offset;
end;
$$;

create function app_private.register_equipment_for_qr(
  p_tenant uuid,p_location uuid,p_asset uuid,p_kind text,p_manufacturer text,p_model text,
  p_confirmed boolean,p_operation uuid
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  receipt app_private.equipment_registration_receipts%rowtype;
  digest bytea;
  created_id uuid;
begin
  if actor is null or not coalesce(public.has_role(
    p_tenant,array['owner','admin','editor']::public.app_role[]),false)
    or not coalesce(public.tenant_can_write(p_tenant),false) then
    raise exception 'No autorizado para registrar equipos' using errcode='42501';
  end if;
  p_kind := btrim(p_kind);
  p_manufacturer := btrim(p_manufacturer);
  p_model := btrim(p_model);
  if p_confirmed is distinct from true or p_location is null or p_asset is null or p_operation is null
    or p_kind is null or char_length(p_kind) not between 1 and 100
    or p_manufacturer is null or char_length(p_manufacturer)>120
    or p_model is null or char_length(p_model)>120
    or concat(p_kind,p_manufacturer,p_model) ~ '[[:cntrl:]]' then
    raise exception 'Datos o confirmación de equipo inválidos' using errcode='22023';
  end if;
  perform 1
    from public.service_assets a
    join public.service_locations l on l.id=a.location_id and l.tenant_id=a.tenant_id
      and l.active and l.kind <> 'billing'
    where a.id=p_asset and a.tenant_id=p_tenant and a.location_id=p_location and a.status='active'
    for share of a,l;
  if not found then raise exception 'Activo no disponible' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'equipment-registration:'||p_tenant::text||':'||actor::text||':'||p_operation::text,0));
  digest := sha256(convert_to(jsonb_build_array(p_location,p_asset,p_kind,p_manufacturer,p_model)::text,'UTF8'));
  select * into receipt from app_private.equipment_registration_receipts r
    where (r.tenant_id,r.actor_id,r.operation_id)=(p_tenant,actor,p_operation);
  if found then
    if receipt.input_digest is distinct from digest then
      raise exception 'Operación usada con otro contenido' using errcode='P0409';
    end if;
    return receipt.equipment_id;
  end if;
  insert into public.installed_equipment (tenant_id,asset_id,kind,manufacturer,model)
    values (p_tenant,p_asset,p_kind,p_manufacturer,p_model) returning id into created_id;
  insert into app_private.equipment_registration_receipts
    (tenant_id,actor_id,operation_id,input_digest,equipment_id)
    values (p_tenant,actor,p_operation,digest,created_id);
  return created_id;
end;
$$;

create function public.list_equipment_registration_assets(p_tenant uuid,p_location uuid,p_offset integer)
returns table (id uuid,name text) language sql stable security invoker set search_path = ''
begin atomic select * from app_private.list_equipment_registration_assets(p_tenant,p_location,p_offset); end;

create function public.register_equipment_for_qr(
  p_tenant uuid,p_location uuid,p_asset uuid,p_kind text,p_manufacturer text,p_model text,
  p_confirmed boolean,p_operation uuid
) returns uuid language sql security invoker set search_path = ''
begin atomic
  select app_private.register_equipment_for_qr(
    p_tenant,p_location,p_asset,p_kind,p_manufacturer,p_model,p_confirmed,p_operation);
end;
revoke all on function app_private.list_equipment_registration_assets(uuid,uuid,integer),
  app_private.register_equipment_for_qr(uuid,uuid,uuid,text,text,text,boolean,uuid),
  public.list_equipment_registration_assets(uuid,uuid,integer),
  public.register_equipment_for_qr(uuid,uuid,uuid,text,text,text,boolean,uuid)
  from public,anon,authenticated;
grant execute on function app_private.list_equipment_registration_assets(uuid,uuid,integer),
  app_private.register_equipment_for_qr(uuid,uuid,uuid,text,text,text,boolean,uuid),
  public.list_equipment_registration_assets(uuid,uuid,integer),
  public.register_equipment_for_qr(uuid,uuid,uuid,text,text,text,boolean,uuid) to authenticated;

notify pgrst, 'reload schema';
