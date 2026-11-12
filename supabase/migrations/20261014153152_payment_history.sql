-- Historial de pagos visible para el propietario de la empresa (solo lectura).
-- Antes la tabla no tenía políticas: desde el navegador no se podía leer nada.
create policy billing_payments_select on public.billing_payments for select to authenticated
  using (public.has_role(tenant_id, array['owner']::public.app_role[]));
