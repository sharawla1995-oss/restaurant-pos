-- Sharawla POS — Variants Engine V1 checkout + returns
-- IMPORTANT: Existing create_retail_pos_order_atomic and create_retail_order_return_idempotent are NOT replaced.
-- This adds isolated capability-only RPCs. The POS calls them only when commerce.variants is enabled.

begin;

alter table public.order_items
  add column if not exists variant_id bigint references public.product_variants(id) on delete restrict,
  add column if not exists variant_name text,
  add column if not exists variant_sku text,
  add column if not exists variant_barcode text;

create index if not exists order_items_variant_id_idx
  on public.order_items(variant_id)
  where variant_id is not null;

-- -----------------------------------------------------------------------------
-- Variant-aware Retail checkout.
-- Non-variant lines use the existing product inventory ledger.
-- True stock-unit variant lines use the variant inventory ledger ONLY.
-- Invoice/payment creation still delegates to proven create_pos_order_atomic.
-- -----------------------------------------------------------------------------
create or replace function public.create_retail_variant_pos_order_atomic_v1(
  p_order jsonb,
  p_items jsonb,
  p_payments jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_branch bigint:=nullif(p_order->>'branch_id','')::bigint;
  v_client_tx_id text:=nullif(trim(coalesce(p_order->>'client_tx_id','')),'');
  v_emp bigint;
  v_allow_negative boolean:=false;
  v_existing_order_id bigint;
  v_result jsonb;
  v_saved_items jsonb;
  v_row record;
  v_balance public.retail_inventory_balances%rowtype;
  v_variant_balance public.retail_variant_inventory_balances%rowtype;
  v_new_balance numeric(14,3);
  v_variant public.product_variants%rowtype;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if v_client_tx_id is null then raise exception 'معرف الحركة مطلوب'; end if;
  if v_branch is null or not public.has_branch_access(v_branch) then
    raise exception 'ليس لديك صلاحية على هذا الفرع';
  end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array'
     or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then
    raise exception 'الأوردر فارغ';
  end if;

  v_emp:=public.current_employee_id();
  perform pg_advisory_xact_lock(hashtextextended('retail-variant-sale:'||v_client_tx_id,0));

  select id into v_existing_order_id
  from public.orders where client_tx_id=v_client_tx_id limit 1;
  if v_existing_order_id is not null then
    select coalesce(jsonb_agg(to_jsonb(oi) order by oi.id),'[]'::jsonb)
      into v_saved_items
    from public.order_items oi where oi.order_id=v_existing_order_id;
    return jsonb_build_object(
      'order',(select to_jsonb(o) from public.orders o where o.id=v_existing_order_id),
      'items',v_saved_items,
      'duplicate_prevented',true
    );
  end if;

  select coalesce(allow_negative_stock,false) into v_allow_negative
  from public.retail_inventory_settings where branch_id=v_branch;
  if not found then v_allow_negative:=false; end if;

  -- Validate every true variant line before any invoice is created.
  for v_row in
    select
      nullif(x->>'variant_id','')::bigint as variant_id,
      nullif(x->>'product_id','')::bigint as product_id,
      round(sum(coalesce((x->>'quantity')::numeric,0)),3) as qty
    from jsonb_array_elements(p_items) x
    where nullif(x->>'variant_id','') is not null
    group by nullif(x->>'variant_id','')::bigint,
             nullif(x->>'product_id','')::bigint
    order by nullif(x->>'variant_id','')::bigint
  loop
    if v_row.product_id is null or v_row.qty<=0 then raise exception 'بيانات Variant غير صحيحة'; end if;

    select * into v_variant
    from public.product_variants
    where id=v_row.variant_id
      and product_id=v_row.product_id
      and is_stock_unit=true
      and active=true;
    if not found then raise exception 'Variant % غير موجود أو غير صالح للصنف',v_row.variant_id; end if;

    insert into public.retail_variant_inventory_balances(branch_id,variant_id,quantity)
    values(v_branch,v_row.variant_id,0)
    on conflict(branch_id,variant_id) do nothing;

    select * into v_variant_balance
    from public.retail_variant_inventory_balances
    where branch_id=v_branch and variant_id=v_row.variant_id
    for update;

    if v_variant_balance.track_inventory
       and not v_allow_negative
       and v_variant_balance.quantity<v_row.qty then
      raise exception 'المخزون غير كافٍ للتركيبة % — المتاح %',v_variant.name,v_variant_balance.quantity;
    end if;
  end loop;

  -- Validate ordinary product lines exactly like the established Retail path,
  -- excluding rows that carry a true stock-unit variant.
  for v_row in
    select nullif(x->>'product_id','')::bigint as product_id,
           round(sum(coalesce((x->>'quantity')::numeric,0)),3) as qty
    from jsonb_array_elements(p_items) x
    where nullif(x->>'product_id','') is not null
      and nullif(x->>'variant_id','') is null
    group by nullif(x->>'product_id','')::bigint
    order by nullif(x->>'product_id','')::bigint
  loop
    insert into public.retail_inventory_balances(branch_id,product_id,quantity)
    values(v_branch,v_row.product_id,0)
    on conflict(branch_id,product_id) do nothing;

    select * into v_balance
    from public.retail_inventory_balances
    where branch_id=v_branch and product_id=v_row.product_id
    for update;

    if v_balance.track_inventory
       and not v_allow_negative
       and v_balance.quantity<v_row.qty then
      raise exception 'المخزون غير كافٍ للصنف % — المتاح %',v_row.product_id,v_balance.quantity;
    end if;
  end loop;

  -- Proven invoice/payment creation remains the source of truth.
  v_result:=public.create_pos_order_atomic(p_order,p_items,p_payments);

  -- Persist immutable variant identity snapshots by JSON input order.
  with src as (
    select ord::bigint as rn,
           nullif(item->>'variant_id','')::bigint as variant_id
    from jsonb_array_elements(p_items) with ordinality t(item,ord)
  ), dst as (
    select oi.id,row_number() over(order by oi.id)::bigint as rn
    from public.order_items oi
    where oi.order_id=(v_result->'order'->>'id')::bigint
  )
  update public.order_items oi
  set variant_id=pv.id,
      variant_name=pv.name,
      variant_sku=pv.sku,
      variant_barcode=pv.barcode
  from src
  join dst on dst.rn=src.rn
  join public.product_variants pv on pv.id=src.variant_id
  where oi.id=dst.id and src.variant_id is not null;

  -- Deduct ordinary product stock.
  for v_row in
    select nullif(x->>'product_id','')::bigint as product_id,
           round(sum(coalesce((x->>'quantity')::numeric,0)),3) as qty,
           round(
             sum(coalesce((x->>'cost')::numeric,0)*coalesce((x->>'quantity')::numeric,0)) /
             nullif(sum(coalesce((x->>'quantity')::numeric,0)),0),4
           ) as unit_cost
    from jsonb_array_elements(p_items) x
    where nullif(x->>'product_id','') is not null
      and nullif(x->>'variant_id','') is null
    group by nullif(x->>'product_id','')::bigint
    order by nullif(x->>'product_id','')::bigint
  loop
    select * into v_balance
    from public.retail_inventory_balances
    where branch_id=v_branch and product_id=v_row.product_id
    for update;
    if not v_balance.track_inventory then continue; end if;

    v_new_balance:=round(v_balance.quantity-v_row.qty,3);
    update public.retail_inventory_balances
    set quantity=v_new_balance,updated_at=now()
    where branch_id=v_branch and product_id=v_row.product_id;

    insert into public.retail_inventory_movements(
      branch_id,product_id,movement_type,quantity_delta,balance_after,unit_cost,
      reference_type,reference_id,client_tx_id,employee_id
    ) values(
      v_branch,v_row.product_id,'sale',-v_row.qty,v_new_balance,v_row.unit_cost,
      'order',v_result->'order'->>'id',v_client_tx_id,v_emp
    );
  end loop;

  -- Deduct true variant stock only; parent product balance is intentionally untouched.
  for v_row in
    select nullif(x->>'variant_id','')::bigint as variant_id,
           round(sum(coalesce((x->>'quantity')::numeric,0)),3) as qty,
           round(
             sum(coalesce((x->>'cost')::numeric,0)*coalesce((x->>'quantity')::numeric,0)) /
             nullif(sum(coalesce((x->>'quantity')::numeric,0)),0),4
           ) as unit_cost
    from jsonb_array_elements(p_items) x
    where nullif(x->>'variant_id','') is not null
    group by nullif(x->>'variant_id','')::bigint
    order by nullif(x->>'variant_id','')::bigint
  loop
    select * into v_variant_balance
    from public.retail_variant_inventory_balances
    where branch_id=v_branch and variant_id=v_row.variant_id
    for update;
    if not v_variant_balance.track_inventory then continue; end if;

    v_new_balance:=round(v_variant_balance.quantity-v_row.qty,3);
    update public.retail_variant_inventory_balances
    set quantity=v_new_balance,updated_at=now()
    where branch_id=v_branch and variant_id=v_row.variant_id;

    insert into public.retail_variant_inventory_movements(
      branch_id,variant_id,movement_type,quantity_delta,balance_after,unit_cost,
      reference_type,reference_id,client_tx_id,employee_id
    ) values(
      v_branch,v_row.variant_id,'sale',-v_row.qty,v_new_balance,v_row.unit_cost,
      'order',v_result->'order'->>'id',v_client_tx_id,v_emp
    );
  end loop;

  select coalesce(jsonb_agg(to_jsonb(oi) order by oi.id),'[]'::jsonb)
    into v_saved_items
  from public.order_items oi
  where oi.order_id=(v_result->'order'->>'id')::bigint;

  return jsonb_build_object('order',v_result->'order','items',v_saved_items);
end;
$$;

-- -----------------------------------------------------------------------------
-- Variant-aware return. Uses original order_item.variant_id snapshot identity.
-- Existing non-variant Retail return RPC is not replaced.
-- -----------------------------------------------------------------------------
create or replace function public.create_retail_variant_order_return_idempotent_v1(
  p_order_id bigint,
  p_reason text,
  p_notes text,
  p_items jsonb,
  p_payments jsonb,
  p_client_tx_id text
) returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_existing bigint;
  v_return_id bigint;
  v_branch bigint;
  v_emp bigint;
  v_row record;
  v_balance public.retail_inventory_balances%rowtype;
  v_variant_balance public.retail_variant_inventory_balances%rowtype;
  v_new_balance numeric(14,3);
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;

  perform pg_advisory_xact_lock(hashtextextended('retail-variant-return:'||v_key,0));
  select id into v_existing from public.returns where client_tx_id=v_key limit 1;
  if v_existing is not null then return v_existing; end if;

  select branch_id into v_branch from public.orders where id=p_order_id;
  if v_branch is null then raise exception 'الفاتورة غير موجودة'; end if;
  if not public.has_branch_access(v_branch) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  v_emp:=public.current_employee_id();

  -- Proven financial return creation remains source of truth.
  v_return_id:=public.create_order_return_idempotent(
    p_order_id,p_reason,p_notes,p_items,p_payments,v_key
  );

  -- Restore parent-product stock only for original non-variant lines.
  for v_row in
    select oi.product_id,
           round(sum(coalesce((x->>'quantity')::numeric,0)),3) as qty,
           round(avg(coalesce(oi.cost,0)),4) as unit_cost
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
    join public.order_items oi
      on oi.id=nullif(x->>'order_item_id','')::bigint
     and oi.order_id=p_order_id
    where oi.product_id is not null and oi.variant_id is null
    group by oi.product_id
    order by oi.product_id
  loop
    insert into public.retail_inventory_balances(branch_id,product_id,quantity)
    values(v_branch,v_row.product_id,0)
    on conflict(branch_id,product_id) do nothing;

    select * into v_balance
    from public.retail_inventory_balances
    where branch_id=v_branch and product_id=v_row.product_id
    for update;
    if not v_balance.track_inventory then continue; end if;

    v_new_balance:=round(v_balance.quantity+v_row.qty,3);
    update public.retail_inventory_balances
    set quantity=v_new_balance,updated_at=now()
    where branch_id=v_branch and product_id=v_row.product_id;

    insert into public.retail_inventory_movements(
      branch_id,product_id,movement_type,quantity_delta,balance_after,unit_cost,
      reference_type,reference_id,client_tx_id,employee_id
    ) values(
      v_branch,v_row.product_id,'return',v_row.qty,v_new_balance,v_row.unit_cost,
      'return',v_return_id::text,v_key,v_emp
    );
  end loop;

  -- Restore exact original variant stock.
  for v_row in
    select oi.variant_id,
           round(sum(coalesce((x->>'quantity')::numeric,0)),3) as qty,
           round(avg(coalesce(oi.cost,0)),4) as unit_cost
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
    join public.order_items oi
      on oi.id=nullif(x->>'order_item_id','')::bigint
     and oi.order_id=p_order_id
    where oi.variant_id is not null
    group by oi.variant_id
    order by oi.variant_id
  loop
    insert into public.retail_variant_inventory_balances(branch_id,variant_id,quantity)
    values(v_branch,v_row.variant_id,0)
    on conflict(branch_id,variant_id) do nothing;

    select * into v_variant_balance
    from public.retail_variant_inventory_balances
    where branch_id=v_branch and variant_id=v_row.variant_id
    for update;
    if not v_variant_balance.track_inventory then continue; end if;

    v_new_balance:=round(v_variant_balance.quantity+v_row.qty,3);
    update public.retail_variant_inventory_balances
    set quantity=v_new_balance,updated_at=now()
    where branch_id=v_branch and variant_id=v_row.variant_id;

    insert into public.retail_variant_inventory_movements(
      branch_id,variant_id,movement_type,quantity_delta,balance_after,unit_cost,
      reference_type,reference_id,client_tx_id,employee_id
    ) values(
      v_branch,v_row.variant_id,'return',v_row.qty,v_new_balance,v_row.unit_cost,
      'return',v_return_id::text,v_key,v_emp
    );
  end loop;

  return v_return_id;
end;
$$;

revoke all on function public.create_retail_variant_pos_order_atomic_v1(jsonb,jsonb,jsonb) from public;
revoke all on function public.create_retail_variant_order_return_idempotent_v1(bigint,text,text,jsonb,jsonb,text) from public;
grant execute on function public.create_retail_variant_pos_order_atomic_v1(jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.create_retail_variant_order_return_idempotent_v1(bigint,text,text,jsonb,jsonb,text) to authenticated;

comment on function public.create_retail_variant_pos_order_atomic_v1(jsonb,jsonb,jsonb) is
  'Capability-only Retail checkout. Variant lines deduct variant stock; ordinary lines retain product stock. Existing Retail checkout remains unchanged.';
comment on function public.create_retail_variant_order_return_idempotent_v1(bigint,text,text,jsonb,jsonb,text) is
  'Capability-only Retail return restoring exact original variant stock by order_item.variant_id.';

commit;
