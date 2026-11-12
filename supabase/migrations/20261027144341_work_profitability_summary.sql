-- Aggregate each source before joining it to a work order, so invoices and
-- cost entries never multiply one another. Expenses in the general ledger are
-- excluded until they have an explicit work allocation.
create function public.work_profitability_summary(
  p_tenant_id uuid, p_work_order_id uuid
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  target public.work_orders%rowtype;
  cost_cents bigint;
  cost_count bigint;
  approved_extra_sale_cents bigint;
  billed_net_cents bigint;
  billed_gross_cents bigint;
  collected_gross_cents bigint;
  invoice_count bigint;
begin
  if p_tenant_id is null or p_work_order_id is null then
    raise exception 'Trabajo y empresa requeridos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para consultar rentabilidad' using errcode = '42501';
  end if;
  select * into target from public.work_orders
  where id = p_work_order_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'Trabajo no encontrado' using errcode = 'P0002';
  end if;

  select coalesce(sum(c.signed_total_cost_cents), 0)::bigint
  into cost_cents
  from public.work_cost_entries c
  where c.tenant_id = p_tenant_id and c.work_order_id = p_work_order_id;
  select count(*) into cost_count from public.work_cost_entries c
  where c.tenant_id = p_tenant_id and c.work_order_id = p_work_order_id
    and c.reversal_of is null and not exists (
      select 1 from public.work_cost_entries r where r.reversal_of = c.id
    );

  select coalesce(sum(price_cents), 0)::bigint
  into approved_extra_sale_cents
  from public.work_order_extras
  where tenant_id = p_tenant_id and work_order_id = p_work_order_id
    and status = 'approved';

  select coalesce(sum(round(i.total_cents * 100 / (100 + i.vat_rate))), 0)::bigint,
    coalesce(sum(i.total_cents), 0)::bigint,
    coalesce(sum(i.paid_cents), 0)::bigint,
    count(*)
  into billed_net_cents, billed_gross_cents, collected_gross_cents, invoice_count
  from public.invoices i
  where i.tenant_id = p_tenant_id and (
    (target.origin_estimate_id is not null and i.estimate_id = target.origin_estimate_id)
    or exists (
      select 1 from public.work_order_extras x
      where x.id = i.work_extra_id and x.tenant_id = p_tenant_id
        and x.work_order_id = p_work_order_id
    )
  );

  return jsonb_build_object(
    'actualCostCents', cost_cents,
    'activeCostCount', cost_count,
    'approvedExtraSaleCents', approved_extra_sale_cents,
    'billedNetCents', billed_net_cents,
    'billedGrossCents', billed_gross_cents,
    'collectedGrossCents', collected_gross_cents,
    'invoiceCount', invoice_count
  );
end;
$$;
revoke all on function public.work_profitability_summary(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.work_profitability_summary(uuid, uuid)
  to authenticated;
