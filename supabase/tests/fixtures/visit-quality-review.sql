-- Focused PGlite surface: the actual QA migration supplies its policies and RPCs.
create role anon;
create role authenticated;
create schema auth;
create schema app_private;
revoke all on schema app_private from public, anon, authenticated;
create type public.app_role as enum ('owner','admin','editor','technician','user');
create table public.memberships (
  tenant_id uuid not null, user_id uuid not null, role public.app_role not null,
  primary key (tenant_id,user_id)
);
create table public.test_tenants (id uuid primary key, writable boolean not null);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function public.has_role(tenant uuid, roles public.app_role[]) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.memberships m
    where m.tenant_id = tenant and m.user_id = auth.uid() and m.role = any(roles)) $$;
create function public.tenant_can_write(tenant uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select t.writable from public.test_tenants t where t.id = tenant $$;
create function public.reject_work_history_change() returns trigger
  language plpgsql as $$ begin raise exception 'El historial es inmutable'; end; $$;
create table public.service_visit_report_versions (
  id uuid primary key,
  tenant_id uuid not null,
  visit_id uuid not null,
  version integer not null,
  snapshot jsonb not null,
  closed_at timestamptz not null,
  unique(id, tenant_id),
  unique(tenant_id, visit_id, version)
);
