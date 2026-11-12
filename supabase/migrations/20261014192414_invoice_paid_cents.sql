-- Cobros parciales: cuánto se ha cobrado ya de cada factura (importe con IVA, en céntimos).
alter table public.invoices add column if not exists paid_cents integer not null default 0 check (paid_cents >= 0);

-- Las facturas ya cobradas cuentan como cobradas por completo.
update public.invoices set paid_cents = total_cents where status = 'paid' and paid_cents = 0;
