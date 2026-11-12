-- Postgres requires this enum value to commit before policies use it.
alter type public.app_role add value if not exists 'technician';
