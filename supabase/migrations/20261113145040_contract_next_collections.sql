-- Read-only, page-sized collection summary. No billing dates are inferred from
-- recurrence: only issued balances and explicitly scheduled drafts are included.
create function public.list_contract_next_collections(
  p_tenant_id uuid, p_contract_ids uuid[]
) returns table (
  contract_id uuid, due_on date, source text, is_overdue boolean
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_tenant_id is null or p_contract_ids is null
     or cardinality(p_contract_ids) > 100
     or array_position(p_contract_ids, null) is not null then
    raise exception 'Consulta de cobros de contratos inválida' using errcode = '22023';
  end if;
  if auth.uid() is null or not public.has_role(
    p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para consultar cobros de contratos'
      using errcode = '42501';
  end if;
  return query
  select c.id, next_due.due_date, next_due.kind,
    next_due.due_date < (current_timestamp at time zone c.timezone)::date
  from public.service_contracts c
  cross join lateral (
    select candidate.due_date, candidate.kind
    from (
      select i.due_date, 'invoice'::text as kind, 0 as priority
      from public.contract_billing_periods p
      join public.invoices i
        on i.contract_period_id = p.id and i.tenant_id = p.tenant_id
      where p.tenant_id = p_tenant_id and p.contract_id = c.id
        and i.paid_cents < i.total_cents
      union all
      select d.due_date, 'draft'::text, 1
      from public.invoice_contract_period_drafts d
      where d.tenant_id = p_tenant_id and d.contract_id = c.id and d.status = 'draft'
        and not exists (
          select 1 from public.invoices i
          where i.tenant_id = p_tenant_id and i.contract_period_id = d.contract_period_id
        )
    ) candidate
    order by candidate.due_date, candidate.priority
    limit 1
  ) next_due
  where c.tenant_id = p_tenant_id and c.id = any(p_contract_ids);
end;
$$;

revoke all on function public.list_contract_next_collections(uuid, uuid[]) from public, anon;
grant execute on function public.list_contract_next_collections(uuid, uuid[]) to authenticated;

create index invoice_contract_period_drafts_next_collection_idx
  on public.invoice_contract_period_drafts(tenant_id, contract_id, due_date)
  where status = 'draft';