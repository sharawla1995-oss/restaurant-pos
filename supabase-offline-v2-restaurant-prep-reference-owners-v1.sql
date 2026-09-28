-- SOURCE ONLY. Do not deploy without explicit authorization.
-- Restaurant Offline V2 Prep reference owners.
create or replace function public.offline_food_prep_item_save_v1(
 p_prep_item_id bigint,p_name text,p_output_ingredient_id bigint,p_base_unit_code text,p_default_batch_quantity numeric,p_shelf_life_minutes integer,p_notes text,p_active boolean,p_client_tx_id text,p_payload_digest text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_output bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_PREP_ITEM_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then if r.operation_type<>'prep_item_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if p_prep_item_id is not null and not exists(select 1 from public.food_prep_items where id=p_prep_item_id) then raise exception 'OFFLINE_PREP_ITEM_DEPENDENCY_UNRESOLVED';end if;
 if p_output_ingredient_id is not null and not exists(select 1 from public.ingredients where id=p_output_ingredient_id) then raise exception 'OFFLINE_PREP_OUTPUT_INGREDIENT_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_prep_item_save_v1(p_prep_item_id,p_name,p_output_ingredient_id,p_base_unit_code,p_default_batch_quantity,p_shelf_life_minutes,p_notes,p_active);
 select output_ingredient_id into v_output from public.food_prep_items where id=v_id;if v_output is null then raise exception 'OFFLINE_PREP_OUTPUT_INGREDIENT_RESULT_MISSING';end if;
 v_result:=jsonb_build_object('ok',true,'prep_item_id',v_id,'output_ingredient_id',v_output,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'prep_item_save',v_d,v_id,v_result);return v_result;
end;$$;

create or replace function public.offline_food_prep_recipe_save_draft_v1(
 p_prep_item_id bigint,p_output_quantity numeric,p_output_unit_code text,p_lines jsonb,p_notes text,p_client_tx_id text,p_payload_digest text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_PREP_RECIPE_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then if r.operation_type<>'prep_recipe_draft_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if not exists(select 1 from public.food_prep_items where id=p_prep_item_id) then raise exception 'OFFLINE_PREP_RECIPE_ITEM_DEPENDENCY_UNRESOLVED';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) x where nullif(x->>'ingredient_id','') is null or not exists(select 1 from public.ingredients i where i.id=(x->>'ingredient_id')::bigint)) then raise exception 'OFFLINE_PREP_RECIPE_INGREDIENT_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_prep_recipe_save_draft_v1(p_prep_item_id,p_output_quantity,p_output_unit_code,p_lines,p_notes);
 v_result:=jsonb_build_object('ok',true,'recipe_version_id',v_id,'prep_item_id',p_prep_item_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'prep_recipe_draft_save',v_d,v_id,v_result);return v_result;
end;$$;
