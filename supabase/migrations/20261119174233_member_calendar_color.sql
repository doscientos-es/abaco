alter table public.memberships add column calendar_color text
  check (calendar_color is null or calendar_color in ('forest','blue','violet','rose','amber','teal','indigo','coral'));

create function public.set_member_calendar_color(p_tenant_id uuid, p_user_id uuid, p_color text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_role(p_tenant_id, array['owner','admin']::public.app_role[]) then
    raise exception 'No tienes permiso para gestionar el equipo' using errcode='42501';
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede modificar el equipo' using errcode='P0402';
  end if;
  if p_color is not null and p_color not in ('forest','blue','violet','rose','amber','teal','indigo','coral') then
    raise exception 'Color no válido' using errcode='22023';
  end if;
  update public.memberships set calendar_color=p_color
    where tenant_id=p_tenant_id and user_id=p_user_id;
  if not found then raise exception 'Persona no disponible en esta empresa' using errcode='P0002'; end if;
end;
$$;
revoke all on function public.set_member_calendar_color(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.set_member_calendar_color(uuid,uuid,text) to authenticated;
