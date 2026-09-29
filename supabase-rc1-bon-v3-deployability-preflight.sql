-- Sharawla RC1 Bon V3 — baseline deployability preflight
-- READ-ONLY CHECKS ONLY / SOURCE ONLY / DEPLOYMENT 0.
-- Run before any future Bon policy/V2/V3 migration. Any mismatch fails closed.
do $preflight$
declare v_missing text[]:=array[]::text[];
begin
  if to_regprocedure('public.current_employee_id()') is null then v_missing:=array_append(v_missing,'current_employee_id()'); end if;
  if to_regprocedure('public.has_branch_access(bigint)') is null then v_missing:=array_append(v_missing,'has_branch_access(bigint)'); end if;
  if to_regprocedure('public.create_pos_order_atomic(jsonb,jsonb,jsonb)') is null then v_missing:=array_append(v_missing,'create_pos_order_atomic(jsonb,jsonb,jsonb)'); end if;
  if to_regprocedure('gen_random_uuid()') is null then v_missing:=array_append(v_missing,'gen_random_uuid()'); end if;
  if to_regclass('public.shifts') is null then v_missing:=array_append(v_missing,'shifts'); end if;
  if to_regclass('public.orders') is null then v_missing:=array_append(v_missing,'orders'); end if;
  if to_regclass('public.shift_bon_counters') is null then v_missing:=array_append(v_missing,'shift_bon_counters'); end if;

  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='shifts' and column_name='employee_id' and data_type='bigint') then v_missing:=array_append(v_missing,'shifts.employee_id bigint'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='shifts' and column_name='client_open_tx_id' and data_type='text') then v_missing:=array_append(v_missing,'shifts.client_open_tx_id text'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='shifts' and column_name='branch_id' and data_type='bigint') then v_missing:=array_append(v_missing,'shifts.branch_id bigint'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='bon_number' and data_type='integer') then v_missing:=array_append(v_missing,'orders.bon_number integer'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='client_tx_id' and data_type='text') then v_missing:=array_append(v_missing,'orders.client_tx_id text'); end if;

  if cardinality(v_missing)>0 then raise exception 'Bon V3 deployability preflight failed: %',array_to_string(v_missing,', '); end if;
end
$preflight$;
