-- Sharawla POS — Point 4 Batch 3 direct physical writer routing foundation.
-- SOURCE ONLY / INACTIVE. This file does not replace or call a Legacy writer.
-- It prepares exact Canonical V2 effects for the reviewed Retail parent-product
-- sale/return boundaries and can only delegate after both inactive gates close.

begin;

create or replace function public.inventory_stock_prepare_retail_product_effects_v2(
  p_operation_type text,
  p_client_tx_id text,
  p_order jsonb,
  p_order_id bigint,
  p_items jsonb
) returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_operation text:=lower(trim(coalesce(p_operation_type,'')));
  v_tx text:=lower(trim(coalesce(p_client_tx_id,'')));
  v_order jsonb:=coalesce(p_order,'{}'::jsonb);
  v_items jsonb:=coalesce(p_items,'[]'::jsonb);
  v_branch bigint;
  v_document_uid uuid;
  v_source_document_id text;
  v_original_source_document_id text;
  v_identity_count bigint;
  v_original_identity_count bigint;
  v_has_any_identity boolean;
  v_line jsonb;
  v_line_uid uuid;
  v_effect_line_key text;
  v_item_id bigint;
  v_quantity numeric;
  v_unit_cost numeric;
  v_digest_lines jsonb;
  v_operation_digest text;
  v_effect jsonb;
  v_effects jsonb:='[]'::jsonb;
  v_seen text[]:='{}'::text[];
begin
  if v_operation not in ('sale','sale_return') then
    raise exception 'INVENTORY_STOCK_ROUTE_OPERATION_NOT_REVIEWED';
  end if;
  if jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items)=0 then
    raise exception 'INVENTORY_STOCK_ROUTE_ITEMS_REQUIRED';
  end if;

  v_has_any_identity:=
    coalesce(v_order?'document_uid',false)
    or coalesce(v_order?'source_document_id',false)
    or coalesce(v_order?'point4_identity_contract',false)
    or exists(
      select 1 from jsonb_array_elements(v_items) x
      where x?'line_uid' or x?'effect_line_key' or x?'source_document_id'
    );

  -- A completely historical payload remains explicitly Legacy. This function
  -- never fabricates identity or performs the Legacy mutation itself.
  if not v_has_any_identity then
    return jsonb_build_object(
      'classification','LEGACY_COMPAT','route','LEGACY_ONLY','effects','[]'::jsonb
    );
  end if;

  if v_tx='' or v_tx<>trim(coalesce(p_client_tx_id,''))
    or public.point4_identity_uuid_v4_v1(v_tx)<>v_tx then
    raise exception 'INVENTORY_STOCK_ROUTE_CLIENT_TX_INVALID';
  end if;

  if v_operation='sale' then
    if v_order->>'point4_identity_contract' is distinct from 'sharawla.point4.identity.v1' then
      raise exception 'INVENTORY_STOCK_ROUTE_IDENTITY_CONTRACT_REQUIRED';
    end if;
    v_document_uid:=public.point4_identity_uuid_v4_v1(v_order->>'document_uid')::uuid;
    v_source_document_id:=public.point4_identity_source_document_id_v1(
      'sale',v_order->>'source_document_id',true
    );
    v_branch:=nullif(v_order->>'branch_id','')::bigint;
  else
    select count(distinct x->>'source_document_id'),min(x->>'source_document_id'),
           count(distinct x->>'original_source_document_id'),min(x->>'original_source_document_id')
      into v_identity_count,v_source_document_id,v_original_identity_count,v_original_source_document_id
    from jsonb_array_elements(v_items) x;
    if v_identity_count<>1 or v_original_identity_count<>1 then
      raise exception 'INVENTORY_STOCK_ROUTE_RETURN_DOCUMENT_MISMATCH';
    end if;
    v_source_document_id:=public.point4_identity_source_document_id_v1(
      'sale_return',v_source_document_id,true
    );
    v_original_source_document_id:=public.point4_identity_source_document_id_v1(
      'sale',v_original_source_document_id,false
    );
    v_document_uid:=public.point4_identity_uuid_v4_v1(substr(v_source_document_id,6))::uuid;
    select o.branch_id into v_branch from public.orders o where o.id=p_order_id;
    if not found then raise exception 'INVENTORY_STOCK_ROUTE_ORIGINAL_ORDER_REQUIRED'; end if;
  end if;
  if v_operation='sale' and v_order->>'client_tx_id' is distinct from v_tx then
    raise exception 'INVENTORY_STOCK_ROUTE_CLIENT_TX_MISMATCH';
  end if;
  if v_branch is null or v_branch<=0
    or v_source_document_id<>'uuid:'||v_document_uid::text then
    raise exception 'INVENTORY_STOCK_ROUTE_DOCUMENT_IDENTITY_INVALID';
  end if;

  for v_line in select value from jsonb_array_elements(v_items)
  loop
    v_line_uid:=public.point4_identity_uuid_v4_v1(v_line->>'line_uid')::uuid;
    v_effect_line_key:=public.point4_identity_effect_line_key_v1(
      'stock',v_operation,v_line_uid::text,null,null
    );
    if v_line->>'effect_line_key' is distinct from v_effect_line_key then
      raise exception 'INVENTORY_STOCK_ROUTE_EFFECT_LINE_KEY_MISMATCH';
    end if;
    if v_effect_line_key=any(v_seen) then
      raise exception 'INVENTORY_STOCK_ROUTE_DUPLICATE_EFFECT_LINE_KEY';
    end if;
    v_seen:=array_append(v_seen,v_effect_line_key);
    v_quantity:=nullif(v_line->>'quantity','')::numeric;
    if v_quantity is null or v_quantity<=0 then
      raise exception 'INVENTORY_STOCK_ROUTE_QUANTITY_INVALID';
    end if;

    if v_operation='sale' then
      if nullif(v_line->>'variant_id','') is not null then
        raise exception 'INVENTORY_STOCK_ROUTE_VARIANT_BOUNDARY_DEFERRED';
      end if;
      v_item_id:=nullif(v_line->>'product_id','')::bigint;
      v_quantity:=-v_quantity;
      v_unit_cost:=null;
    else
      select oi.product_id,oi.cost into v_item_id,v_unit_cost
      from public.order_items oi
      where oi.id=nullif(v_line->>'order_item_id','')::bigint
        and oi.order_id=p_order_id and oi.variant_id is null;
      if not found then raise exception 'INVENTORY_STOCK_ROUTE_RETURN_LINE_NOT_REVIEWED'; end if;
      if v_line->>'source_document_id' is distinct from v_source_document_id then
        raise exception 'INVENTORY_STOCK_ROUTE_RETURN_DOCUMENT_MISMATCH';
      end if;
      if v_unit_cost is null then raise exception 'INVENTORY_STOCK_ROUTE_RETURN_COST_REQUIRED'; end if;
    end if;
    if v_item_id is null or v_item_id<=0 then
      raise exception 'INVENTORY_STOCK_ROUTE_PRODUCT_REQUIRED';
    end if;

    v_digest_lines:=jsonb_build_array(jsonb_build_object(
      'line_uid',v_line_uid::text,'line_key',v_effect_line_key,
      'location_id',public.point4_identity_bigint_v1(to_jsonb(v_branch),true),
      'item_kind','product',
      'item_id',public.point4_identity_bigint_v1(to_jsonb(v_item_id),true),
      'quantity',public.point4_identity_decimal_v1(v_quantity,3),
      'reserved_quantity',null,
      'unit_cost',case when v_unit_cost is null then null
        else public.point4_identity_decimal_v1(v_unit_cost,4) end,
      'stocktake_target_quantity',null,'counterparty_location_id',null
    ));
    v_operation_digest:=public.point4_identity_operation_digest_v1(
      v_operation,v_tx,v_operation,v_source_document_id,true,
      v_branch,null,'{}'::jsonb,v_digest_lines,null,null
    );
    v_effect:=public.inventory_stock_validate_runtime_effect_v2(
      v_operation,v_tx,v_document_uid,v_source_document_id,true,
      v_line_uid,v_effect_line_key,v_operation_digest,
      v_branch,'product',v_item_id,v_quantity,null,v_unit_cost,null,null,null
    )||jsonb_build_object(
      'quantity',v_quantity,'unit_cost',v_unit_cost,'offline_capable',true,
      'original_source_document_id',v_original_source_document_id
    );
    v_effects:=v_effects||jsonb_build_array(v_effect);
  end loop;

  return jsonb_build_object(
    'classification','CANONICAL_V1',
    'route','CANONICAL_BLOCKED_INACTIVE',
    'reviewed_direct_boundary',case when v_operation='sale'
      then 'create_retail_pos_order_atomic(jsonb,jsonb,jsonb)'
      else 'create_retail_order_return_idempotent(bigint,text,text,jsonb,jsonb,text)' end,
    'effects',v_effects
  );
end;
$$;

-- Future-only internal execution boundary. It deliberately checks both gates
-- before the first adapter delegation. There is no Legacy branch or exception
-- fallback; multi-line effects remain atomic in this single transaction.
create or replace function public.inventory_stock_apply_prepared_retail_product_effects_v2(
  p_prepared jsonb,
  p_employee_id bigint default null,
  p_device_id text default null,
  p_occurred_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_effect jsonb;v_results jsonb:='[]'::jsonb;
begin
  if p_prepared->>'classification'<>'CANONICAL_V1'
    or p_prepared->>'route'<>'CANONICAL_BLOCKED_INACTIVE'
    or jsonb_typeof(p_prepared->'effects')<>'array'
    or jsonb_array_length(p_prepared->'effects')=0 then
    raise exception 'INVENTORY_STOCK_ROUTE_PREPARED_EFFECTS_INVALID';
  end if;
  if not public.inventory_stock_point4b2_concurrency_closed_v2() then
    raise exception 'INVENTORY_STOCK_ROUTE_POINT4B2_CONCURRENCY_REQUIRED';
  end if;
  if not public.inventory_stock_runtime_adapter_activation_allowed_v2() then
    raise exception 'INVENTORY_STOCK_ROUTE_ACTIVATION_BLOCKED';
  end if;
  for v_effect in select value from jsonb_array_elements(p_prepared->'effects')
  loop
    v_results:=v_results||jsonb_build_array(public.inventory_stock_apply_runtime_adapter_v2(
      p_operation_type=>v_effect->>'operation_type',
      p_client_tx_id=>v_effect->>'client_tx_id',
      p_document_uid=>substr(v_effect->>'source_document_id',6)::uuid,
      p_source_document_id=>v_effect->>'source_document_id',p_offline_capable=>true,
      p_line_uid=>(v_effect->>'line_uid')::uuid,
      p_effect_line_key=>v_effect->>'effect_line_key',
      p_operation_digest=>v_effect->>'operation_digest',
      p_location_id=>(v_effect->>'location_id')::bigint,
      p_item_kind=>v_effect->>'item_kind',p_item_id=>(v_effect->>'item_id')::bigint,
      p_quantity=>(v_effect->>'quantity')::numeric,
      p_unit_cost=>nullif(v_effect->>'unit_cost','')::numeric,
      p_employee_id=>p_employee_id,p_device_id=>p_device_id,
      p_occurred_at=>p_occurred_at,
      p_metadata=>jsonb_strip_nulls(jsonb_build_object(
        'point4_batch','3','routing','retail_product',
        'original_source_document_id',v_effect->>'original_source_document_id'
      ))
    ));
  end loop;
  return jsonb_build_object('effects',v_results);
end;
$$;

revoke all on function public.inventory_stock_prepare_retail_product_effects_v2(
  text,text,jsonb,bigint,jsonb
) from public,anon,authenticated;
revoke all on function public.inventory_stock_apply_prepared_retail_product_effects_v2(
  jsonb,bigint,text,timestamptz
) from public,anon,authenticated;

comment on function public.inventory_stock_prepare_retail_product_effects_v2(
  text,text,jsonb,bigint,jsonb
) is 'Inactive Batch 3 preparation for reviewed Retail product sale/return direct boundaries. No write or identity generation.';

commit;
