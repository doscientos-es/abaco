-- Attribution is independent of billing: no rewards or charges are enabled here.
create table app_private.referral_codes (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  code text not null unique check (code ~ '^[A-F0-9]{16}$')
);

create table app_private.referral_attributions (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  referrer_id uuid not null references public.tenants(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (tenant_id <> referrer_id)
);
create index referral_attributions_referrer_idx on app_private.referral_attributions(referrer_id);

-- Preserve a record of manual changes even if an account is later removed.
create table app_private.referral_attribution_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  previous_referrer_id uuid,
  new_referrer_id uuid,
  actor_id uuid not null,
  changed_at timestamptz not null default now()
);
revoke all on app_private.referral_codes, app_private.referral_attributions,
  app_private.referral_attribution_audit from public, anon, authenticated;

-- Serialize creation per user so one signup cannot credit multiple companies.
create or replace function public.create_company(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); new_tenant uuid; referral text; referrer uuid; first_company boolean;
begin
  if uid is null then raise exception 'Hace falta iniciar sesión'; end if;
  if char_length(trim(p_name)) not between 1 and 120 then
    raise exception 'El nombre de la empresa debe tener entre 1 y 120 caracteres';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('abaco-create-company:' || uid::text, 0));
  if (select count(*) from public.memberships where user_id = uid and role = 'admin') >= 10 then
    raise exception 'Has alcanzado el máximo de empresas';
  end if;
  first_company := not exists (select 1 from public.memberships where user_id = uid);
  if first_company then
    select upper(trim(raw_user_meta_data->>'abaco_referral_code')) into referral
      from auth.users where id = uid;
    select c.tenant_id into referrer from app_private.referral_codes c
      where c.code = referral
        and not exists (select 1 from public.memberships m where m.tenant_id = c.tenant_id and m.user_id = uid);
  end if;
  insert into public.tenants (name) values (trim(p_name)) returning id into new_tenant;
  insert into public.memberships (tenant_id, user_id, role) values (new_tenant, uid, 'admin');
  if referrer is not null then
    insert into app_private.referral_attributions (tenant_id, referrer_id) values (new_tenant, referrer);
  end if;
  return new_tenant;
end;
$$;

create function public.referral_program_status(p_tenant uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare code text; referrer_name text; referred_count bigint;
begin
  if not public.has_role(p_tenant, array['admin']::public.app_role[])
     and not public.is_platform_superadmin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select c.code into code from app_private.referral_codes c where c.tenant_id = p_tenant;
  if code is null then
    loop
      code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
      insert into app_private.referral_codes (tenant_id, code) values (p_tenant, code)
        on conflict do nothing;
      select c.code into code from app_private.referral_codes c where c.tenant_id = p_tenant;
      exit when code is not null;
    end loop;
  end if;
  select t.name into referrer_name from app_private.referral_attributions a
    join public.tenants t on t.id = a.referrer_id where a.tenant_id = p_tenant;
  select count(*) into referred_count from app_private.referral_attributions a where a.referrer_id = p_tenant;
  return jsonb_build_object('code', code, 'referred_count', referred_count,
    'recommended_by', referrer_name, 'rewards_active', false);
end;
$$;
revoke all on function public.referral_program_status(uuid) from public, anon;
grant execute on function public.referral_program_status(uuid) to authenticated;

create function public.superadmin_company_referral(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_platform_superadmin() then raise exception 'No autorizado' using errcode = '42501'; end if;
  select jsonb_build_object('referrer_id', a.referrer_id, 'referrer_name', r.name)
    into result from public.tenants t
    left join app_private.referral_attributions a on a.tenant_id = t.id
    left join public.tenants r on r.id = a.referrer_id where t.id = p_tenant;
  return result;
end;
$$;

create function public.superadmin_set_company_referral(p_tenant uuid, p_referrer uuid, p_expected uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare previous uuid;
begin
  if not public.is_platform_superadmin() then raise exception 'No autorizado' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('abaco-referral-attributions', 0));
  if not exists (select 1 from public.tenants where id = p_tenant)
     or (p_referrer is not null and not exists (select 1 from public.tenants where id = p_referrer)) then
    raise exception 'Empresa no encontrada' using errcode = '22023';
  end if;
  select a.referrer_id into previous from app_private.referral_attributions a where a.tenant_id = p_tenant;
  if previous is distinct from p_expected then
    raise exception 'La recomendación ha cambiado. Actualiza la página y vuelve a intentarlo.' using errcode = '40001';
  end if;
  if previous is not distinct from p_referrer then return; end if;
  if p_referrer is not null and exists (
    with recursive ancestors(id) as (
      select p_referrer union
      select a.referrer_id from app_private.referral_attributions a join ancestors x on a.tenant_id = x.id
    ) select 1 from ancestors where id = p_tenant
  ) then raise exception 'La recomendación crearía un ciclo entre empresas' using errcode = '22023'; end if;
  if p_referrer is null then
    delete from app_private.referral_attributions where tenant_id = p_tenant;
  else
    insert into app_private.referral_attributions (tenant_id, referrer_id) values (p_tenant, p_referrer)
      on conflict (tenant_id) do update set referrer_id = excluded.referrer_id;
  end if;
  insert into app_private.referral_attribution_audit (tenant_id, previous_referrer_id, new_referrer_id, actor_id)
    values (p_tenant, previous, p_referrer, (select auth.uid()));
end;
$$;
revoke all on function public.superadmin_company_referral(uuid),
  public.superadmin_set_company_referral(uuid, uuid, uuid) from public, anon;
grant execute on function public.superadmin_company_referral(uuid),
  public.superadmin_set_company_referral(uuid, uuid, uuid) to authenticated;
notify pgrst, 'reload schema';