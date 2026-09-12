-- Sharawla Offline Engine V2 — Phase 5 backend transport v1
-- Additive only. Existing operational RPCs remain the source of truth and are
-- dispatched through an explicit whitelist. No existing operational object is changed.

create table if not exists public.offline_v2_server_receipts (
  client_tx_id text primary key,
  server_event_id text not null unique,
  protocol_version integer not null check (protocol_version = 2),
  payload_digest text not null,
  operation_type text not null,
  rpc_name text not null,
  device_id text not null,
  device_sequence bigint not null,
  branch_id bigint not null,
  employee_id bigint not null,
  auth_user_id uuid not null,
  server_entity_id text not null,
  server_version text not null default 'transport-v1',
  result_json jsonb,
  created_at timestamptz not null default now()
);

alter table public.offline_v2_server_receipts enable row level security;
revoke all on table public.offline_v2_server_receipts from public, anon, authenticated;

create or replace function public.sharawla_offline_v2_transport_info()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='غير مصرح';
  end if;
  return jsonb_build_object(
    'ok', true,
    'transport_version', '1',
    'protocol_version', 2,
    'explicit_ack', true
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
     or v_operation not in ('sale','return','expense','shift_open','shift_close') then
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
    elsif v_operation='return' then
      v_payload := jsonb_set(v_payload,'{p_order_id}',to_jsonb(v_dep_server_id::bigint),true);
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

revoke all on function public.sharawla_offline_v2_transport_info() from public, anon;
revoke all on function public.sharawla_offline_v2_apply_event(jsonb) from public, anon;
grant execute on function public.sharawla_offline_v2_transport_info() to authenticated;
grant execute on function public.sharawla_offline_v2_apply_event(jsonb) to authenticated;
