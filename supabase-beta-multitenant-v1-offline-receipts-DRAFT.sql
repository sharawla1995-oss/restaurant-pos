-- Sharawla POS — Beta Multi-Tenant V1 Offline receipt RPC hardening
-- SOURCE PREPARATION ONLY.
-- Generated from the live Beta definitions. No TX/payload/digest semantics are changed.
-- Receipt READ identity becomes (current_business_id(), client_tx_id).
-- Receipt INSERT business_id is supplied by mt1_business_write_guard before write.

begin;

do $guard$
begin
  if current_setting('sharawla.multitenant_apply', true) is distinct from 'beta-only-approved' then
    raise exception 'MULTITENANT_V1_SOURCE_ONLY: explicit Beta apply guard is not set';
  end if;
end
$guard$;

-- offline_customer_address_delete_v1(p_address_id bigint, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_customer_address_delete_v1(p_address_id bigint, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');
 r public.offline_customer_delivery_receipts_v1%rowtype;v_ok boolean;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_CUSTOMER_IDENTITY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-customer:'||v_tx,0));
 select * into r from public.offline_customer_delivery_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then
  if r.operation_type<>'customer_address_delete' or r.payload_digest<>v_d then raise exception 'OFFLINE_CUSTOMER_REPLAY_MISMATCH'; end if;
  return r.result_json||jsonb_build_object('idempotent_replay',true);
 end if;
 v_ok:=public.customer_address_delete_v2(p_address_id);
 v_result:=jsonb_build_object('ok',coalesce(v_ok,false),'address_id',p_address_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_customer_delivery_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json)
 values(v_tx,'customer_address_delete',v_d,p_address_id,v_result);
 return v_result;
end;$function$


-- offline_customer_address_save_v1(p_address_id bigint, p_customer_id bigint, p_label text, p_area text, p_address text, p_notes text, p_is_default boolean, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_customer_address_save_v1(p_address_id bigint, p_customer_id bigint, p_label text, p_area text, p_address text, p_notes text, p_is_default boolean, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');
 r public.offline_customer_delivery_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_CUSTOMER_IDENTITY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-customer:'||v_tx,0));
 select * into r from public.offline_customer_delivery_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then
  if r.operation_type<>'customer_address_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_CUSTOMER_REPLAY_MISMATCH'; end if;
  return r.result_json||jsonb_build_object('idempotent_replay',true);
 end if;
 v_id:=public.customer_address_save_v2(p_address_id,p_customer_id,p_label,p_area,p_address,p_notes,p_is_default);
 v_result:=jsonb_build_object('ok',true,'address_id',v_id,'customer_id',p_customer_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_customer_delivery_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json)
 values(v_tx,'customer_address_save',v_d,v_id,v_result);
 return v_result;
end;$function$


-- offline_customer_create_v1(p_name text, p_phone text, p_area text, p_address text, p_notes text, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_customer_create_v1(p_name text, p_phone text, p_area text, p_address text, p_notes text, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');
 r public.offline_customer_delivery_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_CUSTOMER_IDENTITY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-customer:'||v_tx,0));
 select * into r from public.offline_customer_delivery_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then
  if r.operation_type<>'customer_create' or r.payload_digest<>v_d then raise exception 'OFFLINE_CUSTOMER_REPLAY_MISMATCH'; end if;
  return r.result_json||jsonb_build_object('idempotent_replay',true);
 end if;
 v_id:=public.customer_create_v2(p_name,p_phone,p_area,p_address,p_notes);
 v_result:=jsonb_build_object('ok',true,'customer_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_customer_delivery_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json)
 values(v_tx,'customer_create',v_d,v_id,v_result);
 return v_result;
end;$function$


-- offline_customer_update_v1(p_customer_id bigint, p_name text, p_phone text, p_area text, p_address text, p_notes text, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_customer_update_v1(p_customer_id bigint, p_name text, p_phone text, p_area text, p_address text, p_notes text, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');
 r public.offline_customer_delivery_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_CUSTOMER_IDENTITY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-customer:'||v_tx,0));
 select * into r from public.offline_customer_delivery_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then
  if r.operation_type<>'customer_update' or r.payload_digest<>v_d then raise exception 'OFFLINE_CUSTOMER_REPLAY_MISMATCH'; end if;
  return r.result_json||jsonb_build_object('idempotent_replay',true);
 end if;
 v_id:=public.customer_update_v2(p_customer_id,p_name,p_phone,p_area,p_address,p_notes);
 v_result:=jsonb_build_object('ok',true,'customer_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_customer_delivery_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json)
 values(v_tx,'customer_update',v_d,v_id,v_result);
 return v_result;
end;$function$


-- offline_delivery_assign_driver_v1(p_order_id bigint, p_driver_id bigint, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_delivery_assign_driver_v1(p_order_id bigint, p_driver_id bigint, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');
 r public.offline_customer_delivery_receipts_v1%rowtype;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_DRIVER_ASSIGN_IDENTITY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-driver:'||v_tx,0));
 select * into r from public.offline_customer_delivery_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then
  if r.operation_type<>'delivery_assign_driver' or r.payload_digest<>v_d then raise exception 'OFFLINE_DRIVER_ASSIGN_REPLAY_MISMATCH'; end if;
  return r.result_json||jsonb_build_object('idempotent_replay',true);
 end if;
 v_result:=coalesce(public.order_assign_driver_v2(p_order_id,p_driver_id),'{}'::jsonb)
   ||jsonb_build_object('client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_customer_delivery_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json)
 values(v_tx,'delivery_assign_driver',v_d,p_order_id,v_result);
 return v_result;
end;$function$


-- offline_delivery_driver_save_v1(p_driver_id bigint, p_branch_id bigint, p_name text, p_phone text, p_active boolean, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_delivery_driver_save_v1(p_driver_id bigint, p_branch_id bigint, p_name text, p_phone text, p_active boolean, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_DRIVER_IDENTITY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));
 select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'driver_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH'; end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 v_id:=public.delivery_driver_save_v2(p_driver_id,p_branch_id,p_name,p_phone,p_active);
 if v_id is null then raise exception 'OFFLINE_DRIVER_RESULT_MISSING'; end if;
 v_result:=jsonb_build_object('ok',true,'driver_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'driver_save',v_d,v_id,v_result);
 return v_result;
end;$function$


-- offline_delivery_zone_save_v1(p_zone_id bigint, p_branch_id bigint, p_name text, p_delivery_fee numeric, p_active boolean, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_delivery_zone_save_v1(p_zone_id bigint, p_branch_id bigint, p_name text, p_delivery_fee numeric, p_active boolean, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_ZONE_IDENTITY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));
 select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'zone_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH'; end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 v_id:=public.delivery_zone_save_v2(p_zone_id,p_branch_id,p_name,p_delivery_fee,p_active);
 if v_id is null then raise exception 'OFFLINE_ZONE_RESULT_MISSING'; end if;
 v_result:=jsonb_build_object('ok',true,'zone_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'zone_save',v_d,v_id,v_result);
 return v_result;
end;$function$


-- offline_food_ingredient_conversion_save_action_v2(p_ingredient_id bigint, p_from_unit_code text, p_to_unit_code text, p_factor numeric, p_active boolean, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_ingredient_conversion_save_action_v2(p_ingredient_id bigint, p_from_unit_code text, p_to_unit_code text, p_factor numeric, p_active boolean, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_CONVERSION_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-ingredient-conversion:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'food_ingredient_conversion_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if not exists(select 1 from public.ingredients where id=p_ingredient_id) then raise exception 'OFFLINE_FOOD_CONVERSION_INGREDIENT_DEPENDENCY_UNRESOLVED';end if;
 if coalesce(p_factor,0)<=0 then raise exception 'OFFLINE_FOOD_CONVERSION_FACTOR_INVALID';end if;
 v_id:=public.food_ingredient_conversion_save_action_v2(p_ingredient_id,p_from_unit_code,p_to_unit_code,p_factor,p_active);
 v_result:=jsonb_build_object('ok',true,'conversion_id',v_id,'ingredient_id',p_ingredient_id,'client_tx_id',v_tx,'idempotent_replay',false);insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_ingredient_conversion_save',v_d,v_id,v_result);return v_result;end;$function$


-- offline_food_ingredient_conversion_save_v1(p_ingredient_id bigint, p_ingredient_create_tx text, p_from_unit_code text, p_to_unit_code text, p_factor numeric, p_active boolean, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_ingredient_conversion_save_v1(p_ingredient_id bigint, p_ingredient_create_tx text, p_from_unit_code text, p_to_unit_code text, p_factor numeric, p_active boolean, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');v_ingredient bigint:=p_ingredient_id;r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_INGREDIENT_CONVERSION_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'ingredient_conversion_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if v_ingredient is null and nullif(trim(coalesce(p_ingredient_create_tx,'')),'') is not null then select entity_id into v_ingredient from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=trim(p_ingredient_create_tx) and operation_type='ingredient_save';end if;
 if v_ingredient is null then raise exception 'OFFLINE_INGREDIENT_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_ingredient_conversion_save_v1(v_ingredient,p_from_unit_code,p_to_unit_code,p_factor,p_active);if v_id is null then raise exception 'OFFLINE_INGREDIENT_CONVERSION_RESULT_MISSING';end if;
 v_result:=jsonb_build_object('ok',true,'conversion_id',v_id,'ingredient_id',v_ingredient,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'ingredient_conversion_save',v_d,v_id,v_result);return v_result;
end;$function$


-- offline_food_ingredient_save_action_v2(p_ingredient_id bigint, p_name text, p_base_unit_code text, p_purchase_unit_code text, p_sku text, p_barcode text, p_cost_per_base_unit numeric, p_minimum_quantity numeric, p_track_inventory boolean, p_usable_yield_percent numeric, p_shelf_life_minutes integer, p_active boolean, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_ingredient_save_action_v2(p_ingredient_id bigint, p_name text, p_base_unit_code text, p_purchase_unit_code text, p_sku text, p_barcode text, p_cost_per_base_unit numeric, p_minimum_quantity numeric, p_track_inventory boolean, p_usable_yield_percent numeric, p_shelf_life_minutes integer, p_active boolean, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_INGREDIENT_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-ingredient-save:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'food_ingredient_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if p_ingredient_id is not null and not exists(select 1 from public.ingredients where id=p_ingredient_id) then raise exception 'OFFLINE_FOOD_INGREDIENT_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_ingredient_save_action_v2(p_ingredient_id,p_name,p_base_unit_code,p_purchase_unit_code,p_sku,p_barcode,p_cost_per_base_unit,p_minimum_quantity,p_track_inventory,p_usable_yield_percent,p_shelf_life_minutes,p_active);
 v_result:=jsonb_build_object('ok',true,'ingredient_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_ingredient_save',v_d,v_id,v_result);return v_result;end;$function$


-- offline_food_ingredient_save_v1(p_ingredient_id bigint, p_name text, p_base_unit_code text, p_purchase_unit_code text, p_sku text, p_barcode text, p_cost_per_base_unit numeric, p_minimum_quantity numeric, p_track_inventory boolean, p_usable_yield_percent numeric, p_shelf_life_minutes integer, p_active boolean, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_ingredient_save_v1(p_ingredient_id bigint, p_name text, p_base_unit_code text, p_purchase_unit_code text, p_sku text, p_barcode text, p_cost_per_base_unit numeric, p_minimum_quantity numeric, p_track_inventory boolean, p_usable_yield_percent numeric, p_shelf_life_minutes integer, p_active boolean, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_INGREDIENT_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'ingredient_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 v_id:=public.food_ingredient_save_v1(p_ingredient_id,p_name,p_base_unit_code,p_purchase_unit_code,p_sku,p_barcode,p_cost_per_base_unit,p_minimum_quantity,p_track_inventory,p_usable_yield_percent,p_shelf_life_minutes,p_active);
 if v_id is null then raise exception 'OFFLINE_INGREDIENT_RESULT_MISSING';end if;
 v_result:=jsonb_build_object('ok',true,'ingredient_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'ingredient_save',v_d,v_id,v_result);return v_result;
end;$function$


-- offline_food_ingredient_stock_adjust_action_v2(p_branch_id bigint, p_ingredient_id bigint, p_quantity_delta numeric, p_unit_cost numeric, p_reason text, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_ingredient_stock_adjust_action_v2(p_branch_id bigint, p_ingredient_id bigint, p_quantity_delta numeric, p_unit_cost numeric, p_reason text, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_ADJUSTMENT_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-ingredient-adjust:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'food_ingredient_stock_adjust' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if coalesce(p_quantity_delta,0)=0 then raise exception 'OFFLINE_FOOD_ADJUSTMENT_DELTA_REQUIRED';end if;
 if coalesce(p_unit_cost,0)<0 then raise exception 'OFFLINE_FOOD_ADJUSTMENT_COST_INVALID';end if;
 if not exists(select 1 from public.ingredients i where i.id=p_ingredient_id and i.active is distinct from false and i.track_inventory=true) then raise exception 'OFFLINE_FOOD_ADJUSTMENT_INGREDIENT_DEPENDENCY_UNRESOLVED';end if;
 -- Accepted Action V2 owns permission, branch access, client_tx idempotency and the Point-4 legacy-write guard.
 v_id:=public.food_ingredient_stock_adjust_action_v2(p_branch_id,p_ingredient_id,p_quantity_delta,p_unit_cost,p_reason,v_tx);
 v_result:=jsonb_build_object('ok',true,'adjustment_id',v_id,'branch_id',p_branch_id,'ingredient_id',p_ingredient_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_ingredient_stock_adjust',v_d,v_id,v_result);return v_result;
end;$function$


-- offline_food_prep_item_save_action_v2(p_prep_item_id bigint, p_name text, p_output_ingredient_id bigint, p_base_unit_code text, p_default_batch_quantity numeric, p_shelf_life_minutes integer, p_notes text, p_active boolean, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_prep_item_save_action_v2(p_prep_item_id bigint, p_name text, p_output_ingredient_id bigint, p_base_unit_code text, p_default_batch_quantity numeric, p_shelf_life_minutes integer, p_notes text, p_active boolean, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_out bigint;v_result jsonb;
begin if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_PREP_IDENTITY_REQUIRED';end if;perform pg_advisory_xact_lock(hashtextextended('offline-food-prep-item:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'food_prep_item_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if p_prep_item_id is not null and not exists(select 1 from public.food_prep_items where id=p_prep_item_id) then raise exception 'OFFLINE_FOOD_PREP_ITEM_DEPENDENCY_UNRESOLVED';end if;
 if p_output_ingredient_id is not null and not exists(select 1 from public.ingredients where id=p_output_ingredient_id) then raise exception 'OFFLINE_FOOD_PREP_OUTPUT_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_prep_item_save_action_v2(p_prep_item_id,p_name,p_output_ingredient_id,p_base_unit_code,p_default_batch_quantity,p_shelf_life_minutes,p_notes,p_active);select output_ingredient_id into v_out from public.food_prep_items where id=v_id;
 v_result:=jsonb_build_object('ok',true,'prep_item_id',v_id,'output_ingredient_id',v_out,'client_tx_id',v_tx,'idempotent_replay',false);insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_prep_item_save',v_d,v_id,v_result);return v_result;end;$function$


-- offline_food_prep_item_save_v1(p_prep_item_id bigint, p_name text, p_output_ingredient_id bigint, p_base_unit_code text, p_default_batch_quantity numeric, p_shelf_life_minutes integer, p_notes text, p_active boolean, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_prep_item_save_v1(p_prep_item_id bigint, p_name text, p_output_ingredient_id bigint, p_base_unit_code text, p_default_batch_quantity numeric, p_shelf_life_minutes integer, p_notes text, p_active boolean, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_output bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_PREP_ITEM_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'prep_item_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if p_prep_item_id is not null and not exists(select 1 from public.food_prep_items where id=p_prep_item_id) then raise exception 'OFFLINE_PREP_ITEM_DEPENDENCY_UNRESOLVED';end if;
 if p_output_ingredient_id is not null and not exists(select 1 from public.ingredients where id=p_output_ingredient_id) then raise exception 'OFFLINE_PREP_OUTPUT_INGREDIENT_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_prep_item_save_v1(p_prep_item_id,p_name,p_output_ingredient_id,p_base_unit_code,p_default_batch_quantity,p_shelf_life_minutes,p_notes,p_active);
 select output_ingredient_id into v_output from public.food_prep_items where id=v_id;if v_output is null then raise exception 'OFFLINE_PREP_OUTPUT_INGREDIENT_RESULT_MISSING';end if;
 v_result:=jsonb_build_object('ok',true,'prep_item_id',v_id,'output_ingredient_id',v_output,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'prep_item_save',v_d,v_id,v_result);return v_result;
end;$function$


-- offline_food_prep_recipe_save_draft_action_v2(p_prep_item_id bigint, p_output_quantity numeric, p_output_unit_code text, p_lines jsonb, p_notes text, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_prep_recipe_save_draft_action_v2(p_prep_item_id bigint, p_output_quantity numeric, p_output_unit_code text, p_lines jsonb, p_notes text, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_recipe bigint;v_result jsonb;
begin if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_PREP_RECIPE_IDENTITY_REQUIRED';end if;perform pg_advisory_xact_lock(hashtextextended('offline-food-prep-recipe:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'food_prep_recipe_save_draft' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if not exists(select 1 from public.food_prep_items where id=p_prep_item_id and active is distinct from false) then raise exception 'OFFLINE_FOOD_PREP_ITEM_DEPENDENCY_UNRESOLVED';end if;
 if exists(select 1 from jsonb_to_recordset(coalesce(p_lines,'[]'::jsonb)) x(ingredient_id bigint) left join public.ingredients i on i.id=x.ingredient_id where i.id is null) then raise exception 'OFFLINE_FOOD_PREP_INGREDIENT_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_prep_recipe_save_draft_action_v2(p_prep_item_id,p_output_quantity,p_output_unit_code,p_lines,p_notes);select recipe_id into v_recipe from public.food_recipe_versions where id=v_id;
 v_result:=jsonb_build_object('ok',true,'recipe_version_id',v_id,'recipe_id',v_recipe,'prep_item_id',p_prep_item_id,'client_tx_id',v_tx,'idempotent_replay',false);insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_prep_recipe_save_draft',v_d,v_id,v_result);return v_result;end;$function$


-- offline_food_prep_recipe_save_draft_v1(p_prep_item_id bigint, p_output_quantity numeric, p_output_unit_code text, p_lines jsonb, p_notes text, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_prep_recipe_save_draft_v1(p_prep_item_id bigint, p_output_quantity numeric, p_output_unit_code text, p_lines jsonb, p_notes text, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_PREP_RECIPE_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'prep_recipe_draft_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if not exists(select 1 from public.food_prep_items where id=p_prep_item_id) then raise exception 'OFFLINE_PREP_RECIPE_ITEM_DEPENDENCY_UNRESOLVED';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) x where nullif(x->>'ingredient_id','') is null or not exists(select 1 from public.ingredients i where i.id=(x->>'ingredient_id')::bigint)) then raise exception 'OFFLINE_PREP_RECIPE_INGREDIENT_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_prep_recipe_save_draft_v1(p_prep_item_id,p_output_quantity,p_output_unit_code,p_lines,p_notes);
 v_result:=jsonb_build_object('ok',true,'recipe_version_id',v_id,'prep_item_id',p_prep_item_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'prep_recipe_draft_save',v_d,v_id,v_result);return v_result;
end;$function$


-- offline_food_production_batch_complete_action_v2(p_production_batch_id bigint, p_actual_output_quantity numeric, p_consumptions jsonb, p_client_tx_id text, p_notes text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_production_batch_complete_action_v2(p_production_batch_id bigint, p_actual_output_quantity numeric, p_consumptions jsonb, p_client_tx_id text, p_notes text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_PRODUCTION_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-production-complete:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'food_production_complete' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if coalesce(p_actual_output_quantity,0)<=0 then raise exception 'OFFLINE_FOOD_PRODUCTION_OUTPUT_INVALID';end if;
 if not exists(select 1 from public.food_production_batches where id=p_production_batch_id) then raise exception 'OFFLINE_FOOD_PRODUCTION_BATCH_DEPENDENCY_UNRESOLVED';end if;
 -- Accepted Action V2 + canonical complete freeze effective input evidence and guard every tracked input/output before the first write.
 v_id:=public.food_production_batch_complete_action_v2(p_production_batch_id,p_actual_output_quantity,p_consumptions,v_tx,p_notes);
 v_result:=jsonb_build_object('ok',true,'production_batch_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_production_complete',v_d,v_id,v_result);return v_result;
end;$function$


-- offline_food_production_batch_start_action_v2(p_branch_id bigint, p_prep_item_id bigint, p_planned_output_quantity numeric, p_batch_number text, p_notes text, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_production_batch_start_action_v2(p_branch_id bigint, p_prep_item_id bigint, p_planned_output_quantity numeric, p_batch_number text, p_notes text, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_PRODUCTION_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-production-start:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'food_production_start' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if coalesce(p_planned_output_quantity,0)<=0 then raise exception 'OFFLINE_FOOD_PRODUCTION_OUTPUT_INVALID';end if;
 if not exists(select 1 from public.food_prep_items where id=p_prep_item_id and active is distinct from false) then raise exception 'OFFLINE_FOOD_PRODUCTION_PREP_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_production_batch_start_action_v2(p_branch_id,p_prep_item_id,p_planned_output_quantity,p_batch_number,p_notes,v_tx);
 v_result:=jsonb_build_object('ok',true,'production_batch_id',v_id,'branch_id',p_branch_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_production_start',v_d,v_id,v_result);return v_result;
end;$function$


-- offline_food_purchase_order_approve_v1(p_purchase_id bigint, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_purchase_order_approve_v1(p_purchase_id bigint, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_PO_APPROVE_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-po:'||v_tx,0));
 select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'food_po_approve' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if not exists(select 1 from public.purchases where id=p_purchase_id) then raise exception 'OFFLINE_FOOD_PO_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_purchase_order_approve_v1(p_purchase_id);
 v_result:=jsonb_build_object('ok',true,'purchase_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_po_approve',v_d,v_id,v_result);
 return v_result;
end;$function$


-- offline_food_purchase_order_cancel_v1(p_purchase_id bigint, p_reason text, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_purchase_order_cancel_v1(p_purchase_id bigint, p_reason text, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_PO_CANCEL_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-po:'||v_tx,0));
 select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'food_po_cancel' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if not exists(select 1 from public.purchases where id=p_purchase_id) then raise exception 'OFFLINE_FOOD_PO_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_purchase_order_cancel_v1(p_purchase_id,p_reason);
 v_result:=jsonb_build_object('ok',true,'purchase_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_po_cancel',v_d,v_id,v_result);
 return v_result;
end;$function$


-- offline_food_purchase_order_create_v1(p_branch_id bigint, p_supplier_id bigint, p_invoice_number text, p_notes text, p_items jsonb, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_purchase_order_create_v1(p_branch_id bigint, p_supplier_id bigint, p_invoice_number text, p_notes text, p_items jsonb, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_PO_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-po:'||v_tx,0));
 select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'food_po_create' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if not exists(select 1 from public.suppliers where id=p_supplier_id and active is distinct from false) then raise exception 'OFFLINE_FOOD_PO_SUPPLIER_DEPENDENCY_UNRESOLVED';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x where nullif(x->>'ingredient_id','') is null or not exists(select 1 from public.ingredients i where i.id=(x->>'ingredient_id')::bigint)) then raise exception 'OFFLINE_FOOD_PO_INGREDIENT_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_purchase_order_create_v1(p_branch_id,p_supplier_id,p_invoice_number,p_notes,p_items,v_tx);
 v_result:=jsonb_build_object('ok',true,'purchase_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_po_create',v_d,v_id,v_result);
 return v_result;
end;$function$


-- offline_food_purchase_receive_v1(p_purchase_id bigint, p_items jsonb, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_purchase_receive_v1(p_purchase_id bigint, p_items jsonb, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_RECEIVE_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-receive:'||v_tx,0));
 select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
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
end;$function$


-- offline_food_recipe_activate_version_action_v2(p_recipe_version_id bigint, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_recipe_activate_version_action_v2(p_recipe_version_id bigint, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_RECIPE_IDENTITY_REQUIRED';end if;perform pg_advisory_xact_lock(hashtextextended('offline-food-recipe-activate:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'food_recipe_activate' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if not exists(select 1 from public.food_recipe_versions where id=p_recipe_version_id) then raise exception 'OFFLINE_FOOD_RECIPE_VERSION_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_recipe_activate_version_action_v2(p_recipe_version_id);v_result:=jsonb_build_object('ok',true,'recipe_version_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_recipe_activate',v_d,v_id,v_result);return v_result;end;$function$


-- offline_food_recipe_activate_version_v1(p_recipe_version_id bigint, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_recipe_activate_version_v1(p_recipe_version_id bigint, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_RECIPE_ACTIVATE_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'recipe_version_activate' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if p_recipe_version_id is null or not exists(select 1 from public.food_recipe_versions where id=p_recipe_version_id) then raise exception 'OFFLINE_RECIPE_VERSION_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_recipe_activate_version_v1(p_recipe_version_id);if v_id is null then raise exception 'OFFLINE_RECIPE_ACTIVATE_RESULT_MISSING';end if;
 v_result:=jsonb_build_object('ok',true,'recipe_version_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'recipe_version_activate',v_d,v_id,v_result);return v_result;
end;$function$


-- offline_food_recipe_save_draft_action_v2(p_product_id bigint, p_variant_id bigint, p_name text, p_output_quantity numeric, p_output_unit_code text, p_lines jsonb, p_modifier_impacts jsonb, p_removal_mappings jsonb, p_notes text, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_recipe_save_draft_action_v2(p_product_id bigint, p_variant_id bigint, p_name text, p_output_quantity numeric, p_output_unit_code text, p_lines jsonb, p_modifier_impacts jsonb, p_removal_mappings jsonb, p_notes text, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_recipe bigint;v_result jsonb;
begin if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_RECIPE_IDENTITY_REQUIRED';end if;perform pg_advisory_xact_lock(hashtextextended('offline-food-recipe-draft:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'food_recipe_save_draft' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if not exists(select 1 from public.products where id=p_product_id and active is distinct from false) then raise exception 'OFFLINE_FOOD_RECIPE_PRODUCT_DEPENDENCY_UNRESOLVED';end if;
 if p_variant_id is not null and not exists(select 1 from public.product_variants where id=p_variant_id and product_id=p_product_id and active=true) then raise exception 'OFFLINE_FOOD_RECIPE_VARIANT_DEPENDENCY_UNRESOLVED';end if;
 if exists(select 1 from jsonb_to_recordset(coalesce(p_lines,'[]'::jsonb)) x(ingredient_id bigint) left join public.ingredients i on i.id=x.ingredient_id where i.id is null) then raise exception 'OFFLINE_FOOD_RECIPE_INGREDIENT_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_recipe_save_draft_action_v2(p_product_id,p_variant_id,p_name,p_output_quantity,p_output_unit_code,p_lines,p_modifier_impacts,p_removal_mappings,p_notes);select recipe_id into v_recipe from public.food_recipe_versions where id=v_id;
 v_result:=jsonb_build_object('ok',true,'recipe_version_id',v_id,'recipe_id',v_recipe,'client_tx_id',v_tx,'idempotent_replay',false);insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_recipe_save_draft',v_d,v_id,v_result);return v_result;end;$function$


-- offline_food_recipe_save_draft_v1(p_product_id bigint, p_variant_id bigint, p_name text, p_output_quantity numeric, p_output_unit_code text, p_lines jsonb, p_modifier_impacts jsonb, p_removal_mappings jsonb, p_notes text, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_recipe_save_draft_v1(p_product_id bigint, p_variant_id bigint, p_name text, p_output_quantity numeric, p_output_unit_code text, p_lines jsonb, p_modifier_impacts jsonb, p_removal_mappings jsonb, p_notes text, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;v_ref record;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_RECIPE_DRAFT_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'recipe_draft_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if jsonb_typeof(coalesce(p_lines,'[]'::jsonb))<>'array' then raise exception 'OFFLINE_RECIPE_LINES_INVALID';end if;
 for v_ref in
   select nullif(x->>'ingredient_id','')::bigint ingredient_id from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) x
   union all select nullif(x->>'ingredient_id','')::bigint from jsonb_array_elements(coalesce(p_modifier_impacts,'[]'::jsonb)) x
   union all select nullif(x->>'ingredient_id','')::bigint from jsonb_array_elements(coalesce(p_removal_mappings,'[]'::jsonb)) x
 loop
   if v_ref.ingredient_id is null or not exists(select 1 from public.ingredients i where i.id=v_ref.ingredient_id) then raise exception 'OFFLINE_RECIPE_INGREDIENT_DEPENDENCY_UNRESOLVED';end if;
 end loop;
 v_id:=public.food_recipe_save_draft_v1(p_product_id,p_variant_id,p_name,p_output_quantity,p_output_unit_code,p_lines,p_modifier_impacts,p_removal_mappings,p_notes);
 if v_id is null then raise exception 'OFFLINE_RECIPE_DRAFT_RESULT_MISSING';end if;
 v_result:=jsonb_build_object('ok',true,'recipe_version_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'recipe_draft_save',v_d,v_id,v_result);return v_result;
end;$function$


-- offline_food_stock_count_post_v1(p_branch_id bigint, p_notes text, p_items jsonb, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_stock_count_post_v1(p_branch_id bigint, p_notes text, p_items jsonb, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_STOCK_COUNT_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-stock-count:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'food_stock_count' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'OFFLINE_FOOD_STOCK_COUNT_ITEMS_REQUIRED';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x where nullif(x->>'ingredient_id','') is null or not exists(select 1 from public.ingredients i where i.id=(x->>'ingredient_id')::bigint and i.active is distinct from false and i.track_inventory=true)) then raise exception 'OFFLINE_FOOD_STOCK_COUNT_INGREDIENT_DEPENDENCY_UNRESOLVED';end if;
 -- Canonical Point-4 function validates the complete count and guards every affected ingredient before the header insert.
 v_id:=public.food_stock_count_post_v1(p_branch_id,p_notes,p_items,v_tx);
 v_result:=jsonb_build_object('ok',true,'stock_count_id',v_id,'branch_id',p_branch_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_stock_count',v_d,v_id,v_result);return v_result;
end;$function$


-- offline_food_stock_transfer_cancel_v1(p_transfer_id bigint, p_reason text, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_stock_transfer_cancel_v1(p_transfer_id bigint, p_reason text, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_TRANSFER_ACTION_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-transfer-cancel:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'food_transfer_cancel' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if not exists(select 1 from public.stock_transfers where id=p_transfer_id) then raise exception 'OFFLINE_FOOD_TRANSFER_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_stock_transfer_cancel_v1(p_transfer_id,p_reason);
 v_result:=jsonb_build_object('ok',true,'transfer_id',v_id,'client_tx_id',v_tx,'action','cancelled','idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_transfer_cancel',v_d,v_id,v_result);return v_result;
end;$function$


-- offline_food_stock_transfer_create_v1(p_from_branch_id bigint, p_to_branch_id bigint, p_items jsonb, p_notes text, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_stock_transfer_create_v1(p_from_branch_id bigint, p_to_branch_id bigint, p_items jsonb, p_notes text, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_TRANSFER_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-transfer-create:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'food_transfer_create' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if p_from_branch_id=p_to_branch_id then raise exception 'OFFLINE_FOOD_TRANSFER_BRANCHES_INVALID';end if;if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'OFFLINE_FOOD_TRANSFER_ITEMS_REQUIRED';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x where nullif(x->>'ingredient_id','') is null or not exists(select 1 from public.ingredients i where i.id=(x->>'ingredient_id')::bigint and i.active is distinct from false and i.track_inventory=true)) then raise exception 'OFFLINE_FOOD_TRANSFER_INGREDIENT_DEPENDENCY_UNRESOLVED';end if;
 -- Canonical Point-4 owner validates source sufficiency and guards all affected source ingredients before the transfer header insert.
 v_id:=public.food_stock_transfer_create_v1(p_from_branch_id,p_to_branch_id,p_items,p_notes,v_tx);
 v_result:=jsonb_build_object('ok',true,'transfer_id',v_id,'from_branch_id',p_from_branch_id,'to_branch_id',p_to_branch_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_transfer_create',v_d,v_id,v_result);return v_result;
end;$function$


-- offline_food_stock_transfer_receive_v1(p_transfer_id bigint, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_stock_transfer_receive_v1(p_transfer_id bigint, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_TRANSFER_ACTION_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-transfer-receive:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'food_transfer_receive' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if not exists(select 1 from public.stock_transfers where id=p_transfer_id) then raise exception 'OFFLINE_FOOD_TRANSFER_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_stock_transfer_receive_v1(p_transfer_id);
 v_result:=jsonb_build_object('ok',true,'transfer_id',v_id,'client_tx_id',v_tx,'action','received','idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_transfer_receive',v_d,v_id,v_result);return v_result;
end;$function$


-- offline_food_supplier_return_create_v1(p_branch_id bigint, p_supplier_id bigint, p_notes text, p_items jsonb, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_supplier_return_create_v1(p_branch_id bigint, p_supplier_id bigint, p_notes text, p_items jsonb, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_SUPPLIER_RETURN_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-supplier-return:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'food_supplier_return' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if p_supplier_id is not null and not exists(select 1 from public.suppliers s where s.id=p_supplier_id) then raise exception 'OFFLINE_FOOD_SUPPLIER_RETURN_SUPPLIER_DEPENDENCY_UNRESOLVED';end if;
 if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'OFFLINE_FOOD_SUPPLIER_RETURN_ITEMS_REQUIRED';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x where nullif(x->>'ingredient_id','') is null or not exists(select 1 from public.ingredients i where i.id=(x->>'ingredient_id')::bigint and i.active is distinct from false)) then raise exception 'OFFLINE_FOOD_SUPPLIER_RETURN_INGREDIENT_DEPENDENCY_UNRESOLVED';end if;
 -- Canonical Point-4 function validates conversion, stock sufficiency and all guards before its first document insert.
 v_id:=public.food_supplier_return_create_v1(p_branch_id,p_supplier_id,p_notes,p_items,v_tx);
 v_result:=jsonb_build_object('ok',true,'supplier_return_id',v_id,'branch_id',p_branch_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_supplier_return',v_d,v_id,v_result);return v_result;
end;$function$


-- offline_food_supplier_save_v1(p_supplier_id bigint, p_name text, p_phone text, p_email text, p_tax_no text, p_address text, p_notes text, p_active boolean, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_supplier_save_v1(p_supplier_id bigint, p_name text, p_phone text, p_email text, p_tax_no text, p_address text, p_notes text, p_active boolean, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
 v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
 v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');
 r public.offline_restaurant_reference_receipts_v1%rowtype;
 v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_SUPPLIER_IDENTITY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));
 select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then
  if r.operation_type<>'supplier_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH'; end if;
  return r.result_json||jsonb_build_object('idempotent_replay',true);
 end if;
 v_id:=public.food_supplier_save_v1(p_supplier_id,p_name,p_phone,p_email,p_tax_no,p_address,p_notes,p_active);
 if v_id is null then raise exception 'OFFLINE_SUPPLIER_RESULT_MISSING'; end if;
 v_result:=jsonb_build_object('ok',true,'supplier_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json)
 values(v_tx,'supplier_save',v_d,v_id,v_result);
 return v_result;
end;$function$


-- offline_food_waste_post_action_v2(p_branch_id bigint, p_ingredient_id bigint, p_prep_item_id bigint, p_shift_id bigint, p_reason_code text, p_quantity numeric, p_unit_code text, p_notes text, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_food_waste_post_action_v2(p_branch_id bigint, p_ingredient_id bigint, p_prep_item_id bigint, p_shift_id bigint, p_reason_code text, p_quantity numeric, p_unit_code text, p_notes text, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FOOD_WASTE_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-food-waste:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'food_waste_post' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if coalesce(p_quantity,0)<=0 then raise exception 'OFFLINE_FOOD_WASTE_QUANTITY_INVALID';end if;
 if not exists(select 1 from public.ingredients where id=p_ingredient_id and active is distinct from false) then raise exception 'OFFLINE_FOOD_WASTE_INGREDIENT_DEPENDENCY_UNRESOLVED';end if;
 if not exists(select 1 from public.food_waste_reasons where code=p_reason_code and active=true) then raise exception 'OFFLINE_FOOD_WASTE_REASON_DEPENDENCY_UNRESOLVED';end if;
 -- Accepted Action V2 owns permission, branch access, replay and Point-4 guard; canonical writer resolves units, sufficiency and cost snapshot.
 v_id:=public.food_waste_post_action_v2(p_branch_id,p_ingredient_id,p_prep_item_id,p_shift_id,p_reason_code,p_quantity,p_unit_code,p_notes,v_tx);
 v_result:=jsonb_build_object('ok',true,'waste_event_id',v_id,'branch_id',p_branch_id,'ingredient_id',p_ingredient_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'food_waste_post',v_d,v_id,v_result);return v_result;
end;$function$


-- offline_inventory_supply_request_decide_v1(p_request_id bigint, p_approve boolean, p_approved_items jsonb, p_note text, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_inventory_supply_request_decide_v1(p_request_id bigint, p_approve boolean, p_approved_items jsonb, p_note text, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare t text:=nullif(trim(coalesce(p_client_tx_id,'')),'');d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;i bigint;j jsonb;begin
 if auth.uid() is null or t is null or d is null then raise exception 'OFFLINE_SUPPLY_DECIDE_IDENTITY_REQUIRED';end if;perform pg_advisory_xact_lock(hashtextextended('offline-supply:'||t,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=t;if found then if r.operation_type<>'inventory_supply_request_decide' or r.payload_digest<>d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 i:=public.inventory_supply_request_decide_v1(p_request_id,p_approve,p_approved_items,p_note);j:=jsonb_build_object('ok',true,'request_id',i,'client_tx_id',t);insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json)values(t,'inventory_supply_request_decide',d,i,j);return j;end;$function$


-- offline_inventory_supply_request_dispatch_v1(p_request_id bigint, p_items jsonb, p_note text, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_inventory_supply_request_dispatch_v1(p_request_id bigint, p_items jsonb, p_note text, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare t text:=nullif(trim(coalesce(p_client_tx_id,'')),'');d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;i bigint;j jsonb;begin
 if auth.uid() is null or t is null or d is null then raise exception 'OFFLINE_SUPPLY_DISPATCH_IDENTITY_REQUIRED';end if;perform pg_advisory_xact_lock(hashtextextended('offline-supply-stock:'||t,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=t;if found then if r.operation_type<>'inventory_supply_request_dispatch' or r.payload_digest<>d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 i:=public.inventory_supply_request_dispatch_v1(p_request_id,p_items,p_note,t);j:=jsonb_build_object('ok',true,'request_id',i,'client_tx_id',t);insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json)values(t,'inventory_supply_request_dispatch',d,i,j);return j;end;$function$


-- offline_inventory_supply_request_prepare_v1(p_request_id bigint, p_note text, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_inventory_supply_request_prepare_v1(p_request_id bigint, p_note text, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare t text:=nullif(trim(coalesce(p_client_tx_id,'')),'');d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;i bigint;j jsonb;begin
 if auth.uid() is null or t is null or d is null then raise exception 'OFFLINE_SUPPLY_PREPARE_IDENTITY_REQUIRED';end if;perform pg_advisory_xact_lock(hashtextextended('offline-supply:'||t,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=t;if found then if r.operation_type<>'inventory_supply_request_prepare' or r.payload_digest<>d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 i:=public.inventory_supply_request_prepare_v1(p_request_id,p_note);j:=jsonb_build_object('ok',true,'request_id',i,'client_tx_id',t);insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json)values(t,'inventory_supply_request_prepare',d,i,j);return j;end;$function$


-- offline_inventory_supply_request_receive_v1(p_request_id bigint, p_items jsonb, p_final boolean, p_note text, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_inventory_supply_request_receive_v1(p_request_id bigint, p_items jsonb, p_final boolean, p_note text, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare t text:=nullif(trim(coalesce(p_client_tx_id,'')),'');d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;i bigint;j jsonb;begin
 if auth.uid() is null or t is null or d is null then raise exception 'OFFLINE_SUPPLY_RECEIVE_IDENTITY_REQUIRED';end if;perform pg_advisory_xact_lock(hashtextextended('offline-supply-stock:'||t,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=t;if found then if r.operation_type<>'inventory_supply_request_receive' or r.payload_digest<>d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 i:=public.inventory_supply_request_receive_v1(p_request_id,p_items,p_final,p_note,t);j:=jsonb_build_object('ok',true,'request_id',i,'client_tx_id',t);insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json)values(t,'inventory_supply_request_receive',d,i,j);return j;end;$function$


-- offline_inventory_supply_request_submit_v1(p_request_id bigint, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_inventory_supply_request_submit_v1(p_request_id bigint, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare t text:=nullif(trim(coalesce(p_client_tx_id,'')),'');d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;i bigint;j jsonb;begin
 if auth.uid() is null or t is null or d is null then raise exception 'OFFLINE_SUPPLY_SUBMIT_IDENTITY_REQUIRED';end if;perform pg_advisory_xact_lock(hashtextextended('offline-supply:'||t,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=t;if found then if r.operation_type<>'inventory_supply_request_submit' or r.payload_digest<>d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 i:=public.inventory_supply_request_submit_v1(p_request_id);j:=jsonb_build_object('ok',true,'request_id',i,'client_tx_id',t);insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json)values(t,'inventory_supply_request_submit',d,i,j);return j;end;$function$


-- offline_restaurant_floor_save_v1(p_floor_id bigint, p_branch_id bigint, p_name text, p_sort_order integer, p_active boolean, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_restaurant_floor_save_v1(p_floor_id bigint, p_branch_id bigint, p_name text, p_sort_order integer, p_active boolean, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FLOOR_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'floor_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 v_id:=public.restaurant_floor_save_v1(p_floor_id,p_branch_id,p_name,p_sort_order,p_active);if v_id is null then raise exception 'OFFLINE_FLOOR_RESULT_MISSING';end if;
 v_result:=jsonb_build_object('ok',true,'floor_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'floor_save',v_d,v_id,v_result);return v_result;
end;$function$


-- offline_restaurant_table_save_v1(p_table_id bigint, p_branch_id bigint, p_floor_id bigint, p_name text, p_code text, p_capacity integer, p_active boolean, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_restaurant_table_save_v1(p_table_id bigint, p_branch_id bigint, p_floor_id bigint, p_name text, p_code text, p_capacity integer, p_active boolean, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_TABLE_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'table_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 v_id:=public.restaurant_table_save_v1(p_table_id,p_branch_id,p_floor_id,p_name,p_code,p_capacity,p_active);if v_id is null then raise exception 'OFFLINE_TABLE_RESULT_MISSING';end if;
 v_result:=jsonb_build_object('ok',true,'table_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'table_save',v_d,v_id,v_result);return v_result;
end;$function$


-- offline_restaurant_table_session_attach_v1(p_session_id bigint, p_session_open_tx text, p_order_id bigint, p_order_sale_tx text, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_restaurant_table_session_attach_v1(p_session_id bigint, p_session_open_tx text, p_order_id bigint, p_order_sale_tx text, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');v_session bigint:=p_session_id;v_order bigint:=p_order_id;r public.offline_restaurant_reference_receipts_v1%rowtype;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_TABLE_SESSION_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'table_session_attach' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if v_session is null and nullif(trim(coalesce(p_session_open_tx,'')),'') is not null then select id into v_session from public.restaurant_table_sessions where client_tx_id=trim(p_session_open_tx);end if;
 if v_session is null then raise exception 'OFFLINE_TABLE_SESSION_DEPENDENCY_UNRESOLVED';end if;
 if v_order is null and nullif(trim(coalesce(p_order_sale_tx,'')),'') is not null then select nullif(server_entity_id,'')::bigint into v_order from public.offline_v2_server_receipts where business_id=public.current_business_id() and client_tx_id=trim(p_order_sale_tx) and operation_type='sale';end if;
 if v_order is null then raise exception 'OFFLINE_TABLE_ORDER_DEPENDENCY_UNRESOLVED';end if;
 perform public.restaurant_table_session_attach_order_v1(v_session,v_order);
 v_result:=jsonb_build_object('ok',true,'session_id',v_session,'order_id',v_order,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'table_session_attach',v_d,v_session,v_result);return v_result;
end;$function$


-- offline_restaurant_table_session_close_v1(p_session_id bigint, p_session_open_tx text, p_notes text, p_client_tx_id text, p_payload_digest text)
CREATE OR REPLACE FUNCTION public.offline_restaurant_table_session_close_v1(p_session_id bigint, p_session_open_tx text, p_notes text, p_client_tx_id text, p_payload_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');v_session bigint:=p_session_id;r public.offline_restaurant_reference_receipts_v1%rowtype;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_TABLE_SESSION_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if r.operation_type<>'table_session_close' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if v_session is null and nullif(trim(coalesce(p_session_open_tx,'')),'') is not null then select id into v_session from public.restaurant_table_sessions where client_tx_id=trim(p_session_open_tx);end if;
 if v_session is null then raise exception 'OFFLINE_TABLE_SESSION_DEPENDENCY_UNRESOLVED';end if;
 perform public.restaurant_table_session_close_v1(v_session,p_notes);
 v_result:=jsonb_build_object('ok',true,'session_id',v_session,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'table_session_close',v_d,v_session,v_result);return v_result;
end;$function$


-- offline_retail_purchase_order_approve_v1(p_purchase_order_id bigint, p_client_tx_id text)
CREATE OR REPLACE FUNCTION public.offline_retail_purchase_order_approve_v1(p_purchase_order_id bigint, p_client_tx_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),''); v_id bigint; v_po public.retail_purchase_orders%rowtype; v_emp bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية اعتماد المشتريات'; end if;
 if v_tx is null then raise exception 'معرف الحركة مطلوب'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-retail-po-approve:'||v_tx,0));
 select purchase_order_id into v_id from public.retail_offline_po_approval_receipts where business_id=public.current_business_id() and client_tx_id=v_tx;
 if v_id is not null then
   if v_id<>p_purchase_order_id then raise exception 'معرف الحركة مستخدم لأمر شراء آخر'; end if;
   return jsonb_build_object('purchase_order_id',v_id,'replayed',true);
 end if;
 select * into v_po from public.retail_purchase_orders where id=p_purchase_order_id for update;
 if not found then raise exception 'أمر الشراء غير موجود'; end if;
 if not public.has_branch_access(v_po.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 if v_po.status<>'draft' then raise exception 'يمكن اعتماد المسودة فقط'; end if;
 v_emp:=public.current_employee_id();
 update public.retail_purchase_orders set status='approved',approved_by_employee_id=v_emp,approved_at=now(),updated_at=now() where id=v_po.id;
 insert into public.retail_offline_po_approval_receipts(client_tx_id,purchase_order_id) values(v_tx,v_po.id);
 return jsonb_build_object('purchase_order_id',v_po.id,'replayed',false);
end;$function$


-- offline_retail_supplier_create_v1(p_name text, p_phone text, p_tax_no text, p_client_tx_id text)
CREATE OR REPLACE FUNCTION public.offline_retail_supplier_create_v1(p_name text, p_phone text, p_tax_no text, p_client_tx_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),''); v_id bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية الموردين'; end if;
 if v_tx is null then raise exception 'معرف الحركة مطلوب'; end if;
 if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'اسم المورد مطلوب'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-retail-supplier:'||v_tx,0));
 select supplier_id into v_id from public.retail_offline_supplier_receipts where business_id=public.current_business_id() and client_tx_id=v_tx;
 if v_id is not null then return jsonb_build_object('supplier_id',v_id,'replayed',true); end if;
 insert into public.retail_suppliers(name,phone,tax_no)
 values(trim(p_name),nullif(trim(coalesce(p_phone,'')),''),nullif(trim(coalesce(p_tax_no,'')),''))
 returning id into v_id;
 insert into public.retail_offline_supplier_receipts(client_tx_id,supplier_id) values(v_tx,v_id);
 return jsonb_build_object('supplier_id',v_id,'replayed',false);
end;$function$


-- offline_v2_merge_customer_v1(p_name text, p_phone text, p_area text, p_address text, p_notes text, p_client_tx_id text)
CREATE OR REPLACE FUNCTION public.offline_v2_merge_customer_v1(p_name text, p_phone text, p_area text, p_address text, p_notes text, p_client_tx_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_tx text := nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_phone text := public.offline_v2_normalize_phone(p_phone);
  v_customer public.customers%rowtype;
  v_receipt public.offline_v2_customer_merge_receipts%rowtype;
  v_result jsonb;
  v_existing boolean := false;
begin
  if auth.uid() is null then raise exception using errcode='42501', message='غير مصرح'; end if;
  if v_tx is null or length(v_phone)<10 then raise exception using errcode='22023', message='بيانات العميل/TX غير مكتملة'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ov2-customer:'||right(v_phone,10),0));

  select * into v_receipt from public.offline_v2_customer_merge_receipts where business_id=public.current_business_id() and client_tx_id=v_tx;
  if found then
    if v_receipt.normalized_phone is distinct from v_phone or v_receipt.auth_user_id is distinct from auth.uid() then
      raise exception using errcode='22000', message='Offline V2 customer duplicate TX mismatch';
    end if;
    return v_receipt.result_json;
  end if;

  select c.* into v_customer
  from public.customers c
  where right(public.offline_v2_normalize_phone(c.phone),10)=right(v_phone,10)
  order by c.id
  limit 1;

  if found then
    v_existing := true;
    update public.customers c set
      name=case when nullif(trim(coalesce(c.name,'')),'') is null then coalesce(nullif(trim(p_name),''),c.name) else c.name end,
      area=case when nullif(trim(coalesce(c.area,'')),'') is null then coalesce(nullif(trim(p_area),''),c.area) else c.area end,
      address=case when nullif(trim(coalesce(c.address,'')),'') is null then coalesce(nullif(trim(p_address),''),c.address) else c.address end,
      notes=case when nullif(trim(coalesce(c.notes,'')),'') is null then coalesce(nullif(trim(p_notes),''),c.notes) else c.notes end,
      updated_at=now()
    where c.id=v_customer.id
    returning * into v_customer;
  else
    insert into public.customers(name,phone,area,address,notes,created_at,updated_at)
    values(coalesce(nullif(trim(p_name),''),v_phone),v_phone,nullif(trim(p_area),''),nullif(trim(p_address),''),nullif(trim(p_notes),''),now(),now())
    returning * into v_customer;
  end if;

  v_result := jsonb_build_object(
    'ok',true,'client_tx_id',v_tx,'customer_id',v_customer.id,
    'merged_existing',v_existing,'customer',to_jsonb(v_customer)
  );
  insert into public.offline_v2_customer_merge_receipts(client_tx_id,normalized_phone,customer_id,result_json,auth_user_id)
  values(v_tx,v_phone,v_customer.id,v_result,auth.uid());
  return v_result;
end;
$function$


-- order_status_apply_offline_v2(p_order_id bigint, p_target_status text, p_client_tx_id text)
CREATE OR REPLACE FUNCTION public.order_status_apply_offline_v2(p_order_id bigint, p_target_status text, p_client_tx_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
 v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
 v_target text:=lower(trim(coalesce(p_target_status,'')));
 v_order public.orders%rowtype;
 v_receipt public.offline_order_status_receipts_v2%rowtype;
 v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if v_tx is null then raise exception 'OFFLINE_ORDER_STATUS_CLIENT_TX_REQUIRED'; end if;
 if v_target not in ('preparing','ready','completed','delivered') then raise exception 'OFFLINE_ORDER_STATUS_TARGET_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-order-status:'||v_tx,0));

 select * into v_receipt from public.offline_order_status_receipts_v2 where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then
   if v_receipt.order_id is distinct from p_order_id or v_receipt.target_status is distinct from v_target then
     raise exception 'OFFLINE_ORDER_STATUS_REPLAY_MISMATCH';
   end if;
   return v_receipt.result_json||jsonb_build_object('idempotent_replay',true);
 end if;

 select * into v_order from public.orders where id=p_order_id for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if not public.has_branch_access(v_order.branch_id) then raise exception 'BRANCH_ACCESS_DENIED'; end if;

 if v_target='delivered' then
   if lower(coalesce(v_order.order_type,''))<>'delivery' then raise exception 'ORDER_NOT_DELIVERY'; end if;
   -- Delegate delivery payment/custody/settlement and Action gates to the accepted owner.
   v_result:=public.delivery_mark_delivered_v2(v_order.id,v_order.payment_method,v_tx);
 else
   -- Delegate preparing/ready/pickup-completed transitions and Action gate to F5A owner.
   v_result:=public.order_fulfillment_transition_v2(v_order.id,v_target);
 end if;

 insert into public.offline_order_status_receipts_v2(client_tx_id,order_id,target_status,result_json)
 values(v_tx,p_order_id,v_target,coalesce(v_result,'{}'::jsonb));

 return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
   'ok',true,'client_tx_id',v_tx,'order_id',p_order_id,'target_status',v_target,'idempotent_replay',false
 );
end;
$function$


-- sharawla_offline_v2_apply_event_alignment_special_v1(p_event jsonb)
CREATE OR REPLACE FUNCTION public.sharawla_offline_v2_apply_event_alignment_special_v1(p_event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_tx text := nullif(trim(coalesce(p_event->>'client_tx_id','')), '');
  v_digest text := nullif(trim(coalesce(p_event->>'payload_digest','')), '');
  v_operation text := nullif(trim(coalesce(p_event->>'operation_type','')), '');
  v_rpc text := nullif(trim(coalesce(p_event#>>'{payload,rpc_name}','')), '');
  v_payload jsonb := coalesce(p_event#>'{payload,rpc_payload}','{}'::jsonb);
  v_protocol integer := coalesce(nullif(p_event->>'protocol_version','')::integer,0);
  v_device_id text := nullif(trim(coalesce(p_event->>'device_id','')), '');
  v_sequence bigint := coalesce(nullif(p_event->>'device_sequence','')::bigint,0);
  v_branch bigint := coalesce(nullif(p_event->>'branch_id','')::bigint,0);
  v_employee bigint := coalesce(nullif(p_event->>'employee_id','')::bigint,0);
  v_current_employee bigint;
  v_dep_tx text := nullif(trim(coalesce(p_event->>'depends_on_tx_id','')), '');
  v_dep_map_tx text := nullif(trim(coalesce(p_event#>>'{dependency_mapping,client_tx_id}','')), '');
  v_dep_server_id text := nullif(trim(coalesce(p_event#>>'{dependency_mapping,server_id}','')), '');
  v_receipt public.offline_v2_server_receipts%rowtype;
  v_result jsonb;
  v_entity_id text;
  v_event_id text;
  v_request_id bigint;
  v_order_ids bigint[];
begin
  if auth.uid() is null then raise exception using errcode='42501',message='غير مصرح';end if;
  if v_protocol<>2 or v_tx is null or v_digest is null or v_operation is null or v_rpc is null
     or v_device_id is null or v_sequence<=0 or v_branch<=0 or v_employee<=0 then
    raise exception using errcode='22023',message='Offline V2 Runtime Alignment event contract غير مكتمل';
  end if;
  v_current_employee:=public.current_employee_id();
  if v_current_employee is null or v_current_employee is distinct from v_employee then
    raise exception using errcode='42501',message='بيانات الموظف غير مطابقة لجلسة المزامنة';
  end if;
  if (v_operation='shift_close' and v_rpc<>'close_pos_shift_v2')
     or (v_operation='delivery_mark_delivered' and v_rpc<>'delivery_mark_delivered_v2')
     or (v_operation='delivery_driver_settle' and v_rpc<>'offline_delivery_driver_settle_v1')
     or (v_operation='inventory_supply_request_create' and v_rpc<>'inventory_supply_request_create_v1')
     or v_operation not in ('shift_close','delivery_mark_delivered','delivery_driver_settle','inventory_supply_request_create') then
    raise exception using errcode='22023',message='Offline V2 Runtime Alignment operation/RPC binding غير مدعومة';
  end if;
  if nullif(trim(coalesce(v_payload->>'p_client_tx_id','')),'') is distinct from v_tx then
    raise exception using errcode='22023',message='Offline V2 Runtime Alignment client_tx_id mismatch';
  end if;

  if v_dep_tx is not null then
    if v_dep_server_id is null or v_dep_map_tx is distinct from v_dep_tx then
      raise exception using errcode='22023',message='Offline V2 Runtime Alignment dependency mapping غير مكتملة';
    end if;
    if v_operation='shift_close' then
      v_payload:=jsonb_set(v_payload,'{p_shift_id}',to_jsonb(v_dep_server_id::bigint),true);
    elsif v_operation='delivery_mark_delivered' then
      v_payload:=jsonb_set(v_payload,'{p_order_id}',to_jsonb(v_dep_server_id::bigint),true);
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('offline-v2:'||v_tx,0));
  select * into v_receipt from public.offline_v2_server_receipts where business_id=public.current_business_id() and client_tx_id=v_tx;
  if found then
    if v_receipt.payload_digest is distinct from v_digest
       or v_receipt.rpc_name is distinct from v_rpc
       or v_receipt.operation_type is distinct from v_operation
       or v_receipt.device_id is distinct from v_device_id
       or v_receipt.device_sequence is distinct from v_sequence
       or v_receipt.branch_id is distinct from v_branch
       or v_receipt.employee_id is distinct from v_employee
       or v_receipt.auth_user_id is distinct from auth.uid() then
      raise exception using errcode='22000',message='Offline V2 duplicate TX payload/identity mismatch';
    end if;
    return jsonb_build_object(
      'ok',true,'acknowledged',false,'duplicate',true,'idempotent_replay',true,
      'client_tx_id',v_receipt.client_tx_id,'protocol_version',v_receipt.protocol_version,
      'payload_digest',v_receipt.payload_digest,'server_event_id',v_receipt.server_event_id,
      'server_entity_id',v_receipt.server_entity_id,'server_version',v_receipt.server_version,
      'result',v_receipt.result_json
    );
  end if;

  if v_operation='shift_close' then
    v_result:=public.close_pos_shift_v2(
      (v_payload->>'p_shift_id')::bigint,
      (v_payload->>'p_closing_cash')::numeric,
      coalesce(v_payload->'p_metrics','{}'::jsonb),
      v_tx
    );
    v_entity_id:=nullif(v_result->>'id','');
  elsif v_operation='delivery_mark_delivered' then
    v_result:=public.delivery_mark_delivered_v2(
      (v_payload->>'p_order_id')::bigint,
      v_payload->>'p_payment_method',
      v_tx
    );
    v_entity_id:=coalesce(nullif(v_result#>>'{order,id}',''),nullif(v_payload->>'p_order_id',''));
  elsif v_operation='delivery_driver_settle' then
    select coalesce(array_agg(q.value::bigint),'{}'::bigint[]) into v_order_ids
    from jsonb_array_elements_text(coalesce(v_payload->'p_order_ids','[]'::jsonb)) as q(value);
    v_result:=public.offline_delivery_driver_settle_v1(
      (v_payload->>'p_driver_id')::bigint,
      v_order_ids,
      (v_payload->>'p_expected_receiving_shift_id')::bigint,
      v_tx
    );
    v_entity_id:=nullif(v_result->>'settlement_id','');
  else
    v_request_id:=public.inventory_supply_request_create_v1(
      (v_payload->>'p_route_id')::bigint,
      v_payload->>'p_request_type',
      coalesce(v_payload->'p_items','[]'::jsonb),
      v_payload->>'p_notes',
      v_tx
    );
    v_entity_id:=v_request_id::text;
    v_result:=jsonb_build_object('ok',true,'request_id',v_request_id,'client_tx_id',v_tx);
  end if;

  if v_entity_id is null then
    raise exception using errcode='22000',message='Offline V2 Runtime Alignment backend result missing server entity id';
  end if;
  v_event_id:='ov2-'||md5(v_tx||':'||v_digest);
  insert into public.offline_v2_server_receipts(
    client_tx_id,server_event_id,protocol_version,payload_digest,operation_type,rpc_name,
    device_id,device_sequence,branch_id,employee_id,auth_user_id,server_entity_id,server_version,result_json
  ) values(
    v_tx,v_event_id,2,v_digest,v_operation,v_rpc,
    v_device_id,v_sequence,v_branch,v_employee,auth.uid(),v_entity_id,'runtime-alignment-v1',v_result
  );
  return jsonb_build_object(
    'ok',true,'acknowledged',true,'duplicate',false,'idempotent_replay',false,
    'client_tx_id',v_tx,'protocol_version',2,'payload_digest',v_digest,
    'server_event_id',v_event_id,'server_entity_id',v_entity_id,
    'server_version','runtime-alignment-v1','result',v_result
  );
end;
$function$


-- sharawla_offline_v2_apply_event_core_v1(p_event jsonb)
CREATE OR REPLACE FUNCTION public.sharawla_offline_v2_apply_event_core_v1(p_event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
 v_tx text:=nullif(trim(coalesce(p_event->>'client_tx_id','')),'');v_digest text:=nullif(trim(coalesce(p_event->>'payload_digest','')),'');
 v_operation text:=nullif(trim(coalesce(p_event->>'operation_type','')),'');v_rpc text:=nullif(trim(coalesce(p_event#>>'{payload,rpc_name}','')),'');
 v_payload jsonb:=coalesce(p_event#>'{payload,rpc_payload}','{}'::jsonb);v_protocol integer:=coalesce(nullif(p_event->>'protocol_version','')::integer,0);
 v_device_id text:=nullif(trim(coalesce(p_event->>'device_id','')),'');v_sequence bigint:=coalesce(nullif(p_event->>'device_sequence','')::bigint,0);
 v_branch bigint:=coalesce(nullif(p_event->>'branch_id','')::bigint,0);v_employee bigint:=coalesce(nullif(p_event->>'employee_id','')::bigint,0);
 v_current_employee bigint;v_dep_tx text:=nullif(trim(coalesce(p_event->>'depends_on_tx_id','')),'');v_dep_map_tx text:=nullif(trim(coalesce(p_event#>>'{dependency_mapping,client_tx_id}','')),'');v_dep_server_id text:=nullif(trim(coalesce(p_event#>>'{dependency_mapping,server_id}','')),'');
 v_receipt public.offline_v2_server_receipts%rowtype;v_result jsonb;v_entity_id text;v_return_id bigint;v_event_id text;
 v_envelope jsonb:=p_event->'point4_context_envelope';v_context jsonb;v_identity record;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='غير مصرح';end if;
 if v_protocol<>2 or v_tx is null or v_digest is null or v_operation is null or v_rpc is null or v_device_id is null or v_sequence<=0 or v_branch<=0 or v_employee<=0 then raise exception using errcode='22023',message='Offline V2 event contract غير مكتمل';end if;
 v_current_employee:=public.current_employee_id();if v_current_employee is null or v_current_employee is distinct from v_employee then raise exception using errcode='42501',message='بيانات الموظف غير مطابقة لجلسة المزامنة';end if;
 if (v_operation='sale' and v_rpc not in ('create_pos_order_atomic','create_retail_pos_order_atomic','create_retail_variant_pos_order_atomic_v1','create_food_pos_order_atomic_v1','create_food_retail_pos_order_atomic_v1'))
 or (v_operation='return' and v_rpc not in ('create_order_return_idempotent','create_retail_order_return_idempotent','create_retail_variant_order_return_idempotent_v1','create_food_order_return_idempotent_v1','create_food_retail_order_return_idempotent_v1'))
 or (v_operation='expense' and v_rpc<>'create_pos_expense_idempotent') or (v_operation='shift_open' and v_rpc<>'open_pos_shift_idempotent') or (v_operation='shift_close' and v_rpc<>'close_pos_shift_idempotent')
 or v_operation not in('sale','return','expense','shift_open','shift_close') then raise exception using errcode='22023',message='Offline V2 operation/RPC binding غير مدعومة';end if;
 if v_operation='sale' then
  if nullif(trim(coalesce(v_payload#>>'{p_order,client_tx_id}','')),'') is distinct from v_tx or coalesce(nullif(v_payload#>>'{p_order,branch_id}','')::bigint,0) is distinct from v_branch or coalesce(nullif(v_payload#>>'{p_order,employee_id}','')::bigint,0) is distinct from v_employee then raise exception using errcode='22023',message='Offline V2 sale identity/TX mismatch';end if;
 else if nullif(trim(coalesce(v_payload->>'p_client_tx_id','')),'') is distinct from v_tx then raise exception using errcode='22023',message='Offline V2 RPC client_tx_id mismatch';end if;end if;
 if v_dep_tx is not null then if v_dep_server_id is null or v_dep_map_tx is distinct from v_dep_tx then raise exception using errcode='22023',message='Offline V2 dependency mapping غير مكتملة';end if;
  if v_operation='sale' then v_payload:=jsonb_set(v_payload,'{p_order,shift_id}',to_jsonb(v_dep_server_id::bigint),true);elsif v_operation in('expense','shift_close') then v_payload:=jsonb_set(v_payload,'{p_shift_id}',to_jsonb(v_dep_server_id::bigint),true);elsif v_operation='return' then v_payload:=jsonb_set(v_payload,'{p_order_id}',to_jsonb(v_dep_server_id::bigint),true);end if;end if;

 perform pg_advisory_xact_lock(hashtextextended('offline-v2:'||v_tx,0));
 select * into v_receipt from public.offline_v2_server_receipts where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then
  if v_receipt.payload_digest is distinct from v_digest or v_receipt.rpc_name is distinct from v_rpc or v_receipt.operation_type is distinct from v_operation or v_receipt.device_id is distinct from v_device_id or v_receipt.device_sequence is distinct from v_sequence or v_receipt.branch_id is distinct from v_branch or v_receipt.employee_id is distinct from v_employee or v_receipt.auth_user_id is distinct from auth.uid() then raise exception using errcode='22000',message='Offline V2 duplicate TX payload/identity mismatch';end if;
  return jsonb_build_object('ok',true,'acknowledged',false,'duplicate',true,'idempotent_replay',true,'client_tx_id',v_receipt.client_tx_id,'protocol_version',v_receipt.protocol_version,'payload_digest',v_receipt.payload_digest,'server_event_id',v_receipt.server_event_id,'server_entity_id',v_receipt.server_entity_id,'server_version',v_receipt.server_version,'result',v_receipt.result_json);
 end if;

 -- Only after the locked authoritative replay check may execution guard server-prepared real stock identities.
 if v_envelope is not null and jsonb_typeof(v_envelope)<>'null' then v_context:=public.sharawla_point4_assert_context_envelope_v1(v_envelope,v_tx,v_branch);end if;
 for v_identity in select (x->>'location_id')::bigint location_id,x->>'item_kind' item_kind,(x->>'item_id')::bigint item_id from jsonb_array_elements(coalesce(p_event->'point4_stock_identities','[]'::jsonb)) x
 loop
  if v_identity.location_id is distinct from v_branch or v_identity.item_kind not in('product','variant','ingredient') or coalesce(v_identity.item_id,0)<=0 then raise exception 'Point4 Offline stock identity غير صالحة';end if;
  perform public.inventory_stock_assert_legacy_write_allowed_v2(v_identity.location_id,v_identity.item_kind,v_identity.item_id);
 end loop;

 case v_rpc
  when 'create_pos_order_atomic' then v_result:=public.create_pos_order_atomic(v_payload->'p_order',v_payload->'p_items',v_payload->'p_payments');v_entity_id:=nullif(v_result#>>'{order,id}','');
  when 'create_retail_pos_order_atomic' then v_result:=public.create_retail_pos_order_atomic(v_payload->'p_order',v_payload->'p_items',v_payload->'p_payments');v_entity_id:=nullif(v_result#>>'{order,id}','');
  when 'create_retail_variant_pos_order_atomic_v1' then v_result:=public.create_retail_variant_pos_order_atomic_v1(v_payload->'p_order',v_payload->'p_items',v_payload->'p_payments');v_entity_id:=nullif(v_result#>>'{order,id}','');
  when 'create_food_pos_order_atomic_v1' then
   if v_envelope is null or jsonb_typeof(v_envelope)='null' then raise exception 'Food Offline Context envelope مطلوبة';end if;
   v_result:=public.create_food_pos_order_atomic_with_context_v1(v_payload->'p_order',v_payload->'p_items',v_payload->'p_payments',v_envelope);v_entity_id:=nullif(v_result#>>'{order,id}','');
  when 'create_food_retail_pos_order_atomic_v1' then
   if v_envelope is null or jsonb_typeof(v_envelope)='null' then raise exception 'Food Retail Offline Context envelope مطلوبة';end if;
   v_result:=public.create_food_retail_pos_order_atomic_with_context_v1(v_payload->'p_order',v_payload->'p_items',v_payload->'p_payments',coalesce((v_payload->>'p_use_variants')::boolean,false),v_envelope);v_entity_id:=nullif(v_result#>>'{order,id}','');
  when 'create_order_return_idempotent' then v_return_id:=public.create_order_return_idempotent((v_payload->>'p_order_id')::bigint,v_payload->>'p_reason',v_payload->>'p_notes',v_payload->'p_items',v_payload->'p_payments',v_payload->>'p_client_tx_id');v_entity_id:=v_return_id::text;v_result:=jsonb_build_object('return_id',v_return_id);
  when 'create_retail_order_return_idempotent' then v_return_id:=public.create_retail_order_return_idempotent((v_payload->>'p_order_id')::bigint,v_payload->>'p_reason',v_payload->>'p_notes',v_payload->'p_items',v_payload->'p_payments',v_payload->>'p_client_tx_id');v_entity_id:=v_return_id::text;v_result:=jsonb_build_object('return_id',v_return_id);
  when 'create_retail_variant_order_return_idempotent_v1' then v_return_id:=public.create_retail_variant_order_return_idempotent_v1((v_payload->>'p_order_id')::bigint,v_payload->>'p_reason',v_payload->>'p_notes',v_payload->'p_items',v_payload->'p_payments',v_payload->>'p_client_tx_id');v_entity_id:=v_return_id::text;v_result:=jsonb_build_object('return_id',v_return_id);
  when 'create_food_order_return_idempotent_v1' then v_return_id:=public.create_food_order_return_idempotent_v1((v_payload->>'p_order_id')::bigint,v_payload->>'p_reason',v_payload->>'p_notes',v_payload->'p_items',v_payload->'p_payments',v_payload->>'p_client_tx_id');v_entity_id:=v_return_id::text;v_result:=jsonb_build_object('return_id',v_return_id);
  when 'create_food_retail_order_return_idempotent_v1' then v_return_id:=public.create_food_retail_order_return_idempotent_v1((v_payload->>'p_order_id')::bigint,v_payload->>'p_reason',v_payload->>'p_notes',v_payload->'p_items',v_payload->'p_payments',v_payload->>'p_client_tx_id',coalesce((v_payload->>'p_use_variants')::boolean,false));v_entity_id:=v_return_id::text;v_result:=jsonb_build_object('return_id',v_return_id);
  when 'create_pos_expense_idempotent' then v_result:=public.create_pos_expense_idempotent((v_payload->>'p_shift_id')::bigint,v_payload->>'p_description',(v_payload->>'p_amount')::numeric,v_payload->>'p_client_tx_id');v_entity_id:=nullif(v_result->>'id','');
  when 'open_pos_shift_idempotent' then v_result:=public.open_pos_shift_idempotent((v_payload->>'p_branch_id')::bigint,(v_payload->>'p_opening_cash')::numeric,v_payload->>'p_client_tx_id');v_entity_id:=nullif(v_result->>'id','');
  when 'close_pos_shift_idempotent' then v_result:=public.close_pos_shift_idempotent((v_payload->>'p_shift_id')::bigint,(v_payload->>'p_closing_cash')::numeric,v_payload->'p_metrics',v_payload->>'p_client_tx_id');v_entity_id:=nullif(v_result->>'id','');
  else raise exception using errcode='22023',message='Offline V2 RPC غير مدعومة: '||coalesce(v_rpc,'');
 end case;
 if v_entity_id is null then raise exception using errcode='22000',message='Offline V2 backend result missing server entity id';end if;
 v_event_id:='ov2-'||md5(v_tx||':'||v_digest);
 insert into public.offline_v2_server_receipts(client_tx_id,server_event_id,protocol_version,payload_digest,operation_type,rpc_name,device_id,device_sequence,branch_id,employee_id,auth_user_id,server_entity_id,server_version,result_json) values(v_tx,v_event_id,2,v_digest,v_operation,v_rpc,v_device_id,v_sequence,v_branch,v_employee,auth.uid(),v_entity_id,'transport-v1',v_result);
 return jsonb_build_object('ok',true,'acknowledged',true,'duplicate',false,'idempotent_replay',false,'client_tx_id',v_tx,'protocol_version',2,'payload_digest',v_digest,'server_event_id',v_event_id,'server_entity_id',v_entity_id,'server_version','transport-v1','result',v_result);
end;$function$


-- sharawla_offline_v2_apply_event_modern_v1(p_event jsonb)
CREATE OR REPLACE FUNCTION public.sharawla_offline_v2_apply_event_modern_v1(p_event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_tx text := nullif(trim(coalesce(p_event->>'client_tx_id','')), '');
  v_digest text := nullif(trim(coalesce(p_event->>'payload_digest','')), '');
  v_operation text := nullif(trim(coalesce(p_event->>'operation_type','')), '');
  v_rpc text := nullif(trim(coalesce(p_event#>>'{payload,rpc_name}','')), '');
  v_payload jsonb := coalesce(p_event#>'{payload,rpc_payload}','{}'::jsonb);
  v_protocol integer := coalesce(nullif(p_event->>'protocol_version','')::integer,0);
  v_device_id text := nullif(trim(coalesce(p_event->>'device_id','')), '');
  v_sequence bigint := coalesce(nullif(p_event->>'device_sequence','')::bigint,0);
  v_branch bigint := coalesce(nullif(p_event->>'branch_id','')::bigint,0);
  v_employee bigint := coalesce(nullif(p_event->>'employee_id','')::bigint,0);
  v_current_employee bigint;
  v_dep_tx text := nullif(trim(coalesce(p_event->>'depends_on_tx_id','')), '');
  v_dep_map_tx text := nullif(trim(coalesce(p_event#>>'{dependency_mapping,client_tx_id}','')), '');
  v_dep_server_id text := nullif(trim(coalesce(p_event#>>'{dependency_mapping,server_id}','')), '');
  v_receipt public.offline_v2_server_receipts%rowtype;
  v_result jsonb;
  v_entity_id text;
  v_event_id text;
begin
  if v_operation not in (
    'customer_merge','order_status',
    'food_supplier_return','food_stock_count','food_transfer_create','food_transfer_receive','food_transfer_cancel',
    'food_ingredient_stock_adjust','food_production_start','food_production_complete','food_waste_post',
    'food_ingredient_save','food_ingredient_conversion_save','food_recipe_save_draft','food_recipe_activate',
    'food_prep_item_save','food_prep_recipe_save_draft',
    'retail_supplier_save','retail_po_create','retail_po_approve','retail_purchase_receive','retail_supplier_return'
  ) then
    return public.sharawla_offline_v2_apply_event_core_v1(p_event);
  end if;
  if auth.uid() is null then raise exception using errcode='42501', message='غير مصرح'; end if;
  if v_protocol<>2 or v_tx is null or v_digest is null or v_rpc is null or v_device_id is null or v_sequence<=0 or v_branch<=0 or v_employee<=0 then
    raise exception using errcode='22023', message='Offline V2 Phase 7 event contract غير مكتمل';
  end if;
  v_current_employee := public.current_employee_id();
  if v_current_employee is null or v_current_employee is distinct from v_employee then
    raise exception using errcode='42501', message='بيانات الموظف غير مطابقة لجلسة المزامنة';
  end if;
  if (v_operation='customer_merge' and v_rpc<>'offline_v2_merge_customer_v1')
     or (v_operation='order_status' and v_rpc<>'offline_v2_update_order_status_v1')
     or (v_operation='food_supplier_return' and v_rpc<>'offline_food_supplier_return_create_v1')
     or (v_operation='food_stock_count' and v_rpc<>'offline_food_stock_count_post_v1')
     or (v_operation='food_transfer_create' and v_rpc<>'offline_food_stock_transfer_create_v1')
     or (v_operation='food_transfer_receive' and v_rpc<>'offline_food_stock_transfer_receive_v1')
     or (v_operation='food_transfer_cancel' and v_rpc<>'offline_food_stock_transfer_cancel_v1')
     or (v_operation='food_ingredient_stock_adjust' and v_rpc<>'offline_food_ingredient_stock_adjust_action_v2')
     or (v_operation='food_production_start' and v_rpc<>'offline_food_production_batch_start_action_v2')
     or (v_operation='food_production_complete' and v_rpc<>'offline_food_production_batch_complete_action_v2')
     or (v_operation='food_waste_post' and v_rpc<>'offline_food_waste_post_action_v2')
     or (v_operation='food_ingredient_save' and v_rpc<>'offline_food_ingredient_save_action_v2')
     or (v_operation='food_ingredient_conversion_save' and v_rpc<>'offline_food_ingredient_conversion_save_action_v2')
     or (v_operation='food_recipe_save_draft' and v_rpc<>'offline_food_recipe_save_draft_action_v2')
     or (v_operation='food_recipe_activate' and v_rpc<>'offline_food_recipe_activate_version_action_v2')
     or (v_operation='food_prep_item_save' and v_rpc<>'offline_food_prep_item_save_action_v2')
     or (v_operation='food_prep_recipe_save_draft' and v_rpc<>'offline_food_prep_recipe_save_draft_action_v2')
     or (v_operation='retail_supplier_save' and v_rpc<>'offline_retail_supplier_create_v1')
     or (v_operation='retail_po_create' and v_rpc<>'retail_purchase_order_create_v2')
     or (v_operation='retail_po_approve' and v_rpc<>'offline_retail_purchase_order_approve_v1')
     or (v_operation='retail_purchase_receive' and v_rpc<>'retail_purchase_receive_v2')
     or (v_operation='retail_supplier_return' and v_rpc<>'retail_supplier_return_create_v2') then
    raise exception using errcode='22023', message='Offline V2 Phase 7 operation/RPC binding غير مدعومة';
  end if;
  if nullif(trim(coalesce(v_payload->>'p_client_tx_id','')),'') is distinct from v_tx then
    raise exception using errcode='22023', message='Offline V2 Phase 7 client_tx_id mismatch';
  end if;

  if v_dep_tx is not null then
    if v_dep_server_id is null or v_dep_map_tx is distinct from v_dep_tx then
      raise exception using errcode='22023', message='Offline V2 dependency mapping غير مكتملة';
    end if;
    if v_operation='order_status' then
      v_payload := jsonb_set(v_payload,'{p_order_id}',to_jsonb(v_dep_server_id::bigint),true);
    elsif v_operation in ('food_transfer_receive','food_transfer_cancel') then
      v_payload := jsonb_set(v_payload,'{p_transfer_id}',to_jsonb(v_dep_server_id::bigint),true);
    elsif v_operation='food_production_complete' then
      v_payload := jsonb_set(v_payload,'{p_production_batch_id}',to_jsonb(v_dep_server_id::bigint),true);
    elsif v_operation='food_recipe_activate' then
      v_payload := jsonb_set(v_payload,'{p_recipe_version_id}',to_jsonb(v_dep_server_id::bigint),true);
    elsif v_operation in ('retail_po_create','retail_supplier_return') then
      v_payload := jsonb_set(v_payload,'{p_supplier_id}',to_jsonb(v_dep_server_id::bigint),true);
    elsif v_operation in ('retail_po_approve','retail_purchase_receive') then
      v_payload := jsonb_set(v_payload,'{p_purchase_order_id}',to_jsonb(v_dep_server_id::bigint),true);
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('offline-v2:'||v_tx,0));
  select * into v_receipt from public.offline_v2_server_receipts where business_id=public.current_business_id() and client_tx_id=v_tx;
  if found then
    if v_receipt.payload_digest is distinct from v_digest or v_receipt.rpc_name is distinct from v_rpc
       or v_receipt.operation_type is distinct from v_operation or v_receipt.device_id is distinct from v_device_id
       or v_receipt.device_sequence is distinct from v_sequence or v_receipt.branch_id is distinct from v_branch
       or v_receipt.employee_id is distinct from v_employee or v_receipt.auth_user_id is distinct from auth.uid() then
      raise exception using errcode='22000', message='Offline V2 duplicate TX payload/identity mismatch';
    end if;
    return jsonb_build_object('ok',true,'acknowledged',false,'duplicate',true,'idempotent_replay',true,
      'client_tx_id',v_receipt.client_tx_id,'protocol_version',v_receipt.protocol_version,
      'payload_digest',v_receipt.payload_digest,'server_event_id',v_receipt.server_event_id,
      'server_entity_id',v_receipt.server_entity_id,'server_version',v_receipt.server_version,
      'result',v_receipt.result_json);
  end if;

  if v_operation='customer_merge' then
    v_result := public.offline_v2_merge_customer_v1(v_payload->>'p_name',v_payload->>'p_phone',v_payload->>'p_area',v_payload->>'p_address',v_payload->>'p_notes',v_tx);
    v_entity_id := nullif(v_result->>'customer_id','');
  elsif v_operation='order_status' then
    if coalesce(nullif(v_payload->>'p_branch_id','')::bigint,0) is distinct from v_branch then
      raise exception using errcode='22023', message='Offline V2 order status branch mismatch';
    end if;
    v_result := public.offline_v2_update_order_status_v1(
      (v_payload->>'p_order_id')::bigint,v_branch,v_payload->>'p_status',
      nullif(v_payload->>'p_driver_id','')::bigint,v_payload->>'p_cancelled_reason',v_tx
    ); v_entity_id := nullif(v_result->>'order_id','');
  elsif v_operation='food_supplier_return' then
    v_result:=public.offline_food_supplier_return_create_v1((v_payload->>'p_branch_id')::bigint,nullif(v_payload->>'p_supplier_id','')::bigint,v_payload->>'p_notes',coalesce(v_payload->'p_items','[]'::jsonb),v_tx,v_digest); v_entity_id:=nullif(v_result->>'supplier_return_id','');
  elsif v_operation='food_stock_count' then
    v_result:=public.offline_food_stock_count_post_v1((v_payload->>'p_branch_id')::bigint,v_payload->>'p_notes',coalesce(v_payload->'p_items','[]'::jsonb),v_tx,v_digest); v_entity_id:=nullif(v_result->>'stock_count_id','');
  elsif v_operation='food_transfer_create' then
    v_result:=public.offline_food_stock_transfer_create_v1((v_payload->>'p_from_branch_id')::bigint,(v_payload->>'p_to_branch_id')::bigint,coalesce(v_payload->'p_items','[]'::jsonb),v_payload->>'p_notes',v_tx,v_digest); v_entity_id:=nullif(v_result->>'transfer_id','');
  elsif v_operation='food_transfer_receive' then
    v_result:=public.offline_food_stock_transfer_receive_v1((v_payload->>'p_transfer_id')::bigint,v_tx,v_digest); v_entity_id:=nullif(v_result->>'transfer_id','');
  elsif v_operation='food_transfer_cancel' then
    v_result:=public.offline_food_stock_transfer_cancel_v1((v_payload->>'p_transfer_id')::bigint,v_payload->>'p_reason',v_tx,v_digest); v_entity_id:=nullif(v_result->>'transfer_id','');
  elsif v_operation='food_ingredient_stock_adjust' then
    v_result:=public.offline_food_ingredient_stock_adjust_action_v2((v_payload->>'p_branch_id')::bigint,(v_payload->>'p_ingredient_id')::bigint,(v_payload->>'p_quantity_delta')::numeric,coalesce((v_payload->>'p_unit_cost')::numeric,0),v_payload->>'p_reason',v_tx,v_digest); v_entity_id:=nullif(v_result->>'adjustment_id','');
  elsif v_operation='food_production_start' then
    v_result:=public.offline_food_production_batch_start_action_v2((v_payload->>'p_branch_id')::bigint,(v_payload->>'p_prep_item_id')::bigint,(v_payload->>'p_planned_output_quantity')::numeric,v_payload->>'p_batch_number',v_payload->>'p_notes',v_tx,v_digest); v_entity_id:=nullif(v_result->>'production_batch_id','');
  elsif v_operation='food_production_complete' then
    v_result:=public.offline_food_production_batch_complete_action_v2((v_payload->>'p_production_batch_id')::bigint,(v_payload->>'p_actual_output_quantity')::numeric,coalesce(v_payload->'p_consumptions','[]'::jsonb),v_tx,v_payload->>'p_notes',v_digest); v_entity_id:=nullif(v_result->>'production_batch_id','');
  elsif v_operation='food_waste_post' then
    v_result:=public.offline_food_waste_post_action_v2((v_payload->>'p_branch_id')::bigint,(v_payload->>'p_ingredient_id')::bigint,nullif(v_payload->>'p_prep_item_id','')::bigint,nullif(v_payload->>'p_shift_id','')::bigint,v_payload->>'p_reason_code',(v_payload->>'p_quantity')::numeric,v_payload->>'p_unit_code',v_payload->>'p_notes',v_tx,v_digest); v_entity_id:=nullif(v_result->>'waste_event_id','');
  elsif v_operation='food_ingredient_save' then
    v_result:=public.offline_food_ingredient_save_action_v2(nullif(v_payload->>'p_ingredient_id','')::bigint,v_payload->>'p_name',v_payload->>'p_base_unit_code',v_payload->>'p_purchase_unit_code',v_payload->>'p_sku',v_payload->>'p_barcode',coalesce((v_payload->>'p_cost_per_base_unit')::numeric,0),coalesce((v_payload->>'p_minimum_quantity')::numeric,0),coalesce((v_payload->>'p_track_inventory')::boolean,true),coalesce((v_payload->>'p_usable_yield_percent')::numeric,100),nullif(v_payload->>'p_shelf_life_minutes','')::integer,coalesce((v_payload->>'p_active')::boolean,true),v_tx,v_digest); v_entity_id:=nullif(v_result->>'ingredient_id','');
  elsif v_operation='food_ingredient_conversion_save' then
    v_result:=public.offline_food_ingredient_conversion_save_action_v2((v_payload->>'p_ingredient_id')::bigint,v_payload->>'p_from_unit_code',v_payload->>'p_to_unit_code',(v_payload->>'p_factor')::numeric,coalesce((v_payload->>'p_active')::boolean,true),v_tx,v_digest); v_entity_id:=nullif(v_result->>'conversion_id','');
  elsif v_operation='food_recipe_save_draft' then
    v_result:=public.offline_food_recipe_save_draft_action_v2((v_payload->>'p_product_id')::bigint,nullif(v_payload->>'p_variant_id','')::bigint,v_payload->>'p_name',(v_payload->>'p_output_quantity')::numeric,v_payload->>'p_output_unit_code',coalesce(v_payload->'p_lines','[]'::jsonb),coalesce(v_payload->'p_modifier_impacts','[]'::jsonb),coalesce(v_payload->'p_removal_mappings','[]'::jsonb),v_payload->>'p_notes',v_tx,v_digest); v_entity_id:=nullif(v_result->>'recipe_version_id','');
  elsif v_operation='food_recipe_activate' then
    v_result:=public.offline_food_recipe_activate_version_action_v2((v_payload->>'p_recipe_version_id')::bigint,v_tx,v_digest); v_entity_id:=nullif(v_result->>'recipe_version_id','');
  elsif v_operation='food_prep_item_save' then
    v_result:=public.offline_food_prep_item_save_action_v2(nullif(v_payload->>'p_prep_item_id','')::bigint,v_payload->>'p_name',nullif(v_payload->>'p_output_ingredient_id','')::bigint,v_payload->>'p_base_unit_code',(v_payload->>'p_default_batch_quantity')::numeric,nullif(v_payload->>'p_shelf_life_minutes','')::integer,v_payload->>'p_notes',coalesce((v_payload->>'p_active')::boolean,true),v_tx,v_digest); v_entity_id:=nullif(v_result->>'prep_item_id','');
  elsif v_operation='food_prep_recipe_save_draft' then
    v_result:=public.offline_food_prep_recipe_save_draft_action_v2((v_payload->>'p_prep_item_id')::bigint,(v_payload->>'p_output_quantity')::numeric,v_payload->>'p_output_unit_code',coalesce(v_payload->'p_lines','[]'::jsonb),v_payload->>'p_notes',v_tx,v_digest); v_entity_id:=nullif(v_result->>'recipe_version_id','');
  elsif v_operation='retail_supplier_save' then
    v_result:=public.offline_retail_supplier_create_v1(v_payload->>'p_name',v_payload->>'p_phone',v_payload->>'p_tax_no',v_tx); v_entity_id:=nullif(v_result->>'supplier_id','');
  elsif v_operation='retail_po_create' then
    v_entity_id:=public.retail_purchase_order_create_v2(v_branch,(v_payload->>'p_supplier_id')::bigint,v_payload->>'p_notes',coalesce(v_payload->'p_items','[]'::jsonb),v_tx,v_payload->>'p_po_number',nullif(v_payload->>'p_expected_at','')::timestamptz)::text;
    v_result:=jsonb_build_object('ok',true,'purchase_order_id',v_entity_id::bigint,'client_tx_id',v_tx);
  elsif v_operation='retail_po_approve' then
    v_result:=public.offline_retail_purchase_order_approve_v1((v_payload->>'p_purchase_order_id')::bigint,v_tx); v_entity_id:=nullif(v_result->>'purchase_order_id','');
  elsif v_operation='retail_purchase_receive' then
    v_entity_id:=public.retail_purchase_receive_v2((v_payload->>'p_purchase_order_id')::bigint,coalesce(v_payload->'p_items','[]'::jsonb),v_tx)::text;
    v_result:=jsonb_build_object('ok',true,'goods_receipt_id',v_entity_id::bigint,'client_tx_id',v_tx);
  else
    v_entity_id:=public.retail_supplier_return_create_v2(v_branch,(v_payload->>'p_supplier_id')::bigint,v_payload->>'p_notes',coalesce(v_payload->'p_items','[]'::jsonb),v_tx)::text;
    v_result:=jsonb_build_object('ok',true,'supplier_return_id',v_entity_id::bigint,'client_tx_id',v_tx);
  end if;
  if v_entity_id is null then raise exception using errcode='22000', message='Offline V2 Phase 7 backend result missing entity id'; end if;

  v_event_id := 'ov2-'||md5(v_tx||':'||v_digest);
  insert into public.offline_v2_server_receipts(
    client_tx_id,server_event_id,protocol_version,payload_digest,operation_type,rpc_name,
    device_id,device_sequence,branch_id,employee_id,auth_user_id,server_entity_id,server_version,result_json
  ) values(v_tx,v_event_id,2,v_digest,v_operation,v_rpc,v_device_id,v_sequence,v_branch,v_employee,auth.uid(),v_entity_id,'transport-v1',v_result);

  return jsonb_build_object('ok',true,'acknowledged',true,'duplicate',false,'idempotent_replay',false,
    'client_tx_id',v_tx,'protocol_version',2,'payload_digest',v_digest,'server_event_id',v_event_id,
    'server_entity_id',v_entity_id,'server_version','transport-v1','result',v_result);
end;
$function$


-- sharawla_offline_v2_apply_event_reference_v1(p_event jsonb)
CREATE OR REPLACE FUNCTION public.sharawla_offline_v2_apply_event_reference_v1(p_event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_tx text := nullif(trim(coalesce(p_event->>'client_tx_id','')), '');
  v_digest text := nullif(trim(coalesce(p_event->>'payload_digest','')), '');
  v_operation text := nullif(trim(coalesce(p_event->>'operation_type','')), '');
  v_rpc text := nullif(trim(coalesce(p_event#>>'{payload,rpc_name}','')), '');
  v_payload jsonb := coalesce(p_event#>'{payload,rpc_payload}','{}'::jsonb);
  v_protocol integer := coalesce(nullif(p_event->>'protocol_version','')::integer,0);
  v_device_id text := nullif(trim(coalesce(p_event->>'device_id','')), '');
  v_sequence bigint := coalesce(nullif(p_event->>'device_sequence','')::bigint,0);
  v_branch bigint := coalesce(nullif(p_event->>'branch_id','')::bigint,0);
  v_employee bigint := coalesce(nullif(p_event->>'employee_id','')::bigint,0);
  v_current_employee bigint;
  v_dep_tx text := nullif(trim(coalesce(p_event->>'depends_on_tx_id','')), '');
  v_dep_map_tx text := nullif(trim(coalesce(p_event#>>'{dependency_mapping,client_tx_id}','')), '');
  v_dep_server_id text := nullif(trim(coalesce(p_event#>>'{dependency_mapping,server_id}','')), '');
  v_receipt public.offline_v2_server_receipts%rowtype;
  v_result jsonb;
  v_entity_id text;
  v_return_id bigint;
  v_event_id text;
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='غير مصرح';
  end if;
  if v_protocol <> 2 then
    raise exception using errcode='22023', message='Offline V2 protocol_version غير مدعوم';
  end if;
  if v_tx is null or v_digest is null or v_operation is null or v_rpc is null
     or v_device_id is null or v_sequence <= 0 or v_branch <= 0 or v_employee <= 0 then
    raise exception using errcode='22023', message='Offline V2 event contract غير مكتمل';
  end if;

  v_current_employee := public.current_employee_id();
  if v_current_employee is null or v_current_employee is distinct from v_employee then
    raise exception using errcode='42501', message='بيانات الموظف غير مطابقة لجلسة المزامنة';
  end if;

  -- Bind the envelope operation to one exact RPC family. An authenticated caller
  -- cannot relabel an expense as a sale or route arbitrary SQL through transport.
  if (v_operation='sale' and v_rpc not in (
        'create_pos_order_atomic','create_retail_pos_order_atomic','create_retail_variant_pos_order_atomic_v1',
        'create_food_pos_order_atomic_v1','create_food_retail_pos_order_atomic_v1'))
     or (v_operation='return' and v_rpc not in (
        'create_order_return_idempotent','create_retail_order_return_idempotent','create_retail_variant_order_return_idempotent_v1',
        'create_food_order_return_idempotent_v1','create_food_retail_order_return_idempotent_v1'))
     or (v_operation='expense' and v_rpc<>'create_pos_expense_idempotent')
     or (v_operation='shift_open' and v_rpc<>'open_pos_shift_idempotent')
     or (v_operation='shift_close' and v_rpc<>'close_pos_shift_idempotent')
     or (v_operation='order_status' and v_rpc<>'order_status_apply_offline_v2')
     or (v_operation='customer_create' and v_rpc<>'offline_customer_create_v1')
     or (v_operation='customer_update' and v_rpc<>'offline_customer_update_v1')
     or (v_operation='customer_address_save' and v_rpc<>'offline_customer_address_save_v1')
     or (v_operation='customer_address_delete' and v_rpc<>'offline_customer_address_delete_v1')
     or (v_operation='delivery_assign_driver' and v_rpc<>'offline_delivery_assign_driver_v1')
     or (v_operation='supplier_save' and v_rpc<>'offline_food_supplier_save_v1')
     or (v_operation='driver_save' and v_rpc<>'offline_delivery_driver_save_v1')
     or (v_operation='zone_save' and v_rpc<>'offline_delivery_zone_save_v1')
     or (v_operation='floor_save' and v_rpc<>'offline_restaurant_floor_save_v1')
     or (v_operation='table_save' and v_rpc<>'offline_restaurant_table_save_v1')
     or (v_operation='table_session_open' and v_rpc<>'restaurant_table_session_open_v1')
     or (v_operation='table_session_attach' and v_rpc<>'offline_restaurant_table_session_attach_v1')
     or (v_operation='table_session_close' and v_rpc<>'offline_restaurant_table_session_close_v1')
     or (v_operation='ingredient_save' and v_rpc<>'offline_food_ingredient_save_v1')
     or (v_operation='ingredient_conversion_save' and v_rpc<>'offline_food_ingredient_conversion_save_v1')
     or (v_operation='recipe_draft_save' and v_rpc<>'offline_food_recipe_save_draft_v1')
     or (v_operation='recipe_version_activate' and v_rpc<>'offline_food_recipe_activate_version_v1')
     or (v_operation='prep_item_save' and v_rpc<>'offline_food_prep_item_save_v1')
     or (v_operation='prep_recipe_draft_save' and v_rpc<>'offline_food_prep_recipe_save_draft_v1')
     or (v_operation='food_po_create' and v_rpc<>'offline_food_purchase_order_create_v1')
     or (v_operation='food_po_approve' and v_rpc<>'offline_food_purchase_order_approve_v1')
     or (v_operation='food_po_cancel' and v_rpc<>'offline_food_purchase_order_cancel_v1')
     or (v_operation='food_purchase_receive' and v_rpc<>'offline_food_purchase_receive_v1')
      or (v_operation='inventory_supply_request_submit' and v_rpc<>'offline_inventory_supply_request_submit_v1')
      or (v_operation='inventory_supply_request_decide' and v_rpc<>'offline_inventory_supply_request_decide_v1')
      or (v_operation='inventory_supply_request_prepare' and v_rpc<>'offline_inventory_supply_request_prepare_v1')
      or (v_operation='inventory_supply_request_dispatch' and v_rpc<>'offline_inventory_supply_request_dispatch_v1')
      or (v_operation='inventory_supply_request_receive' and v_rpc<>'offline_inventory_supply_request_receive_v1')
     or v_operation not in ('sale','return','expense','shift_open','shift_close','order_status','customer_create','customer_update','customer_address_save','customer_address_delete','delivery_assign_driver','supplier_save','driver_save','zone_save','floor_save','table_save','table_session_open','table_session_attach','table_session_close','ingredient_save','ingredient_conversion_save','recipe_draft_save','recipe_version_activate','prep_item_save','prep_recipe_draft_save','food_po_create','food_po_approve','food_po_cancel','food_purchase_receive','inventory_supply_request_submit','inventory_supply_request_decide','inventory_supply_request_prepare','inventory_supply_request_dispatch','inventory_supply_request_receive') then
    raise exception using errcode='22023', message='Offline V2 operation/RPC binding غير مدعومة';
  end if;

  -- The server idempotency key must be exactly the same durable client_tx_id that
  -- owns the local outbox row and explicit ACK.
  if v_operation='sale' then
    if nullif(trim(coalesce(v_payload#>>'{p_order,client_tx_id}','')),'') is distinct from v_tx
       or coalesce(nullif(v_payload#>>'{p_order,branch_id}','')::bigint,0) is distinct from v_branch
       or coalesce(nullif(v_payload#>>'{p_order,employee_id}','')::bigint,0) is distinct from v_employee then
      raise exception using errcode='22023', message='Offline V2 sale identity/TX mismatch';
    end if;
  else
    if nullif(trim(coalesce(v_payload->>'p_client_tx_id','')),'') is distinct from v_tx then
      raise exception using errcode='22023', message='Offline V2 RPC client_tx_id mismatch';
    end if;
    if v_operation='order_status' and (coalesce(nullif(v_payload->>'p_order_id','')::bigint,0)<=0 or nullif(trim(coalesce(v_payload->>'p_target_status','')),'') is null) then
      raise exception using errcode='22023', message='Offline V2 order status payload invalid';
    end if;
    if v_operation='shift_open' and coalesce(nullif(v_payload->>'p_branch_id','')::bigint,0) is distinct from v_branch then
      raise exception using errcode='22023', message='Offline V2 shift branch mismatch';
    end if;
  end if;

  if v_dep_tx is not null then
    if v_dep_server_id is null or v_dep_map_tx is distinct from v_dep_tx then
      raise exception using errcode='22023', message='Offline V2 dependency mapping غير مكتملة';
    end if;
    if v_operation='sale' then
      v_payload := jsonb_set(v_payload,'{p_order,shift_id}',to_jsonb(v_dep_server_id::bigint),true);
    elsif v_operation in ('expense','shift_close') then
      v_payload := jsonb_set(v_payload,'{p_shift_id}',to_jsonb(v_dep_server_id::bigint),true);
    elsif v_operation in ('return','order_status','delivery_assign_driver') then
      v_payload := jsonb_set(v_payload,'{p_order_id}',to_jsonb(v_dep_server_id::bigint),true);
    elsif v_operation='customer_update' then
      v_payload := jsonb_set(v_payload,'{p_customer_id}',to_jsonb(v_dep_server_id::bigint),true);
    elsif v_operation='customer_address_save' and nullif(trim(coalesce(v_payload->>'p_address_save_tx','')),'') is not null then
      v_payload := jsonb_set(v_payload,'{p_address_id}',to_jsonb(v_dep_server_id::bigint),true);
    elsif v_operation='customer_address_save' then
      v_payload := jsonb_set(v_payload,'{p_customer_id}',to_jsonb(v_dep_server_id::bigint),true);
    elsif v_operation='customer_address_delete' then
      v_payload := jsonb_set(v_payload,'{p_address_id}',to_jsonb(v_dep_server_id::bigint),true);
    elsif v_operation='ingredient_conversion_save' then
      v_payload := jsonb_set(v_payload,'{p_ingredient_id}',to_jsonb(v_dep_server_id::bigint),true);
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('offline-v2:'||v_tx,0));
  select * into v_receipt
  from public.offline_v2_server_receipts where business_id=public.current_business_id() and client_tx_id=v_tx;

  if found then
    if v_receipt.payload_digest is distinct from v_digest
       or v_receipt.rpc_name is distinct from v_rpc
       or v_receipt.operation_type is distinct from v_operation
       or v_receipt.device_id is distinct from v_device_id
       or v_receipt.device_sequence is distinct from v_sequence
       or v_receipt.branch_id is distinct from v_branch
       or v_receipt.employee_id is distinct from v_employee
       or v_receipt.auth_user_id is distinct from auth.uid() then
      raise exception using errcode='22000', message='Offline V2 duplicate TX payload/identity mismatch';
    end if;
    return jsonb_build_object(
      'ok',true,
      'acknowledged',false,
      'duplicate',true,
      'idempotent_replay',true,
      'client_tx_id',v_receipt.client_tx_id,
      'protocol_version',v_receipt.protocol_version,
      'payload_digest',v_receipt.payload_digest,
      'server_event_id',v_receipt.server_event_id,
      'server_entity_id',v_receipt.server_entity_id,
      'server_version',v_receipt.server_version,
      'result',v_receipt.result_json
    );
  end if;

  case v_rpc
    when 'create_pos_order_atomic' then
      v_result := public.create_pos_order_atomic(v_payload->'p_order',v_payload->'p_items',v_payload->'p_payments');
      v_entity_id := nullif(v_result#>>'{order,id}','');
    when 'create_retail_pos_order_atomic' then
      v_result := public.create_retail_pos_order_atomic(v_payload->'p_order',v_payload->'p_items',v_payload->'p_payments');
      v_entity_id := nullif(v_result#>>'{order,id}','');
    when 'create_retail_variant_pos_order_atomic_v1' then
      v_result := public.create_retail_variant_pos_order_atomic_v1(v_payload->'p_order',v_payload->'p_items',v_payload->'p_payments');
      v_entity_id := nullif(v_result#>>'{order,id}','');
    when 'create_food_pos_order_atomic_v1' then
      v_result := public.create_food_pos_order_atomic_v1(v_payload->'p_order',v_payload->'p_items',v_payload->'p_payments');
      v_entity_id := nullif(v_result#>>'{order,id}','');
    when 'create_food_retail_pos_order_atomic_v1' then
      v_result := public.create_food_retail_pos_order_atomic_v1(v_payload->'p_order',v_payload->'p_items',v_payload->'p_payments',coalesce((v_payload->>'p_use_variants')::boolean,false));
      v_entity_id := nullif(v_result#>>'{order,id}','');

    when 'create_order_return_idempotent' then
      v_return_id := public.create_order_return_idempotent((v_payload->>'p_order_id')::bigint,v_payload->>'p_reason',v_payload->>'p_notes',v_payload->'p_items',v_payload->'p_payments',v_payload->>'p_client_tx_id');
      v_entity_id := v_return_id::text; v_result := jsonb_build_object('return_id',v_return_id);
    when 'create_retail_order_return_idempotent' then
      v_return_id := public.create_retail_order_return_idempotent((v_payload->>'p_order_id')::bigint,v_payload->>'p_reason',v_payload->>'p_notes',v_payload->'p_items',v_payload->'p_payments',v_payload->>'p_client_tx_id');
      v_entity_id := v_return_id::text; v_result := jsonb_build_object('return_id',v_return_id);
    when 'create_retail_variant_order_return_idempotent_v1' then
      v_return_id := public.create_retail_variant_order_return_idempotent_v1((v_payload->>'p_order_id')::bigint,v_payload->>'p_reason',v_payload->>'p_notes',v_payload->'p_items',v_payload->'p_payments',v_payload->>'p_client_tx_id');
      v_entity_id := v_return_id::text; v_result := jsonb_build_object('return_id',v_return_id);
    when 'create_food_order_return_idempotent_v1' then
      v_return_id := public.create_food_order_return_idempotent_v1((v_payload->>'p_order_id')::bigint,v_payload->>'p_reason',v_payload->>'p_notes',v_payload->'p_items',v_payload->'p_payments',v_payload->>'p_client_tx_id');
      v_entity_id := v_return_id::text; v_result := jsonb_build_object('return_id',v_return_id);
    when 'create_food_retail_order_return_idempotent_v1' then
      v_return_id := public.create_food_retail_order_return_idempotent_v1((v_payload->>'p_order_id')::bigint,v_payload->>'p_reason',v_payload->>'p_notes',v_payload->'p_items',v_payload->'p_payments',v_payload->>'p_client_tx_id',coalesce((v_payload->>'p_use_variants')::boolean,false));
      v_entity_id := v_return_id::text; v_result := jsonb_build_object('return_id',v_return_id);

    when 'create_pos_expense_idempotent' then
      v_result := public.create_pos_expense_idempotent((v_payload->>'p_shift_id')::bigint,v_payload->>'p_description',(v_payload->>'p_amount')::numeric,v_payload->>'p_client_tx_id');
      v_entity_id := nullif(v_result->>'id','');
    when 'open_pos_shift_idempotent' then
      v_result := public.open_pos_shift_idempotent((v_payload->>'p_branch_id')::bigint,(v_payload->>'p_opening_cash')::numeric,v_payload->>'p_client_tx_id');
      v_entity_id := nullif(v_result->>'id','');
    when 'close_pos_shift_idempotent' then
      v_result := public.close_pos_shift_idempotent((v_payload->>'p_shift_id')::bigint,(v_payload->>'p_closing_cash')::numeric,v_payload->'p_metrics',v_payload->>'p_client_tx_id');
      v_entity_id := nullif(v_result->>'id','');
    when 'order_status_apply_offline_v2' then
      v_result := public.order_status_apply_offline_v2((v_payload->>'p_order_id')::bigint,v_payload->>'p_target_status',v_payload->>'p_client_tx_id');
      v_entity_id := (v_payload->>'p_order_id');
    when 'offline_customer_create_v1' then
      v_result := public.offline_customer_create_v1(v_payload->>'p_name',v_payload->>'p_phone',v_payload->>'p_area',v_payload->>'p_address',v_payload->>'p_notes',v_payload->>'p_client_tx_id',v_digest);
      v_entity_id := nullif(v_result->>'customer_id','');
    when 'offline_customer_update_v1' then
      v_result := public.offline_customer_update_v1((v_payload->>'p_customer_id')::bigint,v_payload->>'p_name',v_payload->>'p_phone',v_payload->>'p_area',v_payload->>'p_address',v_payload->>'p_notes',v_payload->>'p_client_tx_id',v_digest);
      v_entity_id := nullif(v_result->>'customer_id','');
    when 'offline_customer_address_save_v1' then
      v_result := public.offline_customer_address_save_v1(nullif(v_payload->>'p_address_id','')::bigint,(v_payload->>'p_customer_id')::bigint,v_payload->>'p_label',v_payload->>'p_area',v_payload->>'p_address',v_payload->>'p_notes',coalesce((v_payload->>'p_is_default')::boolean,false),v_payload->>'p_client_tx_id',v_digest);
      v_entity_id := nullif(v_result->>'address_id','');
    when 'offline_customer_address_delete_v1' then
      v_result := public.offline_customer_address_delete_v1((v_payload->>'p_address_id')::bigint,v_payload->>'p_client_tx_id',v_digest);
      v_entity_id := nullif(v_result->>'address_id','');
    when 'offline_delivery_assign_driver_v1' then
      v_result := public.offline_delivery_assign_driver_v1((v_payload->>'p_order_id')::bigint,(v_payload->>'p_driver_id')::bigint,v_payload->>'p_client_tx_id',v_digest);
      v_entity_id := (v_payload->>'p_order_id');
    when 'restaurant_table_session_open_v1' then
      v_return_id := public.restaurant_table_session_open_v1((v_payload->>'p_table_id')::bigint,(v_payload->>'p_guest_count')::integer,v_payload->>'p_notes',v_payload->>'p_client_tx_id');
      v_entity_id := v_return_id::text; v_result := jsonb_build_object('ok',true,'session_id',v_return_id,'client_tx_id',v_payload->>'p_client_tx_id');
    when 'offline_restaurant_table_session_attach_v1' then
      v_result := public.offline_restaurant_table_session_attach_v1(nullif(v_payload->>'p_session_id','')::bigint,v_payload->>'p_session_open_tx',nullif(v_payload->>'p_order_id','')::bigint,v_payload->>'p_order_sale_tx',v_payload->>'p_client_tx_id',v_digest);
      v_entity_id := nullif(v_result->>'session_id','');
    when 'offline_restaurant_table_session_close_v1' then
      v_result := public.offline_restaurant_table_session_close_v1(nullif(v_payload->>'p_session_id','')::bigint,v_payload->>'p_session_open_tx',v_payload->>'p_notes',v_payload->>'p_client_tx_id',v_digest);
      v_entity_id := nullif(v_result->>'session_id','');
    when 'offline_food_supplier_save_v1' then
      v_result := public.offline_food_supplier_save_v1(nullif(v_payload->>'p_supplier_id','')::bigint,v_payload->>'p_name',v_payload->>'p_phone',v_payload->>'p_email',v_payload->>'p_tax_no',v_payload->>'p_address',v_payload->>'p_notes',coalesce((v_payload->>'p_active')::boolean,true),v_payload->>'p_client_tx_id',v_digest);
      v_entity_id := nullif(v_result->>'supplier_id','');
    when 'offline_food_ingredient_save_v1' then
      v_result := public.offline_food_ingredient_save_v1(nullif(v_payload->>'p_ingredient_id','')::bigint,v_payload->>'p_name',v_payload->>'p_base_unit_code',v_payload->>'p_purchase_unit_code',v_payload->>'p_sku',v_payload->>'p_barcode',coalesce((v_payload->>'p_cost_per_base_unit')::numeric,0),coalesce((v_payload->>'p_minimum_quantity')::numeric,0),coalesce((v_payload->>'p_track_inventory')::boolean,true),coalesce((v_payload->>'p_usable_yield_percent')::numeric,100),nullif(v_payload->>'p_shelf_life_minutes','')::integer,coalesce((v_payload->>'p_active')::boolean,true),v_payload->>'p_client_tx_id',v_digest);
      v_entity_id := nullif(v_result->>'ingredient_id','');
    when 'offline_food_ingredient_conversion_save_v1' then
      v_result := public.offline_food_ingredient_conversion_save_v1(nullif(v_payload->>'p_ingredient_id','')::bigint,v_payload->>'p_ingredient_create_tx',v_payload->>'p_from_unit_code',v_payload->>'p_to_unit_code',(v_payload->>'p_factor')::numeric,coalesce((v_payload->>'p_active')::boolean,true),v_payload->>'p_client_tx_id',v_digest);
      v_entity_id := nullif(v_result->>'conversion_id','');
    when 'offline_food_recipe_save_draft_v1' then
      v_result := public.offline_food_recipe_save_draft_v1(nullif(v_payload->>'p_product_id','')::bigint,nullif(v_payload->>'p_variant_id','')::bigint,v_payload->>'p_name',(v_payload->>'p_output_quantity')::numeric,v_payload->>'p_output_unit_code',coalesce(v_payload->'p_lines','[]'::jsonb),coalesce(v_payload->'p_modifier_impacts','[]'::jsonb),coalesce(v_payload->'p_removal_mappings','[]'::jsonb),v_payload->>'p_notes',v_payload->>'p_client_tx_id',v_digest);
      v_entity_id := nullif(v_result->>'recipe_version_id','');
    when 'offline_food_recipe_activate_version_v1' then
      v_result := public.offline_food_recipe_activate_version_v1((v_payload->>'p_recipe_version_id')::bigint,v_payload->>'p_client_tx_id',v_digest);
      v_entity_id := nullif(v_result->>'recipe_version_id','');
    when 'offline_food_prep_item_save_v1' then
      v_result := public.offline_food_prep_item_save_v1(nullif(v_payload->>'p_prep_item_id','')::bigint,v_payload->>'p_name',nullif(v_payload->>'p_output_ingredient_id','')::bigint,v_payload->>'p_base_unit_code',(v_payload->>'p_default_batch_quantity')::numeric,nullif(v_payload->>'p_shelf_life_minutes','')::integer,v_payload->>'p_notes',coalesce((v_payload->>'p_active')::boolean,true),v_payload->>'p_client_tx_id',v_digest);
      v_entity_id := nullif(v_result->>'prep_item_id','');
    when 'offline_food_prep_recipe_save_draft_v1' then
      v_result := public.offline_food_prep_recipe_save_draft_v1((v_payload->>'p_prep_item_id')::bigint,(v_payload->>'p_output_quantity')::numeric,v_payload->>'p_output_unit_code',coalesce(v_payload->'p_lines','[]'::jsonb),v_payload->>'p_notes',v_payload->>'p_client_tx_id',v_digest);
      v_entity_id := nullif(v_result->>'recipe_version_id','');
    when 'offline_food_purchase_order_create_v1' then
      v_result := public.offline_food_purchase_order_create_v1((v_payload->>'p_branch_id')::bigint,(v_payload->>'p_supplier_id')::bigint,v_payload->>'p_invoice_number',v_payload->>'p_notes',coalesce(v_payload->'p_items','[]'::jsonb),v_payload->>'p_client_tx_id',v_digest);
      v_entity_id := nullif(v_result->>'purchase_id','');
    when 'offline_food_purchase_order_approve_v1' then
      v_result := public.offline_food_purchase_order_approve_v1((v_payload->>'p_purchase_id')::bigint,v_payload->>'p_client_tx_id',v_digest);
      v_entity_id := nullif(v_result->>'purchase_id','');
    when 'offline_food_purchase_order_cancel_v1' then
      v_result := public.offline_food_purchase_order_cancel_v1((v_payload->>'p_purchase_id')::bigint,v_payload->>'p_reason',v_payload->>'p_client_tx_id',v_digest);
      v_entity_id := nullif(v_result->>'purchase_id','');
    when 'offline_inventory_supply_request_submit_v1' then
       v_result := public.offline_inventory_supply_request_submit_v1((v_payload->>'p_request_id')::bigint,v_payload->>'p_client_tx_id',v_digest);
       v_entity_id := (v_payload->>'p_request_id');
     when 'offline_inventory_supply_request_decide_v1' then
       v_result := public.offline_inventory_supply_request_decide_v1((v_payload->>'p_request_id')::bigint,coalesce((v_payload->>'p_approve')::boolean,false),coalesce(v_payload->'p_approved_items','[]'::jsonb),v_payload->>'p_note',v_payload->>'p_client_tx_id',v_digest);
       v_entity_id := (v_payload->>'p_request_id');
     when 'offline_inventory_supply_request_prepare_v1' then
       v_result := public.offline_inventory_supply_request_prepare_v1((v_payload->>'p_request_id')::bigint,v_payload->>'p_note',v_payload->>'p_client_tx_id',v_digest);
       v_entity_id := (v_payload->>'p_request_id');
     when 'offline_inventory_supply_request_dispatch_v1' then
       v_result := public.offline_inventory_supply_request_dispatch_v1((v_payload->>'p_request_id')::bigint,coalesce(v_payload->'p_items','[]'::jsonb),v_payload->>'p_note',v_payload->>'p_client_tx_id',v_digest);
       v_entity_id := (v_payload->>'p_request_id');
     when 'offline_inventory_supply_request_receive_v1' then
       v_result := public.offline_inventory_supply_request_receive_v1((v_payload->>'p_request_id')::bigint,coalesce(v_payload->'p_items','[]'::jsonb),coalesce((v_payload->>'p_final')::boolean,false),v_payload->>'p_note',v_payload->>'p_client_tx_id',v_digest);
       v_entity_id := (v_payload->>'p_request_id');
     when 'offline_food_purchase_receive_v1' then
      v_result := public.offline_food_purchase_receive_v1((v_payload->>'p_purchase_id')::bigint,coalesce(v_payload->'p_items','[]'::jsonb),v_payload->>'p_client_tx_id',v_digest);
      v_entity_id := nullif(v_result->>'receipt_id','');
    else
      raise exception using errcode='22023', message='Offline V2 RPC غير مدعومة: '||coalesce(v_rpc,'');
  end case;

  if v_entity_id is null then
    raise exception using errcode='22000', message='Offline V2 backend result missing server entity id';
  end if;

  v_event_id := 'ov2-'||md5(v_tx||':'||v_digest);
  insert into public.offline_v2_server_receipts(
    client_tx_id,server_event_id,protocol_version,payload_digest,operation_type,rpc_name,
    device_id,device_sequence,branch_id,employee_id,auth_user_id,server_entity_id,server_version,result_json
  ) values (
    v_tx,v_event_id,2,v_digest,v_operation,v_rpc,v_device_id,v_sequence,v_branch,v_employee,
    auth.uid(),v_entity_id,'transport-v1',v_result
  );

  return jsonb_build_object(
    'ok',true,
    'acknowledged',true,
    'duplicate',false,
    'idempotent_replay',false,
    'client_tx_id',v_tx,
    'protocol_version',2,
    'payload_digest',v_digest,
    'server_event_id',v_event_id,
    'server_entity_id',v_entity_id,
    'server_version','transport-v1',
    'result',v_result
  );
end;
$function$


-- sharawla_offline_v2_apply_retail_resume_event_v1(p_event jsonb)
CREATE OR REPLACE FUNCTION public.sharawla_offline_v2_apply_retail_resume_event_v1(p_event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(p_event->>'client_tx_id'),''); v_digest text:=nullif(trim(p_event->>'payload_digest'),''); v_payload jsonb:=coalesce(p_event#>'{payload,rpc_payload}','{}'::jsonb); v_branch bigint:=coalesce(nullif(p_event->>'branch_id','')::bigint,0); v_employee bigint:=coalesce(nullif(p_event->>'employee_id','')::bigint,0); v_id bigint:=coalesce(nullif(v_payload->>'p_suspend_id','')::bigint,nullif(p_event#>>'{dependency_mapping,server_id}','')::bigint); v_r public.offline_v2_server_receipts%rowtype; v_event text;
begin
 if auth.uid() is null or v_tx is null or v_digest is null or p_event->>'operation_type'<>'retail_resume_sale' or p_event#>>'{payload,rpc_name}'<>'offline_retail_resume_sale_v1' then raise exception using errcode='22023',message='Retail resume Offline V2 event invalid'; end if;
 if public.current_employee_id() is distinct from v_employee or coalesce(nullif(v_payload->>'p_branch_id','')::bigint,0) is distinct from v_branch or nullif(trim(v_payload->>'p_client_tx_id'),'') is distinct from v_tx or not public.has_branch_access(v_branch) or v_id is null then raise exception using errcode='42501',message='Retail resume identity/branch mismatch'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-v2:'||v_tx,0)); select * into v_r from public.offline_v2_server_receipts where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if v_r.payload_digest is distinct from v_digest or v_r.operation_type<>'retail_resume_sale' then raise exception using errcode='22000',message='Offline V2 duplicate TX mismatch'; end if; return jsonb_build_object('ok',true,'acknowledged',false,'duplicate',true,'idempotent_replay',true,'client_tx_id',v_tx,'protocol_version',2,'payload_digest',v_digest,'server_event_id',v_r.server_event_id,'server_entity_id',v_r.server_entity_id,'server_version',v_r.server_version,'result',v_r.result_json); end if;
 if not exists(select 1 from public.retail_suspended_sales where id=v_id and branch_id=v_branch) then raise exception using errcode='P0001',message='الفاتورة المعلقة غير موجودة في هذا الفرع'; end if;
 delete from public.retail_suspended_sales where id=v_id and branch_id=v_branch;
 v_event:='ov2-'||md5(v_tx||':'||v_digest); insert into public.offline_v2_server_receipts(client_tx_id,server_event_id,protocol_version,payload_digest,operation_type,rpc_name,device_id,device_sequence,branch_id,employee_id,auth_user_id,server_entity_id,server_version,result_json) values(v_tx,v_event,2,v_digest,'retail_resume_sale','offline_retail_resume_sale_v1',p_event->>'device_id',(p_event->>'device_sequence')::bigint,v_branch,v_employee,auth.uid(),v_id::text,'retail-hold-v1',jsonb_build_object('suspended_sale_id',v_id,'resumed',true));
 return jsonb_build_object('ok',true,'acknowledged',true,'duplicate',false,'idempotent_replay',false,'client_tx_id',v_tx,'protocol_version',2,'payload_digest',v_digest,'server_event_id',v_event,'server_entity_id',v_id::text,'server_version','retail-hold-v1','result',jsonb_build_object('suspended_sale_id',v_id,'resumed',true));
end $function$


-- sharawla_offline_v2_apply_retail_suspend_event_v1(p_event jsonb)
CREATE OR REPLACE FUNCTION public.sharawla_offline_v2_apply_retail_suspend_event_v1(p_event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_tx text:=nullif(trim(p_event->>'client_tx_id'),''); v_digest text:=nullif(trim(p_event->>'payload_digest'),''); v_payload jsonb:=coalesce(p_event#>'{payload,rpc_payload}','{}'::jsonb); v_branch bigint:=coalesce(nullif(p_event->>'branch_id','')::bigint,0); v_employee bigint:=coalesce(nullif(p_event->>'employee_id','')::bigint,0); v_id bigint; v_r public.offline_v2_server_receipts%rowtype; v_event text;
begin
 if auth.uid() is null or v_tx is null or v_digest is null or p_event->>'operation_type'<>'retail_suspend_sale' or p_event#>>'{payload,rpc_name}'<>'offline_retail_suspend_sale_v1' then raise exception using errcode='22023',message='Retail suspend Offline V2 event invalid'; end if;
 if public.current_employee_id() is distinct from v_employee or coalesce(nullif(v_payload->>'p_branch_id','')::bigint,0) is distinct from v_branch or nullif(trim(v_payload->>'p_client_tx_id'),'') is distinct from v_tx or not public.has_branch_access(v_branch) then raise exception using errcode='42501',message='Retail suspend identity/branch mismatch'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-v2:'||v_tx,0)); select * into v_r from public.offline_v2_server_receipts where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then if v_r.payload_digest is distinct from v_digest or v_r.operation_type<>'retail_suspend_sale' then raise exception using errcode='22000',message='Offline V2 duplicate TX mismatch'; end if; return jsonb_build_object('ok',true,'acknowledged',false,'duplicate',true,'idempotent_replay',true,'client_tx_id',v_tx,'protocol_version',2,'payload_digest',v_digest,'server_event_id',v_r.server_event_id,'server_entity_id',v_r.server_entity_id,'server_version',v_r.server_version,'result',v_r.result_json); end if;
 insert into public.retail_suspended_sales(branch_id,employee_id,label,cart,customer,financial) values(v_branch,v_employee,nullif(trim(coalesce(v_payload->>'p_label','')),''),coalesce(v_payload->'p_cart','[]'::jsonb),coalesce(v_payload->'p_customer','{}'::jsonb),coalesce(v_payload->'p_financial','{}'::jsonb)) returning id into v_id;
 v_event:='ov2-'||md5(v_tx||':'||v_digest); insert into public.offline_v2_server_receipts(client_tx_id,server_event_id,protocol_version,payload_digest,operation_type,rpc_name,device_id,device_sequence,branch_id,employee_id,auth_user_id,server_entity_id,server_version,result_json) values(v_tx,v_event,2,v_digest,'retail_suspend_sale','offline_retail_suspend_sale_v1',p_event->>'device_id',(p_event->>'device_sequence')::bigint,v_branch,v_employee,auth.uid(),v_id::text,'retail-hold-v1',jsonb_build_object('suspended_sale_id',v_id));
 return jsonb_build_object('ok',true,'acknowledged',true,'duplicate',false,'idempotent_replay',false,'client_tx_id',v_tx,'protocol_version',2,'payload_digest',v_digest,'server_event_id',v_event,'server_entity_id',v_id::text,'server_version','retail-hold-v1','result',jsonb_build_object('suspended_sale_id',v_id));
end $function$


-- sharawla_offline_v2_prepare_stock_event_v1(p_event jsonb)
CREATE OR REPLACE FUNCTION public.sharawla_offline_v2_prepare_stock_event_v1(p_event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
 v_tx text:=nullif(trim(coalesce(p_event->>'client_tx_id','')),'');v_digest text:=nullif(trim(coalesce(p_event->>'payload_digest','')),'');
 v_operation text:=nullif(trim(coalesce(p_event->>'operation_type','')),'');v_rpc text:=nullif(trim(coalesce(p_event#>>'{payload,rpc_name}','')),'');
 v_payload jsonb:=coalesce(p_event#>'{payload,rpc_payload}','{}'::jsonb);v_protocol integer:=coalesce(nullif(p_event->>'protocol_version','')::integer,0);
 v_device text:=nullif(trim(coalesce(p_event->>'device_id','')),'');v_sequence bigint:=coalesce(nullif(p_event->>'device_sequence','')::bigint,0);
 v_branch bigint:=coalesce(nullif(p_event->>'branch_id','')::bigint,0);v_employee bigint:=coalesce(nullif(p_event->>'employee_id','')::bigint,0);
 v_receipt public.offline_v2_server_receipts%rowtype;v_context jsonb;v_envelope jsonb;v_stock_identities jsonb:='[]'::jsonb;v_order_id bigint;v_use_variants boolean:=false;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='غير مصرح';end if;
 if v_protocol<>2 or v_tx is null or v_digest is null or v_operation is null or v_rpc is null or v_device is null or v_sequence<=0 or v_branch<=0 or v_employee<=0 then raise exception using errcode='22023',message='Offline V2 preparation contract غير مكتمل';end if;
 if public.current_employee_id() is distinct from v_employee then raise exception using errcode='42501',message='بيانات الموظف غير مطابقة لجلسة المزامنة';end if;
 select * into v_receipt from public.offline_v2_server_receipts where business_id=public.current_business_id() and client_tx_id=v_tx;
 if found then
  if v_receipt.payload_digest is distinct from v_digest or v_receipt.rpc_name is distinct from v_rpc or v_receipt.operation_type is distinct from v_operation or v_receipt.device_id is distinct from v_device or v_receipt.device_sequence is distinct from v_sequence or v_receipt.branch_id is distinct from v_branch or v_receipt.employee_id is distinct from v_employee or v_receipt.auth_user_id is distinct from auth.uid() then raise exception using errcode='22000',message='Offline V2 duplicate TX payload/identity mismatch';end if;
  return jsonb_build_object('classification','FULL_REPLAY','client_tx_id',v_tx,'payload_digest',v_digest,'operation_type',v_operation,'rpc_name',v_rpc,'branch_id',v_branch,'authoritative_for_execution',false);
 end if;

 if v_operation='sale' and v_rpc in('create_food_pos_order_atomic_v1','create_food_retail_pos_order_atomic_v1') then
  v_context:=public.food_resolve_operation_stock_context_v1(v_tx,v_branch,coalesce(v_payload->'p_items','[]'::jsonb),statement_timestamp());
  v_envelope:=jsonb_build_object('contract','sharawla.point4.offline-stock-context.v1','context_version',1,'context_digest',md5(v_context::text),'context',v_context);
  select coalesce(jsonb_agg(jsonb_build_object('location_id',q.location_id,'item_kind','ingredient','item_id',q.item_id) order by q.location_id,q.item_id),'[]'::jsonb) into v_stock_identities
  from (select distinct (e->>'branch_id')::bigint location_id,(e->>'ingredient_id')::bigint item_id from jsonb_array_elements(v_context->'lines') l cross join lateral jsonb_array_elements(coalesce(l->'effects','[]'::jsonb)) e where coalesce((e->>'track_inventory')::boolean,true)) q;
 elsif v_operation='sale' and v_rpc='create_retail_pos_order_atomic' then
  select coalesce(jsonb_agg(jsonb_build_object('location_id',v_branch,'item_kind','product','item_id',q.item_id) order by q.item_id),'[]'::jsonb) into v_stock_identities
  from (select distinct nullif(x->>'product_id','')::bigint item_id from jsonb_array_elements(coalesce(v_payload->'p_items','[]'::jsonb)) x where nullif(x->>'product_id','') is not null) q;
 elsif v_operation='sale' and v_rpc='create_retail_variant_pos_order_atomic_v1' then
  select coalesce(jsonb_agg(jsonb_build_object('location_id',v_branch,'item_kind',q.item_kind,'item_id',q.item_id) order by q.item_kind,q.item_id),'[]'::jsonb) into v_stock_identities
  from (select distinct case when nullif(x->>'variant_id','') is not null then 'variant' else 'product' end item_kind,coalesce(nullif(x->>'variant_id','')::bigint,nullif(x->>'product_id','')::bigint) item_id from jsonb_array_elements(coalesce(v_payload->'p_items','[]'::jsonb)) x where coalesce(nullif(x->>'variant_id',''),nullif(x->>'product_id','')) is not null) q;
 elsif v_operation='return' and v_rpc in('create_retail_order_return_idempotent','create_retail_variant_order_return_idempotent_v1','create_food_order_return_idempotent_v1','create_food_retail_order_return_idempotent_v1') then
  v_order_id:=nullif(v_payload->>'p_order_id','')::bigint;
  if v_order_id is null then raise exception 'Offline return order identity غير مكتملة';end if;
  if v_rpc='create_retail_variant_order_return_idempotent_v1' then v_use_variants:=true;elsif v_rpc='create_food_retail_order_return_idempotent_v1' then v_use_variants:=coalesce((v_payload->>'p_use_variants')::boolean,false);end if;
  if v_rpc in('create_retail_order_return_idempotent','create_retail_variant_order_return_idempotent_v1','create_food_retail_order_return_idempotent_v1') then
   select coalesce(jsonb_agg(jsonb_build_object('location_id',v_branch,'item_kind',q.item_kind,'item_id',q.item_id) order by q.item_kind,q.item_id),'[]'::jsonb) into v_stock_identities
   from (select distinct case when v_use_variants and oi.variant_id is not null then 'variant' else 'product' end item_kind,case when v_use_variants and oi.variant_id is not null then oi.variant_id else oi.product_id end item_id from jsonb_array_elements(coalesce(v_payload->'p_items','[]'::jsonb)) x join public.order_items oi on oi.id=nullif(x->>'order_item_id','')::bigint and oi.order_id=v_order_id where oi.product_id is not null) q;
  end if;
  if v_rpc in('create_food_order_return_idempotent_v1','create_food_retail_order_return_idempotent_v1') then
   select coalesce(v_stock_identities,'[]'::jsonb)||coalesce(jsonb_agg(jsonb_build_object('location_id',v_branch,'item_kind','ingredient','item_id',q.item_id) order by q.item_id),'[]'::jsonb) into v_stock_identities
   from (select distinct s.ingredient_id item_id from jsonb_array_elements(coalesce(v_payload->'p_items','[]'::jsonb)) x join public.order_items oi on oi.id=nullif(x->>'order_item_id','')::bigint and oi.order_id=v_order_id join public.food_order_item_consumption_snapshots s on s.order_item_id=oi.id where exists(select 1 from public.stock_movements sm where sm.reference_type='order_item' and sm.reference_id=oi.id and sm.ingredient_id=s.ingredient_id and sm.movement_type='sale' and sm.quantity<0)) q;
  end if;
 end if;
 return jsonb_build_object('classification','EXECUTION_REQUIRED','client_tx_id',v_tx,'payload_digest',v_digest,'operation_type',v_operation,'rpc_name',v_rpc,'branch_id',v_branch,'authoritative_for_execution',false,'context_envelope',v_envelope,'stock_identities',coalesce(v_stock_identities,'[]'::jsonb));
end;$function$


-- Maintenance/test utilities are not app APIs.
revoke all on function reset_pos_data(text[]) from public,anon,authenticated;
revoke all on function reset_pos_data_v7(bigint,text[]) from public,anon,authenticated;
revoke all on function sharawla_acceptance_cleanup_v1(text) from public,anon,authenticated;
revoke all on function sharawla_acceptance_cleanup_v2(text) from public,anon,authenticated;
revoke all on function sharawla_acceptance_cleanup_v3(text) from public,anon,authenticated;
revoke all on function sharawla_acceptance_customer_delete_cleanup_v1() from public,anon,authenticated;
revoke all on function sharawla_acceptance_scan_v1(text) from public,anon,authenticated;
revoke all on function sharawla_acceptance_scan_v2(text) from public,anon,authenticated;
revoke all on function sharawla_acceptance_scan_v3(text) from public,anon,authenticated;

-- Runtime proof: every receipt-touching runtime function must now contain an
-- explicit tenant receipt predicate. Maintenance/reset utilities are excluded
-- from app roles above and remain migration/admin-only.
do $runtime_receipt_proof$
declare bad text;
begin
  with f as (
    select p.oid,p.proname,pg_get_function_identity_arguments(p.oid) args,
           lower(pg_get_functiondef(p.oid)) def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname !~ '^(sharawla_acceptance_|reset_pos_data)'
      and pg_get_functiondef(p.oid) ilike any(array[
        '%offline_v2_server_receipts%','%offline_customer_delivery_receipts_v1%',
        '%offline_order_status_receipts_v2%','%offline_restaurant_reference_receipts_v1%',
        '%offline_v2_customer_merge_receipts%','%retail_offline_po_approval_receipts%',
        '%retail_offline_supplier_receipts%'
      ])
  )
  select string_agg(proname||'('||args||')',', ')
  into bad
  from f
  where def not like '%business_id=public.current_business_id()%';

  if bad is not null then
    raise exception 'MULTITENANT_V1 runtime receipt function missing tenant scope: %',bad;
  end if;
end
$runtime_receipt_proof$;

commit;
