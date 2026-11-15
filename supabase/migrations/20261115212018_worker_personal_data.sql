-- Personal details are tenant-scoped and visible only to company administrators.
create table public.worker_personal_data (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  dni text not null check (char_length(btrim(dni)) between 1 and 40 and dni = btrim(dni)),
  phone text not null default '' check (char_length(phone) <= 40 and phone = btrim(phone)),
  primary key (tenant_id, worker_id)
);
alter table public.worker_personal_data enable row level security;
revoke all on public.worker_personal_data from public, anon, authenticated;
grant select on public.worker_personal_data to authenticated;
create policy worker_personal_data_read on public.worker_personal_data for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin']::public.app_role[]));

create function public.save_worker_personal_data(p_tenant_id uuid, p_worker_id uuid, p_dni text, p_phone text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_role(p_tenant_id, array['owner','admin']::public.app_role[])
    or not public.tenant_can_write(p_tenant_id) then
    raise exception 'No tienes permiso para guardar datos personales' using errcode = '42501';
  end if;
  if p_dni is null or char_length(btrim(p_dni)) not between 1 and 40
    or p_phone is null or char_length(btrim(p_phone)) > 40
    or not exists (select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = p_worker_id) then
    raise exception 'Datos personales o trabajador no válidos' using errcode = '22023';
  end if;
  insert into public.worker_personal_data (tenant_id, worker_id, dni, phone)
    values (p_tenant_id, p_worker_id, btrim(p_dni), btrim(p_phone))
    on conflict (tenant_id, worker_id) do update set dni = excluded.dni, phone = excluded.phone;
end;
$$;
revoke all on function public.save_worker_personal_data(uuid,uuid,text,text) from public, anon;
grant execute on function public.save_worker_personal_data(uuid,uuid,text,text) to authenticated;

-- The service-only operation makes the membership and personal data atomic.
create function public.register_invited_worker(p_tenant_id uuid, p_worker_id uuid, p_inviter_id uuid, p_role text, p_dni text, p_phone text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_role not in ('admin','user') or p_role is null or p_dni is null
    or char_length(btrim(p_dni)) not between 1 and 40 or p_phone is null
    or char_length(btrim(p_phone)) > 40 then
    raise exception 'Datos personales no válidos' using errcode = '22023';
  end if;
  perform 1 from public.tenants where id = p_tenant_id for update;
  if not found or not public.tenant_can_write(p_tenant_id)
    or not exists (select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = p_inviter_id and m.role = 'admin') then
    raise exception 'No tienes permiso para invitar' using errcode = '42501';
  end if;
  if exists (select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = p_worker_id) then
    raise exception 'La persona ya pertenece al equipo' using errcode = '23505';
  end if;
  insert into public.memberships (tenant_id, user_id, role, invited_by)
    values (p_tenant_id, p_worker_id, p_role::public.app_role, p_inviter_id);
  insert into public.worker_personal_data (tenant_id, worker_id, dni, phone)
    values (p_tenant_id, p_worker_id, btrim(p_dni), btrim(p_phone))
    on conflict (tenant_id, worker_id) do update set dni = excluded.dni, phone = excluded.phone;
end;
$$;
revoke all on function public.register_invited_worker(uuid,uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.register_invited_worker(uuid,uuid,uuid,text,text,text) to service_role;