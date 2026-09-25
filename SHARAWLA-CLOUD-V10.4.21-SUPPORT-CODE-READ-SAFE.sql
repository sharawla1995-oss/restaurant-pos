-- ============================================================
-- Sharawla POS V10.4.21 — Support Code Read RPC (SAFE / ADDITIVE)
--
-- Purpose:
--   Allow an already-registered POS device to read ONLY its permanent
--   Support Code using the existing immutable identity pair:
--     device_id + Canonical Fingerprint
--
-- Explicitly NOT changed:
--   * activate_sharawla_device(text,text,text,text,text)
--   * verify_sharawla_device(uuid,text,text)
--   * get_sharawla_business_connection(uuid,text)
--   * Device ID / Canonical Fingerprint
--   * Activation identity / Automatic Rebind
--   * license_hash verification
--   * Business Connection
-- ============================================================

-- PRE-FLIGHT — READ ONLY
DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='devices' AND column_name='id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='devices' AND column_name='device_fingerprint'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='devices' AND column_name='support_code'
  ) THEN
    RAISE EXCEPTION 'V10.4.21 pre-flight failed: devices.id / device_fingerprint / support_code are required';
  END IF;

  IF to_regprocedure('public.activate_sharawla_device(text,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'V10.4.21 pre-flight failed: activate_sharawla_device exact contract is missing';
  END IF;

  IF to_regprocedure('public.verify_sharawla_device(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'V10.4.21 pre-flight failed: verify_sharawla_device exact contract is missing';
  END IF;

  IF to_regprocedure('public.get_sharawla_business_connection(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'V10.4.21 pre-flight failed: get_sharawla_business_connection exact contract is missing';
  END IF;
END
$preflight$;

BEGIN;

CREATE OR REPLACE FUNCTION public.get_sharawla_device_support_code(
  p_device_id uuid,
  p_device_fingerprint text
)
RETURNS TABLE(
  ok boolean,
  support_code text,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fingerprint text := trim(coalesce(p_device_fingerprint,''));
  v_support_code text;
BEGIN
  IF p_device_id IS NULL OR v_fingerprint = '' THEN
    RETURN QUERY
    SELECT false, NULL::text, 'بيانات الجهاز غير مكتملة'::text;
    RETURN;
  END IF;

  SELECT d.support_code
  INTO v_support_code
  FROM public.devices d
  WHERE d.id = p_device_id
    AND d.device_fingerprint = v_fingerprint
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT false, NULL::text, 'الجهاز غير معروف'::text;
    RETURN;
  END IF;

  v_support_code := trim(coalesce(v_support_code,''));

  IF v_support_code = '' THEN
    RETURN QUERY
    SELECT false, NULL::text, 'كود الدعم غير متاح لهذا الجهاز'::text;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT true, v_support_code, 'OK'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.get_sharawla_device_support_code(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sharawla_device_support_code(uuid,text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_sharawla_device_support_code(uuid,text) TO authenticated;

COMMIT;

-- ============================================================
-- FINAL VERIFICATION — READ ONLY
-- Every boolean should be TRUE.
-- ============================================================
WITH f AS (
  SELECT p.oid, p.prosecdef, p.proconfig, p.proacl, p.proowner
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.get_sharawla_device_support_code(uuid,text)')
), public_exec AS (
  SELECT EXISTS (
    SELECT 1
    FROM f
    CROSS JOIN LATERAL aclexplode(coalesce(f.proacl, acldefault('f',f.proowner))) a
    WHERE a.grantee = 0
      AND a.privilege_type = 'EXECUTE'
  ) AS allowed
)
SELECT
  to_regprocedure('public.get_sharawla_device_support_code(uuid,text)') IS NOT NULL
    AS support_code_rpc_present,

  coalesce((SELECT prosecdef FROM f),false)
    AS support_code_rpc_security_definer,

  coalesce((
    SELECT EXISTS (
      SELECT 1
      FROM unnest(coalesce(proconfig,ARRAY[]::text[])) cfg(setting)
      WHERE cfg.setting='search_path=public'
    )
    FROM f
  ),false)
    AS support_code_rpc_search_path_public,

  coalesce(has_function_privilege(
    'anon',
    'public.get_sharawla_device_support_code(uuid,text)'::regprocedure,
    'EXECUTE'
  ),false)
    AS anon_can_execute,

  coalesce(has_function_privilege(
    'authenticated',
    'public.get_sharawla_device_support_code(uuid,text)'::regprocedure,
    'EXECUTE'
  ),false)
    AS authenticated_can_execute,

  NOT coalesce((SELECT allowed FROM public_exec),true)
    AS public_execute_denied,

  to_regprocedure('public.activate_sharawla_device(text,text,text,text,text)') IS NOT NULL
    AS activate_contract_unchanged,

  to_regprocedure('public.verify_sharawla_device(uuid,text,text)') IS NOT NULL
    AS verify_contract_unchanged,

  to_regprocedure('public.get_sharawla_business_connection(uuid,text)') IS NOT NULL
    AS connection_contract_unchanged;
