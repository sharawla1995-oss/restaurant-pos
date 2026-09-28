-- SOURCE ONLY. Do not deploy without explicit authorization.
-- Offline V2 transfer receive/cancel action owners. Replay identity is separate from the transfer entity id.
create or replace function public.offline_food_stock_transfer_receive_v1(p_transfer_id bigint,p_client_tx_id text,p_payload_digest text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_TRANSFER_ACTION_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-transfer-receive:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then if r.operation_type<>'food_transfer_receive' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if not exists(select 1 from public.stock_transfers where id=p_transfer_id) then raise exception 'OFFLINE_FOOD_TRANSFER_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_stock_transfer_receive_v1(p_transfer_id);
 v_result:=jsonb_build_object('ok',true,'transfer_id',v_id,'client_tx_id',v_tx,'action','received','idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_transfer_receive',v_d,v_id,v_result);return v_result;
end;$$;
create or replace function public.offline_food_stock_transfer_cancel_v1(p_transfer_id bigint,p_reason text,p_client_tx_id text,p_payload_digest text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_TRANSFER_ACTION_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-transfer-cancel:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then if r.operation_type<>'food_transfer_cancel' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if not exists(select 1 from public.stock_transfers where id=p_transfer_id) then raise exception 'OFFLINE_FOOD_TRANSFER_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_stock_transfer_cancel_v1(p_transfer_id,p_reason);
 v_result:=jsonb_build_object('ok',true,'transfer_id',v_id,'client_tx_id',v_tx,'action','cancelled','idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_transfer_cancel',v_d,v_id,v_result);return v_result;
end;$$;
revoke all on function public.offline_food_stock_transfer_receive_v1(bigint,text,text) from public,anon;
revoke all on function public.offline_food_stock_transfer_cancel_v1(bigint,text,text,text) from public,anon;
grant execute on function public.offline_food_stock_transfer_receive_v1(bigint,text,text) to authenticated;
grant execute on function public.offline_food_stock_transfer_cancel_v1(bigint,text,text,text) to authenticated;
