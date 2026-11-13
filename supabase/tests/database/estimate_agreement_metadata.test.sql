-- Self-contained integration checks. All synthetic records are rolled back.
begin;
select '1..1' as plan;
do $$
declare
  tenant_id uuid := gen_random_uuid(); client_id uuid := gen_random_uuid(); actor_id uuid := gen_random_uuid();
  proposal_id uuid := gen_random_uuid(); work_proposal_id uuid := gen_random_uuid();
  price_id uuid := gen_random_uuid(); work_price_id uuid := gen_random_uuid();
  section_id uuid := gen_random_uuid(); service_id uuid := gen_random_uuid(); second_service_id uuid := gen_random_uuid();
  milestone_id uuid := gen_random_uuid(); created_contract_id uuid; work_id uuid; invoice_id uuid; draft_id uuid;
  period_id uuid := gen_random_uuid(); legacy_proposal_id uuid := gen_random_uuid(); legacy_line_id uuid := gen_random_uuid();
  contract_invoice public.invoices;
  sections jsonb; captured jsonb; agreement jsonb; derived jsonb; legacy jsonb; rule_count integer;
begin
  insert into public.tenants(id,name) values(tenant_id,'Agreement metadata TEST');
  insert into public.clients(id,tenant_id,name) values(client_id,tenant_id,'Client TEST');
  insert into auth.users(id,email) values(actor_id,actor_id::text || '@example.test');
  insert into public.memberships(tenant_id,user_id,role) values(tenant_id,actor_id,'admin');
  perform set_config('request.jwt.claim.sub',actor_id::text,true);
  sections := jsonb_build_array(
    jsonb_build_object('id',section_id,'type','work_table','title','Servicios','pageBreakBefore',false,'rows',
      jsonb_build_array(
        jsonb_build_object('id',service_id,'task','Limpiar ventanas','frequency','Dos veces al año','notes','Acceso por recepción'),
        jsonb_build_object('id',second_service_id,'task','Limpiar suelo','frequency','Semanal','notes','No usar lejía'))),
    jsonb_build_object('id',gen_random_uuid(),'type','prices','title','Precio','pageBreakBefore',false,
      'lineIds',jsonb_build_array(price_id)));
  insert into public.estimates(id,tenant_id,client_id,title,valid_until,vat_rate,contract_billing_frequency,
    document_format,document_sections) values(proposal_id,tenant_id,client_id,'Limpieza',current_date+30,21,'quarterly','sections',sections);
  insert into public.estimate_lines(id,tenant_id,estimate_id,description,kind,quantity,unit_price_cents)
    values(price_id,tenant_id,proposal_id,'Precio','labor',1,17878);
  update public.estimates set status='sent' where id=proposal_id;
  select snapshot into captured from public.estimate_publications where estimate_id=proposal_id;
  agreement := captured->'agreement';
  if agreement->>'version' is distinct from '1' or agreement->>'currency' is distinct from 'EUR'
    or agreement->>'estimateId' is distinct from proposal_id::text
    or agreement->'price' is distinct from '{"billingFrequency":"quarterly","netCents":17878,"vatRate":21,"vatCents":3754,"totalCents":21632}'::jsonb
    or jsonb_array_length(agreement->'services')<>2
    or agreement #>> '{services,0,id}' is distinct from service_id::text
    or agreement #>> '{services,0,sectionId}' is distinct from section_id::text
    or agreement #>> '{services,0,frequency}' is distinct from 'Dos veces al año'
    or agreement #>> '{services,1,notes}' is distinct from 'No usar lejía'
    then raise exception 'Structured publication lost prices, service identity, order or frequency'; end if;

  derived := app_private.estimate_agreement_metadata(jsonb_set(jsonb_set(captured,
    '{estimate,discount_type}','"percent"'),'{estimate,discount_value}','10'));
  if derived #>> '{price,totalCents}' is distinct from '19469' then raise exception 'Percentage discount or VAT rounding lost'; end if;
  derived := app_private.estimate_agreement_metadata(jsonb_set(jsonb_set(captured,
    '{estimate,discount_type}','"amount"'),'{estimate,discount_value}','999999'));
  if derived #>> '{price,totalCents}' is distinct from '0' then raise exception 'Fixed discount exceeds price'; end if;
  legacy := captured - 'agreement';
  legacy := jsonb_set(legacy,'{estimate,document_format}','"table"');
  derived := app_private.estimate_agreement_metadata(legacy);
  if derived #>> '{services,0,sourceLineId}' is distinct from price_id::text
    then raise exception 'Historical price-table line provenance lost'; end if;

  update public.estimates set status='accepted',responded_at=now(),responded_by='Client TEST' where id=proposal_id;
  set constraints public.estimates_create_contract immediate;
  set constraints public.estimates_create_contract deferred;
  select id,source_snapshot->'agreement' into created_contract_id,derived from public.service_contracts where origin_estimate_id=proposal_id;
  if derived is distinct from agreement then raise exception 'Contract changed the accepted metadata'; end if;
  if not exists(select 1 from public.service_contracts where id=created_contract_id and price_cents=17878
    and billing_frequency='quarterly' and included_scope->0->>'description'='Limpiar ventanas'
    and included_scope->0->>'frequency'='Dos veces al año') then raise exception 'Contract confused billing price and services'; end if;
  select count(*) into rule_count from public.service_contract_visit_rules r where r.contract_id=created_contract_id
    and not r.configured and r.source_line_id is null and r.source_section_id=section_id
    and r.source_service_id in (service_id,second_service_id);
  if rule_count<>2 then raise exception 'Price became a job or service provenance was lost'; end if;
  if not exists(select 1 from public.service_contract_visit_rules r where r.contract_id=created_contract_id
    and r.source_service_id=service_id and r.tasks='Limpiar ventanas' and r.instructions='Acceso por recepción')
    then raise exception 'Quoted service notes lost'; end if;
  if exists(select 1 from public.service_visits v where v.contract_id=created_contract_id)
    then raise exception 'Free-text service frequencies generated invented visits'; end if;
  insert into public.contract_billing_periods(id,tenant_id,contract_id,cycle_index,period_start_on,period_end_on,
    net_cents,vat_rate,pricing_status) values(period_id,tenant_id,created_contract_id,0,current_date,current_date+89,17878,21,'priced');
  contract_invoice.tenant_id := tenant_id;
  contract_invoice.client_id := client_id;
  contract_invoice.contract_period_id := period_id;
  derived := public.invoice_document_snapshot(contract_invoice,'issuance');
  if derived->'estimateAgreement' is distinct from agreement then raise exception 'Contract-period invoice lost original metadata'; end if;

  -- Traditional proposals still create jobs from their priced lines and preserve quantities.
  insert into public.estimates(id,tenant_id,client_id,title,valid_until,vat_rate,contract_billing_frequency)
    values(legacy_proposal_id,tenant_id,client_id,'Traditional proposal',current_date+30,21,'once');
  insert into public.estimate_lines(id,tenant_id,estimate_id,description,kind,quantity,unit_price_cents)
    values(legacy_line_id,tenant_id,legacy_proposal_id,'Traditional service','labor',2,1000);
  update public.estimates set status='sent' where id=legacy_proposal_id;
  perform public.accept_estimate_manually(tenant_id,legacy_proposal_id,gen_random_uuid(),'Client TEST','Written agreement TEST');
  set constraints public.estimates_create_contract immediate;
  set constraints public.estimates_create_contract deferred;
  if not exists(select 1 from public.service_contracts c join public.service_contract_visit_rules r on r.contract_id=c.id
    where c.origin_estimate_id=legacy_proposal_id and c.price_cents=2000 and c.billing_frequency='once'
    and (c.included_scope->0->>'quantity')::numeric=2 and c.source_snapshot #>> '{acceptance,mode}'='office_manual'
    and r.source_line_id=legacy_line_id and r.source_service_id is null and not r.configured)
    then raise exception 'Traditional/manual acceptance contract conversion regressed'; end if;

  sections := jsonb_set(sections,'{1,lineIds}',jsonb_build_array(work_price_id));
  insert into public.estimates(id,tenant_id,client_id,title,valid_until,vat_rate,contract_billing_frequency,
    automatic_contract,conversion_destination,document_format,document_sections)
    values(work_proposal_id,tenant_id,client_id,'Obra',current_date+30,21,'once',false,'work','sections',sections);
  insert into public.estimate_lines(id,tenant_id,estimate_id,description,kind,quantity,unit_price_cents)
    values(work_price_id,tenant_id,work_proposal_id,'Precio','labor',1,17878);
  insert into public.estimate_milestones(id,tenant_id,estimate_id,label,percent)
    values(milestone_id,tenant_id,work_proposal_id,'Primer pago',50);
  update public.estimates set status='sent' where id=work_proposal_id;
  select snapshot->'agreement' into agreement from public.estimate_publications where estimate_id=work_proposal_id;
  update public.estimates set status='accepted',responded_at=now(),responded_by='Client TEST' where id=work_proposal_id;
  work_id := public.convert_accepted_estimate_to_work(tenant_id,work_proposal_id,gen_random_uuid());
  select w.source_snapshot->'agreement' into derived from public.work_orders w where w.id=work_id;
  if derived is distinct from agreement then raise exception 'Work order lost the accepted metadata'; end if;
  draft_id := public.create_invoice_milestone_draft(tenant_id,work_proposal_id,milestone_id);
  invoice_id := public.issue_invoice_milestone_draft(tenant_id,draft_id,1,gen_random_uuid());
  if not exists(select 1 from public.invoices i where i.id=invoice_id and i.total_cents=10816
    and i.document_snapshot->'estimateAgreement'=agreement)
    then raise exception 'Partial invoice lost full agreement or confused it with invoice amount'; end if;
  if has_function_privilege('anon','public.estimate_publication_snapshot(uuid)','execute')
    or has_function_privilege('authenticated','app_private.estimate_agreement_metadata(jsonb)','execute')
    or has_function_privilege('authenticated','public.invoice_document_snapshot(public.invoices,text)','execute')
    then raise exception 'Internal snapshot functions exposed'; end if;
end;
$$;
select 'ok 1 - Structured prices, billing/service frequencies, contracts, work orders and partial invoices preserved' as result;
rollback;
