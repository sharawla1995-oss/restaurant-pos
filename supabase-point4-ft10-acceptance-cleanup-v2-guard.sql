CREATE OR REPLACE FUNCTION public.sharawla_acceptance_cleanup_v2(p_run_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_uid uuid:=auth.uid();
 v_orders bigint[]:=array[]::bigint[]; v_returns bigint[]:=array[]::bigint[]; v_ship bigint[]:=array[]::bigint[]; v_settle bigint[]:=array[]::bigint[];
 v_members bigint[]:=array[]::bigint[]; v_subs bigint[]:=array[]::bigint[]; v_classes bigint[]:=array[]::bigint[];
 v_jobs bigint[]:=array[]::bigint[]; v_appts bigint[]:=array[]::bigint[]; v_cp bigint[]:=array[]::bigint[];
 v_po bigint[]:=array[]::bigint[]; v_batches bigint[]:=array[]::bigint[]; v_rx bigint[]:=array[]::bigint[]; v_comp bigint[]:=array[]::bigint[];
 v_stock_drift int:=0; v_batch_nonzero int:=0; v_after jsonb; v_ownership jsonb:='[]'::jsonb; v_guard record;
begin
 if v_uid is null or not exists(select 1 from public.employees e where e.auth_user_id=v_uid and e.active=true) then raise exception 'ACCEPTANCE_AUTH_REQUIRED'; end if;
 if p_run_id is null or p_run_id !~ '^ACC-[0-9]{8}-[0-9]{6}-[A-Z0-9]{5}$' then raise exception 'ACCEPTANCE_RUN_ID_INVALID'; end if;

 select count(*) into v_stock_drift from (select branch_id,product_id,sum(quantity_delta) q from public.retail_inventory_movements where client_tx_id like p_run_id||'%' group by branch_id,product_id having abs(sum(quantity_delta))>.0005) s;
 if v_stock_drift>0 then raise exception 'ACCEPTANCE_CLEANUP_STOCK_NOT_ZERO:%',v_stock_drift; end if;
 select count(*) into v_batch_nonzero from public.pharmacy_batches where batch_no=p_run_id||'-BATCH' and abs(quantity)>.0005;
 if v_batch_nonzero>0 then raise exception 'ACCEPTANCE_CLEANUP_PHARMACY_BATCH_NOT_ZERO:%',v_batch_nonzero; end if;

 -- Point 4: freeze complete acceptance retail ownership set after both zero-state gates and before first cleanup commitment.
 select coalesce(jsonb_agg(jsonb_build_object('branch_id',branch_id,'product_id',product_id) order by branch_id,product_id),'[]'::jsonb)
 into v_ownership from (
   select distinct branch_id,product_id from public.retail_inventory_movements
   where client_tx_id like p_run_id||'%' and branch_id is not null and product_id is not null
 ) x;
 for v_guard in select (x->>'branch_id')::bigint branch_id,(x->>'product_id')::bigint product_id
   from jsonb_array_elements(v_ownership) x order by 1,2
 loop
   perform public.inventory_stock_assert_legacy_write_allowed_v2(v_guard.branch_id,'product',v_guard.product_id);
 end loop;

 select coalesce(array_agg(id),array[]::bigint[]) into v_returns from public.returns where client_tx_id like p_run_id||'%';
 select coalesce(array_agg(id),array[]::bigint[]) into v_orders from public.orders where client_tx_id like p_run_id||'%';
 select coalesce(array_agg(id),array[]::bigint[]) into v_ship from public.logistics_shipments_v1 where client_tx_id like p_run_id||'%';
 select coalesce(array_agg(id),array[]::bigint[]) into v_settle from public.logistics_client_settlements_v1 where client_tx_id like p_run_id||'%';
 select coalesce(array_agg(id),array[]::bigint[]) into v_members from public.membership_members_v1 where notes='SHARAWLA_ACCEPTANCE:'||p_run_id;
 select coalesce(array_agg(id),array[]::bigint[]) into v_subs from public.membership_subscriptions_v1 where client_tx_id like p_run_id||'%';
 select coalesce(array_agg(id),array[]::bigint[]) into v_classes from public.membership_classes_v1 where name='SHARAWLA_ACCEPTANCE:'||p_run_id;
 select coalesce(array_agg(id),array[]::bigint[]) into v_jobs from public.service_jobs_v1 where client_tx_id like p_run_id||'%';
 select coalesce(array_agg(id),array[]::bigint[]) into v_appts from public.service_appointments_v1 where client_tx_id like p_run_id||'%';
 select coalesce(array_agg(id),array[]::bigint[]) into v_cp from public.service_customer_packages_v1 where client_tx_id like p_run_id||'%';
 select coalesce(array_agg(id),array[]::bigint[]) into v_po from public.retail_purchase_orders where client_tx_id like p_run_id||'%';
 select coalesce(array_agg(id),array[]::bigint[]) into v_batches from public.pharmacy_batches where batch_no=p_run_id||'-BATCH';
 select coalesce(array_agg(id),array[]::bigint[]) into v_rx from public.pharmacy_prescriptions where notes='SHARAWLA_ACCEPTANCE:'||p_run_id;
 select coalesce(array_agg(id),array[]::bigint[]) into v_comp from public.pharmacy_insurance_companies where code=p_run_id||'-INS';

 -- Logistics children before parents.
 delete from public.logistics_client_settlement_items_v1 where settlement_id=any(v_settle) or shipment_id=any(v_ship);
 delete from public.logistics_client_settlements_v1 where id=any(v_settle);
 delete from public.logistics_cod_events_v1 where shipment_id=any(v_ship) or client_tx_id like p_run_id||'%';
 delete from public.logistics_returns_v1 where shipment_id=any(v_ship);
 delete from public.logistics_pickup_requests_v1 where client_tx_id like p_run_id||'%';
 delete from public.logistics_shipments_v1 where id=any(v_ship);

 -- Membership children before subscription/member/plan/class.
 delete from public.membership_bookings_v1 where member_id=any(v_members) or class_id=any(v_classes) or client_tx_id like p_run_id||'%';
 delete from public.membership_checkins_v1 where member_id=any(v_members) or subscription_id=any(v_subs) or client_tx_id like p_run_id||'%';
 delete from public.membership_renewal_events_v1 where subscription_id=any(v_subs) or client_tx_id like p_run_id||'%';
 delete from public.membership_freezes_v1 where subscription_id=any(v_subs);
 delete from public.membership_subscriptions_v1 where id=any(v_subs) or member_id=any(v_members);
 delete from public.membership_classes_v1 where id=any(v_classes);
 delete from public.membership_members_v1 where id=any(v_members);
 delete from public.membership_plans_v1 where code=p_run_id||'-PLAN';

 -- Service children before jobs/appointments/packages/assets/catalog/customer.
 delete from public.service_package_usage_v1 where customer_package_id=any(v_cp) or job_id=any(v_jobs) or appointment_id=any(v_appts) or client_tx_id like p_run_id||'%';
 delete from public.service_installations_v1 where job_id=any(v_jobs);
 delete from public.service_job_parts_v1 where job_id=any(v_jobs);
 delete from public.service_warranties_v1 where customer_id in (select id from public.customers where notes='SHARAWLA_ACCEPTANCE:'||p_run_id) or terms='SHARAWLA_ACCEPTANCE:'||p_run_id;
 delete from public.service_jobs_v1 where id=any(v_jobs);
 delete from public.service_appointments_v1 where id=any(v_appts);
 delete from public.service_customer_packages_v1 where id=any(v_cp) or client_tx_id like p_run_id||'%';
 delete from public.service_assets_v1 where metadata->>'acceptance_run'=p_run_id;
 delete from public.service_packages_v1 where code=p_run_id||'-PKG';
 delete from public.service_catalog where code=p_run_id||'-SVC';

 -- Pharmacy test-created records. Batch must be back to zero before deletion.
 delete from public.pharmacy_prescription_items where prescription_id=any(v_rx);
 delete from public.pharmacy_prescriptions where id=any(v_rx);
 delete from public.pharmacy_order_batch_allocations where batch_id=any(v_batches) and order_id=any(v_orders);
 delete from public.pharmacy_batches where id=any(v_batches);
 delete from public.pharmacy_insurance_plans where company_id=any(v_comp) or code=p_run_id||'-PLAN';
 delete from public.pharmacy_insurance_companies where id=any(v_comp);

 -- Warehouse / purchasing test-created draft POs only; received inventory must net to zero first.
 delete from public.retail_goods_receipt_items where goods_receipt_id in (select id from public.retail_goods_receipts where purchase_order_id=any(v_po) and client_tx_id like p_run_id||'%');
 delete from public.retail_goods_receipts where purchase_order_id=any(v_po) and client_tx_id like p_run_id||'%';
 delete from public.retail_purchase_order_items where purchase_order_id=any(v_po);
 delete from public.retail_purchase_orders where id=any(v_po);

 -- Generic orders/returns/expenses after profile children are gone.
 delete from public.return_payments where return_id=any(v_returns);
 delete from public.return_items where return_id=any(v_returns);
 delete from public.returns where id=any(v_returns);
 delete from public.order_item_modifiers where order_item_id in(select id from public.order_items where order_id=any(v_orders));
 delete from public.order_payments where order_id=any(v_orders);
 delete from public.order_items where order_id=any(v_orders);
 delete from public.orders where id=any(v_orders);
 delete from public.expenses where client_tx_id like p_run_id||'%';
 delete from public.retail_inventory_movements where client_tx_id like p_run_id||'%';
 delete from public.offline_v2_server_receipts where client_tx_id like p_run_id||'%';

 delete from public.customers c where c.notes='SHARAWLA_ACCEPTANCE:'||p_run_id
   and not exists(select 1 from public.orders o where o.customer_id=c.id)
   and not exists(select 1 from public.logistics_shipments_v1 l where l.client_customer_id=c.id)
   and not exists(select 1 from public.logistics_pickup_requests_v1 l where l.client_customer_id=c.id)
   and not exists(select 1 from public.logistics_client_settlements_v1 l where l.client_customer_id=c.id)
   and not exists(select 1 from public.membership_members_v1 m where m.customer_id=c.id)
   and not exists(select 1 from public.service_appointments_v1 s where s.customer_id=c.id)
   and not exists(select 1 from public.service_jobs_v1 s where s.customer_id=c.id)
   and not exists(select 1 from public.service_assets_v1 s where s.customer_id=c.id)
   and not exists(select 1 from public.service_customer_packages_v1 s where s.customer_id=c.id)
   and not exists(select 1 from public.service_warranties_v1 s where s.customer_id=c.id);

 v_after:=public.sharawla_acceptance_scan_v2(p_run_id);
 return jsonb_build_object('ok',coalesce((v_after->>'total')::int,0)=0,'run_id',p_run_id,'after',v_after);
end;
$function$
