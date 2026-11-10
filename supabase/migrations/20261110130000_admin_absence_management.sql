alter table public.absence_requests
  drop constraint absence_requests_status_check,
  drop constraint absence_requests_decision_consistency_check,
  add column updated_at timestamptz not null default clock_timestamp(),
  add constraint absence_requests_status_check check(status in ('pending','needs_info','approved','rejected','canceled')),
  add constraint absence_requests_decision_consistency_check check(
    (status = 'pending' and decided_by is null and decided_by_name = '' and decided_at is null and decision_comment = '')
    or (status in ('approved','rejected','canceled') and decided_by is not null and decided_by_name <> '' and decided_at is not null)
    or (status = 'needs_info' and information_requested_by is not null and information_requested_by_name <> '' and information_requested_at is not null and information_request_comment <> '')
  );
create trigger absence_requests_version before update on public.absence_requests
  for each row execute function public.touch_service_visit_version();

create table public.absence_request_history(
  id uuid primary key default gen_random_uuid(),tenant_id uuid not null,request_id uuid not null,
  before_state jsonb,after_state jsonb not null,actor_id uuid references public.profiles(id),
  occurred_at timestamptz not null default clock_timestamp(),
  foreign key(request_id,tenant_id) references public.absence_requests(id,tenant_id)
);
alter table public.absence_request_history enable row level security;
revoke all on public.absence_request_history from public,anon,authenticated;
grant select on public.absence_request_history to authenticated;
create policy absence_history_read on public.absence_request_history for select to authenticated using(
  public.has_role(tenant_id,array['owner','admin']::public.app_role[]) or exists(
    select 1 from public.absence_requests r where r.id = request_id and r.tenant_id = absence_request_history.tenant_id and r.requester_id = auth.uid()));
create trigger absence_history_immutable before update or delete on public.absence_request_history
  for each row execute function public.reject_work_history_change();
create function app_private.record_absence_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.absence_request_history(tenant_id,request_id,before_state,after_state,actor_id)
    values(new.tenant_id,new.id,case when tg_op = 'UPDATE' then to_jsonb(old) else null end,to_jsonb(new),auth.uid());
  return new;
end;
$$;
revoke all on function app_private.record_absence_history() from public,anon,authenticated;
create trigger absence_requests_history after insert or update on public.absence_requests
  for each row execute function app_private.record_absence_history();

create table public.absence_admin_operations(
  id uuid primary key,tenant_id uuid not null references public.tenants(id),request_id uuid not null,
  payload jsonb not null,created_at timestamptz not null default clock_timestamp()
);
alter table public.absence_admin_operations enable row level security;
revoke all on public.absence_admin_operations from public,anon,authenticated;

create function public.save_administrative_absence(p_tenant_id uuid,p_request_id uuid,p_expected_updated_at timestamptz,p_absence jsonb,p_operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.absence_requests%rowtype; prior public.absence_admin_operations%rowtype;
  person uuid := (p_absence->>'requester_id')::uuid;
  first_day date := (p_absence->>'start_date')::date; last_day date := nullif(p_absence->>'end_date','')::date;
  next_status text := p_absence->>'status'; kind text := p_absence->>'absence_type';
  person_name text; admin_name text; result_id uuid := coalesce(p_request_id,gen_random_uuid());
begin
  if auth.uid() is null or not public.has_role(p_tenant_id,array['owner','admin']::public.app_role[])
    then raise exception 'No tienes permiso para gestionar ausencias' using errcode = '42501'; end if;
  if not public.tenant_can_write(p_tenant_id) then raise exception 'Empresa no disponible' using errcode = 'P0402'; end if;
  if p_operation_id is null then raise exception 'Falta operación' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
  select * into prior from public.absence_admin_operations where id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.payload is distinct from p_absence or (p_request_id is not null and prior.request_id <> p_request_id)
      then raise exception 'Operación utilizada' using errcode = '23505'; end if;
    return prior.request_id;
  end if;
  if first_day is null or (last_day is not null and last_day < first_day) or kind is null or next_status is null
    or kind not in ('vacation','personal_leave','sick_leave','other') or next_status not in ('pending','needs_info','approved','rejected','canceled')
    or length(coalesce(p_absence->>'comment','')) > 1000 or length(coalesce(p_absence->>'decision_comment','')) > 1000
    then raise exception 'Periodo, tipo o estado inválidos' using errcode = '22023'; end if;
  select left(coalesce(nullif(p.full_name,''),p.email),160) into person_name from public.profiles p
    join public.memberships m on m.user_id = p.id where m.tenant_id = p_tenant_id and m.user_id = person;
  if person_name is null then raise exception 'Empleado no disponible en esta empresa' using errcode = '22023'; end if;
  select left(coalesce(nullif(full_name,''),email),160) into admin_name from public.profiles where id = auth.uid();
  if p_request_id is not null then
    select * into r from public.absence_requests where id = p_request_id and tenant_id = p_tenant_id for update;
    if not found or p_expected_updated_at is null or r.updated_at <> p_expected_updated_at
      then raise exception 'El periodo cambió; vuelve a cargarlo' using errcode = 'P0409'; end if;
    if next_status = 'needs_info' and r.status <> 'needs_info'
      then raise exception 'Solicita información antes de usar este estado' using errcode = '22023'; end if;
    update public.absence_requests set requester_id = person,requester_name = person_name,start_date = first_day,end_date = last_day,
      absence_type = kind,requester_comment = coalesce(p_absence->>'comment',''),status = next_status,
      decided_by = case when next_status in ('approved','rejected','canceled') then auth.uid() end,
      decided_by_name = case when next_status in ('approved','rejected','canceled') then admin_name else '' end,
      decided_at = case when next_status in ('approved','rejected','canceled') then clock_timestamp() end,
      decision_comment = case when next_status in ('approved','rejected','canceled') then coalesce(p_absence->>'decision_comment','') else '' end
      where id = r.id;
  else
    if next_status = 'needs_info' then raise exception 'Solicita información antes de usar este estado' using errcode = '22023'; end if;
    insert into public.absence_requests(id,tenant_id,requester_id,requester_name,start_date,end_date,absence_type,requester_comment,status,
      decided_by,decided_by_name,decided_at,decision_comment)
      values(result_id,p_tenant_id,person,person_name,first_day,last_day,kind,coalesce(p_absence->>'comment',''),next_status,
        case when next_status <> 'pending' then auth.uid() end,case when next_status <> 'pending' then admin_name else '' end,
        case when next_status <> 'pending' then clock_timestamp() end,case when next_status <> 'pending' then coalesce(p_absence->>'decision_comment','') else '' end);
  end if;
  insert into public.absence_admin_operations(id,tenant_id,request_id,payload) values(p_operation_id,p_tenant_id,result_id,p_absence);
  return result_id;
end;
$$;
revoke all on function public.save_administrative_absence(uuid,uuid,timestamptz,jsonb,uuid) from public,anon;
grant execute on function public.save_administrative_absence(uuid,uuid,timestamptz,jsonb,uuid) to authenticated;