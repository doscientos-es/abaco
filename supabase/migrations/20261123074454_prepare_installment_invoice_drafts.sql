-- Future instalments have no implied due date. Issuance still requires one.
alter table public.invoice_milestone_drafts alter column due_date drop not null;

create or replace function public.build_invoice_milestone_draft(
  p_tenant_id uuid, p_estimate_id uuid, p_milestone_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare target public.estimates%rowtype;
declare milestone public.estimate_milestones%rowtype;
declare existing_id uuid;
declare first_id uuid;
declare last_id uuid;
declare percent_total numeric;
declare gross_cents numeric;
declare milestone_cents numeric;
declare allocated_cents numeric;
begin
  if p_tenant_id is null or p_estimate_id is null or p_milestone_id is null then
    raise exception 'Origen del borrador inválido' using errcode = '22023';
  end if;
  select * into target from public.estimates where id = p_estimate_id and tenant_id = p_tenant_id;
  if not found or target.status <> 'accepted' then
    raise exception 'Solo se preparan borradores de presupuestos aceptados' using errcode = 'P0409';
  end if;
  if target.conversion_destination <> 'work' then
    raise exception 'Los contratos se facturan por periodo, no por hito' using errcode = 'P0409';
  end if;
  select * into milestone from public.estimate_milestones
    where id = p_milestone_id and tenant_id = p_tenant_id and estimate_id = p_estimate_id;
  if not found then raise exception 'Hito no encontrado' using errcode = 'P0002'; end if;
  select id into existing_id from public.invoice_milestone_drafts
    where estimate_id = p_estimate_id and milestone_id = p_milestone_id
      and tenant_id = p_tenant_id and status = 'draft';
  if found then return existing_id; end if;
  if exists (select 1 from public.invoices where estimate_id = p_estimate_id and milestone_id = p_milestone_id) then
    raise exception 'Este hito ya tiene una factura emitida' using errcode = 'P0409';
  end if;
  select (coalesce(snapshot->'agreement', app_private.estimate_agreement_metadata(snapshot)) #>> '{price,totalCents}')::numeric
    into gross_cents from public.estimate_publications
    where estimate_id = p_estimate_id and tenant_id = p_tenant_id;
  if gross_cents is null then raise exception 'Publicación del presupuesto no disponible' using errcode = 'P0409'; end if;

  select sum(m.percent) into percent_total from public.estimate_milestones m
    where m.estimate_id = p_estimate_id and m.tenant_id = p_tenant_id;
  select m.id into first_id from public.estimate_milestones m
    where m.estimate_id = p_estimate_id and m.tenant_id = p_tenant_id and m.percent > 0
    order by m.position, m.id limit 1;
  select m.id into last_id from public.estimate_milestones m
    where m.estimate_id = p_estimate_id and m.tenant_id = p_tenant_id
    order by m.position desc, m.id desc limit 1;

  if percent_total = 100 then
    select coalesce(sum(round(gross_cents * m.percent / 100)), 0) into allocated_cents
      from public.estimate_milestones m
      where m.estimate_id = p_estimate_id and m.tenant_id = p_tenant_id and m.id <> last_id;
    if allocated_cents > gross_cents then
      raise exception 'El reparto de pagos supera el importe del presupuesto' using errcode = 'P0409';
    end if;
  end if;
  if percent_total = 100 and milestone.id = last_id then
    milestone_cents := gross_cents - allocated_cents;
  else
    milestone_cents := round(gross_cents * milestone.percent / 100);
  end if;
  if milestone_cents <= 0 then raise exception 'El hito no tiene importe facturable' using errcode = 'P0410'; end if;
  if milestone_cents > 9000000000000000 then raise exception 'Importe del hito fuera de rango' using errcode = '22003'; end if;
  insert into public.invoice_milestone_drafts
    (tenant_id, estimate_id, milestone_id, client_id, concept, total_cents, vat_rate, due_date)
  values (p_tenant_id, p_estimate_id, p_milestone_id, target.client_id,
    left(target.title || ' · ' || coalesce(nullif(milestone.label, ''), 'Hito'), 200),
    milestone_cents::bigint, target.vat_rate, case when milestone.id = first_id then current_date + 15 else null end)
  on conflict (estimate_id, milestone_id) do nothing returning id into existing_id;
  if existing_id is null then
    select id into existing_id from public.invoice_milestone_drafts
      where estimate_id = p_estimate_id and milestone_id = p_milestone_id
        and tenant_id = p_tenant_id and status = 'draft';
  end if;
  if existing_id is null then raise exception 'Este hito ya tiene una factura emitida' using errcode = 'P0409'; end if;
  return existing_id;
end;
$$;
revoke all on function public.build_invoice_milestone_draft(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.prepare_first_invoice_draft_on_acceptance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare selected record;
declare percent_total numeric;
begin
  if not (old.status = 'sent' and new.status = 'accepted'
      and old.responded_at is null and new.responded_at is not null) then return new; end if;
  if new.conversion_destination = 'contract' then return new; end if;
  select sum(m.percent) into percent_total from public.estimate_milestones m
    where m.estimate_id = new.id and m.tenant_id = new.tenant_id;
  for selected in select m.id from public.estimate_milestones m
    where m.estimate_id = new.id and m.tenant_id = new.tenant_id
    order by m.position, m.id
  loop
    begin
      perform public.build_invoice_milestone_draft(new.tenant_id, new.id, selected.id);
    exception when sqlstate 'P0410' then null;
    end;
    -- Preserve legacy acceptance for incomplete payment plans.
    if percent_total is distinct from 100 then exit; end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.prepare_first_invoice_draft_on_acceptance() from public, anon, authenticated;
