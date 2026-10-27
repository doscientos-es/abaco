-- Closing a visit creates one office billing review, without issuing an invoice.
-- Contract visits are classified separately because their recurring fee may cover
-- the service; a work order may likewise already have a billed milestone.
create table public.service_visit_billing_reviews (
  visit_id uuid primary key,
  tenant_id uuid not null,
  client_id uuid not null,
  source_kind text not null
    check (source_kind in ('contract', 'work_order', 'standalone')),
  status text not null default 'pending'
    check (status in ('pending', 'included', 'bill_separately')),
  created_at timestamptz not null default now(),
  unique (visit_id, tenant_id),
  foreign key (visit_id, tenant_id)
    references public.service_visits (id, tenant_id) on delete restrict,
  foreign key (client_id, tenant_id)
    references public.clients (id, tenant_id) on delete restrict
);
create index service_visit_billing_reviews_pending_idx
  on public.service_visit_billing_reviews (tenant_id, created_at desc)
  where status = 'pending';
alter table public.service_visit_billing_reviews enable row level security;
revoke all on public.service_visit_billing_reviews from public, anon, authenticated;
grant select on public.service_visit_billing_reviews to authenticated, service_role;
create policy service_visit_billing_reviews_select
  on public.service_visit_billing_reviews for select to authenticated using (
    public.has_role(tenant_id,
      array['owner', 'admin']::public.app_role[])
  );

create table public.service_visit_billing_review_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  tenant_id uuid not null,
  visit_id uuid not null,
  decision text not null check (decision in ('included', 'bill_separately')),
  reason text not null check (char_length(reason) between 1 and 1000),
  actor_id uuid not null,
  occurred_at timestamptz not null default now(),
  foreign key (visit_id, tenant_id)
    references public.service_visit_billing_reviews (visit_id, tenant_id)
      on delete restrict
);
create index service_visit_billing_review_events_visit_idx
  on public.service_visit_billing_review_events
  (tenant_id, visit_id, occurred_at desc);
create trigger service_visit_billing_review_events_immutable
  before update or delete on public.service_visit_billing_review_events
  for each row execute function public.reject_work_history_change();
alter table public.service_visit_billing_review_events enable row level security;
revoke all on public.service_visit_billing_review_events from public, anon, authenticated;
grant select on public.service_visit_billing_review_events to authenticated, service_role;
create policy service_visit_billing_review_events_select
  on public.service_visit_billing_review_events for select to authenticated using (
    public.has_role(tenant_id,
      array['owner', 'admin']::public.app_role[])
  );

create function public.decide_service_visit_billing_review(
  p_tenant_id uuid, p_visit_id uuid, p_decision text,
  p_reason text, p_operation_id uuid
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  target public.service_visit_billing_reviews%rowtype;
  prior public.service_visit_billing_review_events%rowtype;
  clean_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
begin
  if p_tenant_id is null or p_visit_id is null or p_operation_id is null
     or p_decision is null or p_decision not in ('included', 'bill_separately')
     or char_length(clean_reason) not between 1 and 1000 then
    raise exception 'Decisión de facturación inválida' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(p_tenant_id,
      array['owner', 'admin']::public.app_role[]) then
    raise exception 'No tienes permiso para decidir la facturación'
      using errcode = '42501';
  end if;
  select * into target from public.service_visit_billing_reviews
    where tenant_id = p_tenant_id and visit_id = p_visit_id for update;
  if not found then
    raise exception 'Pendiente de facturación no encontrado' using errcode = 'P0002';
  end if;
  select * into prior from public.service_visit_billing_review_events
    where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.visit_id <> p_visit_id
       or prior.decision <> p_decision or prior.reason <> clean_reason then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return prior.decision;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede decidir la facturación'
      using errcode = 'P0402';
  end if;
  if target.status <> 'pending' then
    raise exception 'Este pendiente ya fue revisado' using errcode = 'P0409';
  end if;
  update public.service_visit_billing_reviews
    set status = p_decision where visit_id = p_visit_id;
  insert into public.service_visit_billing_review_events
    (operation_id, tenant_id, visit_id, decision, reason, actor_id)
  values (p_operation_id, p_tenant_id, p_visit_id,
    p_decision, clean_reason, (select auth.uid()));
  return p_decision;
end;
$$;
revoke all on function public.decide_service_visit_billing_review(
  uuid, uuid, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.decide_service_visit_billing_review(
  uuid, uuid, text, text, uuid
) to authenticated;

create function public.create_service_visit_billing_review() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.service_visit_billing_reviews
    (visit_id, tenant_id, client_id, source_kind)
  values (new.id, new.tenant_id, new.client_id,
    case when new.contract_id is not null then 'contract'
      when new.work_order_id is not null then 'work_order'
      else 'standalone' end)
  on conflict (visit_id) do nothing;
  return new;
end;
$$;
create trigger service_visits_billing_review
  after update of status on public.service_visits
  for each row when (old.status is distinct from new.status and new.status = 'completed')
  execute function public.create_service_visit_billing_review();
revoke execute on function public.create_service_visit_billing_review()
  from public, anon, authenticated;

-- Historical completed visits need review without inventing an invoice.
insert into public.service_visit_billing_reviews
  (visit_id, tenant_id, client_id, source_kind, created_at)
select v.id, v.tenant_id, v.client_id,
  case when v.contract_id is not null then 'contract'
    when v.work_order_id is not null then 'work_order'
    else 'standalone' end,
  coalesce(v.actual_end_at, v.updated_at)
from public.service_visits v where v.status = 'completed'
on conflict (visit_id) do nothing;
