-- Pure calculation only; authorization, paid entitlements and charging are separate.
create function app_private.prorated_upgrade_net(
  p_full_delta_cents integer, p_start timestamptz, p_end timestamptz, p_at timestamptz
) returns integer language plpgsql immutable strict set search_path = '' as $$
declare
  cycle_seconds numeric;
  remaining_seconds numeric;
begin
  if p_full_delta_cents < 0 or p_start >= p_end or p_at < p_start or p_at > p_end then
    raise exception 'Periodo o importe de prorrateo no válido' using errcode = '22023';
  end if;
  cycle_seconds := extract(epoch from (p_end - p_start));
  remaining_seconds := extract(epoch from (p_end - p_at));
  return round(p_full_delta_cents::numeric * remaining_seconds / cycle_seconds)::integer;
end;
$$;
revoke all on function app_private.prorated_upgrade_net(integer,timestamptz,timestamptz,timestamptz)
  from public, anon, authenticated;