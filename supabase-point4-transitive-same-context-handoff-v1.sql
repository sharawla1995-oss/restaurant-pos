-- Sharawla POS Point 4
-- Gate 2B: Internal Same-Context Handoff V1 — SOURCE ONLY.
-- No Direct Root/public signature/cutover/activation changes.
--
-- Context envelope contract:
--   contract = sharawla.point4.offline-stock-context.v1
--   context_version = 1
--   context_digest = md5(context::text)
-- The envelope is built once by read-only preparation and verified, never rebuilt,
-- by Core/internal Food execution.

create or replace function public.sharawla_point4_assert_context_envelope_v1(
  p_envelope jsonb,
  p_client_tx_id text,
  p_branch_id bigint
)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_context jsonb; v_digest text;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if coalesce(p_envelope->>'contract','')<>'sharawla.point4.offline-stock-context.v1'
     or coalesce((p_envelope->>'context_version')::integer,0)<>1 then
    raise exception 'Point4 Context envelope version غير صالحة';
  end if;
  v_context:=p_envelope->'context';
  v_digest:=md5(coalesce(v_context::text,''));
  if v_context is null or coalesce(p_envelope->>'context_digest','') is distinct from v_digest then
    raise exception 'Point4 Context digest mismatch';
  end if;
  if nullif(v_context->>'client_tx_id','') is distinct from nullif(trim(coalesce(p_client_tx_id,'')),'')
     or coalesce(nullif(v_context->>'branch_id','')::bigint,0) is distinct from p_branch_id then
    raise exception 'Point4 Context identity mismatch';
  end if;
  return v_context;
end;$function$;

create or replace function public.sharawla_offline_v2_prepare_stock_event_v1(p_event jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_tx text:=nullif(trim(coalesce(p_event->>'client_tx_id','')),'');
  v_digest text:=nullif(trim(coalesce(p_event->>'payload_digest','')),'');
  v_operation text:=nullif(trim(coalesce(p_event->>'operation_type','')),'');
  v_rpc text:=nullif(trim(coalesce(p_event#>>'{payload,rpc_name}','')),'');
  v_payload jsonb:=coalesce(p_event#>'{payload,rpc_payload}','{}'::jsonb);
  v_protocol integer:=coalesce(nullif(p_event->>'protocol_version','')::integer,0);
  v_device text:=nullif(trim(coalesce(p_event->>'device_id','')),'');
  v_sequence bigint:=coalesce(nullif(p_event->>'device_sequence','')::bigint,0);
  v_branch bigint:=coalesce(nullif(p_event->>'branch_id','')::bigint,0);
  v_employee bigint:=coalesce(nullif(p_event->>'employee_id','')::bigint,0);
  v_receipt public.offline_v2_server_receipts%rowtype;
  v_context jsonb; v_envelope jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='غير مصرح'; end if;
  if v_protocol<>2 or v_tx is null or v_digest is null or v_operation is null or v_rpc is null
     or v_device is null or v_sequence<=0 or v_branch<=0 or v_employee<=0
    then raise exception using errcode='22023',message='Offline V2 preparation contract غير مكتمل'; end if;
  if public.current_employee_id() is distinct from v_employee
    then raise exception using errcode='42501',message='بيانات الموظف غير مطابقة لجلسة المزامنة'; end if;

  select * into v_receipt from public.offline_v2_server_receipts where client_tx_id=v_tx;
  if found then
    if v_receipt.payload_digest is distinct from v_digest or v_receipt.rpc_name is distinct from v_rpc
       or v_receipt.operation_type is distinct from v_operation or v_receipt.device_id is distinct from v_device
       or v_receipt.device_sequence is distinct from v_sequence or v_receipt.branch_id is distinct from v_branch
       or v_receipt.employee_id is distinct from v_employee or v_receipt.auth_user_id is distinct from auth.uid()
      then raise exception using errcode='22000',message='Offline V2 duplicate TX payload/identity mismatch'; end if;
    return jsonb_build_object('classification','FULL_REPLAY','client_tx_id',v_tx,'payload_digest',v_digest,
      'operation_type',v_operation,'rpc_name',v_rpc,'branch_id',v_branch,'authoritative_for_execution',false);
  end if;

  -- Resolve exactly once only for Food sale execution. Other operations keep no Food context.
  if v_operation='sale' and v_rpc in ('create_food_pos_order_atomic_v1','create_food_retail_pos_order_atomic_v1') then
    v_context:=public.food_resolve_operation_stock_context_v1(
      v_tx,v_branch,coalesce(v_payload->'p_items','[]'::jsonb),statement_timestamp()
    );
    v_envelope:=jsonb_build_object(
      'contract','sharawla.point4.offline-stock-context.v1',
      'context_version',1,
      'context_digest',md5(v_context::text),
      'context',v_context
    );
  end if;

  return jsonb_build_object('classification','EXECUTION_REQUIRED','client_tx_id',v_tx,'payload_digest',v_digest,
    'operation_type',v_operation,'rpc_name',v_rpc,'branch_id',v_branch,'authoritative_for_execution',false,
    'context_envelope',v_envelope);
end;$function$;

create or replace function public.create_food_pos_order_atomic_with_context_v1(
  p_order jsonb,p_items jsonb,p_payments jsonb,p_context_envelope jsonb
)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_tx text:=nullif(trim(coalesce(p_order->>'client_tx_id','')),'');v_branch bigint:=nullif(p_order->>'branch_id','')::bigint;
 v_context jsonb;v_existing bigint;v_evidence jsonb;v_identity record;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 v_context:=public.sharawla_point4_assert_context_envelope_v1(p_context_envelope,v_tx,v_branch);
 select id into v_existing from public.orders where client_tx_id=v_tx;
 if v_existing is not null then
   v_evidence:=public.food_recover_operation_frozen_evidence_v1(v_tx);
   if v_evidence is null then raise exception 'Post-context Food operation missing Frozen Evidence';end if;
   if coalesce(v_evidence->>'context_digest','') is distinct from md5(v_context::text) then raise exception 'Frozen Evidence/Context digest mismatch';end if;
   return public.food_execute_order_consumption_from_evidence_v1(v_tx,(v_evidence->'context')||jsonb_build_object('order',jsonb_build_object('id',v_existing)));
 end if;
 for v_identity in select distinct (e->>'branch_id')::bigint location_id,(e->>'ingredient_id')::bigint item_id from jsonb_array_elements(v_context->'lines') l cross join lateral jsonb_array_elements(coalesce(l->'effects','[]'::jsonb)) e where coalesce((e->>'track_inventory')::boolean,true)
 loop perform public.inventory_stock_assert_legacy_write_allowed_v2(v_identity.location_id,'ingredient',v_identity.item_id);end loop;
 v_result:=public.create_pos_order_atomic(p_order,p_items,p_payments);
 v_evidence:=public.food_persist_operation_frozen_evidence_v1(v_context,nullif(v_result#>>'{order,id}','')::bigint,v_result->'items',true);
 return public.food_execute_order_consumption_from_evidence_v1(v_tx,v_result);
end;$function$;

create or replace function public.create_food_retail_pos_order_atomic_with_context_v1(
  p_order jsonb,p_items jsonb,p_payments jsonb,p_use_variants boolean,p_context_envelope jsonb
)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_tx text:=nullif(trim(coalesce(p_order->>'client_tx_id','')),'');v_branch bigint:=nullif(p_order->>'branch_id','')::bigint;
 v_context jsonb;v_existing bigint;v_evidence jsonb;v_identity record;v_result jsonb;v_order_id bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 v_context:=public.sharawla_point4_assert_context_envelope_v1(p_context_envelope,v_tx,v_branch);
 select id into v_existing from public.orders where client_tx_id=v_tx;
 if v_existing is not null then
   v_evidence:=public.food_recover_operation_frozen_evidence_v1(v_tx);
   if v_evidence is null then raise exception 'Post-context Food Retail operation missing Frozen Evidence';end if;
   if coalesce(v_evidence->>'context_digest','') is distinct from md5(v_context::text) then raise exception 'Frozen Evidence/Context digest mismatch';end if;
   return public.food_execute_order_consumption_from_evidence_v1(v_tx,(v_evidence->'context')||jsonb_build_object('order',jsonb_build_object('id',v_existing)));
 end if;
 for v_identity in select distinct (e->>'branch_id')::bigint location_id,(e->>'ingredient_id')::bigint item_id from jsonb_array_elements(v_context->'lines') l cross join lateral jsonb_array_elements(coalesce(l->'effects','[]'::jsonb)) e where coalesce((e->>'track_inventory')::boolean,true)
 loop perform public.inventory_stock_assert_legacy_write_allowed_v2(v_identity.location_id,'ingredient',v_identity.item_id);end loop;
 for v_identity in select distinct v_branch location_id,case when coalesce(p_use_variants,false) then coalesce(nullif(x->>'variant_id','')::bigint,nullif(x->>'product_id','')::bigint) else nullif(x->>'product_id','')::bigint end item_id,case when coalesce(p_use_variants,false) and nullif(x->>'variant_id','') is not null then 'variant' else 'product' end item_kind from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
 loop if v_identity.item_id is null then raise exception 'Retail stock identity غير مكتملة';end if;perform public.inventory_stock_assert_legacy_write_allowed_v2(v_identity.location_id,v_identity.item_kind,v_identity.item_id);end loop;
 if coalesce(p_use_variants,false) then v_result:=public.create_retail_variant_pos_order_atomic_v1(p_order,p_items,p_payments);else v_result:=public.create_retail_pos_order_atomic(p_order,p_items,p_payments);end if;
 v_evidence:=public.food_persist_operation_frozen_evidence_v1(v_context,nullif(v_result#>>'{order,id}','')::bigint,v_result->'items',true);
 v_result:=public.food_execute_order_consumption_from_evidence_v1(v_tx,v_result);
 v_order_id:=nullif(v_result#>>'{order,id}','')::bigint;
 if v_order_id is not null then
   with src as(select ord::bigint rn,item from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) with ordinality t(item,ord)),
   dst as(select oi.id,row_number() over(order by oi.id)::bigint rn from public.order_items oi where oi.order_id=v_order_id)
   update public.order_items oi set cost=coalesce(nullif(src.item->>'cost','')::numeric,oi.cost) from src join dst using(rn) where oi.id=dst.id;
 end if;
 return v_result;
end;$function$;
