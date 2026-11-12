-- M14: one revisable field draft per visit. Each accepted save keeps an immutable
-- version so an offline or stale device cannot silently overwrite another edit.
create table public.service_visit_reports (
  visit_id uuid primary key,
  tenant_id uuid not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (visit_id, tenant_id)
    references public.service_visits (id, tenant_id) on delete restrict
);
create index service_visit_reports_tenant_idx
  on public.service_visit_reports (tenant_id, updated_at desc);

create table public.service_visit_report_writes (
  operation_id uuid primary key,
  tenant_id uuid not null,
  visit_id uuid not null,
  expected_revision bigint not null check (expected_revision >= 0),
  revision bigint not null check (revision > 0),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  actor_id uuid not null,
  occurred_at timestamptz not null default now(),
  foreign key (visit_id, tenant_id)
    references public.service_visits (id, tenant_id) on delete restrict,
  unique (visit_id, revision)
);
create index service_visit_report_writes_visit_idx
  on public.service_visit_report_writes (tenant_id, visit_id, revision desc);
create trigger service_visit_report_writes_immutable
  before update or delete on public.service_visit_report_writes
  for each row execute function public.reject_work_history_change();

alter table public.service_visit_reports enable row level security;
alter table public.service_visit_report_writes enable row level security;
revoke all on public.service_visit_reports, public.service_visit_report_writes
  from public, anon, authenticated;
grant select on public.service_visit_reports, public.service_visit_report_writes
  to authenticated, service_role;
create policy service_visit_reports_select on public.service_visit_reports
  for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
    or exists (
      select 1 from public.service_visits v
      where v.id = service_visit_reports.visit_id
        and v.tenant_id = service_visit_reports.tenant_id
        and v.assigned_user_id = (select auth.uid())
        and public.has_role(tenant_id, array['technician']::public.app_role[])
    )
  );
create policy service_visit_report_writes_select on public.service_visit_report_writes
  for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
    or exists (
      select 1 from public.service_visits v
      where v.id = service_visit_report_writes.visit_id
        and v.tenant_id = service_visit_report_writes.tenant_id
        and v.assigned_user_id = (select auth.uid())
        and public.has_role(tenant_id, array['technician']::public.app_role[])
    )
  );

create function public.save_service_visit_report(
  p_tenant_id uuid, p_visit_id uuid, p_expected_revision bigint,
  p_data jsonb, p_operation_id uuid
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  target public.service_visits%rowtype;
  report public.service_visit_reports%rowtype;
  prior public.service_visit_report_writes%rowtype;
  item jsonb;
  next_revision bigint;
begin
  if p_tenant_id is null or p_visit_id is null or p_operation_id is null
     or p_expected_revision is null or p_expected_revision < 0
     or p_data is null or pg_catalog.jsonb_typeof(p_data) <> 'object'
     or pg_catalog.octet_length(p_data::text) > 32000
     or not (p_data ? 'notes') or not (p_data ? 'checklist')
     or p_data - 'notes' - 'checklist' <> '{}'::jsonb
     or pg_catalog.jsonb_typeof(p_data->'notes') <> 'string'
     or pg_catalog.char_length(p_data->>'notes') > 4000
     or pg_catalog.jsonb_typeof(p_data->'checklist') <> 'array' then
    raise exception 'Datos del parte inválidos' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(p_data->'checklist') > 50 then
    raise exception 'La lista de comprobación supera 50 elementos'
      using errcode = '22023';
  end if;
  for item in select value from pg_catalog.jsonb_array_elements(p_data->'checklist') loop
    if pg_catalog.jsonb_typeof(item) <> 'object'
       or item - 'id' - 'label' - 'done' <> '{}'::jsonb
       or pg_catalog.jsonb_typeof(item->'id') <> 'string'
       or pg_catalog.char_length(item->>'id') not between 1 and 64
       or pg_catalog.jsonb_typeof(item->'label') <> 'string'
       or pg_catalog.char_length(pg_catalog.btrim(item->>'label')) not between 1 and 160
       or pg_catalog.jsonb_typeof(item->'done') <> 'boolean' then
      raise exception 'Elemento de comprobación inválido' using errcode = '22023';
    end if;
  end loop;
  if (
    select count(*) from pg_catalog.jsonb_array_elements(p_data->'checklist')
  ) <> (
    select count(distinct value->>'id')
    from pg_catalog.jsonb_array_elements(p_data->'checklist')
  ) then
    raise exception 'La lista contiene identificadores duplicados'
      using errcode = '22023';
  end if;

  if (select auth.uid()) is null then
    raise exception 'Sesión requerida' using errcode = '28000';
  end if;
  if not public.has_role(p_tenant_id,
    array['owner', 'admin', 'editor', 'technician']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para editar este parte'
      using errcode = '42501';
  end if;
  select * into target from public.service_visits
  where id = p_visit_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Visita no encontrada' using errcode = 'P0002'; end if;
  if not (
    public.has_role(p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
    or (target.assigned_user_id = (select auth.uid()) and
      public.has_role(p_tenant_id, array['technician']::public.app_role[]))
  ) then
    raise exception 'No tienes permiso para editar este parte'
      using errcode = '42501';
  end if;
  select * into prior from public.service_visit_report_writes
  where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.visit_id <> p_visit_id
       or prior.expected_revision <> p_expected_revision
       or prior.data <> p_data then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return prior.revision;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede guardar partes' using errcode = 'P0402';
  end if;
  if target.status not in ('scheduled', 'in_progress') then
    raise exception 'Una visita cerrada no admite cambios en el borrador'
      using errcode = 'P0409';
  end if;
  select * into report from public.service_visit_reports
  where visit_id = p_visit_id and tenant_id = p_tenant_id;
  if coalesce(report.revision, 0) <> p_expected_revision then
    raise exception 'El parte cambió en otra sesión; compara las dos versiones'
      using errcode = 'P0409';
  end if;
  next_revision := p_expected_revision + 1;
  if report.visit_id is null then
    insert into public.service_visit_reports
      (visit_id, tenant_id, data, revision, updated_by)
    values (p_visit_id, p_tenant_id, p_data, next_revision, (select auth.uid()));
  else
    update public.service_visit_reports
    set data = p_data, revision = next_revision,
      updated_by = (select auth.uid()), updated_at = clock_timestamp()
    where visit_id = p_visit_id;
  end if;
  insert into public.service_visit_report_writes (
    operation_id, tenant_id, visit_id, expected_revision,
    revision, data, actor_id
  ) values (
    p_operation_id, p_tenant_id, p_visit_id, p_expected_revision,
    next_revision, p_data, (select auth.uid())
  );
  return next_revision;
end;
$$;
revoke all on function public.save_service_visit_report(
  uuid, uuid, bigint, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.save_service_visit_report(
  uuid, uuid, bigint, jsonb, uuid
) to authenticated;
