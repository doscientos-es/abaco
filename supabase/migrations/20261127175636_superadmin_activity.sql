-- Keep new events private. The read API joins the legacy audit tables without
-- copying payloads or fabricating history. No browser role can edit the ledger.
create table app_private.platform_activity_events (
  id bigint generated always as identity primary key,
  tenant_id uuid,
  actor_id uuid not null,
  occurred_at timestamptz not null default clock_timestamp(),
  kind text not null check (kind in ('territorio','tarifa_plan','tarifa_modulo','cortesia_modulo')),
  subject text,
  before_value jsonb,
  after_value jsonb
);
alter table app_private.platform_activity_events enable row level security;
revoke all on app_private.platform_activity_events from public, anon, authenticated;

create index platform_activity_date_idx on app_private.platform_activity_events (occurred_at desc, id desc);
create index platform_activity_tenant_idx on app_private.platform_activity_events (tenant_id, occurred_at desc, id desc);
create index platform_company_actions_date_idx on app_private.platform_company_actions (performed_at desc, id desc);
create index billing_agreement_log_date_idx on public.billing_agreement_log (changed_at desc, id desc);

create function app_private.record_platform_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  company uuid;
  category text;
  subject text;
  old_value jsonb;
  new_value jsonb;
begin
  -- Do not attribute service jobs or customer changes to the platform.
  if actor is null or public.is_platform_superadmin() is not true then return new; end if;

  case tg_table_name
    when 'subscription_tax_overrides' then
      company := new.tenant_id;
      category := 'territorio';
      old_value := jsonb_build_object('territory', null);
      if tg_op = 'UPDATE' then
        if old.postal_code is not distinct from new.postal_code then
          old_value := jsonb_build_object('territory', old.territory);
        end if;
      end if;
      new_value := jsonb_build_object('territory', new.territory);
    when 'billing_catalog' then
      category := 'tarifa_plan';
      subject := new.plan;
      old_value := jsonb_build_object('monthly_cents', old.monthly_cents, 'seat_monthly_cents', old.seat_monthly_cents, 'seats', old.seats);
      new_value := jsonb_build_object('monthly_cents', new.monthly_cents, 'seat_monthly_cents', new.seat_monthly_cents, 'seats', new.seats);
    when 'billing_module_catalog' then
      category := 'tarifa_modulo';
      subject := new.code;
      old_value := jsonb_build_object('monthly_cents', old.monthly_cents, 'yearly_cents', old.yearly_cents);
      new_value := jsonb_build_object('monthly_cents', new.monthly_cents, 'yearly_cents', new.yearly_cents);
    when 'tenant_modules' then
      if tg_op = 'INSERT' and not new.gifted then return new; end if;
      company := new.tenant_id;
      category := 'cortesia_modulo';
      subject := new.module_code;
      old_value := case when tg_op = 'UPDATE' then jsonb_build_object('gifted', old.gifted) else jsonb_build_object('gifted', false) end;
      new_value := jsonb_build_object('gifted', new.gifted);
    else return new;
  end case;

  if old_value is not distinct from new_value then return new; end if;
  insert into app_private.platform_activity_events(tenant_id,actor_id,kind,subject,before_value,after_value)
  values (company,actor,category,subject,old_value,new_value);
  return new;
end;
$$;
revoke all on function app_private.record_platform_activity() from public, anon, authenticated;

create trigger audit_subscription_tax after insert or update of territory on app_private.subscription_tax_overrides
  for each row execute function app_private.record_platform_activity();
create trigger audit_plan_rate after update of monthly_cents, seat_monthly_cents on public.billing_catalog
  for each row execute function app_private.record_platform_activity();
create trigger audit_module_rate after update of monthly_cents, yearly_cents on public.billing_module_catalog
  for each row execute function app_private.record_platform_activity();
create trigger audit_module_gift after insert or update of gifted on public.tenant_modules
  for each row execute function app_private.record_platform_activity();

-- Carefully project old nested records: never return arbitrary JSON values or
-- profile, postal address, email of a billing contact, NIF or payment references.
create function app_private.platform_safe_agreement(p jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select nullif(coalesce((select jsonb_object_agg(key,value) from jsonb_each(
    case when jsonb_typeof(p)='object' then p else '{}'::jsonb end
  ) where (key in ('seats','net_cents','base_net_cents','fixed_net_cents','vat_percent') and jsonb_typeof(value)='number')
    or (key='plan' and value #>> '{}' in ('trial','standard','solo','team','business','scale'))
    or (key='period' and value #>> '{}' in ('month','year'))
    or (key='price_source' and value #>> '{}' in ('fixed','catalog'))
  ), '{}'::jsonb), '{}'::jsonb);
$$;
revoke all on function app_private.platform_safe_agreement(jsonb) from public, anon, authenticated;

create function app_private.read_platform_activity(p_company uuid,p_kind text,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if public.is_platform_superadmin() is not true then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_offset is null or p_offset not between 0 and 4950 or (p_kind is not null and p_kind not in
    ('renovacion','archivo','acuerdo','iva','territorio','tarifa_plan','tarifa_modulo','cortesia_modulo')) then
    raise exception 'Filtro no válido' using errcode = '22023';
  end if;
  return (
    with activity as (
      select 'new:'||a.id as id,a.tenant_id,a.actor_id,a.occurred_at,a.kind,a.subject,a.before_value,a.after_value
      from app_private.platform_activity_events a
      union all
      select 'directory:'||a.id,a.tenant_id,a.actor_id,a.performed_at,
        case when a.action in ('pause','resume') then 'renovacion' else 'archivo' end,a.action,null,null
      from app_private.platform_company_actions a
      union all
      select 'billing:'||a.id,a.tenant_id,a.actor_id,a.changed_at,
        case when a.scheduled_terms ? 'vat_percent' and not(a.scheduled_terms ? 'plan') then 'iva' else 'acuerdo' end,
        null,app_private.platform_safe_agreement(a.previous_terms),app_private.platform_safe_agreement(a.scheduled_terms)
      from public.billing_agreement_log a
    ), page as (
      select * from activity a where (p_company is null or a.tenant_id=p_company)
        and (p_kind is null or a.kind=p_kind)
      order by a.occurred_at desc,a.id desc limit 51 offset p_offset
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'tenant_id',p.tenant_id,'company_name',t.name,'actor_email',u.email,
      'occurred_at',p.occurred_at,'kind',p.kind,'subject',p.subject,
      'before',p.before_value,'after',p.after_value
    ) order by p.occurred_at desc,p.id desc),'[]'::jsonb)
    from page p left join public.tenants t on t.id=p.tenant_id
      left join auth.users u on u.id=p.actor_id
  );
end;
$$;

create function public.superadmin_activity(p_company uuid,p_kind text,p_offset integer)
returns jsonb language sql stable security invoker set search_path = ''
begin atomic select app_private.read_platform_activity(p_company,p_kind,p_offset); end;

revoke all on function app_private.read_platform_activity(uuid,text,integer),
  public.superadmin_activity(uuid,text,integer) from public, anon, authenticated;
grant execute on function app_private.read_platform_activity(uuid,text,integer),
  public.superadmin_activity(uuid,text,integer) to authenticated;

notify pgrst, 'reload schema';
