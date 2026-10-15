-- REVIEW ONLY / DO NOT DEPLOY. NOT AN AUTHORIZATION TO APPLY.
-- Beta xihcxydjnzemflhedzor. TC business 5358328c-9724-49aa-affc-1bce8be90f92.
-- Additive modifier quantity compatibility for the current shared Beta catalog only.
-- Must be run in isolated PostgreSQL 16 using a verified restore first, with independent SQL approval.
-- Never replay supabase-v10-5-15-modifier-quantity.sql wholesale:
-- it replaces the shared public.create_pos_order_atomic owner and is out of scope.
BEGIN;

-- Exact schema preflight: refuse to overwrite any already deployed quantity semantics.
DO $preflight$
BEGIN
  IF to_regclass('public.order_item_modifiers') IS NULL
     OR to_regclass('public.order_items') IS NULL THEN
    RAISE EXCEPTION 'TC_QUANTITY_MISSING_BASE_TABLE';
  END IF;
  IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='order_item_modifiers'
        AND column_name='quantity'
  ) THEN
    RAISE EXCEPTION 'TC_QUANTITY_ALREADY_EXISTS_REVIEW_EXISTING_OWNER';
  END IF;
  -- Read-only Beta evidence at packaging: zero rows. Re-check immediately before apply.
  -- Do not silently mutate other tenant history or reinterpret existing modifiers.
  IF EXISTS (SELECT 1 FROM public.order_item_modifiers LIMIT 1) THEN
    RAISE EXCEPTION 'TC_QUANTITY_HISTORICAL_ROWS_REQUIRE_SEPARATE_BACKFILL_REVIEW';
  END IF;
  IF to_regprocedure('public.order_item_modifier_quantity_default_v15()') IS NOT NULL THEN
    RAISE EXCEPTION 'TC_QUANTITY_EXISTING_TRIGGER_FUNCTION_REQUIRES_REVIEW';
  END IF;
END;
$preflight$;

ALTER TABLE public.order_item_modifiers
  ADD COLUMN quantity integer;

-- Historical create_pos_order_atomic owner omits quantity; preserve its legacy
-- semantics that each selected modifier applies to the whole line quantity.
-- Newer exact-extras owner supplies explicit quantity and must not be overwritten.
CREATE FUNCTION public.order_item_modifier_quantity_default_v15()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'pg_catalog','public'
AS $body$
DECLARE
  v_line_quantity numeric;
BEGIN
  IF NEW.quantity IS NULL THEN
    SELECT oi.quantity INTO v_line_quantity
    FROM public.order_items oi
    WHERE oi.id=NEW.order_item_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TC_QUANTITY_PARENT_ORDER_ITEM_REQUIRED';
    END IF;
    NEW.quantity := greatest(1,round(coalesce(v_line_quantity,1)))::integer;
  END IF;
  IF NEW.quantity < 1 OR NEW.quantity > 99 THEN
    RAISE EXCEPTION 'TC_QUANTITY_OUT_OF_RANGE';
  END IF;
  RETURN NEW;
END;
$body$;

CREATE TRIGGER trg_order_item_modifier_quantity_default_v15
BEFORE INSERT ON public.order_item_modifiers
FOR EACH ROW
EXECUTE FUNCTION public.order_item_modifier_quantity_default_v15();

ALTER TABLE public.order_item_modifiers
  ALTER COLUMN quantity SET NOT NULL,
  ADD CONSTRAINT order_item_modifiers_quantity_check CHECK (quantity BETWEEN 1 AND 99);

-- Defensive trigger privileges; never grant new DML or change RLS.
REVOKE ALL ON FUNCTION public.order_item_modifier_quantity_default_v15()
FROM PUBLIC, anon, authenticated;

-- Assertion: authoritative Food/Direct Root definitions have NOT been replaced.
-- Publication and RLS remain unchanged. Never touch website modifiers in this scope.
DO $postflight$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='order_item_modifiers'
      AND column_name='quantity' AND data_type='integer' AND is_nullable='NO'
  ) THEN
    RAISE EXCEPTION 'TC_QUANTITY_POSTFLIGHT_FAILED';
  END IF;
END;
$postflight$;
COMMIT;
