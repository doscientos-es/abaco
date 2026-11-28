create role anon;
create role authenticated;
create schema auth;
create schema app_private;
revoke all on schema app_private from public,anon,authenticated;
create type public.app_role as enum ('owner','admin','editor','technician','user','viewer');
create table public.memberships (tenant_id uuid,user_id uuid,role public.app_role);
create table public.test_tenants (tenant_id uuid,writable boolean);
create table public.service_locations (id uuid,tenant_id uuid,active boolean,kind text);
create table public.service_assets (id uuid,tenant_id uuid,location_id uuid,status text,
  name text not null default 'Activo de prueba');
create table public.installed_equipment (
  id uuid default gen_random_uuid(),tenant_id uuid,asset_id uuid,kind text,manufacturer text,model text,
  status text default 'active',created_at timestamptz not null default now(),
  private_note text default 'PRIVATE_EQUIPMENT',unique(id,tenant_id)
);
create table public.service_visits (
  id uuid,tenant_id uuid,asset_id uuid,location_id uuid,status text,assigned_user_id uuid,work_team_id uuid
);
create table public.work_team_members (tenant_id uuid,team_id uuid,user_id uuid);
create table public.service_incidents (
  id uuid,tenant_id uuid,source_visit_id uuid,equipment_id uuid,asset_id uuid,location_id uuid,
  status text,created_at timestamptz,title text default 'PRIVATE_INCIDENT'
);
create table public.installed_equipment_history (
  id uuid,tenant_id uuid,equipment_id uuid,before_state jsonb,after_state jsonb,changed_at timestamptz
);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function public.has_role(tenant uuid,roles public.app_role[]) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists(select 1 from public.memberships m
    where m.tenant_id=tenant and m.user_id=auth.uid() and m.role=any(roles)) $$;
create function public.tenant_can_write(tenant uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select writable from public.test_tenants where tenant_id=tenant $$;
create function public.reject_work_history_change() returns trigger language plpgsql
  as $$ begin raise exception 'Historial inmutable'; end; $$;
