-- Sharawla POS Point 4
-- Gate 3A: Food Sale Frozen-Context Plumbing — SOURCE ONLY.
-- Replaces only two of the 15 Transitive contracts.
-- No Direct Root/public signature/cutover/activation changes.
--
-- Ordering contract:
-- replay/recovery -> resolve once when new -> literal guards -> Direct Root ->
-- persist Evidence/binding -> execute from Evidence.

create or replace function public.create_food_pos_order_atomic_v1(
  p_order jsonb, p_items jsonb, p_payments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tx text:=nullif(trim(coalesce(p_order->>'client_tx_id','')),'');
  v_branch bigint:=nullif(p_order->>'branch_id','')::bigint;
  v_existing_order bigint;
  v_existing_result jsonb;
  v_context jsonb;
  v_evidence jsonb;
  v_resolution_instant timestamptz;
  v_identity record;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if v_tx is null or v_branch is null then raise exception 'Food sale identity غير مكتملة'; end if;

  -- Full/partial replay detection happens before ownership preflight.
  select id into v_existing_order from public.orders where client_tx_id=v_tx;
  if v_existing_order is not null then
    v_evidence:=public.food_recover_operation_frozen_evidence_v1(v_tx);
    if v_evidence is null then
      -- Historical pre-contract order: preserve the legacy wrapper replay path.
      v_existing_result:=public.create_pos_order_atomic(p_order,p_items,p_payments);
      return public.food_apply_order_consumption_v1(v_existing_result,p_items);
    end if;
    if (v_evidence->>'order_id')::bigint is distinct from v_existing_order
       or (v_evidence->>'branch_id')::bigint is distinct from v_branch
      then raise exception 'Frozen Evidence replay identity mismatch'; end if;
    -- Continuing post-contract effects are guarded from the recovered immutable set.
    for v_identity in
      select distinct
        (e->>'branch_id')::bigint location_id,
        (e->>'ingredient_id')::bigint item_id
      from jsonb_array_elements(v_evidence->'lines') l
      cross join lateral jsonb_array_elements(coalesce(l#>'{execution_evidence,effects}','[]'::jsonb)) e
      where coalesce((e->>'track_inventory')::boolean,true)
    loop
      perform public.inventory_stock_assert_legacy_write_allowed_v2(v_identity.location_id,'ingredient',v_identity.item_id);
    end loop;
    return public.food_execute_order_consumption_from_evidence_v1(v_tx,(v_evidence->'context')||jsonb_build_object('order',jsonb_build_object('id',v_existing_order)));
  end if;

  v_resolution_instant:=statement_timestamp();
  v_context:=public.food_resolve_operation_stock_context_v1(v_tx,v_branch,p_items,v_resolution_instant);

  for v_identity in
    select distinct
      (e->>'branch_id')::bigint location_id,
      (e->>'ingredient_id')::bigint item_id
    from jsonb_array_elements(v_context->'lines') l
    cross join lateral jsonb_array_elements(coalesce(l->'effects','[]'::jsonb)) e
    where coalesce((e->>'track_inventory')::boolean,true)
  loop
    perform public.inventory_stock_assert_legacy_write_allowed_v2(v_identity.location_id,'ingredient',v_identity.item_id);
  end loop;

  -- First business durable write remains inside the unchanged Direct Root.
  v_result:=public.create_pos_order_atomic(p_order,p_items,p_payments);
  v_evidence:=public.food_persist_operation_frozen_evidence_v1(
    v_context,nullif(v_result#>>'{order,id}','')::bigint,v_result->'items',true
  );
  return public.food_execute_order_consumption_from_evidence_v1(v_tx,v_result);
end;
$function$;

create or replace function public.create_food_retail_pos_order_atomic_v1(
  p_order jsonb, p_items jsonb, p_payments jsonb, p_use_variants boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tx text:=nullif(trim(coalesce(p_order->>'client_tx_id','')),'');
  v_branch bigint:=nullif(p_order->>'branch_id','')::bigint;
  v_existing_order bigint;
  v_context jsonb;
  v_evidence jsonb;
  v_resolution_instant timestamptz;
  v_identity record;
  v_result jsonb;
  v_order_id bigint;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if v_tx is null or v_branch is null then raise exception 'Food Retail sale identity غير مكتملة'; end if;

  select id into v_existing_order from public.orders where client_tx_id=v_tx;
  if v_existing_order is not null then
    v_evidence:=public.food_recover_operation_frozen_evidence_v1(v_tx);
    if v_evidence is null then
      -- Historical pre-contract order remains on the published compatibility path.
      if coalesce(p_use_variants,false) then
        v_result:=public.create_retail_variant_pos_order_atomic_v1(p_order,p_items,p_payments);
      else
        v_result:=public.create_retail_pos_order_atomic(p_order,p_items,p_payments);
      end if;
      v_result:=public.food_apply_order_consumption_v1(v_result,p_items);
      return v_result;
    end if;
    if (v_evidence->>'order_id')::bigint is distinct from v_existing_order
       or (v_evidence->>'branch_id')::bigint is distinct from v_branch
      then raise exception 'Frozen Evidence replay identity mismatch'; end if;
    for v_identity in
      select distinct (e->>'branch_id')::bigint location_id,(e->>'ingredient_id')::bigint item_id
      from jsonb_array_elements(v_evidence->'lines') l
      cross join lateral jsonb_array_elements(coalesce(l#>'{execution_evidence,effects}','[]'::jsonb)) e
      where coalesce((e->>'track_inventory')::boolean,true)
    loop
      perform public.inventory_stock_assert_legacy_write_allowed_v2(v_identity.location_id,'ingredient',v_identity.item_id);
    end loop;
    return public.food_execute_order_consumption_from_evidence_v1(v_tx,(v_evidence->'context')||jsonb_build_object('order',jsonb_build_object('id',v_existing_order)));
  end if;

  v_resolution_instant:=statement_timestamp();
  v_context:=public.food_resolve_operation_stock_context_v1(v_tx,v_branch,p_items,v_resolution_instant);

  -- Food identities.
  for v_identity in
    select distinct (e->>'branch_id')::bigint location_id,(e->>'ingredient_id')::bigint item_id
    from jsonb_array_elements(v_context->'lines') l
    cross join lateral jsonb_array_elements(coalesce(l->'effects','[]'::jsonb)) e
    where coalesce((e->>'track_inventory')::boolean,true)
  loop
    perform public.inventory_stock_assert_legacy_write_allowed_v2(v_identity.location_id,'ingredient',v_identity.item_id);
  end loop;

  -- Retail/Variant product identities are guarded before entering either Direct Root.
  for v_identity in
    select distinct v_branch location_id,
      case when coalesce(p_use_variants,false)
           then coalesce(nullif(x->>'variant_id','')::bigint,nullif(x->>'product_id','')::bigint)
           else nullif(x->>'product_id','')::bigint end item_id,
      case when coalesce(p_use_variants,false) and nullif(x->>'variant_id','') is not null
           then 'variant' else 'product' end item_kind
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
  loop
    if v_identity.item_id is null then raise exception 'Retail stock identity غير مكتملة'; end if;
    perform public.inventory_stock_assert_legacy_write_allowed_v2(v_identity.location_id,v_identity.item_kind,v_identity.item_id);
  end loop;

  if coalesce(p_use_variants,false) then
    v_result:=public.create_retail_variant_pos_order_atomic_v1(p_order,p_items,p_payments);
  else
    v_result:=public.create_retail_pos_order_atomic(p_order,p_items,p_payments);
  end if;

  v_evidence:=public.food_persist_operation_frozen_evidence_v1(
    v_context,nullif(v_result#>>'{order,id}','')::bigint,v_result->'items',true
  );
  v_result:=public.food_execute_order_consumption_from_evidence_v1(v_tx,v_result);

  -- Preserve Retail/Variant COGS after Food snapshot execution.
  v_order_id:=nullif(v_result#>>'{order,id}','')::bigint;
  if v_order_id is not null then
    with src as (
      select ord::bigint rn,item from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) with ordinality t(item,ord)
    ), dst as (
      select oi.id,row_number() over(order by oi.id)::bigint rn from public.order_items oi where oi.order_id=v_order_id
    )
    update public.order_items oi
    set cost=coalesce(nullif(src.item->>'cost','')::numeric,oi.cost)
    from src join dst using(rn) where oi.id=dst.id;
  end if;
  return v_result;
end;
$function$;
