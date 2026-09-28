-- SOURCE ONLY. Do not deploy without explicit authorization.
-- Offline V2 production lifecycle owners. Server remains the only stock authority.
create or replace function public.offline_food_production_batch_start_action_v2(p_branch_id bigint,p_prep_item_id bigint,p_planned_output_quantity numeric,p_batch_number text,p_notes text,p_client_tx_id text,p_payload_digest text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_PRODUCTION_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-production-start:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then if r.operation_type<>'food_production_start' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if coalesce(p_planned_output_quantity,0)<=0 then raise exception 'OFFLINE_FOOD_PRODUCTION_OUTPUT_INVALID';end if;
 if not exists(select 1 from public.food_prep_items where id=p_prep_item_id and active is distinct from false) then raise exception 'OFFLINE_FOOD_PRODUCTION_PREP_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_production_batch_start_action_v2(p_branch_id,p_prep_item_id,p_planned_output_quantity,p_batch_number,p_notes,v_tx);
 v_result:=jsonb_build_object('ok',true,'production_batch_id',v_id,'branch_id',p_branch_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_production_start',v_d,v_id,v_result);return v_result;
end;$$;
create or replace function public.offline_food_production_batch_complete_action_v2(p_production_batch_id bigint,p_actual_output_quantity numeric,p_consumptions jsonb,p_client_tx_id text,p_notes text,p_payload_digest text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_PRODUCTION_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-production-complete:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then if r.operation_type<>'food_production_complete' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if coalesce(p_actual_output_quantity,0)<=0 then raise exception 'OFFLINE_FOOD_PRODUCTION_OUTPUT_INVALID';end if;
 if not exists(select 1 from public.food_production_batches where id=p_production_batch_id) then raise exception 'OFFLINE_FOOD_PRODUCTION_BATCH_DEPENDENCY_UNRESOLVED';end if;
 -- Accepted Action V2 + canonical complete freeze effective input evidence and guard every tracked input/output before the first write.
 v_id:=public.food_production_batch_complete_action_v2(p_production_batch_id,p_actual_output_quantity,p_consumptions,v_tx,p_notes);
 v_result:=jsonb_build_object('ok',true,'production_batch_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_production_complete',v_d,v_id,v_result);return v_result;
end;$$;
revoke all on function public.offline_food_production_batch_start_action_v2(bigint,bigint,numeric,text,text,text,text) from public,anon;
revoke all on function public.offline_food_production_batch_complete_action_v2(bigint,numeric,jsonb,text,text,text) from public,anon;
grant execute on function public.offline_food_production_batch_start_action_v2(bigint,bigint,numeric,text,text,text,text) to authenticated;
grant execute on function public.offline_food_production_batch_complete_action_v2(bigint,numeric,jsonb,text,text,text) to authenticated;
