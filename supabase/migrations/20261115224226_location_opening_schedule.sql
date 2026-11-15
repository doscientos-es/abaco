-- Preserve the existing free-text hours. A null schedule means unknown, not closed.
create function app_private.valid_location_opening_schedule(p_schedule jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare item jsonb; start_min integer; end_min integer; start_week integer; end_week integer;
  starts integer[] := '{}'; ends integer[] := '{}'; i integer; offset_week integer;
begin
  if p_schedule is null then return true; end if;
  if jsonb_typeof(p_schedule) <> 'array' or jsonb_array_length(p_schedule) > 56 then return false; end if;
  for item in select value from jsonb_array_elements(p_schedule) loop
    if jsonb_typeof(item) <> 'object' or coalesce(item->>'weekday','') !~ '^[1-7]$'
      or coalesce(item->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(item->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
    start_min := substring(item->>'start',1,2)::integer * 60 + substring(item->>'start',4,2)::integer;
    end_min := substring(item->>'end',1,2)::integer * 60 + substring(item->>'end',4,2)::integer;
    if start_min = end_min and start_min <> 0 then return false; end if;
    start_week := ((item->>'weekday')::integer - 1) * 1440 + start_min;
    end_week := start_week + case when end_min > start_min then end_min - start_min else 1440 - start_min + end_min end;
    for i in 1..coalesce(array_length(starts,1),0) loop
      foreach offset_week in array array[-10080,0,10080] loop
        if start_week < ends[i] + offset_week and starts[i] + offset_week < end_week then return false; end if;
      end loop;
    end loop;
    starts := array_append(starts,start_week); ends := array_append(ends,end_week);
  end loop;
  return true;
end;
$$;
revoke all on function app_private.valid_location_opening_schedule(jsonb) from public,anon;
grant execute on function app_private.valid_location_opening_schedule(jsonb) to authenticated,service_role;
alter table public.service_locations add column opening_schedule jsonb
  constraint service_locations_opening_schedule_valid check (app_private.valid_location_opening_schedule(opening_schedule));