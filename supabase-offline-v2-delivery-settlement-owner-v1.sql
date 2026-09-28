-- SOURCE ONLY. Do not deploy without explicit authorization.
-- Freezes the receiving shift and explicit order set before replaying driver custody settlement.
create or replace function public.offline_delivery_driver_settle_v1(p_driver_id bigint,p_order_ids bigint[],p_expected_receiving_shift_id bigint,p_client_tx_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_emp bigint;v_open bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;
 if nullif(trim(coalesce(p_client_tx_id,'')),'') is null then raise exception 'OFFLINE_DELIVERY_SETTLEMENT_TX_REQUIRED';end if;
 if p_order_ids is null or cardinality(p_order_ids)=0 then raise exception 'OFFLINE_DELIVERY_SETTLEMENT_EXPLICIT_ORDERS_REQUIRED';end if;
 if p_expected_receiving_shift_id is null then raise exception 'OFFLINE_DELIVERY_SETTLEMENT_SHIFT_REQUIRED';end if;
 v_emp:=public.current_employee_id();if v_emp is null then raise exception 'OFFLINE_DELIVERY_SETTLEMENT_EMPLOYEE_REQUIRED';end if;
 select s.id into v_open from public.shifts s join public.delivery_drivers d on d.id=p_driver_id and d.branch_id=s.branch_id where s.id=p_expected_receiving_shift_id and s.employee_id=v_emp and s.status='open' and s.closed_at is null limit 1;
 if v_open is null then raise exception 'OFFLINE_DELIVERY_SETTLEMENT_SHIFT_CHANGED';end if;
 v_result:=public.delivery_driver_settle_v2(p_driver_id,p_order_ids,p_client_tx_id);
 if coalesce((v_result->>'receiving_shift_id')::bigint,0)<>p_expected_receiving_shift_id then raise exception 'OFFLINE_DELIVERY_SETTLEMENT_SHIFT_DRIFT';end if;
 return v_result;
end;$$;
revoke all on function public.offline_delivery_driver_settle_v1(bigint,bigint[],bigint,text) from public,anon;
grant execute on function public.offline_delivery_driver_settle_v1(bigint,bigint[],bigint,text) to authenticated;
