-- SOURCE ONLY. Do not deploy without explicit authorization.
-- Offline V2 ingredient master-data owners. Replay receipt is the idempotency boundary because canonical master actions have no client_tx_id.
create or replace function public.offline_food_ingredient_save_action_v2(p_ingredient_id bigint,p_name text,p_base_unit_code text,p_purchase_unit_code text,p_sku text,p_barcode text,p_cost_per_base_unit numeric,p_minimum_quantity numeric,p_track_inventory boolean,p_usable_yield_percent numeric,p_shelf_life_minutes integer,p_active boolean,p_client_tx_id text,p_payload_digest text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_INGREDIENT_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-ingredient-save:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then if r.operation_type<>'food_ingredient_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if p_ingredient_id is not null and not exists(select 1 from public.ingredients where id=p_ingredient_id) then raise exception 'OFFLINE_FOOD_INGREDIENT_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_ingredient_save_action_v2(p_ingredient_id,p_name,p_base_unit_code,p_purchase_unit_code,p_sku,p_barcode,p_cost_per_base_unit,p_minimum_quantity,p_track_inventory,p_usable_yield_percent,p_shelf_life_minutes,p_active);
 v_result:=jsonb_build_object('ok',true,'ingredient_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_ingredient_save',v_d,v_id,v_result);return v_result;end;$$;
create or replace function public.offline_food_ingredient_conversion_save_action_v2(p_ingredient_id bigint,p_from_unit_code text,p_to_unit_code text,p_factor numeric,p_active boolean,p_client_tx_id text,p_payload_digest text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_CONVERSION_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-ingredient-conversion:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then if r.operation_type<>'food_ingredient_conversion_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if not exists(select 1 from public.ingredients where id=p_ingredient_id) then raise exception 'OFFLINE_FOOD_CONVERSION_INGREDIENT_DEPENDENCY_UNRESOLVED';end if;
 if coalesce(p_factor,0)<=0 then raise exception 'OFFLINE_FOOD_CONVERSION_FACTOR_INVALID';end if;
 v_id:=public.food_ingredient_conversion_save_action_v2(p_ingredient_id,p_from_unit_code,p_to_unit_code,p_factor,p_active);
 v_result:=jsonb_build_object('ok',true,'conversion_id',v_id,'ingredient_id',p_ingredient_id,'client_tx_id',v_tx,'idempotent_replay',false);insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_ingredient_conversion_save',v_d,v_id,v_result);return v_result;end;$$;
revoke all on function public.offline_food_ingredient_save_action_v2(bigint,text,text,text,text,text,numeric,numeric,boolean,numeric,integer,boolean,text,text) from public,anon;
revoke all on function public.offline_food_ingredient_conversion_save_action_v2(bigint,text,text,numeric,boolean,text,text) from public,anon;
grant execute on function public.offline_food_ingredient_save_action_v2(bigint,text,text,text,text,text,numeric,numeric,boolean,numeric,integer,boolean,text,text) to authenticated;
grant execute on function public.offline_food_ingredient_conversion_save_action_v2(bigint,text,text,numeric,boolean,text,text) to authenticated;
