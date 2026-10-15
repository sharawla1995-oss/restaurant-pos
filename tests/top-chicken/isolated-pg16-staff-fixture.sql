-- Fresh isolated disposable PostgreSQL16; deliberately different from Beta.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text NOT NULL UNIQUE);
CREATE TABLE public.branches(id bigint PRIMARY KEY,business_id uuid NOT NULL,active boolean NOT NULL);
CREATE SCHEMA sharawla_internal;
CREATE TABLE sharawla_internal.operational_feature_entitlements_v1 (
 cloud_business_id uuid NOT NULL,feature_code text NOT NULL,enabled boolean NOT NULL,valid_until timestamptz,
 PRIMARY KEY(cloud_business_id,feature_code)
);
INSERT INTO sharawla_internal.operational_feature_entitlements_v1 VALUES
 ('5358328c-9724-49aa-affc-1bce8be90f92','core.auth',true,NULL),
 ('5358328c-9724-49aa-affc-1bce8be90f92','core.users',true,NULL),
 ('5358328c-9724-49aa-affc-1bce8be90f92','core.permissions',true,NULL),
 ('91826502-590e-4afa-8826-2c0f4b99c490','core.users',true,NULL);
CREATE TABLE public.employees(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 name text NOT NULL,username text NOT NULL,role text,branch_id bigint,active boolean,
 auth_user_id uuid,business_id uuid NOT NULL,
 CONSTRAINT employees_username_format CHECK(length(trim(username)) BETWEEN 3 AND 40),
 CONSTRAINT employees_username_no_at CHECK(position('@' IN username)=0),
 UNIQUE(business_id,auth_user_id),UNIQUE(business_id,username)
);
CREATE TABLE public.business_auth_memberships(
 auth_user_id uuid NOT NULL,business_id uuid NOT NULL,active boolean NOT NULL,source text NOT NULL DEFAULT 'migration',updated_at timestamptz DEFAULT now(),
 PRIMARY KEY(auth_user_id,business_id)
);
CREATE TABLE public.employee_branches(
 employee_id bigint NOT NULL,branch_id bigint NOT NULL,business_id uuid NOT NULL,
 PRIMARY KEY(business_id,employee_id,branch_id)
);
CREATE TABLE public.employee_permissions(
 employee_id bigint NOT NULL,permission_key text NOT NULL,allowed boolean NOT NULL,
 business_id uuid NOT NULL,PRIMARY KEY(business_id,employee_id,permission_key)
);
CREATE TABLE public.audit_logs(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,employee_id bigint,branch_id bigint,action text,
 entity_type text,entity_id bigint,details jsonb,business_id uuid
);
INSERT INTO public.branches VALUES
 (22,'5358328c-9724-49aa-affc-1bce8be90f92',true),
 (9,'91826502-590e-4afa-8826-2c0f4b99c490',true);
INSERT INTO auth.users VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin@example.com'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','legacy@example.com'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','new@example.com'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','other@example.com'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','new@another.example.com');
INSERT INTO public.employees(name,username,role,branch_id,active,auth_user_id,business_id) VALUES
 ('TC admin','tc-admin','admin',22,true,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','5358328c-9724-49aa-affc-1bce8be90f92'),
 ('Legacy admin','legacy-admin','admin',9,true,
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','91826502-590e-4afa-8826-2c0f4b99c490');
INSERT INTO public.business_auth_memberships(auth_user_id,business_id,active) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','5358328c-9724-49aa-affc-1bce8be90f92',true),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','91826502-590e-4afa-8826-2c0f4b99c490',true);
