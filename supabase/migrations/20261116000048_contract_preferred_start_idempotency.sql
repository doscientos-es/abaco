-- Contract events are immutable. Store the extra idempotency value separately.
create table app_private.contract_preferred_start_operations (
  operation_id uuid primary key references public.service_contract_events(operation_id),
  preferred_start time not null
);
revoke all on app_private.contract_preferred_start_operations from public,anon,authenticated,service_role;

create or replace function public.update_contract_general_details(p_tenant_id uuid,p_contract_id uuid,
  p_expected_updated_at timestamptz,p_starts_on date,p_ends_on date,p_renewal_mode text,
  p_notes text,p_location_id uuid,p_assigned_user_ids uuid[],p_work_team_id uuid,p_operation_id uuid,
  p_preferred_start time) returns uuid language plpgsql security definer set search_path='' as $$
declare prior public.service_contract_events%rowtype; c public.service_contracts%rowtype; result uuid; previous_time time;
begin
  if auth.uid() is null or not public.has_role(p_tenant_id,array['owner','admin','editor']::public.app_role[])
    or not public.tenant_can_write(p_tenant_id) then raise exception 'No tienes permiso' using errcode='42501'; end if;
  if p_preferred_start is null or p_preferred_start >= '24:00'::time or extract(second from p_preferred_start) <> 0 then
    raise exception 'Indica una hora preferente válida' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text,31));
  select * into c from public.service_contracts where id=p_contract_id and tenant_id=p_tenant_id for update;
  select * into prior from public.service_contract_events where operation_id=p_operation_id;
  if found then
    select preferred_start into previous_time from app_private.contract_preferred_start_operations where operation_id=p_operation_id;
    if previous_time is distinct from p_preferred_start then
      raise exception 'Operación utilizada' using errcode='23505'; end if;
  end if;
  if prior.operation_id is null and c.status='active' and c.preferred_start is distinct from p_preferred_start then
    raise exception 'La hora preferente solo se puede editar en borrador' using errcode='P0409'; end if;
  result:=public.update_contract_general_details(p_tenant_id,p_contract_id,p_expected_updated_at,
    p_starts_on,p_ends_on,p_renewal_mode,p_notes,p_location_id,p_assigned_user_ids,p_work_team_id,p_operation_id);
  if prior.operation_id is null then
    update public.service_contracts set preferred_start=p_preferred_start where id=p_contract_id and tenant_id=p_tenant_id;
    insert into app_private.contract_preferred_start_operations(operation_id,preferred_start) values(p_operation_id,p_preferred_start);
  end if;
  return result;
end;
$$;