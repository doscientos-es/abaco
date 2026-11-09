alter table public.tenants
  add column dashboard_config jsonb,
  add constraint tenants_dashboard_config_shape check (
    dashboard_config is null
    or (
      coalesce(jsonb_typeof(dashboard_config) = 'object', false)
      and coalesce(
        jsonb_typeof(dashboard_config -> 'version') = 'number'
        and dashboard_config -> 'version' = '1'::jsonb,
        false
      )
      and coalesce(jsonb_typeof(dashboard_config -> 'widgets') = 'array', false)
      and not jsonb_path_exists(
        dashboard_config,
        '$.widgets[*] ? (@.type() != "string")'
      )
    )
  );
