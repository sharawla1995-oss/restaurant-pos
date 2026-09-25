-- Sharawla POS — Point 4 Canonical Stock V2 inactive runtime adapter kernel.
-- SOURCE ONLY. Internal contract; no Legacy writer, workflow, Offline owner,
-- deployment, cutover, or runtime activation is introduced by this file.

begin;

-- This remains hard-false until a separate reviewed activation migration is
-- authorized after genuine Point 4B-2 committed concurrency acceptance.
create or replace function public.inventory_stock_runtime_adapter_activation_allowed_v2()
returns boolean
language sql stable security definer set search_path=''
as $$ select false $$;

-- Canonicalize and validate one economic stock effect without performing a
-- write. Generated database identifiers are accepted only as internal lineage
-- lookups (the reversal movement FK); they are not canonical document/line
-- identity and are excluded from the Identity V1 economic digest.
create or replace function public.inventory_stock_validate_runtime_effect_v2(
  p_operation_type text,
  p_client_tx_id text,
  p_document_uid uuid,
  p_source_document_id text,
  p_offline_capable boolean,
  p_line_uid uuid,
  p_effect_line_key text,
  p_operation_digest text,
  p_location_id bigint,
  p_item_kind text,
  p_item_id bigint,
  p_quantity numeric default null,
  p_reserved_quantity numeric default null,
  p_unit_cost numeric default null,
  p_stocktake_target_quantity numeric default null,
  p_counterparty_location_id bigint default null,
  p_reversal_of jsonb default null
) returns jsonb
language plpgsql immutable set search_path=''
as $$
declare
  v_operation text:=lower(trim(coalesce(p_operation_type,'')));
  v_movement_type text;
  v_source_type text;
  v_tx text:=lower(trim(coalesce(p_client_tx_id,'')));
  v_document_uid text;
  v_source_id text;
  v_line_uid text:=public.point4_identity_uuid_v4_v1(p_line_uid::text);
  v_effect_key text;
  v_lines jsonb;
  v_digest text;
  v_quantity text;
  v_reserved text;
  v_unit_cost text;
  v_stocktake_target text;
begin
  if v_operation='' or v_tx='' or p_client_tx_id<>v_tx then
    raise exception 'INVENTORY_STOCK_ADAPTER_IDENTITY_REQUIRED';
  end if;

  v_movement_type:=case v_operation
    when 'stock_opening' then 'opening'
    when 'adjustment' then 'adjustment'
    when 'waste' then 'waste'
    when 'damage' then 'damage'
    when 'stocktake' then 'stocktake'
    when 'reservation' then 'reservation'
    when 'reservation_release' then 'reservation_release'
    when 'sale' then 'sale'
    when 'sale_return' then 'sale_return'
    when 'purchase_receive' then 'purchase_receive'
    when 'purchase_return' then 'purchase_return'
    when 'transfer_out' then 'transfer_out'
    when 'transfer_in' then 'transfer_in'
    when 'reversal' then 'reversal'
    else null
  end;
  v_source_type:=case v_operation
    when 'stock_opening' then 'stock_opening'
    when 'adjustment' then 'stock_adjustment'
    when 'waste' then 'stock_waste'
    when 'damage' then 'stock_damage'
    when 'stocktake' then 'stocktake'
    when 'reservation' then 'stock_reservation'
    when 'reservation_release' then 'stock_reservation_release'
    when 'sale' then 'sale'
    when 'sale_return' then 'sale_return'
    when 'purchase_receive' then 'purchase_grn'
    when 'purchase_return' then 'purchase_return'
    when 'transfer_out' then 'inventory_transfer'
    when 'transfer_in' then 'inventory_transfer'
    when 'reversal' then 'reversal'
    else null
  end;
  if v_movement_type is null or v_source_type is null then
    raise exception 'INVENTORY_STOCK_ADAPTER_OPERATION_NOT_APPROVED';
  end if;

  -- Controlled openings retain their already-approved deterministic digest
  -- document identity. Every ordinary document requires immutable UUIDv4
  -- identity and exact uuid:<document_uid> source identity.
  if v_operation='stock_opening' then
    if p_document_uid is not null then
      raise exception 'INVENTORY_STOCK_ADAPTER_OPENING_DOCUMENT_UID_FORBIDDEN';
    end if;
    v_source_id:=public.point4_identity_source_document_id_v1(
      v_source_type,p_source_document_id,false
    );
    if v_source_id!~'^digest:sha256:[0-9a-f]{64}$' then
      raise exception 'INVENTORY_STOCK_ADAPTER_OPENING_PLAN_ID_REQUIRED';
    end if;
  else
    v_document_uid:=public.point4_identity_uuid_v4_v1(p_document_uid::text);
    v_source_id:=public.point4_identity_source_document_id_v1(
      v_source_type,p_source_document_id,p_offline_capable
    );
    if v_source_id<>'uuid:'||v_document_uid then
      raise exception 'INVENTORY_STOCK_ADAPTER_DOCUMENT_IDENTITY_MISMATCH';
    end if;
  end if;

  if p_location_id is null or p_location_id<=0
    or lower(trim(coalesce(p_item_kind,''))) not in ('product','variant','ingredient')
    or p_item_id is null or p_item_id<=0
  then raise exception 'INVENTORY_STOCK_ADAPTER_STOCK_IDENTITY_INVALID'; end if;

  v_effect_key:=public.point4_identity_effect_line_key_v1(
    'stock',v_movement_type,v_line_uid,null,null
  );
  if p_effect_line_key is distinct from v_effect_key then
    raise exception 'INVENTORY_STOCK_ADAPTER_EFFECT_LINE_KEY_MISMATCH';
  end if;

  v_quantity:=case when p_quantity is null then null
    else public.point4_identity_decimal_v1(p_quantity,3) end;
  v_reserved:=case when p_reserved_quantity is null then null
    else public.point4_identity_decimal_v1(p_reserved_quantity,3) end;
  v_unit_cost:=case when p_unit_cost is null then null
    else public.point4_identity_decimal_v1(p_unit_cost,4) end;
  v_stocktake_target:=case when p_stocktake_target_quantity is null then null
    else public.point4_identity_decimal_v1(p_stocktake_target_quantity,3) end;

  if v_operation in ('waste','damage','sale','purchase_return','transfer_out')
    and p_unit_cost is not null
  then raise exception 'INVENTORY_STOCK_ADAPTER_OUTBOUND_COST_CLIENT_FORBIDDEN'; end if;
  if v_operation in ('stock_opening','sale_return','purchase_receive','transfer_in')
    and p_unit_cost is null
  then raise exception 'INVENTORY_STOCK_ADAPTER_VALUATION_REQUIRED'; end if;
  if v_operation in ('reservation','reservation_release') and p_unit_cost is not null then
    raise exception 'INVENTORY_STOCK_ADAPTER_RESERVATION_VALUE_FORBIDDEN';
  end if;
  if v_operation='adjustment' and coalesce(p_quantity,0)>0 and p_unit_cost is null then
    raise exception 'INVENTORY_STOCK_V2_ADJUSTMENT_COST_RULE_REQUIRED';
  end if;
  if v_operation='stocktake' and p_stocktake_target_quantity is null then
    raise exception 'INVENTORY_STOCK_ADAPTER_STOCKTAKE_TARGET_REQUIRED';
  end if;
  if v_operation='reversal' then
    if p_reversal_of is null then
      raise exception 'INVENTORY_STOCK_ADAPTER_REVERSAL_CANONICAL_ID_REQUIRED';
    end if;
  elsif p_reversal_of is not null then
    raise exception 'INVENTORY_STOCK_ADAPTER_UNEXPECTED_REVERSAL_IDENTITY';
  end if;

  v_lines:=jsonb_build_array(jsonb_build_object(
    'line_uid',v_line_uid,
    'line_key',v_effect_key,
    'location_id',public.point4_identity_bigint_v1(to_jsonb(p_location_id),true),
    'item_kind',lower(trim(p_item_kind)),
    'item_id',public.point4_identity_bigint_v1(to_jsonb(p_item_id),true),
    'quantity',v_quantity,
    'reserved_quantity',v_reserved,
    'unit_cost',v_unit_cost,
    'stocktake_target_quantity',v_stocktake_target,
    'counterparty_location_id',case when p_counterparty_location_id is null then null
      else public.point4_identity_bigint_v1(to_jsonb(p_counterparty_location_id),true) end
  ));
  v_digest:=public.point4_identity_operation_digest_v1(
    v_operation,v_tx,v_source_type,v_source_id,p_offline_capable,
    p_location_id,null,'{}'::jsonb,v_lines,p_reversal_of,null
  );
  if lower(trim(coalesce(p_operation_digest,'')))<>v_digest then
    raise exception 'INVENTORY_STOCK_ADAPTER_OPERATION_DIGEST_MISMATCH';
  end if;

  return jsonb_build_object(
    'operation_type',v_operation,'movement_type',v_movement_type,
    'client_tx_id',v_tx,'source_document_type',v_source_type,
    'source_document_id',v_source_id,'line_uid',v_line_uid,
    'effect_line_key',v_effect_key,'operation_digest',v_digest,
    'location_id',p_location_id,'item_kind',lower(trim(p_item_kind)),
    'item_id',p_item_id
  );
end;
$$;

-- The sole future mutation kernel. Validation/mapping happens first, then both
-- activation gates, then committed ownership, then the unchanged 4B-2 writer.
-- There is deliberately no exception block and no Legacy fallback.
create or replace function public.inventory_stock_apply_runtime_adapter_v2(
  p_operation_type text,
  p_client_tx_id text,
  p_document_uid uuid,
  p_source_document_id text,
  p_offline_capable boolean,
  p_line_uid uuid,
  p_effect_line_key text,
  p_operation_digest text,
  p_location_id bigint,
  p_item_kind text,
  p_item_id bigint,
  p_quantity numeric default null,
  p_reserved_quantity numeric default null,
  p_unit_cost numeric default null,
  p_stocktake_target_quantity numeric default null,
  p_counterparty_location_id bigint default null,
  p_reversal_of jsonb default null,
  p_reversal_of_movement_id bigint default null,
  p_expected_balance_version bigint default null,
  p_employee_id bigint default null,
  p_device_id text default null,
  p_occurred_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_effect jsonb;
  v_owner text;
  v_location_id bigint:=p_location_id;
  v_item_kind text:=lower(trim(coalesce(p_item_kind,'')));
  v_item_id bigint:=p_item_id;
  v_original public.inventory_stock_movements_v2%rowtype;
begin
  v_effect:=public.inventory_stock_validate_runtime_effect_v2(
    p_operation_type,p_client_tx_id,p_document_uid,p_source_document_id,
    p_offline_capable,p_line_uid,p_effect_line_key,p_operation_digest,
    p_location_id,p_item_kind,p_item_id,p_quantity,p_reserved_quantity,
    p_unit_cost,p_stocktake_target_quantity,p_counterparty_location_id,
    p_reversal_of
  );

  if not public.inventory_stock_point4b2_concurrency_closed_v2() then
    raise exception 'INVENTORY_STOCK_ADAPTER_POINT4B2_CONCURRENCY_REQUIRED';
  end if;
  if not public.inventory_stock_runtime_adapter_activation_allowed_v2() then
    raise exception 'INVENTORY_STOCK_ADAPTER_ACTIVATION_BLOCKED';
  end if;

  if v_effect->>'movement_type'='reversal' then
    if p_reversal_of_movement_id is null then
      raise exception 'INVENTORY_STOCK_ADAPTER_REVERSAL_INTERNAL_LOOKUP_REQUIRED';
    end if;
    select * into v_original
    from public.inventory_stock_movements_v2 m
    where m.id=p_reversal_of_movement_id
    for update;
    if not found then raise exception 'INVENTORY_STOCK_ADAPTER_REVERSAL_SOURCE_NOT_FOUND'; end if;
    if v_original.location_id is distinct from p_location_id
      or v_original.item_kind is distinct from lower(trim(p_item_kind))
      or v_original.item_id is distinct from p_item_id
      or lower(trim(coalesce(p_reversal_of->>'source_document_type',''))) is distinct from lower(v_original.source_document_type)
      or lower(trim(coalesce(p_reversal_of->>'source_document_id',''))) is distinct from lower(v_original.source_document_id)
      or lower(trim(coalesce(p_reversal_of->>'client_tx_id',''))) is distinct from lower(v_original.client_tx_id)
      or coalesce(p_reversal_of->>'line_key','') is distinct from v_original.line_key
      or lower(trim(coalesce(p_reversal_of->>'operation_digest',''))) is distinct from v_original.operation_digest
    then raise exception 'INVENTORY_STOCK_ADAPTER_REVERSAL_SOURCE_MISMATCH'; end if;
    v_location_id:=v_original.location_id;
    v_item_kind:=v_original.item_kind;
    v_item_id:=v_original.item_id;
  elsif p_reversal_of_movement_id is not null then
    raise exception 'INVENTORY_STOCK_ADAPTER_UNEXPECTED_REVERSAL_LOOKUP';
  end if;

  v_owner:=public.inventory_stock_resolve_operational_owner_v2(
    v_location_id,v_item_kind,v_item_id
  );
  if v_owner='NOT_CUT_OVER' then
    raise exception 'INVENTORY_STOCK_ADAPTER_LEGACY_OWNER_ACTIVE';
  elsif v_owner='FAIL_CLOSED_FORWARD_RECOVERY' then
    raise exception 'INVENTORY_STOCK_ADAPTER_FORWARD_RECOVERY_REQUIRED';
  elsif v_owner<>'CANONICAL_V2' then
    raise exception 'INVENTORY_STOCK_ADAPTER_UNKNOWN_OWNERSHIP';
  end if;

  perform public.inventory_stock_assert_canonical_write_allowed_v2(
    v_location_id,v_item_kind,v_item_id
  );

  return public.inventory_stock_apply_movement_v2(
    p_client_tx_id=>v_effect->>'client_tx_id',
    p_line_key=>v_effect->>'effect_line_key',
    p_location_id=>v_location_id,p_item_kind=>v_item_kind,
    p_item_id=>v_item_id,p_movement_type=>v_effect->>'movement_type',
    p_quantity=>p_quantity,p_reserved_quantity=>p_reserved_quantity,
    p_unit_cost=>p_unit_cost,p_stocktake_target_quantity=>p_stocktake_target_quantity,
    p_source_document_type=>v_effect->>'source_document_type',
    p_source_document_id=>v_effect->>'source_document_id',
    p_counterparty_location_id=>p_counterparty_location_id,
    p_reversal_of_movement_id=>p_reversal_of_movement_id,
    p_occurred_at=>p_occurred_at,p_expected_balance_version=>p_expected_balance_version,
    p_employee_id=>p_employee_id,p_device_id=>p_device_id,p_metadata=>p_metadata
  );
end;
$$;

revoke all on function public.inventory_stock_runtime_adapter_activation_allowed_v2()
  from public,anon,authenticated;
revoke all on function public.inventory_stock_validate_runtime_effect_v2(
  text,text,uuid,text,boolean,uuid,text,text,bigint,text,bigint,
  numeric,numeric,numeric,numeric,bigint,jsonb
) from public,anon,authenticated;
revoke all on function public.inventory_stock_apply_runtime_adapter_v2(
  text,text,uuid,text,boolean,uuid,text,text,bigint,text,bigint,
  numeric,numeric,numeric,numeric,bigint,jsonb,bigint,bigint,bigint,text,timestamptz,jsonb
) from public,anon,authenticated;

comment on function public.inventory_stock_apply_runtime_adapter_v2(
  text,text,uuid,text,boolean,uuid,text,text,bigint,text,bigint,
  numeric,numeric,numeric,numeric,bigint,jsonb,bigint,bigint,bigint,text,timestamptz,jsonb
) is 'Internal inactive Point 4 stock adapter. No client execute, Legacy fallback, Offline owner, or activation.';

commit;
