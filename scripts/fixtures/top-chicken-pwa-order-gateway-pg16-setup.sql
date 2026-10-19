-- Disposable PostgreSQL 16 fixture ONLY; never run against Supabase or an existing database.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('tc_test.uid',true),'')::uuid $$;
CREATE OR REPLACE FUNCTION public.current_business_id() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('tc_test.business',true),'')::uuid $$;
CREATE OR REPLACE FUNCTION public.current_employee_id() RETURNS bigint LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('tc_test.employee',true),'')::bigint $$;
CREATE OR REPLACE FUNCTION public.has_branch_access(p_branch_id bigint) RETURNS boolean LANGUAGE sql STABLE
AS $$ SELECT p_branch_id=22 AND current_setting('tc_test.allow_branch',true)='yes' $$;

CREATE TABLE public.orders(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id bigint NOT NULL,
  employee_id bigint NOT NULL,
  client_tx_id text UNIQUE NOT NULL
);
CREATE OR REPLACE FUNCTION public.create_pos_order_atomic(
  p_order jsonb,p_items jsonb,p_payments jsonb
) RETURNS jsonb LANGUAGE plpgsql AS $fixture$
DECLARE v_order public.orders%ROWTYPE;
BEGIN
  INSERT INTO public.orders(branch_id,employee_id,client_tx_id)
  VALUES ((p_order->>'branch_id')::bigint,
          (p_order->>'employee_id')::bigint,
          (p_order->>'client_tx_id')) RETURNING * INTO v_order;
  RETURN jsonb_build_object('order',to_jsonb(v_order),'items',p_items);
END;
$fixture$;

CREATE OR REPLACE FUNCTION public.tc_fixture_order(p_tx text,p_total numeric DEFAULT 100,p_branch bigint DEFAULT 22,p_emp bigint DEFAULT 1001)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('client_tx_id',p_tx,'branch_id',p_branch,
  'employee_id',p_emp,'total',p_total,'subtotal',p_total)
$$;

SELECT set_config('tc_test.uid','a1111111-1111-4111-8111-111111111111',false);
SELECT set_config('tc_test.business','5358328c-9724-49aa-affc-1bce8be90f92',false);
SELECT set_config('tc_test.employee','1001',false);
SELECT set_config('tc_test.allow_branch','yes',false);
