-- Sharawla POS 10.5.4-beta.55
-- Explicit RPC execute hardening for Supabase default function privileges.
-- Keep service_role/authenticated access; deny anon/public invocation.

begin;

revoke execute on function public.delivery_mark_delivered_v2(bigint,text,text) from anon, public;
revoke execute on function public.delivery_driver_settle_v2(bigint,bigint[],text) from anon, public;
revoke execute on function public.delivery_driver_pending_v2(bigint) from anon, public;
revoke execute on function public.shift_cash_metrics_v2(bigint) from anon, public;
revoke execute on function public.close_pos_shift_v2(bigint,numeric,jsonb,text) from anon, public;
revoke execute on function public.sharawla_beta55_delivery_acceptance_fixture_v1(text,bigint) from anon, public;
revoke execute on function public.sharawla_beta55_delivery_acceptance_cleanup_v1(text) from anon, public;

grant execute on function public.delivery_mark_delivered_v2(bigint,text,text) to authenticated, service_role;
grant execute on function public.delivery_driver_settle_v2(bigint,bigint[],text) to authenticated, service_role;
grant execute on function public.delivery_driver_pending_v2(bigint) to authenticated, service_role;
grant execute on function public.shift_cash_metrics_v2(bigint) to authenticated, service_role;
grant execute on function public.close_pos_shift_v2(bigint,numeric,jsonb,text) to authenticated, service_role;
grant execute on function public.sharawla_beta55_delivery_acceptance_fixture_v1(text,bigint) to authenticated, service_role;
grant execute on function public.sharawla_beta55_delivery_acceptance_cleanup_v1(text) to authenticated, service_role;

notify pgrst,'reload schema';
commit;
