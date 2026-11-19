-- Optional for legacy rows. Missing preferences preserve the original published look.
create function app_private.estimate_design_is_valid(design jsonb) returns boolean
language sql immutable strict set search_path = '' as $$
  select (
    jsonb_typeof(design) = 'object'
    and design ->> 'layout' in ('compact', 'proposal')
    and jsonb_typeof(design -> 'showIndex') = 'boolean'
    and jsonb_typeof(design -> 'showLogo') = 'boolean'
    and jsonb_typeof(design -> 'showFooter') = 'boolean'
    and design - array['layout', 'showIndex', 'showLogo', 'showFooter'] = '{}'::jsonb
  ) is true;
$$;
revoke all on function app_private.estimate_design_is_valid(jsonb) from public, anon;
grant execute on function app_private.estimate_design_is_valid(jsonb) to authenticated, service_role;

alter table public.tenants add column default_estimate_design jsonb
  constraint tenants_default_estimate_design_valid check (
    default_estimate_design is null or app_private.estimate_design_is_valid(default_estimate_design)
  );
alter table public.estimates add column document_design jsonb
  constraint estimates_document_design_valid check (
    document_design is null or app_private.estimate_design_is_valid(document_design)
  );

-- Keep the existing agreement and section validation, and freeze only the estimate's choices.
create or replace function public.estimate_publication_snapshot(p_estimate_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare captured jsonb := public.estimate_publication_snapshot_before_agreement(p_estimate_id);
declare design jsonb;
begin
  if captured is null then return null; end if;
  select e.document_design into design from public.estimates e where e.id = p_estimate_id;
  if design is not null then
    captured := jsonb_set(captured, '{estimate,document_design}', design);
  end if;
  return captured || jsonb_build_object('agreement', app_private.estimate_agreement_metadata(captured));
end;
$$;