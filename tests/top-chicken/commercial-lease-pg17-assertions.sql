-- ISOLATED PostgreSQL 17 only: run AFTER fixture + review-only SQL in new DB.
-- No live Supabase credentials, no business data, no deployment.
CREATE FUNCTION pg_temp.proof_rows(p_at timestamptz,p_delivery boolean,p_supplier boolean)
RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_agg(jsonb_build_object(
   'feature_code',t.code,'enabled',t.enabled,
   'entitlement_version',floor(extract(epoch from p_at)*1000)::bigint,
   'source','tc-central-signed-commercial-v1',
   'valid_until', CASE WHEN t.enabled THEN p_at+interval '60 seconds' ELSE p_at END
 ) ORDER BY t.ord) FROM
 (VALUES (1,'core.auth',true),(2,'core.users',true),(3,'core.permissions',true),
         (4,'commerce.delivery',p_delivery),(5,'inventory.suppliers',p_supplier)) t(ord,code,enabled);
$$;
DO $test$
DECLARE
 tc constant uuid:='5358328c-9724-49aa-affc-1bce8be90f92'::uuid;
 legacy constant uuid:='3e405b6f-feba-4d5c-a4bf-bebb77f2d5d7'::uuid;
 actor constant uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid;
 foreign_actor constant uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid;
 nonce constant uuid:='cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid;
 t timestamptz:=statement_timestamp();
 t2 timestamptz;
 rows1 jsonb;
 rows2 jsonb;
 got jsonb;
 invalid jsonb;
 blocked boolean;
BEGIN
 IF has_function_privilege('authenticated',
   'public.top_chicken_commit_entitlement_lease_v1(uuid,uuid,timestamptz,text,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'FAIL authenticated has EXECUTE'; END IF;
 IF NOT has_function_privilege('service_role',
   'public.top_chicken_commit_entitlement_lease_v1(uuid,uuid,timestamptz,text,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'FAIL service role cannot invoke'; END IF;
 rows1:=pg_temp.proof_rows(t,true,true);
 SELECT public.top_chicken_commit_entitlement_lease_v1(actor,nonce,t,repeat('a',64),rows1) INTO got;
 IF got->>'ok'<>'true' OR got->>'replayed'<>'false' THEN RAISE EXCEPTION 'FAIL first commit %',got; END IF;
 IF (SELECT count(*) FROM sharawla_internal.operational_feature_entitlements_v1
       WHERE cloud_business_id=tc AND enabled)=5 THEN NULL; ELSE RAISE EXCEPTION 'FAIL exact five'; END IF;
 IF (SELECT count(*) FROM sharawla_internal.top_chicken_entitlement_sync_receipts_v1)=1
 THEN NULL; ELSE RAISE EXCEPTION 'FAIL audit receipt'; END IF;
 SELECT public.top_chicken_commit_entitlement_lease_v1(actor,nonce,t,repeat('a',64),rows1) INTO got;
 IF got->>'replayed'<>'true' THEN RAISE EXCEPTION 'FAIL replay %',got; END IF;
 blocked:=false;
 BEGIN PERFORM public.top_chicken_commit_entitlement_lease_v1(actor,nonce,t,repeat('b',64),rows1);
 EXCEPTION WHEN unique_violation THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'FAIL changed digest accepted'; END IF;
 blocked:=false;
 BEGIN PERFORM public.top_chicken_commit_entitlement_lease_v1(foreign_actor,
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',t,repeat('a',64),rows1);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'FAIL foreign actor'; END IF;
 blocked:=false;
 BEGIN PERFORM public.top_chicken_commit_entitlement_lease_v1(actor,
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',t-interval '20 seconds',repeat('a',64),
        pg_temp.proof_rows(t-interval '20 seconds',true,true));
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'FAIL stale proof'; END IF;
 blocked:=false;
 invalid:=jsonb_set(rows1,'{4,feature_code}','"commerce.website"'::jsonb);
 BEGIN PERFORM public.top_chicken_commit_entitlement_lease_v1(actor,
        'ffffffff-ffff-4fff-8fff-ffffffffffff',t,repeat('a',64),invalid);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'FAIL foreign feature'; END IF;
 PERFORM pg_sleep(0.012);
 t2:=clock_timestamp();
 rows2:=pg_temp.proof_rows(t2,false,true);
 SELECT public.top_chicken_commit_entitlement_lease_v1(actor,
        '11111111-1111-4111-8111-111111111111',t2,repeat('c',64),rows2) INTO got;
 IF got->>'ok'<>'true' THEN RAISE EXCEPTION 'FAIL revoke %',got; END IF;
 IF (SELECT enabled FROM sharawla_internal.operational_feature_entitlements_v1
        WHERE cloud_business_id=tc AND feature_code='commerce.delivery') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'FAIL revoke not propagated'; END IF;
 IF (SELECT enabled FROM sharawla_internal.operational_feature_entitlements_v1
        WHERE cloud_business_id=tc AND feature_code='inventory.suppliers') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'FAIL unrelated addon touched'; END IF;
 blocked:=false;
 BEGIN PERFORM public.top_chicken_commit_entitlement_lease_v1(actor,
        '22222222-2222-4222-8222-222222222222',t,repeat('a',64),rows1);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'FAIL version rollback allowed'; END IF;
 IF (SELECT count(*) FROM sharawla_internal.operational_feature_entitlements_v1
       WHERE cloud_business_id=legacy AND feature_code='commerce.delivery'
         AND enabled AND source='legacy-fixture')<>1
 THEN RAISE EXCEPTION 'FAIL legacy tenant mutated'; END IF;
 IF (SELECT count(*) FROM sharawla_internal.top_chicken_entitlement_sync_receipts_v1)<>2
 THEN RAISE EXCEPTION 'FAIL failed requests audited as writes'; END IF;
 RAISE NOTICE 'PASS isolated PG17: exact grant, revoke, audit, replay, changed nonce, foreign actor/feature, stale proof, old version, legacy isolation';
END $test$;
