-- SOURCE CANDIDATE ONLY. TC identity/provenance only; Cloud grants require a fresh service execution context.
-- Profile defaults MUST NOT grant entitlement; never rebind the legacy singleton.
BEGIN;
CREATE TABLE IF NOT EXISTS sharawla_internal.top_chicken_operational_binding_v1(
 business_id uuid PRIMARY KEY CHECK(business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid),
 profile_code text NOT NULL CHECK(profile_code='restaurant'),source_snapshot jsonb NOT NULL,
 source_digest text NOT NULL,verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sharawla_internal.top_chicken_feature_cache_v1(
 business_id uuid NOT NULL CHECK(business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid),
 feature_code text NOT NULL,enabled boolean NOT NULL,PRIMARY KEY(business_id,feature_code)
);
ALTER TABLE sharawla_internal.top_chicken_operational_binding_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE sharawla_internal.top_chicken_feature_cache_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sharawla_internal.top_chicken_operational_binding_v1,sharawla_internal.top_chicken_feature_cache_v1 FROM PUBLIC,anon,authenticated,service_role;
DO $binding$ DECLARE v_source jsonb:='{"cloud_business":{"id":"5358328c-9724-49aa-affc-1bce8be90f92","name":"Top chicken res","active":true,"profile_code":"restaurant","profile_active":true,"features":null},"runtime":{"modules":[{"code":"pos","enabled":true},{"code":"kitchen","enabled":true},{"code":"delivery","enabled":true},{"code":"pickup","enabled":true},{"code":"tables","enabled":true},{"code":"website","enabled":true},{"code":"inventory","enabled":true},{"code":"returns","enabled":true},{"code":"promocodes","enabled":true},{"code":"expenses","enabled":true},{"code":"reports","enabled":true},{"code":"customers","enabled":true}],"profile":"restaurant","defaults":[{"code":"commerce.barcode","active":true,"enabled":true,"required":false},{"code":"commerce.delivery","active":true,"enabled":true,"required":false},{"code":"commerce.orders","active":true,"enabled":true,"required":true},{"code":"commerce.pickup","active":true,"enabled":true,"required":false},{"code":"commerce.pos","active":true,"enabled":true,"required":true},{"code":"commerce.products","active":true,"enabled":true,"required":true},{"code":"commerce.promotions","active":true,"enabled":true,"required":false},{"code":"commerce.returns","active":true,"enabled":true,"required":false},{"code":"commerce.website","active":true,"enabled":true,"required":false},{"code":"core.audit","active":true,"enabled":true,"required":false},{"code":"core.auth","active":true,"enabled":true,"required":true},{"code":"core.branches","active":true,"enabled":true,"required":true},{"code":"core.customers","active":true,"enabled":true,"required":false},{"code":"core.expenses","active":true,"enabled":true,"required":false},{"code":"core.licensing","active":true,"enabled":true,"required":true},{"code":"core.notifications","active":true,"enabled":true,"required":false},{"code":"core.offline","active":true,"enabled":true,"required":false},{"code":"core.payments","active":true,"enabled":true,"required":true},{"code":"core.permissions","active":true,"enabled":true,"required":true},{"code":"core.reports","active":true,"enabled":true,"required":false},{"code":"core.shifts","active":true,"enabled":true,"required":true},{"code":"core.updates","active":true,"enabled":true,"required":true},{"code":"core.users","active":true,"enabled":true,"required":true},{"code":"food.kitchen","active":true,"enabled":true,"required":false},{"code":"food.modifiers","active":true,"enabled":true,"required":false},{"code":"food.tables","active":true,"enabled":true,"required":false},{"code":"inventory.purchasing","active":true,"enabled":true,"required":false},{"code":"inventory.receiving","active":true,"enabled":true,"required":false},{"code":"inventory.stock","active":true,"enabled":true,"required":false},{"code":"inventory.suppliers","active":true,"enabled":true,"required":false}]}}'::jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM sharawla_internal.top_chicken_operational_binding_v1
  WHERE source_digest<>md5(v_source::text)) THEN RAISE EXCEPTION 'TC_BINDING_SOURCE_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.businesses WHERE id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid AND active=true)
  OR NOT EXISTS(SELECT 1 FROM public.branches WHERE id=22 AND business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid AND active=true)
  THEN RAISE EXCEPTION 'TC_BINDING_TARGET_MISSING'; END IF;
 INSERT INTO sharawla_internal.top_chicken_operational_binding_v1(business_id,profile_code,source_snapshot,source_digest)
 VALUES('5358328c-9724-49aa-affc-1bce8be90f92'::uuid,'restaurant',v_source,md5(v_source::text)) ON CONFLICT(business_id) DO NOTHING;
 INSERT INTO sharawla_internal.top_chicken_feature_cache_v1(business_id,feature_code,enabled)
 SELECT '5358328c-9724-49aa-affc-1bce8be90f92'::uuid,f->>'code',false -- profile eligibility is not an entitlement
 FROM jsonb_array_elements(v_source->'runtime'->'defaults') f
 ON CONFLICT(business_id,feature_code) DO NOTHING;
END $binding$;
CREATE OR REPLACE FUNCTION sharawla_internal.top_chicken_binding_ready_v1()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT EXISTS(SELECT 1 FROM sharawla_internal.top_chicken_operational_binding_v1
 WHERE business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid AND profile_code='restaurant'
 AND source_digest=md5(source_snapshot::text)) $$;
REVOKE ALL ON FUNCTION sharawla_internal.top_chicken_binding_ready_v1() FROM PUBLIC,anon,authenticated,service_role;
DO $guard$ BEGIN IF md5(pg_get_functiondef('sharawla_internal.current_operational_business_id_v1()'::regprocedure))<>'06b69bea9463c9217df1d52d037c97e9' THEN RAISE EXCEPTION 'TC_PROFILE_FUNCTION_DRIFT: current_operational_business_id_v1'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION sharawla_internal.current_operational_business_id_v1()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'sharawla_internal'
AS $function$
declare
  v_count integer;
  v_business uuid;
begin

  if public.request_business_id()='5358328c-9724-49aa-affc-1bce8be90f92'::uuid then
    if not sharawla_internal.top_chicken_binding_ready_v1() then raise exception 'TC_BINDING_REQUIRED' using errcode='42501'; end if;
    return '5358328c-9724-49aa-affc-1bce8be90f92'::uuid;
  end if;
  select count(*),(array_agg(cloud_business_id order by id))[1]
    into v_count,v_business
  from sharawla_internal.operational_business_identity_v1;

  if v_count<>1 or v_business is null then
    raise exception 'OPERATIONAL_BUSINESS_BINDING_MISSING';
  end if;

  return v_business;
end;
$function$
;
DO $guard$ BEGIN IF md5(pg_get_functiondef('sharawla_internal.current_operational_profile_v1()'::regprocedure))<>'f6f76f24b8e3e7d5fac9089317f346ec' THEN RAISE EXCEPTION 'TC_PROFILE_FUNCTION_DRIFT: current_operational_profile_v1'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION sharawla_internal.current_operational_profile_v1()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'sharawla_internal'
AS $function$
declare
  v_count integer;
  v_profile text;
begin

  if public.request_business_id()='5358328c-9724-49aa-affc-1bce8be90f92'::uuid then
    if not sharawla_internal.top_chicken_binding_ready_v1() then raise exception 'TC_BINDING_REQUIRED' using errcode='42501'; end if;
    return 'restaurant';
  end if;
  select count(*),max(trim(profile_code))
    into v_count,v_profile
  from sharawla_internal.operational_business_identity_v1;

  if v_count<>1 or v_profile is null or v_profile='' then
    raise exception 'OPERATIONAL_PROFILE_BINDING_MISSING';
  end if;

  return lower(v_profile);
end;
$function$
;
DO $guard$ BEGIN IF md5(pg_get_functiondef('sharawla_internal.operational_feature_entitled_v1(text)'::regprocedure))<>'7e189e7eb536d649ead7b2e43d415f4d' THEN RAISE EXCEPTION 'TC_PROFILE_FUNCTION_DRIFT: operational_feature_entitled_v1'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION sharawla_internal.operational_feature_entitled_v1(p_feature_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'sharawla_internal'
AS $function$
declare
  v_feature text:=lower(trim(coalesce(p_feature_code,'')));
  v_business uuid;
begin

  if public.request_business_id()='5358328c-9724-49aa-affc-1bce8be90f92'::uuid then
    if not sharawla_internal.top_chicken_binding_ready_v1() then return false; end if;
    return sharawla_internal.top_chicken_transaction_feature_v1(lower(trim(coalesce(p_feature_code,''))));
  end if;
  if v_feature='' then
    return false;
  end if;

  v_business:=sharawla_internal.current_operational_business_id_v1();

  return exists(
    select 1
    from sharawla_internal.operational_feature_entitlements_v1 e
    where e.cloud_business_id=v_business
      and e.feature_code=v_feature
      and e.enabled=true
      and (e.valid_until is null or e.valid_until>pg_catalog.statement_timestamp())
  );
end;
$function$
;
COMMIT;
