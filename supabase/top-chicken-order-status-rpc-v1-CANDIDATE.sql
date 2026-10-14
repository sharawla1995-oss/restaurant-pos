-- CANDIDATE ONLY. Durable wrappers delegate writes to the canonical owners.
BEGIN;
-- Do not use another activity's Cloud profile/feature binding to authorize this tenant.
DO $tc_preflight$ BEGIN IF NOT sharawla_internal.top_chicken_binding_ready_v1() THEN RAISE EXCEPTION 'TOP_CHICKEN_OPERATIONAL_PROFILE_BINDING_REQUIRED'; END IF; END $tc_preflight$;
CREATE TABLE IF NOT EXISTS public.top_chicken_order_status_receipts_v1 (
 business_id uuid NOT NULL,branch_id bigint NOT NULL,request_id text NOT NULL,
 actor_id bigint NOT NULL,order_id bigint NOT NULL,expected_status text NOT NULL,new_status text NOT NULL,
 driver_id bigint,request_digest text NOT NULL,result_json jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(business_id,branch_id,request_id)
);
REVOKE ALL ON public.top_chicken_order_status_receipts_v1 FROM PUBLIC,anon,authenticated;
ALTER TABLE public.top_chicken_order_status_receipts_v1 ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION sharawla_internal.top_chicken_order_operation_v1(
 p_order_id bigint,p_expected_status text,p_new_status text,p_driver_id bigint,p_request_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 v_business constant uuid:='5358328c-9724-49aa-affc-1bce8be90f92'; v_branch constant bigint:=22;
 v_actor public.employees%ROWTYPE; v_order public.orders%ROWTYPE;
 v_driver public.delivery_drivers%ROWTYPE; v_receipt public.top_chicken_order_status_receipts_v1%ROWTYPE;
 v_digest text;v_action text;v_result jsonb;v_owner_key text;
BEGIN
 IF auth.uid() IS NULL OR public.current_business_id() IS DISTINCT FROM v_business THEN
  RAISE EXCEPTION 'Top Chicken authenticated membership required' USING ERRCODE='42501';
 END IF;
 IF sharawla_internal.current_operational_business_id_v1() IS DISTINCT FROM v_business
  OR sharawla_internal.current_operational_profile_v1() IS DISTINCT FROM 'restaurant' THEN
  RAISE EXCEPTION 'Top Chicken profile binding required' USING ERRCODE='42501';
 END IF;
 IF p_order_id IS NULL OR p_order_id<=0 OR p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9_-]{8,128}$'
  OR p_expected_status IS NULL OR p_new_status IS NULL THEN
  RAISE EXCEPTION 'Invalid transition request' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_actor FROM public.employees WHERE id=public.current_employee_id()
  AND auth_user_id=auth.uid() AND business_id=v_business AND active IS TRUE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee not authorized' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.employee_branches eb JOIN public.branches b
   ON b.id=eb.branch_id AND b.business_id=eb.business_id AND b.active IS TRUE
   WHERE eb.employee_id=v_actor.id AND eb.branch_id=v_branch AND eb.business_id=v_business) THEN
  RAISE EXCEPTION 'Branch access denied' USING ERRCODE='42501';
 END IF;
 v_action:=CASE WHEN p_new_status='out_for_delivery' THEN 'orders.delivery.assign_driver'
  WHEN p_new_status='delivered' THEN 'delivery.mark_delivered' ELSE 'orders.fulfillment.manage' END;
 IF public.has_action_permission_v2(v_action) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Action permission denied' USING ERRCODE='42501';
 END IF;
 v_digest:=md5(jsonb_build_object('actor',v_actor.id,'order',p_order_id,'from',p_expected_status,
  'to',p_new_status,'driver',p_driver_id)::text);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_business::text||':22:'||p_request_id,0));
 SELECT * INTO v_receipt FROM public.top_chicken_order_status_receipts_v1
  WHERE business_id=v_business AND branch_id=v_branch AND request_id=p_request_id;
 IF FOUND THEN
  IF v_receipt.request_digest IS DISTINCT FROM v_digest THEN
   RAISE EXCEPTION 'Changed payload or actor for request ID' USING ERRCODE='23505';
  END IF;
  RETURN v_receipt.result_json||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO v_order FROM public.orders WHERE id=p_order_id AND business_id=v_business AND branch_id=v_branch FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order outside authorized branch' USING ERRCODE='42501'; END IF;
 IF v_order.status IS DISTINCT FROM p_expected_status THEN RAISE EXCEPTION 'Stale order status' USING ERRCODE='40001'; END IF;
 v_owner_key:='tc-order-v1:'||v_actor.id||':'||p_request_id;
 IF p_new_status='out_for_delivery' THEN
  IF p_expected_status<>'ready' OR v_order.order_type IS DISTINCT FROM 'delivery' OR p_driver_id IS NULL THEN
   RAISE EXCEPTION 'Only ready delivery can be assigned' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_driver FROM public.delivery_drivers WHERE id=p_driver_id AND business_id=v_business
   AND branch_id=v_branch AND active IS TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Driver outside authorized branch or inactive' USING ERRCODE='42501'; END IF;
  v_result:=public.order_assign_driver_v2(p_order_id,p_driver_id);
 ELSIF p_new_status='delivered' THEN
  IF p_driver_id IS NOT NULL OR p_expected_status<>'out_for_delivery' OR v_order.order_type IS DISTINCT FROM 'delivery'
   OR v_order.driver_id IS NULL THEN RAISE EXCEPTION 'Delivery requires an assigned driver' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.delivery_drivers WHERE id=v_order.driver_id AND business_id=v_business AND branch_id=v_branch)
   THEN RAISE EXCEPTION 'Assigned driver scope mismatch' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.payment_methods pm JOIN public.branch_payment_methods bpm
    ON bpm.payment_method_id=pm.id AND bpm.business_id=pm.business_id
    WHERE pm.business_id=v_business AND pm.code=v_order.payment_method AND pm.active IS TRUE
    AND bpm.branch_id=v_branch AND bpm.active IS TRUE) THEN
   RAISE EXCEPTION 'Final payment method unavailable' USING ERRCODE='22023';
  END IF;
  -- Financial payment/custody authority stays with the deployed delivery owner.
  v_result:=public.delivery_mark_delivered_v2(p_order_id,v_order.payment_method,v_owner_key);
 ELSE
  IF p_driver_id IS NOT NULL OR NOT (
   (p_expected_status='new' AND p_new_status='preparing') OR
   (p_expected_status='preparing' AND p_new_status='ready') OR
   (p_expected_status='ready' AND p_new_status='completed' AND coalesce(v_order.order_type,'') IN ('pickup','takeaway','dine_in'))
  ) THEN RAISE EXCEPTION 'Forbidden status transition' USING ERRCODE='22023'; END IF;
  v_result:=public.order_fulfillment_transition_v2(p_order_id,p_new_status);
 END IF;
 IF v_result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Owner did not confirm operation'; END IF;
 v_result:=v_result||jsonb_build_object('ok',true,'replayed',false,'order_id',p_order_id,'status',p_new_status);
 INSERT INTO public.top_chicken_order_status_receipts_v1
 (business_id,branch_id,request_id,actor_id,order_id,expected_status,new_status,driver_id,request_digest,result_json)
 VALUES(v_business,v_branch,p_request_id,v_actor.id,p_order_id,p_expected_status,p_new_status,p_driver_id,v_digest,v_result);
 RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION sharawla_internal.top_chicken_order_operation_v1(bigint,text,text,bigint,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.top_chicken_transition_order_status(
 p_order_id bigint,p_expected_status text,p_new_status text,p_request_id text
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $$ SELECT sharawla_internal.top_chicken_order_operation_v1(p_order_id,p_expected_status,p_new_status,NULL,p_request_id) $$;
CREATE OR REPLACE FUNCTION public.top_chicken_assign_order_driver(p_order_id bigint,p_driver_id bigint,p_request_id text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $$ SELECT sharawla_internal.top_chicken_order_operation_v1(p_order_id,'ready','out_for_delivery',p_driver_id,p_request_id) $$;
REVOKE ALL ON FUNCTION public.top_chicken_transition_order_status(bigint,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.top_chicken_assign_order_driver(bigint,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.top_chicken_transition_order_status(bigint,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.top_chicken_assign_order_driver(bigint,bigint,text) TO authenticated;
COMMIT;
