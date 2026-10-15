-- SOURCE-ONLY / NO DEPLOY: Top Chicken SH-0008 staff edit/activate/deactivate.
-- Must be applied AFTER reviewed staff-create receipts and tenant entitlement setup.
-- Never expose DML; all decisions re-evaluated server-side per request.
BEGIN;
DO $check$
BEGIN
 IF to_regprocedure('public.top_chicken_staff_actor_authorized_v1(uuid)') IS NULL THEN
   RAISE EXCEPTION 'TC_STAFF_CREATE_GATE_MISSING';
 END IF;
 IF to_regclass('public.top_chicken_staff_manage_receipts_v1') IS NOT NULL THEN
   RAISE EXCEPTION 'TC_STAFF_MANAGE_REAPPLY_REVIEW_REQUIRED';
 END IF;
END;
$check$;
CREATE TABLE public.top_chicken_staff_manage_receipts_v1 (
 request_id uuid PRIMARY KEY,
 business_id uuid NOT NULL DEFAULT '5358328c-9724-49aa-affc-1bce8be90f92'::uuid
   CHECK (business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid),
 actor_auth_user_id uuid NOT NULL,
 target_employee_id bigint NOT NULL,
 action text NOT NULL CHECK(action IN ('edit','toggle')),
 payload_digest text NOT NULL CHECK(payload_digest ~ '^[a-f0-9]{64}$'),
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
ALTER TABLE public.top_chicken_staff_manage_receipts_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.top_chicken_staff_manage_receipts_v1 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.top_chicken_staff_manage_v1(
 p_actor_auth_user_id uuid,p_request_id uuid,p_payload_digest text,
 p_action text,p_employee_id bigint,p_name text,p_role text,p_active boolean,
 p_permissions text[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $body$
DECLARE
 v_business constant uuid:='5358328c-9724-49aa-affc-1bce8be90f92';
 v_target public.employees%rowtype;
 v_existing public.top_chicken_staff_manage_receipts_v1%rowtype;
 v_actor_id bigint;
 v_action text:=lower(trim(coalesce(p_action,'')));
 v_name text; v_role text; v_active boolean;
 v_permissions text[];v_result jsonb;
BEGIN
 IF p_request_id IS NULL OR p_payload_digest !~ '^[a-f0-9]{64}$'
    OR v_action NOT IN ('edit','toggle') OR p_employee_id IS NULL THEN
   RAISE EXCEPTION 'TC_STAFF_MANAGE_INVALID_REQUEST';
 END IF;
 IF NOT public.top_chicken_staff_actor_authorized_v1(p_actor_auth_user_id) THEN
   RAISE EXCEPTION 'TC_STAFF_MANAGE_ADMIN_DENIED' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('tc-staff-manage:'||p_request_id::text,0));
 SELECT * INTO v_existing FROM public.top_chicken_staff_manage_receipts_v1 WHERE request_id=p_request_id;
 IF FOUND THEN
   IF v_existing.business_id IS DISTINCT FROM v_business
      OR v_existing.actor_auth_user_id IS DISTINCT FROM p_actor_auth_user_id
      OR v_existing.target_employee_id IS DISTINCT FROM p_employee_id
      OR v_existing.action IS DISTINCT FROM v_action
      OR v_existing.payload_digest IS DISTINCT FROM p_payload_digest THEN
       RAISE EXCEPTION 'TC_STAFF_MANAGE_REPLAY_CONFLICT' USING ERRCODE='23505';
   END IF;
   RETURN v_existing.result||jsonb_build_object('replay',true);
 END IF;

 SELECT * INTO v_target FROM public.employees
 WHERE business_id=v_business AND branch_id=22 AND id=p_employee_id
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'TC_STAFF_MANAGE_TARGET_NOT_FOUND' USING ERRCODE='42501'; END IF;
 SELECT id INTO v_actor_id FROM public.employees
 WHERE business_id=v_business AND branch_id=22 AND auth_user_id=p_actor_auth_user_id
 AND role='admin' AND active IS TRUE LIMIT 1;
 IF v_actor_id IS NULL THEN RAISE EXCEPTION 'TC_STAFF_MANAGE_ACTOR_NOT_FOUND' USING ERRCODE='42501'; END IF;

 IF v_action='edit' THEN
   v_name:=nullif(trim(coalesce(p_name,'')),'');
   v_role:=lower(trim(coalesce(p_role,'')));
   v_active:=coalesce(p_active,v_target.active,true);
   IF v_name IS NULL OR length(v_name)>120 OR v_role NOT IN ('cashier','callcenter','admin') THEN
     RAISE EXCEPTION 'TC_STAFF_EDIT_FIELDS_INVALID';
   END IF;
   IF cardinality(coalesce(p_permissions,ARRAY[]::text[]))>100 THEN
     RAISE EXCEPTION 'TC_STAFF_EDIT_PERMISSIONS_TOO_MANY';
   END IF;
   SELECT coalesce(array_agg(DISTINCT p),ARRAY[]::text[]) INTO v_permissions
   FROM unnest(coalesce(p_permissions,ARRAY[]::text[])) AS p;
   IF EXISTS(
      SELECT 1 FROM unnest(v_permissions) AS p
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
      )
   ) THEN RAISE EXCEPTION 'TC_STAFF_EDIT_UNKNOWN_PERMISSION'; END IF;
 ELSE
   v_name:=v_target.name;
   v_role:=v_target.role;
   v_active:=coalesce(p_active,not coalesce(v_target.active,true));
   v_permissions:=ARRAY[]::text[];
 END IF;
 IF v_target.auth_user_id=p_actor_auth_user_id AND
    (v_active IS FALSE OR v_role IS DISTINCT FROM 'admin') THEN
   RAISE EXCEPTION 'TC_STAFF_CANNOT_DISABLE_OWN_ADMIN';
 END IF;
 IF v_target.role='admin' AND (v_active IS FALSE OR v_role IS DISTINCT FROM 'admin')
    AND NOT EXISTS(
       SELECT 1 FROM public.employees e WHERE e.business_id=v_business
       AND e.branch_id=22 AND e.id<>v_target.id AND e.role='admin' AND e.active IS TRUE
    ) THEN RAISE EXCEPTION 'TC_STAFF_LAST_ADMIN_PROTECTED'; END IF;

 UPDATE public.employees SET name=v_name,role=v_role,active=v_active
 WHERE id=v_target.id AND business_id=v_business;
 -- Revoking tenant membership blocks future tenant-authorized requests even if
 -- a GoTrue JWT remains valid. This does NOT assert active sessions are revoked.
 IF v_target.auth_user_id IS NOT NULL THEN
   UPDATE public.business_auth_memberships SET active=v_active,updated_at=now()
   WHERE auth_user_id=v_target.auth_user_id AND business_id=v_business;
 END IF;
 IF v_action='edit' THEN
   DELETE FROM public.employee_permissions
   WHERE business_id=v_business AND employee_id=v_target.id;
   IF v_role<>'admin' THEN
     INSERT INTO public.employee_permissions(employee_id,permission_key,allowed,business_id)
     SELECT v_target.id,p,true,v_business FROM unnest(v_permissions) AS p WHERE p<>'home';
   END IF;
 END IF;
 INSERT INTO public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details,business_id)
 VALUES(v_actor_id,22,'top_chicken_staff.'||v_action,'employee',v_target.id,
   jsonb_build_object('role',v_role,'active',v_active,'request_id',p_request_id),v_business);
 v_result:=jsonb_build_object('ok',true,'business_id',v_business,'branch_id',22,
   'employee_id',v_target.id,'permissions_persisted',true,'active',v_active);
 INSERT INTO public.top_chicken_staff_manage_receipts_v1(
   request_id,actor_auth_user_id,target_employee_id,action,payload_digest,result
 )VALUES(p_request_id,p_actor_auth_user_id,p_employee_id,v_action,p_payload_digest,v_result);
 RETURN v_result;
END;
$body$;
REVOKE ALL ON FUNCTION public.top_chicken_staff_manage_v1(uuid,uuid,text,text,bigint,text,text,boolean,text[])
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.top_chicken_staff_manage_v1(uuid,uuid,text,text,bigint,text,text,boolean,text[])
  TO service_role;
COMMIT;
