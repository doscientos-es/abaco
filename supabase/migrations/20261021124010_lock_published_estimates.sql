-- A sent proposal keeps the exact content the client saw. A revision must be a new draft
-- until immutable proposal versions are introduced in the commercial phase.
create function public.protect_published_estimate() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Un presupuesto enviado o respondido no se elimina';
    end if;
    return old;
  end if;

  if old.status <> 'draft' then
    if to_jsonb(new) - 'status' - 'responded_at' - 'responded_by' - 'viewed_at'
      - 'followup_sent_at' - 'reminder_sent_at' - 'sent_at' - 'email_sent_at' - 'updated_at'
      is distinct from
       to_jsonb(old) - 'status' - 'responded_at' - 'responded_by' - 'viewed_at'
      - 'followup_sent_at' - 'reminder_sent_at' - 'sent_at' - 'email_sent_at' - 'updated_at' then
      raise exception 'El contenido de un presupuesto enviado es inmutable; crea una copia';
    end if;
    if old.status = 'sent' and new.status not in ('sent', 'accepted', 'rejected') then
      raise exception 'Transición de presupuesto no permitida';
    end if;
    if old.status = 'sent' and new.status in ('accepted', 'rejected')
       and current_user = 'authenticated' then
      raise exception 'La respuesta del cliente requiere una operación de servidor';
    end if;
    if old.status in ('accepted', 'rejected') and (
      new.status is distinct from old.status
      or new.responded_at is distinct from old.responded_at
      or new.responded_by is distinct from old.responded_by
    ) then
      raise exception 'La respuesta del cliente es inmutable';
    end if;
  end if;
  return new;
end;
$$;

create trigger estimates_protect_published before update or delete on public.estimates
  for each row execute function public.protect_published_estimate();

create function public.protect_published_estimate_child() returns trigger
language plpgsql set search_path = ''
as $$
declare
  source_status text;
  target_status text;
begin
  if tg_op <> 'INSERT' then
    select status into source_status from public.estimates where id = old.estimate_id for update;
    if source_status <> 'draft' then
      raise exception 'Las partidas e hitos de un presupuesto enviado son inmutables';
    end if;
  end if;
  if tg_op <> 'DELETE' then
    select status into target_status from public.estimates where id = new.estimate_id for update;
    if target_status <> 'draft' then
      raise exception 'Las partidas e hitos de un presupuesto enviado son inmutables';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger estimate_lines_protect_published
  before insert or update or delete on public.estimate_lines
  for each row execute function public.protect_published_estimate_child();
create trigger estimate_milestones_protect_published
  before insert or update or delete on public.estimate_milestones
  for each row execute function public.protect_published_estimate_child();

revoke execute on function public.protect_published_estimate() from public, anon, authenticated;
revoke execute on function public.protect_published_estimate_child() from public, anon, authenticated;
