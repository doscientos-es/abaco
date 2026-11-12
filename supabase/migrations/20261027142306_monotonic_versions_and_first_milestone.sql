-- now() is fixed for a transaction. It cannot serve as an optimistic version when
-- a row is edited twice before commit. Every update receives a strictly newer value.
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;

-- A single 30% milestone is a 30% invoice, not a 100% invoice. The remaining
-- obligation belongs to later explicit billing work and must not be issued early.
create or replace function public.issue_first_invoice_on_acceptance() returns trigger
language plpgsql set search_path = ''
as $$
declare
  first_milestone record;
  net_cents numeric;
  discount_cents numeric;
  subtotal_cents numeric;
  total_cents numeric;
  first_cents numeric;
begin
  if not (old.status = 'sent' and new.status = 'accepted'
          and old.responded_at is null and new.responded_at is not null) then
    return new;
  end if;

  select m.id, m.label, m.percent into first_milestone
  from public.estimate_milestones m
  where m.estimate_id = new.id and m.tenant_id = new.tenant_id
  order by m.position, m.id limit 1;
  if not found then return new; end if;

  select coalesce(sum(l.gross_cents - round(l.gross_cents * l.discount_percent / 100)), 0)
  into net_cents
  from (
    select round(quantity * unit_price_cents) as gross_cents, discount_percent
    from public.estimate_lines
    where estimate_id = new.id and tenant_id = new.tenant_id
  ) l;

  discount_cents := case new.discount_type
    when 'percent' then round(net_cents * new.discount_value / 100)
    when 'amount' then least(net_cents, round(new.discount_value))
    else 0
  end;
  subtotal_cents := net_cents - discount_cents;
  total_cents := subtotal_cents + round(subtotal_cents * new.vat_rate / 100);
  first_cents := round(total_cents * first_milestone.percent / 100);
  if first_cents <= 0 then return new; end if;

  if not exists (
    select 1 from public.invoices i
    where i.estimate_id = new.id and i.milestone_id = first_milestone.id
  ) then
    insert into public.invoices (
      tenant_id, estimate_id, milestone_id, client_id, concept, total_cents,
      vat_rate, status, issued_at, due_date
    ) values (
      new.tenant_id, new.id, first_milestone.id, new.client_id,
      new.title || ' · ' || coalesce(nullif(first_milestone.label, ''), 'Hito'),
      first_cents::bigint, new.vat_rate, 'issued', current_date, current_date + 15
    );
  end if;
  return new;
end;
$$;
