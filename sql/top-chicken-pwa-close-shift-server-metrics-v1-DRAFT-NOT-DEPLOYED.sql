-- DRAFT / SOURCE ONLY. DO NOT RUN ON SUPABASE WITHOUT E2E REVIEW.
-- Top Chicken Beta, Branch 22 only. No changes to Windows or Top Burger.
BEGIN;

CREATE TABLE IF NOT EXISTS public.top_chicken_pwa_shift_close_receipts_v1 (
  business_id uuid NOT NULL,
  branch_id bigint NOT NULL CHECK(branch_id=22),
  actor_uid uuid NOT NULL,
  shift_id bigint NOT NULL,
  client_tx_id text NOT NULL,
  payload_digest text NOT NULL CHECK(payload_digest ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(business_id,client_tx_id)
);
ALTER TABLE public.top_chicken_pwa_shift_close_receipts_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.top_chicken_pwa_shift_close_receipts_v1 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.top_chicken_pwa_close_shift_v1(
  p_shift_id bigint,
  p_closing_cash numeric,
  p_client_tx_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public
AS $tc_close$
DECLARE
  v_business constant uuid := '5358328c-9724-49aa-affc-1bce8be90f92';
  v_actor uuid:=auth.uid();
  v_emp bigint;
  v_tx text:=lower(trim(coalesce(p_client_tx_id,'')));
  v_shift public.shifts%ROWTYPE;
  v_receipt public.top_chicken_pwa_shift_close_receipts_v1%ROWTYPE;
  v_digest text;
  v_cash jsonb;
  v_result jsonb;
  v_expected numeric;
  v_sales numeric;
  v_count integer;
  v_exp numeric;
  v_wallet numeric;
  v_instapay numeric;
BEGIN
  IF v_actor IS NULL OR public.current_business_id() IS DISTINCT FROM v_business
  THEN RAISE EXCEPTION 'Top Chicken Beta tenant not authorized'; END IF;
  v_emp:=public.current_employee_id();
  IF v_emp IS NULL OR NOT public.has_branch_access(22)
  THEN RAISE EXCEPTION 'Branch 22 actor not authorized'; END IF;
  IF v_tx !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION 'Invalid transaction key'; END IF;
  IF p_shift_id IS NULL OR p_shift_id<=0 OR p_closing_cash IS NULL
     OR p_closing_cash<0 OR p_closing_cash>100000000
  THEN RAISE EXCEPTION 'Invalid closing cash or shift'; END IF;
  v_digest:=encode(sha256(convert_to(
    jsonb_build_object('shift_id',p_shift_id,'closing_cash',p_closing_cash)::text,'UTF8'
  )),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'tc-pwa-close-v1:'||v_business::text||':'||v_tx,0));
  SELECT * INTO v_receipt
  FROM public.top_chicken_pwa_shift_close_receipts_v1
  WHERE business_id=v_business AND client_tx_id=v_tx;
  IF FOUND THEN
    IF v_receipt.actor_uid<>v_actor OR v_receipt.shift_id<>p_shift_id
       OR v_receipt.payload_digest<>v_digest
    THEN RAISE EXCEPTION 'SHIFT_CLOSE_REPLAY_CONFLICT'; END IF;
    RETURN v_receipt.result;
  END IF;
  SELECT * INTO v_shift FROM public.shifts
  WHERE id=p_shift_id AND branch_id=22 AND employee_id=v_emp FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift actor/branch mismatch'; END IF;
  IF v_shift.status<>'open' OR v_shift.closed_at IS NOT NULL
  THEN RAISE EXCEPTION 'Shift not open; reconcile before retry'; END IF;

  -- This owner already calculates real paid cash, returned cash, expenses,
  -- delivery driver custody and settlements server-side.
  v_cash:=public.shift_cash_metrics_v2(p_shift_id);
  IF (v_cash->>'shift_id')::bigint IS DISTINCT FROM p_shift_id
     OR (v_cash->>'branch_id')::bigint IS DISTINCT FROM 22
  THEN RAISE EXCEPTION 'Server cash metrics mismatch'; END IF;
  IF coalesce((v_cash->>'driver_custody_unsettled')::numeric,0)>0.005
  THEN RAISE EXCEPTION 'DRIVER_CUSTODY_UNSETTLED'; END IF;
  v_expected:=(v_cash->>'expected_drawer_cash')::numeric;
  IF v_expected IS NULL THEN RAISE EXCEPTION 'SERVER_EXPECTED_CASH_MISSING'; END IF;
  v_exp:=(v_cash->>'expenses')::numeric;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'SERVER_EXPENSES_MISSING'; END IF;

  -- Correct for cancelled/unconfirmed website orders; match the active POS
  -- reporting scope, but compute from server rows (NEVER client p_metrics).
  WITH valid_orders AS (
    SELECT o.*
    FROM public.orders o WHERE o.shift_id=p_shift_id
      AND o.status<>'cancelled'
      AND (coalesce(o.source,'pos')<>'website'
         OR o.payment_status='confirmed'
         OR (lower(coalesce(o.payment_method,''))='cash'
             AND o.status IN ('delivered','completed')))
  )
  SELECT coalesce(sum(total),0),count(*)::integer
  INTO v_sales,v_count FROM valid_orders;

  v_sales:=v_sales-coalesce((
    SELECT sum(r.total) FROM public.returns r WHERE r.shift_id=p_shift_id),0);

  WITH valid_orders AS (
    SELECT o.* FROM public.orders o WHERE o.shift_id=p_shift_id
      AND o.status<>'cancelled'
      AND (coalesce(o.source,'pos')<>'website'
         OR o.payment_status='confirmed'
         OR (lower(coalesce(o.payment_method,''))='cash'
             AND o.status IN ('delivered','completed')))
  ), payments AS (
    SELECT lower(op.method) AS method,op.amount
    FROM valid_orders o JOIN public.order_payments op ON op.order_id=o.id
    UNION ALL
    SELECT lower(o.payment_method),o.total
    FROM valid_orders o WHERE NOT EXISTS
      (SELECT 1 FROM public.order_payments op WHERE op.order_id=o.id)
    UNION ALL
    SELECT lower(rp.method),-rp.amount
    FROM public.returns r JOIN public.return_payments rp ON rp.return_id=r.id
    WHERE r.shift_id=p_shift_id
  )
  SELECT coalesce(sum(amount) FILTER(WHERE method='wallet'),0),
         coalesce(sum(amount) FILTER(WHERE method='instapay'),0)
  INTO v_wallet,v_instapay FROM payments;

  v_result:=public.close_pos_shift_idempotent(p_shift_id,p_closing_cash,
    jsonb_build_object(
      'sales_total',round(v_sales,2),
      'cash_sales',coalesce((v_cash->>'cash_sales_net')::numeric,0),
      'wallet_sales',round(v_wallet,2),
      'instapay_sales',round(v_instapay,2),
      'expenses_total',v_exp,
      'expected_cash',v_expected,
      'cash_difference',round(p_closing_cash-v_expected,2),
      'orders_count',v_count
    ),v_tx);
  IF (v_result->>'id')::bigint IS DISTINCT FROM p_shift_id
     OR v_result->>'status'<>'closed'
     OR (v_result->>'branch_id')::bigint IS DISTINCT FROM 22
     OR (v_result->>'employee_id')::bigint IS DISTINCT FROM v_emp
  THEN RAISE EXCEPTION 'CANONICAL_SHIFT_CLOSE_UNVERIFIED'; END IF;

  INSERT INTO public.top_chicken_pwa_shift_close_receipts_v1
    (business_id,branch_id,actor_uid,shift_id,client_tx_id,payload_digest,result)
  VALUES(v_business,22,v_actor,p_shift_id,v_tx,v_digest,v_result);
  RETURN v_result;
END;
$tc_close$;

REVOKE ALL ON FUNCTION public.top_chicken_pwa_close_shift_v1(bigint,numeric,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.top_chicken_pwa_close_shift_v1(bigint,numeric,text)
  TO authenticated;
COMMIT;
