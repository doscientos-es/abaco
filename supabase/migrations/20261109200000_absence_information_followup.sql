-- Let admins ask for missing absence details and workers respond without storing medical diagnoses.
alter table public.absence_requests
  drop constraint vacation_requests_status_check,
  drop constraint vacation_requests_check1,
  add column information_request_comment text not null default ''
    check (char_length(information_request_comment) <= 1000),
  add column information_requested_at timestamptz,
  add column information_requested_by uuid references public.profiles(id) on delete restrict,
  add column information_requested_by_name text not null default ''
    check (char_length(information_requested_by_name) <= 160),
  add column requester_response_comment text not null default ''
    check (char_length(requester_response_comment) <= 1000),
  add column requester_responded_at timestamptz,
  add constraint absence_requests_status_check
    check (status in ('pending', 'needs_info', 'approved', 'rejected')),
  add constraint absence_requests_decision_consistency_check check (
    (status = 'pending' and decided_by is null and decided_by_name = '' and decided_at is null and decision_comment = '')
    or (status in ('approved', 'rejected') and decided_by is not null
      and char_length(decided_by_name) > 0 and decided_at is not null)
    or (status = 'needs_info' and information_requested_by is not null
      and char_length(information_requested_by_name) > 0 and information_requested_at is not null
      and char_length(information_request_comment) > 0)
  );

alter table public.vacation_decision_notifications
  drop constraint vacation_decision_notifications_decision_check,
  drop constraint vacation_decision_notifications_request_id_key,
  add constraint absence_notifications_decision_check
    check (decision in ('approved', 'rejected', 'needs_info'));

create or replace function public.record_vacation_decision_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (old.status = 'pending' and new.status in ('approved', 'rejected', 'needs_info'))
    or (old.status = 'needs_info' and new.status = 'needs_info') then
    insert into public.vacation_decision_notifications (tenant_id, request_id, recipient_id, decision)
    values (new.tenant_id, new.id, new.requester_id, new.status);
  end if;
  return new;
end;
$$;

create or replace function public.request_absence_information(
  p_tenant_id uuid, p_request_id uuid, p_comment text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  target public.absence_requests%rowtype;
  clean_comment text := pg_catalog.btrim(coalesce(p_comment, ''));
  admin_name text;
begin
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para gestionar ausencias' using errcode = '42501';
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede gestionar ausencias' using errcode = 'P0402';
  end if;
  if clean_comment = '' or pg_catalog.char_length(clean_comment) > 1000 then
    raise exception 'Indica qué información hace falta' using errcode = '22023';
  end if;
  select * into target from public.absence_requests
    where id = p_request_id and tenant_id = p_tenant_id for update;
  if not found or target.status not in ('pending', 'needs_info') then
    raise exception 'La solicitud ya no admite peticiones de información' using errcode = 'P0409';
  end if;
  select pg_catalog.left(coalesce(nullif(pg_catalog.btrim(p.full_name), ''), p.email), 160)
    into admin_name from public.profiles p where p.id = (select auth.uid());
  if admin_name is null or admin_name = '' then
    raise exception 'No se encontró el perfil de administración' using errcode = 'P0002';
  end if;
  update public.absence_requests set
    status = 'needs_info', information_request_comment = clean_comment,
    information_requested_at = clock_timestamp(), information_requested_by = (select auth.uid()),
    information_requested_by_name = admin_name,
    requester_response_comment = '', requester_responded_at = null
  where id = target.id and tenant_id = p_tenant_id;
  return target.id;
end;
$$;
revoke all on function public.request_absence_information(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.request_absence_information(uuid, uuid, text)
  to authenticated;

create function public.respond_absence_information(
  p_tenant_id uuid, p_request_id uuid, p_comment text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  target public.absence_requests%rowtype;
  clean_comment text := pg_catalog.btrim(coalesce(p_comment, ''));
begin
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['technician', 'user']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para responder a la solicitud' using errcode = '42501';
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede gestionar ausencias' using errcode = 'P0402';
  end if;
  if clean_comment = '' or pg_catalog.char_length(clean_comment) > 1000 then
    raise exception 'Escribe la información solicitada' using errcode = '22023';
  end if;
  select * into target from public.absence_requests
    where id = p_request_id and tenant_id = p_tenant_id for update;
  if not found or target.requester_id <> (select auth.uid()) or target.status <> 'needs_info' then
    raise exception 'La solicitud no está esperando información tuya' using errcode = 'P0409';
  end if;
  update public.absence_requests set
    status = 'pending', requester_response_comment = clean_comment,
    requester_responded_at = clock_timestamp()
  where id = target.id and tenant_id = p_tenant_id;
  return target.id;
end;
$$;
revoke all on function public.respond_absence_information(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.respond_absence_information(uuid, uuid, text)
  to authenticated;
