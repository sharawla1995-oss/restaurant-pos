-- Disposable PostgreSQL 16 fixture ONLY. No connection to real Supabase.
ALTER TABLE public.orders ADD COLUMN shift_id bigint;
ALTER TABLE public.orders ADD COLUMN total numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN status text NOT NULL DEFAULT 'completed';
ALTER TABLE public.orders ADD COLUMN source text NOT NULL DEFAULT 'pos';
ALTER TABLE public.orders ADD COLUMN payment_status text NOT NULL DEFAULT 'confirmed';
ALTER TABLE public.orders ADD COLUMN payment_method text NOT NULL DEFAULT 'cash';

CREATE TABLE public.order_payments(order_id bigint,method text,amount numeric);
CREATE TABLE public.returns(id bigint PRIMARY KEY,shift_id bigint,total numeric);
CREATE TABLE public.return_payments(return_id bigint,method text,amount numeric);
CREATE TABLE public.shifts(
 id bigint PRIMARY KEY,branch_id bigint NOT NULL,employee_id bigint NOT NULL,
 status text NOT NULL,closed_at timestamptz,opening_cash numeric NOT NULL,
 closing_cash numeric,expected_cash numeric,client_close_tx_id text
);
INSERT INTO public.shifts(id,branch_id,employee_id,status,opening_cash)
VALUES(5001,22,1001,'open',50),(5002,22,1001,'open',25),(5003,23,1001,'open',10),
      (5004,22,1001,'open',40),(5005,22,1001,'open',45);

-- Test fixture returns frozen metrics; production resolves through the
-- existing real shift_cash_metrics_v2 instead of trusting browser figures.
CREATE OR REPLACE FUNCTION public.shift_cash_metrics_v2(p_shift_id bigint)
RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
  'shift_id',s.id,'branch_id',s.branch_id,
  'expected_drawer_cash',s.opening_cash,
  'expenses',0,'cash_sales_net',0,
  'driver_custody_unsettled',
    CASE WHEN current_setting('tc_test.unsettled',true)='yes' THEN 9 ELSE 0 END
 ) FROM public.shifts s WHERE id=p_shift_id
$$;

CREATE OR REPLACE FUNCTION public.close_pos_shift_idempotent(
 p_shift_id bigint,p_closing_cash numeric,p_metrics jsonb,p_client_tx_id text
) RETURNS jsonb LANGUAGE plpgsql AS $fixture$
DECLARE v_shift public.shifts%ROWTYPE;
BEGIN
 PERFORM pg_sleep(0.5); -- deliberate race window, disposable fixture only
 UPDATE public.shifts SET status='closed',closed_at=now(),closing_cash=p_closing_cash,
  expected_cash=(p_metrics->>'expected_cash')::numeric,client_close_tx_id=p_client_tx_id
 WHERE id=p_shift_id RETURNING * INTO v_shift;
 IF v_shift.id IS NULL THEN RAISE EXCEPTION 'CLOSE_MOCK_NOT_FOUND'; END IF;
 RETURN to_jsonb(v_shift);
END;
$fixture$;
