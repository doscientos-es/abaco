-- Expose only the contract label associated with visits the caller may see.
create function public.list_visit_contract_labels(p_tenant_id uuid, p_visit_ids uuid[])
returns table (visit_id uuid, contract_id uuid, contract_title text)
language sql stable security definer set search_path = '' as $$
  select v.id, c.id, c.title
  from public.service_visits v
  join public.service_contracts c on c.id = v.contract_id and c.tenant_id = v.tenant_id
  where v.tenant_id = p_tenant_id
    and v.id = any(p_visit_ids)
    and (
      public.has_role(v.tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
      or public.can_access_assigned_visit(v.tenant_id, v.id)
    );
$$;

revoke all on function public.list_visit_contract_labels(uuid, uuid[]) from public, anon;
grant execute on function public.list_visit_contract_labels(uuid, uuid[]) to authenticated;