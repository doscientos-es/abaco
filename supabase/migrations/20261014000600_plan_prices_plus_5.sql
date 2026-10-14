-- Subida de precios: +5 € al mes en cada plan (sin IVA). El plan anual sigue siendo 10 mensualidades.
-- Los mismos números están en la app (features/billing/domain/plans.ts).

create or replace function public.plan_price_cents(p_plan text, p_interval text) returns integer
language sql immutable set search_path = ''
as $$
  select case p_interval
    when 'month' then case p_plan when 'solo' then 2000 when 'team' then 3400 when 'business' then 5400 end
    when 'year' then case p_plan when 'solo' then 20000 when 'team' then 34000 when 'business' then 54000 end
  end;
$$;
