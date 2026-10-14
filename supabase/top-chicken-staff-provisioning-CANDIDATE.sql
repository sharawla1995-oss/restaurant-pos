-- SOURCE CANDIDATE ONLY. Service API must verify the caller's Auth token first.
-- No Auth or operational records are deleted on failure; durable reservations allow recovery.
BEGIN;
CREATE TABLE IF NOT EXISTS sharawla_internal.top_chicken_staff_requests_v1(
 business_id uuid NOT NULL CHECK(business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid),
 request_id uuid NOT NULL,actor_id bigint NOT NULL,operation text NOT NULL CHECK(operation IN ('create','password')),
 payload jsonb NOT NULL,digest text NOT NULL,auth_user_id uuid NOT NULL,
 employee_id bigint,result jsonb,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 PRIMARY KEY(business_id,request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS tc_staff_pending_username_v1
 ON sharawla_internal.top_chicken_staff_requests_v1(business_id,lower(payload->>'username')) WHERE operation='create';
ALTER TABLE sharawla_internal.top_chicken_staff_requests_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sharawla_internal.top_chicken_staff_requests_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION sharawla_internal.top_chicken_staff_admin_v1(p_actor uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_id bigint; BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_ONLY' USING errcode='42501'; END IF;
 IF NOT sharawla_internal.top_chicken_transaction_feature_v1('core.users') OR NOT sharawla_internal.top_chicken_transaction_feature_v1('core.permissions') THEN RAISE EXCEPTION 'CLOUD_STAFF_PERMISSION_REQUIRED' USING errcode='42501';END IF;
 IF NOT sharawla_internal.top_chicken_binding_ready_v1() THEN RAISE EXCEPTION 'TC_BINDING_REQUIRED' USING errcode='42501'; END IF;
 SELECT e.id INTO v_id FROM public.employees e
 JOIN public.business_auth_memberships m ON m.auth_user_id=e.auth_user_id AND m.business_id=e.business_id AND m.active=true
 JOIN public.employee_branches eb ON eb.employee_id=e.id AND eb.business_id=e.business_id AND eb.branch_id=22
 JOIN public.branches b ON b.id=eb.branch_id AND b.business_id=eb.business_id AND b.active=true
 WHERE e.auth_user_id=p_actor AND e.business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid
 AND e.role='admin' AND e.active=true FOR SHARE OF e,m,eb,b;
 IF v_id IS NULL THEN RAISE EXCEPTION 'TC_ADMIN_REQUIRED' USING errcode='42501'; END IF;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION sharawla_internal.top_chicken_staff_admin_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.top_chicken_reserve_staff_v1(
 p_actor uuid,p_request_id uuid,p_operation text,p_payload jsonb,p_digest text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE
 v_actor bigint;v_old sharawla_internal.top_chicken_staff_requests_v1%ROWTYPE;v_auth uuid;v_target bigint;
 v_username text;v_role text;v_permissions jsonb;v_keys text[]:=ARRAY['home','pos','orders','returns','customers','deliveryOrders','deliverySettings','delivery','kitchen','shifts','inventory','expenses','products','promoCodes','branchProductAvailability','reports','users','settings','websiteBranchSettings','branchManagement','businessSettings','printingSettings','financialSettings','websiteAppearance','discount'];
BEGIN
 v_actor:=sharawla_internal.top_chicken_staff_admin_v1(p_actor);
 IF p_request_id IS NULL OR p_request_id='00000000-0000-0000-0000-000000000000'::uuid OR p_digest !~ '^[a-f0-9]{64}$'
 OR p_digest IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR p_operation IS NULL
 OR p_operation NOT IN ('create','password') THEN RAISE EXCEPTION 'INVALID_STAFF_REQUEST' USING errcode='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('tc-staff:'||p_request_id::text,0));
 SELECT * INTO v_old FROM sharawla_internal.top_chicken_staff_requests_v1 WHERE business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid AND request_id=p_request_id FOR UPDATE;
 IF FOUND THEN
  IF v_old.actor_id<>v_actor OR v_old.digest<>p_digest OR v_old.payload<>p_payload OR v_old.operation<>p_operation
   THEN RAISE EXCEPTION 'STAFF_REQUEST_CONFLICT' USING errcode='23505'; END IF;
  RETURN jsonb_build_object('auth_user_id',v_old.auth_user_id,'result',v_old.result,'replayed',true);
 END IF;
 IF p_operation='create' THEN
  v_username:=lower(trim(p_payload->>'username'));v_role:=p_payload->>'role';v_permissions:=p_payload->'permissions';
  IF v_username IS NULL OR length(v_username) NOT BETWEEN 3 AND 40 OR v_username ~ '[[:space:]@]' OR v_username !~ '^[[:alnum:]_.-]+$'
    OR nullif(trim(p_payload->>'name'),'') IS NULL OR length(p_payload->>'name')>120
    OR v_role IS NULL OR v_role NOT IN ('admin','cashier','callcenter','delivery')
    OR p_payload->'branch_ids' IS DISTINCT FROM '[22]'::jsonb
    OR p_payload->>'branch_id' IS DISTINCT FROM '22'
    OR jsonb_typeof(p_payload->'active') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(v_permissions) IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'INVALID_STAFF_PROFILE' USING errcode='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_permissions) k WHERE NOT k=ANY(v_keys)) THEN
   RAISE EXCEPTION 'UNKNOWN_STAFF_PERMISSION' USING errcode='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.employees WHERE business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid AND lower(username)=v_username)
   THEN RAISE EXCEPTION 'USERNAME_EXISTS' USING errcode='23505'; END IF;
  v_auth:=gen_random_uuid();
 ELSE
  v_target:=(p_payload->>'employee_id')::bigint;
  SELECT e.auth_user_id INTO v_auth FROM public.employees e
  JOIN public.employee_branches eb ON eb.employee_id=e.id AND eb.business_id=e.business_id AND eb.branch_id=22
  WHERE e.id=v_target AND e.business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid FOR SHARE OF e,eb;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'STAFF_TARGET_SCOPE_DENIED' USING errcode='42501'; END IF;
 END IF;
 INSERT INTO sharawla_internal.top_chicken_staff_requests_v1(business_id,request_id,actor_id,operation,payload,digest,auth_user_id,employee_id)
 VALUES('5358328c-9724-49aa-affc-1bce8be90f92'::uuid,p_request_id,v_actor,p_operation,p_payload,p_digest,v_auth,v_target);
 INSERT INTO public.audit_logs(id,business_id,employee_id,branch_id,action,entity_type,details)
 VALUES(nextval('public.audit_logs_id_seq'::regclass),'5358328c-9724-49aa-affc-1bce8be90f92'::uuid,v_actor,22,'tc.staff.'||p_operation||'.reserved','staff',jsonb_build_object('request_id',p_request_id));
 RETURN jsonb_build_object('auth_user_id',v_auth,'result',null,'replayed',false);
END $$;
CREATE OR REPLACE FUNCTION public.top_chicken_complete_staff_v1(p_actor uuid,p_request_id uuid,p_digest text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_actor bigint;v_r sharawla_internal.top_chicken_staff_requests_v1%ROWTYPE;v_id bigint;v_result jsonb;v_key text;
BEGIN
 v_actor:=sharawla_internal.top_chicken_staff_admin_v1(p_actor);
 SELECT * INTO v_r FROM sharawla_internal.top_chicken_staff_requests_v1
 WHERE business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid AND request_id=p_request_id FOR UPDATE;
 IF NOT FOUND OR v_r.actor_id<>v_actor OR v_r.digest IS DISTINCT FROM p_digest THEN RAISE EXCEPTION 'STAFF_REQUEST_SCOPE_DENIED' USING errcode='42501'; END IF;
 IF v_r.result IS NOT NULL THEN RETURN v_r.result||jsonb_build_object('replayed',true); END IF;
 IF v_r.operation='create' THEN
  IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=v_r.auth_user_id
   AND u.raw_app_meta_data->>'tc_staff_request'=v_r.request_id::text
   AND u.raw_app_meta_data->>'business_id'='5358328c-9724-49aa-affc-1bce8be90f92') THEN
   RAISE EXCEPTION 'STAFF_AUTH_BINDING_INVALID' USING errcode='42501'; END IF;
  v_id:=nextval('public.employees_id_seq'::regclass);
  INSERT INTO public.employees(id,business_id,name,username,role,branch_id,active,auth_user_id)
  VALUES(v_id,v_r.business_id,trim(v_r.payload->>'name'),lower(trim(v_r.payload->>'username')),v_r.payload->>'role',22,(v_r.payload->>'active')::boolean,v_r.auth_user_id);
  INSERT INTO public.employee_branches(business_id,employee_id,branch_id) VALUES(v_r.business_id,v_id,22);
  INSERT INTO public.business_auth_memberships(business_id,auth_user_id,active,source)
  VALUES(v_r.business_id,v_r.auth_user_id,(v_r.payload->>'active')::boolean,'top-chicken-staff-v1');
  FOREACH v_key IN ARRAY ARRAY['home','pos','orders','returns','customers','deliveryOrders','deliverySettings','delivery','kitchen','shifts','inventory','expenses','products','promoCodes','branchProductAvailability','reports','users','settings','websiteBranchSettings','branchManagement','businessSettings','printingSettings','financialSettings','websiteAppearance','discount'] LOOP
   INSERT INTO public.employee_permissions(business_id,employee_id,permission_key,allowed)
   VALUES(v_r.business_id,v_id,v_key,(v_r.payload->>'role'='admin' OR (v_r.payload->'permissions') ? v_key));
  END LOOP;
  INSERT INTO public.employee_action_permissions_v2(business_id,employee_id,action_code,allowed)
  SELECT v_r.business_id,v_id,a.code,(v_r.payload->>'role'='admin' OR coalesce((v_r.payload->'permissions') ? a.legacy_permission,false))
  FROM public.permission_actions_v2 a JOIN public.permission_action_profiles_v2 ap ON ap.action_code=a.code AND ap.profile_code='restaurant' AND ap.active=true
  WHERE a.active=true;
 ELSE
  v_id:=v_r.employee_id;
  IF NOT EXISTS(SELECT 1 FROM public.employees e JOIN public.employee_branches eb ON eb.employee_id=e.id AND eb.business_id=e.business_id AND eb.branch_id=22
    WHERE e.id=v_id AND e.business_id=v_r.business_id AND e.auth_user_id=v_r.auth_user_id) THEN
    RAISE EXCEPTION 'STAFF_TARGET_SCOPE_DENIED' USING errcode='42501'; END IF;
 END IF;
 v_result:=jsonb_build_object('ok',true,'employee_id',v_id,'username',v_r.payload->>'username','business_id',v_r.business_id,'branch_id',22,'permissions_persisted',v_r.operation='create','replayed',false);
 INSERT INTO public.audit_logs(id,business_id,employee_id,branch_id,action,entity_type,entity_id,details)
 VALUES(nextval('public.audit_logs_id_seq'::regclass),v_r.business_id,v_actor,22,'tc.staff.'||v_r.operation||'.completed','employee',v_id,jsonb_build_object('request_id',p_request_id));
 UPDATE sharawla_internal.top_chicken_staff_requests_v1 SET employee_id=v_id,result=v_result,completed_at=now() WHERE business_id=v_r.business_id AND request_id=v_r.request_id;
 RETURN v_result;
END $$;
CREATE OR REPLACE FUNCTION public.top_chicken_staff_login_context_v1(p_username text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_row record;BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT sharawla_internal.top_chicken_binding_ready_v1() OR NOT sharawla_internal.top_chicken_transaction_feature_v1('core.auth') THEN RAISE EXCEPTION 'SERVICE_ONLY' USING errcode='42501'; END IF;
 SELECT e.id,e.auth_user_id INTO v_row FROM public.employees e
 JOIN public.business_auth_memberships m ON m.auth_user_id=e.auth_user_id AND m.business_id=e.business_id AND m.active=true
 JOIN public.employee_branches eb ON eb.employee_id=e.id AND eb.business_id=e.business_id AND eb.branch_id=22
 WHERE lower(e.username)=lower(trim(p_username)) AND e.business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid AND e.active=true;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('employee_id',v_row.id,'auth_user_id',v_row.auth_user_id);
END $$;
REVOKE ALL ON FUNCTION public.top_chicken_reserve_staff_v1(uuid,uuid,text,jsonb,text),public.top_chicken_complete_staff_v1(uuid,uuid,text),public.top_chicken_staff_login_context_v1(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.top_chicken_reserve_staff_v1(uuid,uuid,text,jsonb,text),public.top_chicken_complete_staff_v1(uuid,uuid,text),public.top_chicken_staff_login_context_v1(text) TO service_role;
COMMIT;
