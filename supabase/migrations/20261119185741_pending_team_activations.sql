-- Account activation is global; only expose IDs belonging to the caller's company.
create function public.pending_team_activations(p_tenant_id uuid)
returns table(user_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_role(p_tenant_id, array['owner', 'admin']::public.app_role[]) then
    raise exception 'No tienes permiso para gestionar el equipo' using errcode = '42501';
  end if;
  return query
    select m.user_id
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.tenant_id = p_tenant_id
      and u.invited_at is not null
      and u.email_confirmed_at is null
      and u.last_sign_in_at is null;
end;
$$;
revoke all on function public.pending_team_activations(uuid) from public, anon, authenticated;
grant execute on function public.pending_team_activations(uuid) to authenticated;