-- Staff is included in the trial and every multi-user plan. A scheduled plan
-- change has no effect until the actual plan changes; no staff data is deleted.
create function public.can_use_staff(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tenants t
    join public.memberships m on m.tenant_id = t.id
    where t.id = p_tenant and m.user_id = (select auth.uid())
      and t.plan in ('trial', 'team', 'business', 'scale')
  );
$$;
revoke all on function public.can_use_staff(uuid) from public, anon;
grant execute on function public.can_use_staff(uuid) to authenticated;

-- Preserve existing role policies while requiring the plan for staff-only data.
create policy staff_functions_require_plan on public.staff_functions as restrictive for all to authenticated
  using (public.can_use_staff(tenant_id)) with check (public.can_use_staff(tenant_id));
create policy worker_personal_data_require_plan on public.worker_personal_data as restrictive for select to authenticated
  using (public.can_use_staff(tenant_id));
create policy worker_documents_require_plan on public.worker_documents as restrictive for select to authenticated
  using (public.can_use_staff(tenant_id));
create policy worker_vacation_allowances_require_plan on public.worker_vacation_allowances as restrictive for select to authenticated
  using (public.can_use_staff(tenant_id));

-- The storage policy also covers uploaded objects not yet registered in the table.
create policy worker_documents_objects_require_plan on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'worker-documents' or exists (
    select 1 from public.tenants t where t.id::text = (storage.foldername(name))[1]
      and public.can_use_staff(t.id)
  ))
  with check (bucket_id <> 'worker-documents' or exists (
    select 1 from public.tenants t where t.id::text = (storage.foldername(name))[1]
      and public.can_use_staff(t.id)
  ));

-- These RPCs bypass RLS. Keep their existing validation behind gated entry points.
alter function public.save_staff_schedule(uuid,uuid,timestamptz,jsonb,uuid[]) set schema app_private;
alter function public.save_worker_personal_data(uuid,uuid,text,text) set schema app_private;
alter function public.save_worker_vacation_allowance(uuid,uuid,integer) set schema app_private;
alter function public.register_worker_document(uuid,uuid,uuid,text) set schema app_private;
revoke all on function app_private.save_staff_schedule(uuid,uuid,timestamptz,jsonb,uuid[]) from public, anon, authenticated;
revoke all on function app_private.save_worker_personal_data(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function app_private.save_worker_vacation_allowance(uuid,uuid,integer) from public, anon, authenticated;
revoke all on function app_private.register_worker_document(uuid,uuid,uuid,text) from public, anon, authenticated;

create function public.save_staff_schedule(p_tenant_id uuid, p_user_id uuid, p_expected_updated_at timestamptz, p_slots jsonb, p_function_ids uuid[])
returns timestamptz language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_use_staff(p_tenant_id) then
    raise exception 'El módulo de trabajadores requiere el plan Equipo o superior' using errcode = '42501';
  end if;
  return app_private.save_staff_schedule(p_tenant_id, p_user_id, p_expected_updated_at, p_slots, p_function_ids);
end;
$$;
create function public.save_worker_personal_data(p_tenant_id uuid, p_worker_id uuid, p_dni text, p_phone text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_use_staff(p_tenant_id) then
    raise exception 'El módulo de trabajadores requiere el plan Equipo o superior' using errcode = '42501';
  end if;
  perform app_private.save_worker_personal_data(p_tenant_id, p_worker_id, p_dni, p_phone);
end;
$$;
create function public.save_worker_vacation_allowance(p_tenant_id uuid, p_worker_id uuid, p_annual_days integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_use_staff(p_tenant_id) then
    raise exception 'El módulo de trabajadores requiere el plan Equipo o superior' using errcode = '42501';
  end if;
  perform app_private.save_worker_vacation_allowance(p_tenant_id, p_worker_id, p_annual_days);
end;
$$;
create function public.register_worker_document(p_tenant_id uuid, p_worker_id uuid, p_id uuid, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_use_staff(p_tenant_id) then
    raise exception 'El módulo de trabajadores requiere el plan Equipo o superior' using errcode = '42501';
  end if;
  perform app_private.register_worker_document(p_tenant_id, p_worker_id, p_id, p_name);
end;
$$;
revoke all on function public.save_staff_schedule(uuid,uuid,timestamptz,jsonb,uuid[]) from public, anon;
revoke all on function public.save_worker_personal_data(uuid,uuid,text,text) from public, anon;
revoke all on function public.save_worker_vacation_allowance(uuid,uuid,integer) from public, anon;
revoke all on function public.register_worker_document(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.save_staff_schedule(uuid,uuid,timestamptz,jsonb,uuid[]) to authenticated;
grant execute on function public.save_worker_personal_data(uuid,uuid,text,text) to authenticated;
grant execute on function public.save_worker_vacation_allowance(uuid,uuid,integer) to authenticated;
grant execute on function public.register_worker_document(uuid,uuid,uuid,text) to authenticated;

notify pgrst, 'reload schema';
