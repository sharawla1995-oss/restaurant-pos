-- SOURCE ONLY / NO DEPLOY. Top Chicken SH-0008 branch 22 PIN4 login guard.
-- Existing Supabase Auth remains the only issuer of sessions and verifies a
-- secret-peppered strong Auth password. The server-secret never goes to SQL.
-- This file must be reviewed/tested on isolated PostgreSQL before Beta apply.
BEGIN;
DO $$
BEGIN
 IF to_regclass('public.top_chicken_pin_attempts_v1') IS NOT NULL THEN
   RAISE EXCEPTION 'TC_PIN4_MIGRATION_ALREADY_APPLIED';
 END IF;
 IF to_regclass('public.employees') IS NULL OR to_regclass('public.business_auth_memberships') IS NULL
    OR to_regclass('sharawla_internal.operational_feature_entitlements_v1') IS NULL THEN
   RAISE EXCEPTION 'TC_PIN4_DEPENDENCY_MISSING';
 END IF;
END $$;
CREATE TABLE public.top_chicken_pin_attempts_v1(
 username text PRIMARY KEY CHECK(username ~ '^[a-z][a-z0-9._-]{2,31}$'),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 6),
 window_start timestamptz NOT NULL DEFAULT now(),
 locked_until timestamptz NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.top_chicken_pin_attempts_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.top_chicken_pin_attempts_v1 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.top_chicken_pin_attempts_v1 FROM service_role;
-- Service role cannot read counters directly. The fixed functions own all access.

CREATE FUNCTION public.top_chicken_pin_login_attempt_v1(p_username text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','auth','sharawla_internal'
AS $$
DECLARE
 h text:=lower(trim(coalesce(p_username,'')));
 v public.top_chicken_pin_attempts_v1%rowtype;
 v_allowed boolean:=false;
 v_now timestamptz:=clock_timestamp();
 v_business uuid:='5358328c-9724-49aa-affc-1bce8be90f92';
BEGIN
 IF h !~ '^[a-z][a-z0-9._-]{2,31}$' THEN
   RETURN jsonb_build_object('allowed',false);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('tc-pin-login:'||h,0));
 INSERT INTO public.top_chicken_pin_attempts_v1(username,attempts,window_start,updated_at)
 VALUES(h,0,v_now,v_now) ON CONFLICT(username) DO NOTHING;
 SELECT * INTO v FROM public.top_chicken_pin_attempts_v1 WHERE username=h FOR UPDATE;
 IF (v.locked_until IS NOT NULL AND v.locked_until>v_now) THEN
   RETURN jsonb_build_object('allowed',false,'locked',true);
 END IF;
 IF v.locked_until IS NOT NULL OR v.window_start < v_now-interval '15 minutes' THEN
   UPDATE public.top_chicken_pin_attempts_v1 SET
     attempts=0,window_start=v_now,locked_until=NULL,updated_at=v_now WHERE username=h;
   v.attempts:=0;
 END IF;
 IF v.attempts>=5 THEN
   UPDATE public.top_chicken_pin_attempts_v1 SET locked_until=v_now+interval '15 minutes',
     updated_at=v_now WHERE username=h;
   RETURN jsonb_build_object('allowed',false,'locked',true);
 END IF;
 UPDATE public.top_chicken_pin_attempts_v1 SET attempts=attempts+1,
   updated_at=v_now WHERE username=h;
 SELECT EXISTS(
   SELECT 1 FROM auth.users au
   JOIN public.employees e ON e.auth_user_id=au.id
   JOIN public.business_auth_memberships m
     ON m.auth_user_id=e.auth_user_id AND m.business_id=e.business_id
   JOIN public.branches b ON b.id=22 AND b.business_id=e.business_id
   WHERE lower(au.email)='tc-sh0008-'||h||'@accounts.example'
     AND e.business_id=v_business AND e.branch_id=22 AND e.active IS TRUE
     AND e.role IN ('admin','cashier','callcenter') AND b.active IS TRUE AND m.active IS TRUE
     AND (SELECT count(DISTINCT x.feature_code)
          FROM sharawla_internal.operational_feature_entitlements_v1 x
          WHERE x.cloud_business_id=v_business
            AND x.feature_code IN ('core.auth','core.users','core.permissions')
            AND x.enabled IS TRUE
            AND (x.valid_until IS NULL OR x.valid_until>v_now))=3
 ) INTO v_allowed;
 RETURN jsonb_build_object('allowed',v_allowed);
END
$$;
REVOKE ALL ON FUNCTION public.top_chicken_pin_login_attempt_v1(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.top_chicken_pin_login_attempt_v1(text) TO service_role;

CREATE FUNCTION public.top_chicken_pin_login_success_v1(p_username text,p_auth_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','auth'
AS $$
DECLARE h text:=lower(trim(coalesce(p_username,'')));
        v_employee_id bigint;
BEGIN
 IF h !~ '^[a-z][a-z0-9._-]{2,31}$' OR p_auth_user_id IS NULL THEN RETURN false;END IF;
 SELECT e.id INTO v_employee_id
 FROM public.employees e JOIN auth.users au ON au.id=e.auth_user_id
 JOIN public.business_auth_memberships m ON m.auth_user_id=e.auth_user_id
   AND m.business_id=e.business_id
 JOIN public.branches b ON b.id=22 AND b.business_id=e.business_id
 WHERE e.auth_user_id=p_auth_user_id
   AND lower(au.email)='tc-sh0008-'||h||'@accounts.example'
   AND e.business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid
   AND e.branch_id=22 AND e.active IS TRUE AND m.active IS TRUE AND b.active IS TRUE
   AND (SELECT count(DISTINCT x.feature_code)
     FROM sharawla_internal.operational_feature_entitlements_v1 x
     WHERE x.cloud_business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid
       AND x.feature_code IN ('core.auth','core.users','core.permissions')
       AND x.enabled IS TRUE AND (x.valid_until IS NULL OR x.valid_until>clock_timestamp()))=3
 LIMIT 1;
 IF v_employee_id IS NULL THEN RETURN false; END IF;
 DELETE FROM public.top_chicken_pin_attempts_v1 WHERE username=h;
 INSERT INTO public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details,business_id)
 VALUES(v_employee_id,22,'top_chicken_pin.login','employee',v_employee_id,
   jsonb_build_object('method','username_pin4'),
   '5358328c-9724-49aa-affc-1bce8be90f92'::uuid);
 RETURN true;
END
$$;
REVOKE ALL ON FUNCTION public.top_chicken_pin_login_success_v1(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.top_chicken_pin_login_success_v1(text,uuid) TO service_role;
COMMIT;
