-- DEV-78: explicitly shared operational handoffs, independent of public report snapshots.
create table app_private.service_visit_handoffs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  source_visit_id uuid not null,
  title text not null check (char_length(title) between 1 and 160),
  normalized_title text generated always as (lower(title)) stored,
  created_by uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  create_operation_id uuid not null,
  resolved_visit_id uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  resolve_operation_id uuid,
  foreign key (source_visit_id, tenant_id)
    references public.service_visits (id, tenant_id) on delete restrict,
  foreign key (resolved_visit_id, tenant_id)
    references public.service_visits (id, tenant_id) on delete restrict,
  unique (tenant_id, source_visit_id, normalized_title),
  unique (tenant_id, create_operation_id),
  unique (tenant_id, resolve_operation_id),
  check (
    num_nonnulls(resolved_visit_id, resolved_by, resolved_at, resolve_operation_id) in (0,4)
    and resolved_visit_id is distinct from source_visit_id
  )
);
create index service_visit_handoffs_resolution_idx
  on app_private.service_visit_handoffs (tenant_id, resolved_visit_id)
  where resolved_visit_id is not null;
alter table app_private.service_visit_handoffs enable row level security;
revoke all on table app_private.service_visit_handoffs from public, anon, authenticated, service_role;

-- Different sites, assets, contracts/tasks or work orders are never inferred to
-- be one scope. An ad hoc visit needs a real centre; never fall back to client alone.
create function app_private.visit_handoff_has_scope(source public.service_visits)
returns boolean language sql immutable set search_path = '' as $$
  select source.location_id is not null or source.contract_id is not null
    or source.work_order_id is not null;
$$;
revoke all on function app_private.visit_handoff_has_scope(public.service_visits)
  from public, anon, authenticated, service_role;

-- Select globally within the exact scope before checking the requesting
-- worker. Otherwise every worker could see their own "next" visit for one item.
create function app_private.next_visit_for_handoff(
  source public.service_visits, enrolled_at timestamptz
)
returns uuid language sql stable set search_path = '' as $$
  select v.id from public.service_visits v
  where source.status = 'completed'
    and app_private.visit_handoff_has_scope(source)
    and v.tenant_id = source.tenant_id and v.client_id = source.client_id
    and v.location_id is not distinct from source.location_id
    and v.asset_id is not distinct from source.asset_id
    and v.work_order_id is not distinct from source.work_order_id
    and v.contract_id is not distinct from source.contract_id
    and v.contract_rule_id is not distinct from source.contract_rule_id
    and v.id <> source.id
    and v.scheduled_start_at > source.scheduled_start_at
    and v.scheduled_start_at >= greatest(
      coalesce(source.actual_end_at, source.scheduled_end_at), enrolled_at
    )
    and (v.status = 'in_progress'
      or (v.status = 'scheduled' and v.scheduled_end_at > statement_timestamp()))
    and (
      (v.assigned_user_id is not null and exists (
        select 1 from public.memberships m
        where m.tenant_id = v.tenant_id and m.user_id = v.assigned_user_id
          and m.role in ('owner', 'admin', 'editor', 'technician', 'user')
      ))
      or (v.assigned_user_id is null and exists (
        select 1 from public.work_teams team
        join public.work_team_members tm on tm.team_id = team.id and tm.tenant_id = team.tenant_id
        join public.memberships m on m.tenant_id = tm.tenant_id and m.user_id = tm.user_id
        where team.tenant_id = v.tenant_id and team.id = v.work_team_id
          and team.archived_at is null and m.role in ('technician', 'user')
      ))
    )
  order by v.scheduled_start_at, v.id limit 1;
$$;
revoke all on function app_private.next_visit_for_handoff(public.service_visits, timestamptz)
  from public, anon, authenticated, service_role;

-- Gating stays in the private implementation. NULL from a permission
-- helper must never be interpreted as a grant.
create function app_private.can_access_visit_handoffs(p_tenant_id uuid, p_visit_id uuid)
returns boolean language sql stable set search_path = '' as $$
  select p_tenant_id is not null and p_visit_id is not null
    and (select auth.uid()) is not null
    and (
      coalesce(public.has_role(p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]), false)
      or coalesce(public.can_access_assigned_visit(p_tenant_id, p_visit_id), false)
    );
$$;
revoke all on function app_private.can_access_visit_handoffs(uuid, uuid)
  from public, anon, authenticated, service_role;

create function app_private.list_service_visit_handoffs(p_tenant_id uuid, p_visit_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  target public.service_visits%rowtype;
  incoming jsonb;
  outgoing jsonb;
  incoming_has_more boolean;
  writable boolean;
begin
  if p_tenant_id is null or p_visit_id is null then
    raise exception 'Identificadores de visita inválidos' using errcode = '22023';
  end if;
  if not app_private.can_access_visit_handoffs(p_tenant_id, p_visit_id) then
    raise exception 'No tienes acceso a esta visita' using errcode = '42501';
  end if;
  select * into target from public.service_visits
    where tenant_id = p_tenant_id and id = p_visit_id;
  if not found then raise exception 'No tienes acceso a esta visita' using errcode = '42501'; end if;

  writable := coalesce(public.tenant_can_write(p_tenant_id), false);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id, 'title', item.title,
    'status', case when item.resolved_at is not null then 'resolved' else 'pending' end
  ) order by item.position) filter (where item.position <= 50), '[]'::jsonb),
    count(*) > 50
  into incoming, incoming_has_more
  from (
    select h.id, h.title, h.resolved_at, h.created_at,
      row_number() over (order by (h.resolved_at is not null), h.created_at, h.id) as position
    from app_private.service_visit_handoffs h
    join public.service_visits source on source.id = h.source_visit_id and source.tenant_id = h.tenant_id
    where h.tenant_id = p_tenant_id and (
      h.resolved_visit_id = target.id
      or (h.resolved_visit_id is null and target.status in ('scheduled', 'in_progress')
        and source.client_id = target.client_id
        and source.location_id is not distinct from target.location_id
        and source.asset_id is not distinct from target.asset_id
        and source.work_order_id is not distinct from target.work_order_id
        and source.contract_id is not distinct from target.contract_id
        and source.contract_rule_id is not distinct from target.contract_rule_id
        and app_private.next_visit_for_handoff(source, h.created_at) = target.id)
    )
    order by (h.resolved_at is not null), h.created_at, h.id limit 51
  ) item;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', h.id, 'title', h.title,
    'status', case when h.resolved_at is not null then 'resolved'
      when target.status in ('skipped', 'canceled') then 'not_forwarded' else 'pending' end
  ) order by h.created_at, h.id), '[]'::jsonb)
  into outgoing from app_private.service_visit_handoffs h
    where h.tenant_id = p_tenant_id and h.source_visit_id = target.id;

  return jsonb_build_object(
    'can_create', writable and target.status in ('scheduled', 'in_progress')
      and app_private.visit_handoff_has_scope(target) and jsonb_array_length(outgoing) < 25,
    'can_resolve', writable and target.status = 'in_progress',
    'has_scope', app_private.visit_handoff_has_scope(target),
    'incoming', incoming,
    'incoming_has_more', incoming_has_more,
    'outgoing', outgoing
  );
end;
$$;

create function app_private.create_service_visit_handoff(
  p_tenant_id uuid, p_source_visit_id uuid, p_title text, p_operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  source public.service_visits%rowtype;
  prior app_private.service_visit_handoffs%rowtype;
  clean_title text;
  result_id uuid;
  actor uuid := (select auth.uid());
begin
  if p_tenant_id is null or p_source_visit_id is null or p_operation_id is null then
    raise exception 'Identificadores de pendiente inválidos' using errcode = '22023';
  end if;
  if p_title is null or char_length(p_title) > 500 then
    raise exception 'Escribe un pendiente de hasta 160 caracteres' using errcode = '22023';
  end if;
  clean_title := btrim(regexp_replace(p_title, '[[:space:]]+', ' ', 'g'));
  if char_length(clean_title) not between 1 and 160 then
    raise exception 'Escribe un pendiente de hasta 160 caracteres' using errcode = '22023';
  end if;
  if not app_private.can_access_visit_handoffs(p_tenant_id, p_source_visit_id) then
    raise exception 'No tienes acceso a esta visita' using errcode = '42501';
  end if;
  -- Serialize creation with visit closure and with the per-origin limit.
  select * into source from public.service_visits
    where tenant_id = p_tenant_id and id = p_source_visit_id for update;
  if not found or not app_private.can_access_visit_handoffs(p_tenant_id, p_source_visit_id) then
    raise exception 'No tienes acceso a esta visita' using errcode = '42501';
  end if;
  if not coalesce(public.tenant_can_write(p_tenant_id), false) then
    raise exception 'La empresa no puede guardar pendientes' using errcode = 'P0402';
  end if;
  select * into prior from app_private.service_visit_handoffs h
    where h.tenant_id = p_tenant_id and h.create_operation_id = p_operation_id;
  if found then
    if prior.source_visit_id = source.id and prior.created_by = actor and prior.title = clean_title then
      return prior.id;
    end if;
    raise exception 'La clave de operación ya se utilizó con otros datos' using errcode = '23505';
  end if;
  if source.status not in ('scheduled', 'in_progress') or not app_private.visit_handoff_has_scope(source) then
    raise exception 'El pendiente necesita una visita abierta con centro, contrato o trabajo' using errcode = 'P0409';
  end if;
  select h.id into result_id from app_private.service_visit_handoffs h
    where h.tenant_id = p_tenant_id and h.source_visit_id = source.id
      and h.normalized_title = lower(clean_title);
  if found then return result_id; end if;
  -- A pending item already carried to this authorized visit follows on its
  -- own if left unresolved. Never create a clone of that same visible task.
  select h.id into result_id
    from app_private.service_visit_handoffs h
    join public.service_visits prior_visit
      on prior_visit.tenant_id = h.tenant_id and prior_visit.id = h.source_visit_id
    where h.tenant_id = p_tenant_id and h.resolved_visit_id is null
      and h.normalized_title = lower(clean_title)
      and prior_visit.client_id = source.client_id
      and prior_visit.location_id is not distinct from source.location_id
      and prior_visit.asset_id is not distinct from source.asset_id
      and prior_visit.work_order_id is not distinct from source.work_order_id
      and prior_visit.contract_id is not distinct from source.contract_id
      and prior_visit.contract_rule_id is not distinct from source.contract_rule_id
      and app_private.next_visit_for_handoff(prior_visit, h.created_at) = source.id
    order by h.created_at, h.id limit 1;
  if found then return result_id; end if;
  if (select count(*) from app_private.service_visit_handoffs h
    where h.tenant_id = p_tenant_id and h.source_visit_id = source.id) >= 25 then
    raise exception 'Este parte ya tiene 25 pendientes registrados' using errcode = 'P0409';
  end if;
  insert into app_private.service_visit_handoffs (
    tenant_id, source_visit_id, title, created_by, create_operation_id
  ) values (
    p_tenant_id, source.id, clean_title, actor, p_operation_id
  ) returning id into result_id;
  return result_id;
end;
$$;

create function app_private.resolve_service_visit_handoff(
  p_tenant_id uuid, p_visit_id uuid, p_handoff_id uuid, p_operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target public.service_visits%rowtype;
  source public.service_visits%rowtype;
  handoff app_private.service_visit_handoffs%rowtype;
  prior app_private.service_visit_handoffs%rowtype;
  actor uuid := (select auth.uid());
begin
  if p_tenant_id is null or p_visit_id is null or p_handoff_id is null or p_operation_id is null then
    raise exception 'Identificadores de pendiente inválidos' using errcode = '22023';
  end if;
  if not app_private.can_access_visit_handoffs(p_tenant_id, p_visit_id) then
    raise exception 'No tienes acceso a esta visita' using errcode = '42501';
  end if;
  -- Lock order is visit then handoff. Resolve only against the real target
  -- currently assigned; a concurrent reassignment cannot bypass the gate.
  select * into target from public.service_visits
    where tenant_id = p_tenant_id and id = p_visit_id for share;
  if not found or not app_private.can_access_visit_handoffs(p_tenant_id, p_visit_id) then
    raise exception 'No tienes acceso a esta visita' using errcode = '42501';
  end if;
  if not coalesce(public.tenant_can_write(p_tenant_id), false) then
    raise exception 'La empresa no puede resolver pendientes' using errcode = 'P0402';
  end if;
  select * into handoff from app_private.service_visit_handoffs
    where tenant_id = p_tenant_id and id = p_handoff_id for update;
  if not found then raise exception 'El pendiente no corresponde a esta visita' using errcode = '42501'; end if;
  if handoff.resolved_visit_id is not null then
    if handoff.resolved_visit_id <> target.id then
      raise exception 'El pendiente no corresponde a esta visita' using errcode = '42501';
    end if;
  else
    select * into strict source from public.service_visits
      where tenant_id = p_tenant_id and id = handoff.source_visit_id;
    if app_private.next_visit_for_handoff(source, handoff.created_at) is distinct from target.id then
      raise exception 'El pendiente no corresponde a esta visita' using errcode = '42501';
    end if;
  end if;
  select * into prior from app_private.service_visit_handoffs
    where tenant_id = p_tenant_id and resolve_operation_id = p_operation_id;
  if found then
    if prior.id = handoff.id and prior.resolved_visit_id = target.id and prior.resolved_by = actor then
      return prior.id;
    end if;
    raise exception 'La clave de operación ya se utilizó con otros datos' using errcode = '23505';
  end if;
  if handoff.resolved_visit_id is not null then return handoff.id; end if;
  if target.status <> 'in_progress' then
    raise exception 'Inicia la visita antes de resolver el pendiente' using errcode = 'P0409';
  end if;
  update app_private.service_visit_handoffs
    set resolved_visit_id = target.id, resolved_by = actor,
        resolved_at = statement_timestamp(), resolve_operation_id = p_operation_id
    where id = handoff.id;
  return handoff.id;
end;
$$;

-- SQL-standard bodies bind private functions at definition time. The role
-- only needs EXECUTE, not USAGE on app_private, and cannot invoke private
-- helpers or tables directly. Public PostgREST wrappers are invokers.
create function public.list_service_visit_handoffs(p_tenant_id uuid, p_visit_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
begin atomic
  select app_private.list_service_visit_handoffs(p_tenant_id, p_visit_id);
end;

create function public.create_service_visit_handoff(
  p_tenant_id uuid, p_source_visit_id uuid, p_title text, p_operation_id uuid
)
returns uuid language sql security invoker set search_path = ''
begin atomic
  select app_private.create_service_visit_handoff(p_tenant_id, p_source_visit_id, p_title, p_operation_id);
end;

create function public.resolve_service_visit_handoff(
  p_tenant_id uuid, p_visit_id uuid, p_handoff_id uuid, p_operation_id uuid
)
returns uuid language sql security invoker set search_path = ''
begin atomic
  select app_private.resolve_service_visit_handoff(p_tenant_id, p_visit_id, p_handoff_id, p_operation_id);
end;

revoke all on function
  app_private.list_service_visit_handoffs(uuid, uuid),
  app_private.create_service_visit_handoff(uuid, uuid, text, uuid),
  app_private.resolve_service_visit_handoff(uuid, uuid, uuid, uuid),
  public.list_service_visit_handoffs(uuid, uuid),
  public.create_service_visit_handoff(uuid, uuid, text, uuid),
  public.resolve_service_visit_handoff(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  app_private.list_service_visit_handoffs(uuid, uuid),
  app_private.create_service_visit_handoff(uuid, uuid, text, uuid),
  app_private.resolve_service_visit_handoff(uuid, uuid, uuid, uuid),
  public.list_service_visit_handoffs(uuid, uuid),
  public.create_service_visit_handoff(uuid, uuid, text, uuid),
  public.resolve_service_visit_handoff(uuid, uuid, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
