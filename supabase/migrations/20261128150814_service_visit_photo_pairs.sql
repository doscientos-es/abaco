-- Internal presentation metadata only: immutable photos, upload operations and report snapshots stay intact.
create table public.service_visit_photo_pairs (
  tenant_id uuid not null,
  visit_id uuid not null,
  before_photo_id uuid not null,
  after_photo_id uuid not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, visit_id, before_photo_id),
  unique (tenant_id, visit_id, after_photo_id),
  check (before_photo_id <> after_photo_id),
  foreign key (before_photo_id, tenant_id, visit_id)
    references public.service_visit_photos (id, tenant_id, visit_id) on delete restrict,
  foreign key (after_photo_id, tenant_id, visit_id)
    references public.service_visit_photos (id, tenant_id, visit_id) on delete restrict
);

alter table public.service_visit_photo_pairs enable row level security;
revoke all on public.service_visit_photo_pairs from public, anon, authenticated;
grant select (tenant_id, visit_id, before_photo_id, after_photo_id, created_at)
  on public.service_visit_photo_pairs to authenticated;

create policy service_visit_photo_pairs_select on public.service_visit_photo_pairs
  for select to authenticated using (
    (select auth.uid()) is not null and (
      coalesce(public.has_role(tenant_id, array['owner','admin','editor']::public.app_role[]), false)
      or coalesce(public.can_access_assigned_visit(tenant_id, visit_id), false)
    )
  );

-- The private schema already denies name resolution to client roles.
create function app_private.set_service_visit_photo_pair(
  p_tenant_id uuid, p_visit_id uuid, p_before_photo_id uuid, p_after_photo_id uuid,
  p_paired boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  office boolean;
  target_status text;
  valid_photos bigint;
begin
  if actor is null or p_tenant_id is null or p_visit_id is null then
    raise exception 'No tienes permiso para organizar las fotografías' using errcode = '42501';
  end if;
  if p_before_photo_id is null or p_after_photo_id is null or p_paired is null
     or p_before_photo_id = p_after_photo_id then
    raise exception 'Pareja de fotografías inválida' using errcode = '22023';
  end if;
  office := coalesce(
    public.has_role(p_tenant_id, array['owner','admin','editor']::public.app_role[]), false
  );
  if not office and not coalesce(public.can_access_assigned_visit(p_tenant_id, p_visit_id), false) then
    raise exception 'No tienes permiso para organizar las fotografías' using errcode = '42501';
  end if;

  -- Serialize with completion, reassignment and photo registration for this visit.
  select v.status into target_status from public.service_visits v
  where v.tenant_id = p_tenant_id and v.id = p_visit_id for update;
  if not found or not (
    coalesce(public.has_role(p_tenant_id, array['owner','admin','editor']::public.app_role[]), false)
    or coalesce(public.can_access_assigned_visit(p_tenant_id, p_visit_id), false)
  ) then
    raise exception 'No tienes permiso para organizar las fotografías' using errcode = '42501';
  end if;
  if target_status is null or target_status not in ('scheduled', 'in_progress')
     or not coalesce(public.tenant_can_write(p_tenant_id), false) then
    raise exception 'Solo se pueden organizar fotografías de una visita abierta' using errcode = 'P0409';
  end if;

  if not p_paired then
    -- Never unlink a photo that has since been paired with a different item.
    delete from public.service_visit_photo_pairs p
    where p.tenant_id = p_tenant_id and p.visit_id = p_visit_id
      and p.before_photo_id = p_before_photo_id and p.after_photo_id = p_after_photo_id;
    return;
  end if;

  select count(*) into valid_photos from public.service_visit_photos photo
    where photo.tenant_id = p_tenant_id and photo.visit_id = p_visit_id and (
      (photo.id = p_before_photo_id and photo.phase = 'before') or
      (photo.id = p_after_photo_id and photo.phase = 'after')
    );
  if valid_photos <> 2 then
    raise exception 'Elige una foto de antes y otra de después de la misma visita' using errcode = '22023';
  end if;

  insert into public.service_visit_photo_pairs (
    tenant_id, visit_id, before_photo_id, after_photo_id, created_by
  ) values (p_tenant_id, p_visit_id, p_before_photo_id, p_after_photo_id, actor)
  on conflict do nothing;

  if not exists (
    select 1 from public.service_visit_photo_pairs p
    where p.tenant_id = p_tenant_id and p.visit_id = p_visit_id
      and p.before_photo_id = p_before_photo_id and p.after_photo_id = p_after_photo_id
  ) then
    raise exception 'Una de las fotos ya tiene pareja. Actualiza la galería antes de continuar.'
      using errcode = 'P0409';
  end if;
end;
$$;
revoke all on function app_private.set_service_visit_photo_pair(uuid, uuid, uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function app_private.set_service_visit_photo_pair(uuid, uuid, uuid, uuid, boolean)
  to authenticated;

create function public.set_service_visit_photo_pair(
  p_tenant_id uuid, p_visit_id uuid, p_before_photo_id uuid, p_after_photo_id uuid,
  p_paired boolean
) returns void language sql security invoker set search_path = ''
begin atomic
  select app_private.set_service_visit_photo_pair(
    p_tenant_id, p_visit_id, p_before_photo_id, p_after_photo_id, p_paired
  );
end;
revoke all on function public.set_service_visit_photo_pair(uuid, uuid, uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_service_visit_photo_pair(uuid, uuid, uuid, uuid, boolean)
  to authenticated;

notify pgrst, 'reload schema';
