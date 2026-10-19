-- Disposable PostgreSQL 16 database only.
CREATE OR REPLACE FUNCTION public.tc_assert_blocked(
  p_order jsonb,p_items jsonb,p_payments jsonb,p_tx text,p_expected text
) RETURNS void LANGUAGE plpgsql AS $assert$
DECLARE v_error text;
BEGIN
  BEGIN
    PERFORM public.top_chicken_pwa_create_order_v1(p_order,p_items,p_payments,p_tx);
    RAISE EXCEPTION 'TEST_EXPECTED_REJECTION_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error IS DISTINCT FROM p_expected THEN
      RAISE EXCEPTION 'Expected %, got %',p_expected,v_error;
    END IF;
  END;
END;
$assert$;

DO $test$
DECLARE
  v_tx constant text := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_old_tx constant text := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_sale jsonb;
  v_replay jsonb;
  v_items jsonb := '[{"product_id":9,"quantity":1,"unit_price":100,"total":100}]';
  v_payments jsonb := '[{"method":"cash","amount":100}]';
  v_sale_count integer;
BEGIN
  v_sale:=public.top_chicken_pwa_create_order_v1(
    public.tc_fixture_order(v_tx),v_items,v_payments,v_tx);
  v_replay:=public.top_chicken_pwa_create_order_v1(
    public.tc_fixture_order(v_tx),v_items,v_payments,v_tx);
  IF v_sale IS DISTINCT FROM v_replay THEN
    RAISE EXCEPTION 'REPLAY_RESULT_MISMATCH';
  END IF;
  SELECT count(*) INTO v_sale_count FROM public.orders WHERE client_tx_id=v_tx;
  IF v_sale_count<>1 THEN RAISE EXCEPTION 'DUPLICATE_SALE_CREATED'; END IF;

  PERFORM public.tc_assert_blocked(
    public.tc_fixture_order(v_tx,101),v_items,v_payments,v_tx,
    'TRANSACTION_REPLAY_CONFLICT');
  PERFORM public.tc_assert_blocked(
    public.tc_fixture_order(v_tx),v_items,'[{"method":"cash","amount":101}]',v_tx,
    'TRANSACTION_REPLAY_CONFLICT');
  PERFORM public.tc_assert_blocked(
    public.tc_fixture_order(v_tx),v_items,v_payments,v_old_tx,
    'Invalid or inconsistent transaction key');

  PERFORM public.tc_assert_blocked(
    public.tc_fixture_order('cccccccc-cccc-4ccc-8ccc-cccccccccccc',100,23),
    v_items,v_payments,'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'Order actor/branch mismatch');

  PERFORM set_config('tc_test.uid','a2222222-2222-4222-8222-222222222222',true);
  PERFORM public.tc_assert_blocked(
    public.tc_fixture_order(v_tx),v_items,v_payments,v_tx,
    'TRANSACTION_REPLAY_CONFLICT');
  PERFORM set_config('tc_test.uid','a1111111-1111-4111-8111-111111111111',true);

  PERFORM set_config('tc_test.business','00000000-0000-4000-8000-000000000000',true);
  PERFORM public.tc_assert_blocked(
    public.tc_fixture_order(v_tx),v_items,v_payments,v_tx,
    'Top Chicken Beta tenant not authorized');
  PERFORM set_config('tc_test.business','5358328c-9724-49aa-affc-1bce8be90f92',true);

  PERFORM set_config('tc_test.allow_branch','no',true);
  PERFORM public.tc_assert_blocked(
    public.tc_fixture_order(v_tx),v_items,v_payments,v_tx,
    'Branch 22 actor not authorized');
  PERFORM set_config('tc_test.allow_branch','yes',true);

  -- Unknown legacy client_tx_id without gateway receipt must never silently
  -- replay the payload-blind canonical operation.
  INSERT INTO public.orders(branch_id,employee_id,client_tx_id)
    VALUES (22,1001,v_old_tx);
  PERFORM public.tc_assert_blocked(
    public.tc_fixture_order(v_old_tx),v_items,v_payments,v_old_tx,
    'PREEXISTING_ORDER_REQUIRES_RECONCILIATION');

  IF (SELECT count(*) FROM public.top_chicken_pwa_order_receipts_v1)<>1
    THEN RAISE EXCEPTION 'UNEXPECTED_RECEIPTS'; END IF;
  IF (SELECT count(*) FROM public.orders)<>2
    THEN RAISE EXCEPTION 'UNEXPECTED_CANONICAL_ORDERS'; END IF;
  IF has_function_privilege('anon',
       'public.top_chicken_pwa_create_order_v1(jsonb,jsonb,jsonb,text)','EXECUTE')
    THEN RAISE EXCEPTION 'ANON_GATEWAY_EXECUTE_GRANT'; END IF;
  IF NOT has_function_privilege('authenticated',
       'public.top_chicken_pwa_create_order_v1(jsonb,jsonb,jsonb,text)','EXECUTE')
    THEN RAISE EXCEPTION 'AUTHENTICATED_GATEWAY_GRANT_MISSING'; END IF;
  IF has_table_privilege('authenticated',
       'public.top_chicken_pwa_order_receipts_v1','INSERT')
    THEN RAISE EXCEPTION 'DIRECT_RECEIPT_WRITE_EXPOSED'; END IF;
  RAISE NOTICE 'TC_PWA_PG16_ORDER_GATEWAY_PASS replay digest tenant actor branch legacy tx and grants';
END;
$test$;
