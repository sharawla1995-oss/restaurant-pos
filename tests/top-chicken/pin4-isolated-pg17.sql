\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA sharawla_internal;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text NOT NULL);
CREATE TABLE public.branches(id bigint PRIMARY KEY,business_id uuid NOT NULL,active boolean NOT NULL);
CREATE TABLE public.employees(
 id bigint PRIMARY KEY,auth_user_id uuid,username text NOT NULL,name text,
 role text NOT NULL,active boolean NOT NULL,branch_id bigint NOT NULL,business_id uuid NOT NULL
);
CREATE TABLE public.business_auth_memberships(
 auth_user_id uuid,business_id uuid,active boolean,PRIMARY KEY(auth_user_id,business_id)
);
CREATE TABLE sharawla_internal.operational_feature_entitlements_v1(
 cloud_business_id uuid,feature_code text,enabled boolean NOT NULL,valid_until timestamptz,
 PRIMARY KEY(cloud_business_id,feature_code)
);
CREATE TABLE public.audit_logs(
 employee_id bigint,branch_id bigint,action text,entity_type text,entity_id bigint,
 details jsonb,business_id uuid
);
\i review-only/top-chicken-sh0008-pin4-login-NO-DEPLOY.sql
INSERT INTO public.branches VALUES
 (22,'5358328c-9724-49aa-affc-1bce8be90f92',true),
 (1,'91826502-590e-4afa-8826-2c0f4b99c490',true);
INSERT INTO auth.users VALUES
 ('00000000-0000-4000-8000-000000000001','tc-sh0008-ahmed@accounts.example'),
 ('00000000-0000-4000-8000-000000000002','tc-sh0008-other@accounts.example'),
 ('00000000-0000-4000-8000-000000000003','tc-sh0008-foreign@accounts.example');
INSERT INTO public.employees VALUES
 (4,'00000000-0000-4000-8000-000000000001','tc_ahmed_hash','Ahmed','cashier',true,22,'5358328c-9724-49aa-affc-1bce8be90f92'),
 (5,'00000000-0000-4000-8000-000000000002','tc_other_hash','Other','cashier',true,22,'5358328c-9724-49aa-affc-1bce8be90f92'),
 (6,'00000000-0000-4000-8000-000000000003','tc_foreign_hash','Foreign','cashier',true,1,'91826502-590e-4afa-8826-2c0f4b99c490');
INSERT INTO public.business_auth_memberships VALUES
 ('00000000-0000-4000-8000-000000000001','5358328c-9724-49aa-affc-1bce8be90f92',true),
 ('00000000-0000-4000-8000-000000000002','5358328c-9724-49aa-affc-1bce8be90f92',true),
 ('00000000-0000-4000-8000-000000000003','91826502-590e-4afa-8826-2c0f4b99c490',true);
INSERT INTO sharawla_internal.operational_feature_entitlements_v1
(cloud_business_id,feature_code,enabled) VALUES
 ('5358328c-9724-49aa-affc-1bce8be90f92','core.auth',true),
 ('5358328c-9724-49aa-affc-1bce8be90f92','core.users',true),
 ('5358328c-9724-49aa-affc-1bce8be90f92','core.permissions',true);

DO $$
DECLARE v jsonb; i integer;
BEGIN
 FOR i IN 1..5 LOOP
  v:=public.top_chicken_pin_login_attempt_v1('ahmed');
  IF v->>'allowed'<>'true' THEN RAISE EXCEPTION 'expected allowed attempt %; got %',i,v; END IF;
 END LOOP;
 v:=public.top_chicken_pin_login_attempt_v1('ahmed');
 IF v->>'allowed'<>'false' OR v->>'locked'<>'true' THEN
  RAISE EXCEPTION 'expected lockout after 5 attempts: %',v;
 END IF;
 IF public.top_chicken_pin_login_success_v1('ahmed','00000000-0000-4000-8000-000000000002') THEN
  RAISE EXCEPTION 'foreign auth user should not reset lockout';
 END IF;
 v:=public.top_chicken_pin_login_attempt_v1('ahmed');
 IF v->>'allowed'<>'false' THEN RAISE EXCEPTION 'lockout incorrectly bypassed'; END IF;
 IF NOT public.top_chicken_pin_login_success_v1('ahmed','00000000-0000-4000-8000-000000000001') THEN
  RAISE EXCEPTION 'verified account success not recorded';
 END IF;
 v:=public.top_chicken_pin_login_attempt_v1('ahmed');
 IF v->>'allowed'<>'true' THEN RAISE EXCEPTION 'legitimate success did not reset lock'; END IF;
 IF (SELECT count(*) FROM public.audit_logs WHERE action='top_chicken_pin.login')<>1 THEN
  RAISE EXCEPTION 'login audit missing or duplicated';
 END IF;
 v:=public.top_chicken_pin_login_attempt_v1('foreign');
 IF v->>'allowed'<>'false' THEN RAISE EXCEPTION 'foreign tenant was allowed'; END IF;
 v:=public.top_chicken_pin_login_attempt_v1('invalid!');
 IF v->>'allowed'<>'false' THEN RAISE EXCEPTION 'invalid user allowed'; END IF;
 UPDATE sharawla_internal.operational_feature_entitlements_v1
 SET enabled=false WHERE feature_code='core.permissions';
 v:=public.top_chicken_pin_login_attempt_v1('other');
 IF v->>'allowed'<>'false' THEN RAISE EXCEPTION 'revoked entitlement was allowed'; END IF;
 UPDATE sharawla_internal.operational_feature_entitlements_v1
 SET enabled=true,valid_until=clock_timestamp()-interval '1 hour' WHERE feature_code='core.permissions';
 v:=public.top_chicken_pin_login_attempt_v1('other');
 IF v->>'allowed'<>'false' THEN RAISE EXCEPTION 'expired entitlement was allowed'; END IF;
 UPDATE sharawla_internal.operational_feature_entitlements_v1
 SET valid_until=NULL WHERE feature_code='core.permissions';
 UPDATE public.employees SET active=false WHERE id=5;
 v:=public.top_chicken_pin_login_attempt_v1('other');
 IF v->>'allowed'<>'false' THEN RAISE EXCEPTION 'disabled employee was allowed'; END IF;
END $$;
SELECT 'PASS: PIN4 PG17 throttle, success audit, foreign tenant, expired/revoked rights and disabled employee' AS status;
