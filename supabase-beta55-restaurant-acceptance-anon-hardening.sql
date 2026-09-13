-- Sharawla POS 10.5.4-beta.55 — Restaurant acceptance helper privilege hardening
-- Sandbox-only acceptance helpers must never be callable by anon.
-- Final candidate gate: anon=false, authenticated=true for both helper RPCs.

begin;

revoke execute on function public.sharawla_beta55_restaurant_acceptance_fixture_v1(text,bigint) from anon;
revoke execute on function public.sharawla_beta55_restaurant_acceptance_cleanup_v1(text) from anon;

grant execute on function public.sharawla_beta55_restaurant_acceptance_fixture_v1(text,bigint) to authenticated;
grant execute on function public.sharawla_beta55_restaurant_acceptance_cleanup_v1(text) to authenticated;

commit;
