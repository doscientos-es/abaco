-- Cualquier usuario con sesión puede crear su propia empresa y queda como propietario.
-- Un usuario puede pertenecer a varias empresas (memberships tiene una fila por empresa).
-- El resto de miembros entran por invitación (función invite-member).
create function public.create_company(p_name text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  new_tenant uuid;
begin
  if uid is null then
    raise exception 'Hace falta iniciar sesión';
  end if;
  if char_length(trim(p_name)) not between 1 and 120 then
    raise exception 'El nombre de la empresa debe tener entre 1 y 120 caracteres';
  end if;
  -- Freno sencillo contra abuso: máximo 10 empresas propias por usuario.
  if (select count(*) from public.memberships where user_id = uid and role = 'owner') >= 10 then
    raise exception 'Has alcanzado el máximo de empresas';
  end if;
  insert into public.tenants (name) values (trim(p_name)) returning id into new_tenant;
  insert into public.memberships (tenant_id, user_id, role) values (new_tenant, uid, 'owner');
  return new_tenant;
end;
$$;

revoke all on function public.create_company(text) from public, anon;
grant execute on function public.create_company(text) to authenticated;
