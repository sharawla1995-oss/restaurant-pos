-- Sharawla POS — Permissions V2 PV2-F5E
-- Final direct Orders UPDATE privilege closure.
-- SOURCE-ONLY. DO NOT DEPLOY from this artifact without the separate deployment gate.
begin;
select sharawla_internal.assert_operational_profile_v1('restaurant');

-- Remove the historical branch-wide authenticated UPDATE escape hatch.
drop policy if exists orders_branch_update on public.orders;
revoke update on table public.orders from authenticated;

-- Mutation remains available only through the specialized SECURITY DEFINER owners:
-- order_fulfillment_transition_v2, order_assign_driver_v2,
-- delivery_mark_delivered_v2, order_status_apply_offline_v2,
-- review_order_payment, and the accepted website/customer owners.
notify pgrst,'reload schema';
commit;
