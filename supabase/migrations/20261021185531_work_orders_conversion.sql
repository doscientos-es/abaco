-- M11: one accepted proposal can create one work order. The accepted publication
-- travels with it, so later changes to clients, branding or catalog do not rewrite scope.
create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_id uuid not null,
  origin_estimate_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  kind text not null default 'installation'
    check (kind in ('installation', 'repair', 'maintenance', 'other')),
  status text not null default 'ready'
    check (status in ('ready', 'scheduled', 'in_progress', 'completed', 'canceled')),
  source_snapshot jsonb not null check (jsonb_typeof(source_snapshot) = 'object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (client_id, tenant_id)
    references public.clients (id, tenant_id) on delete restrict,
  foreign key (origin_estimate_id, tenant_id)
    references public.estimates (id, tenant_id) on delete restrict
);
create unique index work_orders_one_per_estimate_idx
  on public.work_orders (tenant_id, origin_estimate_id)
  where origin_estimate_id is not null;
create index work_orders_tenant_status_idx
  on public.work_orders (tenant_id, status, created_at desc);
create index work_orders_client_idx
  on public.work_orders (tenant_id, client_id, created_at desc);

create table public.work_conversion_operations (
  operation_id uuid primary key,
  tenant_id uuid not null,
  estimate_id uuid not null,
  work_order_id uuid,
  created_at timestamptz not null default now(),
  foreign key (estimate_id, tenant_id)
    references public.estimates (id, tenant_id) on delete restrict,
  foreign key (work_order_id, tenant_id)
    references public.work_orders (id, tenant_id) on delete restrict
);
create index work_conversion_operations_tenant_idx
  on public.work_conversion_operations (tenant_id, estimate_id);

create table public.work_order_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid unique,
  tenant_id uuid not null,
  work_order_id uuid not null,
  kind text not null check (kind in ('created', 'status_changed')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  actor_id uuid,
  occurred_at timestamptz not null default now(),
  foreign key (work_order_id, tenant_id)
    references public.work_orders (id, tenant_id) on delete restrict
);
create index work_order_events_order_idx
  on public.work_order_events (tenant_id, work_order_id, occurred_at desc);

alter table public.work_orders enable row level security;
alter table public.work_conversion_operations enable row level security;
alter table public.work_order_events enable row level security;
revoke all on public.work_orders, public.work_conversion_operations,
  public.work_order_events from public, anon, authenticated;
grant select on public.work_orders, public.work_order_events to authenticated, service_role;
grant select on public.work_conversion_operations to authenticated, service_role;
create policy work_orders_select on public.work_orders
  for select to authenticated using (public.is_member(tenant_id));
create policy work_conversion_operations_select on public.work_conversion_operations
  for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
  );
create policy work_order_events_select on public.work_order_events
  for select to authenticated using (public.is_member(tenant_id));

create function public.protect_work_order_origin() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if row(new.tenant_id, new.client_id, new.origin_estimate_id, new.source_snapshot,
         new.created_by, new.created_at)
     is distinct from
     row(old.tenant_id, old.client_id, old.origin_estimate_id, old.source_snapshot,
         old.created_by, old.created_at) then
    raise exception 'El origen aceptado de un trabajo es inmutable';
  end if;
  return new;
end;
$$;
create trigger work_orders_protect_origin
  before update on public.work_orders
  for each row execute function public.protect_work_order_origin();
create function public.touch_work_order_version() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;
create trigger work_orders_touch
  before update on public.work_orders
  for each row execute function public.touch_work_order_version();

create function public.reject_work_history_change() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'El historial de trabajos es inmutable';
  return old;
end;
$$;
create trigger work_order_events_immutable
  before update or delete on public.work_order_events
  for each row execute function public.reject_work_history_change();

create function public.convert_accepted_estimate_to_work(
  p_tenant_id uuid, p_estimate_id uuid, p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  prior public.work_conversion_operations%rowtype;
  proposal public.estimates%rowtype;
  published public.estimate_publications%rowtype;
  existing_id uuid;
  created_id uuid;
  accepted_copy jsonb;
  acceptance_mode text;
begin
  if p_tenant_id is null or p_estimate_id is null or p_operation_id is null then
    raise exception 'Datos de conversión inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant_id and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'editor')
  ) then
    raise exception 'No tienes permiso para crear trabajos' using errcode = '42501';
  end if;

  select * into prior from public.work_conversion_operations
  where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.estimate_id <> p_estimate_id then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    if prior.work_order_id is not null then return prior.work_order_id; end if;
  end if;

  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede crear trabajos' using errcode = 'P0402';
  end if;

  insert into public.work_conversion_operations (operation_id, tenant_id, estimate_id)
  values (p_operation_id, p_tenant_id, p_estimate_id)
  on conflict (operation_id) do nothing;
  select * into prior from public.work_conversion_operations
  where operation_id = p_operation_id for update;
  if prior.tenant_id <> p_tenant_id or prior.estimate_id <> p_estimate_id then
    raise exception 'La clave de operación ya se utilizó con otros datos'
      using errcode = '23505';
  end if;
  if prior.work_order_id is not null then return prior.work_order_id; end if;

  select * into proposal from public.estimates
  where id = p_estimate_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Presupuesto no encontrado' using errcode = 'P0002'; end if;
  if proposal.status <> 'accepted' then
    raise exception 'Solo se convierte un presupuesto aceptado' using errcode = 'P0409';
  end if;
  select * into published from public.estimate_publications
  where estimate_id = proposal.id and tenant_id = proposal.tenant_id;
  if not found then
    raise exception 'Falta la versión publicada del presupuesto' using errcode = 'P0409';
  end if;

  select id into existing_id from public.work_orders
  where tenant_id = p_tenant_id and origin_estimate_id = p_estimate_id;
  if found then
    update public.work_conversion_operations set work_order_id = existing_id
    where operation_id = p_operation_id;
    return existing_id;
  end if;

  acceptance_mode := case when proposal.responded_at is null
    then 'legacy_unverified' else 'public_link' end;
  accepted_copy := published.snapshot || jsonb_build_object(
    'acceptance', jsonb_build_object(
      'mode', acceptance_mode, 'responded_at', proposal.responded_at,
      'responded_by', proposal.responded_by
    ),
    'publication_source', published.source
  );
  insert into public.work_orders (
    tenant_id, client_id, origin_estimate_id, title, source_snapshot, created_by
  ) values (
    p_tenant_id, proposal.client_id, proposal.id,
    coalesce(published.snapshot #>> '{estimate,title}', proposal.title),
    accepted_copy, (select auth.uid())
  ) returning id into created_id;
  insert into public.work_order_events (
    operation_id, tenant_id, work_order_id, kind, payload, actor_id
  ) values (
    p_operation_id, p_tenant_id, created_id, 'created',
    jsonb_build_object('estimate_id', proposal.id, 'acceptance_mode', acceptance_mode),
    (select auth.uid())
  );
  update public.work_conversion_operations set work_order_id = created_id
  where operation_id = p_operation_id;
  return created_id;
end;
$$;

create function public.transition_work_order(
  p_tenant_id uuid, p_work_order_id uuid, p_expected_updated_at timestamptz,
  p_next_status text, p_operation_id uuid
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  target public.work_orders%rowtype;
  prior public.work_order_events%rowtype;
begin
  if p_tenant_id is null or p_work_order_id is null or p_expected_updated_at is null
     or p_operation_id is null or p_next_status is null then
    raise exception 'Datos de cambio de estado inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant_id and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'editor')
  ) then
    raise exception 'No tienes permiso para cambiar trabajos' using errcode = '42501';
  end if;

  select * into target from public.work_orders
  where id = p_work_order_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Trabajo no encontrado' using errcode = 'P0002'; end if;

  select * into prior from public.work_order_events
  where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.work_order_id <> p_work_order_id
       or prior.kind <> 'status_changed'
       or prior.payload->>'to' is distinct from p_next_status then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return prior.payload->>'to';
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede cambiar trabajos' using errcode = 'P0402';
  end if;
  if target.updated_at <> p_expected_updated_at then
    raise exception 'El trabajo cambió en otra sesión; recarga la ficha'
      using errcode = 'P0409';
  end if;
  if not (
    (target.status = 'ready' and p_next_status in ('scheduled', 'in_progress', 'canceled'))
    or (target.status = 'scheduled' and p_next_status in ('ready', 'in_progress', 'canceled'))
    or (target.status = 'in_progress' and p_next_status in ('completed', 'canceled'))
  ) then
    raise exception 'Transición de trabajo no permitida' using errcode = 'P0409';
  end if;

  update public.work_orders set status = p_next_status where id = target.id;
  insert into public.work_order_events (
    operation_id, tenant_id, work_order_id, kind, payload, actor_id
  ) values (
    p_operation_id, p_tenant_id, p_work_order_id, 'status_changed',
    jsonb_build_object('from', target.status, 'to', p_next_status), (select auth.uid())
  );
  return p_next_status;
end;
$$;

revoke execute on function public.protect_work_order_origin()
  from public, anon, authenticated;
revoke execute on function public.touch_work_order_version()
  from public, anon, authenticated;
revoke execute on function public.reject_work_history_change()
  from public, anon, authenticated;
revoke all on function public.convert_accepted_estimate_to_work(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.convert_accepted_estimate_to_work(uuid, uuid, uuid)
  to authenticated;
revoke all on function public.transition_work_order(uuid, uuid, timestamptz, text, uuid)
  from public, anon, authenticated;
grant execute on function public.transition_work_order(uuid, uuid, timestamptz, text, uuid)
  to authenticated;
