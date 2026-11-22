-- Company details are distinct from the customer's subscription billing profile.
create table public.platform_company_profile_log (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_id uuid not null,
  changed_at timestamptz not null default now(),
  previous_profile jsonb not null,
  new_profile jsonb not null
);
alter table public.platform_company_profile_log enable row level security;
revoke all on public.platform_company_profile_log from public, anon, authenticated;

create function app_private.platform_company_profile(t public.tenants) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'name', t.name, 'legal_name', coalesce(t.legal_name, ''), 'tax_id', t.tax_id,
    'email', t.email, 'phone', t.phone, 'address', coalesce(t.address, ''),
    'postal_code', coalesce(t.postal_code, ''), 'city', coalesce(t.city, ''),
    'website', coalesce(t.website, ''), 'updated_at', t.updated_at
  );
$$;
revoke all on function app_private.platform_company_profile(public.tenants) from public, anon, authenticated;

create function public.superadmin_company_profile(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if public.is_platform_superadmin() is not true then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select app_private.platform_company_profile(t) into result
    from public.tenants t where t.id = p_tenant;
  return result;
end;
$$;
revoke all on function public.superadmin_company_profile(uuid) from public, anon;
grant execute on function public.superadmin_company_profile(uuid) to authenticated;

create function public.superadmin_update_company_profile(
  p_tenant uuid, p_expected_updated_at timestamptz, p_profile jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  current_tenant public.tenants;
  previous jsonb;
  fields constant text[] := array['name','legal_name','tax_id','email','phone','address','postal_code','city','website'];
begin
  if public.is_platform_superadmin() is not true then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'Datos de empresa no válidos' using errcode = '22023';
  end if;
  if not p_profile ?& fields or exists (
    select 1 from jsonb_each(p_profile) item
    where item.key <> all(fields) or jsonb_typeof(item.value) <> 'string'
  ) then
    raise exception 'Datos de empresa no válidos' using errcode = '22023';
  end if;
  select jsonb_object_agg(item.key, to_jsonb(btrim(item.value #>> '{}'))) into p_profile
    from jsonb_each(p_profile) item;
  if char_length(p_profile->>'name') not between 1 and 120
    or char_length(p_profile->>'legal_name') > 160
    or char_length(p_profile->>'tax_id') > 32
    or char_length(p_profile->>'email') > 254
    or (p_profile->>'email' <> '' and p_profile->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    or char_length(p_profile->>'phone') > 32
    or char_length(p_profile->>'address') > 300
    or char_length(p_profile->>'postal_code') > 20
    or char_length(p_profile->>'city') > 100
    or char_length(p_profile->>'website') > 2048
    or (p_profile->>'website' <> '' and p_profile->>'website' !~* '^https?://[^[:space:]./]+(\.[^[:space:]/]+)+(/[^[:space:]]*)?$') then
    raise exception 'Revisa los datos de la empresa.' using errcode = '22023';
  end if;
  select * into current_tenant from public.tenants where id = p_tenant for update;
  if not found then raise exception 'No se ha encontrado la empresa.' using errcode = 'P0001'; end if;
  if p_expected_updated_at is distinct from current_tenant.updated_at then
    raise exception 'La empresa ha cambiado. Recarga la ficha antes de guardar.' using errcode = '40001';
  end if;
  previous := app_private.platform_company_profile(current_tenant);
  update public.tenants set
    name = p_profile->>'name', legal_name = nullif(p_profile->>'legal_name', ''),
    tax_id = p_profile->>'tax_id', email = p_profile->>'email', phone = p_profile->>'phone',
    address = nullif(p_profile->>'address', ''), postal_code = nullif(p_profile->>'postal_code', ''),
    city = nullif(p_profile->>'city', ''), website = nullif(p_profile->>'website', '')
    where id = p_tenant returning * into current_tenant;
  insert into public.platform_company_profile_log(tenant_id, actor_id, previous_profile, new_profile)
    values (p_tenant, (select auth.uid()), previous, app_private.platform_company_profile(current_tenant));
end;
$$;
revoke all on function public.superadmin_update_company_profile(uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.superadmin_update_company_profile(uuid, timestamptz, jsonb) to authenticated;