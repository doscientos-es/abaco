-- Existing and newly connected calendars keep their generic events until opt-in.
alter table public.google_calendar_connections
  add column details_consent_at timestamptz;

create function app_private.reset_google_calendar_details_consent() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status in ('disconnected', 'provisioning') then
    new.details_consent_at := null;
  end if;
  return new;
end;
$$;
revoke all on function app_private.reset_google_calendar_details_consent()
  from public, anon, authenticated, service_role;
create trigger google_calendar_reset_details_consent
  before insert or update of status on public.google_calendar_connections
  for each row execute function app_private.reset_google_calendar_details_consent();

create function public.my_google_calendar_details_consent(p_tenant_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_google_calendar_member(p_tenant_id, auth.uid()) then
    raise exception 'No tienes permiso para consultar este calendario' using errcode = '42501';
  end if;
  return exists (select 1 from public.google_calendar_connections c
    where c.tenant_id = p_tenant_id and c.user_id = auth.uid()
      and c.status = 'connected' and c.details_consent_at is not null);
end;
$$;
revoke all on function public.my_google_calendar_details_consent(uuid) from public, anon;
grant execute on function public.my_google_calendar_details_consent(uuid) to authenticated;

create function public.accept_google_calendar_details(p_tenant_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.authorize_google_calendar_actor(p_tenant_id, auth.uid()) then
    raise exception 'No tienes permiso para sincronizar este calendario' using errcode = '42501';
  end if;
  update public.google_calendar_connections set details_consent_at = clock_timestamp(),
    updated_at = clock_timestamp()
    where tenant_id = p_tenant_id and user_id = auth.uid() and status = 'connected'
      and details_consent_at is null;
  if found then
    perform public.queue_my_google_calendar_sync(p_tenant_id);
  elsif not exists (select 1 from public.google_calendar_connections c
    where c.tenant_id = p_tenant_id and c.user_id = auth.uid()
      and c.status = 'connected' and c.details_consent_at is not null) then
    raise exception 'Conecta Google Calendar antes de aceptar' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.accept_google_calendar_details(uuid) from public, anon;
grant execute on function public.accept_google_calendar_details(uuid) to authenticated;
notify pgrst, 'reload schema';