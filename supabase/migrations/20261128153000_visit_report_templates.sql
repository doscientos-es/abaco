-- Tenant-owned draft/published report checklists. Published copies are never joined into reports.
create table app_private.visit_report_templates (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  service_kind text not null check (service_kind in ('cleaning', 'hvac', 'commissioning')),
  draft_revision integer not null check (draft_revision > 0),
  draft_labels text[] not null check (cardinality(draft_labels) between 1 and 20),
  draft_by uuid references auth.users(id) on delete set null,
  draft_at timestamptz not null default now(),
  published_version integer check (published_version between 1 and draft_revision),
  published_labels text[],
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  check ((published_version is null) = (published_labels is null)),
  check ((published_version is null) = (published_at is null)),
  primary key (tenant_id, service_kind)
);
alter table app_private.visit_report_templates enable row level security;

create table app_private.visit_report_template_use (
  visit_id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  service_kind text not null check (service_kind in ('cleaning', 'hvac', 'commissioning')),
  published_version integer not null check (published_version > 0),
  operation_id uuid not null unique,
  applied_by uuid references auth.users(id) on delete set null,
  applied_at timestamptz not null default now(),
  foreign key (visit_id, tenant_id) references public.service_visits(id, tenant_id) on delete cascade
);
alter table app_private.visit_report_template_use enable row level security;
create index visit_report_template_use_tenant_idx
  on app_private.visit_report_template_use (tenant_id, applied_at desc);

revoke all on table app_private.visit_report_templates, app_private.visit_report_template_use
  from public, anon, authenticated, service_role;

create function app_private.require_visit_report_template_admin(p_tenant_id uuid, p_write boolean)
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  if p_tenant_id is null or (select auth.uid()) is null or not coalesce(
    public.has_role(p_tenant_id, array['owner', 'admin']::public.app_role[]), false
  ) then
    raise exception 'No tienes permiso para gestionar plantillas de partes' using errcode = '42501';
  end if;
  if p_write and not coalesce(public.tenant_can_write(p_tenant_id), false) then
    raise exception 'La empresa no puede modificar plantillas ni partes' using errcode = 'P0402';
  end if;
end;
$$;

create function app_private.validate_visit_report_template_kind(p_service_kind text)
returns void language plpgsql immutable security invoker set search_path = ''
as $$
begin
  if p_service_kind is null or p_service_kind not in ('cleaning', 'hvac', 'commissioning') then
    raise exception 'Servicio de plantilla inválido' using errcode = '22023';
  end if;
end;
$$;

create function app_private.list_visit_report_templates(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform app_private.require_visit_report_template_admin(p_tenant_id, false);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'service_kind', t.service_kind,
      'draft_revision', t.draft_revision,
      'draft_labels', t.draft_labels,
      'published_version', t.published_version,
      'published_labels', t.published_labels
    ) order by t.service_kind)
    from app_private.visit_report_templates t where t.tenant_id = p_tenant_id
  ), '[]'::jsonb);
end;
$$;

create function app_private.save_visit_report_template_draft(
  p_tenant_id uuid, p_service_kind text, p_expected_revision integer, p_labels jsonb
) returns integer language plpgsql security definer set search_path = ''
as $$
declare
  label_item jsonb;
  label_text text;
  labels text[] := array[]::text[];
  saved_revision integer;
begin
  perform app_private.require_visit_report_template_admin(p_tenant_id, true);
  perform app_private.validate_visit_report_template_kind(p_service_kind);
  if p_expected_revision is null or p_expected_revision < 0
     or p_labels is null or jsonb_typeof(p_labels) <> 'array' or octet_length(p_labels::text) > 15000 then
    raise exception 'El borrador de la plantilla no es válido' using errcode = '22023';
  end if;
  if jsonb_array_length(p_labels) not between 1 and 20 then
    raise exception 'La plantilla debe tener entre 1 y 20 comprobaciones' using errcode = '22023';
  end if;
  for label_item in select value from jsonb_array_elements(p_labels) loop
    if jsonb_typeof(label_item) <> 'string' then
      raise exception 'Las comprobaciones solo admiten texto' using errcode = '22023';
    end if;
    label_text := regexp_replace(label_item #>> '{}', '^[[:space:]]+|[[:space:]]+$', '', 'g');
    if char_length(label_text) not between 1 and 160
       or label_text ~ '[[:cntrl:]]'
       or exists (select 1 from unnest(labels) x where lower(x) = lower(label_text)) then
      raise exception 'Revisa la longitud y los duplicados de las comprobaciones' using errcode = '22023';
    end if;
    labels := array_append(labels, label_text);
  end loop;

  if p_expected_revision = 0 then
    insert into app_private.visit_report_templates
      (tenant_id, service_kind, draft_revision, draft_labels, draft_by)
    values (p_tenant_id, p_service_kind, 1, labels, (select auth.uid()))
    on conflict (tenant_id, service_kind) do nothing returning draft_revision into saved_revision;
  else
    update app_private.visit_report_templates
    set draft_revision = draft_revision + 1, draft_labels = labels, draft_by = (select auth.uid()),
      draft_at = clock_timestamp()
    where tenant_id = p_tenant_id and service_kind = p_service_kind
      and draft_revision = p_expected_revision
    returning draft_revision into saved_revision;
  end if;
  if saved_revision is null then
    raise exception 'La plantilla cambió en otra sesión. Vuelve a cargarla.' using errcode = 'P0409';
  end if;
  return saved_revision;
end;
$$;

create function app_private.publish_visit_report_template(
  p_tenant_id uuid, p_service_kind text, p_expected_revision integer
) returns integer language plpgsql security definer set search_path = ''
as $$
declare target app_private.visit_report_templates%rowtype;
begin
  perform app_private.require_visit_report_template_admin(p_tenant_id, true);
  perform app_private.validate_visit_report_template_kind(p_service_kind);
  select * into target from app_private.visit_report_templates
    where tenant_id = p_tenant_id and service_kind = p_service_kind for update;
  if not found or p_expected_revision is null or target.draft_revision <> p_expected_revision then
    raise exception 'Guarda o vuelve a cargar el borrador antes de publicarlo' using errcode = 'P0409';
  end if;
  if target.published_version is distinct from target.draft_revision then
    update app_private.visit_report_templates
    set published_version = target.draft_revision, published_labels = target.draft_labels,
      published_at = clock_timestamp(), published_by = (select auth.uid())
    where tenant_id = p_tenant_id and service_kind = p_service_kind;
  end if;
  return target.draft_revision;
end;
$$;

create function app_private.apply_visit_report_template(
  p_tenant_id uuid, p_visit_id uuid, p_service_kind text,
  p_published_version integer, p_operation_id uuid
) returns bigint language plpgsql security definer set search_path = ''
as $$
declare
  target public.service_visits%rowtype;
  template app_private.visit_report_templates%rowtype;
  prior app_private.visit_report_template_use%rowtype;
  checklist jsonb;
  revision bigint;
begin
  perform app_private.require_visit_report_template_admin(p_tenant_id, true);
  perform app_private.validate_visit_report_template_kind(p_service_kind);
  if p_visit_id is null or p_published_version is null or p_published_version < 1 or p_operation_id is null then
    raise exception 'Faltan los datos de la visita o de la plantilla' using errcode = '22023';
  end if;
  -- Use the same lock as normal report saves/visit close. Never update a report.
  select * into target from public.service_visits
    where id = p_visit_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Visita no encontrada' using errcode = 'P0002'; end if;

  select * into prior from app_private.visit_report_template_use
    where visit_id = p_visit_id and tenant_id = p_tenant_id;
  if found and prior.operation_id = p_operation_id
     and prior.applied_by = (select auth.uid()) and prior.service_kind = p_service_kind
     and prior.published_version = p_published_version then
    return 1; -- Idempotent acknowledgement; it does not rewrite any newer report.
  end if;
  if found or target.status is distinct from 'scheduled' or exists (
    select 1 from public.service_visit_reports where visit_id = p_visit_id and tenant_id = p_tenant_id
  ) then
    raise exception 'Solo se puede aplicar a visitas programadas que aún no tienen parte'
      using errcode = 'P0409';
  end if;
  select * into template from app_private.visit_report_templates
    where tenant_id = p_tenant_id and service_kind = p_service_kind for share;
  if not found or template.published_version is distinct from p_published_version then
    raise exception 'La versión publicada cambió o no existe. Vuelve a cargarla.' using errcode = 'P0409';
  end if;
  select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'label', label, 'done', false) order by n)
    into checklist from unnest(template.published_labels) with ordinality as labels(label, n);

  revision := public.save_service_visit_report(p_tenant_id, p_visit_id, 0,
    jsonb_build_object('notes', '', 'checklist', checklist, 'recommendations', '', 'next_actions', ''),
    p_operation_id);
  insert into app_private.visit_report_template_use
    (visit_id, tenant_id, service_kind, published_version, operation_id, applied_by)
  values (p_visit_id, p_tenant_id, p_service_kind, p_published_version, p_operation_id, (select auth.uid()));
  return revision;
end;
$$;

-- Prebound invoker wrappers: callers have no USAGE on app_private.
create function public.list_visit_report_templates(p_tenant_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
begin atomic select app_private.list_visit_report_templates(p_tenant_id); end;
create function public.save_visit_report_template_draft(
  p_tenant_id uuid, p_service_kind text, p_expected_revision integer, p_labels jsonb
) returns integer language sql security invoker set search_path = ''
begin atomic select app_private.save_visit_report_template_draft(p_tenant_id, p_service_kind, p_expected_revision, p_labels); end;
create function public.publish_visit_report_template(
  p_tenant_id uuid, p_service_kind text, p_expected_revision integer
) returns integer language sql security invoker set search_path = ''
begin atomic select app_private.publish_visit_report_template(p_tenant_id, p_service_kind, p_expected_revision); end;
create function public.apply_visit_report_template(
  p_tenant_id uuid, p_visit_id uuid, p_service_kind text, p_published_version integer, p_operation_id uuid
) returns bigint language sql security invoker set search_path = ''
begin atomic select app_private.apply_visit_report_template(p_tenant_id, p_visit_id, p_service_kind, p_published_version, p_operation_id); end;

revoke all on function app_private.require_visit_report_template_admin(uuid, boolean),
  app_private.validate_visit_report_template_kind(text)
  from public, anon, authenticated, service_role;
revoke all on function
  app_private.list_visit_report_templates(uuid),
  app_private.save_visit_report_template_draft(uuid, text, integer, jsonb),
  app_private.publish_visit_report_template(uuid, text, integer),
  app_private.apply_visit_report_template(uuid, uuid, text, integer, uuid),
  public.list_visit_report_templates(uuid),
  public.save_visit_report_template_draft(uuid, text, integer, jsonb),
  public.publish_visit_report_template(uuid, text, integer),
  public.apply_visit_report_template(uuid, uuid, text, integer, uuid)
  from public, anon, authenticated, service_role;

grant execute on function
  app_private.list_visit_report_templates(uuid),
  app_private.save_visit_report_template_draft(uuid, text, integer, jsonb),
  app_private.publish_visit_report_template(uuid, text, integer),
  app_private.apply_visit_report_template(uuid, uuid, text, integer, uuid),
  public.list_visit_report_templates(uuid),
  public.save_visit_report_template_draft(uuid, text, integer, jsonb),
  public.publish_visit_report_template(uuid, text, integer),
  public.apply_visit_report_template(uuid, uuid, text, integer, uuid)
  to authenticated;

-- Publish the invoker entry points to the local Data API schema cache.
notify pgrst, 'reload schema';
