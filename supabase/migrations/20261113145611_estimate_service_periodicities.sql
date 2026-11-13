-- Additive structured service periodicities; historical rows/snapshots remain unchanged.
create or replace function public.valid_estimate_sections(value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  section jsonb; item jsonb; kind text; ids text[] := '{}'; line_ids text[] := '{}'; row_ids text[];
  periodicity jsonb; periodicity_ids text[];
  uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if jsonb_typeof(value) is distinct from 'array' then return false; end if;
  if jsonb_array_length(value) > 50 or char_length(value::text) > 1000000 then return false; end if;
  for section in select * from jsonb_array_elements(value) loop
    if jsonb_typeof(section) is distinct from 'object'
      or jsonb_typeof(section->'id') is distinct from 'string'
      or not (section->>'id' ~ uuid_pattern) or section->>'id' = any(ids)
      or jsonb_typeof(section->'title') is distinct from 'string' or char_length(section->>'title') > 200
      or jsonb_typeof(section->'pageBreakBefore') is distinct from 'boolean' then return false; end if;
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
          or not (item #>> '{}' ~ uuid_pattern) or item #>> '{}' = any(line_ids) then return false; end if;
        line_ids := array_append(line_ids, item #>> '{}');
      end loop;
    elsif kind in ('list','work_table') then
      if section - array['id','title','type','pageBreakBefore',case kind when 'list' then 'items' else 'rows' end] <> '{}'::jsonb
        or jsonb_typeof(section->case kind when 'list' then 'items' else 'rows' end) is distinct from 'array' then return false; end if;
      if jsonb_array_length(section->case kind when 'list' then 'items' else 'rows' end) > 100 then return false; end if;
      row_ids := '{}';
      for item in select * from jsonb_array_elements(section->case kind when 'list' then 'items' else 'rows' end) loop
        if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'id') is distinct from 'string'
          or not (item->>'id' ~ uuid_pattern) or item->>'id' = any(row_ids) then return false; end if;
        row_ids := array_append(row_ids, item->>'id');
        if kind = 'list' then
          if item - array['id','text'] <> '{}'::jsonb or jsonb_typeof(item->'text') is distinct from 'string'
            or char_length(item->>'text') > 2000 then return false; end if;
        else
          if item - array['id','task','frequency','notes','periodicities'] <> '{}'::jsonb
            or jsonb_typeof(item->'task') is distinct from 'string' or char_length(item->>'task') > 2000
            or jsonb_typeof(item->'frequency') is distinct from 'string' or char_length(item->>'frequency') > 200
            or jsonb_typeof(item->'notes') is distinct from 'string' or char_length(item->>'notes') > 2000 then return false; end if;
          if item ? 'periodicities' then
            if jsonb_typeof(item->'periodicities') is distinct from 'array' then return false; end if;
            if jsonb_array_length(item->'periodicities') > 6 then return false; end if;
            periodicity_ids := '{}';
            for periodicity in select * from jsonb_array_elements(item->'periodicities') loop
              if jsonb_typeof(periodicity) is distinct from 'string'
                or periodicity #>> '{}' not in ('daily','twice_weekly','weekly','monthly','semiannual','annual')
                or periodicity #>> '{}' = any(periodicity_ids) then return false; end if;
              periodicity_ids := array_append(periodicity_ids,periodicity #>> '{}');
            end loop;
          end if;
        end if;
      end loop;
    else return false;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.valid_estimate_sections(jsonb) from public,anon;
grant execute on function public.valid_estimate_sections(jsonb) to authenticated,service_role;

-- Keep a human-readable frequency for existing consumers, plus the exact checkbox selections.
create or replace function app_private.estimate_agreement_metadata(p_snapshot jsonb) returns jsonb
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
    select coalesce(jsonb_agg(jsonb_build_object('id',r->>'id','sectionId',s->>'id','sourceLineId',null,
      'task',r->>'task','notes',r->>'notes','frequency',
      case when r ? 'periodicities' then concat_ws('; ',
        (select string_agg(case p when 'daily' then 'Diario' when 'twice_weekly' then 'Dos veces a la semana'
          when 'weekly' then 'Semanal' when 'monthly' then 'Mensual' when 'semiannual' then 'Semestral'
          when 'annual' then 'Anual' end,'; ' order by pi)
          from jsonb_array_elements_text(r->'periodicities') with ordinality selected(p,pi)),
        nullif(r->>'frequency','')) else r->>'frequency' end)
      || case when r ? 'periodicities' then jsonb_build_object('periodicities',r->'periodicities') else '{}'::jsonb end
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
      'netCents',net,'vatRate',(proposal->>'vat_rate')::numeric,'vatCents',vat,'totalCents',net+vat),'services',services);
end;
$$;
revoke all on function app_private.estimate_agreement_metadata(jsonb) from public,anon,authenticated;