-- Synthetic fixtures only; publication, conversion and snapshot checks are rolled back.
begin;
select '1..1' as plan;
do $$
declare
  tenant_id uuid := gen_random_uuid(); client_id uuid := gen_random_uuid(); actor_id uuid := gen_random_uuid();
  proposal_id uuid := gen_random_uuid(); price_id uuid := gen_random_uuid(); section_id uuid := gen_random_uuid();
  service_id uuid := gen_random_uuid(); legacy_id uuid := gen_random_uuid(); created_contract_id uuid;
  period_id uuid := gen_random_uuid(); contract_invoice public.invoices;
  sections jsonb; invalid jsonb; candidate jsonb; captured jsonb; agreement jsonb; derived jsonb;
begin
  sections := jsonb_build_array(
    jsonb_build_object('id',section_id,'type','work_table','title','Servicios','pageBreakBefore',false,'rows',jsonb_build_array(
      jsonb_build_object('id',service_id,'task','Puerta principal','frequency','','notes','Sin lejía','periodicities',jsonb_build_array('daily','monthly')),
      jsonb_build_object('id',legacy_id,'task','Cristales','frequency','Semanal en verano','notes','Acceso por recepción'))),
    jsonb_build_object('id',gen_random_uuid(),'type','prices','title','Precio','pageBreakBefore',false,'lineIds',jsonb_build_array(price_id)));
  if not public.valid_estimate_sections(sections) then raise exception 'Valid mixed legacy/matrix rows rejected'; end if;
  for candidate in select value from jsonb_array_elements('[null,"daily",{},["weekly","weekly"],["invalid"],[1],[null]]'::jsonb) loop
    invalid := jsonb_set(sections,'{0,rows,0,periodicities}',candidate);
    if public.valid_estimate_sections(invalid) then raise exception 'Invalid periodicities accepted: %',candidate; end if;
  end loop;
  if not public.valid_estimate_sections(jsonb_set(sections,'{0,rows,0,periodicities}','[]'))
    or not public.valid_estimate_sections(jsonb_set(sections,'{0,rows,0,periodicities}',
      '["daily","twice_weekly","weekly","monthly","semiannual","annual"]'))
    then raise exception 'Empty/all periodicities rejected'; end if;

  insert into public.tenants(id,name) values(tenant_id,'Service matrix TEST');
  insert into public.clients(id,tenant_id,name) values(client_id,tenant_id,'Client TEST');
  insert into auth.users(id,email) values(actor_id,actor_id::text || '@example.test');
  insert into public.memberships(tenant_id,user_id,role) values(tenant_id,actor_id,'admin');
  perform set_config('request.jwt.claim.sub',actor_id::text,true);
  insert into public.estimates(id,tenant_id,client_id,title,valid_until,vat_rate,contract_billing_frequency,document_format,document_sections)
    values(proposal_id,tenant_id,client_id,'Servicio matricial',current_date+30,21,'quarterly','sections',sections);
  insert into public.estimate_lines(id,tenant_id,estimate_id,description,kind,quantity,unit_price_cents)
    values(price_id,tenant_id,proposal_id,'Precio','labor',1,17878);
  begin
    update public.estimates e set document_sections=jsonb_set(sections,'{0,rows,0,periodicities}','["weekly","weekly"]') where e.id=proposal_id;
    raise exception 'Table constraint allowed duplicate checks';
  exception when check_violation then null;
  end;
  if not exists(select 1 from public.estimates e where e.id=proposal_id and e.document_sections=sections)
    then raise exception 'Draft service checks did not round-trip'; end if;
  update public.estimates e set status='sent' where e.id=proposal_id;
  select p.snapshot into captured from public.estimate_publications p where p.estimate_id=proposal_id;
  agreement := captured->'agreement';
  if agreement #> '{services,0,periodicities}' is distinct from '["daily","monthly"]'::jsonb
    or agreement #>> '{services,0,frequency}' is distinct from 'Diario; Mensual'
    or agreement #>> '{services,0,notes}' is distinct from 'Sin lejía'
    or agreement #>> '{services,1,frequency}' is distinct from 'Semanal en verano'
    or agreement #>> '{price,billingFrequency}' is distinct from 'quarterly'
    or agreement #>> '{price,totalCents}' is distinct from '21632'
    then raise exception 'Publication lost checks, legacy conditions or confused service and billing frequencies'; end if;
  derived := app_private.estimate_agreement_metadata(jsonb_set(captured,'{estimate,document_sections,0,rows,0,frequency}','"Solo en verano"'));
  if derived #>> '{services,0,frequency}' is distinct from 'Diario; Mensual; Solo en verano'
    then raise exception 'Additional historical frequency text was lost'; end if;

  perform public.accept_estimate_manually(tenant_id,proposal_id,gen_random_uuid(),'Client TEST','Written evidence TEST');
  set constraints public.estimates_create_contract immediate;
  set constraints public.estimates_create_contract deferred;
  select c.id,c.source_snapshot->'agreement' into created_contract_id,derived
    from public.service_contracts c where c.origin_estimate_id=proposal_id;
  if created_contract_id is null or derived is distinct from agreement
    then raise exception 'Contract lost exact agreed periodicities'; end if;
  if not exists(select 1 from public.service_contracts c where c.id=created_contract_id
    and c.included_scope #>> '{0,frequency}'='Diario; Mensual')
    or exists(select 1 from public.service_contract_visit_rules r where r.contract_id=created_contract_id and r.configured)
    or exists(select 1 from public.service_visits v where v.contract_id=created_contract_id)
    then raise exception 'Contract scope lost labels or checks incorrectly scheduled visits'; end if;
  insert into public.contract_billing_periods(id,tenant_id,contract_id,cycle_index,period_start_on,period_end_on,net_cents,vat_rate,pricing_status)
    values(period_id,tenant_id,created_contract_id,0,current_date,current_date+89,17878,21,'priced');
  contract_invoice.tenant_id := tenant_id;
  contract_invoice.client_id := client_id;
  contract_invoice.contract_period_id := period_id;
  derived := public.invoice_document_snapshot(contract_invoice,'issuance');
  if derived->'estimateAgreement' is distinct from agreement then raise exception 'Invoice snapshot lost structured service matrix'; end if;
  if has_function_privilege('anon','public.valid_estimate_sections(jsonb)','execute')
    or has_function_privilege('authenticated','app_private.estimate_agreement_metadata(jsonb)','execute')
    then raise exception 'Migration broadened internal permissions'; end if;
end;
$$;
select 'ok 1 - Matrix checks validated and preserved through draft, publication, contract and invoice snapshot' as result;
rollback;
