-- Endurecimiento tras auditoría de auth.

-- 1. El perfil solo permite editar el nombre. El email lo sincroniza un trigger desde auth.users;
--    si el usuario pudiera cambiarlo, invite-member (que busca por profiles.email) podría
--    añadir a la empresa a la persona equivocada.
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- 2. Solo el propietario toca a los administradores o nombra nuevos administradores.
--    Un admin solo gestiona editores y lectores.
drop policy memberships_update on public.memberships;
create policy memberships_update on public.memberships for update to authenticated
  using (
    role <> 'owner' and user_id <> (select auth.uid())
    and (
      public.has_role(tenant_id, array['owner']::public.app_role[])
      or (public.has_role(tenant_id, array['admin']::public.app_role[]) and role in ('editor', 'viewer'))
    )
  )
  with check (
    role <> 'owner'
    and (
      public.has_role(tenant_id, array['owner']::public.app_role[])
      or (public.has_role(tenant_id, array['admin']::public.app_role[]) and role in ('editor', 'viewer'))
    )
  );

drop policy memberships_delete on public.memberships;
create policy memberships_delete on public.memberships for delete to authenticated
  using (
    role <> 'owner' and user_id <> (select auth.uid())
    and (
      public.has_role(tenant_id, array['owner']::public.app_role[])
      or (public.has_role(tenant_id, array['admin']::public.app_role[]) and role in ('editor', 'viewer'))
    )
  );
