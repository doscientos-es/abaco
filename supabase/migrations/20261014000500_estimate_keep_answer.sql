-- Una copia desactualizada del editor no puede deshacer la respuesta del cliente:
-- si el presupuesto ya fue aceptado o rechazado desde el enlace público, el estado se conserva.

create or replace function public.estimates_keep_client_answer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.responded_at is not null and old.status in ('accepted', 'rejected') then
    new.status := old.status;
  end if;
  return new;
end;
$$;

create trigger estimates_keep_client_answer
  before update on public.estimates
  for each row execute function public.estimates_keep_client_answer();
