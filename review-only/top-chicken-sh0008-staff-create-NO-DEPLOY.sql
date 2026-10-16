-- SOURCE-ONLY DRAFT / NO DEPLOY
-- Top Chicken SH-0008 Beta ONLY. Requires separate SQL and Edge approvals.
-- Never run against Production or other Beta business.
BEGIN;

CREATE TABLE IF NOT EXISTS public.top_chicken_staff_create_receipts_v1 (
  request_id uuid PRIMARY KEY,
  business_id uuid NOT NULL DEFAULT '5358328c-9724-49aa-affc-1bce8be90f92'::uuid
    CHECK (business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid),
  actor_auth_user_id uuid NOT NULL,
  payload_digest text NOT NULL CHECK (payload_digest ~ '^[a-f0-9]{64}$'),
  email text NOT NULL,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','completed')),
  auth_user_id uuid UNIQUE,
  employee_id bigint UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK ((status='completed')=(employee_id IS NOT NULL))
);
REVOKE ALL ON public.top_chicken_staff_create_receipts_v1 FROM PUBLIC,anon,authenticated;
ALTER TABLE public.top_chicken_staff_create_receipts_v1 ENABLE ROW LEVEL SECURITY;

-- This admin check is applied independently during reservation AND completion.
-- It never trusts an input business, role or branch selector.
CREATE OR REPLACE FUNCTION public.top_chicken_staff_actor_authorized_v1(p_actor_auth_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $body$
SELECT EXISTS (
  SELECT 1 FROM public.employees e
  JOIN public.business_auth_memberships m
    ON m.auth_user_id=e.auth_user_id AND m.business_id=e.business_id
  JOIN public.branches b ON b.id=22 AND b.business_id=e.business_id
  WHERE e.auth_user_id=p_actor_auth_user_id
    AND e.business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid
    AND e.role='admin' AND e.active IS TRUE AND m.active IS TRUE
    AND b.active IS TRUE
    AND e.branch_id=22
    AND (SELECT count(DISTINCT fe.feature_code)
         FROM sharawla_internal.operational_feature_entitlements_v1 fe
         WHERE fe.cloud_business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid
           AND fe.feature_code IN ('core.auth','core.users','core.permissions')
           AND fe.enabled IS TRUE
           AND (fe.valid_until IS NULL OR fe.valid_until>statement_timestamp()))=3
)
$body$;
REVOKE ALL ON FUNCTION public.top_chicken_staff_actor_authorized_v1(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.top_chicken_staff_actor_authorized_v1(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.top_chicken_staff_create_reserve_v1(
  p_actor_auth_user_id uuid,p_request_id uuid,p_payload_digest text,p_email text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $body$
DECLARE v_inserted integer; v_rec public.top_chicken_staff_create_receipts_v1%rowtype;
  v_email text:=lower(trim(coalesce(p_email,'')));
BEGIN
  IF NOT public.top_chicken_staff_actor_authorized_v1(p_actor_auth_user_id)
    THEN RAISE EXCEPTION 'TC_ADMIN_ACTOR_DENIED' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL OR p_payload_digest !~ '^[a-f0-9]{64}$'
    OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    THEN RAISE EXCEPTION 'TC_STAFF_INVALID_RESERVATION'; END IF;
  INSERT INTO public.top_chicken_staff_create_receipts_v1
  (request_id,actor_auth_user_id,payload_digest,email)
  VALUES(p_request_id,p_actor_auth_user_id,p_payload_digest,v_email)
  ON CONFLICT (request_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  SELECT * INTO v_rec FROM public.top_chicken_staff_create_receipts_v1
  WHERE request_id=p_request_id FOR UPDATE;
  IF v_rec.actor_auth_user_id IS DISTINCT FROM p_actor_auth_user_id
    OR v_rec.payload_digest IS DISTINCT FROM p_payload_digest
    OR v_rec.email IS DISTINCT FROM v_email THEN
     RAISE EXCEPTION 'TC_STAFF_REQUEST_REPLAY_CONFLICT' USING ERRCODE='23505';
  END IF;
  RETURN jsonb_build_object(
    'ok',true,'new_reservation',(v_inserted=1),
    'status',v_rec.status,'employee_id',v_rec.employee_id,
    'business_id',v_rec.business_id
  );
END
$body$;
REVOKE ALL ON FUNCTION public.top_chicken_staff_create_reserve_v1(uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.top_chicken_staff_create_reserve_v1(uuid,uuid,text,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.top_chicken_staff_create_finish_v1(
  p_actor_auth_user_id uuid,p_request_id uuid,p_payload_digest text,
  p_auth_user_id uuid,p_name text,p_role text,p_active boolean,
  p_permissions text[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $body$
DECLARE v_rec public.top_chicken_staff_create_receipts_v1%rowtype;
  v_employee_id bigint;v_actor_employee_id bigint;
  v_perm text;v_permissions text[];
  v_name text:=nullif(trim(coalesce(p_name,'')),'');
  v_role text:=lower(trim(coalesce(p_role,'')));
  v_business constant uuid:='5358328c-9724-49aa-affc-1bce8be90f92';
  v_username text;
BEGIN
 IF NOT public.top_chicken_staff_actor_authorized_v1(p_actor_auth_user_id) THEN
    RAISE EXCEPTION 'TC_ADMIN_ACTOR_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_rec FROM public.top_chicken_staff_create_receipts_v1
 WHERE request_id=p_request_id FOR UPDATE;
 IF NOT FOUND OR v_rec.actor_auth_user_id IS DISTINCT FROM p_actor_auth_user_id
    OR v_rec.business_id IS DISTINCT FROM v_business
    OR v_rec.payload_digest IS DISTINCT FROM p_payload_digest THEN
    RAISE EXCEPTION 'TC_STAFF_RECEIPT_MISMATCH' USING ERRCODE='42501';
 END IF;
 IF v_rec.status='completed' THEN
   IF v_rec.auth_user_id IS DISTINCT FROM p_auth_user_id THEN
      RAISE EXCEPTION 'TC_STAFF_AUTH_REPLAY_MISMATCH' USING ERRCODE='23505';
   END IF;
   RETURN jsonb_build_object('ok',true,'replay',true,'employee_id',v_rec.employee_id,
                             'business_id',v_business,'branch_id',22,'permissions_persisted',true);
 END IF;
 IF v_name IS NULL OR length(v_name)>120 OR v_role NOT IN ('cashier','callcenter','admin')
    OR p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'TC_STAFF_INPUT_INVALID';
 END IF;
 -- The auth record MUST already exist and match the reserved email.
 IF NOT EXISTS(SELECT 1 FROM auth.users au WHERE au.id=p_auth_user_id
      AND lower(au.email)=v_rec.email) THEN
   RAISE EXCEPTION 'TC_STAFF_AUTH_USER_NOT_VERIFIED' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM public.business_auth_memberships m
       WHERE m.auth_user_id=p_auth_user_id)
    OR EXISTS(SELECT 1 FROM public.employees e WHERE e.auth_user_id=p_auth_user_id) THEN
   RAISE EXCEPTION 'TC_STAFF_EXISTING_IDENTITY_FORBIDDEN' USING ERRCODE='23505';
 END IF;
 -- Reject unfamiliar permission identifiers, rather than inventing privileges.
 SELECT coalesce(array_agg(DISTINCT p),ARRAY[]::text[]) INTO v_permissions
 FROM unnest(coalesce(p_permissions,ARRAY[]::text[])) p
 WHERE p~'^[a-zA-Z][a-zA-Z0-9._-]{0,63}$';
 IF cardinality(coalesce(p_permissions,ARRAY[]::text[]))>100
    OR cardinality(v_permissions) IS DISTINCT FROM
       (SELECT count(DISTINCT p) FROM unnest(coalesce(p_permissions,ARRAY[]::text[])) p)
 THEN RAISE EXCEPTION 'TC_STAFF_PERMISSIONS_INVALID'; END IF;
 -- Explicitly refuse direct privilege assignment beyond the runtime's
 -- deployed known permission catalog. This array is the source allow-list for
 -- this candidate and must be reviewed against the exact runtime configuration.
 IF EXISTS(SELECT 1 FROM unnest(v_permissions) p
  WHERE p NOT IN (
   'home',
   'pos',
   'orders',
   'returns',
   'returnExecute',
   'returnApprovals',
   'customers',
   'deliveryOrders',
   'deliverySettlement',
   'deliveryPaymentCorrection',
   'shifts',
   'expenses',
   'reports',
   'products',
   'promoCodes',
   'deliverySettings',
   'kitchen',
   'inventory',
   'settings',
   'branchProductAvailability',
   'websiteBranchSettings',
   'branchManagement',
   'businessSettings',
   'printingSettings',
   'financialSettings',
   'websiteAppearance',
   'discount',
   'hr.employees.view',
   'hr.employees.create',
   'hr.employees.edit',
   'hr.salary.view',
   'hr.salary.manage',
   'hr.attendance.view',
   'hr.attendance.manage',
   'hr.attendance.adjust',
   'hr.schedules.view',
   'hr.schedules.manage',
   'hr.geofence.manage',
   'hr.staff_accounts.manage',
   'hr.leave.view',
   'hr.leave.manage',
   'hr.deduction_rules.view',
   'hr.deduction_rules.manage',
   'hr.advances.view',
   'hr.advances.create',
   'hr.advances.approve',
   'hr.advances.disburse',
   'hr.adjustments.view',
   'hr.adjustments.manage',
   'hr.payroll.view',
   'hr.payroll.run',
   'hr.payroll.approve',
   'hr.payroll.pay',
   'hr.reports.view',
   'hr.settings.manage',
   'branch.hr.adjustments.request',
   'branch.hr.finance.view',
   'branch.hr.finance.disburse',
   'treasury.post'
  )) THEN RAISE EXCEPTION 'TC_STAFF_PERMISSION_NOT_ALLOWLISTED'; END IF;
 -- The deployed Beta employees table forbids '@' in username and limits
 -- its length to 3..40. Auth login email lives only in auth.users; the
 -- deterministic internal handle is not presented as a login email.
 -- Include a suffix tied to the entire email so equal local-parts at distinct
 -- domains do not clash. Unique indexes remain the authoritative guard.
 v_username:='tc_'||
   left(regexp_replace(split_part(v_rec.email,'@',1),'[^a-z0-9._-]','','g'),20)
   ||'_'||substr(md5(v_rec.email),1,12);
 IF char_length(v_username)<3 OR char_length(v_username)>40
    OR position('@' IN v_username)>0 THEN
   RAISE EXCEPTION 'TC_STAFF_INTERNAL_USERNAME_INVALID';
 END IF;
 IF EXISTS(SELECT 1 FROM public.employees e
           WHERE e.business_id=v_business AND lower(e.username)=lower(v_username)) THEN
   RAISE EXCEPTION 'TC_STAFF_INTERNAL_USERNAME_CONFLICT' USING ERRCODE='23505';
 END IF;
 SELECT e.id INTO v_actor_employee_id FROM public.employees e
 WHERE e.auth_user_id=p_actor_auth_user_id AND e.business_id=v_business AND e.active IS TRUE
 LIMIT 1;
 INSERT INTO public.employees(name,username,role,branch_id,active,auth_user_id,business_id)
 VALUES(v_name,v_username,v_role,22,coalesce(p_active,true),p_auth_user_id,v_business)
 RETURNING id INTO v_employee_id;
 -- A disabled employee must never begin with an active tenant membership.
 -- Source of effective authorization remains employee AND membership active.
 INSERT INTO public.business_auth_memberships(auth_user_id,business_id,active,source)
 VALUES(p_auth_user_id,v_business,coalesce(p_active,true),'top-chicken-staff-v1');
 INSERT INTO public.employee_branches(employee_id,branch_id,business_id)
 VALUES(v_employee_id,22,v_business);
 IF v_role<>'admin' THEN
   INSERT INTO public.employee_permissions(employee_id,permission_key,allowed,business_id)
   SELECT v_employee_id,p,true,v_business FROM unnest(v_permissions) p
   WHERE p<>'home';
 END IF;
 INSERT INTO public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details,business_id)
 VALUES(v_actor_employee_id,22,'top_chicken_staff.create','employee',v_employee_id,
   jsonb_build_object('request_id',p_request_id,'role',v_role,'active',coalesce(p_active,true)),
   v_business);
 UPDATE public.top_chicken_staff_create_receipts_v1
 SET status='completed',auth_user_id=p_auth_user_id,employee_id=v_employee_id,completed_at=now()
 WHERE request_id=p_request_id;
 RETURN jsonb_build_object('ok',true,'replay',false,'business_id',v_business,
   'branch_id',22,'employee_id',v_employee_id,'permissions_persisted',true);
END
$body$;
REVOKE ALL ON FUNCTION public.top_chicken_staff_create_finish_v1(uuid,uuid,text,uuid,text,text,boolean,text[])
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.top_chicken_staff_create_finish_v1(uuid,uuid,text,uuid,text,text,boolean,text[])
  TO service_role;

-- Do not create accounts or grant a single entitlement as part of this file.
COMMIT;
