-- Auth, empresas (tenants), miembros y roles.
-- Los datos de negocio (presupuestos, facturas...) llegarán en migraciones posteriores
-- y reutilizarán public.has_role() para sus políticas RLS.

create type public.app_role as enum ('owner', 'admin', 'editor', 'viewer');

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

-- Copia de los datos públicos del usuario (auth.users no es legible desde el cliente).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.memberships (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- Referencia a profiles (que a su vez cuelga de auth.users) para poder embeber el perfil en consultas.
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null default 'viewer',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);

-- Perfil automático al crear un usuario en Auth.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantiene el email del perfil sincronizado si el usuario lo cambia.
create function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- Helpers para RLS. security definer evita la recursión de políticas sobre memberships.
create function public.is_member(target_tenant uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = target_tenant and m.user_id = (select auth.uid())
  );
$$;

create function public.has_role(target_tenant uuid, allowed public.app_role[]) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = target_tenant
      and m.user_id = (select auth.uid())
      and m.role = any (allowed)
  );
$$;

revoke all on function public.is_member(uuid) from public, anon;
revoke all on function public.has_role(uuid, public.app_role[]) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.has_role(uuid, public.app_role[]) to authenticated;

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;

-- tenants: los miembros la leen; solo owner/admin la editan. Se crea desde el backend.
create policy tenants_select on public.tenants for select to authenticated
  using (public.is_member(id));
create policy tenants_update on public.tenants for update to authenticated
  using (public.has_role(id, array['owner', 'admin']::public.app_role[]))
  with check (public.has_role(id, array['owner', 'admin']::public.app_role[]));

-- profiles: cada uno ve el suyo y el de quienes comparten empresa; solo edita el suyo.
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.memberships mine
      join public.memberships theirs on theirs.tenant_id = mine.tenant_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- memberships: cada uno ve su fila y el equipo ve a todos los de su empresa.
-- Altas se hacen solo desde la Edge Function invite-member (service role).
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or public.is_member(tenant_id));

-- Owner/admin cambian roles, pero nunca el de un owner ni a owner (solo el owner promociona).
create policy memberships_update on public.memberships for update to authenticated
  using (
    public.has_role(tenant_id, array['owner', 'admin']::public.app_role[])
    and role <> 'owner' and user_id <> (select auth.uid())
  )
  with check (
    role <> 'owner'
    and public.has_role(tenant_id, array['owner', 'admin']::public.app_role[])
  );

-- Quitar a alguien: owner/admin, nunca a un owner ni a uno mismo.
create policy memberships_delete on public.memberships for delete to authenticated
  using (
    public.has_role(tenant_id, array['owner', 'admin']::public.app_role[])
    and role <> 'owner' and user_id <> (select auth.uid())
  );

-- Al menos un owner por empresa: impide dejarla sin propietario.
create function public.protect_last_owner() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    -- Si se borra la empresa entera (cascade) no hay nada que proteger.
    if exists (select 1 from public.tenants where id = old.tenant_id) and not exists (
      select 1 from public.memberships
      where tenant_id = old.tenant_id and role = 'owner' and user_id <> old.user_id
    ) then
      raise exception 'La empresa debe tener al menos un propietario';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger memberships_protect_last_owner
  before update or delete on public.memberships
  for each row execute function public.protect_last_owner();
