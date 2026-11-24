-- Photos are scoped to a company, not to the global authentication profile.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('worker-avatars', 'worker-avatars', false, 2097152,
  array['image/jpeg', 'image/png', 'image/webp']);

create table public.worker_avatars (
  tenant_id uuid not null,
  user_id uuid not null,
  object_path text not null unique,
  primary key (tenant_id, user_id),
  foreign key (tenant_id, user_id) references public.memberships (tenant_id, user_id) on delete cascade
);

alter table public.worker_avatars enable row level security;
revoke all on public.worker_avatars from public, anon, authenticated;
grant select on public.worker_avatars to authenticated;

create function public.worker_avatar_access(p_tenant uuid, p_user uuid, p_edit boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships mine
    join public.memberships target on target.tenant_id = mine.tenant_id
    where mine.tenant_id = p_tenant and mine.user_id = (select auth.uid())
      and target.user_id = p_user
      and (not p_edit or mine.user_id = target.user_id or mine.role::text in ('owner', 'admin'))
  );
$$;
revoke all on function public.worker_avatar_access(uuid, uuid, boolean) from public, anon;
grant execute on function public.worker_avatar_access(uuid, uuid, boolean) to authenticated;

create policy worker_avatars_read on public.worker_avatars for select to authenticated
  using (public.worker_avatar_access(tenant_id, user_id, false));

create function public.worker_avatar_object_access(p_path text, p_edit boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if p_path !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(jpg|png|webp)$' then
    return false;
  end if;
  return public.worker_avatar_access(split_part(p_path, '/', 1)::uuid,
    split_part(p_path, '/', 2)::uuid, p_edit);
end;
$$;
revoke all on function public.worker_avatar_object_access(text, boolean) from public, anon;
grant execute on function public.worker_avatar_object_access(text, boolean) to authenticated;

create policy worker_avatar_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'worker-avatars' and public.worker_avatar_object_access(name, false));
create policy worker_avatar_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'worker-avatars' and public.worker_avatar_object_access(name, true));
create policy worker_avatar_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'worker-avatars' and public.worker_avatar_object_access(name, true)
    and not exists (select 1 from public.worker_avatars a where a.object_path = name));

-- Only this RPC can change the reference, and it verifies the file and permissions.
create function public.set_worker_avatar(p_tenant uuid, p_user uuid, p_path text)
returns text language plpgsql security definer set search_path = '' as $$
declare previous_path text;
begin
  if not public.worker_avatar_access(p_tenant, p_user, true) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_path is not null and (
    not public.worker_avatar_object_access(p_path, true)
    or split_part(p_path, '/', 1) <> p_tenant::text
    or split_part(p_path, '/', 2) <> p_user::text
    or not exists (select 1 from storage.objects o where o.bucket_id = 'worker-avatars' and o.name = p_path)
  ) then
    raise exception 'Invalid avatar' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant::text || '/' || p_user::text, 0));
  select object_path into previous_path from public.worker_avatars
    where tenant_id = p_tenant and user_id = p_user;
  if p_path is null then
    delete from public.worker_avatars where tenant_id = p_tenant and user_id = p_user;
  else
    insert into public.worker_avatars (tenant_id, user_id, object_path) values (p_tenant, p_user, p_path)
    on conflict (tenant_id, user_id) do update set object_path = excluded.object_path;
  end if;
  return previous_path;
end;
$$;
revoke all on function public.set_worker_avatar(uuid, uuid, text) from public, anon;
grant execute on function public.set_worker_avatar(uuid, uuid, text) to authenticated;
