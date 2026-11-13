-- Reviewed periods keep their office valuation rather than a quoted full-cycle total.
create or replace function app_private.set_contract_draft_exact_total() returns trigger
language plpgsql security definer set search_path = '' as $$
declare agreed_total bigint;
begin
  select p.agreed_total_cents into agreed_total from public.contract_billing_periods p
    where p.id=new.contract_period_id and p.tenant_id=new.tenant_id and p.pricing_status='priced';
  if agreed_total is not null then new.total_cents := agreed_total; end if;
  return new;
end;
$$;
revoke all on function app_private.set_contract_draft_exact_total() from public, anon, authenticated, service_role;