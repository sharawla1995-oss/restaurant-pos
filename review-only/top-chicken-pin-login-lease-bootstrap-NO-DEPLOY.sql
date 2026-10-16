-- REVIEW ONLY, NEVER APPLY WITHOUT INDEPENDENT APPROVAL.
-- Top Chicken Beta ONLY. This retains account lockout, membership/branch/status
-- checks before PIN verification; it moves the 60-second feature lease gate
-- to the EXISTING top_chicken_pin_login_success_v1 after actual Auth success.
-- The PIN Edge must refresh a new Central-signed lease between the two RPCs.
-- It is UNSAFE to apply this before the reviewed PIN Edge replacement.
BEGIN;
CREATE OR REPLACE FUNCTION public.top_chicken_pin_login_attempt_v1(p_username text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','auth','sharawla_internal'
AS $function$
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
     -- Do not check the short lease before verifying the PIN:
     -- top_chicken_pin_login_success_v1 still requires all 3 live core
     -- grants AFTER verified Auth+signed renewal, before granting a session.
 ) INTO v_allowed;
 RETURN jsonb_build_object('allowed',v_allowed);
END
$function$;
-- DO NOT replace or relax top_chicken_pin_login_success_v1, membership, RLS,
-- account-level lockout, Auth password checking or HMAC-signed lease authority.
COMMIT;
