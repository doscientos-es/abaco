-- Technicians use dedicated assignment projections. Broad legacy member policies
-- remain for office roles only, so a new technician cannot read CRM or finances.
create or replace function public.is_member(target_tenant uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = target_tenant and m.user_id = (select auth.uid())
      and m.role <> 'technician'
  );
$$;

drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.memberships mine
      join public.memberships theirs on theirs.tenant_id = mine.tenant_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id
        and mine.role <> 'technician'
    )
  );

-- The session needs a company label without exposing full tenant settings.
create function public.my_company_memberships()
returns table (tenant_id uuid, role public.app_role, company_name text)
language sql stable security definer set search_path = ''
as $$
  select m.tenant_id, m.role, t.name
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id
  where m.user_id = (select auth.uid())
  order by m.created_at, m.tenant_id;
$$;
revoke all on function public.my_company_memberships()
  from public, anon, authenticated;
grant execute on function public.my_company_memberships() to authenticated;

drop policy memberships_update on public.memberships;
create policy memberships_update on public.memberships for update to authenticated
  using (
    role <> 'owner' and user_id <> (select auth.uid())
    and (
      public.has_role(tenant_id, array['owner']::public.app_role[])
      or (public.has_role(tenant_id, array['admin']::public.app_role[])
          and role in ('editor', 'viewer', 'technician'))
    )
  )
  with check (
    role <> 'owner'
    and (
      public.has_role(tenant_id, array['owner']::public.app_role[])
      or (public.has_role(tenant_id, array['admin']::public.app_role[])
          and role in ('editor', 'viewer', 'technician'))
    )
  );

drop policy memberships_delete on public.memberships;
create policy memberships_delete on public.memberships for delete to authenticated
  using (
    role <> 'owner' and user_id <> (select auth.uid())
    and (
      public.has_role(tenant_id, array['owner']::public.app_role[])
      or (public.has_role(tenant_id, array['admin']::public.app_role[])
          and role in ('editor', 'viewer', 'technician'))
    )
  );
