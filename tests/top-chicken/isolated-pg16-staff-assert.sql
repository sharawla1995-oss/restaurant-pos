DO $test$
DECLARE r jsonb;denied boolean;tc uuid:='5358328c-9724-49aa-affc-1bce8be90f92';
  actor uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  legacy uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  request_id uuid:='10000000-0000-4000-8000-000000000001';
  digest text:=repeat('a',64); target uuid:='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
BEGIN
 IF has_function_privilege('anon','public.top_chicken_staff_create_reserve_v1(uuid,uuid,text,text)','execute')
    OR has_function_privilege('authenticated','public.top_chicken_staff_create_finish_v1(uuid,uuid,text,uuid,text,text,boolean,text[])','execute') THEN
    RAISE EXCEPTION 'FAIL grant to anonymous or authenticated';
 END IF;
 denied:=false;
 BEGIN
  PERFORM public.top_chicken_staff_create_reserve_v1(legacy,request_id,digest,'new@example.com');
 EXCEPTION WHEN OTHERS THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'FAIL foreign legacy admin accepted'; END IF;
 -- Explicit revocation and expiry deny even an active Top Chicken admin.
 UPDATE sharawla_internal.operational_feature_entitlements_v1 SET enabled=false
 WHERE cloud_business_id=tc AND feature_code='core.users';
 denied:=false;
 BEGIN
  PERFORM public.top_chicken_staff_create_reserve_v1(actor,request_id,digest,'new@example.com');
 EXCEPTION WHEN OTHERS THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'FAIL disabled TC users feature'; END IF;
 UPDATE sharawla_internal.operational_feature_entitlements_v1
 SET enabled=true,valid_until=now()-interval '1 day'
 WHERE cloud_business_id=tc AND feature_code='core.users';
 denied:=false;
 BEGIN
  PERFORM public.top_chicken_staff_create_reserve_v1(actor,request_id,digest,'new@example.com');
 EXCEPTION WHEN OTHERS THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'FAIL expired TC users feature'; END IF;
 UPDATE sharawla_internal.operational_feature_entitlements_v1
 SET valid_until=NULL WHERE cloud_business_id=tc AND feature_code='core.users';
 r:=public.top_chicken_staff_create_reserve_v1(actor,request_id,digest,'new@example.com');
 IF r->>'status'<>'reserved' OR r->>'new_reservation'<>'true' THEN
   RAISE EXCEPTION 'FAIL first receipt %',r;
 END IF;
 r:=public.top_chicken_staff_create_reserve_v1(actor,request_id,digest,'new@example.com');
 IF r->>'new_reservation'<>'false' THEN RAISE EXCEPTION 'FAIL pending replay'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.top_chicken_staff_create_reserve_v1(actor,request_id,repeat('b',64),'new@example.com');
 EXCEPTION WHEN OTHERS THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'FAIL digest collision'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.top_chicken_staff_create_finish_v1(actor,request_id,digest,
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','New cashier','cashier',true,ARRAY['pos']);
 EXCEPTION WHEN OTHERS THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'FAIL wrong Auth user email'; END IF;
 r:=public.top_chicken_staff_create_finish_v1(actor,request_id,digest,target,
      'New cashier','cashier',true,ARRAY['pos','orders','hr.employees.view']);
 IF r->>'ok'<>'true' OR r->>'permissions_persisted'<>'true'
    OR r->>'branch_id'<>'22' THEN RAISE EXCEPTION 'FAIL commit %',r; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.business_auth_memberships
   WHERE auth_user_id=target AND business_id=tc AND active) THEN RAISE EXCEPTION 'FAIL membership'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.employees e
   JOIN auth.users u ON u.id=e.auth_user_id
   WHERE e.auth_user_id=target AND e.business_id=tc
     AND u.email='new@example.com'
     AND e.username LIKE 'tc_%'
     AND length(e.username) BETWEEN 3 AND 40
     AND position('@' IN e.username)=0
 ) THEN RAISE EXCEPTION 'FAIL email/username compatibility with deployed Beta CHECK constraints'; END IF;
 IF (SELECT count(*) FROM public.employee_permissions p JOIN public.employees e
   ON e.id=p.employee_id WHERE e.auth_user_id=target AND p.business_id=tc)<>3 THEN
   RAISE EXCEPTION 'FAIL saved permissions';
 END IF;
 IF (SELECT count(*) FROM public.audit_logs WHERE business_id=tc AND action='top_chicken_staff.create')<>1 THEN
   RAISE EXCEPTION 'FAIL audit';
 END IF;
 r:=public.top_chicken_staff_create_finish_v1(actor,request_id,digest,target,
   'New cashier','cashier',true,ARRAY['pos','orders','hr.employees.view']);
 IF r->>'replay'<>'true' THEN RAISE EXCEPTION 'FAIL complete replay'; END IF;
 IF (SELECT count(*) FROM public.employees WHERE business_id=tc)<>2 THEN
   RAISE EXCEPTION 'FAIL duplicate employee';
 END IF;
 -- Distinct Auth emails with the same local part require different internal
 -- employees.username values. Neither username can contain '@'.
 r:=public.top_chicken_staff_create_reserve_v1(actor,
   '10000000-0000-4000-8000-000000000002',repeat('c',64),
   'new@another.example.com');
 IF r->>'new_reservation'<>'true' THEN RAISE EXCEPTION 'FAIL second domain reservation'; END IF;
 r:=public.top_chicken_staff_create_finish_v1(actor,
   '10000000-0000-4000-8000-000000000002',repeat('c',64),
   'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
   'Same local different domain','cashier',true,ARRAY['pos']);
 IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'FAIL distinct-domain Auth creation'; END IF;
 IF (SELECT count(DISTINCT username) FROM public.employees
     WHERE business_id=tc AND username LIKE 'tc_%')<>2 THEN
   RAISE EXCEPTION 'FAIL same-local-part distinct emails collided';
 END IF;
 IF EXISTS(SELECT 1 FROM public.employees WHERE business_id=tc
           AND position('@' IN username)>0) THEN
   RAISE EXCEPTION 'FAIL @ in internal username';
 END IF;
 IF (SELECT count(*) FROM public.employees WHERE business_id=tc)<>3 THEN
   RAISE EXCEPTION 'FAIL total TC employees after second valid account';
 END IF;
 IF (SELECT count(*) FROM public.employees WHERE business_id='91826502-590e-4afa-8826-2c0f4b99c490')<>1 THEN
   RAISE EXCEPTION 'FAIL altered legacy tenant';
 END IF;
 RAISE NOTICE 'PASS isolated PG16: admin-only, tenant-bound, first reserve, pending replay, changed-payload denial, verified auth id, atomic employee+branch+membership+3 permissions+audit, completed replay, legacy parity';
END $test$;
