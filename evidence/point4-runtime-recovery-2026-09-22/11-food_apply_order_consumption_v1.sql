CREATE OR REPLACE FUNCTION public.food_apply_order_consumption_v1(p_result jsonb, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_branch bigint;
  v_order_id bigint;
  v_pair record;
  v_input jsonb;
  v_saved jsonb;
  v_order_item_id bigint;
  v_product_id bigint;
  v_variant_id bigint;
  v_qty numeric;
  v_recipe_version bigint;
  v_output_qty numeric;
  v_line record;
  v_stock public.ingredient_stock%rowtype;
  v_need numeric(18,6);
  v_new numeric(18,6);
  v_unit_cost numeric(18,6);
  v_base_cost numeric(18,6);
  v_mod_cost numeric(18,6);
  v_total_cost numeric(18,6);
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  -- Beta42 composition: duplicate base orders may still need missing Recipe postings; per-item snapshots are the idempotency guard.

  v_order_id:=nullif(p_result->'order'->>'id','')::bigint;
  if v_order_id is null then raise exception 'تعذر تحديد الفاتورة لتطبيق Recipe'; end if;
  select branch_id into v_branch from public.orders where id=v_order_id;
  if v_branch is null or not public.has_branch_access(v_branch) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;

  perform pg_advisory_xact_lock(hashtextextended('food-consume-order:'||v_order_id::text,0));

  for v_pair in
    select a.value as input_item,b.value as saved_item
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) with ordinality a(value,ord)
    join jsonb_array_elements(coalesce(p_result->'items','[]'::jsonb)) with ordinality b(value,ord) using(ord)
  loop
    v_input:=v_pair.input_item;
    v_saved:=v_pair.saved_item;
    v_order_item_id:=nullif(v_saved->>'id','')::bigint;
    v_product_id:=nullif(v_input->>'product_id','')::bigint;
    v_variant_id:=nullif(v_input->>'variant_id','')::bigint;
    v_qty:=coalesce((v_input->>'quantity')::numeric,0);
    if v_order_item_id is null or v_product_id is null or v_qty<=0 then continue; end if;

    -- Helper-level idempotency protects wrapper composition/retries.
    if exists(select 1 from public.food_order_item_cost_snapshots where order_item_id=v_order_item_id) then
      continue;
    end if;

    select rv.id,rv.output_quantity into v_recipe_version,v_output_qty
    from public.food_recipe_headers h
    join public.food_recipe_versions rv on rv.recipe_id=h.id and rv.status='active'
    where h.active=true and h.recipe_kind='sale' and h.product_id=v_product_id
      and (h.variant_id is null or h.variant_id=v_variant_id)
      and (rv.effective_from is null or rv.effective_from<=clock_timestamp())
      and (rv.effective_to is null or rv.effective_to>clock_timestamp())
    order by case when h.variant_id is not null and h.variant_id=v_variant_id then 0 else 1 end,h.id desc
    limit 1;
    if v_recipe_version is null then continue; end if;

    v_base_cost:=0;
    v_mod_cost:=0;

    for v_line in
      select l.ingredient_id,l.base_quantity,i.track_inventory,
        coalesce(nullif(s.average_unit_cost,0),coalesce(i.cost_per_unit,0))::numeric(18,6) as unit_cost
      from public.food_recipe_lines l
      join public.ingredients i on i.id=l.ingredient_id and i.active is distinct from false
      left join public.ingredient_stock s on s.branch_id=v_branch and s.ingredient_id=i.id
      where l.recipe_version_id=v_recipe_version
        and not exists(
          select 1 from public.food_recipe_removal_mappings rm
          where rm.recipe_version_id=v_recipe_version and rm.ingredient_id=l.ingredient_id
            and lower(trim(rm.component_name)) in (
              select lower(trim(x)) from jsonb_array_elements_text(coalesce(v_input->'removed','[]'::jsonb)) x
            )
        )
      order by l.ingredient_id
    loop
      v_need:=round(v_line.base_quantity*v_qty/greatest(v_output_qty,0.000001),6);
      if v_need<=0 then continue; end if;
      v_unit_cost:=coalesce(v_line.unit_cost,0);

      if coalesce(v_line.track_inventory,true) then
        insert into public.ingredient_stock(branch_id,ingredient_id,quantity)
        values(v_branch,v_line.ingredient_id,0)
        on conflict(branch_id,ingredient_id) do nothing;
        select * into v_stock from public.ingredient_stock
        where branch_id=v_branch and ingredient_id=v_line.ingredient_id for update;
        v_unit_cost:=coalesce(nullif(v_stock.average_unit_cost,0),v_line.unit_cost,0);
        if v_stock.quantity<v_need then
          raise exception 'مخزون الخامة غير كافٍ للخامة % — المتاح % والمطلوب %',v_line.ingredient_id,v_stock.quantity,v_need;
        end if;
        v_new:=round(v_stock.quantity-v_need,6);
        update public.ingredient_stock set quantity=v_new,updated_at=clock_timestamp() where id=v_stock.id;
        insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes)
        values(v_branch,v_line.ingredient_id,'sale',-v_need,'order_item',v_order_item_id,'Recipe Basic V1');
      end if;

      insert into public.food_order_item_consumption_snapshots(
        order_item_id,recipe_version_id,ingredient_id,source_kind,modifier_id,base_quantity,unit_cost_snapshot
      ) values(v_order_item_id,v_recipe_version,v_line.ingredient_id,'base',null,v_need,v_unit_cost);
      v_base_cost:=v_base_cost+(v_need*v_unit_cost);
    end loop;

    for v_line in
      select mi.ingredient_id,mi.modifier_id,mi.base_quantity_delta,i.track_inventory,
        coalesce(nullif(s.average_unit_cost,0),coalesce(i.cost_per_unit,0))::numeric(18,6) as unit_cost
      from public.food_modifier_recipe_impacts mi
      join public.ingredients i on i.id=mi.ingredient_id and i.active is distinct from false
      left join public.ingredient_stock s on s.branch_id=v_branch and s.ingredient_id=i.id
      where mi.recipe_version_id=v_recipe_version
        and mi.modifier_id in (
          select nullif(x->>'id','')::bigint from jsonb_array_elements(coalesce(v_input->'modifiers','[]'::jsonb)) x
        )
      order by mi.ingredient_id,mi.modifier_id
    loop
      v_need:=round(v_line.base_quantity_delta*v_qty/greatest(v_output_qty,0.000001),6);
      if v_need<=0 then continue; end if;
      v_unit_cost:=coalesce(v_line.unit_cost,0);

      if coalesce(v_line.track_inventory,true) then
        insert into public.ingredient_stock(branch_id,ingredient_id,quantity)
        values(v_branch,v_line.ingredient_id,0)
        on conflict(branch_id,ingredient_id) do nothing;
        select * into v_stock from public.ingredient_stock
        where branch_id=v_branch and ingredient_id=v_line.ingredient_id for update;
        v_unit_cost:=coalesce(nullif(v_stock.average_unit_cost,0),v_line.unit_cost,0);
        if v_stock.quantity<v_need then raise exception 'مخزون الخامة غير كافٍ لإضافة %',v_line.ingredient_id; end if;
        v_new:=round(v_stock.quantity-v_need,6);
        update public.ingredient_stock set quantity=v_new,updated_at=clock_timestamp() where id=v_stock.id;
        insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes)
        values(v_branch,v_line.ingredient_id,'sale',-v_need,'order_item',v_order_item_id,'Recipe modifier');
      end if;

      insert into public.food_order_item_consumption_snapshots(
        order_item_id,recipe_version_id,ingredient_id,source_kind,modifier_id,base_quantity,unit_cost_snapshot
      ) values(v_order_item_id,v_recipe_version,v_line.ingredient_id,'modifier',v_line.modifier_id,v_need,v_unit_cost);
      v_mod_cost:=v_mod_cost+(v_need*v_unit_cost);
    end loop;

    v_total_cost:=round(v_base_cost+v_mod_cost,6);
    insert into public.food_order_item_cost_snapshots(order_item_id,recipe_version_id,base_recipe_cost,modifier_cost,total_food_cost)
    values(v_order_item_id,v_recipe_version,round(v_base_cost,6),round(v_mod_cost,6),v_total_cost)
    on conflict(order_item_id) do nothing;
    update public.order_items set cost=round(v_total_cost/greatest(v_qty,0.000001),6) where id=v_order_item_id;
  end loop;
  return p_result;
end;
$function$
