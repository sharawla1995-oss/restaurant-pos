begin;

-- Beta56.1 corrective: normalize JSON null Point4 context + remove legacy inheritance from sensitive warehouse permissions.
CREATE OR REPLACE FUNCTION public.sharawla_offline_v2_apply_event_core_v1(p_event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
 select * into v_receipt from public.offline_v2_server_receipts where client_tx_id=v_tx;
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
end;$function$;

update public.permission_actions_v2
set legacy_permission=null
where code in ('inventory.supply.request.emergency','inventory.supply.shortages.view','inventory.supply.shortages.create')
  and legacy_permission is not null;

commit;
