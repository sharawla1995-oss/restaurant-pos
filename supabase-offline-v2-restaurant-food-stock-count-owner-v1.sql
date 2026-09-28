-- SOURCE ONLY. Do not deploy without explicit authorization.
-- Offline V2 stock count owner. Pending local counts are evidence only; authoritative ingredient_stock changes only in the canonical server function.
create or replace function public.offline_food_stock_count_post_v1(p_branch_id bigint,p_notes text,p_items jsonb,p_client_tx_id text,p_payload_digest text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_STOCK_COUNT_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-stock-count:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then if r.operation_type<>'food_stock_count' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'OFFLINE_FOOD_STOCK_COUNT_ITEMS_REQUIRED';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x where nullif(x->>'ingredient_id','') is null or not exists(select 1 from public.ingredients i where i.id=(x->>'ingredient_id')::bigint and i.active is distinct from false and i.track_inventory=true)) then raise exception 'OFFLINE_FOOD_STOCK_COUNT_INGREDIENT_DEPENDENCY_UNRESOLVED';end if;
 -- Canonical Point-4 function validates the complete count and guards every affected ingredient before the header insert.
 v_id:=public.food_stock_count_post_v1(p_branch_id,p_notes,p_items,v_tx);
 v_result:=jsonb_build_object('ok',true,'stock_count_id',v_id,'branch_id',p_branch_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_stock_count',v_d,v_id,v_result);return v_result;
end;$$;
revoke all on function public.offline_food_stock_count_post_v1(bigint,text,jsonb,text,text) from public,anon;
grant execute on function public.offline_food_stock_count_post_v1(bigint,text,jsonb,text,text) to authenticated;
