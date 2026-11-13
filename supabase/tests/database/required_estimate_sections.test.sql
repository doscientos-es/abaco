-- Self-contained assertions; no extensions or permanent test records are required.
begin;
select '1..1' as plan;
do $$
declare
  tenant_id uuid := gen_random_uuid();
  client_id uuid := gen_random_uuid();
  proposal_id uuid := gen_random_uuid();
  line_id uuid := gen_random_uuid();
  traditional_id uuid := gen_random_uuid();
  price jsonb;
  services jsonb;
  narrative jsonb;
  candidate jsonb;
  ordered jsonb;
  blocked boolean;
begin
  insert into public.tenants(id, name) values(tenant_id, 'Required sections test');
  insert into public.clients(id, tenant_id, name) values(client_id, tenant_id, 'Test client');
  insert into public.estimates(id, tenant_id, client_id, title, valid_until, automatic_contract, conversion_destination)
    values(proposal_id, tenant_id, client_id, 'Section test', current_date + 30, false, 'work'),
      (traditional_id, tenant_id, client_id, 'Traditional test', current_date + 30, false, 'work');
  insert into public.estimate_lines(id, tenant_id, estimate_id, position, description, kind, quantity, unit_price_cents)
    values(line_id, tenant_id, proposal_id, 0, 'Monthly cleaning', 'labor', 1, 10000);
  price := jsonb_build_object('id', gen_random_uuid(), 'type', 'prices', 'title', 'Precio', 'pageBreakBefore', false, 'lineIds', jsonb_build_array(line_id));
  services := jsonb_build_object('id', gen_random_uuid(), 'type', 'work_table', 'title', 'Servicios', 'pageBreakBefore', false, 'rows', '[]'::jsonb);
  narrative := jsonb_build_object('id', gen_random_uuid(), 'type', 'description', 'title', 'Texto', 'pageBreakBefore', false, 'content', 'Details');
  update public.estimates set document_format = 'sections' where id = proposal_id;

  foreach candidate in array array[
    '[]'::jsonb,
    jsonb_build_array(price),
    jsonb_build_array(services),
    jsonb_build_array(price, services, price || jsonb_build_object('id', gen_random_uuid(), 'lineIds', '[]'::jsonb)),
    jsonb_build_array(price, services, services || jsonb_build_object('id', gen_random_uuid()))
  ] loop
    update public.estimates set document_sections = candidate where id = proposal_id;
    blocked := false;
    begin
      update public.estimates set status = 'sent' where id = proposal_id;
    exception when sqlstate '22023' then
      if sqlerrm <> 'El presupuesto debe incluir exactamente una sección de Precio y una de Servicios.' then raise; end if;
      blocked := true;
    end;
    if not blocked then raise exception 'Publication accepted missing or duplicated required sections'; end if;
    if exists(select 1 from public.estimate_publications where estimate_id = proposal_id) then
      raise exception 'A rejected publication left a snapshot';
    end if;
  end loop;

  ordered := jsonb_build_array(services, narrative, price);
  update public.estimates set document_sections = ordered where id = proposal_id;
  update public.estimates set status = 'sent' where id = proposal_id;
  if (select snapshot#>'{estimate,document_sections}' from public.estimate_publications where estimate_id = proposal_id) is distinct from ordered then
    raise exception 'Publication lost required sections or their chosen order';
  end if;
  blocked := false;
  begin
    update public.estimates set document_sections = '[]'::jsonb where id = proposal_id;
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'El contenido de un presupuesto enviado es inmutable; crea una copia' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'An existing publication was modified'; end if;

  update public.estimates set status = 'sent' where id = traditional_id;
  if not exists(select 1 from public.estimate_publications where estimate_id = traditional_id) then
    raise exception 'Traditional documents lost their original publication flow';
  end if;
end;
$$;
select 'ok 1 - Missing/duplicate sections blocked; reorder, immutable snapshot and traditional format verified' as result;
rollback;
