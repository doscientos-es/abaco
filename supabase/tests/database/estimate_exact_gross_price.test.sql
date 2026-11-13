-- Synthetic records are always rolled back.
begin;
do $$
declare
  tenant_id uuid := gen_random_uuid(); client_id uuid := gen_random_uuid(); actor_id uuid := gen_random_uuid();
  proposal_id uuid := gen_random_uuid(); work_id uuid := gen_random_uuid(); line_id uuid := gen_random_uuid();
  work_line_id uuid := gen_random_uuid(); milestone_id uuid := gen_random_uuid(); period_id uuid := gen_random_uuid();
  reviewed_period_id uuid := gen_random_uuid(); contract_id uuid; draft_id uuid; invoice_id uuid;
  sections jsonb; agreement jsonb;
begin
  insert into public.tenants(id,name) values(tenant_id,'Exact price TEST');
  insert into public.clients(id,tenant_id,name) values(client_id,tenant_id,'Client TEST');
  insert into auth.users(id,email) values(actor_id,actor_id::text || '@example.test');
  insert into public.memberships(tenant_id,user_id,role) values(tenant_id,actor_id,'admin');
  perform set_config('request.jwt.claim.sub',actor_id::text,true);
  sections := jsonb_build_array(
    jsonb_build_object('id',gen_random_uuid(),'type','prices','title','Precio','pageBreakBefore',false,'lineIds',jsonb_build_array(line_id),'grossCents',1000),
    jsonb_build_object('id',gen_random_uuid(),'type','work_table','title','Servicios','pageBreakBefore',false,'rows','[]'::jsonb));
  if not public.valid_estimate_sections(sections)
    or public.valid_estimate_sections(jsonb_set(sections,'{0,grossCents}','1.5'))
    or public.valid_estimate_sections(jsonb_set(sections,'{0,grossCents}','-1'))
    then raise exception 'Exact price validation failed'; end if;
  insert into public.estimates(id,tenant_id,client_id,title,valid_until,vat_rate,contract_billing_frequency,
    document_format,document_sections) values(proposal_id,tenant_id,client_id,'Contrato',current_date+30,21,'monthly','sections',sections);
  insert into public.estimate_lines(id,tenant_id,estimate_id,description,kind,quantity,unit_price_cents)
    values(line_id,tenant_id,proposal_id,'Precio','labor',1,826);
  update public.estimates set status='sent' where id=proposal_id;
  select snapshot->'agreement' into agreement from public.estimate_publications where estimate_id=proposal_id;
  if agreement #>> '{price,totalCents}' <> '1000' or agreement #>> '{price,netCents}' <> '826'
    or agreement #>> '{price,vatCents}' <> '174' then raise exception 'Publication lost exact amount: %',agreement->'price'; end if;
  update public.estimates set status='accepted',responded_at=now(),responded_by='Client TEST' where id=proposal_id;
  set constraints public.estimates_create_contract immediate;
  set constraints public.estimates_create_contract deferred;
  select id into contract_id from public.service_contracts where origin_estimate_id=proposal_id;
  insert into public.contract_billing_periods(id,tenant_id,contract_id,cycle_index,period_start_on,period_end_on,net_cents,vat_rate,pricing_status)
    values(period_id,tenant_id,contract_id,0,current_date,current_date,826,21,'priced');
  draft_id := public.create_invoice_contract_period_draft(tenant_id,period_id);
  if not exists(select 1 from public.invoice_contract_period_drafts where id=draft_id and total_cents=1000)
    then raise exception 'Contract draft lost exact total'; end if;
  invoice_id := public.issue_invoice_contract_period_draft(tenant_id,draft_id,1,gen_random_uuid());
  if not exists(select 1 from public.invoices where id=invoice_id and total_cents=1000)
    then raise exception 'Contract invoice lost exact total'; end if;
  insert into public.contract_billing_periods(id,tenant_id,contract_id,cycle_index,period_start_on,period_end_on,vat_rate,pricing_status,review_reason)
    values(reviewed_period_id,tenant_id,contract_id,1,current_date,current_date,21,'requires_review','TEST');
  insert into public.contract_billing_period_valuations(tenant_id,period_id,net_cents,reason,actor_id)
    values(tenant_id,reviewed_period_id,400,'TEST',actor_id);
  draft_id := public.create_invoice_contract_period_draft(tenant_id,reviewed_period_id);
  if not exists(select 1 from public.invoice_contract_period_drafts where id=draft_id and total_cents=484)
    then raise exception 'Reviewed period changed to full price'; end if;
  sections := jsonb_set(sections,'{0,lineIds}',jsonb_build_array(work_line_id));
  insert into public.estimates(id,tenant_id,client_id,title,valid_until,vat_rate,contract_billing_frequency,automatic_contract,conversion_destination,document_format,document_sections)
    values(work_id,tenant_id,client_id,'Obra',current_date+30,21,'once',false,'work','sections',sections);
  insert into public.estimate_lines(id,tenant_id,estimate_id,description,kind,quantity,unit_price_cents)
    values(work_line_id,tenant_id,work_id,'Precio','labor',1,826);
  insert into public.estimate_milestones(id,tenant_id,estimate_id,label,percent) values(milestone_id,tenant_id,work_id,'Total',100);
  update public.estimates set status='sent' where id=work_id;
  update public.estimates set status='accepted',responded_at=now(),responded_by='Client TEST' where id=work_id;
  draft_id := public.create_invoice_milestone_draft(tenant_id,work_id,milestone_id);
  invoice_id := public.issue_invoice_milestone_draft(tenant_id,draft_id,1,gen_random_uuid());
  if not exists(select 1 from public.invoices where id=invoice_id and total_cents=1000)
    then raise exception 'Milestone invoice lost exact total'; end if;
end;
$$;
select 'ok - Exact gross, publication, contract and milestone invoices' as result;
rollback;