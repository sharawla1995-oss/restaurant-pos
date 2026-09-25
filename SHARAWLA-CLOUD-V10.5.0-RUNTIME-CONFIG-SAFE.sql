-- ============================================================
-- Sharawla POS V10.5.0 — Multi-Industry Runtime Config (SAFE / ADDITIVE)
-- Phase 1: Core / Restaurant Isolation
--
-- Adds ONE read-only RPC used before Business Backend login:
--   get_sharawla_business_runtime_config(uuid,text)
--
-- Identity input remains the existing immutable pair:
--   Device ID + Canonical Fingerprint
--
-- Explicitly NOT changed:
--   activate_sharawla_device(text,text,text,text,text)
--   verify_sharawla_device(uuid,text,text)
--   get_sharawla_business_connection(uuid,text)
--   get_sharawla_device_support_code(uuid,text)
--   Device ID / Canonical Fingerprint / Activation / license_hash
-- ============================================================

DO $preflight$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(req.table_name||'.'||req.column_name, ', ' ORDER BY 1)
  INTO v_missing
  FROM (VALUES
    ('devices','id'),('devices','business_id'),('devices','device_fingerprint'),
    ('businesses','id'),('businesses','name'),('businesses','active'),('businesses','pos_profile_id'),
    ('pos_profiles','id'),('pos_profiles','code'),('pos_profiles','active'),('pos_profiles','implemented'),
    ('business_modules','business_id'),('business_modules','module_id'),('business_modules','enabled'),
    ('modules','id'),('modules','code'),('modules','active')
  ) req(table_name,column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema='public' AND c.table_name=req.table_name AND c.column_name=req.column_name
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'V10.5.0 pre-flight failed. Missing: %',v_missing;
  END IF;

  IF to_regprocedure('public.activate_sharawla_device(text,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'activate_sharawla_device exact contract missing';
  END IF;
  IF to_regprocedure('public.verify_sharawla_device(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'verify_sharawla_device exact contract missing';
  END IF;
  IF to_regprocedure('public.get_sharawla_business_connection(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'get_sharawla_business_connection exact contract missing';
  END IF;
  IF to_regprocedure('public.get_sharawla_device_support_code(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'V10.4.21 Support Code RPC missing';
  END IF;
END
$preflight$;

BEGIN;

CREATE OR REPLACE FUNCTION public.get_sharawla_business_runtime_config(
  p_device_id uuid,
  p_device_fingerprint text
)
RETURNS TABLE(
  ok boolean,
  business_id uuid,
  business_name text,
  business_active boolean,
  pos_profile text,
  profile_active boolean,
  profile_implemented boolean,
  modules_configured boolean,
  enabled_modules text[],
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fp text := trim(coalesce(p_device_fingerprint,''));
  v_business_id uuid;
  v_business_name text;
  v_business_active boolean;
  v_profile text;
  v_profile_active boolean;
  v_profile_implemented boolean;
  v_modules text[];
BEGIN
  IF p_device_id IS NULL OR v_fp='' THEN
    RETURN QUERY SELECT false,NULL::uuid,NULL::text,NULL::boolean,NULL::text,NULL::boolean,NULL::boolean,false,ARRAY[]::text[],'بيانات الجهاز غير مكتملة'::text;
    RETURN;
  END IF;

  SELECT b.id,b.name,b.active,p.code,p.active,p.implemented
  INTO v_business_id,v_business_name,v_business_active,v_profile,v_profile_active,v_profile_implemented
  FROM public.devices d
  JOIN public.businesses b ON b.id=d.business_id
  LEFT JOIN public.pos_profiles p ON p.id=b.pos_profile_id
  WHERE d.id=p_device_id
    AND d.device_fingerprint=v_fp
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false,NULL::uuid,NULL::text,NULL::boolean,NULL::text,NULL::boolean,NULL::boolean,false,ARRAY[]::text[],'الجهاز غير معروف'::text;
    RETURN;
  END IF;

  IF coalesce(v_business_active,false)=false THEN
    RETURN QUERY SELECT false,v_business_id,v_business_name,v_business_active,v_profile,v_profile_active,v_profile_implemented,false,ARRAY[]::text[],'النشاط موقوف'::text;
    RETURN;
  END IF;

  IF v_profile IS NULL THEN
    RETURN QUERY SELECT false,v_business_id,v_business_name,v_business_active,NULL::text,NULL::boolean,NULL::boolean,false,ARRAY[]::text[],'POS Profile غير محدد'::text;
    RETURN;
  END IF;

  SELECT coalesce(array_agg(DISTINCT m.code ORDER BY m.code) FILTER (WHERE m.code IS NOT NULL),ARRAY[]::text[])
  INTO v_modules
  FROM public.business_modules bm
  JOIN public.modules m ON m.id=bm.module_id
  WHERE bm.business_id=v_business_id
    AND bm.enabled=true
    AND m.active=true;

  RETURN QUERY SELECT
    true,
    v_business_id,
    v_business_name,
    v_business_active,
    lower(trim(v_profile)),
    coalesce(v_profile_active,false),
    coalesce(v_profile_implemented,false),
    cardinality(v_modules)>0,
    v_modules,
    'OK'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.get_sharawla_business_runtime_config(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sharawla_business_runtime_config(uuid,text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_sharawla_business_runtime_config(uuid,text) TO authenticated;

COMMIT;

-- FINAL VERIFICATION — every boolean must be TRUE.
WITH f AS (
  SELECT p.oid,p.prosecdef,p.proconfig,p.proacl,p.proowner
  FROM pg_proc p
  WHERE p.oid=to_regprocedure('public.get_sharawla_business_runtime_config(uuid,text)')
), public_exec AS (
  SELECT EXISTS (
    SELECT 1 FROM f
    CROSS JOIN LATERAL aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
    WHERE a.grantee=0 AND a.privilege_type='EXECUTE'
  ) allowed
)
SELECT
  to_regprocedure('public.get_sharawla_business_runtime_config(uuid,text)') IS NOT NULL AS runtime_rpc_present,
  coalesce((SELECT prosecdef FROM f),false) AS runtime_rpc_security_definer,
  coalesce((SELECT EXISTS(SELECT 1 FROM unnest(coalesce(proconfig,ARRAY[]::text[])) x(v) WHERE v='search_path=public') FROM f),false) AS runtime_rpc_search_path_public,
  coalesce(has_function_privilege('anon','public.get_sharawla_business_runtime_config(uuid,text)'::regprocedure,'EXECUTE'),false) AS anon_can_execute,
  coalesce(has_function_privilege('authenticated','public.get_sharawla_business_runtime_config(uuid,text)'::regprocedure,'EXECUTE'),false) AS authenticated_can_execute,
  NOT coalesce((SELECT allowed FROM public_exec),true) AS public_execute_denied,
  to_regprocedure('public.activate_sharawla_device(text,text,text,text,text)') IS NOT NULL AS activate_contract_unchanged,
  to_regprocedure('public.verify_sharawla_device(uuid,text,text)') IS NOT NULL AS verify_contract_unchanged,
  to_regprocedure('public.get_sharawla_business_connection(uuid,text)') IS NOT NULL AS connection_contract_unchanged,
  to_regprocedure('public.get_sharawla_device_support_code(uuid,text)') IS NOT NULL AS support_code_contract_unchanged;
