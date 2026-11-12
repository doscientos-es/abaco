-- Remove the minute-by-minute worker. Notifications will be redesigned around
-- event-driven delivery; no scheduled job should remain active.
select cron.unschedule('vacation-notification-worker');
drop function if exists public.run_vacation_notification_worker();