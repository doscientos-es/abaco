-- A quote is informational; payment must recalculate it under the tenant lock.
create function public.quote_ai_upgrade(p_tenant uuid, p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.memberships m
    where m.tenant_id = p_tenant and m.user_id = (select auth.uid()) and m.role::text = 'admin') then
    raise exception 'Solo un administrador puede gestionar el plan' using errcode = '42501';
  end if;
  return app_private.ai_upgrade_quote(p_tenant, p_user);
end;
$$;
revoke all on function public.quote_ai_upgrade(uuid,uuid) from public, anon, authenticated;
grant execute on function public.quote_ai_upgrade(uuid,uuid) to authenticated;
notify pgrst, 'reload schema';