alter table public.tenants
  add column dashboard_config jsonb,
  add constraint tenants_dashboard_config_shape check (
    dashboard_config is null
    or (
      coalesce(jsonb_typeof(dashboard_config) = 'object', false)
      and coalesce(dashboard_config ->> 'version' = '1', false)
      and coalesce(jsonb_typeof(dashboard_config -> 'widgets') = 'array', false)
    )
  );
