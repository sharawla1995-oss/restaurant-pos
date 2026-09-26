-- Sharawla RC1 Practical Offline — Consolidated Offline Outer V3
-- SOURCE ONLY. Isolated Beta SH-0007 backend only after explicit deployment authorization.
-- Production SH-0005 / SH-0006 remain out of scope.
-- Consolidates Work customer/address dependency rewrites, RC1 Customer -> Sale ACK mapping,
-- and dependency-gated Return of a brand-new Restaurant Offline sale.
-- Required deployed Beta Outer MD5 before patch: a269349dbc9a71f453e12699bc0617ce
-- Return line-index mapping is pinned to the deployed Restaurant sale/return definitions below.

begin;

do $pre$
declare
  v_outer_md5 text;
  v_owner text;
  v_secdef boolean;
  v_config text[];
  v_sale_md5 text;
  v_food_sale_md5 text;
  v_return_md5 text;
  v_return_idem_md5 text;
begin
  select md5(pg_get_functiondef(p.oid)), pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
    into v_outer_md5,v_owner,v_secdef,v_config
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='sharawla_offline_v2_apply_event'
    and pg_get_function_identity_arguments(p.oid)='p_event jsonb';
  select md5(pg_get_functiondef('public.create_pos_order_atomic(jsonb,jsonb,jsonb)'::regprocedure)) into v_sale_md5;
  select md5(pg_get_functiondef('public.create_food_pos_order_atomic_v1(jsonb,jsonb,jsonb)'::regprocedure)) into v_food_sale_md5;
  select md5(pg_get_functiondef('public.create_order_return(bigint,text,text,jsonb,jsonb)'::regprocedure)) into v_return_md5;
  select md5(pg_get_functiondef('public.create_order_return_idempotent(bigint,text,text,jsonb,jsonb,text)'::regprocedure)) into v_return_idem_md5;

  if v_outer_md5 is distinct from 'a269349dbc9a71f453e12699bc0617ce' then
    raise exception 'RC1 consolidated Outer V3 refused: Offline V2 Outer drifted (md5=%)', v_outer_md5;
  end if;
  if v_owner is distinct from 'postgres' or v_secdef is distinct from true or not ('search_path=public'=any(coalesce(v_config,array[]::text[]))) then
    raise exception 'RC1 consolidated Outer V3 refused: Offline V2 Outer metadata drifted';
  end if;
  if has_function_privilege('anon','public.sharawla_offline_v2_apply_event(jsonb)','EXECUTE')
     or not has_function_privilege('authenticated','public.sharawla_offline_v2_apply_event(jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.sharawla_offline_v2_apply_event(jsonb)','EXECUTE') then
    raise exception 'RC1 consolidated Outer V3 refused: Offline V2 Outer ACL drifted';
  end if;
  if v_sale_md5 is distinct from 'a677482d9944aa8ae40003408506c7c1'
     or v_food_sale_md5 is distinct from 'c6de3f95f85c6bb2f9d4854c1d7c5a8c'
     or v_return_md5 is distinct from '3fe18445ec4e05799bd8bebdeeb716c9'
     or v_return_idem_md5 is distinct from '8fb379d606004c895befb2b0f9787586' then
    raise exception 'RC1 consolidated Outer V3 refused: Restaurant sale/return mapping contract drifted';
  end if;
end;
$pre$;

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
  v_customer_dep_tx text;
  v_customer_dep_map_tx text;
  v_customer_dep_server_id text;
  v_rewritten_items jsonb;
  v_item_count integer;
  v_index_count integer;
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
     or v_operation not in ('sale','return','expense','shift_open','shift_close','order_status','customer_create','customer_update','customer_address_save','customer_address_delete','delivery_assign_driver') then
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
    elsif v_operation='return' then
      v_payload := jsonb_set(v_payload,'{p_order_id}',to_jsonb(v_dep_server_id::bigint),true);
    elsif v_operation in ('order_status','delivery_assign_driver') then
      v_payload := jsonb_set(v_payload,'{p_order_id}',to_jsonb(v_dep_server_id::bigint),true);
    elsif v_operation='customer_update' then
      v_payload := jsonb_set(v_payload,'{p_customer_id}',to_jsonb(v_dep_server_id::bigint),true);
    elsif v_operation='customer_address_save' and nullif(trim(coalesce(v_payload->>'p_address_save_tx','')),'') is not null then
      v_payload := jsonb_set(v_payload,'{p_address_id}',to_jsonb(v_dep_server_id::bigint),true);
    elsif v_operation='customer_address_save' then
      v_payload := jsonb_set(v_payload,'{p_customer_id}',to_jsonb(v_dep_server_id::bigint),true);
    elsif v_operation='customer_address_delete' then
      v_payload := jsonb_set(v_payload,'{p_address_id}',to_jsonb(v_dep_server_id::bigint),true);
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

  -- RC1 pending-sale -> return line mapping. This is intentionally after the
  -- locked replay return above: a full replay never re-evaluates current parent
  -- order-items or dependency state. The mapping applies only to Restaurant sale
  -- owners whose deployed insertion-order definitions are MD5-pinned above.
  if v_operation='return' and v_dep_tx is not null then
    if jsonb_typeof(coalesce(v_payload->'p_items','null'::jsonb)) <> 'array'
       or jsonb_array_length(v_payload->'p_items')=0 then
      raise exception using errcode='22023', message='Offline V2 dependent return items غير مكتملة';
    end if;
    if not exists(
      select 1 from public.offline_v2_server_receipts r
      where r.client_tx_id=v_dep_tx
        and r.operation_type='sale'
        and r.server_entity_id=v_dep_server_id
        and r.rpc_name in ('create_pos_order_atomic','create_food_pos_order_atomic_v1')
        and r.device_id=v_device_id
        and r.branch_id=v_branch
        and r.employee_id=v_employee
        and r.auth_user_id=auth.uid()
    ) then
      raise exception using errcode='22023', message='Offline V2 dependent return parent sale mapping غير موثقة';
    end if;
    if exists(
      select 1 from jsonb_array_elements(v_payload->'p_items') x(item)
      where coalesce(x.item->>'source_order_item_index','') !~ '^[1-9][0-9]*$'
         or coalesce(x.item->>'source_sale_line_uid','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) then
      raise exception using errcode='22023', message='Offline V2 dependent return line mapping غير صالحة';
    end if;
    select count(*),count(distinct (x.item->>'source_order_item_index')::integer)
      into v_item_count,v_index_count
    from jsonb_array_elements(v_payload->'p_items') x(item);
    if v_item_count<=0 or v_index_count is distinct from v_item_count then
      raise exception using errcode='22023', message='Offline V2 dependent return line mapping مكررة';
    end if;
    select coalesce(jsonb_agg(
      (x.item - 'source_order_item_index' - 'source_sale_line_uid') || jsonb_build_object('order_item_id',mapped.id)
      order by x.ord
    ),'[]'::jsonb)
      into v_rewritten_items
    from jsonb_array_elements(v_payload->'p_items') with ordinality x(item,ord)
    join lateral (
      select q.id
      from (
        select oi.id,row_number() over(order by oi.id)::integer as source_index
        from public.order_items oi
        where oi.order_id=v_dep_server_id::bigint
      ) q
      where q.source_index=(x.item->>'source_order_item_index')::integer
    ) mapped on true;
    if jsonb_array_length(v_rewritten_items) is distinct from v_item_count then
      raise exception using errcode='22023', message='Offline V2 dependent return item mapping غير مكتملة';
    end if;
    v_payload := jsonb_set(v_payload,'{p_items}',v_rewritten_items,true);
  end if;

  -- RC1 customer -> sale linkage. This is intentionally after the locked replay
  -- return above, so a full replay never re-evaluates current dependency state.
  if v_operation='sale' then
    v_customer_dep_tx := nullif(trim(coalesce(v_payload#>>'{p_order,customer_create_tx}','')), '');
    if v_customer_dep_tx is not null then
      v_customer_dep_map_tx := nullif(trim(coalesce(p_event#>>'{customer_dependency_mapping,client_tx_id}','')), '');
      v_customer_dep_server_id := nullif(trim(coalesce(p_event#>>'{customer_dependency_mapping,server_id}','')), '');
      if nullif(trim(coalesce(v_payload#>>'{p_order,customer_id}','')), '') is not null then
        raise exception using errcode='22023', message='Offline V2 sale customer dependency requires null customer_id before mapping';
      end if;
      if v_customer_dep_map_tx is distinct from v_customer_dep_tx
         or v_customer_dep_server_id is null
         or v_customer_dep_server_id !~ '^[1-9][0-9]*$' then
        raise exception using errcode='22023', message='Offline V2 customer dependency mapping غير مكتملة';
      end if;
      if not exists(
        select 1 from public.offline_v2_server_receipts r
        where r.client_tx_id=v_customer_dep_tx
          and r.operation_type='customer_create'
          and r.server_entity_id=v_customer_dep_server_id
          and r.device_id=v_device_id
          and r.branch_id=v_branch
          and r.employee_id=v_employee
          and r.auth_user_id=auth.uid()
      ) then
        raise exception using errcode='22023', message='Offline V2 customer dependency mapping غير موثقة';
      end if;
      v_payload := jsonb_set(
        v_payload,
        '{p_order}',
        jsonb_set(coalesce(v_payload->'p_order','{}'::jsonb),'{customer_id}',to_jsonb(v_customer_dep_server_id::bigint),true) - 'customer_create_tx',
        true
      );
    end if;
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

revoke all on function public.sharawla_offline_v2_apply_event(jsonb) from public, anon;
grant execute on function public.sharawla_offline_v2_apply_event(jsonb) to authenticated;

do $post$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.sharawla_offline_v2_apply_event(jsonb)'::regprocedure);
  if has_function_privilege('anon','public.sharawla_offline_v2_apply_event(jsonb)','EXECUTE')
     or not has_function_privilege('authenticated','public.sharawla_offline_v2_apply_event(jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.sharawla_offline_v2_apply_event(jsonb)','EXECUTE') then
    raise exception 'RC1 consolidated Outer V3 ACL postcondition failed';
  end if;
  if position('customer_dependency_mapping' in v_def)=0
     or position('customer_create_tx' in v_def)=0
     or position('r.operation_type=''customer_create''' in v_def)=0
     or position('v_operation=''customer_update''' in v_def)=0
     or position('p_address_save_tx' in v_def)=0
     or position('v_operation=''customer_address_delete''' in v_def)=0
     or position('source_order_item_index' in v_def)=0
     or position('dependent return parent sale mapping' in v_def)=0
     or position('row_number() over(order by oi.id)' in v_def)=0
     or position('offline_customer_create_v1' in v_def)=0
     or position('order_status_apply_offline_v2' in v_def)=0
     or position('offline_delivery_assign_driver_v1' in v_def)=0
     or position('idempotent_replay' in v_def)=0 then
    raise exception 'RC1 consolidated Outer V3 postcondition failed';
  end if;
end;
$post$;

commit;
