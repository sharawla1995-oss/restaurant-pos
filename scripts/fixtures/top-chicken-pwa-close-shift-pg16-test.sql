-- Dedicated PG16 disposable shift-close assertions; no Beta database touched.
DO $test$
DECLARE
 v_tx constant text:='ffffffff-ffff-4fff-8fff-ffffffffffff';
 v_diff constant text:='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 v_result jsonb;v_replay jsonb;v_err text;
BEGIN
 v_result:=public.top_chicken_pwa_close_shift_v1(5001,55,v_tx);
 v_replay:=public.top_chicken_pwa_close_shift_v1(5001,55,v_tx);
 IF v_result IS DISTINCT FROM v_replay
 THEN RAISE EXCEPTION 'SHIFT_CLOSE_REPLAY_MISMATCH'; END IF;
 IF (SELECT closing_cash=55 AND expected_cash=50 AND status='closed'
    FROM public.shifts WHERE id=5001) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'SERVER_METRICS_NOT_AUTHORITATIVE'; END IF;
 BEGIN
   PERFORM public.top_chicken_pwa_close_shift_v1(5001,56,v_tx);
   RAISE EXCEPTION 'EXPECTED_REPLAY_CONFLICT';
 EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS v_err=MESSAGE_TEXT;
   IF v_err<>'SHIFT_CLOSE_REPLAY_CONFLICT'
   THEN RAISE EXCEPTION 'Incorrect changed-cash response %',v_err; END IF;
 END;

 -- The same shift with a different transaction key must not be reclosed.
 BEGIN
   PERFORM public.top_chicken_pwa_close_shift_v1(5001,55,v_diff);
   RAISE EXCEPTION 'EXPECTED_CLOSED_SHIFT_REJECT';
 EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS v_err=MESSAGE_TEXT;
   IF v_err<>'Shift not open; reconcile before retry'
   THEN RAISE EXCEPTION 'Incorrect reclose response %',v_err; END IF;
 END;

 PERFORM set_config('tc_test.uid','a2222222-2222-4222-8222-222222222222',true);
 BEGIN
   PERFORM public.top_chicken_pwa_close_shift_v1(5001,55,v_tx);
   RAISE EXCEPTION 'EXPECTED_OTHER_ACTOR_REJECT';
 EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS v_err=MESSAGE_TEXT;
   IF v_err<>'SHIFT_CLOSE_REPLAY_CONFLICT'
   THEN RAISE EXCEPTION 'Incorrect actor response %',v_err; END IF;
 END;
 PERFORM set_config('tc_test.uid','a1111111-1111-4111-8111-111111111111',true);

 BEGIN
   PERFORM public.top_chicken_pwa_close_shift_v1(5003,10,'77777777-7777-4777-8777-777777777777');
   RAISE EXCEPTION 'EXPECTED_FORGED_BRANCH_REJECT';
 EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS v_err=MESSAGE_TEXT;
   IF v_err<>'Shift actor/branch mismatch'
   THEN RAISE EXCEPTION 'Incorrect branch response %',v_err; END IF;
 END;

 PERFORM set_config('tc_test.unsettled','yes',true);
 BEGIN
   PERFORM public.top_chicken_pwa_close_shift_v1(5002,25,'88888888-8888-4888-8888-888888888888');
   RAISE EXCEPTION 'EXPECTED_UNSETTLED_REJECT';
 EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS v_err=MESSAGE_TEXT;
   IF v_err<>'DRIVER_CUSTODY_UNSETTLED'
   THEN RAISE EXCEPTION 'Incorrect custody response %',v_err; END IF;
 END;
 PERFORM set_config('tc_test.unsettled','no',true);

 IF (SELECT status FROM public.shifts WHERE id=5002)<>'open'
 THEN RAISE EXCEPTION 'UNSETTLED_SHIFT_CHANGED'; END IF;
 IF (SELECT count(*) FROM public.top_chicken_pwa_shift_close_receipts_v1)<>1
 THEN RAISE EXCEPTION 'SHIFT_RECEIPT_COUNT_MISMATCH'; END IF;
 IF has_function_privilege('anon','public.top_chicken_pwa_close_shift_v1(bigint,numeric,text)','EXECUTE')
 THEN RAISE EXCEPTION 'ANON_CLOSE_EXECUTE_EXPOSED'; END IF;
 IF NOT has_function_privilege('authenticated','public.top_chicken_pwa_close_shift_v1(bigint,numeric,text)','EXECUTE')
 THEN RAISE EXCEPTION 'AUTHENTICATED_CLOSE_GRANT_MISSING'; END IF;
 IF has_table_privilege('authenticated','public.top_chicken_pwa_shift_close_receipts_v1','INSERT')
 THEN RAISE EXCEPTION 'DIRECT_CLOSE_RECEIPT_WRITE_EXPOSED'; END IF;
 RAISE NOTICE 'TC_PWA_PG16_SHIFT_CLOSE_PASS server_cash replay changed_cash actor branch custody grants';
END;
$test$;
