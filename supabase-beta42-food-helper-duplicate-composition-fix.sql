-- Sharawla POS 10.5.4-beta.42
-- Operational Beta backend patch.
-- Allows an already-created Retail/Variant order to receive its Recipe posting
-- in the same outer transaction. Per-order-item cost snapshots remain the
-- idempotency guard, so retries do not consume ingredients twice.

do $patch$
declare
  v_def text;
  v_old text := '  if coalesce((p_result->>''duplicate_prevented'')::boolean,false) then return p_result; end if;';
begin
  select pg_get_functiondef('public.food_apply_order_consumption_v1(jsonb,jsonb)'::regprocedure) into v_def;
  if position(v_old in v_def)=0 then raise exception 'Beta42 helper patch guard: duplicate early-return anchor not found'; end if;
  if position('food_order_item_cost_snapshots where order_item_id=v_order_item_id' in v_def)=0 then raise exception 'Beta42 helper patch guard: per-item idempotency guard missing'; end if;
  v_def := replace(v_def,v_old,'  -- Beta42 composition: duplicate base orders may still need missing Recipe postings; per-item snapshots are the idempotency guard.');
  execute v_def;
end;
$patch$;
