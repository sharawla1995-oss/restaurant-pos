-- Sharawla Beta58.13 — Shift Runtime Ownership + Legacy Close Custody Guard
-- Beta backend only. Hardens the legacy idempotent close RPC so no runtime path
-- can close an open shift while that source shift still owns unsettled driver cash.

create or replace function public.close_pos_shift_idempotent(
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
  v_unsettled numeric(12,2);
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  v_emp:=public.current_employee_id(); if v_emp is null then raise exception 'تعذر تحديد الموظف الحالي'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_key,0));
  select * into v_row from public.shifts where client_close_tx_id=v_key limit 1;
  if found then return to_jsonb(v_row); end if;

  select * into v_row from public.shifts where id=p_shift_id and employee_id=v_emp for update;
  if not found then raise exception 'الوردية غير موجودة أو غير مطابقة للموظف'; end if;
  if v_row.status='closed' and v_row.closed_at is not null then return to_jsonb(v_row); end if;

  v_cash:=public.shift_cash_metrics_v2(p_shift_id);
  v_unsettled:=coalesce((v_cash->>'driver_custody_unsettled')::numeric,0);
  if v_unsettled>0.005 then
    raise exception 'يوجد عهدة مناديب غير مسواة بقيمة % — سوّي العهدة قبل قفل الوردية', round(v_unsettled,2);
  end if;

  update public.shifts set
    closing_cash=p_closing_cash,
    closed_at=now(),
    status='closed',
    closed_by_employee_id=v_emp,
    sales_total=coalesce((p_metrics->>'sales_total')::numeric,0),
    cash_sales=coalesce((p_metrics->>'cash_sales')::numeric,0),
    wallet_sales=coalesce((p_metrics->>'wallet_sales')::numeric,0),
    instapay_sales=coalesce((p_metrics->>'instapay_sales')::numeric,0),
    expenses_total=coalesce((p_metrics->>'expenses_total')::numeric,0),
    expected_cash=coalesce((p_metrics->>'expected_cash')::numeric,0),
    cash_difference=coalesce((p_metrics->>'cash_difference')::numeric,0),
    orders_count=coalesce((p_metrics->>'orders_count')::integer,0),
    client_close_tx_id=v_key
  where id=p_shift_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;
