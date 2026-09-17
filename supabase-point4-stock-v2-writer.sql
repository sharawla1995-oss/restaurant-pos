-- Sharawla POS — Point 4B-2 Canonical Stock V2 internal writer
-- Source-only migration. No operational workflow is connected by this file.

begin;

-- The Point 4B-1 tables are empty at the approved deployment checkpoint, so
-- adding required immutable result snapshots is safe without a backfill.
alter table public.inventory_stock_movements_v2
  add column if not exists average_unit_cost_after numeric(18,4) not null,
  add column if not exists last_unit_cost_after numeric(18,4) not null,
  add column if not exists balance_version_after bigint not null
    check (balance_version_after > 0);

create or replace function public.inventory_stock_apply_movement_v2(
  p_client_tx_id text,
  p_line_key text,
  p_location_id bigint,
  p_item_kind text,
  p_item_id bigint,
  p_movement_type text,
  p_quantity numeric default null,
  p_reserved_quantity numeric default null,
  p_unit_cost numeric default null,
  p_stocktake_target_quantity numeric default null,
  p_source_document_type text default null,
  p_source_document_id text default null,
  p_counterparty_location_id bigint default null,
  p_reversal_of_movement_id bigint default null,
  p_occurred_at timestamptz default null,
  p_expected_balance_version bigint default null,
  p_employee_id bigint default null,
  p_device_id text default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_client_tx_id text:=trim(coalesce(p_client_tx_id,''));
  v_line_key text:=trim(coalesce(p_line_key,''));
  v_location_id bigint:=p_location_id;
  v_item_kind text:=lower(trim(coalesce(p_item_kind,'')));
  v_item_id bigint:=p_item_id;
  v_counterparty_location_id bigint:=p_counterparty_location_id;
  v_movement_type text:=lower(trim(coalesce(p_movement_type,'')));
  v_source_document_type text:=trim(coalesce(p_source_document_type,''));
  v_source_document_id text:=trim(coalesce(p_source_document_id,''));
  v_quantity_input numeric(18,3);
  v_reserved_input numeric(18,3);
  v_unit_cost_input numeric(18,4);
  v_stocktake_target numeric(18,3);
  v_digest_payload jsonb;
  v_operation_digest text;
  v_idempotency record;
  v_existing public.inventory_stock_movements_v2%rowtype;
  v_original public.inventory_stock_movements_v2%rowtype;
  v_balance public.inventory_stock_balances_v2%rowtype;
  v_movement public.inventory_stock_movements_v2%rowtype;
  v_balance_created boolean:=false;
  v_parent_product_id bigint;
  v_allow_negative boolean;
  v_policy_code text;
  v_policy_version integer;
  v_policy_source text;
  v_quantity_delta numeric(18,3):=0;
  v_reserved_delta numeric(18,3):=0;
  v_quantity_after numeric(18,3);
  v_reserved_after numeric(18,3);
  v_unit_cost numeric(18,4);
  v_value_delta numeric(18,4);
  v_average_after numeric(18,4);
  v_last_after numeric(18,4);
  v_version_after bigint;
  v_occurred_at timestamptz:=coalesce(p_occurred_at,now());
  v_metadata jsonb:=coalesce(p_metadata,'{}'::jsonb);
begin
  if v_client_tx_id='' or v_line_key='' then
    raise exception 'INVENTORY_STOCK_V2_IDEMPOTENCY_KEY_REQUIRED';
  end if;
  if v_movement_type not in (
    'opening','adjustment','waste','damage','stocktake',
    'reservation','reservation_release','sale','sale_return',
    'purchase_receive','purchase_return','transfer_out','transfer_in','reversal'
  ) then
    raise exception 'INVENTORY_STOCK_V2_INVALID_MOVEMENT_TYPE';
  end if;
  if v_source_document_type='' or v_source_document_id='' then
    raise exception 'INVENTORY_STOCK_V2_SOURCE_DOCUMENT_REQUIRED';
  end if;

  -- Reversal authority is the original movement id. Caller-provided stock and
  -- cost inputs are deliberately canonicalized to NULL for reversal intents.
  if v_movement_type='reversal' then
    if p_reversal_of_movement_id is null then
      raise exception 'INVENTORY_STOCK_V2_REVERSAL_SOURCE_REQUIRED';
    end if;
    v_location_id:=null;
    v_item_kind:='';
    v_item_id:=null;
    v_counterparty_location_id:=null;
    v_quantity_input:=null;
    v_reserved_input:=null;
    v_unit_cost_input:=null;
    v_stocktake_target:=null;
  else
    if v_location_id is null or v_item_kind not in ('product','variant','ingredient') or coalesce(v_item_id,0)<=0 then
      raise exception 'INVENTORY_STOCK_V2_ITEM_REQUIRED';
    end if;
    v_quantity_input:=case when p_quantity is null then null else round(p_quantity,3)::numeric(18,3) end;
    v_reserved_input:=round(coalesce(p_reserved_quantity,0),3)::numeric(18,3);
    v_unit_cost_input:=case when p_unit_cost is null then null else round(p_unit_cost,4)::numeric(18,4) end;
    v_stocktake_target:=case when p_stocktake_target_quantity is null then null else round(p_stocktake_target_quantity,3)::numeric(18,3) end;
  end if;

  -- Stable intent only: retry-time timestamps, expected version, metadata,
  -- employee/device provenance, policies, derived values and result snapshots
  -- are intentionally excluded.
  v_digest_payload:=jsonb_build_object(
    'digest_schema_version',1,
    'client_tx_id',v_client_tx_id,
    'line_key',v_line_key,
    'location_id',v_location_id,
    'item_kind',nullif(v_item_kind,''),
    'item_id',v_item_id,
    'movement_type',v_movement_type,
    'source_document_type',v_source_document_type,
    'source_document_id',v_source_document_id,
    'counterparty_location_id',v_counterparty_location_id,
    'reversal_of_movement_id',p_reversal_of_movement_id,
    'canonical_quantity_input',v_quantity_input,
    'canonical_reserved_quantity_input',v_reserved_input,
    'canonical_unit_cost_input',v_unit_cost_input,
    'stocktake_target_quantity',v_stocktake_target
  );
  v_operation_digest:=pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_digest_payload::text,'UTF8'),'sha256'),
    'hex'
  );

  -- This obtains the transaction advisory lock before any current balance,
  -- version, policy or tracking-state validation.
  select * into v_idempotency
  from public.inventory_stock_resolve_idempotency_v2(
    v_client_tx_id,v_line_key,v_operation_digest
  );
  if v_idempotency.reuse_existing then
    select * into strict v_existing
    from public.inventory_stock_movements_v2 m
    where m.id=v_idempotency.movement_id;
    return jsonb_build_object(
      'reused',true,
      'movement',to_jsonb(v_existing),
      'balance',jsonb_build_object(
        'location_id',v_existing.location_id,
        'item_kind',v_existing.item_kind,
        'item_id',v_existing.item_id,
        'quantity_on_hand',v_existing.quantity_on_hand_after,
        'quantity_reserved',v_existing.quantity_reserved_after,
        'quantity_available',v_existing.quantity_available_after,
        'average_unit_cost',v_existing.average_unit_cost_after,
        'last_unit_cost',v_existing.last_unit_cost_after,
        'balance_version',v_existing.balance_version_after
      )
    );
  end if;

  if jsonb_typeof(v_metadata)<>'object' then
    raise exception 'INVENTORY_STOCK_V2_METADATA_OBJECT_REQUIRED';
  end if;
  if p_employee_id is not null and not exists(select 1 from public.employees e where e.id=p_employee_id) then
    raise exception 'INVENTORY_STOCK_V2_EMPLOYEE_NOT_FOUND';
  end if;
  if v_counterparty_location_id is not null and not exists(
    select 1 from public.branches b
    where b.id=v_counterparty_location_id
      and b.active=true
      and b.location_type in ('branch','central_warehouse')
  ) then
    raise exception 'INVENTORY_STOCK_V2_COUNTERPARTY_LOCATION_INVALID';
  end if;

  if v_movement_type='reversal' then
    select * into v_original
    from public.inventory_stock_movements_v2 m
    where m.id=p_reversal_of_movement_id
    for update;
    if not found then
      raise exception 'INVENTORY_STOCK_V2_REVERSAL_SOURCE_NOT_FOUND';
    end if;
    if v_original.movement_type='reversal' or v_original.reversal_of_movement_id is not null then
      raise exception 'INVENTORY_STOCK_V2_REVERSAL_OF_REVERSAL';
    end if;
    v_location_id:=v_original.location_id;
    v_item_kind:=v_original.item_kind;
    v_item_id:=v_original.item_id;
    v_counterparty_location_id:=v_original.counterparty_location_id;
  end if;

  if not exists(
    select 1 from public.branches b
    where b.id=v_location_id
      and b.active=true
      and b.location_type in ('branch','central_warehouse')
  ) then
    raise exception 'INVENTORY_STOCK_V2_LOCATION_INVALID';
  end if;

  -- Validate polymorphic stock ownership before attempting balance creation;
  -- the existing table triggers remain the final database-level guard.
  if v_item_kind='product' then
    if not exists(select 1 from public.products p where p.id=v_item_id) then
      raise exception 'INVENTORY_STOCK_V2_ITEM_NOT_FOUND';
    end if;
    if exists(select 1 from public.product_variants pv where pv.product_id=v_item_id and pv.is_stock_unit=true) then
      raise exception 'INVENTORY_STOCK_V2_PRODUCT_HAS_STOCK_VARIANTS';
    end if;
  elsif v_item_kind='variant' then
    select pv.product_id into v_parent_product_id
    from public.product_variants pv
    join public.products p on p.id=pv.product_id
    where pv.id=v_item_id and pv.is_stock_unit=true;
    if not found then
      raise exception 'INVENTORY_STOCK_V2_VARIANT_NOT_STOCK_UNIT';
    end if;
    if exists(
      select 1 from public.inventory_stock_balances_v2 b
      where b.location_id=v_location_id and b.item_kind='product' and b.item_id=v_parent_product_id
    ) or exists(
      select 1 from public.inventory_stock_movements_v2 m
      where m.location_id=v_location_id and m.item_kind='product' and m.item_id=v_parent_product_id
    ) then
      raise exception 'INVENTORY_STOCK_V2_COMPETING_PRODUCT_OWNERSHIP';
    end if;
  elsif v_item_kind='ingredient' then
    if not exists(select 1 from public.ingredients i where i.id=v_item_id) then
      raise exception 'INVENTORY_STOCK_V2_ITEM_NOT_FOUND';
    end if;
  else
    raise exception 'INVENTORY_STOCK_V2_INVALID_ITEM_KIND';
  end if;

  insert into public.inventory_stock_balances_v2(location_id,item_kind,item_id)
  values(v_location_id,v_item_kind,v_item_id)
  on conflict(location_id,item_kind,item_id) do nothing
  returning true into v_balance_created;
  v_balance_created:=coalesce(v_balance_created,false);

  select * into strict v_balance
  from public.inventory_stock_balances_v2 b
  where b.location_id=v_location_id and b.item_kind=v_item_kind and b.item_id=v_item_id
  for update;

  if p_expected_balance_version is not null then
    if (v_balance_created and p_expected_balance_version<>0)
      or (not v_balance_created and p_expected_balance_version<>v_balance.balance_version) then
      raise exception 'INVENTORY_STOCK_V2_BALANCE_VERSION_CONFLICT';
    end if;
  end if;
  if v_balance.tracking_state='untracked' then
    raise exception 'INVENTORY_STOCK_V2_TRACKING_DISABLED';
  elsif v_balance.tracking_state='blocked' then
    raise exception 'INVENTORY_STOCK_V2_TRACKING_BLOCKED';
  elsif v_balance.tracking_state<>'tracked' then
    raise exception 'INVENTORY_STOCK_V2_INVALID_TRACKING_STATE';
  end if;

  select p.allow_negative_stock,p.policy_code,p.policy_version,p.policy_source
  into strict v_allow_negative,v_policy_code,v_policy_version,v_policy_source
  from public.inventory_stock_resolve_policy_v2(v_location_id,v_item_kind,v_item_id) p;

  v_quantity_delta:=coalesce(v_quantity_input,0);
  v_reserved_delta:=coalesce(v_reserved_input,0);
  v_average_after:=v_balance.average_unit_cost;
  v_last_after:=v_balance.last_unit_cost;

  if v_movement_type='opening' then
    if not v_balance_created or exists(
      select 1 from public.inventory_stock_movements_v2 m
      where m.location_id=v_location_id and m.item_kind=v_item_kind and m.item_id=v_item_id
    ) then
      raise exception 'INVENTORY_STOCK_V2_OPENING_REQUIRES_NEW_IDENTITY';
    end if;
    if v_quantity_input is null or v_quantity_delta<=0 or v_reserved_delta<>0
      or v_unit_cost_input is null or v_unit_cost_input<0 then
      raise exception 'INVENTORY_STOCK_V2_INVALID_OPENING';
    end if;
    v_unit_cost:=v_unit_cost_input;
    v_value_delta:=round(v_quantity_delta*v_unit_cost,4);
    v_average_after:=v_unit_cost;
    v_last_after:=v_unit_cost;
  elsif v_movement_type='adjustment' then
    raise exception 'INVENTORY_STOCK_V2_ADJUSTMENT_COST_RULE_REQUIRED';
  elsif v_movement_type in ('waste','damage','purchase_return') then
    if v_quantity_input is null or v_quantity_delta>=0 or v_reserved_delta<>0 or v_unit_cost_input is not null then
      raise exception 'INVENTORY_STOCK_V2_INVALID_OUTBOUND_MOVEMENT';
    end if;
    v_unit_cost:=v_balance.average_unit_cost;
    v_value_delta:=round(v_quantity_delta*v_unit_cost,4);
  elsif v_movement_type in ('sale','transfer_out') then
    if v_quantity_input is null or v_quantity_delta>=0 or v_reserved_delta>0
      or v_reserved_delta<v_quantity_delta or v_unit_cost_input is not null then
      raise exception 'INVENTORY_STOCK_V2_INVALID_OUTBOUND_MOVEMENT';
    end if;
    v_unit_cost:=v_balance.average_unit_cost;
    v_value_delta:=round(v_quantity_delta*v_unit_cost,4);
  elsif v_movement_type in ('purchase_receive','transfer_in','sale_return') then
    if v_quantity_input is null or v_quantity_delta<=0 or v_reserved_delta<>0
      or v_unit_cost_input is null or v_unit_cost_input<0 then
      raise exception 'INVENTORY_STOCK_V2_INVALID_INBOUND_MOVEMENT';
    end if;
    if v_balance.quantity_on_hand<0 then
      raise exception 'INVENTORY_STOCK_V2_NEGATIVE_COST_BASIS_REQUIRED';
    end if;
    v_unit_cost:=v_unit_cost_input;
    v_value_delta:=round(v_quantity_delta*v_unit_cost,4);
    v_average_after:=round(
      ((v_balance.quantity_on_hand*v_balance.average_unit_cost)+v_value_delta)
      / nullif(v_balance.quantity_on_hand+v_quantity_delta,0),4
    );
    if v_movement_type in ('purchase_receive','transfer_in') then
      v_last_after:=v_unit_cost;
    end if;
  elsif v_movement_type='reservation' then
    if coalesce(v_quantity_input,0)<>0 or v_reserved_delta<=0 or v_unit_cost_input is not null then
      raise exception 'INVENTORY_STOCK_V2_INVALID_RESERVATION';
    end if;
    v_quantity_delta:=0;
    v_unit_cost:=null;
    v_value_delta:=null;
  elsif v_movement_type='reservation_release' then
    if coalesce(v_quantity_input,0)<>0 or v_reserved_delta>=0 or v_unit_cost_input is not null then
      raise exception 'INVENTORY_STOCK_V2_INVALID_RESERVATION_RELEASE';
    end if;
    v_quantity_delta:=0;
    v_unit_cost:=null;
    v_value_delta:=null;
  elsif v_movement_type='stocktake' then
    if v_stocktake_target is null or v_stocktake_target<0
      or coalesce(v_quantity_input,0)<>0 or v_reserved_delta<>0 or v_unit_cost_input is not null then
      raise exception 'INVENTORY_STOCK_V2_INVALID_STOCKTAKE';
    end if;
    v_quantity_delta:=round(v_stocktake_target-v_balance.quantity_on_hand,3);
    if v_quantity_delta=0 then
      raise exception 'INVENTORY_STOCK_V2_NO_EFFECT';
    elsif v_quantity_delta>0 then
      raise exception 'INVENTORY_STOCK_V2_STOCKTAKE_COST_RULE_REQUIRED';
    end if;
    v_unit_cost:=v_balance.average_unit_cost;
    v_value_delta:=round(v_quantity_delta*v_unit_cost,4);
  elsif v_movement_type='reversal' then
    v_quantity_delta:=-v_original.quantity_delta;
    v_reserved_delta:=-v_original.reserved_quantity_delta;
    v_unit_cost:=v_original.unit_cost;
    v_value_delta:=case when v_original.value_delta is null then null else -v_original.value_delta end;
  end if;

  v_quantity_after:=round(v_balance.quantity_on_hand+v_quantity_delta,3);
  v_reserved_after:=round(v_balance.quantity_reserved+v_reserved_delta,3);
  if v_reserved_after<0 then
    raise exception 'INVENTORY_STOCK_V2_RESERVATION_UNDERFLOW';
  end if;
  if not v_allow_negative and v_quantity_after-v_reserved_after<0 then
    raise exception 'INVENTORY_STOCK_V2_INSUFFICIENT_AVAILABLE';
  end if;

  if v_movement_type='reversal' and v_value_delta is not null and v_quantity_after>0 then
    v_average_after:=round(
      ((v_balance.quantity_on_hand*v_balance.average_unit_cost)+v_value_delta)
      / v_quantity_after,4
    );
    if v_average_after<0 then
      raise exception 'INVENTORY_STOCK_V2_INVALID_REVERSAL_COST';
    end if;
  end if;
  -- Preserve average cost when on-hand reaches zero (and for negative stock).
  if v_quantity_after<=0 then
    v_average_after:=v_balance.average_unit_cost;
  end if;
  v_version_after:=v_balance.balance_version+1;

  insert into public.inventory_stock_movements_v2(
    client_tx_id,line_key,operation_digest,
    location_id,item_kind,item_id,movement_type,
    quantity_delta,reserved_quantity_delta,unit_cost,value_delta,
    quantity_on_hand_after,quantity_reserved_after,
    average_unit_cost_after,last_unit_cost_after,balance_version_after,
    allow_negative_stock_applied,policy_code,policy_version,
    source_document_type,source_document_id,counterparty_location_id,
    employee_id,device_id,occurred_at,reversal_of_movement_id,metadata
  ) values(
    v_client_tx_id,v_line_key,v_operation_digest,
    v_location_id,v_item_kind,v_item_id,v_movement_type,
    v_quantity_delta,v_reserved_delta,v_unit_cost,v_value_delta,
    v_quantity_after,v_reserved_after,
    v_average_after,v_last_after,v_version_after,
    v_allow_negative,v_policy_code,v_policy_version,
    v_source_document_type,v_source_document_id,v_counterparty_location_id,
    p_employee_id,nullif(trim(coalesce(p_device_id,'')),''),v_occurred_at,
    p_reversal_of_movement_id,v_metadata
  ) returning * into v_movement;

  update public.inventory_stock_balances_v2
  set quantity_on_hand=v_quantity_after,
      quantity_reserved=v_reserved_after,
      average_unit_cost=v_average_after,
      last_unit_cost=v_last_after,
      balance_version=v_version_after,
      updated_at=now()
  where location_id=v_location_id and item_kind=v_item_kind and item_id=v_item_id;

  return jsonb_build_object(
    'reused',false,
    'movement',to_jsonb(v_movement),
    'balance',jsonb_build_object(
      'location_id',v_location_id,
      'item_kind',v_item_kind,
      'item_id',v_item_id,
      'quantity_on_hand',v_quantity_after,
      'quantity_reserved',v_reserved_after,
      'quantity_available',v_quantity_after-v_reserved_after,
      'average_unit_cost',v_average_after,
      'last_unit_cost',v_last_after,
      'balance_version',v_version_after
    )
  );
end;
$$;

revoke all on function public.inventory_stock_apply_movement_v2(
  text,text,bigint,text,bigint,text,numeric,numeric,numeric,numeric,
  text,text,bigint,bigint,timestamptz,bigint,bigint,text,jsonb
) from public,anon,authenticated;

comment on function public.inventory_stock_apply_movement_v2(
  text,text,bigint,text,bigint,text,numeric,numeric,numeric,numeric,
  text,text,bigint,bigint,timestamptz,bigint,bigint,text,jsonb
) is 'Point 4B-2 internal canonical stock writer. Not client executable; future approved workflows must call this single boundary.';

commit;
