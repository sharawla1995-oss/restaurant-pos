-- Sharawla POS — Phase B internal/legacy authenticated surface closure
-- Beta only. Keep service_role/database-owner capability intact.

begin;

revoke execute on function public.activate_sharawla_license(text,text,text,text) from authenticated;
revoke execute on function public.cancel_retail_website_order_customer_identity_v1(text,text,text) from authenticated;
revoke execute on function public.create_sharawla_license(text,text,integer,timestamp with time zone,integer) from authenticated;
revoke execute on function public.create_website_order(bigint,text,text,text,text,jsonb) from authenticated;
revoke execute on function public.create_website_order(bigint,text,text,text,text,jsonb,text,text,text) from authenticated;
revoke execute on function public.offline_v2_emit_customer_address_event() from authenticated;
revoke execute on function public.offline_v2_emit_customer_event() from authenticated;
revoke execute on function public.offline_v2_emit_order_event() from authenticated;
revoke execute on function public.reset_pos_data(text[]) from authenticated;
revoke execute on function public.sharawla_acceptance_cleanup_v1(text) from authenticated;
revoke execute on function public.sharawla_acceptance_cleanup_v2(text) from authenticated;
revoke execute on function public.sharawla_acceptance_cleanup_v3(text) from authenticated;
revoke execute on function public.sharawla_acceptance_customer_delete_cleanup_v1() from authenticated;
revoke execute on function public.sharawla_acceptance_reconcile_v1(text) from authenticated;
revoke execute on function public.sharawla_acceptance_scan_v1(text) from authenticated;
revoke execute on function public.sharawla_acceptance_scan_v2(text) from authenticated;
revoke execute on function public.sharawla_acceptance_scan_v3(text) from authenticated;
revoke execute on function public.verify_sharawla_activation(uuid,text,text) from authenticated;

commit;
