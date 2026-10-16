-- Synthetic, standalone PostgreSQL 17 test database ONLY.
CREATE SCHEMA auth;
CREATE SCHEMA sharawla_internal;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text NOT NULL UNIQUE);
CREATE TABLE public.branches(id bigint PRIMARY KEY,business_id uuid NOT NULL,active boolean NOT NULL);
CREATE TABLE public.employees(id bigint PRIMARY KEY,auth_user_id uuid NOT NULL,
  business_id uuid NOT NULL,branch_id bigint NOT NULL,active boolean NOT NULL,role text NOT NULL);
CREATE TABLE public.business_auth_memberships(auth_user_id uuid NOT NULL,business_id uuid NOT NULL,
  active boolean NOT NULL,PRIMARY KEY(auth_user_id,business_id));
CREATE TABLE public.top_chicken_pin_attempts_v1(username text PRIMARY KEY,
 attempts int NOT NULL,window_start timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,locked_until timestamptz);
INSERT INTO public.branches VALUES
 (22,'5358328c-9724-49aa-affc-1bce8be90f92',true),
 (23,'3e405b6f-feba-4d5c-a4bf-bebb77f2d5d7',true);
INSERT INTO auth.users VALUES
 ('11111111-1111-4111-8111-111111111111','tc-sh0008-goo@accounts.example'),
 ('22222222-2222-4222-8222-222222222222','tc-sh0008-evil@accounts.example'),
 ('33333333-3333-4333-8333-333333333333','tc-sh0008-disabled@accounts.example'),
 ('44444444-4444-4444-8444-444444444444','tc-sh0008-unlinked@accounts.example');
INSERT INTO public.employees VALUES
 (6,'11111111-1111-4111-8111-111111111111','5358328c-9724-49aa-affc-1bce8be90f92',22,true,'cashier'),
 (7,'22222222-2222-4222-8222-222222222222','3e405b6f-feba-4d5c-a4bf-bebb77f2d5d7',23,true,'cashier'),
 (8,'33333333-3333-4333-8333-333333333333','5358328c-9724-49aa-affc-1bce8be90f92',22,false,'cashier'),
 (9,'44444444-4444-4444-8444-444444444444','5358328c-9724-49aa-affc-1bce8be90f92',22,true,'cashier');
INSERT INTO public.business_auth_memberships VALUES
 ('11111111-1111-4111-8111-111111111111','5358328c-9724-49aa-affc-1bce8be90f92',true),
 ('22222222-2222-4222-8222-222222222222','3e405b6f-feba-4d5c-a4bf-bebb77f2d5d7',true),
 ('33333333-3333-4333-8333-333333333333','5358328c-9724-49aa-affc-1bce8be90f92',true);
-- Intentionally no commercial entitlement rows: a valid PIN should be
-- verifiable by Auth before lease refresh and the EXISTING post-auth gate.
