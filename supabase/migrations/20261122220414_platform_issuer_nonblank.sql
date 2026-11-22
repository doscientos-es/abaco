-- PostgreSQL btrim alone does not remove tabs or newlines. Reject blank fiscal names and addresses.
alter table app_private.platform_invoice_issuer add constraint platform_invoice_issuer_nonblank
  check (profile is null or (
    coalesce(profile->>'legal_name', '') ~ '[^[:space:]]'
    and coalesce(profile->>'street', '') ~ '[^[:space:]]'
    and coalesce(profile->>'city', '') ~ '[^[:space:]]'
    and coalesce(profile->>'province', '') ~ '[^[:space:]]'
  ));