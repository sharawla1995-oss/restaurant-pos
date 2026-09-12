-- Sharawla POS 10.5.4-beta.42
-- Canonical cross-profile Recipe runtime for Retail.
-- Recipe/Food Cost remains in immutable food snapshots while order_items.cost
-- remains Retail/Variant COGS for Retail reports and return accounting.

create or replace function public.create_food_retail_pos_order_atomic_v1(
  p_order jsonb,
  p_items jsonb,
  p_payments jsonb,
  p_use_variants boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
  v_order_id bigint;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;

  if coalesce(p_use_variants,false) then
    v_result:=public.create_retail_variant_pos_order_atomic_v1(p_order,p_items,p_payments);
  else
    v_result:=public.create_retail_pos_order_atomic(p_order,p_items,p_payments);
  end if;

  v_result:=public.food_apply_order_consumption_v1(v_result,p_items);

  -- Recipe/Food Cost has its own immutable snapshots. Retail order_items.cost must
  -- remain the Retail/Variant COGS used by inventory returns and Retail reports.
  v_order_id:=nullif(v_result->'order'->>'id','')::bigint;
  if v_order_id is not null then
    with src as (
      select ord::bigint as rn,item
      from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) with ordinality t(item,ord)
    ), dst as (
      select oi.id,row_number() over(order by oi.id)::bigint as rn
      from public.order_items oi
      where oi.order_id=v_order_id
    )
    update public.order_items oi
    set cost=coalesce(nullif(src.item->>'cost','')::numeric,oi.cost)
    from src join dst using(rn)
    where oi.id=dst.id;
  end if;

  return v_result;
end;
$function$;

create or replace function public.create_food_retail_order_return_idempotent_v1(
  p_order_id bigint,
  p_reason text,
  p_notes text,
  p_items jsonb,
  p_payments jsonb,
  p_client_tx_id text,
  p_use_variants boolean default false
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_return_id bigint;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if coalesce(p_use_variants,false) then
    v_return_id:=public.create_retail_variant_order_return_idempotent_v1(
      p_order_id,p_reason,p_notes,p_items,p_payments,p_client_tx_id
    );
  else
    v_return_id:=public.create_retail_order_return_idempotent(
      p_order_id,p_reason,p_notes,p_items,p_payments,p_client_tx_id
    );
  end if;
  return public.food_apply_return_consumption_v1(
    v_return_id,p_order_id,p_items,p_client_tx_id
  );
end;
$function$;

revoke all on function public.create_food_retail_pos_order_atomic_v1(jsonb,jsonb,jsonb,boolean) from public,anon;
revoke all on function public.create_food_retail_order_return_idempotent_v1(bigint,text,text,jsonb,jsonb,text,boolean) from public,anon;
grant execute on function public.create_food_retail_pos_order_atomic_v1(jsonb,jsonb,jsonb,boolean) to authenticated,service_role;
grant execute on function public.create_food_retail_order_return_idempotent_v1(bigint,text,text,jsonb,jsonb,text,boolean) to authenticated,service_role;
