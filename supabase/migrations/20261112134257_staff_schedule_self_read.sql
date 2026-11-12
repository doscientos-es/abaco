-- The membership foreign keys guarantee that each schedule and assignment belongs
-- to a current member; is_member intentionally excludes workers from office data.
alter policy staff_schedule_read on public.staff_schedules
  using (public.has_role(tenant_id, array['admin']::public.app_role[]) or user_id = (select auth.uid()));
alter policy staff_assignment_read on public.staff_function_assignments
  using (public.has_role(tenant_id, array['admin']::public.app_role[]) or user_id = (select auth.uid()));