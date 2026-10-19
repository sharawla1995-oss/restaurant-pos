-- DRAFT ONLY / DO NOT APPLY. Top Chicken Beta Branch 22 prospective online gateway.
-- NOT DEPLOYED: requires explicit approval, full schema compatibility review and E2E.
-- Does not replace legacy Windows POS RPCs or affect Top Burger Production.
BEGIN;

CREATE TABLE IF NOT EXISTS public.top_chicken_pwa_order_receipts_v1 (
  business_id uuid NOT NULL,
  branch_id bigint NOT NULL,
  actor_uid uuid NOT NULL,
  employee_id bigint NOT NULL,
  client_tx_id text NOT NULL,
  payload_digest text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, client_tx_id),
  CONSTRAINT tc_pwa_receipt_branch22 CHECK (branch_id = 22),
  CONSTRAINT tc_pwa_receipt_digest_sha256 CHECK (payload_digest ~ '^[0-9a-f]{64}$')
);
ALTER TABLE public.top_chicken_pwa_order_receipts_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.top_chicken_pwa_order_receipts_v1 FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.top_chicken_pwa_create_order_v1(
  p_order jsonb,
  p_items jsonb,
  p_payments jsonb,
  p_client_tx_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $tc_pwa$
DECLARE
  v_business constant uuid := '5358328c-9724-49aa-affc-1bce8be90f92';
  v_actor uuid := auth.uid();
  v_emp bigint;
  v_client_tx text := lower(trim(coalesce(p_client_tx_id,'')));
  v_digest text;
  v_receipt public.top_chicken_pwa_order_receipts_v1%ROWTYPE;
  v_result jsonb;
BEGIN
  -- Trust server-owned actor, membership and branch binding, never a client tenant selector.
  IF v_actor IS NULL OR public.current_business_id() IS DISTINCT FROM v_business THEN
    RAISE EXCEPTION 'Top Chicken Beta tenant not authorized';
  END IF;
  v_emp := public.current_employee_id();
  IF v_emp IS NULL OR NOT public.has_branch_access(22) THEN
    RAISE EXCEPTION 'Branch 22 actor not authorized';
  END IF;
  IF jsonb_typeof(p_order) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payments) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) = 0
     OR jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'Invalid order request';
  END IF;
  -- Exactly one durable UUID per checkout attempt; key must agree with existing POS owner.
  IF v_client_tx !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR lower(coalesce(p_order->>'client_tx_id','')) <> v_client_tx THEN
    RAISE EXCEPTION 'Invalid or inconsistent transaction key';
  END IF;
  IF coalesce((p_order->>'branch_id')::bigint,-1) <> 22
     OR coalesce((p_order->>'employee_id')::bigint,-1) <> v_emp THEN
    RAISE EXCEPTION 'Order actor/branch mismatch';
  END IF;
  IF p_order ? 'business_id'
     AND p_order->>'business_id' IS DISTINCT FROM v_business::text THEN
    RAISE EXCEPTION 'Order tenant selector rejected';
  END IF;
  -- Digest is stable for jsonb key ordering, includes payments and all item modifiers.
  v_digest := encode(sha256(convert_to(
    jsonb_build_object('order',p_order,'items',p_items,'payments',p_payments)::text,
    'UTF8'
  )), 'hex');

  -- The lock prevents two separate API workers running one client_tx concurrently.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'tc-pwa-sale-v1:' || v_business::text || ':' || v_client_tx, 0
  ));
  SELECT * INTO v_receipt
    FROM public.top_chicken_pwa_order_receipts_v1
    WHERE business_id=v_business AND client_tx_id=v_client_tx;
  IF FOUND THEN
    IF v_receipt.branch_id <> 22
       OR v_receipt.actor_uid <> v_actor
       OR v_receipt.employee_id <> v_emp
       OR v_receipt.payload_digest <> v_digest THEN
      RAISE EXCEPTION 'TRANSACTION_REPLAY_CONFLICT';
    END IF;
    RETURN v_receipt.result;
  END IF;

  -- If an earlier Windows/mobile attempt used this key without our receipt,
  -- do not trust the legacy owner's payload-blind replay. Require reconciliation.
  IF EXISTS(SELECT 1 FROM public.orders WHERE client_tx_id=v_client_tx) THEN
    RAISE EXCEPTION 'PREEXISTING_ORDER_REQUIRES_RECONCILIATION';
  END IF;

  -- Canonical existing transactional writer remains the only sale/payment owner.
  v_result := public.create_pos_order_atomic(p_order,p_items,p_payments);
  IF jsonb_typeof(v_result) IS DISTINCT FROM 'object'
     OR (v_result->'order'->>'id') IS NULL THEN
    RAISE EXCEPTION 'CANONICAL_WRITER_OUTCOME_UNVERIFIED';
  END IF;
  IF coalesce((v_result->'order'->>'branch_id')::bigint,-1) <> 22
     OR coalesce((v_result->'order'->>'employee_id')::bigint,-1) <> v_emp
     OR lower(coalesce(v_result->'order'->>'client_tx_id','')) <> v_client_tx THEN
    RAISE EXCEPTION 'CANONICAL_WRITER_TENANT_OR_TX_MISMATCH';
  END IF;
  INSERT INTO public.top_chicken_pwa_order_receipts_v1
    (business_id,branch_id,actor_uid,employee_id,client_tx_id,payload_digest,result)
  VALUES (v_business,22,v_actor,v_emp,v_client_tx,v_digest,v_result);
  RETURN v_result;
END;
$tc_pwa$;

REVOKE ALL ON FUNCTION public.top_chicken_pwa_create_order_v1(jsonb,jsonb,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.top_chicken_pwa_create_order_v1(jsonb,jsonb,jsonb,text) TO authenticated;

COMMIT;
