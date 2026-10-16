-- REVIEW-ONLY CANDIDATE, DO NOT APPLY WITHOUT INDEPENDENT BETA SQL APPROVAL.
-- Scope: Top Chicken 5358328c-9724-49aa-affc-1bce8be90f92, branch 22.
-- Requires Central signed proof verifier in authenticated Beta Edge function.
-- No grants from Profile, no Direct SQL operational enablement, no legacy business writes.
-- One-time ADDITIVE migration, never rerun existing four 2026-10-15 migrations.
BEGIN;
CREATE TABLE IF NOT EXISTS sharawla_internal.top_chicken_entitlement_sync_receipts_v1(
 nonce uuid PRIMARY KEY,
 cloud_business_id uuid NOT NULL CHECK(cloud_business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid),
 actor_auth_user_id uuid NOT NULL,
 source_observed_at timestamptz NOT NULL,
 source_proof_sha256 text NOT NULL CHECK(source_proof_sha256 ~ '^[a-f0-9]{64}$'),
 before_rows jsonb NOT NULL,
 after_rows jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT pg_catalog.statement_timestamp()
);
ALTER TABLE sharawla_internal.top_chicken_entitlement_sync_receipts_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE sharawla_internal.top_chicken_entitlement_sync_receipts_v1 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE sharawla_internal.top_chicken_entitlement_sync_receipts_v1 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.top_chicken_commit_entitlement_lease_v1(
 p_actor_auth_user_id uuid,p_nonce uuid,p_observed_at timestamptz,
 p_proof_digest text,p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=''
AS $body$
DECLARE
 c_business constant uuid:='5358328c-9724-49aa-affc-1bce8be90f92'::uuid;
 v_version bigint;
 v_old jsonb;
 v_new jsonb;
 v_entry record;
 v_saved record;
 v_codes text[];
 v_count integer:=0;
BEGIN
 -- No user-supplied business/branch switch. The authenticated Beta Edge RPC caller
 -- must have already independently verified the real Beta JWT and Central HMAC proof.
 IF p_actor_auth_user_id IS NULL OR p_nonce IS NULL
    OR p_proof_digest IS NULL OR p_proof_digest !~ '^[a-f0-9]{64}$'
    OR p_observed_at IS NULL OR p_rows IS NULL
 THEN RAISE EXCEPTION 'TC_PROOF_PARAMS_INVALID' USING errcode='42501'; END IF;
 -- Central actor JWT and Sharawla Admin membership are validated on
 -- Central, then included in a HMAC-signed proof verified by the Beta Edge.
 -- Beta must NOT impersonate this actor as a Beta employee: they belong to
 -- separate Auth projects. This definer RPC is EXECUTE-able by service_role
 -- only, and the service role key must stay exclusively in the Beta Edge.
 -- No user-provided actor/tenant/branch selector is accepted by the browser.
 IF pg_catalog.jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_rows)<>5 THEN
   RAISE EXCEPTION 'TC_EXACT_FIVE_FEATURES_REQUIRED' USING errcode='42501';
 END IF;
 -- Serialize this one activity's deliveries; no shared-tenant table reset.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('top-chicken-entitlement-sync-v1',0));
 SELECT r.* INTO v_saved FROM sharawla_internal.top_chicken_entitlement_sync_receipts_v1 r WHERE r.nonce=p_nonce;
 IF FOUND THEN
   IF v_saved.actor_auth_user_id=p_actor_auth_user_id
      AND v_saved.source_proof_sha256=p_proof_digest
      AND v_saved.source_observed_at=p_observed_at
   THEN RETURN pg_catalog.jsonb_build_object('ok',true,'replayed',true,'receipt_id',p_nonce); END IF;
   RAISE EXCEPTION 'TC_PROOF_NONCE_REUSE_CHANGED' USING errcode='23505';
 END IF;
 IF pg_catalog.statement_timestamp()-p_observed_at > interval '5 seconds'
    OR p_observed_at-pg_catalog.statement_timestamp() > interval '1 second'
 THEN RAISE EXCEPTION 'TC_PROOF_STALE' USING errcode='42501'; END IF;
 v_version := floor(extract(epoch from p_observed_at)*1000)::bigint;
 IF EXISTS(SELECT 1 FROM sharawla_internal.operational_feature_entitlements_v1 e
      WHERE e.cloud_business_id=c_business
        AND e.feature_code IN ('core.auth','core.users','core.permissions','commerce.delivery','inventory.suppliers')
        AND e.entitlement_version>=v_version)
 THEN RAISE EXCEPTION 'TC_OLDER_OR_EQUAL_PROOF' USING errcode='42501'; END IF;
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.feature_code),'[]'::jsonb)
 INTO v_old FROM (SELECT feature_code,enabled,entitlement_version,source,valid_until
     FROM sharawla_internal.operational_feature_entitlements_v1
     WHERE cloud_business_id=c_business AND feature_code IN
        ('core.auth','core.users','core.permissions','commerce.delivery','inventory.suppliers')) x;
 v_codes:=ARRAY[]::text[];
 FOR v_entry IN SELECT * FROM pg_catalog.jsonb_to_recordset(p_rows) AS r(
      feature_code text,enabled boolean,entitlement_version bigint,
      source text,valid_until timestamptz)
 LOOP
  IF v_entry.feature_code IS NULL OR v_entry.feature_code NOT IN
       ('core.auth','core.users','core.permissions','commerce.delivery','inventory.suppliers')
      OR v_entry.feature_code=ANY(v_codes)
      OR v_entry.enabled IS NULL OR v_entry.entitlement_version IS DISTINCT FROM v_version
      OR v_entry.source IS DISTINCT FROM 'tc-central-signed-commercial-v1'
      OR v_entry.valid_until IS NULL
      OR (v_entry.enabled AND (v_entry.valid_until <= pg_catalog.statement_timestamp()
             OR v_entry.valid_until > p_observed_at+interval '60 seconds'))
      OR (NOT v_entry.enabled AND v_entry.valid_until > p_observed_at)
  THEN RAISE EXCEPTION 'TC_FEATURE_ROW_INVALID' USING errcode='42501'; END IF;
  v_codes:=pg_catalog.array_append(v_codes,v_entry.feature_code);
  v_count:=v_count+1;
 END LOOP;
 IF v_count<>5 THEN RAISE EXCEPTION 'TC_MISSING_FEATURE_ROWS' USING errcode='42501'; END IF;
 INSERT INTO sharawla_internal.operational_feature_entitlements_v1
   (cloud_business_id,feature_code,enabled,entitlement_version,source,valid_until,updated_at)
 SELECT c_business,r.feature_code,r.enabled,r.entitlement_version,r.source,r.valid_until,pg_catalog.statement_timestamp()
 FROM pg_catalog.jsonb_to_recordset(p_rows) AS r(
   feature_code text,enabled boolean,entitlement_version bigint,source text,valid_until timestamptz)
 ON CONFLICT (cloud_business_id,feature_code)
 DO UPDATE SET enabled=EXCLUDED.enabled,entitlement_version=EXCLUDED.entitlement_version,
    source=EXCLUDED.source,valid_until=EXCLUDED.valid_until,updated_at=EXCLUDED.updated_at;
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.feature_code),'[]'::jsonb)
 INTO v_new FROM (SELECT feature_code,enabled,entitlement_version,source,valid_until
     FROM sharawla_internal.operational_feature_entitlements_v1
     WHERE cloud_business_id=c_business AND feature_code IN
        ('core.auth','core.users','core.permissions','commerce.delivery','inventory.suppliers')) x;
 INSERT INTO sharawla_internal.top_chicken_entitlement_sync_receipts_v1
 (nonce,cloud_business_id,actor_auth_user_id,source_observed_at,source_proof_sha256,before_rows,after_rows)
 VALUES(p_nonce,c_business,p_actor_auth_user_id,p_observed_at,p_proof_digest,v_old,v_new);
 RETURN pg_catalog.jsonb_build_object('ok',true,'replayed',false,'receipt_id',p_nonce,'version',v_version,'count',5);
END;
$body$;
REVOKE ALL ON FUNCTION public.top_chicken_commit_entitlement_lease_v1(uuid,uuid,timestamptz,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.top_chicken_commit_entitlement_lease_v1(uuid,uuid,timestamptz,text,jsonb) TO service_role;
COMMIT;
