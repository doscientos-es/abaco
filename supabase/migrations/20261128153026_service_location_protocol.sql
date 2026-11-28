-- Versioned operational checklist, never sourced from access notes, incident details or reports.
create table public.service_location_protocol_versions (
  tenant_id uuid not null,
  location_id uuid not null,
  revision integer not null check (revision > 0),
  operation_id uuid not null unique,
  items text[] not null check (cardinality(items) <= 6),
  shared boolean not null,
  edited_at timestamptz not null default clock_timestamp(),
  edited_by uuid not null,
  primary key (tenant_id, location_id, revision),
  foreign key (location_id, tenant_id) references public.service_locations(id, tenant_id)
    on delete restrict,
  check (not shared or cardinality(items) > 0)
);
create trigger service_location_protocol_immutable
  before update or delete on public.service_location_protocol_versions
  for each row execute function public.reject_work_history_change();
alter table public.service_location_protocol_versions enable row level security;
revoke all on public.service_location_protocol_versions from public, anon, authenticated;
grant select on public.service_location_protocol_versions to authenticated;
create policy service_location_protocol_office_read on public.service_location_protocol_versions
  for select to authenticated using (
    (select auth.uid()) is not null
    and coalesce(public.has_role(tenant_id, array['owner','admin']::public.app_role[]), false)
  );

create function app_private.save_service_location_protocol(
  p_tenant uuid, p_location uuid, p_expected integer, p_items text[],
  p_shared boolean, p_reviewed boolean, p_operation uuid
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  clean_items text[];
  current_row public.service_location_protocol_versions%rowtype;
  last_operation public.service_location_protocol_versions%rowtype;
begin
  if uid is null
    or not coalesce(public.has_role(p_tenant,array['owner','admin']::public.app_role[]),false)
    or not coalesce(public.tenant_can_write(p_tenant),false) then
    raise exception 'No autorizado para editar el protocolo' using errcode = '42501';
  end if;
  if p_location is null or p_expected is null or p_expected < 0 or p_operation is null
    or p_shared is null or p_items is null or cardinality(p_items) > 6
    or coalesce(array_ndims(p_items),1) <> 1
    or exists (select 1 from unnest(p_items) s(item)
      where s.item is null or char_length(btrim(s.item)) not between 1 and 160
      or char_length(s.item) > 160 or s.item ~ '[[:cntrl:]]')
    or (p_shared and (cardinality(p_items) = 0 or p_reviewed is not true)) then
    raise exception 'Indicaciones inválidas o sin revisar' using errcode = '22023';
  end if;
  select coalesce(array_agg(btrim(s.item) order by s.position),array[]::text[]) into clean_items
    from unnest(p_items) with ordinality s(item,position);
  if cardinality(clean_items) <> (select count(distinct item) from unnest(clean_items) s(item)) then
    raise exception 'El protocolo tiene indicaciones duplicadas' using errcode = '22023';
  end if;
  if not exists (select 1 from public.service_locations l
      where l.id = p_location and l.tenant_id = p_tenant and l.active and l.kind <> 'billing') then
    raise exception 'Centro no disponible' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('centre-protocol:' || p_location::text,0));
  select * into last_operation from public.service_location_protocol_versions r
    where r.tenant_id = p_tenant and r.operation_id = p_operation;
  if found then
    if row(last_operation.location_id,last_operation.revision - 1,
      last_operation.items,last_operation.shared,last_operation.edited_by)
      is distinct from row(p_location,p_expected,clean_items,p_shared,uid) then
      raise exception 'La operación ya tiene otro contenido' using errcode = 'P0409';
    end if;
    return last_operation.revision;
  end if;
  select * into current_row from public.service_location_protocol_versions r
    where r.tenant_id = p_tenant and r.location_id = p_location order by r.revision desc limit 1;
  if coalesce(current_row.revision,0) <> p_expected then
    raise exception 'El protocolo ha cambiado' using errcode = 'P0409';
  end if;
  if cardinality(clean_items) > 0
    and clean_items is distinct from current_row.items and p_reviewed is not true then
    raise exception 'Confirma que el contenido no incluye credenciales ni datos privados' using errcode = '22023';
  end if;
  if row(current_row.items,current_row.shared) is not distinct from row(clean_items,p_shared)
    or (p_expected = 0 and not p_shared and cardinality(clean_items) = 0) then
    raise exception 'El protocolo no tiene cambios' using errcode = '22023';
  end if;

  insert into public.service_location_protocol_versions
    (tenant_id,location_id,revision,operation_id,items,shared,edited_by)
    values (p_tenant,p_location,p_expected + 1,p_operation,clean_items,p_shared,uid);
  return p_expected + 1;
end;
$$;

create function app_private.list_assigned_visit_protocols(p_tenant uuid,p_visit_ids uuid[])
returns table (
  visit_id uuid, revision integer, items text[], state text, changed_items text[], removed_count integer
)
language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null or not coalesce(public.has_role(
    p_tenant,array['owner','admin','technician','user']::public.app_role[]
  ),false) then
    raise exception 'No autorizado para consultar protocolos' using errcode = '42501';
  end if;
  if p_visit_ids is null or cardinality(p_visit_ids) > 50
    or coalesce(array_ndims(p_visit_ids),1) <> 1 then
    raise exception 'Lista de visitas inválida' using errcode = '22023';
  end if;
  return query
  select v.id, current_protocol.revision, current_protocol.items,
    case
      when previous_visit.finished_at is null then 'no_baseline'
      when prior_protocol.shared is not true then 'new'
      when prior_protocol.items = current_protocol.items then 'unchanged'
      else 'changed'
    end,
    case when prior_protocol.shared is true then
      array(select item from unnest(current_protocol.items) s(item)
        where not (s.item = any(prior_protocol.items)))
      else array[]::text[]
    end,
    case when prior_protocol.shared is true then
      (select count(*)::integer from unnest(prior_protocol.items) s(item)
        where not (s.item = any(current_protocol.items)))
      else 0
    end
  from public.service_visits v
  join public.service_locations l on l.id = v.location_id and l.tenant_id = v.tenant_id and l.active and l.kind <> 'billing'
  join lateral (
    select r.revision,r.items,r.shared from public.service_location_protocol_versions r
    where r.tenant_id = l.tenant_id and r.location_id = l.id order by r.revision desc limit 1
  ) current_protocol on current_protocol.shared
  left join lateral (
    select p.actual_end_at as finished_at
    from public.service_visits p
    where p.tenant_id = v.tenant_id and p.location_id = v.location_id and p.id <> v.id
      and p.status = 'completed' and p.actual_end_at <= now()
      and (p.assigned_user_id = uid or (p.assigned_user_id is null and p.work_team_id is not null and exists (
        select 1 from public.service_visit_events e
        where e.tenant_id = p.tenant_id and e.visit_id = p.id
          and e.kind = 'status_changed' and e.actor_id = uid and e.payload ->> 'to' = 'completed'
      )))
    order by p.actual_end_at desc,p.id desc limit 1
  ) previous_visit on true
  left join lateral (
    select r.items,r.shared from public.service_location_protocol_versions r
    where r.tenant_id = l.tenant_id and r.location_id = l.id
      and r.edited_at <= previous_visit.finished_at
    order by r.revision desc limit 1
  ) prior_protocol on true
  where v.tenant_id = p_tenant and v.id = any(p_visit_ids)
    and v.status in ('scheduled','in_progress')
    and (v.assigned_user_id = uid or (v.assigned_user_id is null and exists (
      select 1 from public.work_team_members m where m.tenant_id = v.tenant_id
        and m.team_id = v.work_team_id and m.user_id = uid
    )));
end;
$$;

create function public.save_service_location_protocol(
  p_tenant uuid,p_location uuid,p_expected integer,p_items text[],
  p_shared boolean,p_reviewed boolean,p_operation uuid
)
returns integer language sql security invoker set search_path = ''
begin atomic
  select app_private.save_service_location_protocol(
    p_tenant,p_location,p_expected,p_items,p_shared,p_reviewed,p_operation
  );
end;

create function public.list_assigned_visit_protocols(p_tenant uuid,p_visit_ids uuid[])
returns table (
  visit_id uuid, revision integer, items text[], state text, changed_items text[], removed_count integer
)
language sql stable security invoker set search_path = ''
begin atomic
  select * from app_private.list_assigned_visit_protocols(p_tenant,p_visit_ids);
end;

revoke all on function app_private.save_service_location_protocol(uuid,uuid,integer,text[],boolean,boolean,uuid),
  app_private.list_assigned_visit_protocols(uuid,uuid[]),
  public.save_service_location_protocol(uuid,uuid,integer,text[],boolean,boolean,uuid),
  public.list_assigned_visit_protocols(uuid,uuid[]) from public,anon,authenticated;
grant execute on function app_private.save_service_location_protocol(uuid,uuid,integer,text[],boolean,boolean,uuid),
  app_private.list_assigned_visit_protocols(uuid,uuid[]),
  public.save_service_location_protocol(uuid,uuid,integer,text[],boolean,boolean,uuid),
  public.list_assigned_visit_protocols(uuid,uuid[]) to authenticated;

notify pgrst, 'reload schema';
