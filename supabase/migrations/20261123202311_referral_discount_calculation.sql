-- Pure calculation only: this migration does not enable discounts or change charges.
-- Referral rewards are 10% of confirmed card payments, VAT included. When the
-- exact gross amount cannot be represented with cent-rounded 21% VAT, choose
-- the next lower payable amount so the difference benefits the customer.
create function app_private.referral_discount_breakdown(
  p_net_cents integer, p_referred_paid_cents bigint
) returns table (original_cents integer, credit_cents integer, net_cents integer,
  total_cents integer, discount_cents integer)
language plpgsql immutable strict set search_path = '' as $$
declare target integer;
begin
  if p_net_cents < 0 or p_net_cents > 100000000 or p_referred_paid_cents < 0 then
    raise exception 'Importes de referidos no válidos' using errcode = '22023';
  end if;
  original_cents := app_private.billing_total(p_net_cents, 21);
  credit_cents := least(original_cents::numeric, round(p_referred_paid_cents::numeric / 10))::integer;
  target := original_cents - credit_cents;
  net_cents := least(p_net_cents::bigint, ((target::bigint + 1) * 100 - 51) / 121)::integer;
  total_cents := app_private.billing_total(net_cents, 21);
  discount_cents := original_cents - total_cents;
  return next;
end;
$$;

revoke all on function app_private.referral_discount_breakdown(integer, bigint)
  from public, anon, authenticated;