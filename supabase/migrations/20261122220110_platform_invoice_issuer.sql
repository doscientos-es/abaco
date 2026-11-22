-- Passive issuer configuration only. This does not enable or route invoice issuance.
create table app_private.platform_invoice_issuer (
  singleton boolean primary key default true check (singleton),
  revision bigint not null default 0,
  profile jsonb,
  updated_at timestamptz not null default now()
);
insert into app_private.platform_invoice_issuer (singleton) values (true);

create table app_private.platform_invoice_issuer_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  changed_at timestamptz not null default now(),
  previous_profile jsonb,
  new_profile jsonb not null
);
revoke all on app_private.platform_invoice_issuer, app_private.platform_invoice_issuer_log
  from public, anon, authenticated;

create function public.superadmin_invoice_issuer() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if public.is_platform_superadmin() is not true then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select jsonb_build_object('revision', revision, 'profile', profile)
    into result from app_private.platform_invoice_issuer where singleton;
  return result;
end;
$$;

create function public.superadmin_save_invoice_issuer(p_revision bigint, p_profile jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  current_revision bigint;
  previous jsonb;
  normalized jsonb;
  fields constant text[] := array['legal_name','tax_id','street','postal_code','city','province','series','corrective_series'];
begin
  if public.is_platform_superadmin() is not true then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'Datos fiscales no válidos' using errcode = '22023';
  end if;
  if not p_profile ?& fields or exists (
    select 1 from jsonb_each(p_profile) item
    where item.key <> all(fields) or jsonb_typeof(item.value) <> 'string'
  ) then
    raise exception 'Datos fiscales no válidos' using errcode = '22023';
  end if;
  select jsonb_object_agg(key, case when key in ('tax_id','series','corrective_series')
    then upper(btrim(value)) else btrim(value) end)
    into normalized from jsonb_each_text(p_profile);
  if char_length(normalized->>'legal_name') not between 1 and 160
    or normalized->>'tax_id' !~ '^[A-Z0-9]{9}$'
    or char_length(normalized->>'street') not between 1 and 250
    or normalized->>'postal_code' !~ '^[0-9]{5}$'
    or char_length(normalized->>'city') not between 1 and 120
    or char_length(normalized->>'province') not between 1 and 120
    or normalized->>'series' !~ '^[A-Z0-9_-]{1,20}$'
    or normalized->>'corrective_series' !~ '^[A-Z0-9_-]{1,20}$'
    or normalized->>'series' = normalized->>'corrective_series' then
    raise exception 'Revisa los datos fiscales y las series.' using errcode = '22023';
  end if;
  select revision, profile into current_revision, previous
    from app_private.platform_invoice_issuer where singleton for update;
  if p_revision is distinct from current_revision then
    raise exception 'Los datos fiscales han cambiado. Recarga antes de guardar.' using errcode = '40001';
  end if;
  update app_private.platform_invoice_issuer
    set profile = normalized, revision = revision + 1, updated_at = clock_timestamp() where singleton;
  insert into app_private.platform_invoice_issuer_log (actor_id, previous_profile, new_profile)
    values ((select auth.uid()), previous, normalized);
end;
$$;
revoke all on function public.superadmin_invoice_issuer() from public, anon, authenticated;
revoke all on function public.superadmin_save_invoice_issuer(bigint,jsonb) from public, anon, authenticated;
grant execute on function public.superadmin_invoice_issuer() to authenticated;
grant execute on function public.superadmin_save_invoice_issuer(bigint,jsonb) to authenticated;
notify pgrst, 'reload schema';