-- Both layouts share priced lines. Sections only own presentation and narrative content.
create function public.valid_estimate_sections(value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  section jsonb; item jsonb; kind text; ids text[] := '{}'; line_ids text[] := '{}'; row_ids text[];
  uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if jsonb_typeof(value) is distinct from 'array' then return false; end if;
  if jsonb_array_length(value) > 50 or char_length(value::text) > 1000000 then return false; end if;
  for section in select * from jsonb_array_elements(value) loop
    if jsonb_typeof(section) is distinct from 'object'
      or jsonb_typeof(section->'id') is distinct from 'string'
      or not (section->>'id' ~ uuid_pattern) or section->>'id' = any(ids)
      or jsonb_typeof(section->'title') is distinct from 'string'
      or char_length(section->>'title') > 200
      or jsonb_typeof(section->'pageBreakBefore') is distinct from 'boolean'
      then return false; end if;
    ids := array_append(ids, section->>'id');
    kind := section->>'type';
    if kind = 'description' then
      if section - array['id','title','type','pageBreakBefore','content'] <> '{}'::jsonb
        or jsonb_typeof(section->'content') is distinct from 'string'
        or char_length(section->>'content') > 10000 then return false; end if;
    elsif kind = 'prices' then
      if section - array['id','title','type','pageBreakBefore','lineIds'] <> '{}'::jsonb
        or jsonb_typeof(section->'lineIds') is distinct from 'array' then return false; end if;
      if jsonb_array_length(section->'lineIds') > 500 then return false; end if;
      for item in select * from jsonb_array_elements(section->'lineIds') loop
        if jsonb_typeof(item) is distinct from 'string'
          or not (item #>> '{}' ~ uuid_pattern) or item #>> '{}' = any(line_ids)
          then return false; end if;
        line_ids := array_append(line_ids, item #>> '{}');
      end loop;
    elsif kind in ('list','work_table') then
      if section - array['id','title','type','pageBreakBefore',case kind when 'list' then 'items' else 'rows' end] <> '{}'::jsonb
        or jsonb_typeof(section->case kind when 'list' then 'items' else 'rows' end) is distinct from 'array'
        then return false; end if;
      if jsonb_array_length(section->case kind when 'list' then 'items' else 'rows' end) > 100 then return false; end if;
      row_ids := '{}';
      for item in select * from jsonb_array_elements(section->case kind when 'list' then 'items' else 'rows' end) loop
        if jsonb_typeof(item) is distinct from 'object'
          or jsonb_typeof(item->'id') is distinct from 'string'
          or not (item->>'id' ~ uuid_pattern) or item->>'id' = any(row_ids) then return false; end if;
        row_ids := array_append(row_ids, item->>'id');
        if kind = 'list' then
          if item - array['id','text'] <> '{}'::jsonb
            or jsonb_typeof(item->'text') is distinct from 'string'
            or char_length(item->>'text') > 2000 then return false; end if;
        else
          if item - array['id','task','frequency','notes'] <> '{}'::jsonb
            or jsonb_typeof(item->'task') is distinct from 'string' or char_length(item->>'task') > 2000
            or jsonb_typeof(item->'frequency') is distinct from 'string' or char_length(item->>'frequency') > 200
            or jsonb_typeof(item->'notes') is distinct from 'string' or char_length(item->>'notes') > 2000
            then return false; end if;
        end if;
      end loop;
    else return false;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.valid_estimate_sections(jsonb) from public, anon;
grant execute on function public.valid_estimate_sections(jsonb) to authenticated, service_role;

alter table public.estimates
  add column document_format text not null default 'table' check (document_format in ('table','sections')),
  add column document_sections jsonb not null default '[]'::jsonb,
  add constraint estimates_document_sections_valid check (public.valid_estimate_sections(document_sections)),
  add constraint estimates_table_has_no_sections check (document_format = 'sections' or document_sections = '[]'::jsonb);

-- The generic published-content guard already protects new columns, including against service-role edits.
alter function public.estimate_publication_snapshot(uuid) rename to estimate_publication_snapshot_before_sections;
create function public.estimate_publication_snapshot(p_estimate_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  proposal public.estimates%rowtype; section jsonb; item jsonb; referenced text[] := '{}';
begin
  select * into proposal from public.estimates where id = p_estimate_id;
  if not found then return null; end if;
  if proposal.document_format = 'sections' then
    if jsonb_array_length(proposal.document_sections) = 0 then
      raise exception 'Añade al menos una sección antes de publicar' using errcode = '22023';
    end if;
    for section in select * from jsonb_array_elements(proposal.document_sections) loop
      if btrim(section->>'title') = '' then
        raise exception 'Todas las secciones necesitan un título' using errcode = '22023';
      end if;
      if section->>'type' = 'prices' then
        if jsonb_array_length(section->'lineIds') = 0 then
          raise exception 'Añade partidas o elimina la sección de precios vacía' using errcode = '22023';
        end if;
        referenced := referenced || array(select jsonb_array_elements_text(section->'lineIds'));
      end if;
    end loop;
    -- Parent and line writes are queued independently. Validate ownership/coverage at publication,
    -- never during a draft save, so a partial save cannot publish invisible or foreign priced lines.
    if exists(select 1 from unnest(referenced) ref where not exists(
      select 1 from public.estimate_lines l where l.id::text = ref and l.estimate_id = proposal.id and l.tenant_id = proposal.tenant_id))
      or exists(select 1 from public.estimate_lines l where l.estimate_id = proposal.id and not (l.id::text = any(referenced))) then
      raise exception 'Las secciones de precios no coinciden con las partidas guardadas' using errcode = '22023';
    end if;
  end if;
  return jsonb_set(jsonb_set(public.estimate_publication_snapshot_before_sections(proposal.id),
    '{estimate,document_format}', to_jsonb(proposal.document_format), true),
    '{estimate,document_sections}', proposal.document_sections, true);
end;
$$;
revoke all on function public.estimate_publication_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.estimate_publication_snapshot_before_sections(uuid) from public, anon, authenticated;