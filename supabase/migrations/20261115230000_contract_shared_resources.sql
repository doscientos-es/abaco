-- A contract has one centre and one shared selection of people or a team.
alter table public.service_contracts
  add column assigned_user_ids uuid[] not null default '{}',
  add column work_team_id uuid,
  add constraint service_contract_people_valid check (
    cardinality(assigned_user_ids) <= 30 and array_position(assigned_user_ids, null) is null
    and (work_team_id is null or cardinality(assigned_user_ids) = 0)
  ),
  add constraint service_contract_team_fk foreign key (work_team_id, tenant_id)
    references public.work_teams(id, tenant_id);

-- Existing records are test data. Prefer the first configured job's selection.
update public.service_contracts c set
  location_id = coalesce(c.location_id, (
    select r.location_id from public.service_contract_visit_rules r
    where r.contract_id=c.id and r.tenant_id=c.tenant_id and r.location_id is not null
    order by r.configured desc, r.created_at, r.id limit 1)),
  assigned_user_ids = coalesce((
    select case when r.work_team_id is not null then '{}'::uuid[] else r.assigned_user_ids end
    from public.service_contract_visit_rules r where r.contract_id=c.id and r.tenant_id=c.tenant_id
      and (r.work_team_id is not null or cardinality(r.assigned_user_ids)>0)
    order by r.configured desc, r.created_at, r.id limit 1),
    case when c.default_assigned_user_id is null then '{}'::uuid[] else array[c.default_assigned_user_id] end),
  work_team_id = (
    select r.work_team_id from public.service_contract_visit_rules r
    where r.contract_id=c.id and r.tenant_id=c.tenant_id
      and (r.work_team_id is not null or cardinality(r.assigned_user_ids)>0)
    order by r.configured desc, r.created_at, r.id limit 1);

update public.service_contracts set default_assigned_user_id=assigned_user_ids[1];

create function app_private.inherit_contract_resources() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.service_contracts%rowtype;
begin
  select * into c from public.service_contracts where id=new.contract_id and tenant_id=new.tenant_id;
  if not found then raise exception 'Contrato no encontrado' using errcode='P0002'; end if;
  new.location_id:=c.location_id;
  new.assigned_user_ids:=c.assigned_user_ids;
  new.assigned_user_id:=c.assigned_user_ids[1];
  new.work_team_id:=c.work_team_id;
  return new;
end;
$$;
revoke all on function app_private.inherit_contract_resources() from public,anon,authenticated,service_role;
create trigger contract_jobs_inherit_resources before insert or update of location_id,assigned_user_id,assigned_user_ids,work_team_id
  on public.service_contract_visit_rules for each row execute function app_private.inherit_contract_resources();

-- Bring the existing mock jobs into agreement with their contract, without changing visits.
update public.service_contract_visit_rules r set location_id=c.location_id,
  assigned_user_ids=c.assigned_user_ids,assigned_user_id=c.assigned_user_ids[1],work_team_id=c.work_team_id
  from public.service_contracts c where c.id=r.contract_id and c.tenant_id=r.tenant_id;

create function public.update_contract_general_details(p_tenant_id uuid,p_contract_id uuid,
  p_expected_updated_at timestamptz,p_starts_on date,p_ends_on date,p_renewal_mode text,
  p_notes text,p_location_id uuid,p_assigned_user_ids uuid[],p_work_team_id uuid,p_operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.service_contracts%rowtype; prior public.service_contract_events%rowtype;
  people uuid[]; payload jsonb; zone text;
begin
  if auth.uid() is null or not public.has_role(p_tenant_id,array['owner','admin','editor']::public.app_role[])
    or not public.tenant_can_write(p_tenant_id) then raise exception 'No tienes permiso' using errcode='42501'; end if;
  if p_operation_id is null or p_expected_updated_at is null or p_location_id is null
    or p_assigned_user_ids is null or cardinality(p_assigned_user_ids)>30
    or array_position(p_assigned_user_ids,null) is not null then
    raise exception 'Datos del contrato no válidos' using errcode='22023'; end if;
  select coalesce(array_agg(distinct person order by person),'{}') into people from unnest(p_assigned_user_ids) person;
  if p_work_team_id is not null and cardinality(people)>0 then
    raise exception 'Asigna personas o un equipo, no ambos' using errcode='22023'; end if;
  payload:=jsonb_build_object('starts_on',p_starts_on,'ends_on',p_ends_on,'renewal_mode',p_renewal_mode,
    'notes',p_notes,'location_id',p_location_id,'assigned_user_ids',people,'work_team_id',p_work_team_id);
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text,31));
  select * into c from public.service_contracts where tenant_id=p_tenant_id and id=p_contract_id for update;
  if not found then raise exception 'Contrato no encontrado' using errcode='P0002'; end if;
  select * into prior from public.service_contract_events where operation_id=p_operation_id;
  if found then
    if prior.tenant_id<>p_tenant_id or prior.contract_id<>p_contract_id or prior.kind<>'details_updated'
      or prior.payload->'general_details' is distinct from payload then
      raise exception 'Operación utilizada' using errcode='23505'; end if;
    return c.id;
  end if;
  if c.updated_at is distinct from p_expected_updated_at or c.status not in ('draft','active') then
    raise exception 'Recarga el contrato; no es editable' using errcode='P0409'; end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on<p_starts_on or p_ends_on>p_starts_on+3660
    or p_renewal_mode not in ('pending','manual','automatic') or char_length(coalesce(p_notes,''))>5000 then
    raise exception 'Revisa las fechas y notas del contrato' using errcode='22023'; end if;
  if c.status='active' and (p_starts_on is distinct from c.starts_on or p_ends_on is distinct from c.ends_on
    or p_renewal_mode is distinct from c.renewal_mode or p_notes is distinct from c.notes) then
    raise exception 'La vigencia solo se puede editar en borrador' using errcode='P0409'; end if;
  if exists(select 1 from public.service_contract_visit_rules where contract_id=c.id and configured
    and (anchor_on<p_starts_on or coalesce(ends_on,anchor_on)>p_ends_on)) then
    raise exception 'La vigencia deja trabajos fuera del contrato' using errcode='22023'; end if;
  select timezone into zone from public.service_locations where tenant_id=p_tenant_id and client_id=c.client_id
    and id=p_location_id and active and kind<>'billing';
  if not found then raise exception 'Centro no disponible' using errcode='22023'; end if;
  perform 1 from public.memberships where tenant_id=p_tenant_id and user_id=any(people) order by user_id for share;
  if exists(select 1 from unnest(people) person where not exists(select 1 from public.memberships
    where tenant_id=p_tenant_id and user_id=person and role in ('user','technician'))) then
    raise exception 'Persona no disponible' using errcode='22023'; end if;
  if p_work_team_id is not null and not exists(select 1 from public.work_teams
    where tenant_id=p_tenant_id and id=p_work_team_id and archived_at is null) then
    raise exception 'Equipo no disponible' using errcode='22023'; end if;
  update public.service_contracts set starts_on=p_starts_on,ends_on=p_ends_on,renewal_mode=p_renewal_mode,
    notes=p_notes,location_id=p_location_id,timezone=zone,assigned_user_ids=people,
    default_assigned_user_id=people[1],work_team_id=p_work_team_id where id=c.id and tenant_id=p_tenant_id;
  update public.service_contract_visit_rules set location_id=p_location_id,assigned_user_ids=people,
    assigned_user_id=people[1],work_team_id=p_work_team_id where contract_id=c.id and tenant_id=p_tenant_id;
  insert into public.service_contract_events(operation_id,tenant_id,contract_id,kind,payload,actor_id)
    values(p_operation_id,p_tenant_id,c.id,'details_updated',jsonb_build_object('general_details',payload,
      'before',jsonb_build_object('location_id',c.location_id,'assigned_user_ids',c.assigned_user_ids,
        'work_team_id',c.work_team_id,'starts_on',c.starts_on,'ends_on',c.ends_on,'notes',c.notes)),auth.uid());
  return c.id;
end;
$$;
revoke all on function public.update_contract_general_details(uuid,uuid,timestamptz,date,date,text,text,uuid,uuid[],uuid,uuid) from public,anon;
grant execute on function public.update_contract_general_details(uuid,uuid,timestamptz,date,date,text,text,uuid,uuid[],uuid,uuid) to authenticated;