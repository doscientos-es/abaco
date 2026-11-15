-- A missing row represents the default allowance, without requiring personal data.
create table public.worker_vacation_allowances (
  tenant_id uuid not null,
  worker_id uuid not null,
  annual_days smallint not null default 23 check (annual_days between 0 and 366),
  primary key (tenant_id, worker_id),
  foreign key (tenant_id, worker_id) references public.memberships (tenant_id, user_id) on delete cascade
);

alter table public.worker_vacation_allowances enable row level security;
revoke all on public.worker_vacation_allowances from public, anon, authenticated;
grant select on public.worker_vacation_allowances to authenticated;
create policy worker_vacation_allowances_read on public.worker_vacation_allowances
  for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin']::public.app_role[]));

create function public.save_worker_vacation_allowance(p_tenant_id uuid, p_worker_id uuid, p_annual_days integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_role(p_tenant_id, array['owner','admin']::public.app_role[])
    or not public.tenant_can_write(p_tenant_id) then
    raise exception 'No tienes permiso para guardar vacaciones' using errcode = '42501';
  end if;
  if p_annual_days is null or p_annual_days not between 0 and 366
    or not exists (select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = p_worker_id) then
    raise exception 'Cupo o trabajador no válido' using errcode = '22023';
  end if;
  insert into public.worker_vacation_allowances (tenant_id, worker_id, annual_days)
    values (p_tenant_id, p_worker_id, p_annual_days)
    on conflict (tenant_id, worker_id) do update set annual_days = excluded.annual_days;
end;
$$;
revoke all on function public.save_worker_vacation_allowance(uuid,uuid,integer) from public, anon;
grant execute on function public.save_worker_vacation_allowance(uuid,uuid,integer) to authenticated;