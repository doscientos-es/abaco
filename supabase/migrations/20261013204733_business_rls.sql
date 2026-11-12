-- RLS de los datos de negocio. Repite la matriz de src/features/auth/domain/permissions.ts:
--   lectura clientes/catálogo/presupuestos: owner, admin, editor, viewer
--   escritura clientes/catálogo/presupuestos: owner, admin, editor
--   facturas: lectura owner/admin/editor, escritura owner/admin
--   contabilidad: lectura y escritura solo owner/admin
-- Sin sesión (anon) no hay acceso a nada.

-- ---------------------------------------------------------------- triggers

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- La empresa de una fila nunca cambia: evita "mover" datos a otra empresa con un UPDATE.
create function public.lock_tenant_id() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'tenant_id no se puede modificar';
  end if;
  return new;
end;
$$;

-- Número correlativo por empresa, atómico (el UPDATE bloquea la fila del tenant).
create function public.assign_estimate_number() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  seq integer;
begin
  update public.tenants set next_estimate_number = next_estimate_number + 1
  where id = new.tenant_id
  returning next_estimate_number - 1 into seq;
  new.number = 'P-' || extract(year from now())::int || '-' || lpad(seq::text, 3, '0');
  return new;
end;
$$;

create function public.assign_invoice_number() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  seq integer;
begin
  update public.tenants set next_invoice_number = next_invoice_number + 1
  where id = new.tenant_id
  returning next_invoice_number - 1 into seq;
  new.number = 'F-' || extract(year from now())::int || '-' || lpad(seq::text, 3, '0');
  return new;
end;
$$;

create trigger estimates_assign_number before insert on public.estimates
  for each row execute function public.assign_estimate_number();
create trigger invoices_assign_number before insert on public.invoices
  for each row execute function public.assign_invoice_number();

create trigger tenants_touch before update on public.tenants
  for each row execute function public.touch_updated_at();

do $$
declare
  t text;
begin
  foreach t in array array['clients', 'catalog_items', 'estimates', 'ledger_entries', 'invoices'] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
      t || '_touch', t);
  end loop;
  foreach t in array array[
    'clients', 'catalog_items', 'estimates', 'estimate_lines',
    'estimate_milestones', 'ledger_entries', 'invoices'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.lock_tenant_id()',
      t || '_lock_tenant', t);
  end loop;
end $$;

-- Los contadores de numeración solo los mueven los triggers, no los ajustes del usuario.
create function public.protect_tenant_counters() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user = 'authenticated' and (
    new.next_estimate_number is distinct from old.next_estimate_number
    or new.next_invoice_number is distinct from old.next_invoice_number
  ) then
    raise exception 'La numeración se gestiona automáticamente';
  end if;
  return new;
end;
$$;

create trigger tenants_protect_counters before update on public.tenants
  for each row execute function public.protect_tenant_counters();

-- ---------------------------------------------------------------- RLS

alter table public.clients enable row level security;
alter table public.catalog_items enable row level security;
alter table public.estimates enable row level security;
alter table public.estimate_lines enable row level security;
alter table public.estimate_milestones enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.invoices enable row level security;

-- Lectura abierta a todo el equipo; escritura para owner/admin/editor.
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'catalog_items', 'estimates', 'estimate_lines', 'estimate_milestones'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_member(tenant_id))',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.has_role(tenant_id, array[''owner'',''admin'',''editor'']::public.app_role[]))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.has_role(tenant_id, array[''owner'',''admin'',''editor'']::public.app_role[])) with check (public.has_role(tenant_id, array[''owner'',''admin'',''editor'']::public.app_role[]))',
      t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.has_role(tenant_id, array[''owner'',''admin'',''editor'']::public.app_role[]))',
      t || '_delete', t);
  end loop;
end $$;

-- Facturas: las ve el editor, solo owner/admin las crean o cambian.
create policy invoices_select on public.invoices for select to authenticated
  using (public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[]));
create policy invoices_insert on public.invoices for insert to authenticated
  with check (public.has_role(tenant_id, array['owner', 'admin']::public.app_role[]));
create policy invoices_update on public.invoices for update to authenticated
  using (public.has_role(tenant_id, array['owner', 'admin']::public.app_role[]))
  with check (public.has_role(tenant_id, array['owner', 'admin']::public.app_role[]));
create policy invoices_delete on public.invoices for delete to authenticated
  using (public.has_role(tenant_id, array['owner', 'admin']::public.app_role[]));

-- Contabilidad: solo owner/admin, para todo.
create policy ledger_entries_all on public.ledger_entries for all to authenticated
  using (public.has_role(tenant_id, array['owner', 'admin']::public.app_role[]))
  with check (public.has_role(tenant_id, array['owner', 'admin']::public.app_role[]));

-- Ningún acceso anónimo; los permisos de tabla del rol authenticated los acota RLS.
revoke all on public.clients, public.catalog_items, public.estimates, public.estimate_lines,
  public.estimate_milestones, public.ledger_entries, public.invoices from anon;

-- ---------------------------------------------------------------- alta de empresa

-- Crea una empresa y su primer propietario. Solo el backend (service role) puede llamarla:
--   select public.create_tenant_with_owner('Reformas Abderrahim', '<uuid del usuario en auth.users>');
create function public.create_tenant_with_owner(p_name text, p_owner uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_tenant uuid;
begin
  insert into public.tenants (name) values (p_name) returning id into new_tenant;
  insert into public.memberships (tenant_id, user_id, role) values (new_tenant, p_owner, 'owner');
  return new_tenant;
end;
$$;

revoke all on function public.create_tenant_with_owner(text, uuid) from public, anon, authenticated;
grant execute on function public.create_tenant_with_owner(text, uuid) to service_role;
