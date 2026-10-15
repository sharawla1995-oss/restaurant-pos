-- AFTER staff create fixture+tests; disposable PostgreSQL 16 only.
DO $verify$
DECLARE
 v_actor uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 v_target bigint;
 v_foreign bigint;
 v_resp jsonb;
 v_request uuid:='10000000-0000-4000-8000-000000000101';
 v_denied boolean;
 v_business uuid:='5358328c-9724-49aa-affc-1bce8be90f92';
BEGIN
 SELECT id INTO v_target FROM public.employees
  WHERE auth_user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' AND business_id=v_business;
 SELECT id INTO v_foreign FROM public.employees
  WHERE auth_user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 IF v_target IS NULL OR v_foreign IS NULL THEN
  RAISE EXCEPTION 'FAIL manage fixture missing employees';
 END IF;
 IF has_function_privilege('anon',
  'public.top_chicken_staff_manage_v1(uuid,uuid,text,text,bigint,text,text,boolean,text[])','execute')
  OR has_function_privilege('authenticated',
  'public.top_chicken_staff_manage_v1(uuid,uuid,text,text,bigint,text,text,boolean,text[])','execute')
 THEN RAISE EXCEPTION 'FAIL manage public grant'; END IF;
 v_resp:=public.top_chicken_staff_manage_v1(v_actor,v_request,repeat('e',64),'edit',
   v_target,'Updated cashier','callcenter',true,ARRAY['customers','orders']);
 IF v_resp->>'ok'<>'true' OR v_resp->>'employee_id'<>v_target::text THEN
  RAISE EXCEPTION 'FAIL edit response %',v_resp; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.employees
   WHERE id=v_target AND business_id=v_business AND name='Updated cashier'
   AND role='callcenter' AND active) THEN RAISE EXCEPTION 'FAIL edit row'; END IF;
 IF (SELECT count(*) FROM public.employee_permissions
   WHERE employee_id=v_target AND business_id=v_business)<>2 THEN
   RAISE EXCEPTION 'FAIL edit permissions replace'; END IF;
 v_resp:=public.top_chicken_staff_manage_v1(v_actor,v_request,repeat('e',64),'edit',
   v_target,'Updated cashier','callcenter',true,ARRAY['customers','orders']);
 IF v_resp->>'replay'<>'true' THEN RAISE EXCEPTION 'FAIL idempotent edit replay'; END IF;
 v_denied:=false;
 BEGIN PERFORM public.top_chicken_staff_manage_v1(v_actor,v_request,repeat('f',64),'edit',
    v_target,'Updated cashier','callcenter',true,ARRAY['customers','orders']);
 EXCEPTION WHEN OTHERS THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'FAIL changed payload replay'; END IF;
 v_denied:=false;
 BEGIN PERFORM public.top_chicken_staff_manage_v1(v_actor,
   '10000000-0000-4000-8000-000000000102',repeat('f',64),'toggle',
   v_foreign,NULL,NULL,false,ARRAY[]::text[]);
 EXCEPTION WHEN OTHERS THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'FAIL cross tenant target'; END IF;
 v_denied:=false;
 BEGIN PERFORM public.top_chicken_staff_manage_v1(v_actor,
   '10000000-0000-4000-8000-000000000103',repeat('f',64),'edit',
   v_target,'Malicious','admin',true,ARRAY['unknown.root.power']);
 EXCEPTION WHEN OTHERS THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'FAIL unknown privilege'; END IF;
 v_denied:=false;
 BEGIN PERFORM public.top_chicken_staff_manage_v1(v_actor,
   '10000000-0000-4000-8000-000000000104',repeat('f',64),'toggle',
   (SELECT id FROM public.employees WHERE business_id=v_business AND auth_user_id=v_actor),
   NULL,NULL,false,ARRAY[]::text[]);
 EXCEPTION WHEN OTHERS THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'FAIL self disable'; END IF;
 PERFORM public.top_chicken_staff_manage_v1(v_actor,
   '10000000-0000-4000-8000-000000000105',repeat('f',64),'toggle',
   v_target,NULL,NULL,false,ARRAY[]::text[]);
 IF EXISTS(SELECT 1 FROM public.business_auth_memberships
  WHERE auth_user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    AND business_id=v_business AND active) THEN RAISE EXCEPTION 'FAIL membership revoke'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.employees
   WHERE business_id=v_business AND id=v_target AND active=false) THEN
   RAISE EXCEPTION 'FAIL employee disable'; END IF;
 PERFORM public.top_chicken_staff_manage_v1(v_actor,
   '10000000-0000-4000-8000-000000000106',repeat('f',64),'toggle',
   v_target,NULL,NULL,true,ARRAY[]::text[]);
 IF NOT EXISTS(SELECT 1 FROM public.business_auth_memberships
   WHERE auth_user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    AND business_id=v_business AND active) THEN RAISE EXCEPTION 'FAIL membership re-enable'; END IF;
 IF (SELECT count(*) FROM public.audit_logs WHERE business_id=v_business
  AND action IN ('top_chicken_staff.edit','top_chicken_staff.toggle'))<>3 THEN
   RAISE EXCEPTION 'FAIL audit event count'; END IF;
 IF (SELECT count(*) FROM public.employees WHERE business_id='91826502-590e-4afa-8826-2c0f4b99c490')<>1 THEN
   RAISE EXCEPTION 'FAIL legacy tenant changed'; END IF;
 RAISE NOTICE 'PASS: TC staff edit/toggle ownership, deny foreign target/unknown permission/self-disable, membership disable/enable, idempotency, actor audit, legacy parity';
END $verify$;
