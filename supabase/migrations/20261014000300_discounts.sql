-- Descuentos: porcentaje por línea y descuento global del presupuesto.
-- El global es un porcentaje (0..100) o un importe en céntimos, según discount_type.

alter table public.estimate_lines
  add column discount_percent numeric(5, 2) not null default 0
    check (discount_percent between 0 and 100);

alter table public.estimates
  add column discount_type text not null default 'none'
    check (discount_type in ('none', 'percent', 'amount')),
  add column discount_value numeric(14, 2) not null default 0 check (discount_value >= 0),
  add constraint estimates_discount_percent_max
    check (discount_type <> 'percent' or discount_value <= 100);
