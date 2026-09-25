CREATE OR REPLACE FUNCTION public.sharawla_acceptance_cleanup_v1(p_run_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_orders bigint[];
  v_returns bigint[];
  v_deleted_orders int := 0;
  v_deleted_returns int := 0;
  v_deleted_expenses int := 0;
  v_deleted_customers int := 0;
  v_deleted_movements int := 0;
  v_deleted_receipts int := 0;
  v_stock_drift int := 0;
  v_after jsonb;
begin
  if v_uid is null or not exists(select 1 from public.employees e where e.auth_user_id=v_uid and e.active=true) then raise exception 'ACCEPTANCE_AUTH_REQUIRED'; end if;
  if p_run_id is null or p_run_id !~ '^ACC-[0-9]{8}-[0-9]{6}-[A-Z0-9]{5}$' then raise exception 'ACCEPTANCE_RUN_ID_INVALID'; end if;

  select count(*) into v_stock_drift from (
    select branch_id,product_id,sum(quantity_delta) q
      from public.retail_inventory_movements
     where client_tx_id like p_run_id || '%'
     group by branch_id,product_id
    having abs(sum(quantity_delta)) > 0.0005
  ) s;
  if v_stock_drift>0 then raise exception 'ACCEPTANCE_CLEANUP_STOCK_NOT_ZERO:%',v_stock_drift; end if;

  select coalesce(array_agg(id),array[]::bigint[]) into v_returns from public.returns where client_tx_id like p_run_id || '%';
  select coalesce(array_agg(id),array[]::bigint[]) into v_orders from public.orders where client_tx_id like p_run_id || '%';
  delete from public.return_payments where return_id = any(v_returns);
  delete from public.return_items where return_id = any(v_returns);
  delete from public.returns where id = any(v_returns); get diagnostics v_deleted_returns = row_count;
  delete from public.order_item_modifiers where order_item_id in (select id from public.order_items where order_id = any(v_orders));
  delete from public.order_payments where order_id = any(v_orders);
  delete from public.order_items where order_id = any(v_orders);
  delete from public.orders where id = any(v_orders); get diagnostics v_deleted_orders = row_count;
  delete from public.expenses where client_tx_id like p_run_id || '%'; get diagnostics v_deleted_expenses = row_count;
  delete from public.retail_inventory_movements where client_tx_id like p_run_id || '%'; get diagnostics v_deleted_movements = row_count;
  delete from public.offline_v2_server_receipts where client_tx_id like p_run_id || '%'; get diagnostics v_deleted_receipts = row_count;
  delete from public.customers c where c.notes='SHARAWLA_ACCEPTANCE:'||p_run_id
    and not exists(select 1 from public.orders o where o.customer_id=c.id)
    and not exists(select 1 from public.logistics_shipments_v1 l where l.client_customer_id=c.id)
    and not exists(select 1 from public.logistics_pickup_requests_v1 l where l.client_customer_id=c.id)
    and not exists(select 1 from public.logistics_client_settlements_v1 l where l.client_customer_id=c.id)
    and not exists(select 1 from public.service_appointments_v1 s where s.customer_id=c.id)
    and not exists(select 1 from public.service_jobs_v1 s where s.customer_id=c.id);
  get diagnostics v_deleted_customers = row_count;
  v_after := public.sharawla_acceptance_scan_v1(p_run_id);
  return jsonb_build_object('ok',coalesce((v_after->>'total')::int,0)=0,'run_id',p_run_id,'stock_drift',v_stock_drift,'deleted',jsonb_build_object('orders',v_deleted_orders,'returns',v_deleted_returns,'expenses',v_deleted_expenses,'customers',v_deleted_customers,'inventory_movements',v_deleted_movements,'offline_receipts',v_deleted_receipts),'after',v_after);
end;
$function$
