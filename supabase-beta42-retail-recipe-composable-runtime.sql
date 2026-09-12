-- Sharawla POS 10.5.4-beta.42
-- Compose Retail/Variant inventory with Recipe consumption in one DB transaction.
-- Beta backend acceptance migration; Production is not targeted.

do $patch$
declare
  v_def text;
  v_old text := '  if coalesce((v_result->>''duplicate_prevented'')::boolean,false) then return v_result; end if;';
  v_anchor text := '    if v_order_item_id is null or v_product_id is null or v_qty<=0 then continue; end if;';
  v_replacement text := '    if v_order_item_id is null or v_product_id is null or v_qty<=0 then continue; end if;' || E'\n\n' || '    -- Beta42 composition/idempotency: an existing cost snapshot means this order item''s Recipe posting already completed.' || E'\n' || '    if exists(select 1 from public.food_order_item_cost_snapshots where order_item_id=v_order_item_id) then continue; end if;';
begin
  select pg_get_functiondef('public.create_food_pos_order_atomic_v1(jsonb,jsonb,jsonb)'::regprocedure) into v_def;
  if position(v_old in v_def)=0 then raise exception 'Beta42 patch guard: duplicate early-return anchor not found'; end if;
  if position(v_anchor in v_def)=0 then raise exception 'Beta42 patch guard: order-item anchor not found'; end if;
  v_def := replace(v_def,v_old,'  -- Beta42: duplicate base orders are allowed through so missing Recipe postings can be completed idempotently.');
  v_def := replace(v_def,v_anchor,v_replacement);
  execute v_def;
end;
$patch$;

create or replace function public.create_retail_food_pos_order_atomic_v1(p_order jsonb,p_items jsonb,p_payments jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_retail jsonb;
  v_food jsonb;
  v_order_id bigint;
  v_items jsonb;
  v_was_duplicate boolean:=false;
  v_has_variant boolean:=false;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  select exists(
    select 1 from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
    where nullif(x->>'variant_id','') is not null
  ) into v_has_variant;

  if v_has_variant then
    v_retail:=public.create_retail_variant_pos_order_atomic_v1(p_order,p_items,p_payments);
  else
    v_retail:=public.create_retail_pos_order_atomic(p_order,p_items,p_payments);
  end if;
  v_was_duplicate:=coalesce((v_retail->>'duplicate_prevented')::boolean,false);

  -- Same transaction: Recipe failure rolls Retail/Variant stock and invoice back too.
  v_food:=public.create_food_pos_order_atomic_v1(p_order,p_items,p_payments);
  v_order_id:=nullif(v_food->'order'->>'id','')::bigint;
  if v_order_id is null then raise exception 'تعذر قراءة الفاتورة بعد Recipe posting'; end if;

  select coalesce(jsonb_agg(to_jsonb(oi) order by oi.id),'[]'::jsonb)
    into v_items from public.order_items oi where oi.order_id=v_order_id;
  return jsonb_build_object(
    'order',(select to_jsonb(o) from public.orders o where o.id=v_order_id),
    'items',v_items,
    'duplicate_prevented',v_was_duplicate
  );
end;
$function$;

create or replace function public.create_retail_food_order_return_idempotent_v1(p_order_id bigint,p_reason text,p_notes text,p_items jsonb,p_payments jsonb,p_client_tx_id text)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_return_id bigint;
  v_food_return_id bigint;
  v_has_variant boolean:=false;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  select exists(
    select 1
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
    join public.order_items oi on oi.id=nullif(x->>'order_item_id','')::bigint and oi.order_id=p_order_id
    where oi.variant_id is not null
  ) into v_has_variant;

  if v_has_variant then
    v_return_id:=public.create_retail_variant_order_return_idempotent_v1(p_order_id,p_reason,p_notes,p_items,p_payments,p_client_tx_id);
  else
    v_return_id:=public.create_retail_order_return_idempotent(p_order_id,p_reason,p_notes,p_items,p_payments,p_client_tx_id);
  end if;

  v_food_return_id:=public.create_food_order_return_idempotent_v1(p_order_id,p_reason,p_notes,p_items,p_payments,p_client_tx_id);
  if v_food_return_id is distinct from v_return_id then raise exception 'Retail/Recipe return mismatch'; end if;
  return v_return_id;
end;
$function$;

revoke all on function public.create_retail_food_pos_order_atomic_v1(jsonb,jsonb,jsonb) from public,anon;
revoke all on function public.create_retail_food_order_return_idempotent_v1(bigint,text,text,jsonb,jsonb,text) from public,anon;
grant execute on function public.create_retail_food_pos_order_atomic_v1(jsonb,jsonb,jsonb) to authenticated,service_role;
grant execute on function public.create_retail_food_order_return_idempotent_v1(bigint,text,text,jsonb,jsonb,text) to authenticated,service_role;
