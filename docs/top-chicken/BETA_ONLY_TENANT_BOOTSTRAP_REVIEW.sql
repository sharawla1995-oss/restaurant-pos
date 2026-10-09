-- Top Chicken beta-only tenant bootstrap (source candidate, NOT applied)
-- Cloud canonical business: 5358328c-9724-49aa-affc-1bce8be90f92
-- Cloud canonical branch:   8cde37e5-462f-4491-8456-7e095ff6e6f3
-- IMPORTANT: Review tenant RLS, device binding, and first-admin Auth bootstrap
-- before applying. This file intentionally does NOT create an auth user.
BEGIN;
DO $$
DECLARE
  v_business uuid := '5358328c-9724-49aa-affc-1bce8be90f92';
  v_cloud_branch uuid := '8cde37e5-462f-4491-8456-7e095ff6e6f3';
  v_branch_id bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM public.businesses WHERE code='top-chicken' AND id<>v_business) THEN
    RAISE EXCEPTION 'Business code already owned by another tenant';
  END IF;
  IF EXISTS (SELECT 1 FROM public.businesses WHERE id=v_business AND code<>'top-chicken') THEN
    RAISE EXCEPTION 'Canonical business ID belongs to another code';
  END IF;
  INSERT INTO public.businesses(id,code,name,active,is_test,metadata)
  VALUES(v_business,'top-chicken','Top chicken res',true,false,
         jsonb_build_object('cloud_business_id',v_business::text,'cloud_branch_id',v_cloud_branch::text))
  ON CONFLICT (id) DO NOTHING;
  SELECT id INTO v_branch_id FROM public.branches
   WHERE business_id=v_business AND name='TOP CHICKEN 20';
  IF v_branch_id IS NULL THEN
    INSERT INTO public.branches(name,business_id,active,website_visible,website_orders_enabled)
    VALUES('TOP CHICKEN 20',v_business,true,false,false)
    RETURNING id INTO v_branch_id;
  END IF;
  IF (SELECT count(*) FROM public.branches WHERE business_id=v_business AND name='TOP CHICKEN 20')<>1 THEN
    RAISE EXCEPTION 'Duplicate Top Chicken branches; manual reconciliation required';
  END IF;
  RAISE NOTICE 'Top Chicken beta branch id: %',v_branch_id;
END $$;
COMMIT;
-- No credentials, employee, license, production or other tenant touched.
