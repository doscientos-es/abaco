-- La prueba gratuita da el plan máximo: hasta 15 personas (igual que "business").
create or replace function public.plan_member_limit(p_plan text) returns integer
language sql immutable set search_path = ''
as $$
  select case p_plan when 'solo' then 1 when 'team' then 5 else 15 end;
$$;
