-- Operational structure is scoped to one company and one work order. The order row
-- serializes position assignment; clients cannot write these tables directly.
create table public.work_order_phases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  work_order_id uuid not null,
  position integer not null check (position > 0),
  title text not null check (char_length(title) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (id, tenant_id, work_order_id),
  unique (tenant_id, work_order_id, position),
  foreign key (work_order_id, tenant_id)
    references public.work_orders (id, tenant_id) on delete restrict
);
create table public.work_order_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  work_order_id uuid not null,
  phase_id uuid not null,
  position integer not null check (position > 0),
  title text not null check (char_length(title) between 1 and 200),
  notes text not null default '' check (char_length(notes) <= 2000),
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'done', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id, work_order_id),
  unique (tenant_id, work_order_id, phase_id, position),
  foreign key (phase_id, tenant_id, work_order_id)
    references public.work_order_phases (id, tenant_id, work_order_id) on delete restrict
);
create table public.work_task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  work_order_id uuid not null,
  task_id uuid not null,
  position integer not null check (position > 0),
  label text not null check (char_length(label) between 1 and 300),
  done boolean not null default false,
  completed_at timestamptz,
  completed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, work_order_id, task_id, position),
  foreign key (task_id, tenant_id, work_order_id)
    references public.work_order_tasks (id, tenant_id, work_order_id) on delete restrict,
  check (done = (completed_at is not null))
);
create index work_order_tasks_order_idx
  on public.work_order_tasks (tenant_id, work_order_id, status);
create index work_task_checklist_task_idx
  on public.work_task_checklist_items (tenant_id, work_order_id, task_id, position);

alter table public.work_order_phases enable row level security;
alter table public.work_order_tasks enable row level security;
alter table public.work_task_checklist_items enable row level security;
revoke all on public.work_order_phases, public.work_order_tasks,
  public.work_task_checklist_items from public, anon, authenticated;
grant select on public.work_order_phases, public.work_order_tasks,
  public.work_task_checklist_items to authenticated, service_role;
create policy work_order_phases_select on public.work_order_phases
  for select to authenticated using (public.is_member(tenant_id));
create policy work_order_tasks_select on public.work_order_tasks
  for select to authenticated using (public.is_member(tenant_id));
create policy work_task_checklist_items_select on public.work_task_checklist_items
  for select to authenticated using (public.is_member(tenant_id));
create trigger work_order_tasks_touch before update on public.work_order_tasks
  for each row execute function public.touch_updated_at();
create trigger work_task_checklist_items_touch
  before update on public.work_task_checklist_items
  for each row execute function public.touch_updated_at();

alter table public.work_order_events drop constraint work_order_events_kind_check;
alter table public.work_order_events add constraint work_order_events_kind_check
  check (kind in (
    'created', 'status_changed', 'plan_changed', 'phase_added', 'task_added',
    'task_status_changed', 'checklist_item_added', 'checklist_item_changed'
  ));

create function public.apply_work_structure_command(
  p_tenant_id uuid, p_work_order_id uuid, p_action text,
  p_payload jsonb, p_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  target public.work_orders%rowtype;
  prior public.work_order_events%rowtype;
  phase public.work_order_phases%rowtype;
  task public.work_order_tasks%rowtype;
  item public.work_task_checklist_items%rowtype;
  result jsonb;
  clean_title text;
  expected_at timestamptz;
  next_status text;
  next_done boolean;
begin
  if p_tenant_id is null or p_work_order_id is null or p_operation_id is null
     or p_action is null or p_action not in (
       'phase_added', 'task_added', 'task_status_changed',
       'checklist_item_added', 'checklist_item_changed'
     ) or p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 8192 then
    raise exception 'Comando de trabajo inválido' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para modificar trabajos' using errcode = '42501';
  end if;
  select * into target from public.work_orders
  where id = p_work_order_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Trabajo no encontrado' using errcode = 'P0002'; end if;

  select * into prior from public.work_order_events
  where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.work_order_id <> p_work_order_id
       or prior.kind <> p_action or prior.payload->'request' <> p_payload then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return prior.payload->'result';
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede modificar trabajos' using errcode = 'P0402';
  end if;
  if target.status in ('completed', 'canceled') then
    raise exception 'No se puede modificar un trabajo cerrado' using errcode = 'P0409';
  end if;

  if p_action = 'phase_added' then
    clean_title := trim(p_payload->>'title');
    if clean_title is null or char_length(clean_title) not between 1 and 160 then
      raise exception 'Título de fase inválido' using errcode = '22023';
    end if;
    insert into public.work_order_phases (tenant_id, work_order_id, position, title)
    select p_tenant_id, p_work_order_id, coalesce(max(position), 0) + 1, clean_title
    from public.work_order_phases
    where tenant_id = p_tenant_id and work_order_id = p_work_order_id
    returning * into phase;
    result := jsonb_build_object('id', phase.id, 'position', phase.position);

  elsif p_action = 'task_added' then
    clean_title := trim(p_payload->>'title');
    if clean_title is null or char_length(clean_title) not between 1 and 200
       or char_length(coalesce(p_payload->>'notes', '')) > 2000 then
      raise exception 'Tarea inválida' using errcode = '22023';
    end if;
    select * into phase from public.work_order_phases
    where id = (p_payload->>'phase_id')::uuid
      and tenant_id = p_tenant_id and work_order_id = p_work_order_id;
    if not found then raise exception 'Fase no encontrada' using errcode = 'P0002'; end if;
    insert into public.work_order_tasks (
      tenant_id, work_order_id, phase_id, position, title, notes
    ) select p_tenant_id, p_work_order_id, phase.id,
      coalesce(max(position), 0) + 1, clean_title,
      trim(coalesce(p_payload->>'notes', ''))
    from public.work_order_tasks
    where tenant_id = p_tenant_id and work_order_id = p_work_order_id
      and phase_id = phase.id
    returning * into task;
    result := jsonb_build_object('id', task.id, 'position', task.position);

  elsif p_action = 'task_status_changed' then
    next_status := p_payload->>'status';
    expected_at := (p_payload->>'expected_updated_at')::timestamptz;
    if next_status is null or next_status not in (
      'pending', 'in_progress', 'done', 'skipped'
    ) or expected_at is null then
      raise exception 'Estado de tarea inválido' using errcode = '22023';
    end if;
    select * into task from public.work_order_tasks
    where id = (p_payload->>'task_id')::uuid
      and tenant_id = p_tenant_id and work_order_id = p_work_order_id for update;
    if not found then raise exception 'Tarea no encontrada' using errcode = 'P0002'; end if;
    if task.updated_at <> expected_at then
      raise exception 'La tarea cambió en otra sesión; recarga la ficha'
        using errcode = 'P0409';
    end if;
    if task.status = next_status then
      raise exception 'La tarea ya tiene ese estado' using errcode = 'P0409';
    end if;
    if next_status = 'done' and exists (
      select 1 from public.work_task_checklist_items c
      where c.tenant_id = p_tenant_id and c.work_order_id = p_work_order_id
        and c.task_id = task.id and not c.done
    ) then
      raise exception 'Completa la lista de comprobación antes de terminar la tarea'
        using errcode = 'P0409';
    end if;
    update public.work_order_tasks set status = next_status
    where id = task.id returning * into task;
    result := jsonb_build_object(
      'id', task.id, 'status', task.status, 'updated_at', task.updated_at
    );

  elsif p_action = 'checklist_item_added' then
    clean_title := trim(p_payload->>'label');
    if clean_title is null or char_length(clean_title) not between 1 and 300 then
      raise exception 'Elemento de comprobación inválido' using errcode = '22023';
    end if;
    select * into task from public.work_order_tasks
    where id = (p_payload->>'task_id')::uuid
      and tenant_id = p_tenant_id and work_order_id = p_work_order_id for update;
    if not found then raise exception 'Tarea no encontrada' using errcode = 'P0002'; end if;
    if task.status in ('done', 'skipped') then
      raise exception 'Reabre la tarea antes de añadir comprobaciones'
        using errcode = 'P0409';
    end if;
    insert into public.work_task_checklist_items (
      tenant_id, work_order_id, task_id, position, label
    ) select p_tenant_id, p_work_order_id, task.id,
      coalesce(max(position), 0) + 1, clean_title
    from public.work_task_checklist_items
    where tenant_id = p_tenant_id and work_order_id = p_work_order_id
      and task_id = task.id
    returning * into item;
    result := jsonb_build_object('id', item.id, 'position', item.position);

  elsif p_action = 'checklist_item_changed' then
    expected_at := (p_payload->>'expected_updated_at')::timestamptz;
    if jsonb_typeof(p_payload->'done') is distinct from 'boolean'
       or expected_at is null then
      raise exception 'Estado de comprobación inválido' using errcode = '22023';
    end if;
    next_done := (p_payload->>'done')::boolean;
    select * into item from public.work_task_checklist_items
    where id = (p_payload->>'item_id')::uuid
      and tenant_id = p_tenant_id and work_order_id = p_work_order_id for update;
    if not found then
      raise exception 'Elemento de comprobación no encontrado' using errcode = 'P0002';
    end if;
    if item.updated_at <> expected_at then
      raise exception 'La comprobación cambió en otra sesión; recarga la ficha'
        using errcode = 'P0409';
    end if;
    if item.done = next_done then
      raise exception 'La comprobación ya tiene ese estado' using errcode = 'P0409';
    end if;
    select * into task from public.work_order_tasks
    where id = item.task_id and tenant_id = p_tenant_id
      and work_order_id = p_work_order_id;
    if task.status in ('done', 'skipped') then
      raise exception 'Reabre la tarea antes de modificar sus comprobaciones'
        using errcode = 'P0409';
    end if;
    update public.work_task_checklist_items set
      done = next_done,
      completed_at = case when next_done then clock_timestamp() else null end,
      completed_by = case when next_done then (select auth.uid()) else null end
    where id = item.id returning * into item;
    result := jsonb_build_object(
      'id', item.id, 'done', item.done, 'updated_at', item.updated_at
    );
  end if;

  update public.work_orders set updated_at = updated_at where id = target.id;
  insert into public.work_order_events (
    operation_id, tenant_id, work_order_id, kind, payload, actor_id
  ) values (
    p_operation_id, p_tenant_id, p_work_order_id, p_action,
    jsonb_build_object('request', p_payload, 'result', result), (select auth.uid())
  );
  return result;
end;
$$;
revoke all on function public.apply_work_structure_command(uuid, uuid, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.apply_work_structure_command(uuid, uuid, text, jsonb, uuid)
  to authenticated;

-- A work order cannot be marked complete while executable tasks remain open.
create or replace function public.record_work_order_execution_times() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status = 'scheduled' and new.planned_start_at is null then
    raise exception 'Indica el inicio previsto antes de planificar el trabajo'
      using errcode = 'P0409';
  end if;
  if new.status = 'completed' and exists (
    select 1 from public.work_order_tasks task
    where task.tenant_id = new.tenant_id and task.work_order_id = new.id
      and task.status not in ('done', 'skipped')
  ) then
    raise exception 'Termina o descarta las tareas pendientes antes de cerrar el trabajo'
      using errcode = 'P0409';
  end if;
  if new.status = 'in_progress' and old.status <> 'in_progress'
     and new.actual_start_at is null then
    new.actual_start_at := clock_timestamp();
  end if;
  if new.status in ('completed', 'canceled') and old.status = 'in_progress'
     and new.actual_end_at is null then
    new.actual_end_at := clock_timestamp();
  end if;
  return new;
end;
$$;
