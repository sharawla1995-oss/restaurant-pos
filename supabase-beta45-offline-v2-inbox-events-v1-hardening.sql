-- Sharawla Offline Engine V2 — Phase 7 transport hardening
-- Adds local-order dependency mapping for order status and keeps helper RPCs
-- internal to the explicit-ACK dispatcher.

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
  if v_operation not in ('customer_merge','order_status') then
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
     or (v_operation='order_status' and v_rpc<>'offline_v2_update_order_status_v1') then
    raise exception using errcode='22023', message='Offline V2 Phase 7 operation/RPC binding غير مدعومة';
  end if;
  if nullif(trim(coalesce(v_payload->>'p_client_tx_id','')),'') is distinct from v_tx then
    raise exception using errcode='22023', message='Offline V2 Phase 7 client_tx_id mismatch';
  end if;

  if v_operation='order_status' and v_dep_tx is not null then
    if v_dep_server_id is null or v_dep_map_tx is distinct from v_dep_tx then
      raise exception using errcode='22023', message='Offline V2 order status dependency mapping غير مكتملة';
    end if;
    v_payload := jsonb_set(v_payload,'{p_order_id}',to_jsonb(v_dep_server_id::bigint),true);
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
  else
    if coalesce(nullif(v_payload->>'p_branch_id','')::bigint,0) is distinct from v_branch then
      raise exception using errcode='22023', message='Offline V2 order status branch mismatch';
    end if;
    v_result := public.offline_v2_update_order_status_v1(
      (v_payload->>'p_order_id')::bigint,v_branch,v_payload->>'p_status',
      nullif(v_payload->>'p_driver_id','')::bigint,v_payload->>'p_cancelled_reason',v_tx
    );
    v_entity_id := nullif(v_result->>'order_id','');
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
