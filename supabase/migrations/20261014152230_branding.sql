-- Personalización de marca por empresa: color, logo y textos de los correos y documentos.
-- Todas las columnas son opcionales; si están vacías se usa el aspecto por defecto de Ábaco.

alter table public.tenants
  add column brand_color text check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$'),
  add column logo_url text check (logo_url is null or (logo_url ~ '^https://' and char_length(logo_url) <= 500)),
  add column email_from_name text check (email_from_name is null or char_length(email_from_name) <= 80),
  add column email_signature text check (email_signature is null or char_length(email_signature) <= 500),
  add column invoice_email_intro text check (invoice_email_intro is null or char_length(invoice_email_intro) <= 1000),
  add column estimate_email_intro text check (estimate_email_intro is null or char_length(estimate_email_intro) <= 1000),
  add column document_footer text check (document_footer is null or char_length(document_footer) <= 500);
