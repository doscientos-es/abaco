-- Enlace público del presupuesto: el cliente lo abre sin cuenta y lo acepta o lo rechaza.
-- El token es un uuid aleatorio e imposible de adivinar. Solo lo lee la Edge Function public-estimate
-- (service role); el navegador del cliente nunca consulta la tabla directamente.

alter table public.estimates
  add column public_token uuid not null default gen_random_uuid(),
  add column responded_at timestamptz,
  add column responded_by text check (responded_by is null or char_length(responded_by) <= 120),
  add constraint estimates_public_token_key unique (public_token);
