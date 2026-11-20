-- Keep the scheduler paused until the Google Calendar worker is deployed.
select cron.unschedule('google-calendar-sync')
  where exists (select 1 from cron.job where jobname = 'google-calendar-sync');
