-- Point 4 Contract #12 — source-only guarded implementation.
-- Baseline: immutable runtime recovery evidence MD5 5e7cede708dcdf805a914f6ddc6dc3bb.
-- No deployment/cutover/activation in this file.
create or replace function public.food_apply_return_consumption_v1(p_return_id bigint,p_order_id bigint,p_items jsonb,p_client_tx_id text)
returns bigint language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_branch bigint; v record; v_guard record; v_stock public.ingredient_stock%rowtype;
  v_restore numeric(18,6); v_new numeric(18,6); v_frozen jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  if p_return_id is null then raise exception 'تعذر تحديد المرتجع لتطبيق Recipe'; end if;
  select branch_id into v_branch from public.orders where id=p_order_id;
  if v_branch is null then raise exception 'الفاتورة غير موجودة'; end if;
  if not public.has_branch_access(v_branch) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  perform pg_advisory_xact_lock(hashtextextended('food-return:'||v_key,0));
  if exists(select 1 from public.food_return_consumption_postings where client_tx_id=v_key or return_id=p_return_id) then return p_return_id; end if;

  -- Phase A: freeze historical consumption evidence. Never recalculate the current recipe for a return.
  for v in
    select oi.id order_item_id,oi.quantity original_qty,s.ingredient_id,
      sum(s.base_quantity) sold_base_quantity,
      case when sum(s.base_quantity)>0 then sum(s.base_quantity*s.unit_cost_snapshot)/sum(s.base_quantity) else 0 end unit_cost,
      coalesce((x->>'quantity')::numeric,0) return_qty,
      exists(select 1 from public.stock_movements sm where sm.reference_type='order_item' and sm.reference_id=oi.id
        and sm.ingredient_id=s.ingredient_id and sm.movement_type='sale' and sm.quantity<0) restore_inventory
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
    join public.order_items oi on oi.id=nullif(x->>'order_item_id','')::bigint and oi.order_id=p_order_id
    join public.food_order_item_consumption_snapshots s on s.order_item_id=oi.id
    group by oi.id,oi.quantity,s.ingredient_id,x->>'quantity'
    order by s.ingredient_id,oi.id
  loop
    if v.return_qty<=0 or v.original_qty<=0 then continue; end if;
    v_restore:=round(v.sold_base_quantity*least(v.return_qty,v.original_qty)/v.original_qty,6);
    if v_restore<=0 then continue; end if;
    v_frozen:=v_frozen||jsonb_build_array(jsonb_build_object(
      'order_item_id',v.order_item_id,'ingredient_id',v.ingredient_id,'restore',v_restore,
      'unit_cost',round(v.unit_cost,6),'restore_inventory',v.restore_inventory));
  end loop;

  -- Ownership boundary: only historical identities that will physically restore stock.
  for v_guard in
    select distinct (x->>'ingredient_id')::bigint ingredient_id from jsonb_array_elements(v_frozen) x
    where coalesce((x->>'restore_inventory')::boolean,false) order by 1
  loop
    perform public.inventory_stock_assert_legacy_write_allowed_v2(v_branch,'ingredient',v_guard.ingredient_id);
  end loop;

  -- Phase B: execute from the exact frozen historical evidence only.
  for v in
    select (x->>'order_item_id')::bigint order_item_id,(x->>'ingredient_id')::bigint ingredient_id,
      (x->>'restore')::numeric restore,(x->>'unit_cost')::numeric unit_cost,
      coalesce((x->>'restore_inventory')::boolean,false) restore_inventory
    from jsonb_array_elements(v_frozen) x
  loop
    if v.restore_inventory then
      insert into public.ingredient_stock(branch_id,ingredient_id,quantity) values(v_branch,v.ingredient_id,0)
      on conflict(branch_id,ingredient_id) do nothing;
      select * into v_stock from public.ingredient_stock where branch_id=v_branch and ingredient_id=v.ingredient_id for update;
      v_new:=round(v_stock.quantity+v.restore,6);
      update public.ingredient_stock set quantity=v_new,updated_at=clock_timestamp() where id=v_stock.id;
      insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes)
      values(v_branch,v.ingredient_id,'return',v.restore,'return',p_return_id,'Recipe return snapshot restore');
    end if;
    insert into public.food_return_consumption_snapshots(return_id,order_item_id,ingredient_id,restored_base_quantity,unit_cost_snapshot)
    values(p_return_id,v.order_item_id,v.ingredient_id,v.restore,v.unit_cost)
    on conflict(return_id,order_item_id,ingredient_id) do nothing;
  end loop;
  insert into public.food_return_consumption_postings(return_id,order_id,client_tx_id)
  values(p_return_id,p_order_id,v_key) on conflict do nothing;
  return p_return_id;
end;
$function$;
