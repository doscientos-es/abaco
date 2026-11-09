-- Weekly summary emails are no longer sent automatically.
select cron.unschedule('weekly-summary')
where exists (select 1 from cron.job where jobname = 'weekly-summary');