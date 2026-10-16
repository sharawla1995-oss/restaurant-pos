-- PostgreSQL 17 synthetic isolated fixture only. NO real credentials or Beta writes.
DO $test$
DECLARE
 d jsonb;
 n integer;
BEGIN
 SELECT public.top_chicken_pin_login_attempt_v1('goo') INTO d;
 IF d->>'allowed' <> 'true' THEN RAISE EXCEPTION 'FAIL authorized goo cannot enter PIN Auth preflight without cached lease: %',d; END IF;
 IF (SELECT attempts FROM public.top_chicken_pin_attempts_v1 WHERE username='goo')<>1
   THEN RAISE EXCEPTION 'FAIL rate-limit counter missing'; END IF;
 FOR n IN 1..4 LOOP
  PERFORM public.top_chicken_pin_login_attempt_v1('goo');
 END LOOP;
 SELECT public.top_chicken_pin_login_attempt_v1('goo') INTO d;
 IF d->>'allowed'<>'false' OR d->>'locked'<>'true'
   THEN RAISE EXCEPTION 'FAIL repeated attempts did not lock out: %',d; END IF;
 IF (SELECT locked_until>clock_timestamp() FROM public.top_chicken_pin_attempts_v1 WHERE username='goo') IS DISTINCT FROM true
   THEN RAISE EXCEPTION 'FAIL account lockout timestamp'; END IF;
 FOR n IN 1..2 LOOP
  SELECT public.top_chicken_pin_login_attempt_v1(
   CASE WHEN n=1 THEN 'evil' ELSE 'disabled' END) INTO d;
  IF d->>'allowed'<>'false' THEN RAISE EXCEPTION 'FAIL foreign or disabled account entered: %',d; END IF;
 END LOOP;
 SELECT public.top_chicken_pin_login_attempt_v1('unlinked') INTO d;
 IF d->>'allowed'<>'false' THEN RAISE EXCEPTION 'FAIL missing membership entered'; END IF;
 SELECT public.top_chicken_pin_login_attempt_v1('goo@example.com') INTO d;
 IF d->>'allowed'<>'false' THEN RAISE EXCEPTION 'FAIL email-like login entered PIN-only path'; END IF;
 SELECT public.top_chicken_pin_login_attempt_v1('zzzz') INTO d;
 IF d->>'allowed'<>'false' THEN RAISE EXCEPTION 'FAIL unknown staff entered'; END IF;
 IF (SELECT count(*) FROM public.top_chicken_pin_attempts_v1 WHERE username='goo')<>1
   THEN RAISE EXCEPTION 'FAIL pin account identity'; END IF;
 RAISE NOTICE 'PASS PG17: goo preauth allowed without lease; rate limits, lockout, disabled, foreign tenant, missing membership and invalid accounts denied';
END $test$;
