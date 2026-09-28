-- SOURCE ONLY. Do not deploy without explicit authorization.
-- Offline V2 stock-changing purchase receipt owner.
-- The local client MUST NOT mutate authoritative ingredient_stock. The guarded canonical
-- food_purchase_receive_v1 remains the only stock writer at server replay time.

create or replace function public.offline_food_purchase_receive_v1(
 p_purchase_id bigint,p_items jsonb,p_client_tx_id text,p_payload_digest text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_RECEIVE_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-receive:'||v_tx,0));
 select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then
   if r.operation_type<>'food_purchase_receive' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;
   return r.result_json||jsonb_build_object('idempotent_replay',true);
 end if;
 if not exists(select 1 from public.purchases p where p.id=p_purchase_id and p.status in('approved','partially_received')) then raise exception 'OFFLINE_FOOD_RECEIVE_PURCHASE_DEPENDENCY_UNRESOLVED';end if;
 if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'OFFLINE_FOOD_RECEIVE_ITEMS_REQUIRED';end if;
 if exists(
   select 1 from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
   where nullif(x->>'purchase_item_id','') is null
      or not exists(select 1 from public.purchase_items pi where pi.id=(x->>'purchase_item_id')::bigint and pi.purchase_id=p_purchase_id)
 ) then raise exception 'OFFLINE_FOOD_RECEIVE_LINE_DEPENDENCY_UNRESOLVED';end if;
 -- Canonical function is the accepted Point-4 guarded stock writer. Its guard executes
 -- over the complete affected ingredient set before the receipt document is inserted.
 v_id:=public.food_purchase_receive_v1(p_purchase_id,p_items,v_tx);
 v_result:=jsonb_build_object('ok',true,'receipt_id',v_id,'purchase_id',p_purchase_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json)
 values(v_tx,'food_purchase_receive',v_d,v_id,v_result);
 return v_result;
end;$$;

revoke all on function public.offline_food_purchase_receive_v1(bigint,jsonb,text,text) from public,anon;
grant execute on function public.offline_food_purchase_receive_v1(bigint,jsonb,text,text) to authenticated;
