-- Calendar dates are local to the contract's service location.
create function app_private.contract_task_due(p_schedule jsonb, p_date date)
returns boolean language sql immutable set search_path = '' as $$
  select case when p_schedule is null or p_date is null then false else
    p_date >= (p_schedule->>'anchor_on')::date and case p_schedule->>'frequency'
      when 'once' then p_date = (p_schedule->>'anchor_on')::date
      when 'weekly' then exists (select 1 from jsonb_array_elements_text(p_schedule->'weekdays') d
        where d::integer = extract(isodow from p_date)::integer)
      when 'fortnightly' then exists (select 1 from jsonb_array_elements_text(p_schedule->'weekdays') d
        where d::integer = extract(isodow from p_date)::integer)
        and mod((date_trunc('week', p_date::timestamp)::date -
          date_trunc('week', (p_schedule->>'anchor_on')::date::timestamp)::date) / 7, 2) = 0
      when 'days15' then mod(p_date - (p_schedule->>'anchor_on')::date, 15) = 0
      when 'monthly' then extract(day from p_date) = least(extract(day from (p_schedule->>'anchor_on')::date),
        extract(day from (date_trunc('month', p_date::timestamp) + interval '1 month - 1 day')))
      when 'semiannual' then mod((extract(year from p_date)::integer - extract(year from (p_schedule->>'anchor_on')::date)::integer) * 12
        + extract(month from p_date)::integer - extract(month from (p_schedule->>'anchor_on')::date)::integer, 6) = 0
        and extract(day from p_date) = least(extract(day from (p_schedule->>'anchor_on')::date),
          extract(day from (date_trunc('month', p_date::timestamp) + interval '1 month - 1 day')))
      when 'annual' then extract(month from p_date) = extract(month from (p_schedule->>'anchor_on')::date)
        and extract(day from p_date) = least(extract(day from (p_schedule->>'anchor_on')::date),
          extract(day from (date_trunc('month', p_date::timestamp) + interval '1 month - 1 day')))
      else false end end
$$;
revoke all on function app_private.contract_task_due(jsonb, date) from public, anon, authenticated, service_role;

create or replace function app_private.capture_paper_visit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.service_contract_visit_rules%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.paper_snapshot is distinct from old.paper_snapshot then raise exception 'El parte original es inmutable'; end if;
    return new;
  end if;
  select * into r from public.service_contract_visit_rules where id = new.contract_rule_id and tenant_id = new.tenant_id;
  if found and not r.configured then raise exception 'Trabajo pendiente de configurar' using errcode = 'P0409'; end if;
  select jsonb_build_object('client', c.name, 'center', coalesce(l.name, ''), 'address', coalesce(l.address, ''),
    'tasks', concat_ws(E'\n', nullif(r.tasks, ''), nullif(r.weekly_tasks->>extract(isodow from new.contract_occurrence_on)::integer::text, '')),
    'scheduledTasks', coalesce((select jsonb_agg(jsonb_build_object('title', t->>'title',
      'startMinute', (a.schedule->>'start_minute')::integer,
      'durationMinutes', (a.schedule->>'duration_minutes')::integer) order by (a.schedule->>'start_minute')::integer, a.task_key)
      from public.service_contracts contract
      join public.contract_task_assignments a on a.tenant_id = contract.tenant_id and a.contract_id = contract.id
      cross join lateral app_private.contract_assignment_tasks(contract.source_snapshot) t
      where contract.tenant_id = new.tenant_id and contract.id = new.contract_id
        and a.job_id = new.contract_rule_id and a.task_key = t->>'task_key'
        and app_private.contract_task_due(a.schedule, new.contract_occurrence_on)), '[]'::jsonb),
    'instructions', concat_ws(E'\n', nullif(l.operational_contact, ''), nullif(l.access_notes, ''), nullif(l.notes, ''),
      nullif(l.opening_hours, ''), nullif(r.materials, ''), nullif(r.instructions, ''), nullif(new.notes, '')),
    'requiresAcceptance', coalesce(r.requires_acceptance, true), 'timeKnown', coalesce(r.time_known, true))
    into new.paper_snapshot from public.clients c left join public.service_locations l
      on l.id = new.location_id and l.tenant_id = c.tenant_id where c.id = new.client_id and c.tenant_id = new.tenant_id;
  return new;
end;
$$;