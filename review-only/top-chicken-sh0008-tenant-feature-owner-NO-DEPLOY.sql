-- REVIEW ONLY / DO NOT DEPLOY. Requires independent Cloud SQL and Entitlements approvals.
-- Scope: Top Chicken Beta only, legacy Beta remains byte-for-byte behavior in fallback.
-- Correct only the tenant resolver used by the existing action permission evaluator;
-- do not update shared Restaurant Profile, legacy singleton identity, role defaults or devices.
BEGIN;

-- Fail closed when the original operational identity is not the reviewed legacy tenant.
DO $preflight$
BEGIN
 IF NOT EXISTS (
    SELECT 1
    FROM sharawla_internal.operational_business_identity_v1 x
    WHERE x.cloud_business_id='91826502-590e-4afa-8826-2c0f4b99c490'::uuid
      AND lower(x.profile_code)='restaurant'
 ) OR (SELECT count(*) FROM sharawla_internal.operational_business_identity_v1)<>1 THEN
   RAISE EXCEPTION 'TC_FEATURE_OWNER_LEGACY_BASELINE_CHANGED';
 END IF;
 IF EXISTS (
   SELECT 1 FROM sharawla_internal.operational_feature_entitlements_v1
   WHERE cloud_business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid
 ) THEN
   RAISE EXCEPTION 'TC_FEATURE_OWNER_GRANTS_REQUIRE_SEPARATE_CURRENT_REVIEW';
 END IF;
END;
$preflight$;

-- This replacement affects only the returned feature decision for a verified
-- Top Chicken caller. It adds NO grants: TC remains DENIED until Central Admin
-- independently creates authenticated/audited time-bounded entitlements.
-- Other Beta businesses take the existing singleton-backed path without changes.
CREATE OR REPLACE FUNCTION sharawla_internal.operational_feature_entitled_v1(p_feature_code text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public','sharawla_internal'
AS $body$
DECLARE
 v_feature text:=lower(trim(coalesce(p_feature_code,'')));
 v_selected uuid;
 v_actor_business uuid;
 v_existing_legacy_business uuid;
BEGIN
 IF v_feature='' OR auth.uid() IS NULL THEN RETURN false; END IF;
 v_selected:=public.header_business_id();
 v_actor_business:=public.current_business_id();

 -- A forged TC business header cannot fall back to the legacy feature grants.
 IF v_selected='5358328c-9724-49aa-affc-1bce8be90f92'::uuid
    AND v_actor_business IS DISTINCT FROM '5358328c-9724-49aa-affc-1bce8be90f92'::uuid THEN
   RETURN false;
 END IF;

 -- Top Chicken: require a verified membership-derived tenant and exact
 -- own-tenant entitlement, including expiry/disable checks.
 IF v_actor_business='5358328c-9724-49aa-affc-1bce8be90f92'::uuid THEN
   RETURN EXISTS(
      SELECT 1 FROM sharawla_internal.operational_feature_entitlements_v1 e
      WHERE e.cloud_business_id=v_actor_business
        AND e.feature_code=v_feature AND e.enabled=true
        AND (e.valid_until IS NULL OR e.valid_until>pg_catalog.statement_timestamp())
   );
 END IF;

 -- Preserve legacy Beta decision for every other business during Phase A.
 v_existing_legacy_business:=sharawla_internal.current_operational_business_id_v1();
 RETURN EXISTS(
    SELECT 1 FROM sharawla_internal.operational_feature_entitlements_v1 e
    WHERE e.cloud_business_id=v_existing_legacy_business
      AND e.feature_code=v_feature AND e.enabled=true
      AND (e.valid_until IS NULL OR e.valid_until>pg_catalog.statement_timestamp())
 );
END;
$body$;

-- Existing function privilege/ownership not altered.
-- No INSERT/UPDATE/DELETE to entitlements; no direct action grants.
COMMIT;
