-- A changed reusable section also changes every template that includes it.
-- This prevents applying content that changed after the user selected a template.
create function public.bump_contract_templates_for_section() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.contract_template_library
    set revision=revision+1, updated_at=clock_timestamp()
    where tenant_id=new.tenant_id and (new.id=any(before_ids) or new.id=any(after_ids));
  return new;
end $$;
revoke all on function public.bump_contract_templates_for_section() from public, anon, authenticated;
create trigger contract_template_section_revision after update on public.contract_template_sections
  for each row execute function public.bump_contract_templates_for_section();