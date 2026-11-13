begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

select set_config('test.document_sections', '[
  {"id":"83000000-0000-4000-8000-000000000010","type":"description","title":"Alcance","pageBreakBefore":false,"content":"Servicio integral"},
  {"id":"83000000-0000-4000-8000-000000000011","type":"prices","title":"Oferta","pageBreakBefore":true,"lineIds":["83000000-0000-4000-8000-000000000005"]},
  {"id":"83000000-0000-4000-8000-000000000012","type":"list","title":"Incluye","pageBreakBefore":false,"items":[{"id":"83000000-0000-4000-8000-000000000013","text":"Productos"}]},
  {"id":"83000000-0000-4000-8000-000000000014","type":"work_table","title":"Plan","pageBreakBefore":false,"rows":[{"id":"83000000-0000-4000-8000-000000000015","task":"Cristales","frequency":"Semanal","notes":"Portal"}]}
]'::jsonb::text, true);

select ok(public.valid_estimate_sections('[]'), 'Empty sections are valid while drafting');
select ok(not public.valid_estimate_sections('{}'), 'Sections must be an array');
select ok(not public.valid_estimate_sections(null), 'Null sections are rejected');
select ok(public.valid_estimate_sections(current_setting('test.document_sections')::jsonb),
  'All four section types are valid');
select ok(not public.valid_estimate_sections(jsonb_build_array(
  (current_setting('test.document_sections')::jsonb->0) - 'title')), 'Missing fields are rejected');
select ok(not public.valid_estimate_sections(jsonb_build_array(
  (current_setting('test.document_sections')::jsonb->0) || '{"extra":true}')), 'Unknown fields are rejected');
select ok(not public.valid_estimate_sections(jsonb_build_array(
  current_setting('test.document_sections')::jsonb->0,
  current_setting('test.document_sections')::jsonb->0)), 'Duplicate sections are rejected');
select ok(not public.valid_estimate_sections(jsonb_build_array(
  current_setting('test.document_sections')::jsonb->1,
  jsonb_set(current_setting('test.document_sections')::jsonb->1, '{id}',
    '"83000000-0000-4000-8000-000000000019"'))), 'A price cannot appear in two sections');
select ok(not public.valid_estimate_sections(jsonb_build_array(jsonb_set(
  current_setting('test.document_sections')::jsonb->2, '{items}', jsonb_build_array(
    current_setting('test.document_sections')::jsonb#>'{2,items,0}',
    current_setting('test.document_sections')::jsonb#>'{2,items,0}')))), 'Duplicate list items are rejected');
select ok(not public.valid_estimate_sections((select jsonb_agg(
  jsonb_set(current_setting('test.document_sections')::jsonb->0, '{id}', to_jsonb(gen_random_uuid()::text)))
  from generate_series(1,51))), 'The document has a bounded number of sections');
select ok(not has_function_privilege('anon', 'public.valid_estimate_sections(jsonb)', 'execute'),
  'Anonymous callers cannot access the validation helper');
select ok(not has_function_privilege('authenticated', 'public.estimate_publication_snapshot(uuid)', 'execute'),
  'Browser roles cannot call the privileged snapshot helper');

insert into public.tenants (id, name) values
  ('83000000-0000-4000-8000-000000000001', 'Document test company'),
  ('83000000-0000-4000-8000-000000000002', 'Other document test company');
insert into public.clients (id, tenant_id, name) values
  ('83000000-0000-4000-8000-000000000003', '83000000-0000-4000-8000-000000000001', 'Document test client');
insert into public.estimates (id, tenant_id, client_id, title, valid_until, automatic_contract, conversion_destination) values
  ('83000000-0000-4000-8000-000000000004', '83000000-0000-4000-8000-000000000001',
   '83000000-0000-4000-8000-000000000003', 'Document test', current_date+30, false, 'work');
insert into public.estimate_lines (id, tenant_id, estimate_id, position, description, kind, quantity, unit_price_cents) values
  ('83000000-0000-4000-8000-000000000005', '83000000-0000-4000-8000-000000000001',
   '83000000-0000-4000-8000-000000000004', 1, 'Cleaning', 'labor', 1, 10000);
insert into auth.users (id, email) values
  ('83000000-0000-4000-8000-000000000006', 'document-editor@example.test'),
  ('83000000-0000-4000-8000-000000000007', 'document-outsider@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('83000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000006', 'editor'),
  ('83000000-0000-4000-8000-000000000002', '83000000-0000-4000-8000-000000000007', 'editor');

set local role authenticated;
set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000006';
select is((select document_format from public.estimates where id='83000000-0000-4000-8000-000000000004'),
  'table', 'Existing callers still create traditional documents');
update public.estimates set document_format='sections' where id='83000000-0000-4000-8000-000000000004';
select throws_ok($$update public.estimates set status='sent' where id='83000000-0000-4000-8000-000000000004'$$,
  '22023', 'El presupuesto debe incluir exactamente una sección de Precio y una de Servicios.', 'An empty document cannot be published');

update public.estimates set document_sections=jsonb_set(
  current_setting('test.document_sections')::jsonb, '{0,title}', '"   "')
where id='83000000-0000-4000-8000-000000000004';
select throws_ok($$update public.estimates set status='sent' where id='83000000-0000-4000-8000-000000000004'$$,
  '22023', 'Todas las secciones necesitan un título', 'Published sections need a visible title');
update public.estimates set document_sections=jsonb_build_array(current_setting('test.document_sections')::jsonb->0)
where id='83000000-0000-4000-8000-000000000004';
select throws_ok($$update public.estimates set status='sent' where id='83000000-0000-4000-8000-000000000004'$$,
  '22023', 'El presupuesto debe incluir exactamente una sección de Precio y una de Servicios.', 'Missing mandatory sections block publication');
update public.estimates set document_sections=jsonb_set(
  current_setting('test.document_sections')::jsonb, '{1,lineIds}', '["83000000-0000-4000-8000-000000000099"]')
where id='83000000-0000-4000-8000-000000000004';
select throws_ok($$update public.estimates set status='sent' where id='83000000-0000-4000-8000-000000000004'$$,
  '22023', 'Las secciones de precios no coinciden con las partidas guardadas', 'Unknown or foreign line references block publication');
update public.estimates set document_sections=current_setting('test.document_sections')::jsonb
where id='83000000-0000-4000-8000-000000000004';
select lives_ok($$update public.estimates set status='sent' where id='83000000-0000-4000-8000-000000000004'$$,
  'A valid modular document can be published');
select is((select snapshot#>'{estimate,document_sections}' from public.estimate_publications
  where estimate_id='83000000-0000-4000-8000-000000000004'), current_setting('test.document_sections')::jsonb,
  'The immutable snapshot keeps section content, order, types and page breaks');
select is((select snapshot#>>'{estimate,document_format}' from public.estimate_publications
  where estimate_id='83000000-0000-4000-8000-000000000004'), 'sections', 'The snapshot keeps the format');
select throws_ok($$update public.estimates set document_sections='[]' where id='83000000-0000-4000-8000-000000000004'$$,
  'P0001', 'El contenido de un presupuesto enviado es inmutable; crea una copia', 'Published sections cannot be edited');
set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000007';
select is((select count(*) from public.estimate_publications
  where estimate_id='83000000-0000-4000-8000-000000000004'), 0::bigint, 'Other companies cannot read the document');

select * from finish();
rollback;
