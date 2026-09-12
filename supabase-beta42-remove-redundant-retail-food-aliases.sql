-- Sharawla POS 10.5.4-beta.42
-- Forward-only cleanup. Migration history is preserved.
-- Canonical RPC names are create_food_retail_*.

drop function if exists public.create_retail_food_pos_order_atomic_v1(jsonb,jsonb,jsonb);
drop function if exists public.create_retail_food_order_return_idempotent_v1(bigint,text,text,jsonb,jsonb,text);
