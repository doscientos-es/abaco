-- Company-specific client types retain stable values when their labels change.
create table public.client_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  value text not null check (char_length(value) between 1 and 80),
  label text not null check (label = btrim(label) and char_length(label) between 1 and 80),
  position integer not null default 0 check (position between 0 and 1000000),
  unique (tenant_id, value)
);

create unique index client_types_tenant_label_unique
  on public.client_types (tenant_id, lower(label));

insert into public.client_types (tenant_id, value, label, position)
select t.id, defaults.value, defaults.label, defaults.position
from public.tenants t
cross join (values ('person', 'Particular', 1), ('community', 'Comunidad', 2),
  ('business', 'Empresa', 3)) as defaults(value, label, position);

create function public.seed_client_types() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.client_types (tenant_id, value, label, position) values
    (new.id, 'person', 'Particular', 1),
    (new.id, 'community', 'Comunidad', 2),
    (new.id, 'business', 'Empresa', 3);
  return new;
end;
$$;
revoke all on function public.seed_client_types() from public, anon, authenticated;
create trigger tenant_seed_client_types after insert on public.tenants
  for each row execute function public.seed_client_types();

alter table public.clients drop constraint clients_kind_check;
alter table public.clients add constraint clients_client_type_fkey
  foreign key (tenant_id, kind) references public.client_types (tenant_id, value);

-- Imports and other callers that omit a type use the first configured option.
alter table public.clients alter column kind drop default;
create function public.default_client_type() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind is null then
    select value into new.kind from public.client_types
    where tenant_id = new.tenant_id order by position, id limit 1 for key share;
    if new.kind is null then
      raise exception 'Añade un tipo de cliente antes de crear clientes' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.default_client_type() from public, anon, authenticated;
create trigger clients_default_type before insert on public.clients
  for each row execute function public.default_client_type();

alter table public.client_types enable row level security;
revoke all on public.client_types from public, anon, authenticated;
grant select, insert, delete on public.client_types to authenticated;
grant update (label, position) on public.client_types to authenticated;
create policy client_types_select on public.client_types for select to authenticated
  using (public.has_role(tenant_id, array['admin']::public.app_role[]));
create policy client_types_insert on public.client_types for insert to authenticated
  with check (public.has_role(tenant_id, array['admin']::public.app_role[]));
create policy client_types_update on public.client_types for update to authenticated
  using (public.has_role(tenant_id, array['admin']::public.app_role[]))
  with check (public.has_role(tenant_id, array['admin']::public.app_role[]));
create policy client_types_delete on public.client_types for delete to authenticated
  using (public.has_role(tenant_id, array['admin']::public.app_role[]));

-- Reordering is one transaction; values and client references never change.
create function public.move_client_type(target_tenant uuid, target_id uuid, direction integer)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if direction not in (-1, 1) or not public.has_role(target_tenant, array['admin']::public.app_role[]) then
    raise exception 'No tienes permiso para ordenar los tipos de cliente' using errcode = '42501';
  end if;
  perform 1 from public.client_types where tenant_id = target_tenant order by id for update;
  with ranked as (
    select id, row_number() over (order by position, id)::integer as n
    from public.client_types where tenant_id = target_tenant
  ), selected as (select n from ranked where id = target_id)
  update public.client_types c set position = case
    when ranked.n = selected.n then selected.n + direction
    when ranked.n = selected.n + direction then selected.n
    else ranked.n end
  from ranked, selected
  where c.id = ranked.id and selected.n + direction between 1 and (select count(*) from ranked);
end;
$$;
revoke all on function public.move_client_type(uuid, uuid, integer) from public, anon;
grant execute on function public.move_client_type(uuid, uuid, integer) to authenticated;
