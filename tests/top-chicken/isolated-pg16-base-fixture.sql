-- Fresh disposable PostgreSQL 16 service ONLY. Does not access Supabase.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE TABLE public.order_items(id bigint PRIMARY KEY, quantity numeric NOT NULL);
CREATE TABLE public.order_item_modifiers(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_item_id bigint NOT NULL REFERENCES public.order_items(id),
  modifier_id bigint,
  modifier_name text NOT NULL,
  price numeric DEFAULT 0,
  business_id uuid
);
INSERT INTO public.order_items(id,quantity) VALUES (11,3),(12,1),(13,100);
-- Authoritative shared function sentinel: review-only additive migration must not overwrite it.
CREATE FUNCTION public.create_pos_order_atomic(jsonb,jsonb,jsonb)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"owner":"unchanged-owner"}'::jsonb $$;

CREATE SCHEMA auth;
CREATE SCHEMA sharawla_internal;
CREATE TABLE public.business_auth_memberships (
  auth_user_id uuid NOT NULL,business_id uuid NOT NULL,active boolean NOT NULL
);
CREATE TABLE public.employees(
  auth_user_id uuid NOT NULL,business_id uuid NOT NULL,active boolean NOT NULL
);
CREATE TABLE sharawla_internal.operational_business_identity_v1(
  id smallint PRIMARY KEY,cloud_business_id uuid NOT NULL,profile_code text NOT NULL
);
INSERT INTO sharawla_internal.operational_business_identity_v1 VALUES
 (1,'91826502-590e-4afa-8826-2c0f4b99c490','restaurant');
CREATE TABLE sharawla_internal.operational_feature_entitlements_v1(
 cloud_business_id uuid NOT NULL,feature_code text NOT NULL,enabled boolean NOT NULL,
 valid_until timestamptz,PRIMARY KEY(cloud_business_id,feature_code)
);
INSERT INTO sharawla_internal.operational_feature_entitlements_v1 VALUES
 ('91826502-590e-4afa-8826-2c0f4b99c490','commerce.delivery',true,NULL);
INSERT INTO public.business_auth_memberships VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','5358328c-9724-49aa-affc-1bce8be90f92',true),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','91826502-590e-4afa-8826-2c0f4b99c490',true);
INSERT INTO public.employees VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','5358328c-9724-49aa-affc-1bce8be90f92',true),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','91826502-590e-4afa-8826-2c0f4b99c490',true);

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('tc.fixture_uid',true),'')::uuid
$$;
CREATE FUNCTION public.header_business_id() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('tc.fixture_selected_business',true),'')::uuid
$$;
-- Simulated membership verification, not an authorization proof for real Beta.
CREATE FUNCTION public.current_business_id() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT m.business_id FROM public.business_auth_memberships m
 WHERE m.auth_user_id=auth.uid() AND m.business_id=public.header_business_id()
 AND m.active AND EXISTS (
   SELECT 1 FROM public.employees e
   WHERE e.auth_user_id=m.auth_user_id AND e.business_id=m.business_id AND e.active
 ) LIMIT 1
$$;
CREATE FUNCTION sharawla_internal.current_operational_business_id_v1()
RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT cloud_business_id FROM sharawla_internal.operational_business_identity_v1 LIMIT 1
$$;
