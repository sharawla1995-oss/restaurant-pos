-- TOP CHICKEN SH-0008 / BETA ONLY. READ-ONLY pre-deployment drift snapshot.
-- Never run on Top Burger Production, never use this SELECT as deploy approval.
-- Fingerprints are from read-only Supabase Beta catalog snapshot on 2026-10-15.
-- This statement reads catalogs + aggregate counts only: no PII, DML, DDL, RPC or session mutations.
WITH
 schema_columns AS (
  SELECT md5(string_agg(format('%I.%I.%I:%s:%s',n.nspname,c.relname,a.attname,
    format_type(a.atttypid,a.atttypmod),a.attnotnull), E'\n'
    ORDER BY n.nspname,c.relname,a.attnum)) digest
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
    AND c.relname IN ('employees','employee_branches','employee_permissions',
      'business_auth_memberships','audit_logs','order_item_modifiers')
    AND a.attnum>0 AND NOT a.attisdropped
 ),
 owner_functions AS (
  SELECT md5(string_agg(pg_get_functiondef(p.oid), E'\n'
    ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))) digest
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE (n.nspname='sharawla_internal'
    AND p.proname IN ('operational_feature_entitled_v1','evaluate_action_permission_v2',
      'current_operational_business_id_v1'))
    OR (n.nspname='public'
      AND p.proname IN ('current_business_id','header_business_id',
        'offline_delivery_driver_save_v1','offline_delivery_zone_save_v1'))
 ),
 rls_policies AS (
  SELECT md5(coalesce(string_agg(format('%s:%s:%s:%s:%s',tablename,policyname,cmd,qual,with_check),
    E'\n' ORDER BY tablename,policyname),'')) digest
  FROM pg_policies
  WHERE schemaname='public' AND tablename IN
    ('employees','employee_branches','employee_permissions',
     'business_auth_memberships','audit_logs','order_item_modifiers')
 ),
 base AS (
  SELECT
    current_setting('server_version_num')::int BETWEEN 170000 AND 179999 AS pg17,
    (SELECT digest='5a71a81c355c402584779bc2b94a20dc' FROM schema_columns) AS columns_match,
    (SELECT digest='533f9fcba11cc581b4fa28f7cc30933d' FROM owner_functions) AS owners_match,
    (SELECT digest='4b88fb8cc418e7568f003a8c50ec36a8' FROM rls_policies) AS rls_match,
    (SELECT count(*)=1 FROM sharawla_internal.operational_business_identity_v1
      WHERE cloud_business_id='91826502-590e-4afa-8826-2c0f4b99c490'::uuid) AS singleton_legacy,
    (SELECT count(*)=2 FROM public.employees
      WHERE business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid) AS tc_employees_unchanged,
    (SELECT count(*)=2 FROM public.business_auth_memberships
      WHERE business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid) AS tc_memberships_unchanged,
    (SELECT count(*)=0 FROM sharawla_internal.operational_feature_entitlements_v1
      WHERE cloud_business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid) AS tc_grants_absent,
    (SELECT count(*)=0 FROM public.order_item_modifiers) AS modifier_table_empty,
    NOT EXISTS(SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='order_item_modifiers'
        AND column_name='quantity') AS modifier_quantity_absent,
    to_regclass('public.top_chicken_staff_create_receipts_v1') IS NULL AS staff_create_not_deployed,
    to_regclass('public.top_chicken_staff_manage_receipts_v1') IS NULL AS staff_manage_not_deployed,
    EXISTS (SELECT 1 FROM public.branches
      WHERE business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid
        AND id=22 AND website_orders_enabled IS FALSE) AS website_real_intake_off
 )
SELECT *, (pg17 AND columns_match AND owners_match AND rls_match AND singleton_legacy
 AND tc_employees_unchanged AND tc_memberships_unchanged AND tc_grants_absent
 AND modifier_table_empty AND modifier_quantity_absent
 AND staff_create_not_deployed AND staff_manage_not_deployed
 AND website_real_intake_off) AS baseline_unchanged_read_only
FROM base;
