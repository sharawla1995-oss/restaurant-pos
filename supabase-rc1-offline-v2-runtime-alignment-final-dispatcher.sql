-- Sharawla RC1 Offline V2 Runtime Alignment — final dispatcher composition
-- SOURCE ONLY. DO NOT DEPLOY without explicit Beta-only authorization.
-- Generated from the accepted reference dispatcher + modern-food dispatcher,
-- while preserving the live Point-4 core for sale/return/base operations.
-- The public final dispatcher is the ONLY authenticated entry point.
--
-- Required prerequisites before this artifact:
-- 1) accepted Restaurant reference/config owner sources
-- 2) accepted modern Food/Retail owner sources
-- 3) supabase-offline-v2-delivery-settlement-owner-v1.sql
-- 4) supabase-rc1-retail-suspend-resume-offline-v1-source.sql
-- 5) Central Warehouse request runtime/owners
--
-- This artifact also corrects the historical reference dispatcher omission where
-- inventory supply state transitions computed v_result without assigning v_entity_id.

begin;

create or replace function public.sharawla_offline_v2_apply_event_reference_v1(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  from public.offline_v2_server_receipts
  where client_tx_id=v_tx;

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
$$;

create or replace function public.sharawla_offline_v2_apply_event_modern_v1(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  select * into v_receipt from public.offline_v2_server_receipts where client_tx_id=v_tx;
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
$$;

create or replace function public.sharawla_offline_v2_apply_event_alignment_special_v1(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  select * into v_receipt from public.offline_v2_server_receipts where client_tx_id=v_tx;
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
    select coalesce(array_agg(x::bigint),'{}'::bigint[]) into v_order_ids
    from jsonb_array_elements_text(coalesce(v_payload->'p_order_ids','[]'::jsonb)) x;
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
$$;

create or replace function public.sharawla_offline_v2_apply_event(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operation text:=nullif(trim(coalesce(p_event->>'operation_type','')),'');
  v_rpc text:=nullif(trim(coalesce(p_event#>>'{payload,rpc_name}','')),'');
begin
  -- Live Point-4 core remains authoritative for stock-sensitive sale/return and
  -- the already-deployed base operations. Current shift-close V2 is routed
  -- separately because the historical core binds close_pos_shift_idempotent.
  if v_operation in ('sale','return','expense','shift_open')
     or (v_operation='shift_close' and v_rpc='close_pos_shift_idempotent') then
    return public.sharawla_offline_v2_apply_event_core_v1(p_event);
  end if;

  if v_operation in (
    'order_status','customer_create','customer_update','customer_address_save','customer_address_delete',
    'delivery_assign_driver','supplier_save','driver_save','zone_save','floor_save','table_save',
    'table_session_open','table_session_attach','table_session_close',
    'ingredient_save','ingredient_conversion_save','recipe_draft_save','recipe_version_activate',
    'prep_item_save','prep_recipe_draft_save',
    'food_po_create','food_po_approve','food_po_cancel','food_purchase_receive',
    'inventory_supply_request_submit','inventory_supply_request_decide',
    'inventory_supply_request_prepare','inventory_supply_request_dispatch','inventory_supply_request_receive'
  ) then
    return public.sharawla_offline_v2_apply_event_reference_v1(p_event);
  end if;

  if v_operation in (
    'customer_merge',
    'food_supplier_return','food_stock_count','food_transfer_create','food_transfer_receive','food_transfer_cancel',
    'food_ingredient_stock_adjust','food_production_start','food_production_complete','food_waste_post',
    'food_ingredient_save','food_ingredient_conversion_save','food_recipe_save_draft','food_recipe_activate',
    'food_prep_item_save','food_prep_recipe_save_draft',
    'retail_supplier_save','retail_po_create','retail_po_approve','retail_purchase_receive','retail_supplier_return'
  ) then
    return public.sharawla_offline_v2_apply_event_modern_v1(p_event);
  end if;

  if v_operation in ('shift_close','delivery_mark_delivered','delivery_driver_settle','inventory_supply_request_create') then
    return public.sharawla_offline_v2_apply_event_alignment_special_v1(p_event);
  end if;

  if v_operation='retail_suspend_sale' and v_rpc='offline_retail_suspend_sale_v1' then
    return public.sharawla_offline_v2_apply_retail_suspend_event_v1(p_event);
  end if;
  if v_operation='retail_resume_sale' and v_rpc='offline_retail_resume_sale_v1' then
    return public.sharawla_offline_v2_apply_retail_resume_event_v1(p_event);
  end if;

  raise exception using errcode='22023',
    message='Offline V2 Runtime Alignment operation غير مدعومة: '||coalesce(v_operation,'');
end;
$$;

revoke all on function public.sharawla_offline_v2_apply_event_reference_v1(jsonb) from public,anon,authenticated;
revoke all on function public.sharawla_offline_v2_apply_event_modern_v1(jsonb) from public,anon,authenticated;
revoke all on function public.sharawla_offline_v2_apply_event_alignment_special_v1(jsonb) from public,anon,authenticated;
revoke all on function public.sharawla_offline_v2_apply_event(jsonb) from public,anon;
grant execute on function public.sharawla_offline_v2_apply_event(jsonb) to authenticated;

commit;
