-- Preserve the legacy validator while extending the price-section JSON shape.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.valid_estimate_sections(jsonb)'::regprocedure) into definition;
  definition := replace(definition, 'FUNCTION public.valid_estimate_sections(', 'FUNCTION app_private.valid_estimate_sections_without_gross(');
  if definition not like '%FUNCTION app_private.valid_estimate_sections_without_gross(%' then
    raise exception 'Unexpected estimate section validator';
  end if;
  execute definition;
end;
$$;
revoke all on function app_private.valid_estimate_sections_without_gross(jsonb) from public, anon, authenticated;

create or replace function public.valid_estimate_sections(value jsonb) returns boolean
language plpgsql immutable security definer set search_path = '' as $$
declare section jsonb; cleaned jsonb := '[]'::jsonb; gross numeric;
begin
  if jsonb_typeof(value) is distinct from 'array' then return false; end if;
  for section in select * from jsonb_array_elements(value) loop
    if section ? 'grossCents' then
      if section->>'type' is distinct from 'prices' or jsonb_typeof(section->'grossCents') is distinct from 'number' then return false; end if;
      gross := (section->>'grossCents')::numeric;
      if gross <> trunc(gross) or gross < 0 or gross > 99999999999 then return false; end if;
      section := section - 'grossCents';
    end if;
    cleaned := cleaned || jsonb_build_array(section);
  end loop;
  return char_length(value::text) <= 1000000 and app_private.valid_estimate_sections_without_gross(cleaned);
end;
$$;
revoke all on function public.valid_estimate_sections(jsonb) from public, anon;
grant execute on function public.valid_estimate_sections(jsonb) to authenticated, service_role;

alter function app_private.estimate_agreement_metadata(jsonb) rename to estimate_agreement_metadata_without_exact_gross;
create function app_private.estimate_agreement_metadata(p_snapshot jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  result jsonb := app_private.estimate_agreement_metadata_without_exact_gross(p_snapshot);
  proposal jsonb := p_snapshot->'estimate'; section jsonb; line jsonb;
  gross numeric; base numeric; subtotal numeric; vat_rate numeric; difference numeric; adjustment numeric;
begin
  if proposal->>'document_format' is distinct from 'sections' or jsonb_array_length(proposal->'estimate_lines') <> 1 then return result; end if;
  select s into section from jsonb_array_elements(proposal->'document_sections') s where s->>'type'='prices' and s ? 'grossCents' limit 1;
  if section is null or jsonb_array_length(section->'lineIds') <> 1 then return result; end if;
  line := proposal->'estimate_lines'->0;
  gross := (section->>'grossCents')::numeric;
  base := (line->>'unit_price_cents')::numeric;
  vat_rate := (proposal->>'vat_rate')::numeric;
  if section->'lineIds'->>0 is distinct from line->>'id' or (line->>'quantity')::numeric <> 1
    or (line->>'discount_percent')::numeric <> 0 or base <> round(gross / (1 + vat_rate / 100)) then return result; end if;
  subtotal := (result #>> '{price,netCents}')::numeric;
  difference := gross - base - round(base * vat_rate / 100);
  adjustment := case when base = 0 then 0 else sign(difference) * round(abs(difference) * subtotal / base) end;
  result := jsonb_set(result, '{price,vatCents}', to_jsonb((result #>> '{price,vatCents}')::numeric + adjustment));
  return jsonb_set(result, '{price,totalCents}', to_jsonb(subtotal + (result #>> '{price,vatCents}')::numeric));
end;
$$;
revoke all on function app_private.estimate_agreement_metadata(jsonb) from public, anon, authenticated, service_role;
revoke all on function app_private.estimate_agreement_metadata_without_exact_gross(jsonb) from public, anon, authenticated, service_role;

-- Snapshot the precise amount on new priced periods, never rewrite existing obligations.
alter table public.contract_billing_periods add column agreed_total_cents bigint
  check (agreed_total_cents between 0 and 9000000000000000);
create function app_private.capture_contract_period_total() returns trigger
language plpgsql security definer set search_path = '' as $$
declare source jsonb; agreed jsonb;
begin
  if new.pricing_status <> 'priced' then return new; end if;
  select source_snapshot into source from public.service_contracts where id=new.contract_id and tenant_id=new.tenant_id;
  agreed := source->'agreement'->'price';
  if exists(select 1 from jsonb_array_elements(coalesce(source #> '{estimate,document_sections}','[]'::jsonb)) s where s->>'type'='prices' and s ? 'grossCents')
    and (agreed->>'netCents')::numeric = new.net_cents
    and (agreed->>'vatRate')::numeric = new.vat_rate then
    new.agreed_total_cents := (agreed->>'totalCents')::bigint;
  end if;
  return new;
end;
$$;
revoke all on function app_private.capture_contract_period_total() from public, anon, authenticated, service_role;
create trigger contract_billing_periods_capture_total before insert on public.contract_billing_periods
  for each row execute function app_private.capture_contract_period_total();

-- Both manual and scheduled draft creation pass through this trigger.
create function app_private.set_contract_draft_exact_total() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select coalesce(p.agreed_total_cents, new.total_cents) into new.total_cents
    from public.contract_billing_periods p where p.id=new.contract_period_id and p.tenant_id=new.tenant_id and p.pricing_status='priced';
  if not found then return new; end if;
  return new;
end;
$$;
revoke all on function app_private.set_contract_draft_exact_total() from public, anon, authenticated, service_role;
create trigger invoice_contract_period_drafts_exact_total before insert on public.invoice_contract_period_drafts
  for each row execute function app_private.set_contract_draft_exact_total();

create or replace function public.validate_invoice_contract_period() returns trigger
language plpgsql set search_path = '' as $$
declare target public.contract_billing_periods%rowtype; valuation public.contract_billing_period_valuations%rowtype;
declare contract_client_id uuid; expected_net bigint; expected_total numeric;
begin
  if new.contract_period_id is null then return new; end if;
  select * into target from public.contract_billing_periods where id=new.contract_period_id and tenant_id=new.tenant_id;
  if not found then raise exception 'Periodo contractual no encontrado' using errcode='P0002'; end if;
  select client_id into contract_client_id from public.service_contracts where id=target.contract_id and tenant_id=target.tenant_id;
  if target.pricing_status='priced' then expected_net := target.net_cents;
  else
    select * into valuation from public.contract_billing_period_valuations where period_id=target.id and tenant_id=target.tenant_id;
    expected_net := valuation.net_cents;
  end if;
  expected_total := coalesce(target.agreed_total_cents, expected_net + round(expected_net * target.vat_rate / 100));
  if expected_net is null or expected_net <= 0 or contract_client_id is distinct from new.client_id
    or target.vat_rate <> new.vat_rate or expected_total <> new.total_cents then
    raise exception 'La factura no coincide con el periodo valorado' using errcode='P0409';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_invoice_contract_period() from public, anon, authenticated;

create or replace function public.build_invoice_milestone_draft(p_tenant_id uuid, p_estimate_id uuid, p_milestone_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target public.estimates%rowtype; milestone public.estimate_milestones%rowtype; existing_id uuid;
declare gross_cents numeric; milestone_cents numeric;
begin
  if p_tenant_id is null or p_estimate_id is null or p_milestone_id is null then raise exception 'Origen del borrador inválido' using errcode='22023'; end if;
  select * into target from public.estimates where id=p_estimate_id and tenant_id=p_tenant_id;
  if not found or target.status <> 'accepted' then raise exception 'Solo se preparan borradores de presupuestos aceptados' using errcode='P0409'; end if;
  if target.conversion_destination <> 'work' then raise exception 'Los contratos se facturan por periodo, no por hito' using errcode='P0409'; end if;
  select * into milestone from public.estimate_milestones where id=p_milestone_id and tenant_id=p_tenant_id and estimate_id=p_estimate_id;
  if not found then raise exception 'Hito no encontrado' using errcode='P0002'; end if;
  select id into existing_id from public.invoice_milestone_drafts where estimate_id=p_estimate_id and milestone_id=p_milestone_id and tenant_id=p_tenant_id and status='draft';
  if found then return existing_id; end if;
  if exists(select 1 from public.invoices where estimate_id=p_estimate_id and milestone_id=p_milestone_id) then raise exception 'Este hito ya tiene una factura emitida' using errcode='P0409'; end if;
  select (coalesce(snapshot->'agreement',app_private.estimate_agreement_metadata(snapshot)) #>> '{price,totalCents}')::numeric
    into gross_cents from public.estimate_publications where estimate_id=p_estimate_id and tenant_id=p_tenant_id;
  if gross_cents is null then raise exception 'Publicación del presupuesto no disponible' using errcode='P0409'; end if;
  milestone_cents := round(gross_cents * milestone.percent / 100);
  if milestone_cents <= 0 then raise exception 'El hito no tiene importe facturable' using errcode='P0410'; end if;
  if milestone_cents > 9000000000000000 then raise exception 'Importe del hito fuera de rango' using errcode='22003'; end if;
  insert into public.invoice_milestone_drafts(tenant_id,estimate_id,milestone_id,client_id,concept,total_cents,vat_rate,due_date)
    values(p_tenant_id,p_estimate_id,p_milestone_id,target.client_id,left(target.title || ' · ' || coalesce(nullif(milestone.label,''),'Hito'),200),milestone_cents::bigint,target.vat_rate,current_date+15)
    on conflict(estimate_id,milestone_id) do nothing returning id into existing_id;
  if existing_id is null then select id into existing_id from public.invoice_milestone_drafts where estimate_id=p_estimate_id and milestone_id=p_milestone_id and tenant_id=p_tenant_id and status='draft'; end if;
  if existing_id is null then raise exception 'Este hito ya tiene una factura emitida' using errcode='P0409'; end if;
  return existing_id;
end;
$$;
revoke all on function public.build_invoice_milestone_draft(uuid,uuid,uuid) from public, anon, authenticated;
