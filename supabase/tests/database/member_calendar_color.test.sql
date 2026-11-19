begin;
set local plpgsql.check_asserts = on;
insert into public.tenants(id,name,is_complimentary) values
  ('a7200000-0000-4000-8000-000000000001','Calendar color test',true),
  ('a7200000-0000-4000-8000-000000000002','Other company',true);
insert into auth.users(id,email) values
  ('a7200000-0000-4000-8000-000000000003','color-admin@example.test'),
  ('a7200000-0000-4000-8000-000000000004','color-worker@example.test'),
  ('a7200000-0000-4000-8000-000000000005','color-other@example.test');
insert into public.memberships(tenant_id,user_id,role) values
  ('a7200000-0000-4000-8000-000000000001','a7200000-0000-4000-8000-000000000003','admin'),
  ('a7200000-0000-4000-8000-000000000001','a7200000-0000-4000-8000-000000000004','user'),
  ('a7200000-0000-4000-8000-000000000002','a7200000-0000-4000-8000-000000000005','user');
set local role authenticated;
set local request.jwt.claim.sub='a7200000-0000-4000-8000-000000000003';
do $$
declare tenant constant uuid:='a7200000-0000-4000-8000-000000000001';
  worker constant uuid:='a7200000-0000-4000-8000-000000000004';
begin
  perform public.set_member_calendar_color(tenant,worker,'blue');
  assert (select calendar_color='blue' from public.memberships where tenant_id=tenant and user_id=worker), 'Admin can choose a color';
  begin
    perform public.set_member_calendar_color(tenant,'a7200000-0000-4000-8000-000000000005','blue');
    raise exception 'Cross-company update accepted';
  exception when sqlstate 'P0002' then null; end;
  begin
    perform public.set_member_calendar_color(tenant,worker,'invalid');
    raise exception 'Invalid color accepted';
  exception when sqlstate '22023' then null; end;
  perform set_config('request.jwt.claim.sub',worker::text,true);
  begin
    perform public.set_member_calendar_color(tenant,worker,'rose');
    raise exception 'Worker was allowed to edit';
  exception when insufficient_privilege then null; end;
  assert (select calendar_color='blue' from public.memberships where tenant_id=tenant and user_id=worker), 'Worker sees their own color';
end;
$$;
rollback;
