-- SOURCE CANDIDATE ONLY. DO NOT APPLY BEFORE ISOLATED PG16 TESTS.
-- Dedicated Top Chicken Beta order status transition, no broad orders UPDATE grant.
BEGIN;
CREATE TABLE IF NOT EXISTS public.top_chicken_order_status_receipts_v1 (
  business_id uuid NOT NULL,
  branch_id bigint NOT NULL,
  request_id text NOT NULL,
  actor_id bigint NOT NULL,
  order_id bigint NOT NULL,
  expected_status text NOT NULL,
  new_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id,branch_id,request_id)
);
REVOKE ALL ON public.top_chicken_order_status_receipts_v1 FROM PUBLIC,anon,authenticated;
ALTER TABLE public.top_chicken_order_status_receipts_v1 ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.top_chicken_transition_order_status(
  p_order_id bigint,p_expected_status text,p_new_status text,p_request_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_business constant uuid := '5358328c-9724-49aa-affc-1bce8be90f92';
  v_branch constant bigint := 22;
  v_actor public.employees%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_receipt public.top_chicken_order_status_receipts_v1%ROWTYPE;
  v_pickup boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_order_id IS NULL OR p_order_id<=0 OR p_request_id IS NULL
    OR length(p_request_id)<8 OR length(p_request_id)>128
    OR p_expected_status IS NULL OR p_new_status IS NULL THEN
    RAISE EXCEPTION 'Invalid transition request' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_actor FROM public.employees
  WHERE auth_user_id=auth.uid() AND business_id=v_business AND active IS TRUE;
  IF NOT FOUND OR v_actor.role NOT IN ('admin','cashier','call_center') THEN
    RAISE EXCEPTION 'Employee not authorized' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.employee_branches eb
    WHERE eb.employee_id=v_actor.id AND eb.branch_id=v_branch AND eb.business_id=v_business)
    AND NOT (v_actor.role='admin' AND v_actor.branch_id=v_branch) THEN
    RAISE EXCEPTION 'Branch access denied' USING ERRCODE='42501';
  END IF;
  -- Lock request key before checking replay, including concurrent first writers.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_business::text||':'||v_branch||':'||p_request_id,0));
  SELECT * INTO v_receipt FROM public.top_chicken_order_status_receipts_v1
    WHERE business_id=v_business AND branch_id=v_branch AND request_id=p_request_id;
  IF FOUND THEN
    IF v_receipt.actor_id=v_actor.id AND v_receipt.order_id=p_order_id
       AND v_receipt.expected_status=p_expected_status AND v_receipt.new_status=p_new_status THEN
      RETURN jsonb_build_object('ok',true,'replayed',true,'order_id',p_order_id,'status',p_new_status);
    END IF;
    RAISE EXCEPTION 'Changed payload for request ID' USING ERRCODE='23505';
  END IF;
  SELECT * INTO v_order FROM public.orders
    WHERE id=p_order_id AND business_id=v_business AND branch_id=v_branch FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found in authorized branch' USING ERRCODE='42501'; END IF;
  IF v_order.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'Stale order status' USING ERRCODE='40001';
  END IF;
  v_pickup := v_order.order_type='pickup';
  IF NOT (
    (p_expected_status='new' AND p_new_status='preparing') OR
    (p_expected_status='preparing' AND p_new_status='ready') OR
    (p_expected_status='ready' AND p_new_status='completed' AND (v_pickup OR v_order.order_type NOT IN ('delivery'))) OR
    (p_expected_status='out_for_delivery' AND p_new_status='delivered' AND v_order.order_type='delivery' AND v_order.driver_id IS NOT NULL)
  ) THEN RAISE EXCEPTION 'Forbidden status transition' USING ERRCODE='22023'; END IF;
  UPDATE public.orders SET status=p_new_status,
    delivered_at=CASE WHEN p_new_status IN ('completed','delivered') THEN now() ELSE delivered_at END
    WHERE id=p_order_id AND business_id=v_business AND branch_id=v_branch;
  INSERT INTO public.top_chicken_order_status_receipts_v1
    (business_id,branch_id,request_id,actor_id,order_id,expected_status,new_status)
    VALUES(v_business,v_branch,p_request_id,v_actor.id,p_order_id,p_expected_status,p_new_status);
  RETURN jsonb_build_object('ok',true,'replayed',false,'order_id',p_order_id,'status',p_new_status);
END;
$$;
REVOKE ALL ON FUNCTION public.top_chicken_transition_order_status(bigint,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.top_chicken_transition_order_status(bigint,text,text,text) TO authenticated;
COMMIT;
