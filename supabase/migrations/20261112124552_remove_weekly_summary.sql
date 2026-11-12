-- Retire weekly summary emails without affecting other reminder jobs.
select cron.unschedule('weekly-summary')
where exists (select 1 from cron.job where jobname = 'weekly-summary');

drop function if exists public.run_weekly_summary();
alter table public.tenants drop column if exists weekly_summary;