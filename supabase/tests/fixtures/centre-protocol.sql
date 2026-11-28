create role anon;
create role authenticated;
create schema auth;
create schema app_private;
revoke all on schema app_private from public, anon, authenticated;
create type public.app_role as enum ('owner', 'admin', 'editor', 'technician', 'user');
create table public.memberships (tenant_id uuid, user_id uuid, role public.app_role);
create table public.test_tenants (tenant_id uuid, writable boolean);
create table public.service_locations (
  id uuid not null, tenant_id uuid not null, active boolean not null, kind text not null,
  access_notes text not null default 'PRIVATE_CENTRE_NOTES', primary key (id,tenant_id)
);
create table public.service_visits (
  id uuid primary key, tenant_id uuid not null, location_id uuid,
  status text, actual_end_at timestamptz, assigned_user_id uuid, work_team_id uuid
);
create table public.work_team_members (tenant_id uuid, team_id uuid, user_id uuid);
create table public.service_visit_events (
  tenant_id uuid, visit_id uuid, kind text, actor_id uuid, payload jsonb
);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function public.has_role(tenant uuid, roles public.app_role[]) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.memberships m
    where m.tenant_id = tenant and m.user_id = auth.uid() and m.role = any(roles)) $$;
create function public.tenant_can_write(tenant uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select t.writable from public.test_tenants t where t.tenant_id = tenant $$;
create function public.reject_work_history_change() returns trigger
  language plpgsql as $$ begin raise exception 'Historial inmutable'; end; $$;
