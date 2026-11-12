-- Add the worker-facing role before the migration that moves existing memberships.
alter type public.app_role add value if not exists 'user';