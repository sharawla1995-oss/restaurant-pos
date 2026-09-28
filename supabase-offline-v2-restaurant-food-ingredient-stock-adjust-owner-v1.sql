-- SOURCE ONLY. Do not deploy without explicit authorization.
-- Offline V2 ingredient adjustment owner. The accepted Action V2 remains the only stock authority.
create or replace function public.offline_food_ingredient_stock_adjust_action_v2(p_branch_id bigint,p_ingredient_id bigint,p_quantity_delta numeric,p_unit_cost numeric,p_reason text,p_client_tx_id text,p_payload_digest text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_ADJUSTMENT_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-ingredient-adjust:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then if r.operation_type<>'food_ingredient_stock_adjust' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if coalesce(p_quantity_delta,0)=0 then raise exception 'OFFLINE_FOOD_ADJUSTMENT_DELTA_REQUIRED';end if;
 if coalesce(p_unit_cost,0)<0 then raise exception 'OFFLINE_FOOD_ADJUSTMENT_COST_INVALID';end if;
 if not exists(select 1 from public.ingredients i where i.id=p_ingredient_id and i.active is distinct from false and i.track_inventory=true) then raise exception 'OFFLINE_FOOD_ADJUSTMENT_INGREDIENT_DEPENDENCY_UNRESOLVED';end if;
 -- Accepted Action V2 owns permission, branch access, client_tx idempotency and the Point-4 legacy-write guard.
 v_id:=public.food_ingredient_stock_adjust_action_v2(p_branch_id,p_ingredient_id,p_quantity_delta,p_unit_cost,p_reason,v_tx);
 v_result:=jsonb_build_object('ok',true,'adjustment_id',v_id,'branch_id',p_branch_id,'ingredient_id',p_ingredient_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_ingredient_stock_adjust',v_d,v_id,v_result);return v_result;
end;$$;
revoke all on function public.offline_food_ingredient_stock_adjust_action_v2(bigint,bigint,numeric,numeric,text,text,text) from public,anon;
grant execute on function public.offline_food_ingredient_stock_adjust_action_v2(bigint,bigint,numeric,numeric,text,text,text) to authenticated;
