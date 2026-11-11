-- Every immutable report version is pending until an administrator explicitly reviews it.
create table public.service_visit_report_reviews (
  report_version_id uuid primary key,
  tenant_id uuid not null,
  reviewed_by uuid not null,
  reviewed_at timestamptz not null default now(),
  foreign key (report_version_id, tenant_id)
    references public.service_visit_report_versions (id, tenant_id) on delete restrict
);
alter table public.service_visit_report_reviews enable row level security;
revoke all on public.service_visit_report_reviews from public, anon, authenticated;
grant select on public.service_visit_report_reviews to authenticated;
create policy service_visit_report_reviews_admin_read
  on public.service_visit_report_reviews for select to authenticated
  using (public.has_role(tenant_id, array['admin']::public.app_role[]));

create function public.list_pending_visit_report_reviews(
  p_tenant_id uuid, p_offset integer default 0
) returns table (
  report_version_id uuid, visit_id uuid, version integer, closed_at timestamptz,
  visit_title text, client_name text
) language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not coalesce(
    public.has_role(p_tenant_id, array['admin']::public.app_role[]), false
  ) then
    raise exception 'No autorizado para revisar partes' using errcode = '42501';
  end if;
  if p_offset is null or p_offset < 0 or p_offset > 100000 then
    raise exception 'Página inválida' using errcode = '22023';
  end if;
  return query
    select v.id, v.visit_id, v.version, v.closed_at,
      v.snapshot #>> '{visit,title}', v.snapshot #>> '{client,name}'
    from public.service_visit_report_versions v
    where v.tenant_id = p_tenant_id
      and not exists (select 1 from public.service_visit_report_reviews r
        where r.report_version_id = v.id)
    order by v.closed_at desc, v.id desc
    limit 21 offset p_offset;
end;
$$;
revoke all on function public.list_pending_visit_report_reviews(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.list_pending_visit_report_reviews(uuid, integer) to authenticated;

create function public.review_closed_visit_report(p_tenant_id uuid, p_report_version_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not coalesce(
    public.has_role(p_tenant_id, array['admin']::public.app_role[]), false
  ) or not coalesce(public.tenant_can_write(p_tenant_id), false) then
    raise exception 'No autorizado para revisar partes' using errcode = '42501';
  end if;
  if not exists (select 1 from public.service_visit_report_versions
    where id = p_report_version_id and tenant_id = p_tenant_id) then
    raise exception 'Parte no encontrado' using errcode = 'P0002';
  end if;
  insert into public.service_visit_report_reviews (report_version_id, tenant_id, reviewed_by)
    values (p_report_version_id, p_tenant_id, (select auth.uid()))
    on conflict (report_version_id) do nothing;
  return true;
end;
$$;
revoke all on function public.review_closed_visit_report(uuid, uuid) from public, anon, authenticated;
grant execute on function public.review_closed_visit_report(uuid, uuid) to authenticated;

-- Administrators may download only PDFs belonging to a report in their own company.
create policy visit_report_pdfs_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'visit-report-pdfs' and exists (
    select 1 from public.service_visit_report_versions v
    where name = v.tenant_id::text || '/' || v.id::text || '.pdf'
      and public.has_role(v.tenant_id, array['admin']::public.app_role[])
  ));
