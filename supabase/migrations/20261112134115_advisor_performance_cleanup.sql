-- Evaluate the authenticated identity once per statement, without changing access rules.
alter policy signed_documents_insert on public.visit_signed_documents
  with check (created_by = (select auth.uid()) and public.tenant_can_write(tenant_id)
    and public.has_role(tenant_id, array['owner','admin','editor']::public.app_role[])
    and exists (select 1 from storage.objects o
      where o.bucket_id = 'signed-work-sheets' and o.name = object_path));
alter policy absence_history_read on public.absence_request_history
  using (public.has_role(tenant_id, array['owner','admin']::public.app_role[]) or exists (
    select 1 from public.absence_requests r
    where r.id = request_id and r.tenant_id = absence_request_history.tenant_id
      and r.requester_id = (select auth.uid())));

-- Referencing foreign keys use id_tenant_unique; identity_unique is redundant.
alter table public.service_visit_report_versions
  drop constraint service_visit_report_versions_identity_unique;

-- Support function deletion/lookup and visits and absence history lookups.
create index staff_function_assignments_function_idx
  on public.staff_function_assignments (tenant_id, function_id);
create index absence_request_history_request_idx
  on public.absence_request_history (request_id, tenant_id);
create index visit_signed_documents_visit_idx
  on public.visit_signed_documents (visit_id, tenant_id);