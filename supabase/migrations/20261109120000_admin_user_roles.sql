-- Keep the database enum's old labels as migration compatibility values, but expose
-- and assign only admin/user. PostgreSQL cannot safely drop enum values in place.
alter table public.memberships alter column role set default 'user';

-- Existing office roles become admins; existing reader/editor/technician roles become users.
create or replace function public.protect_last_owner() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.role in ('owner', 'admin')
    and (tg_op = 'DELETE' or new.role not in ('owner', 'admin')) then
    if exists (select 1 from public.tenants where id = old.tenant_id)
      and not exists (
        select 1 from public.memberships
        where tenant_id = old.tenant_id and role in ('owner', 'admin')
          and user_id <> old.user_id
      ) then
      raise exception 'La empresa debe tener al menos un administrador';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

update public.memberships
set role = case role
  when 'owner' then 'admin'::public.app_role
  when 'editor' then 'user'::public.app_role
  when 'viewer' then 'user'::public.app_role
  when 'technician' then 'user'::public.app_role
  else role
end
where role in ('owner', 'editor', 'viewer', 'technician');

-- Add user alongside the legacy technician label wherever RLS/RPC checks worker access.
-- Also grant the former owner-only checks to admin, retaining legacy enum compatibility.
do $migration$
declare
  item record;
  definition text;
  updated_definition text;
  updated_qual text;
  updated_check text;
  statement text;
begin
  for item in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and (p.prosrc like '%technician%' or p.prosrc like '%owner%')
  loop
    definition := pg_get_functiondef(item.oid);
    updated_definition := definition;
    updated_definition := regexp_replace(
      updated_definition,
      $$array\[([[:space:]',a-z_]*'technician'[[:space:]',a-z_]*)\]::public\.app_role\[\]$$,
      $$array[\1, 'user']::public.app_role[]$$,
      'gi'
    );
    updated_definition := regexp_replace(
      updated_definition,
      $$(([a-z_][a-z0-9_]*\.)?role)[[:space:]]*=[[:space:]]*'technician'$$,
      $$\1 IN ('technician', 'user')$$,
      'gi'
    );
    updated_definition := regexp_replace(
      updated_definition,
      $$(([a-z_][a-z0-9_]*\.)?role)[[:space:]]*<>[[:space:]]*'technician'$$,
      $$\1 NOT IN ('technician', 'user')$$,
      'gi'
    );
    updated_definition := regexp_replace(
      updated_definition,
      $$(([a-z_][a-z0-9_]*\.)?role)[[:space:]]+IN[[:space:]]*\(([^)]*'technician'[^)]*)\)$$,
      $$\1 IN (\3, 'user')$$,
      'gi'
    );
    updated_definition := replace(
      updated_definition,
      'array[''owner'']::public.app_role[]',
      'array[''owner'', ''admin'']::public.app_role[]'
    );
    if updated_definition is distinct from definition then
      execute updated_definition;
    end if;
  end loop;

  for item in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies where schemaname = 'public'
  loop
    updated_qual := item.qual;
    updated_check := item.with_check;
    if updated_qual is not null then
      updated_qual := replace(updated_qual,
        'ARRAY[''technician''::public.app_role]',
        'ARRAY[''technician''::public.app_role, ''user''::public.app_role]');
      updated_qual := replace(updated_qual,
        ', ''technician''::public.app_role]',
        ', ''technician''::public.app_role, ''user''::public.app_role]');
      updated_qual := replace(updated_qual,
        'ARRAY[''technician''::app_role]',
        'ARRAY[''technician''::app_role, ''user''::app_role]');
      updated_qual := replace(updated_qual,
        ', ''technician''::app_role]',
        ', ''technician''::app_role, ''user''::app_role]');
      updated_qual := regexp_replace(updated_qual,
        $$(([a-z_][a-z0-9_]*\.)?role)[[:space:]]*=[[:space:]]*'technician'(::(public\.)?app_role)?$$,
        $$\1 IN ('technician'::public.app_role, 'user'::public.app_role)$$, 'gi');
      updated_qual := regexp_replace(updated_qual,
        $$(([a-z_][a-z0-9_]*\.)?role)[[:space:]]*<>[[:space:]]*'technician'(::(public\.)?app_role)?$$,
        $$\1 NOT IN ('technician'::public.app_role, 'user'::public.app_role)$$, 'gi');
      updated_qual := replace(updated_qual,
        'ARRAY[''owner''::public.app_role]',
        'ARRAY[''owner''::public.app_role, ''admin''::public.app_role]');
      updated_qual := replace(updated_qual,
        'ARRAY[''owner''::app_role]',
        'ARRAY[''owner''::app_role, ''admin''::app_role]');
    end if;
    if updated_check is not null then
      updated_check := replace(updated_check,
        'ARRAY[''technician''::public.app_role]',
        'ARRAY[''technician''::public.app_role, ''user''::public.app_role]');
      updated_check := replace(updated_check,
        ', ''technician''::public.app_role]',
        ', ''technician''::public.app_role, ''user''::public.app_role]');
      updated_check := replace(updated_check,
        'ARRAY[''technician''::app_role]',
        'ARRAY[''technician''::app_role, ''user''::app_role]');
      updated_check := replace(updated_check,
        ', ''technician''::app_role]',
        ', ''technician''::app_role, ''user''::app_role]');
      updated_check := regexp_replace(updated_check,
        $$(([a-z_][a-z0-9_]*\.)?role)[[:space:]]*=[[:space:]]*'technician'(::(public\.)?app_role)?$$,
        $$\1 IN ('technician'::public.app_role, 'user'::public.app_role)$$, 'gi');
      updated_check := regexp_replace(updated_check,
        $$(([a-z_][a-z0-9_]*\.)?role)[[:space:]]*<>[[:space:]]*'technician'(::(public\.)?app_role)?$$,
        $$\1 NOT IN ('technician'::public.app_role, 'user'::public.app_role)$$, 'gi');
      updated_check := replace(updated_check,
        'ARRAY[''owner''::public.app_role]',
        'ARRAY[''owner''::public.app_role, ''admin''::public.app_role]');
      updated_check := replace(updated_check,
        'ARRAY[''owner''::app_role]',
        'ARRAY[''owner''::app_role, ''admin''::app_role]');
    end if;

    if updated_qual is distinct from item.qual or updated_check is distinct from item.with_check then
      statement := format('ALTER POLICY %I ON %I.%I',
        item.policyname, item.schemaname, item.tablename);
      if updated_qual is not null then
        statement := statement || format(' USING (%s)', updated_qual);
      end if;
      if updated_check is not null then
        statement := statement || format(' WITH CHECK (%s)', updated_check);
      end if;
      execute statement;
    end if;
  end loop;
end;
$migration$;

-- New companies start with an admin, and an admin may manage either supported role.
create or replace function public.create_company(p_name text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  new_tenant uuid;
begin
  if uid is null then raise exception 'Hace falta iniciar sesión'; end if;
  if char_length(trim(p_name)) not between 1 and 120 then
    raise exception 'El nombre de la empresa debe tener entre 1 y 120 caracteres';
  end if;
  if (select count(*) from public.memberships where user_id = uid and role = 'admin') >= 10 then
    raise exception 'Has alcanzado el máximo de empresas';
  end if;
  insert into public.tenants (name) values (trim(p_name)) returning id into new_tenant;
  insert into public.memberships (tenant_id, user_id, role) values (new_tenant, uid, 'admin');
  return new_tenant;
end;
$$;

create or replace function public.create_tenant_with_owner(p_name text, p_owner uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare new_tenant uuid;
begin
  insert into public.tenants (name) values (p_name) returning id into new_tenant;
  insert into public.memberships (tenant_id, user_id, role)
  values (new_tenant, p_owner, 'admin');
  return new_tenant;
end;
$$;

drop policy memberships_update on public.memberships;
create policy memberships_update on public.memberships for update to authenticated
  using (public.has_role(tenant_id, array['admin']::public.app_role[])
    and user_id <> (select auth.uid()))
  with check (public.has_role(tenant_id, array['admin']::public.app_role[])
    and user_id <> (select auth.uid()) and role in ('admin', 'user'));

drop policy memberships_delete on public.memberships;
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.has_role(tenant_id, array['admin']::public.app_role[])
    and user_id <> (select auth.uid()));