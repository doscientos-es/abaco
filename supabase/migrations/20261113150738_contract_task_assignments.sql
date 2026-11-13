-- Signing captures responsibility for every quoted job and accepted service task.
create table public.contract_task_assignments (
  tenant_id uuid not null,
  contract_id uuid not null,
  task_key text not null check (char_length(task_key) between 1 and 200),
  job_id uuid not null,
  assigned_user_ids uuid[] not null default '{}',
  work_team_id uuid,
  primary key (contract_id, task_key),
  foreign key (job_id, tenant_id, contract_id) references public.service_contract_visit_rules(id, tenant_id, contract_id),
  foreign key (work_team_id, tenant_id) references public.work_teams(id, tenant_id),
  check (array_position(assigned_user_ids, null) is null and
    ((work_team_id is null and cardinality(assigned_user_ids) between 1 and 30)
      or (work_team_id is not null and cardinality(assigned_user_ids) = 0)))
);
create index contract_task_assignments_job_idx on public.contract_task_assignments(job_id, tenant_id, contract_id);
create index contract_task_assignments_team_idx on public.contract_task_assignments(work_team_id, tenant_id);
alter table public.contract_task_assignments enable row level security;
revoke all on public.contract_task_assignments from public, anon, authenticated;
grant select on public.contract_task_assignments to authenticated, service_role;
create policy contract_task_assignments_read on public.contract_task_assignments for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin']::public.app_role[]));

create function app_private.contract_assignment_tasks(p_snapshot jsonb) returns setof jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('task_key', 'service:' || (s->>'id') || ':' || (r->>'id'),
    'title', r->>'task', 'section_title', s->>'title', 'frequency', coalesce(r->>'frequency',''),
    'notes', coalesce(r->>'notes',''), 'periodicities', coalesce(r->'periodicities','[]'::jsonb))
  from jsonb_array_elements(coalesce(p_snapshot #> '{estimate,document_sections}', '[]')) s
  cross join lateral jsonb_array_elements(case when s->>'type' = 'work_table' then s->'rows' else '[]'::jsonb end) r
  where nullif(btrim(r->>'task'),'') is not null
$$;
revoke all on function app_private.contract_assignment_tasks(jsonb) from public, anon, authenticated;

create function public.load_contract_assignment_setup(p_tenant_id uuid, p_contract_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.service_contracts%rowtype;
begin
  if auth.uid() is null or not public.has_role(p_tenant_id,array['owner','admin']::public.app_role[]) then
    raise exception 'No tienes permiso para consultar las asignaciones.' using errcode='42501';
  end if;
  select * into c from public.service_contracts where tenant_id=p_tenant_id and id=p_contract_id;
  if not found then raise exception 'Contrato no encontrado.' using errcode='P0002'; end if;
  return jsonb_build_object('updated_at',c.updated_at,
    'jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,
      'assigned_user_id',assigned_user_id,'work_team_id',work_team_id) order by created_at,id),'[]')
      from public.service_contract_visit_rules where tenant_id=p_tenant_id and contract_id=c.id),
    'tasks',(select coalesce(jsonb_agg(t),'[]') from app_private.contract_assignment_tasks(c.source_snapshot) t),
    'assignments',(select coalesce(jsonb_agg(jsonb_build_object('task_key',task_key,'job_id',job_id,
      'assigned_user_ids',assigned_user_ids,'work_team_id',work_team_id) order by task_key),'[]')
      from public.contract_task_assignments where tenant_id=p_tenant_id and contract_id=c.id));
end;
$$;
revoke all on function public.load_contract_assignment_setup(uuid,uuid) from public, anon;
grant execute on function public.load_contract_assignment_setup(uuid,uuid) to authenticated;

-- Replace the old endpoint, preventing callers from bypassing assignment validation.
drop function public.record_contract_signature(uuid,uuid,timestamptz,uuid,text,text);
create function public.record_contract_signature(
  p_tenant_id uuid, p_contract_id uuid, p_expected_updated_at timestamptz, p_operation_id uuid,
  p_document_path text default null, p_document_name text default null, p_assignments jsonb default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.service_contracts%rowtype; prior public.service_contract_events%rowtype;
  expected text[]; item jsonb; job uuid; team uuid; people uuid[];
  document_name text := nullif(trim(p_document_name),'');
begin
  if auth.uid() is null or not public.has_role(p_tenant_id,array['owner','admin']::public.app_role[])
    or not public.tenant_can_write(p_tenant_id) then
    raise exception 'Solo un administrador de la empresa puede registrar la firma.' using errcode='42501';
  end if;
  if p_expected_updated_at is null or p_operation_id is null
    or (p_document_path is null) <> (document_name is null) or char_length(document_name)>240 then
    raise exception 'Datos de firma no válidos.' using errcode='22023'; end if;
  select * into c from public.service_contracts where tenant_id=p_tenant_id and id=p_contract_id for update;
  if not found then raise exception 'Contrato no encontrado.' using errcode='P0002'; end if;
  select * into prior from public.service_contract_events where operation_id=p_operation_id;
  if found then
    if prior.tenant_id<>p_tenant_id or prior.contract_id<>p_contract_id or prior.actor_id is distinct from auth.uid()
      or prior.kind not in ('signed','signed_document_attached')
      or (prior.payload->>'document_path') is distinct from p_document_path
      or (prior.payload->>'document_name') is distinct from document_name
      or nullif(prior.payload->'assignments','null'::jsonb) is distinct from p_assignments then
      raise exception 'La operación ya se utilizó con otras asignaciones.' using errcode='22023';
    end if;
    return;
  end if;
  if c.updated_at is distinct from p_expected_updated_at then
    raise exception 'El contrato ha cambiado. Recarga la lista y vuelve a intentarlo.' using errcode='40001';
  end if;
  if c.signed_at is not null then
    if p_assignments is not null then raise exception 'Las asignaciones de firma ya están guardadas.' using errcode='22023'; end if;
    if p_document_path is null or c.signed_document_path is not null then
      raise exception 'La firma ya está registrada. El documento firmado no puede sustituirse.' using errcode='22023'; end if;
  end if;
  if p_document_path is not null and (p_document_path <> p_tenant_id::text || '/' || p_contract_id::text || '/' || p_operation_id::text || '.pdf'
    or not exists(select 1 from storage.objects o where o.bucket_id='signed-contracts' and o.name=p_document_path
      and o.owner_id=auth.uid()::text and o.metadata->>'mimetype'='application/pdf'
      and (o.metadata->>'size')::bigint between 1 and 15728640)) then
    raise exception 'Adjunta un PDF válido de hasta 15 MB de este contrato.' using errcode='22023';
  end if;
  if c.signed_at is null then
  perform 1 from public.service_contract_visit_rules where tenant_id=p_tenant_id and contract_id=c.id order by id for update;
  select array_agg(k) into expected from (
    select 'job:' || id::text k from public.service_contract_visit_rules where tenant_id=p_tenant_id and contract_id=c.id
    union all select t->>'task_key' from app_private.contract_assignment_tasks(c.source_snapshot) t
  ) tasks;
  if expected is null or not exists(select 1 from public.service_contract_visit_rules where tenant_id=p_tenant_id and contract_id=c.id) then
    raise exception 'Añade al menos un trabajo al contrato antes de firmar.' using errcode='22023';
  end if;
  if p_assignments is null or jsonb_typeof(p_assignments)<>'array' then
    raise exception 'Asigna todos los trabajos y tareas antes de firmar.' using errcode='22023';
  end if;
  if jsonb_array_length(p_assignments)<>cardinality(expected)
    or (select count(distinct a->>'task_key') from jsonb_array_elements(p_assignments) a)<>cardinality(expected)
    or exists(select 1 from jsonb_array_elements(p_assignments) a where not coalesce((a->>'task_key')=any(expected),false)) then
    raise exception 'Revisa todas las tareas y trabajos del contrato.' using errcode='22023';
  end if;
  for item in select * from jsonb_array_elements(p_assignments) loop
    job := (item->>'job_id')::uuid; team := (item->>'work_team_id')::uuid;
    if jsonb_typeof(item->'assigned_user_ids') is distinct from 'array' then
      raise exception 'Personas no válidas.' using errcode='22023'; end if;
    select coalesce(array_agg(distinct u::uuid order by u::uuid),'{}') into people
      from jsonb_array_elements_text(item->'assigned_user_ids') u;
    if job is null or not exists(select 1 from public.service_contract_visit_rules where tenant_id=p_tenant_id and contract_id=c.id and id=job)
      or (item->>'task_key' like 'job:%' and (item->>'task_key'<>'job:' || job::text or cardinality(people)>1)) then
      raise exception 'Asocia cada tarea a un trabajo válido.' using errcode='22023'; end if;
    if array_position(people,null) is not null or (team is null and cardinality(people) not between 1 and 30)
      or (team is not null and cardinality(people)<>0) then
      raise exception 'Asigna personas o un equipo a cada trabajo y tarea.' using errcode='22023'; end if;
    perform 1 from public.memberships where tenant_id=p_tenant_id and user_id=any(people) order by user_id for share;
    if exists(select 1 from unnest(people) u where not exists(select 1 from public.memberships
      where tenant_id=p_tenant_id and user_id=u and role in ('user','technician'))) then
      raise exception 'Persona no disponible en esta empresa.' using errcode='22023'; end if;
    if team is not null then
      perform 1 from public.work_teams where tenant_id=p_tenant_id and id=team and archived_at is null for share;
      if not found then raise exception 'Equipo no disponible en esta empresa.' using errcode='22023'; end if;
    end if;
    insert into public.contract_task_assignments(tenant_id,contract_id,task_key,job_id,assigned_user_ids,work_team_id)
      values(p_tenant_id,c.id,item->>'task_key',job,people,team);
    if item->>'task_key' like 'job:%' then
      update public.service_contract_visit_rules set assigned_user_id=people[1],work_team_id=team where id=job and tenant_id=p_tenant_id;
    end if;
  end loop;
  end if;
  update public.service_contracts set signed_at=coalesce(signed_at,clock_timestamp()),
    signed_by=coalesce(signed_by,auth.uid()), signed_document_path=p_document_path,
    signed_document_name=document_name where id=c.id and tenant_id=p_tenant_id;
  insert into public.service_contract_events(operation_id,tenant_id,contract_id,kind,payload,actor_id)
    values(p_operation_id,p_tenant_id,c.id,case when c.signed_at is null then 'signed' else 'signed_document_attached' end,
      jsonb_build_object('document_path',p_document_path,'document_name',document_name,'assignments',p_assignments),auth.uid());
end;
$$;
revoke all on function public.record_contract_signature(uuid,uuid,timestamptz,uuid,text,text,jsonb) from public,anon;
grant execute on function public.record_contract_signature(uuid,uuid,timestamptz,uuid,text,text,jsonb) to authenticated;
