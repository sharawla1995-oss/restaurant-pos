-- SOURCE ONLY. Do not deploy without explicit authorization.
-- Restaurant Offline V2 ingredient purchase-order lifecycle owners.
-- Receiving and supplier returns are intentionally excluded: they change stock.

create or replace function public.offline_food_purchase_order_create_v1(
 p_branch_id bigint,p_supplier_id bigint,p_invoice_number text,p_notes text,p_items jsonb,p_client_tx_id text,p_payload_digest text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_PO_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-po:'||v_tx,0));
 select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then if r.operation_type<>'food_po_create' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if not exists(select 1 from public.suppliers where id=p_supplier_id and active is distinct from false) then raise exception 'OFFLINE_FOOD_PO_SUPPLIER_DEPENDENCY_UNRESOLVED';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x where nullif(x->>'ingredient_id','') is null or not exists(select 1 from public.ingredients i where i.id=(x->>'ingredient_id')::bigint)) then raise exception 'OFFLINE_FOOD_PO_INGREDIENT_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_purchase_order_create_v1(p_branch_id,p_supplier_id,p_invoice_number,p_notes,p_items,v_tx);
 v_result:=jsonb_build_object('ok',true,'purchase_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_po_create',v_d,v_id,v_result);
 return v_result;
end;$$;

create or replace function public.offline_food_purchase_order_approve_v1(
 p_purchase_id bigint,p_client_tx_id text,p_payload_digest text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_PO_APPROVE_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-po:'||v_tx,0));
 select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then if r.operation_type<>'food_po_approve' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if not exists(select 1 from public.purchases where id=p_purchase_id) then raise exception 'OFFLINE_FOOD_PO_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_purchase_order_approve_v1(p_purchase_id);
 v_result:=jsonb_build_object('ok',true,'purchase_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_po_approve',v_d,v_id,v_result);
 return v_result;
end;$$;

create or replace function public.offline_food_purchase_order_cancel_v1(
 p_purchase_id bigint,p_reason text,p_client_tx_id text,p_payload_digest text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_PO_CANCEL_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-po:'||v_tx,0));
 select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then if r.operation_type<>'food_po_cancel' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if not exists(select 1 from public.purchases where id=p_purchase_id) then raise exception 'OFFLINE_FOOD_PO_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_purchase_order_cancel_v1(p_purchase_id,p_reason);
 v_result:=jsonb_build_object('ok',true,'purchase_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_po_cancel',v_d,v_id,v_result);
 return v_result;
end;$$;

revoke all on function public.offline_food_purchase_order_create_v1(bigint,bigint,text,text,jsonb,text,text) from public,anon;
grant execute on function public.offline_food_purchase_order_create_v1(bigint,bigint,text,text,jsonb,text,text) to authenticated;
revoke all on function public.offline_food_purchase_order_approve_v1(bigint,text,text) from public,anon;
grant execute on function public.offline_food_purchase_order_approve_v1(bigint,text,text) to authenticated;
revoke all on function public.offline_food_purchase_order_cancel_v1(bigint,text,text,text) from public,anon;
grant execute on function public.offline_food_purchase_order_cancel_v1(bigint,text,text,text) to authenticated;
