-- Issuance already copies the tenant's choice into the immutable invoice snapshot.
set local lock_timeout = '3s';

alter table public.tenants
  drop constraint tenants_default_invoice_design_check,
  add constraint tenants_default_invoice_design_check
    check (default_invoice_design is null or default_invoice_design in ('classic', 'modern', 'minimal', 'artistic'));
