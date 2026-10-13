-- Las funciones de trigger no deben poder llamarse desde la API pública (/rest/v1/rpc).
-- Los triggers siguen funcionando: el permiso EXECUTE solo se comprueba al crearlos.
revoke all on function public.assign_estimate_number() from public, anon, authenticated;
revoke all on function public.assign_invoice_number() from public, anon, authenticated;
revoke all on function public.enforce_member_limit() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_user_email_change() from public, anon, authenticated;
