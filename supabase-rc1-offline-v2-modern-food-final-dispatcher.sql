-- Sharawla Offline V2 — RC1 modern food final dispatcher extension
-- SOURCE ONLY. No Supabase deployment is authorized by this artifact.
-- Additive replacement of the final public dispatcher; historical Beta45 SQL remains immutable.
-- Preserves the private core delegation/security boundary while binding verified modern food operations
-- to their exact idempotent owner RPCs and dependency mappings.

create or replace function public.sharawla_offline_v2_apply_event(p_event jsonb)
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
    'food_prep_item_save','food_prep_recipe_save_draft'
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
     or (v_operation='food_prep_recipe_save_draft' and v_rpc<>'offline_food_prep_recipe_save_draft_action_v2') then
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
  else
    v_result:=public.offline_food_prep_recipe_save_draft_action_v2((v_payload->>'p_prep_item_id')::bigint,(v_payload->>'p_output_quantity')::numeric,v_payload->>'p_output_unit_code',coalesce(v_payload->'p_lines','[]'::jsonb),v_payload->>'p_notes',v_tx,v_digest); v_entity_id:=nullif(v_result->>'recipe_version_id','');
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

revoke all on function public.sharawla_offline_v2_apply_event_core_v1(jsonb) from public, anon, authenticated;
revoke all on function public.offline_v2_merge_customer_v1(text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.offline_v2_update_order_status_v1(bigint,bigint,text,bigint,text,text) from public, anon, authenticated;
revoke all on function public.sharawla_offline_v2_apply_event(jsonb) from public, anon;
grant execute on function public.sharawla_offline_v2_apply_event(jsonb) to authenticated;
