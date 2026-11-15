-- Preserve the original creation APIs' default assignee as the shared contract selection.
create function app_private.initialize_contract_resources() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.default_assigned_user_id is not null
    and cardinality(new.assigned_user_ids)=0 and new.work_team_id is null then
    new.assigned_user_ids:=array[new.default_assigned_user_id];
  end if;
  return new;
end;
$$;
revoke all on function app_private.initialize_contract_resources() from public,anon,authenticated,service_role;
create trigger initialize_contract_resources before insert on public.service_contracts
  for each row execute function app_private.initialize_contract_resources();

-- Signature records are historical, but job ownership must match the shared contract at signing.
create function app_private.validate_contract_job_signature_owner() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.service_contracts%rowtype;
begin
  if new.task_key like 'job:%' then
    select * into c from public.service_contracts where id=new.contract_id and tenant_id=new.tenant_id;
    if not found or new.assigned_user_ids is distinct from c.assigned_user_ids
      or new.work_team_id is distinct from c.work_team_id then
      raise exception 'Los responsables del trabajo deben coincidir con los del contrato' using errcode='22023';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.validate_contract_job_signature_owner() from public,anon,authenticated,service_role;
create trigger validate_contract_job_signature_owner before insert or update on public.contract_task_assignments
  for each row execute function app_private.validate_contract_job_signature_owner();