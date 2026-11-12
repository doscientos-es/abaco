-- Recordatorios automáticos: opt-in por empresa y rastro de lo ya enviado para no repetir correos.
alter table public.tenants add column if not exists auto_reminders boolean not null default false;
alter table public.invoices add column if not exists reminder_count integer not null default 0;
alter table public.invoices add column if not exists last_reminder_at timestamptz;
alter table public.estimates add column if not exists reminder_sent_at timestamptz;
