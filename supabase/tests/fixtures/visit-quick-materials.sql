create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema auth to authenticated;

create function auth.uid() returns uuid language sql stable
as $$select nullif(current_setting('request.jwt.claim.sub',true), '')::uuid$$;

create type public.app_role as enum ('owner','admin','editor','viewer','user','technician');
create table public.memberships (tenant uuid, uid uuid, role public.app_role);
create table public.tenant_write_status (tenant uuid primary key, can_write boolean);
create table public.work_orders (id uuid, tenant_id uuid, unique (id,tenant_id));
create table public.service_contracts (id uuid, tenant_id uuid, unique (id,tenant_id));
create table public.service_visits (
  id uuid primary key, tenant_id uuid not null, assigned_user_id uuid,
  work_team_id uuid, status text not null, work_order_id uuid, contract_id uuid,
  unique (id,tenant_id)
);
create table public.work_team_members (team_id uuid, tenant_id uuid, user_id uuid);
create table public.catalog_items (
  id uuid primary key, tenant_id uuid, kind text, name text, unit text, unit_price_cents bigint,
  sku text, notes text
);
alter table public.catalog_items enable row level security;
grant select on public.catalog_items to authenticated;

create function public.has_role(p_tenant uuid, p_roles public.app_role[])
returns boolean language sql stable security definer set search_path = ''
as $$
  select p_tenant is not null and
    (select role = any(p_roles) from public.memberships
      where tenant = p_tenant and uid = auth.uid());
$$;

create function public.tenant_can_write(p_tenant uuid)
returns boolean language sql stable security definer set search_path = ''
as $$select can_write from public.tenant_write_status where tenant = p_tenant$$;

create function public.can_access_assigned_visit(p_tenant_id uuid, p_visit_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select public.has_role(v.tenant_id,
      array['technician', 'user']::public.app_role[])
    and (v.assigned_user_id = (select auth.uid()) or
      (v.assigned_user_id is null and exists (
        select 1 from public.work_team_members m
        where m.tenant_id = v.tenant_id and m.team_id = v.work_team_id
          and m.user_id = (select auth.uid())
      )))
    from public.service_visits v
    where v.tenant_id = p_tenant_id and v.id = p_visit_id), false);
$$;

create function public.reject_work_history_change()
returns trigger language plpgsql as $$
begin
  raise exception 'El historial no se puede modificar';
end;
$$;
