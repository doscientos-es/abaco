-- A separate editorial surface, with no backfill from access_notes, contacts or visit notes.
create table public.service_location_staff_arrival (
  tenant_id uuid not null,
  location_id uuid not null,
  instructions text not null default '' check (char_length(instructions) <= 600),
  parking text not null default '' check (char_length(parking) <= 400),
  contact_label text not null default '' check (char_length(contact_label) <= 120),
  contact_phone text not null default ''
    check (contact_phone = '' or contact_phone ~ '^[+][1-9][0-9]{6,14}$'),
  share_directions boolean not null default false,
  share_contact boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (location_id, tenant_id),
  foreign key (location_id, tenant_id) references public.service_locations (id, tenant_id)
    on delete cascade,
  check (not share_directions or btrim(instructions) <> '' or btrim(parking) <> ''),
  check (not share_contact or contact_phone <> '')
);

alter table public.service_location_staff_arrival enable row level security;
revoke all on public.service_location_staff_arrival from public, anon, authenticated;
grant select on public.service_location_staff_arrival to authenticated;
grant insert (tenant_id, location_id, instructions, parking, contact_label, contact_phone,
  share_directions, share_contact) on public.service_location_staff_arrival to authenticated;
grant update (instructions, parking, contact_label, contact_phone, share_directions, share_contact)
  on public.service_location_staff_arrival to authenticated;

create policy service_location_staff_arrival_select on public.service_location_staff_arrival
  for select to authenticated using (
    (select auth.uid()) is not null
    and public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
  );
create policy service_location_staff_arrival_insert on public.service_location_staff_arrival
  for insert to authenticated with check (
    (select auth.uid()) is not null
    and public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
    and public.tenant_can_write(tenant_id)
  );
create policy service_location_staff_arrival_update on public.service_location_staff_arrival
  for update to authenticated using (
    (select auth.uid()) is not null
    and public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
    and public.tenant_can_write(tenant_id)
  ) with check (
    (select auth.uid()) is not null
    and public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
    and public.tenant_can_write(tenant_id)
  );
create trigger service_location_staff_arrival_touch
  before update on public.service_location_staff_arrival
  for each row execute function public.touch_updated_at();

-- A dedicated unexposed schema prevents opening the existing app_private namespace.
create schema arrival_private;
revoke all on schema arrival_private from public, anon, authenticated;
grant usage on schema arrival_private to authenticated;

create function arrival_private.list_worker_payload(p_tenant_id uuid, p_visit_ids uuid[])
returns table (visit_id uuid, instructions text, parking text, contact_label text, contact_phone text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or p_tenant_id is null or not public.has_role(
    p_tenant_id, array['technician', 'user']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para consultar la llegada' using errcode = '42501';
  end if;
  if p_visit_ids is null or pg_catalog.cardinality(p_visit_ids) > 50 then
    raise exception 'Lista de visitas inválida' using errcode = '22023';
  end if;

  return query
    select v.id,
      case when a.share_directions then nullif(pg_catalog.btrim(a.instructions), '') end,
      case when a.share_directions then nullif(pg_catalog.btrim(a.parking), '') end,
      case when a.share_contact then nullif(pg_catalog.btrim(a.contact_label), '') end,
      case when a.share_contact then a.contact_phone end
    from public.service_visits v
    join public.service_locations l
      on l.id = v.location_id and l.tenant_id = v.tenant_id and l.active
    join public.service_location_staff_arrival a
      on a.location_id = l.id and a.tenant_id = l.tenant_id
    where v.tenant_id = p_tenant_id and v.id = any(p_visit_ids)
      and v.status in ('scheduled', 'in_progress')
      and public.can_access_assigned_visit(v.tenant_id, v.id)
      and (a.share_directions or a.share_contact);
end;
$$;
revoke all on function arrival_private.list_worker_payload(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function arrival_private.list_worker_payload(uuid, uuid[]) to authenticated;

create function public.list_assigned_visit_arrivals(p_tenant_id uuid, p_visit_ids uuid[])
returns table (visit_id uuid, instructions text, parking text, contact_label text, contact_phone text)
language sql stable security invoker set search_path = '' as $$
  select payload.visit_id, payload.instructions, payload.parking, payload.contact_label,
    payload.contact_phone
  from arrival_private.list_worker_payload(p_tenant_id, p_visit_ids) payload;
$$;
revoke all on function public.list_assigned_visit_arrivals(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.list_assigned_visit_arrivals(uuid, uuid[]) to authenticated;
