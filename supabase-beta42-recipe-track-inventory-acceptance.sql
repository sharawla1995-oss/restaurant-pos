-- Sharawla POS 10.5.4-beta.42
-- Recipe Acceptance: track_inventory=false still participates in recipe cost and
-- consumption snapshots, but never creates/updates ingredient_stock and never
-- creates sale/return stock movements.
-- Operational target: isolated Beta backend only. Production is not targeted.

create or replace function public.create_food_pos_order_atomic_v1(p_order jsonb, p_items jsonb, p_payments jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
  v_branch bigint:=nullif(p_order->>'branch_id','')::bigint;
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
  v_emp bigint;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if v_branch is null or not public.has_branch_access(v_branch) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;

  v_result:=public.create_pos_order_atomic(p_order,p_items,p_payments);
  if coalesce((v_result->>'duplicate_prevented')::boolean,false) then return v_result; end if;
  v_emp:=public.current_employee_id();

  for v_pair in
    select a.value as input_item,b.value as saved_item
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) with ordinality a(value,ord)
    join jsonb_array_elements(coalesce(v_result->'items','[]'::jsonb)) with ordinality b(value,ord) using(ord)
  loop
    v_input:=v_pair.input_item;
    v_saved:=v_pair.saved_item;
    v_order_item_id:=nullif(v_saved->>'id','')::bigint;
    v_product_id:=nullif(v_input->>'product_id','')::bigint;
    v_variant_id:=nullif(v_input->>'variant_id','')::bigint;
    v_qty:=coalesce((v_input->>'quantity')::numeric,0);
    if v_order_item_id is null or v_product_id is null or v_qty<=0 then continue; end if;

    select rv.id,rv.output_quantity into v_recipe_version,v_output_qty
    from public.food_recipe_headers h
    join public.food_recipe_versions rv on rv.recipe_id=h.id and rv.status='active'
    where h.active=true and h.recipe_kind='sale' and h.product_id=v_product_id
      and (h.variant_id is null or h.variant_id=v_variant_id)
      and (rv.effective_from is null or rv.effective_from<=now())
      and (rv.effective_to is null or rv.effective_to>now())
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

      if v_line.track_inventory then
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
        update public.ingredient_stock set quantity=v_new,updated_at=now() where id=v_stock.id;
        insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes)
        values(v_branch,v_line.ingredient_id,'sale',-v_need,'order_item',v_order_item_id,'Recipe Basic V1');
      end if;

      insert into public.food_order_item_consumption_snapshots(order_item_id,recipe_version_id,ingredient_id,source_kind,modifier_id,base_quantity,unit_cost_snapshot)
      values(v_order_item_id,v_recipe_version,v_line.ingredient_id,'base',null,v_need,v_unit_cost);
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

      if v_line.track_inventory then
        insert into public.ingredient_stock(branch_id,ingredient_id,quantity)
        values(v_branch,v_line.ingredient_id,0)
        on conflict(branch_id,ingredient_id) do nothing;
        select * into v_stock from public.ingredient_stock
        where branch_id=v_branch and ingredient_id=v_line.ingredient_id for update;
        v_unit_cost:=coalesce(nullif(v_stock.average_unit_cost,0),v_line.unit_cost,0);
        if v_stock.quantity<v_need then raise exception 'مخزون الخامة غير كافٍ لإضافة %',v_line.ingredient_id; end if;
        v_new:=round(v_stock.quantity-v_need,6);
        update public.ingredient_stock set quantity=v_new,updated_at=now() where id=v_stock.id;
        insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes)
        values(v_branch,v_line.ingredient_id,'sale',-v_need,'order_item',v_order_item_id,'Recipe modifier');
      end if;

      insert into public.food_order_item_consumption_snapshots(order_item_id,recipe_version_id,ingredient_id,source_kind,modifier_id,base_quantity,unit_cost_snapshot)
      values(v_order_item_id,v_recipe_version,v_line.ingredient_id,'modifier',v_line.modifier_id,v_need,v_unit_cost);
      v_mod_cost:=v_mod_cost+(v_need*v_unit_cost);
    end loop;

    v_total_cost:=round(v_base_cost+v_mod_cost,6);
    insert into public.food_order_item_cost_snapshots(order_item_id,recipe_version_id,base_recipe_cost,modifier_cost,total_food_cost)
    values(v_order_item_id,v_recipe_version,round(v_base_cost,6),round(v_mod_cost,6),v_total_cost)
    on conflict(order_item_id) do nothing;
    update public.order_items set cost=round(v_total_cost/greatest(v_qty,0.000001),6) where id=v_order_item_id;
  end loop;
  return v_result;
end;
$function$;

create or replace function public.create_food_order_return_idempotent_v1(p_order_id bigint, p_reason text, p_notes text, p_items jsonb, p_payments jsonb, p_client_tx_id text)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_return_id bigint;
  v_branch bigint;
  v record;
  v_stock public.ingredient_stock%rowtype;
  v_restore numeric(18,6);
  v_new numeric(18,6);
  v_emp bigint;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  select branch_id into v_branch from public.orders where id=p_order_id;
  if v_branch is null then raise exception 'الفاتورة غير موجودة'; end if;
  if not public.has_branch_access(v_branch) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  perform pg_advisory_xact_lock(hashtextextended('food-return:'||v_key,0));
  select return_id into v_return_id from public.food_return_consumption_postings where client_tx_id=v_key;
  if v_return_id is not null then return v_return_id; end if;

  v_return_id:=public.create_order_return_idempotent(p_order_id,p_reason,p_notes,p_items,p_payments,v_key);
  if exists(select 1 from public.food_return_consumption_postings where return_id=v_return_id) then return v_return_id; end if;
  v_emp:=public.current_employee_id();

  for v in
    select oi.id order_item_id,oi.quantity original_qty,s.ingredient_id,i.track_inventory,
           sum(s.base_quantity) sold_base_quantity,
           case when sum(s.base_quantity)>0 then sum(s.base_quantity*s.unit_cost_snapshot)/sum(s.base_quantity) else 0 end unit_cost,
           coalesce((x->>'quantity')::numeric,0) return_qty
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
    join public.order_items oi on oi.id=nullif(x->>'order_item_id','')::bigint and oi.order_id=p_order_id
    join public.food_order_item_consumption_snapshots s on s.order_item_id=oi.id
    join public.ingredients i on i.id=s.ingredient_id
    group by oi.id,oi.quantity,s.ingredient_id,i.track_inventory,x->>'quantity'
    order by s.ingredient_id,oi.id
  loop
    if v.return_qty<=0 or v.original_qty<=0 then continue; end if;
    v_restore:=round(v.sold_base_quantity*least(v.return_qty,v.original_qty)/v.original_qty,6);
    if v_restore<=0 then continue; end if;

    if v.track_inventory then
      insert into public.ingredient_stock(branch_id,ingredient_id,quantity)
      values(v_branch,v.ingredient_id,0)
      on conflict(branch_id,ingredient_id) do nothing;
      select * into v_stock from public.ingredient_stock
      where branch_id=v_branch and ingredient_id=v.ingredient_id for update;
      v_new:=round(v_stock.quantity+v_restore,6);
      update public.ingredient_stock set quantity=v_new,updated_at=now() where id=v_stock.id;
      insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes)
      values(v_branch,v.ingredient_id,'return',v_restore,'return',v_return_id,'Recipe return snapshot restore');
    end if;

    insert into public.food_return_consumption_snapshots(return_id,order_item_id,ingredient_id,restored_base_quantity,unit_cost_snapshot)
    values(v_return_id,v.order_item_id,v.ingredient_id,v_restore,round(v.unit_cost,6))
    on conflict(return_id,order_item_id,ingredient_id) do nothing;
  end loop;

  insert into public.food_return_consumption_postings(return_id,order_id,client_tx_id)
  values(v_return_id,p_order_id,v_key) on conflict do nothing;
  return v_return_id;
end;
$function$;
