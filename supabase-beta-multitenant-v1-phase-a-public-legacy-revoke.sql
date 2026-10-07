-- Sharawla POS — Phase A narrow public legacy RPC revoke
-- Beta only. Additive permission hardening; no schema cutover.

begin;

do $guard$
begin
  if current_setting('sharawla.multitenant_apply', true) is distinct from 'beta-only-approved' then
    raise exception 'MULTITENANT_V1_SOURCE_ONLY: explicit Beta apply guard is not set';
  end if;
end
$guard$;

revoke execute on function public.create_website_order(
  bigint,text,text,text,text,jsonb
) from anon;

revoke execute on function public.create_website_order(
  bigint,text,text,text,text,jsonb,text,text,text
) from anon;

commit;
