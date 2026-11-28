-- An office operator confirms coverage by an existing invoice; nothing issues,
-- pays, edits, sends or generates invoices here.
alter table public.service_visit_billing_reviews
  add column coverage_invoice_id uuid,
  add constraint service_visit_billing_reviews_coverage_invoice_fk
    foreign key (coverage_invoice_id, tenant_id)
    references public.invoices (id, tenant_id) on delete restrict,
  add constraint service_visit_billing_reviews_coverage_status
    check (coverage_invoice_id is null or status = 'bill_separately');

create index service_visit_billing_reviews_open_idx
  on public.service_visit_billing_reviews (tenant_id, created_at desc, visit_id desc)
  where coverage_invoice_id is null and status in ('pending', 'bill_separately');
create index service_visit_billing_reviews_coverage_idx
  on public.service_visit_billing_reviews (tenant_id, created_at desc, visit_id desc)
  where coverage_invoice_id is not null;

create table public.service_visit_invoice_coverage_events (
  operation_id uuid primary key,
  tenant_id uuid not null,
  visit_id uuid not null,
  invoice_id uuid not null,
  action text not null check (action in ('attach', 'detach')),
  reason text not null check (char_length(reason) between 1 and 1000),
  actor_id uuid not null,
  occurred_at timestamptz not null default clock_timestamp(),
  foreign key (visit_id, tenant_id)
    references public.service_visit_billing_reviews (visit_id, tenant_id) on delete restrict,
  foreign key (invoice_id, tenant_id)
    references public.invoices (id, tenant_id) on delete restrict
);
alter table public.service_visit_invoice_coverage_events enable row level security;
revoke all on public.service_visit_invoice_coverage_events from public, anon, authenticated;
grant select on public.service_visit_invoice_coverage_events to authenticated;
create policy service_visit_invoice_coverage_events_office_read
  on public.service_visit_invoice_coverage_events for select to authenticated
  using (public.has_role(tenant_id, array['owner', 'admin']::public.app_role[]));
create index service_visit_invoice_coverage_events_visit_idx
  on public.service_visit_invoice_coverage_events (tenant_id, visit_id, occurred_at desc);
create trigger service_visit_invoice_coverage_events_immutable
  before update or delete on public.service_visit_invoice_coverage_events
  for each row execute function public.reject_work_history_change();

-- Safe public wrapper; the privileged implementation is not exposed through PostgREST.
create function app_private.set_service_visit_invoice_coverage(
  p_tenant_id uuid, p_visit_id uuid, p_invoice_id uuid, p_action text,
  p_confirm_full_coverage boolean, p_reason text, p_operation_id uuid
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  current_review public.service_visit_billing_reviews%rowtype;
  prior public.service_visit_invoice_coverage_events%rowtype;
  actual_client_id uuid;
  actual_visit_status text;
  clean_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  actor uuid := (select auth.uid());
begin
  if actor is null or not coalesce(public.has_role(
    p_tenant_id, array['owner', 'admin']::public.app_role[]
  ), false) then
    raise exception 'No tienes permiso para vincular facturas a visitas' using errcode = '42501';
  end if;
  if p_tenant_id is null or p_visit_id is null or p_invoice_id is null
     or p_operation_id is null or p_action is null or p_action not in ('attach', 'detach')
     or p_confirm_full_coverage is distinct from (p_action = 'attach')
     or char_length(clean_reason) not between 1 and 1000 then
    raise exception 'Confirma la cobertura completa e indica el motivo' using errcode = '22023';
  end if;
  if not coalesce(public.tenant_can_write(p_tenant_id), false)
     or not coalesce(public.company_onboarding_allows_workspace(p_tenant_id), false) then
    raise exception 'La empresa no puede modificar la revisión de la visita' using errcode = '42501';
  end if;

  -- Lock the same review as its existing decision RPC. Serialize races and refuse stale undo.
  select * into current_review from public.service_visit_billing_reviews
    where tenant_id = p_tenant_id and visit_id = p_visit_id for update;
  if not found then raise exception 'Visita no encontrada' using errcode = 'P0002'; end if;

  select * into prior from public.service_visit_invoice_coverage_events
    where operation_id = p_operation_id;
  if found then
    if row(prior.actor_id, prior.tenant_id, prior.visit_id, prior.invoice_id, prior.action, prior.reason)
      is distinct from row(actor, p_tenant_id, p_visit_id, p_invoice_id, p_action, clean_reason) then
      raise exception 'La clave de operación ya se utilizó con otros datos' using errcode = '23505';
    end if;
    return;
  end if;

  if current_review.status <> 'bill_separately' then
    raise exception 'Primero marca la visita para facturar aparte' using errcode = 'P0409';
  end if;
  if p_action = 'attach' then
    if current_review.coverage_invoice_id is not null then
      raise exception 'La visita ya tiene una factura vinculada' using errcode = 'P0409';
    end if;
    select client_id, status into actual_client_id, actual_visit_status
      from public.service_visits where id = p_visit_id and tenant_id = p_tenant_id;
    if actual_visit_status is distinct from 'completed'
       or actual_client_id is distinct from current_review.client_id then
      raise exception 'La visita ya no está completada para este cliente' using errcode = 'P0409';
    end if;
    if not exists (
      select 1 from public.service_visit_report_reviews r
      where r.tenant_id = p_tenant_id and r.report_version_id = (
        select v.id from public.service_visit_report_versions v
          where v.visit_id = p_visit_id and v.tenant_id = p_tenant_id
          order by v.version desc limit 1
      )
    ) then
      raise exception 'Primero revisa el último parte cerrado' using errcode = 'P0409';
    end if;
    if not exists (
      select 1 from public.invoices where id = p_invoice_id and tenant_id = p_tenant_id
        and client_id = actual_client_id and status = 'issued' and total_cents > 0
    ) then
      raise exception 'Selecciona una factura emitida del mismo cliente' using errcode = 'P0002';
    end if;
  elsif current_review.coverage_invoice_id is distinct from p_invoice_id then
    raise exception 'La factura vinculada ha cambiado; recarga la visita' using errcode = 'P0409';
  end if;

  update public.service_visit_billing_reviews
    set coverage_invoice_id = case when p_action = 'attach' then p_invoice_id end
    where tenant_id = p_tenant_id and visit_id = p_visit_id;
  insert into public.service_visit_invoice_coverage_events
    (operation_id, tenant_id, visit_id, invoice_id, action, reason, actor_id)
    values (p_operation_id, p_tenant_id, p_visit_id, p_invoice_id, p_action, clean_reason, actor);
end;
$$;
revoke all on function app_private.set_service_visit_invoice_coverage(uuid, uuid, uuid, text, boolean, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function app_private.set_service_visit_invoice_coverage(uuid, uuid, uuid, text, boolean, text, uuid)
  to authenticated;

create function public.set_service_visit_invoice_coverage(
  p_tenant_id uuid, p_visit_id uuid, p_invoice_id uuid, p_action text,
  p_confirm_full_coverage boolean, p_reason text, p_operation_id uuid
) returns void
language sql security invoker set search_path = ''
  return app_private.set_service_visit_invoice_coverage(
    p_tenant_id, p_visit_id, p_invoice_id, p_action, p_confirm_full_coverage, p_reason, p_operation_id
  );
revoke all on function public.set_service_visit_invoice_coverage(uuid, uuid, uuid, text, boolean, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.set_service_visit_invoice_coverage(uuid, uuid, uuid, text, boolean, text, uuid)
  to authenticated;
