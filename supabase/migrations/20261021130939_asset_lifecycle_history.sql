-- Every asset/equipment change leaves an append-only event, including its former
-- location or parent asset. No physical deletion is granted on operational tables.
create table public.service_asset_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  asset_id uuid not null,
  source text not null default 'asset' check (source in ('asset', 'pool_profile')),
  before_state jsonb,
  after_state jsonb not null,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now(),
  foreign key (asset_id, tenant_id)
    references public.service_assets (id, tenant_id) on delete restrict
);
create index service_asset_history_asset_idx
  on public.service_asset_history (tenant_id, asset_id, changed_at desc);

create table public.installed_equipment_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  equipment_id uuid not null,
  asset_id uuid not null,
  before_state jsonb,
  after_state jsonb not null,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now(),
  foreign key (equipment_id, tenant_id)
    references public.installed_equipment (id, tenant_id) on delete restrict,
  foreign key (asset_id, tenant_id)
    references public.service_assets (id, tenant_id) on delete restrict
);
create index installed_equipment_history_equipment_idx
  on public.installed_equipment_history (tenant_id, equipment_id, changed_at desc);
create index installed_equipment_history_asset_idx
  on public.installed_equipment_history (tenant_id, asset_id, changed_at desc);

alter table public.service_asset_history enable row level security;
alter table public.installed_equipment_history enable row level security;
revoke all on public.service_asset_history, public.installed_equipment_history
  from public, anon, authenticated;
grant select on public.service_asset_history, public.installed_equipment_history
  to authenticated;
create policy service_asset_history_select on public.service_asset_history
  for select to authenticated using (public.is_member(tenant_id));
create policy installed_equipment_history_select on public.installed_equipment_history
  for select to authenticated using (public.is_member(tenant_id));

create function public.record_service_asset_history() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.service_asset_history (
      tenant_id, asset_id, before_state, after_state, changed_by
    ) values (
      new.tenant_id, new.id, null, to_jsonb(new) - 'updated_at', (select auth.uid())
    );
  elsif to_jsonb(new) - 'updated_at' is distinct from to_jsonb(old) - 'updated_at' then
    insert into public.service_asset_history (
      tenant_id, asset_id, before_state, after_state, changed_by
    ) values (
      new.tenant_id, new.id, to_jsonb(old) - 'updated_at',
      to_jsonb(new) - 'updated_at', (select auth.uid())
    );
  end if;
  return new;
end;
$$;
create trigger service_assets_record_history
  after insert or update on public.service_assets
  for each row execute function public.record_service_asset_history();

create function public.record_pool_profile_history() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.service_asset_history (
      tenant_id, asset_id, source, before_state, after_state, changed_by
    ) values (
      new.tenant_id, new.asset_id, 'pool_profile', null,
      to_jsonb(new) - 'updated_at', (select auth.uid())
    );
  elsif to_jsonb(new) - 'updated_at' is distinct from to_jsonb(old) - 'updated_at' then
    insert into public.service_asset_history (
      tenant_id, asset_id, source, before_state, after_state, changed_by
    ) values (
      new.tenant_id, new.asset_id, 'pool_profile', to_jsonb(old) - 'updated_at',
      to_jsonb(new) - 'updated_at', (select auth.uid())
    );
  end if;
  return new;
end;
$$;
create trigger pool_profiles_record_history
  after insert or update on public.pool_profiles
  for each row execute function public.record_pool_profile_history();

create function public.record_installed_equipment_history() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.installed_equipment_history (
      tenant_id, equipment_id, asset_id, before_state, after_state, changed_by
    ) values (
      new.tenant_id, new.id, new.asset_id, null,
      to_jsonb(new) - 'updated_at', (select auth.uid())
    );
  elsif to_jsonb(new) - 'updated_at' is distinct from to_jsonb(old) - 'updated_at' then
    insert into public.installed_equipment_history (
      tenant_id, equipment_id, asset_id, before_state, after_state, changed_by
    ) values (
      new.tenant_id, new.id, new.asset_id, to_jsonb(old) - 'updated_at',
      to_jsonb(new) - 'updated_at', (select auth.uid())
    );
    if old.asset_id is distinct from new.asset_id then
      insert into public.installed_equipment_history (
        tenant_id, equipment_id, asset_id, before_state, after_state, changed_by
      ) values (
        old.tenant_id, old.id, old.asset_id, to_jsonb(old) - 'updated_at',
        to_jsonb(new) - 'updated_at', (select auth.uid())
      );
    end if;
  end if;
  return new;
end;
$$;
create trigger installed_equipment_record_history
  after insert or update on public.installed_equipment
  for each row execute function public.record_installed_equipment_history();

create function public.reject_passport_history_change() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'El historial de instalaciones no se modifica ni elimina';
  return old;
end;
$$;
create trigger service_asset_history_immutable
  before update or delete on public.service_asset_history
  for each row execute function public.reject_passport_history_change();
create trigger installed_equipment_history_immutable
  before update or delete on public.installed_equipment_history
  for each row execute function public.reject_passport_history_change();

revoke execute on function public.record_service_asset_history() from public, anon, authenticated;
revoke execute on function public.record_pool_profile_history() from public, anon, authenticated;
revoke execute on function public.record_installed_equipment_history()
  from public, anon, authenticated;
revoke execute on function public.reject_passport_history_change()
  from public, anon, authenticated;
