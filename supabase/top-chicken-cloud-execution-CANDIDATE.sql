-- SOURCE ONLY: service role submits fresh Cloud decisions; no persistent profile-derived grant.
BEGIN;
CREATE TABLE IF NOT EXISTS sharawla_internal.top_chicken_execution_gate_v1(
 business_id uuid PRIMARY KEY CHECK(business_id='5358328c-9724-49aa-affc-1bce8be90f92'),
 enabled boolean NOT NULL DEFAULT false,reason text NOT NULL DEFAULT 'Awaiting independent release approval',approval_ref text
);
INSERT INTO sharawla_internal.top_chicken_execution_gate_v1(business_id) VALUES('5358328c-9724-49aa-affc-1bce8be90f92') ON CONFLICT DO NOTHING;
ALTER TABLE sharawla_internal.top_chicken_execution_gate_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sharawla_internal.top_chicken_execution_gate_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE IF NOT EXISTS sharawla_internal.top_chicken_gate_audit_v1(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,business_id uuid NOT NULL,
 old_enabled boolean,new_enabled boolean NOT NULL,reason text NOT NULL,approval_ref text,
 database_principal text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE sharawla_internal.top_chicken_gate_audit_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sharawla_internal.top_chicken_gate_audit_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION sharawla_internal.top_chicken_gate_audit_trigger_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF nullif(trim(NEW.reason),'') IS NULL OR (NEW.enabled AND coalesce(NEW.approval_ref,'') !~ '^[a-f0-9]{40}$') THEN RAISE EXCEPTION 'GATE_APPROVAL_REFERENCE_REQUIRED' USING errcode='42501';END IF;
 INSERT INTO sharawla_internal.top_chicken_gate_audit_v1(business_id,old_enabled,new_enabled,reason,approval_ref,database_principal)
 VALUES(NEW.business_id,OLD.enabled,NEW.enabled,NEW.reason,NEW.approval_ref,session_user);
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION sharawla_internal.top_chicken_gate_audit_trigger_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER top_chicken_gate_audit_v1 BEFORE UPDATE ON sharawla_internal.top_chicken_execution_gate_v1 FOR EACH ROW EXECUTE FUNCTION sharawla_internal.top_chicken_gate_audit_trigger_v1();
CREATE TABLE IF NOT EXISTS sharawla_internal.top_chicken_cloud_context_v1(
 transaction_id bigint NOT NULL,backend_id integer NOT NULL,actor_id uuid,
 business_id uuid NOT NULL CHECK(business_id='5358328c-9724-49aa-affc-1bce8be90f92'),
 rpc_name text NOT NULL,cloud_snapshot jsonb NOT NULL,valid_until timestamptz NOT NULL,
 PRIMARY KEY(transaction_id,backend_id)
);
ALTER TABLE sharawla_internal.top_chicken_cloud_context_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sharawla_internal.top_chicken_cloud_context_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION sharawla_internal.top_chicken_transaction_feature_v1(p_code text)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''
AS $$SELECT EXISTS(SELECT 1 FROM sharawla_internal.top_chicken_cloud_context_v1 c
 WHERE c.transaction_id=pg_catalog.txid_current() AND c.backend_id=pg_catalog.pg_backend_pid()
 AND EXISTS(SELECT 1 FROM sharawla_internal.top_chicken_execution_gate_v1 g WHERE g.business_id=c.business_id AND g.enabled=true)
 AND c.actor_id IS NOT DISTINCT FROM auth.uid() AND c.valid_until>pg_catalog.clock_timestamp()
 AND (c.cloud_snapshot->'decisions'->p_code->>'entitled')::boolean=true
 AND (c.cloud_snapshot->'decisions'->p_code->>'feature_active')::boolean=true
 AND (c.cloud_snapshot->'decisions'->p_code->>'feature_implemented')::boolean=true
 AND (c.cloud_snapshot->'decisions'->p_code->>'override_disabled')::boolean=false)$$;
REVOKE ALL ON FUNCTION sharawla_internal.top_chicken_transaction_feature_v1(text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.top_chicken_execute_cloud_authorized_v1(
 p_actor uuid,p_rpc text,p_payload jsonb,p_cloud jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$DECLARE v_features text[];v_modules text[]:='{}';v_feature text;v_d jsonb;v_until timestamptz;v_observed timestamptz;v_result jsonb;v_claims text;v_sub text;v_role text;v_headers text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_ONLY' USING errcode='42501';END IF;
 PERFORM 1 FROM sharawla_internal.top_chicken_execution_gate_v1 WHERE business_id='5358328c-9724-49aa-affc-1bce8be90f92' AND enabled=true FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'TC_EXECUTION_PAUSED' USING errcode='42501';END IF;
 IF p_rpc='top_chicken_staff_login_context_v1' THEN v_features:=ARRAY['core.auth'];
 ELSIF p_rpc IN ('top_chicken_reserve_staff_v1','top_chicken_complete_staff_v1') THEN
  v_features:=ARRAY['core.auth','core.users','core.permissions'];
  IF p_actor IS NULL OR p_payload->>'p_actor' IS DISTINCT FROM p_actor::text THEN RAISE EXCEPTION 'ACTOR_REQUIRED' USING errcode='42501';END IF;
 ELSIF p_rpc='top_chicken_assign_order_driver' THEN v_features:=ARRAY['commerce.orders','commerce.delivery'];v_modules:=ARRAY['pos','delivery'];
 ELSIF p_rpc='top_chicken_transition_order_status' THEN
  v_features:=ARRAY['commerce.orders'];v_modules:=ARRAY['pos'];
  IF p_payload->>'p_new_status'='completed' THEN v_features:=v_features||ARRAY['commerce.pickup'];v_modules:=v_modules||ARRAY['pickup'];END IF;
  IF p_payload->>'p_new_status' IN ('out_for_delivery','delivered') THEN v_features:=v_features||ARRAY['commerce.delivery'];v_modules:=v_modules||ARRAY['delivery'];END IF;
  IF p_payload->>'p_new_status'='delivered' THEN v_features:=v_features||ARRAY['core.payments'];END IF;
 ELSE RAISE EXCEPTION 'RPC_NOT_ALLOWED' USING errcode='42501';END IF;
 IF p_actor IS NULL AND p_rpc<>'top_chicken_staff_login_context_v1' THEN RAISE EXCEPTION 'ACTOR_REQUIRED' USING errcode='42501';END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR jsonb_typeof(p_cloud) IS DISTINCT FROM 'object'
 OR p_cloud->>'business_id' IS DISTINCT FROM '5358328c-9724-49aa-affc-1bce8be90f92'
 OR p_cloud->>'business_active' IS DISTINCT FROM 'true' OR p_cloud->>'profile_active' IS DISTINCT FROM 'true'
 OR p_cloud->>'profile_code' IS DISTINCT FROM 'restaurant' THEN RAISE EXCEPTION 'CLOUD_SCOPE_DENIED' USING errcode='42501';END IF;
 v_observed:=(p_cloud->>'observed_at')::timestamptz;
 IF v_observed IS NULL OR v_observed>clock_timestamp()+interval '1 second' OR v_observed<=clock_timestamp()-interval '10 seconds' THEN
  RAISE EXCEPTION 'CLOUD_DECISION_STALE' USING errcode='42501';END IF;
 v_until:=v_observed+interval '10 seconds';
 FOREACH v_feature IN ARRAY v_features LOOP
  v_d:=p_cloud->'decisions'->v_feature;
  IF v_d IS NULL OR v_d->>'business_id' IS DISTINCT FROM p_cloud->>'business_id'
   OR v_d->>'feature_code' IS DISTINCT FROM v_feature OR v_d->>'entitled' IS DISTINCT FROM 'true'
   OR v_d->>'feature_active' IS DISTINCT FROM 'true' OR v_d->>'feature_implemented' IS DISTINCT FROM 'true'
   OR v_d->>'override_disabled' IS DISTINCT FROM 'false' OR (v_d->>'evaluation_time')::timestamptz IS DISTINCT FROM v_observed
   OR coalesce((v_d->>'effective_from')::timestamptz,v_observed)>clock_timestamp()
   OR coalesce((v_d->>'effective_until')::timestamptz,v_until)<=clock_timestamp() THEN
   RAISE EXCEPTION 'CLOUD_FEATURE_DENIED:%',v_feature USING errcode='42501';END IF;
  v_until:=least(v_until,coalesce((v_d->>'effective_until')::timestamptz,v_until));
 END LOOP;
 FOREACH v_feature IN ARRAY v_modules LOOP
  IF p_cloud->'modules'->>v_feature IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'CLOUD_MODULE_DENIED:%',v_feature USING errcode='42501';END IF;
 END LOOP;
 v_sub:=current_setting('request.jwt.claim.sub',true);v_role:=current_setting('request.jwt.claim.role',true);
 v_headers:=current_setting('request.headers',true);v_claims:=current_setting('request.jwt.claims',true);
 PERFORM set_config('request.jwt.claim.sub',coalesce(p_actor::text,''),true);
 PERFORM set_config('request.jwt.claim.role',CASE WHEN p_rpc IN ('top_chicken_transition_order_status','top_chicken_assign_order_driver') THEN 'authenticated' ELSE 'service_role' END,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role',CASE WHEN p_rpc IN ('top_chicken_transition_order_status','top_chicken_assign_order_driver') THEN 'authenticated' ELSE 'service_role' END)::text,true);
 IF p_cloud->>'device_selector' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.business_device_bindings WHERE device_id=(p_cloud->>'device_selector')::uuid AND business_id='5358328c-9724-49aa-affc-1bce8be90f92' AND active=true) THEN RAISE EXCEPTION 'TC_DEVICE_SELECTOR_DENIED' USING errcode='42501';END IF;
 PERFORM set_config('request.headers',jsonb_strip_nulls(jsonb_build_object('x-sharawla-business','5358328c-9724-49aa-affc-1bce8be90f92','x-sharawla-device',p_cloud->>'device_selector'))::text,true);
 INSERT INTO sharawla_internal.top_chicken_cloud_context_v1(transaction_id,backend_id,actor_id,business_id,rpc_name,cloud_snapshot,valid_until)
 VALUES(txid_current(),pg_backend_pid(),p_actor,'5358328c-9724-49aa-affc-1bce8be90f92',p_rpc,p_cloud,v_until);
 IF p_rpc='top_chicken_transition_order_status' THEN v_result:=public.top_chicken_transition_order_status((p_payload->>'p_order_id')::bigint,p_payload->>'p_expected_status',p_payload->>'p_new_status',p_payload->>'p_request_id');
 ELSIF p_rpc='top_chicken_assign_order_driver' THEN v_result:=public.top_chicken_assign_order_driver((p_payload->>'p_order_id')::bigint,(p_payload->>'p_driver_id')::bigint,p_payload->>'p_request_id');
 ELSIF p_rpc='top_chicken_reserve_staff_v1' THEN v_result:=public.top_chicken_reserve_staff_v1(p_actor,(p_payload->>'p_request_id')::uuid,p_payload->>'p_operation',p_payload->'p_payload',p_payload->>'p_digest');
 ELSIF p_rpc='top_chicken_complete_staff_v1' THEN v_result:=public.top_chicken_complete_staff_v1(p_actor,(p_payload->>'p_request_id')::uuid,p_payload->>'p_digest');
 ELSE v_result:=public.top_chicken_staff_login_context_v1(p_payload->>'p_username');END IF;
 -- If expiry occurs during an authoritative write, roll back its financial/audit effects too.
 IF v_until<=clock_timestamp() THEN RAISE EXCEPTION 'CLOUD_DECISION_EXPIRED_DURING_OPERATION' USING errcode='42501';END IF;
 PERFORM set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);PERFORM set_config('request.jwt.claim.role',coalesce(v_role,''),true);
 PERFORM set_config('request.jwt.claims',coalesce(v_claims,'{}'),true);PERFORM set_config('request.headers',coalesce(v_headers,'{}'),true);
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.top_chicken_execute_cloud_authorized_v1(uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.top_chicken_execute_cloud_authorized_v1(uuid,text,jsonb,jsonb) TO service_role;
COMMIT;
