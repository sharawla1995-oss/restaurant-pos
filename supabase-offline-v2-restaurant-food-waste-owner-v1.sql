-- SOURCE ONLY. Do not deploy without explicit authorization.
-- Offline V2 waste owner. Server Action V2 remains the only stock authority.
create or replace function public.offline_food_waste_post_action_v2(p_branch_id bigint,p_ingredient_id bigint,p_prep_item_id bigint,p_shift_id bigint,p_reason_code text,p_quantity numeric,p_unit_code text,p_notes text,p_client_tx_id text,p_payload_digest text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_WASTE_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-waste:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then if r.operation_type<>'food_waste_post' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if coalesce(p_quantity,0)<=0 then raise exception 'OFFLINE_FOOD_WASTE_QUANTITY_INVALID';end if;
 if not exists(select 1 from public.ingredients where id=p_ingredient_id and active is distinct from false) then raise exception 'OFFLINE_FOOD_WASTE_INGREDIENT_DEPENDENCY_UNRESOLVED';end if;
 if not exists(select 1 from public.food_waste_reasons where code=p_reason_code and active=true) then raise exception 'OFFLINE_FOOD_WASTE_REASON_DEPENDENCY_UNRESOLVED';end if;
 -- Accepted Action V2 owns permission, branch access, replay and Point-4 guard; canonical writer resolves units, sufficiency and cost snapshot.
 v_id:=public.food_waste_post_action_v2(p_branch_id,p_ingredient_id,p_prep_item_id,p_shift_id,p_reason_code,p_quantity,p_unit_code,p_notes,v_tx);
 v_result:=jsonb_build_object('ok',true,'waste_event_id',v_id,'branch_id',p_branch_id,'ingredient_id',p_ingredient_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_waste_post',v_d,v_id,v_result);return v_result;
end;$$;
revoke all on function public.offline_food_waste_post_action_v2(bigint,bigint,bigint,bigint,text,numeric,text,text,text,text) from public,anon;
grant execute on function public.offline_food_waste_post_action_v2(bigint,bigint,bigint,bigint,text,numeric,text,text,text,text) to authenticated;
