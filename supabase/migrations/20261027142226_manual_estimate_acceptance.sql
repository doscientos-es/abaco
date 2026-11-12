-- An office acceptance is recorded separately from a public-link response.
-- The description identifies the evidence held by the company; it is not a customer signature.
create table public.estimate_manual_acceptances (
  estimate_id uuid primary key,
  tenant_id uuid not null,
  operation_id uuid not null unique,
  accepted_at timestamptz not null default now(),
  accepted_by text not null check (char_length(accepted_by) between 2 and 120),
  evidence_description text not null check (char_length(evidence_description) between 12 and 2000),
  recorded_by uuid,
  foreign key (estimate_id, tenant_id)
    references public.estimates (id, tenant_id) on delete restrict
);
alter table public.estimate_manual_acceptances enable row level security;
revoke all on public.estimate_manual_acceptances from public, anon, authenticated;
grant select on public.estimate_manual_acceptances to authenticated, service_role;
create policy estimate_manual_acceptances_select on public.estimate_manual_acceptances
  for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
  );
create function public.reject_manual_acceptance_change() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'La evidencia de aceptación manual es inmutable';
  return old;
end;
$$;
create trigger estimate_manual_acceptances_immutable
  before update or delete on public.estimate_manual_acceptances
  for each row execute function public.reject_manual_acceptance_change();
revoke execute on function public.reject_manual_acceptance_change()
  from public, anon, authenticated;

create function public.accept_estimate_manually(
  p_tenant_id uuid, p_estimate_id uuid, p_operation_id uuid,
  p_accepted_by text, p_evidence_description text
) returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  proposal public.estimates%rowtype;
  prior public.estimate_manual_acceptances%rowtype;
  accepted_at timestamptz;
  accepted_by text := trim(p_accepted_by);
  evidence text := trim(p_evidence_description);
begin
  if p_tenant_id is null or p_estimate_id is null or p_operation_id is null
     or accepted_by is null or char_length(accepted_by) not between 2 and 120
     or evidence is null or char_length(evidence) not between 12 and 2000 then
    raise exception 'Datos de aceptación inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para aceptar presupuestos' using errcode = '42501';
  end if;
  select * into prior from public.estimate_manual_acceptances
  where operation_id = p_operation_id;
  if found and (prior.tenant_id <> p_tenant_id or prior.estimate_id <> p_estimate_id
    or prior.accepted_by <> accepted_by or prior.evidence_description <> evidence) then
    raise exception 'La clave de operación ya se utilizó con otros datos'
      using errcode = '23505';
  end if;
  if found then return prior.accepted_at; end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede aceptar presupuestos' using errcode = 'P0402';
  end if;

  select * into proposal from public.estimates
  where id = p_estimate_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Presupuesto no encontrado' using errcode = 'P0002'; end if;
  select * into prior from public.estimate_manual_acceptances
  where estimate_id = p_estimate_id;
  if found then
    if prior.accepted_by <> accepted_by or prior.evidence_description <> evidence then
      raise exception 'Este presupuesto ya tiene otra aceptación manual' using errcode = 'P0409';
    end if;
    return prior.accepted_at;
  end if;
  if proposal.status <> 'sent' then
    raise exception 'Solo se puede aceptar manualmente una versión enviada'
      using errcode = 'P0409';
  end if;
  if not exists (
    select 1 from public.estimate_publications p
    where p.estimate_id = p_estimate_id and p.tenant_id = p_tenant_id
  ) then
    raise exception 'Falta la versión publicada del presupuesto' using errcode = 'P0409';
  end if;

  accepted_at := clock_timestamp();
  update public.estimates set status = 'accepted', responded_at = accepted_at,
    responded_by = accepted_by where id = proposal.id;
  insert into public.estimate_manual_acceptances (
    estimate_id, tenant_id, operation_id, accepted_at,
    accepted_by, evidence_description, recorded_by
  ) values (
    p_estimate_id, p_tenant_id, p_operation_id, accepted_at,
    accepted_by, evidence, (select auth.uid())
  );
  return accepted_at;
end;
$$;
revoke all on function public.accept_estimate_manually(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.accept_estimate_manually(uuid, uuid, uuid, text, text)
  to authenticated;

-- The conversion command reads the manual record to preserve its distinct provenance.
create or replace function public.convert_accepted_estimate_to_work(
  p_tenant_id uuid, p_estimate_id uuid, p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  prior public.work_conversion_operations%rowtype;
  proposal public.estimates%rowtype;
  published public.estimate_publications%rowtype;
  manual public.estimate_manual_acceptances%rowtype;
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

  select * into manual from public.estimate_manual_acceptances
  where estimate_id = proposal.id and tenant_id = proposal.tenant_id;
  acceptance_mode := case when found then 'office_manual'
    when proposal.responded_at is null then 'legacy_unverified' else 'public_link' end;
  accepted_copy := published.snapshot || jsonb_build_object(
    'acceptance', jsonb_build_object(
      'mode', acceptance_mode, 'responded_at', proposal.responded_at,
      'responded_by', proposal.responded_by,
      'evidence_description', case when manual.estimate_id is not null
        then manual.evidence_description else null end,
      'recorded_by', manual.recorded_by
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
