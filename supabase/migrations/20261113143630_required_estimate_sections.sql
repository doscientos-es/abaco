-- Only publication becomes stricter. Historical snapshots and drafts remain readable.
create or replace function public.estimate_publication_snapshot(p_estimate_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  proposal public.estimates%rowtype;
  section jsonb;
  referenced text[] := '{}';
begin
  select * into proposal from public.estimates where id = p_estimate_id;
  if not found then return null; end if;
  if proposal.document_format = 'sections' then
    if (select count(*) from jsonb_array_elements(proposal.document_sections) s where s->>'type' = 'prices') <> 1
      or (select count(*) from jsonb_array_elements(proposal.document_sections) s where s->>'type' = 'work_table') <> 1 then
      raise exception 'El presupuesto debe incluir exactamente una sección de Precio y una de Servicios.' using errcode = '22023';
    end if;
    for section in select * from jsonb_array_elements(proposal.document_sections) loop
      if btrim(section->>'title') = '' then
        raise exception 'Todas las secciones necesitan un título' using errcode = '22023';
      end if;
      if section->>'type' = 'prices' then
        if jsonb_array_length(section->'lineIds') = 0 then
          raise exception 'Añade un importe a la sección de Precio antes de publicar' using errcode = '22023';
        end if;
        referenced := referenced || array(select jsonb_array_elements_text(section->'lineIds'));
      end if;
    end loop;
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