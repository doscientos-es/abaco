-- Labels are identifiers, never capabilities. The resolver still verifies live scope.
create table app_private.equipment_qr_events (
  operation_id uuid primary key,
  tenant_id uuid not null,
  equipment_id uuid not null,
  revision integer not null check (revision > 0),
  action text not null check (action in ('issue','rotate','revoke')),
  token uuid unique,
  actor_id uuid not null,
  recorded_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, equipment_id, revision),
  foreign key (equipment_id,tenant_id) references public.installed_equipment(id,tenant_id)
    on delete restrict,
  check ((action = 'revoke') = (token is null))
);
alter table app_private.equipment_qr_events enable row level security;
revoke all on app_private.equipment_qr_events from public,anon,authenticated;
create trigger equipment_qr_events_immutable before update or delete
  on app_private.equipment_qr_events
  for each row execute function public.reject_work_history_change();

create function app_private.list_centre_equipment_labels(p_tenant uuid,p_location uuid,p_offset integer)
returns table (equipment_id uuid,kind text,manufacturer text,model text,revision integer,token uuid)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not coalesce(public.has_role(
    p_tenant,array['owner','admin','editor']::public.app_role[]),false) then
    raise exception 'No autorizado para consultar etiquetas' using errcode = '42501';
  end if;
  if p_location is null or p_offset is null or p_offset < 0 or p_offset > 100000 then
    raise exception 'Página o centro inválido' using errcode = '22023';
  end if;
  return query
    select e.id,e.kind,left(e.manufacturer,120),left(e.model,120),coalesce(r.revision,0),r.token
    from public.installed_equipment e
    join public.service_assets a on a.id=e.asset_id and a.tenant_id=e.tenant_id and a.status='active'
    join public.service_locations l on l.id=a.location_id and l.tenant_id=a.tenant_id
      and l.active and l.kind <> 'billing'
    left join lateral (
      select x.revision,x.token from app_private.equipment_qr_events x
      where x.tenant_id=e.tenant_id and x.equipment_id=e.id order by x.revision desc limit 1
    ) r on true
    where e.tenant_id=p_tenant and a.location_id=p_location and e.status='active'
    order by e.created_at desc,e.id limit 21 offset p_offset;
end;
$$;

create function app_private.change_equipment_label(
  p_tenant uuid,p_location uuid,p_equipment uuid,p_expected integer,p_action text,p_operation uuid
) returns integer language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  previous app_private.equipment_qr_events%rowtype;
  prior app_private.equipment_qr_events%rowtype;
begin
  if actor is null or not coalesce(public.has_role(
    p_tenant,array['owner','admin','editor']::public.app_role[]),false)
    or not coalesce(public.tenant_can_write(p_tenant),false) then
    raise exception 'No autorizado para cambiar etiquetas' using errcode = '42501';
  end if;
  if p_equipment is null or p_location is null or p_operation is null or p_expected is null
    or p_expected < 0 or p_action is null or p_action not in ('issue','rotate','revoke') then
    raise exception 'Operación de etiqueta inválida' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.installed_equipment e
    join public.service_assets a on a.id=e.asset_id and a.tenant_id=e.tenant_id and a.status='active'
    join public.service_locations l on l.id=a.location_id and l.tenant_id=a.tenant_id
      and l.active and l.kind <> 'billing'
    where e.id=p_equipment and e.tenant_id=p_tenant and a.location_id=p_location and e.status='active'
  ) then raise exception 'Equipo no disponible' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('equipment-label:'||p_equipment::text,0));
  select * into prior from app_private.equipment_qr_events x
    where x.tenant_id=p_tenant and x.operation_id=p_operation;
  if found then
    if row(prior.equipment_id,prior.revision-1,prior.action,prior.actor_id)
      is distinct from row(p_equipment,p_expected,p_action,actor) then
      raise exception 'Operación usada con otro contenido' using errcode = 'P0409';
    end if;
    return prior.revision;
  end if;
  select * into previous from app_private.equipment_qr_events x
    where x.tenant_id=p_tenant and x.equipment_id=p_equipment order by x.revision desc limit 1;
  if coalesce(previous.revision,0) <> p_expected then
    raise exception 'La etiqueta ha cambiado' using errcode = 'P0409';
  end if;
  if (p_action = 'issue' and previous.token is not null)
    or (p_action in ('rotate','revoke') and previous.token is null) then
    raise exception 'Cambia primero el estado de la etiqueta' using errcode = 'P0409';
  end if;
  insert into app_private.equipment_qr_events
    (operation_id,tenant_id,equipment_id,revision,action,token,actor_id) values
    (p_operation,p_tenant,p_equipment,p_expected+1,p_action,
     case when p_action <> 'revoke' then gen_random_uuid() end,actor);
  return p_expected+1;
end;
$$;

-- Shared internal predicate uses authenticated actor, direct assignment first.
-- No public/equipment-wide policy is changed; use only on this scan projection.
create function app_private.can_scan_equipment_visit(
  p_tenant uuid,p_visit uuid,p_asset uuid,p_location uuid,p_actor uuid
) returns boolean language sql stable security invoker set search_path = ''
begin atomic
  select exists(
    select 1 from public.service_visits v
    where v.id=p_visit and v.tenant_id=p_tenant and v.asset_id=p_asset and v.location_id=p_location
      and v.status in ('scheduled','in_progress')
      and (v.assigned_user_id=p_actor or (v.assigned_user_id is null and exists(
        select 1 from public.work_team_members m
        where m.tenant_id=v.tenant_id and m.team_id=v.work_team_id and m.user_id=p_actor
      )))
  );
end;
revoke all on function app_private.can_scan_equipment_visit(uuid,uuid,uuid,uuid,uuid)
  from public,anon,authenticated;

create function app_private.scan_equipment_label(p_tenant uuid,p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  office boolean;
  target record;
  activity jsonb;
begin
  if actor is null or p_token is null or p_tenant is null then return null; end if;
  office := coalesce(public.has_role(p_tenant,array['owner','admin','editor']::public.app_role[]),false);
  if not office and not coalesce(public.has_role(
    p_tenant,array['technician','user']::public.app_role[]),false) then return null; end if;

  select e.id,e.kind,e.manufacturer,e.model,a.id as asset_id,l.id as location_id
  into target
  from app_private.equipment_qr_events x
  join public.installed_equipment e on e.id=x.equipment_id and e.tenant_id=x.tenant_id and e.status='active'
  join public.service_assets a on a.id=e.asset_id and a.tenant_id=e.tenant_id and a.status='active'
  join public.service_locations l on l.id=a.location_id and l.tenant_id=a.tenant_id
    and l.active and l.kind <> 'billing'
  where x.token=p_token and x.tenant_id=p_tenant and not exists(
    select 1 from app_private.equipment_qr_events newer
    where newer.tenant_id=x.tenant_id and newer.equipment_id=x.equipment_id and newer.revision>x.revision
  );
  if not found then return null; end if;
  if not office and not exists (
    select 1 from public.service_visits v
    where v.tenant_id=p_tenant and v.asset_id=target.asset_id and v.location_id=target.location_id
      and app_private.can_scan_equipment_visit(p_tenant,v.id,target.asset_id,target.location_id,actor)
  ) then return null; end if;

  if office then
    select jsonb_agg(jsonb_build_object('type','equipment','date',h.changed_at,'status',h.state)
      order by h.changed_at desc,h.id) into activity
    from (
      select i.id,i.changed_at,i.after_state->>'status' state
      from public.installed_equipment_history i
      where i.tenant_id=p_tenant and i.equipment_id=target.id
        and i.after_state->>'status' in ('active','replaced','retired','transferred')
        and (i.before_state->>'status') is distinct from (i.after_state->>'status')
      order by i.changed_at desc,i.id limit 10
    ) h;
  else
    select jsonb_agg(jsonb_build_object('type','incident','date',h.created_at,'status',h.status)
      order by h.created_at desc,h.id) into activity
    from (
      select i.id,i.created_at,i.status
      from public.service_incidents i
      where i.tenant_id=p_tenant and i.equipment_id=target.id and i.asset_id=target.asset_id
        and i.location_id=target.location_id
        and app_private.can_scan_equipment_visit(
          p_tenant,i.source_visit_id,target.asset_id,target.location_id,actor)
      order by i.created_at desc,i.id limit 10
    ) h;
  end if;
  return jsonb_build_object('kind',target.kind,'manufacturer',left(target.manufacturer,120),
    'model',left(target.model,120),'activity',coalesce(activity,'[]'::jsonb));
end;
$$;

create function public.list_centre_equipment_labels(p_tenant uuid,p_location uuid,p_offset integer)
returns table (equipment_id uuid,kind text,manufacturer text,model text,revision integer,token uuid)
language sql stable security invoker set search_path = ''
begin atomic select * from app_private.list_centre_equipment_labels(p_tenant,p_location,p_offset); end;
create function public.change_equipment_label(
  p_tenant uuid,p_location uuid,p_equipment uuid,p_expected integer,p_action text,p_operation uuid
) returns integer language sql security invoker set search_path = ''
begin atomic
  select app_private.change_equipment_label(p_tenant,p_location,p_equipment,p_expected,p_action,p_operation);
end;
create function public.scan_equipment_label(p_tenant uuid,p_token uuid)
returns jsonb language sql stable security invoker set search_path = ''
begin atomic select app_private.scan_equipment_label(p_tenant,p_token); end;
revoke all on function app_private.list_centre_equipment_labels(uuid,uuid,integer),
  app_private.change_equipment_label(uuid,uuid,uuid,integer,text,uuid),
  app_private.scan_equipment_label(uuid,uuid),
  public.list_centre_equipment_labels(uuid,uuid,integer),
  public.change_equipment_label(uuid,uuid,uuid,integer,text,uuid),
  public.scan_equipment_label(uuid,uuid) from public,anon,authenticated;
grant execute on function app_private.list_centre_equipment_labels(uuid,uuid,integer),
  app_private.change_equipment_label(uuid,uuid,uuid,integer,text,uuid),
  app_private.scan_equipment_label(uuid,uuid),
  public.list_centre_equipment_labels(uuid,uuid,integer),
  public.change_equipment_label(uuid,uuid,uuid,integer,text,uuid),
  public.scan_equipment_label(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
