-- Sharawla Restaurant Offline V2 — reference/config durable owners v1
-- SOURCE ONLY. DO NOT deploy without explicit authorization.
begin;

create table if not exists public.offline_restaurant_reference_receipts_v1(
 client_tx_id text primary key,
 operation_type text not null,
 payload_digest text not null,
 entity_id bigint,
 result_json jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.offline_restaurant_reference_receipts_v1 enable row level security;
revoke all on table public.offline_restaurant_reference_receipts_v1 from public,anon,authenticated;

create or replace function public.offline_food_supplier_save_v1(
 p_supplier_id bigint,p_name text,p_phone text,p_email text,p_tax_no text,p_address text,p_notes text,p_active boolean,
 p_client_tx_id text,p_payload_digest text
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare
 v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
 v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');
 r public.offline_restaurant_reference_receipts_v1%rowtype;
 v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_SUPPLIER_IDENTITY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));
 select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
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
end;$$;


create or replace function public.offline_delivery_driver_save_v1(
 p_driver_id bigint,p_branch_id bigint,p_name text,p_phone text,p_active boolean,
 p_client_tx_id text,p_payload_digest text
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
as $
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_DRIVER_IDENTITY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));
 select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then if r.operation_type<>'driver_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH'; end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 v_id:=public.delivery_driver_save_v2(p_driver_id,p_branch_id,p_name,p_phone,p_active);
 if v_id is null then raise exception 'OFFLINE_DRIVER_RESULT_MISSING'; end if;
 v_result:=jsonb_build_object('ok',true,'driver_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'driver_save',v_d,v_id,v_result);
 return v_result;
end;$;

create or replace function public.offline_delivery_zone_save_v1(
 p_zone_id bigint,p_branch_id bigint,p_name text,p_delivery_fee numeric,p_active boolean,
 p_client_tx_id text,p_payload_digest text
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
as $
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_ZONE_IDENTITY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));
 select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then if r.operation_type<>'zone_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH'; end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 v_id:=public.delivery_zone_save_v2(p_zone_id,p_branch_id,p_name,p_delivery_fee,p_active);
 if v_id is null then raise exception 'OFFLINE_ZONE_RESULT_MISSING'; end if;
 v_result:=jsonb_build_object('ok',true,'zone_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'zone_save',v_d,v_id,v_result);
 return v_result;
end;$;

revoke all on function public.offline_delivery_driver_save_v1(bigint,bigint,text,text,boolean,text,text) from public,anon;
revoke all on function public.offline_delivery_zone_save_v1(bigint,bigint,text,numeric,boolean,text,text) from public,anon;
grant execute on function public.offline_delivery_driver_save_v1(bigint,bigint,text,text,boolean,text,text) to authenticated;
grant execute on function public.offline_delivery_zone_save_v1(bigint,bigint,text,numeric,boolean,text,text) to authenticated;


create or replace function public.offline_restaurant_floor_save_v1(
 p_floor_id bigint,p_branch_id bigint,p_name text,p_sort_order integer,p_active boolean,
 p_client_tx_id text,p_payload_digest text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_FLOOR_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then if r.operation_type<>'floor_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 v_id:=public.restaurant_floor_save_v1(p_floor_id,p_branch_id,p_name,p_sort_order,p_active);if v_id is null then raise exception 'OFFLINE_FLOOR_RESULT_MISSING';end if;
 v_result:=jsonb_build_object('ok',true,'floor_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'floor_save',v_d,v_id,v_result);return v_result;
end;$;

create or replace function public.offline_restaurant_table_save_v1(
 p_table_id bigint,p_branch_id bigint,p_floor_id bigint,p_name text,p_code text,p_capacity integer,p_active boolean,
 p_client_tx_id text,p_payload_digest text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_TABLE_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then if r.operation_type<>'table_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 v_id:=public.restaurant_table_save_v1(p_table_id,p_branch_id,p_floor_id,p_name,p_code,p_capacity,p_active);if v_id is null then raise exception 'OFFLINE_TABLE_RESULT_MISSING';end if;
 v_result:=jsonb_build_object('ok',true,'table_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'table_save',v_d,v_id,v_result);return v_result;
end;$;


create or replace function public.offline_restaurant_table_session_attach_v1(
 p_session_id bigint,p_session_open_tx text,p_order_id bigint,p_order_sale_tx text,p_client_tx_id text,p_payload_digest text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');v_session bigint:=p_session_id;v_order bigint:=p_order_id;r public.offline_restaurant_reference_receipts_v1%rowtype;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_TABLE_SESSION_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then if r.operation_type<>'table_session_attach' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if v_session is null and nullif(trim(coalesce(p_session_open_tx,'')),'') is not null then select id into v_session from public.restaurant_table_sessions where client_tx_id=trim(p_session_open_tx);end if;
 if v_session is null then raise exception 'OFFLINE_TABLE_SESSION_DEPENDENCY_UNRESOLVED';end if;
 if v_order is null and nullif(trim(coalesce(p_order_sale_tx,'')),'') is not null then select nullif(server_entity_id,'')::bigint into v_order from public.offline_v2_server_receipts where client_tx_id=trim(p_order_sale_tx) and operation_type='sale';end if;
 if v_order is null then raise exception 'OFFLINE_TABLE_ORDER_DEPENDENCY_UNRESOLVED';end if;
 perform public.restaurant_table_session_attach_order_v1(v_session,v_order);
 v_result:=jsonb_build_object('ok',true,'session_id',v_session,'order_id',v_order,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'table_session_attach',v_d,v_session,v_result);return v_result;
end;$;

create or replace function public.offline_restaurant_table_session_close_v1(
 p_session_id bigint,p_session_open_tx text,p_notes text,p_client_tx_id text,p_payload_digest text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');v_session bigint:=p_session_id;r public.offline_restaurant_reference_receipts_v1%rowtype;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_TABLE_SESSION_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then if r.operation_type<>'table_session_close' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if v_session is null and nullif(trim(coalesce(p_session_open_tx,'')),'') is not null then select id into v_session from public.restaurant_table_sessions where client_tx_id=trim(p_session_open_tx);end if;
 if v_session is null then raise exception 'OFFLINE_TABLE_SESSION_DEPENDENCY_UNRESOLVED';end if;
 perform public.restaurant_table_session_close_v1(v_session,p_notes);
 v_result:=jsonb_build_object('ok',true,'session_id',v_session,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'table_session_close',v_d,v_session,v_result);return v_result;
end;$;

revoke all on function public.offline_restaurant_table_session_attach_v1(bigint,text,bigint,text,text,text) from public,anon;
revoke all on function public.offline_restaurant_table_session_close_v1(bigint,text,text,text,text) from public,anon;
grant execute on function public.offline_restaurant_table_session_attach_v1(bigint,text,bigint,text,text,text) to authenticated;
grant execute on function public.offline_restaurant_table_session_close_v1(bigint,text,text,text,text) to authenticated;

revoke all on function public.offline_restaurant_floor_save_v1(bigint,bigint,text,integer,boolean,text,text) from public,anon;
revoke all on function public.offline_restaurant_table_save_v1(bigint,bigint,bigint,text,text,integer,boolean,text,text) from public,anon;
grant execute on function public.offline_restaurant_floor_save_v1(bigint,bigint,text,integer,boolean,text,text) to authenticated;
grant execute on function public.offline_restaurant_table_save_v1(bigint,bigint,bigint,text,text,integer,boolean,text,text) to authenticated;

revoke all on function public.offline_food_supplier_save_v1(bigint,text,text,text,text,text,text,boolean,text,text) from public,anon;
grant execute on function public.offline_food_supplier_save_v1(bigint,text,text,text,text,text,text,boolean,text,text) to authenticated;


create or replace function public.offline_food_ingredient_save_v1(
 p_ingredient_id bigint,p_name text,p_base_unit_code text,p_purchase_unit_code text,p_sku text,p_barcode text,
 p_cost_per_base_unit numeric,p_minimum_quantity numeric,p_track_inventory boolean,p_usable_yield_percent numeric,
 p_shelf_life_minutes integer,p_active boolean,p_client_tx_id text,p_payload_digest text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_INGREDIENT_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then if r.operation_type<>'ingredient_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 v_id:=public.food_ingredient_save_v1(p_ingredient_id,p_name,p_base_unit_code,p_purchase_unit_code,p_sku,p_barcode,p_cost_per_base_unit,p_minimum_quantity,p_track_inventory,p_usable_yield_percent,p_shelf_life_minutes,p_active);
 if v_id is null then raise exception 'OFFLINE_INGREDIENT_RESULT_MISSING';end if;
 v_result:=jsonb_build_object('ok',true,'ingredient_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'ingredient_save',v_d,v_id,v_result);return v_result;
end;$;

create or replace function public.offline_food_ingredient_conversion_save_v1(
 p_ingredient_id bigint,p_ingredient_create_tx text,p_from_unit_code text,p_to_unit_code text,p_factor numeric,p_active boolean,
 p_client_tx_id text,p_payload_digest text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');v_ingredient bigint:=p_ingredient_id;r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_INGREDIENT_CONVERSION_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then if r.operation_type<>'ingredient_conversion_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if v_ingredient is null and nullif(trim(coalesce(p_ingredient_create_tx,'')),'') is not null then select entity_id into v_ingredient from public.offline_restaurant_reference_receipts_v1 where client_tx_id=trim(p_ingredient_create_tx) and operation_type='ingredient_save';end if;
 if v_ingredient is null then raise exception 'OFFLINE_INGREDIENT_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_ingredient_conversion_save_v1(v_ingredient,p_from_unit_code,p_to_unit_code,p_factor,p_active);if v_id is null then raise exception 'OFFLINE_INGREDIENT_CONVERSION_RESULT_MISSING';end if;
 v_result:=jsonb_build_object('ok',true,'conversion_id',v_id,'ingredient_id',v_ingredient,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'ingredient_conversion_save',v_d,v_id,v_result);return v_result;
end;$;

revoke all on function public.offline_food_ingredient_save_v1(bigint,text,text,text,text,text,numeric,numeric,boolean,numeric,integer,boolean,text,text) from public,anon;
revoke all on function public.offline_food_ingredient_conversion_save_v1(bigint,text,text,text,numeric,boolean,text,text) from public,anon;
grant execute on function public.offline_food_ingredient_save_v1(bigint,text,text,text,text,text,numeric,numeric,boolean,numeric,integer,boolean,text,text) to authenticated;
grant execute on function public.offline_food_ingredient_conversion_save_v1(bigint,text,text,text,numeric,boolean,text,text) to authenticated;

create or replace function public.offline_food_recipe_save_draft_v1(
 p_product_id bigint,p_variant_id bigint,p_name text,p_output_quantity numeric,p_output_unit_code text,
 p_lines jsonb,p_modifier_impacts jsonb,p_removal_mappings jsonb,p_notes text,p_client_tx_id text,p_payload_digest text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;v_ref record;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_RECIPE_DRAFT_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
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
end;$;

revoke all on function public.offline_food_recipe_save_draft_v1(bigint,bigint,text,numeric,text,jsonb,jsonb,jsonb,text,text,text) from public,anon;
grant execute on function public.offline_food_recipe_save_draft_v1(bigint,bigint,text,numeric,text,jsonb,jsonb,jsonb,text,text,text) to authenticated;

create or replace function public.offline_food_recipe_activate_version_v1(
 p_recipe_version_id bigint,p_client_tx_id text,p_payload_digest text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');r public.offline_restaurant_reference_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED';end if;if v_tx is null or v_d is null then raise exception 'OFFLINE_RECIPE_ACTIVATE_IDENTITY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then if r.operation_type<>'recipe_version_activate' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH';end if;return r.result_json||jsonb_build_object('idempotent_replay',true);end if;
 if p_recipe_version_id is null or not exists(select 1 from public.food_recipe_versions where id=p_recipe_version_id) then raise exception 'OFFLINE_RECIPE_VERSION_DEPENDENCY_UNRESOLVED';end if;
 v_id:=public.food_recipe_activate_version_v1(p_recipe_version_id);if v_id is null then raise exception 'OFFLINE_RECIPE_ACTIVATE_RESULT_MISSING';end if;
 v_result:=jsonb_build_object('ok',true,'recipe_version_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json) values(v_tx,'recipe_version_activate',v_d,v_id,v_result);return v_result;
end;$;

revoke all on function public.offline_food_recipe_activate_version_v1(bigint,text,text) from public,anon;
grant execute on function public.offline_food_recipe_activate_version_v1(bigint,text,text) to authenticated;

notify pgrst,'reload schema';
commit;
