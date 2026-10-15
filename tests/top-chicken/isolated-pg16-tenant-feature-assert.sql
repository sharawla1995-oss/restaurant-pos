-- Run AFTER the review-only tenant resolver patch in disposable PostgreSQL 16.
DO $test$
DECLARE ok boolean;
BEGIN
 PERFORM set_config('tc.fixture_uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
 PERFORM set_config('tc.fixture_selected_business','5358328c-9724-49aa-affc-1bce8be90f92',false);
 ok:=sharawla_internal.operational_feature_entitled_v1('commerce.delivery');
 IF ok THEN RAISE EXCEPTION 'FAIL TC borrowed legacy entitlement'; END IF;

 -- Fixture-only grant, absolutely not a real Cloud entitlement mutation.
 INSERT INTO sharawla_internal.operational_feature_entitlements_v1
 VALUES ('5358328c-9724-49aa-affc-1bce8be90f92','commerce.delivery',true,NULL);
 ok:=sharawla_internal.operational_feature_entitled_v1('commerce.delivery');
 IF NOT ok THEN RAISE EXCEPTION 'FAIL TC own grant not honored'; END IF;
 UPDATE sharawla_internal.operational_feature_entitlements_v1
 SET enabled=false WHERE cloud_business_id='5358328c-9724-49aa-affc-1bce8be90f92';
 IF sharawla_internal.operational_feature_entitled_v1('commerce.delivery') THEN
   RAISE EXCEPTION 'FAIL disabled TC feature allowed';
 END IF;
 UPDATE sharawla_internal.operational_feature_entitlements_v1
 SET enabled=true,valid_until=now()-interval '1 minute'
 WHERE cloud_business_id='5358328c-9724-49aa-affc-1bce8be90f92';
 IF sharawla_internal.operational_feature_entitled_v1('commerce.delivery') THEN
   RAISE EXCEPTION 'FAIL expired TC feature allowed';
 END IF;
 UPDATE sharawla_internal.operational_feature_entitlements_v1
 SET enabled=true,valid_until=NULL
 WHERE cloud_business_id='5358328c-9724-49aa-affc-1bce8be90f92';
 PERFORM set_config('tc.fixture_uid','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
 PERFORM set_config('tc.fixture_selected_business','91826502-590e-4afa-8826-2c0f4b99c490',false);
 IF NOT sharawla_internal.operational_feature_entitled_v1('commerce.delivery') THEN
   RAISE EXCEPTION 'FAIL legacy Beta entitlement changed';
 END IF;
 PERFORM set_config('tc.fixture_selected_business','5358328c-9724-49aa-affc-1bce8be90f92',false);
 IF sharawla_internal.operational_feature_entitled_v1('commerce.delivery') THEN
   RAISE EXCEPTION 'FAIL forged TC selector allowed legacy actor';
 END IF;
 PERFORM set_config('tc.fixture_uid','',false);
 IF sharawla_internal.operational_feature_entitled_v1('commerce.delivery') THEN
   RAISE EXCEPTION 'FAIL anonymous entitlement allowed';
 END IF;
 RAISE NOTICE 'PASS: PG16 isolated TC deny-before-grant, own grant, disabled/expired, legacy parity, forged selector and anonymous deny';
END;
$test$;
