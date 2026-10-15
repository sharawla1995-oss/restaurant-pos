-- Run AFTER the review-only additive quantity SQL in disposable PostgreSQL 16.
DO $test$
DECLARE v_qty integer; v_ok boolean; v_owner jsonb;
BEGIN
  INSERT INTO public.order_item_modifiers(order_item_id,modifier_name)
  VALUES(11,'legacy line three');
  SELECT quantity INTO v_qty FROM public.order_item_modifiers WHERE modifier_name='legacy line three';
  IF v_qty<>3 THEN RAISE EXCEPTION 'FAIL legacy default got % expected 3',v_qty; END IF;
  INSERT INTO public.order_item_modifiers(order_item_id,modifier_name,quantity)
  VALUES(11,'exact two',2);
  SELECT quantity INTO v_qty FROM public.order_item_modifiers WHERE modifier_name='exact two';
  IF v_qty<>2 THEN RAISE EXCEPTION 'FAIL exact quantity'; END IF;
  v_ok:=true;
  BEGIN
    INSERT INTO public.order_item_modifiers(order_item_id,modifier_name,quantity)
    VALUES(11,'invalid zero',0);
  EXCEPTION WHEN OTHERS THEN v_ok:=false;
  END;
  IF v_ok THEN RAISE EXCEPTION 'FAIL zero accepted'; END IF;
  v_ok:=true;
  BEGIN
    INSERT INTO public.order_item_modifiers(order_item_id,modifier_name)
    VALUES(13,'legacy overflow');
  EXCEPTION WHEN OTHERS THEN v_ok:=false;
  END;
  IF v_ok THEN RAISE EXCEPTION 'FAIL 100 accepted'; END IF;
  SELECT public.create_pos_order_atomic('{}','{}','{}') INTO v_owner;
  IF v_owner <> '{"owner":"unchanged-owner"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL original POS function overwritten';
  END IF;
  IF (SELECT count(*) FROM public.order_item_modifiers)<>2 THEN
    RAISE EXCEPTION 'FAIL unexpected modifier count';
  END IF;
  RAISE NOTICE 'PASS: PostgreSQL16 isolated quantity default 3, exact 2, reject 0/100, shared owner untouched';
END;
$test$;
