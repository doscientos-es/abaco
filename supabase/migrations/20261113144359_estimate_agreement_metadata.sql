-- Drafts keep their existing sources of truth: lines, billing frequency and service rows.
-- Capture a versioned, machine-readable agreement at publication, never parse rendered prose.
create function app_private.estimate_agreement_metadata(p_snapshot jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  proposal jsonb := p_snapshot->'estimate';
  net numeric; discount numeric; vat numeric; services jsonb;
begin
  if proposal is null then return null; end if;
  select coalesce(sum(round((l->>'quantity')::numeric * (l->>'unit_price_cents')::numeric)
    - round(round((l->>'quantity')::numeric * (l->>'unit_price_cents')::numeric)
      * (l->>'discount_percent')::numeric / 100)),0)
    into net from jsonb_array_elements(proposal->'estimate_lines') l;
  discount := case proposal->>'discount_type'
    when 'percent' then round(net * (proposal->>'discount_value')::numeric / 100)
    when 'amount' then least(net,round((proposal->>'discount_value')::numeric)) else 0 end;
  net := net - discount;
  vat := round(net * (proposal->>'vat_rate')::numeric / 100);
  if proposal->>'document_format' = 'sections' then
    select coalesce(jsonb_agg(jsonb_build_object('id',r->>'id','sectionId',s->>'id',
      'sourceLineId',null,'task',r->>'task','frequency',r->>'frequency','notes',r->>'notes')
      order by si,ri),'[]') into services
      from jsonb_array_elements(proposal->'document_sections') with ordinality sections(s,si)
      cross join lateral jsonb_array_elements(case when s->>'type'='work_table' then s->'rows' else '[]' end)
        with ordinality rows(r,ri);
  else
    select coalesce(jsonb_agg(jsonb_build_object('id',l->>'id','sectionId',null,
      'sourceLineId',l->>'id','task',l->>'description','frequency','','notes','') order by i),'[]')
      into services from jsonb_array_elements(proposal->'estimate_lines') with ordinality lines(l,i);
  end if;
  return jsonb_build_object('version',1,'currency','EUR','estimateId',proposal->>'id',
    'price',jsonb_build_object('billingFrequency',coalesce(proposal->>'contract_billing_frequency',
      case when proposal->>'conversion_destination'='contract' then 'monthly' else 'once' end),
      'netCents',net,'vatRate',(proposal->>'vat_rate')::numeric,'vatCents',vat,'totalCents',net+vat),
    'services',services);
end;
$$;
revoke all on function app_private.estimate_agreement_metadata(jsonb) from public,anon,authenticated;

alter function public.estimate_publication_snapshot(uuid) rename to estimate_publication_snapshot_before_agreement;
create function public.estimate_publication_snapshot(p_estimate_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare captured jsonb := public.estimate_publication_snapshot_before_agreement(p_estimate_id);
begin
  if captured is null then return null; end if;
  return captured || jsonb_build_object('agreement',app_private.estimate_agreement_metadata(captured));
end;
$$;
revoke all on function public.estimate_publication_snapshot(uuid) from public,anon,authenticated;
revoke all on function public.estimate_publication_snapshot_before_agreement(uuid) from public,anon,authenticated;

alter table public.service_contract_visit_rules
  add column source_section_id uuid,
  add column source_service_id uuid;
comment on column public.service_contract_visit_rules.source_service_id is
  'Stable service row id in source_snapshot; quoted free-text frequency is NOT an operational schedule.';

create or replace function app_private.create_contract_after_acceptance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  e public.estimates%rowtype; p public.estimate_publications%rowtype;
  m public.estimate_manual_acceptances%rowtype; service jsonb; agreement jsonb;
  contract_id uuid; scope jsonb; accepted_copy jsonb; mode text; starts date;
begin
  select * into e from public.estimates where id = new.id;
  select * into p from public.estimate_publications where estimate_id = e.id and tenant_id = e.tenant_id;
  if e.status <> 'accepted' or not coalesce((p.snapshot #>> '{estimate,automatic_contract}')::boolean,false)
    then return null; end if;
  if exists(select 1 from public.estimate_conversion_destinations where tenant_id = e.tenant_id and estimate_id = e.id)
    then return null; end if;
  if not public.tenant_can_write(e.tenant_id) then raise exception 'Empresa no disponible' using errcode = 'P0402'; end if;
  agreement := coalesce(p.snapshot->'agreement',app_private.estimate_agreement_metadata(p.snapshot));
  if p.snapshot #>> '{estimate,document_format}' = 'sections' then
    select coalesce(jsonb_agg(jsonb_build_object('description',s->>'task','quantity',1,'unit','ud','kind','labor',
      'source_section_id',s->>'sectionId','source_service_id',s->>'id',
      'frequency',s->>'frequency','notes',s->>'notes') order by i),'[]') into scope
      from jsonb_array_elements(agreement->'services') with ordinality services(s,i);
  else
    select coalesce(jsonb_agg(jsonb_build_object('description',l->>'description','quantity',l->'quantity',
      'unit',l->>'unit','kind',l->>'kind') order by i),'[]') into scope
      from jsonb_array_elements(p.snapshot #> '{estimate,estimate_lines}') with ordinality lines(l,i);
  end if;
  select * into m from public.estimate_manual_acceptances where estimate_id = e.id and tenant_id = e.tenant_id;
  mode := case when found then 'office_manual' when e.responded_at is not null then 'public_link' else 'legacy_unverified' end;
  accepted_copy := p.snapshot || jsonb_build_object('agreement',agreement,'publication_source',p.source,
    'acceptance',jsonb_build_object('mode',mode,'responded_at',e.responded_at,'responded_by',e.responded_by,
      'evidence_description',m.evidence_description,'recorded_by',m.recorded_by));
  starts := (coalesce(e.responded_at,now()) at time zone 'Europe/Madrid')::date;
  insert into public.service_contracts(operation_id,tenant_id,client_id,origin_estimate_id,title,starts_on,
    timezone,price_cents,billing_frequency,renewal_mode,included_scope,source_snapshot,created_by)
    values(gen_random_uuid(),e.tenant_id,e.client_id,e.id,p.snapshot #>> '{estimate,title}',starts,
      'Europe/Madrid',(agreement #>> '{price,netCents}')::bigint,agreement #>> '{price,billingFrequency}',
      'pending',scope,accepted_copy,m.recorded_by) returning id into contract_id;
  insert into public.service_contract_events(operation_id,tenant_id,contract_id,kind,payload,actor_id)
    values(gen_random_uuid(),e.tenant_id,contract_id,'created',jsonb_build_object(
      'estimate_id',e.id,'acceptance_mode',mode,'source','estimate_acceptance','needs_configuration',true),m.recorded_by);
  -- Preserve agreed service identity/notes, but require explicit scheduling before activation.
  for service in select * from jsonb_array_elements(agreement->'services') loop
    insert into public.service_contract_visit_rules(tenant_id,contract_id,season,months,weekday,frequency,
      local_start,duration_minutes,title,tasks,instructions,configured,source_line_id,source_section_id,source_service_id)
      values(e.tenant_id,contract_id,'high',array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[],1,'once',
        '09:00',60,left(service->>'task',200),service->>'task',service->>'notes',false,
        (service->>'sourceLineId')::uuid,(service->>'sectionId')::uuid,
        case when service->>'sectionId' is not null then (service->>'id')::uuid end);
  end loop;
  return null;
end;
$$;
revoke all on function app_private.create_contract_after_acceptance() from public,anon,authenticated;

-- Issued invoices retain the agreed metadata, independently of live estimate/contract edits.
alter function public.invoice_document_snapshot(public.invoices,text) rename to invoice_document_snapshot_before_agreement;
create function public.invoice_document_snapshot(p_invoice public.invoices,p_source text) returns jsonb
language sql stable set search_path = '' as $$
  select public.invoice_document_snapshot_before_agreement(p_invoice,p_source)
    || case when origin.snapshot is null then '{}'::jsonb else jsonb_build_object('estimateAgreement',
      coalesce(origin.snapshot->'agreement',app_private.estimate_agreement_metadata(origin.snapshot))) end
  from (select coalesce(sc.source_snapshot,w.source_snapshot,ep.snapshot) as snapshot
    from public.tenants t
    left join public.contract_billing_periods cp on cp.id=p_invoice.contract_period_id and cp.tenant_id=t.id
    left join public.service_contracts sc on sc.id=cp.contract_id and sc.tenant_id=t.id
    left join public.work_order_extras x on x.id=p_invoice.work_extra_id and x.tenant_id=t.id
    left join public.work_orders w on w.id=x.work_order_id and w.tenant_id=t.id
    left join public.estimate_publications ep on ep.estimate_id=p_invoice.estimate_id and ep.tenant_id=t.id
    where t.id=p_invoice.tenant_id) origin;
$$;
revoke all on function public.invoice_document_snapshot(public.invoices,text) from public,anon,authenticated;
revoke all on function public.invoice_document_snapshot_before_agreement(public.invoices,text) from public,anon,authenticated;