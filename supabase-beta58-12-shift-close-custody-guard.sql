-- Sharawla Beta58.12 — Shift Close Pending Driver Custody Guard
-- Beta backend only. Additive CREATE OR REPLACE on close_pos_shift_v2.
-- Blocks shift closure while delivered cash custody from that source shift is still unsettled.

begin;

create or replace function public.close_pos_shift_v2(
  p_shift_id bigint,
  p_closing_cash numeric,
  p_metrics jsonb,
  p_client_tx_id text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_emp bigint;
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_row public.shifts%rowtype;
  v_cash jsonb;
  v_expected numeric(12,2);
  v_diff numeric(12,2);
  v_unsettled numeric(12,2);
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  v_emp:=public.current_employee_id(); if v_emp is null then raise exception 'تعذر تحديد الموظف الحالي'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  if coalesce(p_closing_cash,-1)<0 then raise exception 'الكاش الفعلي غير صحيح'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_key,0));
  select * into v_row from public.shifts where client_close_tx_id=v_key limit 1;
  if found then return to_jsonb(v_row); end if;

  select * into v_row from public.shifts where id=p_shift_id and employee_id=v_emp for update;
  if not found then raise exception 'الوردية غير موجودة أو غير مطابقة للموظف'; end if;
  if not public.has_branch_access(v_row.branch_id) then raise exception 'ليس لديك صلاحية على هذا الفرع'; end if;
  if v_row.status='closed' and v_row.closed_at is not null then return to_jsonb(v_row); end if;

  v_cash:=public.shift_cash_metrics_v2(p_shift_id);
  v_unsettled:=coalesce((v_cash->>'driver_custody_unsettled')::numeric,0);
  if v_unsettled>0.005 then
    raise exception 'يوجد عهدة مناديب غير مسواة بقيمة % — سوّي العهدة قبل قفل الوردية', round(v_unsettled,2);
  end if;

  v_expected:=coalesce((v_cash->>'expected_drawer_cash')::numeric,0);
  v_diff:=round(p_closing_cash-v_expected,2);

  update public.shifts set
    closing_cash=p_closing_cash,closed_at=now(),status='closed',closed_by_employee_id=v_emp,
    sales_total=coalesce((p_metrics->>'sales_total')::numeric,0),
    cash_sales=coalesce((v_cash->>'cash_sales_net')::numeric,0),
    wallet_sales=coalesce((p_metrics->>'wallet_sales')::numeric,0),
    instapay_sales=coalesce((p_metrics->>'instapay_sales')::numeric,0),
    expenses_total=coalesce((v_cash->>'expenses')::numeric,0),
    expected_cash=v_expected,cash_difference=v_diff,
    orders_count=coalesce((p_metrics->>'orders_count')::integer,0),
    client_close_tx_id=v_key,
    cash_sales_gross=coalesce((v_cash->>'cash_sales_gross')::numeric,0),
    cash_returns_total=coalesce((v_cash->>'cash_returns')::numeric,0),
    delivery_cash_originated=coalesce((v_cash->>'delivery_cash_originated')::numeric,0),
    driver_custody_unsettled=v_unsettled,
    driver_settlements_received=coalesce((v_cash->>'driver_settlements_received')::numeric,0)
  where id=p_shift_id returning * into v_row;

  insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
  values(v_emp,v_row.branch_id,'close_pos_shift_v2','shift',v_row.id,
    jsonb_build_object('expected_drawer_cash',v_expected,'closing_cash',p_closing_cash,'cash_difference',v_diff,
      'driver_custody_unsettled',v_row.driver_custody_unsettled,'driver_settlements_received',v_row.driver_settlements_received,'client_tx_id',v_key));

  return to_jsonb(v_row);
end;
$$;

commit;
