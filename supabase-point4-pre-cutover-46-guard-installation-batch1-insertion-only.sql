-- Sharawla Point 4 — Pre-Cutover 46 Guard Installation
-- Batch 1: 9 INSERTION_ONLY functions
-- SOURCE ONLY. No deployment is performed by this commit.
-- Contract/Evidence invariant: replay/classification -> read-only validation -> guard -> first commitment.
-- Canonical/Cutover activation is intentionally absent.

-- food_apply_ingredient_delta_internal_v1(bigint,bigint,numeric,numeric,text,text,bigint,text)
CREATE OR REPLACE FUNCTION public.food_apply_ingredient_delta_internal_v1(p_branch_id bigint, p_ingredient_id bigint, p_quantity_delta numeric, p_unit_cost numeric, p_movement_type text, p_reference_type text, p_reference_id bigint, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_stock public.ingredient_stock%rowtype;v_track boolean;v_new numeric(18,6);v_avg numeric(18,6);v_cost numeric(18,6):=greatest(0,coalesce(p_unit_cost,0));
begin
 if coalesce(p_quantity_delta,0)=0 then select * into v_stock from public.ingredient_stock where branch_id=p_branch_id and ingredient_id=p_ingredient_id;return jsonb_build_object('quantity',coalesce(v_stock.quantity,0),'average_unit_cost',coalesce(v_stock.average_unit_cost,0));end if;
 select track_inventory into v_track from public.ingredients where id=p_ingredient_id and active is distinct from false;if not found then raise exception 'الخامة غير موجودة أو موقوفة';end if;
 if not coalesce(v_track,true) then raise exception 'الخامة غير متتبعة بالمخزون';end if;
 perform public.inventory_stock_assert_legacy_write_allowed_v2(p_branch_id,'ingredient',p_ingredient_id);
 insert into public.ingredient_stock(branch_id,ingredient_id,quantity) values(p_branch_id,p_ingredient_id,0) on conflict(branch_id,ingredient_id) do nothing;
 select * into v_stock from public.ingredient_stock where branch_id=p_branch_id and ingredient_id=p_ingredient_id for update;
 v_new:=round(v_stock.quantity+p_quantity_delta,6);if v_new<0 then raise exception 'مخزون الخامة غير كافٍ';end if;
 v_avg:=v_stock.average_unit_cost;if p_quantity_delta>0 and v_cost>0 then v_avg:=case when v_new<=0 then v_cost else round(((v_stock.quantity*v_stock.average_unit_cost)+(p_quantity_delta*v_cost))/v_new,6) end;end if;
 update public.ingredient_stock set quantity=v_new,average_unit_cost=greatest(0,coalesce(v_avg,0)),last_purchase_cost=case when p_movement_type='purchase' and v_cost>0 then v_cost else last_purchase_cost end,last_costed_at=case when p_movement_type='purchase' and v_cost>0 then now() else last_costed_at end,updated_at=now() where id=v_stock.id;
 insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes) values(p_branch_id,p_ingredient_id,p_movement_type,round(p_quantity_delta,6),p_reference_type,p_reference_id,p_notes);
 return jsonb_build_object('quantity',v_new,'average_unit_cost',greatest(0,coalesce(v_avg,0)));
end;$function$

-- food_ingredient_stock_adjust_v1(bigint,bigint,numeric,numeric,text,text)
CREATE OR REPLACE FUNCTION public.food_ingredient_stock_adjust_v1(p_branch_id bigint, p_ingredient_id bigint, p_quantity_delta numeric, p_unit_cost numeric, p_reason text, p_client_tx_id text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_id bigint;
  v_emp bigint;
  v_stock public.ingredient_stock%rowtype;
  v_new numeric(18,6);
  v_cost numeric(18,6);
  v_track boolean;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية تعديل مخزون الخامات'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  if coalesce(p_quantity_delta,0)=0 then raise exception 'كمية التعديل لا يمكن أن تكون صفر'; end if;

  select track_inventory into v_track from public.ingredients where id=p_ingredient_id and active is distinct from false;
  if not found then raise exception 'الخامة غير موجودة أو موقوفة'; end if;
  if coalesce(p_unit_cost,0)<0 then raise exception 'التكلفة غير صحيحة'; end if;

  perform pg_advisory_xact_lock(hashtextextended('food-adjust:'||v_key,0));
  select id into v_id from public.food_ingredient_adjustment_events where client_tx_id=v_key;
  if v_id is not null then return v_id; end if;
  if not coalesce(v_track,true) then raise exception 'الخامة غير متتبعة بالمخزون ولا تقبل تعديل رصيد'; end if;

  perform public.inventory_stock_assert_legacy_write_allowed_v2(p_branch_id,'ingredient',p_ingredient_id);

  insert into public.ingredient_stock(branch_id,ingredient_id,quantity)
  values(p_branch_id,p_ingredient_id,0) on conflict(branch_id,ingredient_id) do nothing;
  select * into v_stock from public.ingredient_stock
  where branch_id=p_branch_id and ingredient_id=p_ingredient_id for update;
  v_new:=round(v_stock.quantity+p_quantity_delta,6);
  if v_new<0 then raise exception 'مخزون الخامة غير كافٍ'; end if;
  v_cost:=round(coalesce(nullif(p_unit_cost,0),nullif(v_stock.average_unit_cost,0),0),6);
  if p_quantity_delta>0 and coalesce(p_unit_cost,0)>0 then
    v_cost:=case when v_new<=0 then round(p_unit_cost,6)
      else round(((v_stock.quantity*v_stock.average_unit_cost)+(p_quantity_delta*p_unit_cost))/v_new,6) end;
  else
    v_cost:=v_stock.average_unit_cost;
  end if;
  update public.ingredient_stock
  set quantity=v_new,average_unit_cost=greatest(0,v_cost),
      last_purchase_cost=case when p_quantity_delta>0 and coalesce(p_unit_cost,0)>0 then round(p_unit_cost,6) else last_purchase_cost end,
      last_costed_at=case when p_quantity_delta>0 and coalesce(p_unit_cost,0)>0 then now() else last_costed_at end,
      updated_at=now()
  where id=v_stock.id;
  v_emp:=public.current_employee_id();
  insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes)
  values(p_branch_id,p_ingredient_id,'adjustment',round(p_quantity_delta,6),'food_adjustment',null,nullif(trim(coalesce(p_reason,'')),''));
  insert into public.food_ingredient_adjustment_events(
    branch_id,ingredient_id,quantity_delta,balance_after,unit_cost,reason,client_tx_id,employee_id
  ) values(
    p_branch_id,p_ingredient_id,round(p_quantity_delta,6),v_new,coalesce(p_unit_cost,0),
    nullif(trim(coalesce(p_reason,'')),''),v_key,v_emp
  ) returning id into v_id;
  return v_id;
end;
$function$

-- food_waste_post_v1(bigint,bigint,bigint,bigint,text,numeric,text,text,text)
CREATE OR REPLACE FUNCTION public.food_waste_post_v1(p_branch_id bigint, p_ingredient_id bigint, p_prep_item_id bigint, p_shift_id bigint, p_reason_code text, p_quantity numeric, p_unit_code text, p_notes text, p_client_tx_id text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_id bigint;
  v_factor numeric;
  v_base numeric(18,6);
  v_stock public.ingredient_stock%rowtype;
  v_new numeric(18,6);
  v_cost numeric(18,6);
  v_emp bigint;
  v_track boolean;
  v_base_unit text;
  v_fallback_cost numeric(18,6);
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية تسجيل الهالك'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  if coalesce(p_quantity,0)<=0 then raise exception 'كمية الهالك غير صحيحة'; end if;
  if not exists(select 1 from public.food_waste_reasons where code=p_reason_code and active=true) then raise exception 'سبب الهالك غير صالح'; end if;

  select i.base_unit_code,i.track_inventory,coalesce(nullif(s.average_unit_cost,0),i.cost_per_unit,0)
  into v_base_unit,v_track,v_fallback_cost
  from public.ingredients i
  left join public.ingredient_stock s on s.branch_id=p_branch_id and s.ingredient_id=i.id
  where i.id=p_ingredient_id and i.active is distinct from false;
  if v_base_unit is null then raise exception 'الخامة غير مجهزة بوحدة أساسية'; end if;

  v_factor:=public.ingredient_unit_factor_v1(p_ingredient_id,p_unit_code,v_base_unit);
  if v_factor is null or v_factor<=0 then raise exception 'لا يوجد تحويل وحدة صالح للهالك'; end if;
  v_base:=round(p_quantity*v_factor,6);
  if p_prep_item_id is not null and not exists(
    select 1 from public.food_prep_items where id=p_prep_item_id and output_ingredient_id=p_ingredient_id
  ) then raise exception 'Prep Item لا يطابق خامة الناتج'; end if;

  perform pg_advisory_xact_lock(hashtextextended('food-waste:'||v_key,0));
  select id into v_id from public.food_waste_events where client_tx_id=v_key;
  if v_id is not null then return v_id; end if;

  v_cost:=coalesce(v_fallback_cost,0);
  if coalesce(v_track,true) then
    perform public.inventory_stock_assert_legacy_write_allowed_v2(p_branch_id,'ingredient',p_ingredient_id);
    insert into public.ingredient_stock(branch_id,ingredient_id,quantity)
    values(p_branch_id,p_ingredient_id,0)
    on conflict(branch_id,ingredient_id) do nothing;
    select * into v_stock from public.ingredient_stock
    where branch_id=p_branch_id and ingredient_id=p_ingredient_id for update;
    if v_stock.quantity<v_base then raise exception 'مخزون الخامة غير كافٍ للهالك'; end if;
    v_cost:=coalesce(nullif(v_stock.average_unit_cost,0),v_fallback_cost,0);
    v_new:=round(v_stock.quantity-v_base,6);
    update public.ingredient_stock set quantity=v_new,updated_at=now() where id=v_stock.id;
  end if;

  v_emp:=public.current_employee_id();
  insert into public.food_waste_events(
    branch_id,ingredient_id,prep_item_id,shift_id,reason_code,quantity,unit_code,conversion_factor_to_base,
    unit_cost_snapshot,status,client_tx_id,notes,employee_id
  ) values(
    p_branch_id,p_ingredient_id,p_prep_item_id,p_shift_id,p_reason_code,round(p_quantity,6),p_unit_code,round(v_factor,6),
    round(v_cost,6),'posted',v_key,nullif(trim(coalesce(p_notes,'')),''),v_emp
  ) returning id into v_id;

  if coalesce(v_track,true) then
    insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes)
    values(p_branch_id,p_ingredient_id,'waste',-v_base,'waste',v_id,p_reason_code||coalesce(' — '||nullif(trim(coalesce(p_notes,'')),''),''));
  end if;
  return v_id;
end;
$function$

-- retail_inventory_adjust(bigint,bigint,numeric,text,text,text)
CREATE OR REPLACE FUNCTION public.retail_inventory_adjust(p_branch_id bigint, p_product_id bigint, p_quantity_delta numeric, p_movement_type text, p_notes text, p_client_tx_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp bigint;
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_type text:=lower(trim(coalesce(p_movement_type,'')));
  v_delta numeric(14,3):=round(coalesce(p_quantity_delta,0)::numeric,3);
  v_balance public.retail_inventory_balances%rowtype;
  v_existing public.retail_inventory_movements%rowtype;
begin
  if auth.uid() is null then
    raise exception 'غير مصرح';
  end if;

  if not (
    public.is_admin()
    or public.has_permission('inventory')
  ) then
    raise exception 'ليس لديك صلاحية إدارة المخزون';
  end if;

  if not public.has_branch_access(p_branch_id) then
    raise exception 'ليس لديك صلاحية لهذا الفرع';
  end if;

  if v_key is null then
    raise exception 'معرف الحركة مطلوب';
  end if;

  if v_type not in ('opening','adjustment','waste') then
    raise exception 'نوع حركة المخزون غير مسموح';
  end if;

  if v_delta=0 then
    raise exception 'كمية الحركة لا يمكن أن تكون صفر';
  end if;

  if v_type='waste' and v_delta>0 then
    v_delta:=-v_delta;
  end if;

  if not exists(
    select 1
    from public.products
    where id=p_product_id
      and active is distinct from false
  ) then
    raise exception 'الصنف غير موجود أو غير نشط';
  end if;

  v_emp:=public.current_employee_id();

  perform pg_advisory_xact_lock(
    hashtextextended(v_key,0)
  );

  select *
  into v_existing
  from public.retail_inventory_movements
  where client_tx_id=v_key
    and product_id=p_product_id
    and movement_type=v_type
  limit 1;

  if found then
    return to_jsonb(v_existing);
  end if;

  perform public.inventory_stock_assert_legacy_write_allowed_v2(p_branch_id,'product',p_product_id);

  insert into public.retail_inventory_balances(
    branch_id,
    product_id,
    quantity
  )
  values(
    p_branch_id,
    p_product_id,
    0
  )
  on conflict(branch_id,product_id)
  do nothing;

  select *
  into v_balance
  from public.retail_inventory_balances
  where branch_id=p_branch_id
    and product_id=p_product_id
  for update;

  update public.retail_inventory_balances
  set
    quantity=round(quantity+v_delta,3),
    updated_at=now()
  where branch_id=p_branch_id
    and product_id=p_product_id
  returning *
  into v_balance;

  insert into public.retail_inventory_movements(
    branch_id,
    product_id,
    movement_type,
    quantity_delta,
    balance_after,
    reference_type,
    reference_id,
    client_tx_id,
    notes,
    employee_id
  )
  values(
    p_branch_id,
    p_product_id,
    v_type,
    v_delta,
    v_balance.quantity,
    'manual',
    v_key,
    v_key,
    nullif(trim(coalesce(p_notes,'')),''),
    v_emp
  )
  returning *
  into v_existing;

  return to_jsonb(v_existing);
end;
$function$

-- retail_inventory_set_item_policy(bigint,bigint,boolean,numeric)
CREATE OR REPLACE FUNCTION public.retail_inventory_set_item_policy(p_branch_id bigint, p_product_id bigint, p_track_inventory boolean, p_low_stock_threshold numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.retail_inventory_balances%rowtype;
begin
  if auth.uid() is null then
    raise exception 'غير مصرح';
  end if;

  if not (
    public.is_admin()
    or public.has_permission('inventory')
  ) then
    raise exception 'ليس لديك صلاحية إدارة المخزون';
  end if;

  if not public.has_branch_access(p_branch_id) then
    raise exception 'ليس لديك صلاحية لهذا الفرع';
  end if;

  perform public.inventory_stock_assert_legacy_write_allowed_v2(p_branch_id,'product',p_product_id);

  insert into public.retail_inventory_balances(
    branch_id,
    product_id,
    quantity,
    track_inventory,
    low_stock_threshold
  )
  values(
    p_branch_id,
    p_product_id,
    0,
    coalesce(p_track_inventory,true),
    case
      when p_low_stock_threshold is null then null
      else greatest(
        0,
        round(p_low_stock_threshold::numeric,3)
      )
    end
  )
  on conflict(branch_id,product_id)
  do update set
    track_inventory=excluded.track_inventory,
    low_stock_threshold=excluded.low_stock_threshold,
    updated_at=now()
  returning *
  into v_row;

  return to_jsonb(v_row);
end;
$function$

-- retail_variant_inventory_adjust_v1(bigint,bigint,numeric,text,text,text)
CREATE OR REPLACE FUNCTION public.retail_variant_inventory_adjust_v1(p_branch_id bigint, p_variant_id bigint, p_quantity_delta numeric, p_movement_type text, p_notes text, p_client_tx_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp bigint;
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_type text:=lower(trim(coalesce(p_movement_type,'')));
  v_delta numeric(14,3):=round(coalesce(p_quantity_delta,0)::numeric,3);
  v_balance public.retail_variant_inventory_balances%rowtype;
  v_existing public.retail_variant_inventory_movements%rowtype;
  v_stock_unit boolean;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية إدارة المخزون'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  if v_type not in ('opening','adjustment','waste') then raise exception 'نوع حركة المخزون غير مسموح'; end if;
  if v_delta=0 then raise exception 'كمية الحركة لا يمكن أن تكون صفر'; end if;
  if v_type='waste' and v_delta>0 then v_delta:=-v_delta; end if;
  select coalesce(is_stock_unit,false) into v_stock_unit from public.product_variants where id=p_variant_id and active=true;
  if not found then raise exception 'الـ Variant غير موجود أو غير نشط'; end if;
  if not v_stock_unit then raise exception 'هذا الاختيار Legacy وليس Stock Unit مستقل'; end if;
  v_emp:=public.current_employee_id();
  perform pg_advisory_xact_lock(hashtextextended('variant-stock:'||v_key,0));
  select * into v_existing from public.retail_variant_inventory_movements
  where client_tx_id=v_key and variant_id=p_variant_id and movement_type=v_type limit 1;
  if found then return to_jsonb(v_existing); end if;
  perform public.inventory_stock_assert_legacy_write_allowed_v2(p_branch_id,'variant',p_variant_id);
  insert into public.retail_variant_inventory_balances(branch_id,variant_id,quantity)
  values(p_branch_id,p_variant_id,0) on conflict(branch_id,variant_id) do nothing;
  select * into v_balance from public.retail_variant_inventory_balances
  where branch_id=p_branch_id and variant_id=p_variant_id for update;
  update public.retail_variant_inventory_balances set quantity=round(quantity+v_delta,3),updated_at=now()
  where branch_id=p_branch_id and variant_id=p_variant_id returning * into v_balance;
  insert into public.retail_variant_inventory_movements(
    branch_id,variant_id,movement_type,quantity_delta,balance_after,reference_type,reference_id,client_tx_id,notes,employee_id
  ) values(
    p_branch_id,p_variant_id,v_type,v_delta,v_balance.quantity,'manual',v_key,v_key,nullif(trim(coalesce(p_notes,'')),''),v_emp
  ) returning * into v_existing;
  return to_jsonb(v_existing);
end;
$function$

-- inventory_supply_request_cancel_v1(bigint,text)
CREATE OR REPLACE FUNCTION public.inventory_supply_request_cancel_v1(p_request_id bigint, p_note text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_q public.inventory_supply_requests%rowtype;v_emp bigint;v_can boolean:=false;
begin
  if auth.uid() is null then raise exception 'غير مصرح';end if;
  select * into v_q from public.inventory_supply_requests where id=p_request_id for update;
  if not found then raise exception 'طلب التوريد غير موجود';end if;
  if v_q.status='cancelled' then return v_q.id;end if;
  if v_q.status not in ('draft','submitted','approved','preparing') then raise exception 'لا يمكن إلغاء الطلب بعد الصرف';end if;
  if exists(select 1 from public.inventory_supply_request_items where request_id=v_q.id and quantity_dispatched>0) then raise exception 'لا يمكن إلغاء طلب تم صرف جزء منه';end if;
  if v_q.status in ('draft','submitted') then
    v_can:=public.has_branch_access(v_q.destination_branch_id) and public.has_action_permission_v2('inventory.supply.request.create');
  else
    v_can:=public.has_branch_access(v_q.source_location_id) and public.has_action_permission_v2('inventory.supply.request.approve');
  end if;
  if not v_can then raise exception 'ليس لديك صلاحية إلغاء الطلب في حالته الحالية';end if;
  v_emp:=public.current_employee_id();
  perform public.inventory_stock_assert_document_workflow_allowed_v2('inventory_supply_request_cancel_v1(bigint,text)');
  update public.inventory_supply_request_items set quantity_reserved=0 where request_id=v_q.id;
  update public.inventory_supply_requests set status='cancelled',decision_note=nullif(trim(coalesce(p_note,'')),''),updated_at=now() where id=v_q.id;
  insert into public.inventory_supply_request_events(request_id,from_status,to_status,note,employee_id,details)
  values(v_q.id,v_q.status,'cancelled',nullif(trim(coalesce(p_note,'')),''),v_emp,jsonb_build_object('reservation_released',true));
  insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
  values(v_emp,case when v_q.status in ('approved','preparing') then v_q.source_location_id else v_q.destination_branch_id end,
    'inventory.supply.request.cancel','inventory_supply_request',v_q.id,jsonb_build_object('from_status',v_q.status,'reservation_released',true));
  return v_q.id;
end;
$function$

-- inventory_supply_request_prepare_v1(bigint,text)
CREATE OR REPLACE FUNCTION public.inventory_supply_request_prepare_v1(p_request_id bigint, p_note text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_q public.inventory_supply_requests%rowtype;v_emp bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not public.has_action_permission_v2('inventory.supply.request.fulfill') then raise exception 'ليس لديك صلاحية تجهيز طلبات التوريد';end if;
 select * into v_q from public.inventory_supply_requests where id=p_request_id for update;
 if not found then raise exception 'طلب التوريد غير موجود';end if;
 if not public.has_branch_access(v_q.source_location_id) then raise exception 'ليس لديك صلاحية المخزن المصدر';end if;
 if v_q.status='preparing' then return v_q.id;end if;
 if v_q.status<>'approved' then raise exception 'الطلب غير جاهز للتجهيز';end if;
 v_emp:=public.current_employee_id();
 perform public.inventory_stock_assert_document_workflow_allowed_v2('inventory_supply_request_prepare_v1(bigint,text)');
 update public.inventory_supply_requests set status='preparing',updated_at=now() where id=v_q.id;
 insert into public.inventory_supply_request_events(request_id,from_status,to_status,note,employee_id) values(v_q.id,'approved','preparing',nullif(trim(coalesce(p_note,'')),''),v_emp);
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(v_emp,v_q.source_location_id,'inventory.supply.request.prepare','inventory_supply_request',v_q.id,jsonb_build_object('destination_branch_id',v_q.destination_branch_id));
 return v_q.id;
end;
$function$

-- inventory_supply_request_submit_v1(bigint)
CREATE OR REPLACE FUNCTION public.inventory_supply_request_submit_v1(p_request_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_q public.inventory_supply_requests%rowtype;v_emp bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not public.has_action_permission_v2('inventory.supply.request.submit') then raise exception 'ليس لديك صلاحية إرسال طلب التوريد';end if;
 select * into v_q from public.inventory_supply_requests where id=p_request_id for update;
 if not found then raise exception 'طلب التوريد غير موجود';end if;
 if not public.has_branch_access(v_q.destination_branch_id) then raise exception 'ليس لديك صلاحية الفرع الطالب';end if;
 if v_q.status='submitted' then return v_q.id;end if;
 if v_q.status<>'draft' then raise exception 'لا يمكن إرسال الطلب في حالته الحالية';end if;
 v_emp:=public.current_employee_id();
 perform public.inventory_stock_assert_document_workflow_allowed_v2('inventory_supply_request_submit_v1(bigint)');
 update public.inventory_supply_requests set status='submitted',submitted_by_employee_id=v_emp,submitted_at=now(),updated_at=now() where id=v_q.id;
 insert into public.inventory_supply_request_events(request_id,from_status,to_status,note,employee_id) values(v_q.id,'draft','submitted','تم إرسال الطلب للمخزن',v_emp);
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(v_emp,v_q.destination_branch_id,'inventory.supply.request.submit','inventory_supply_request',v_q.id,jsonb_build_object('source_location_id',v_q.source_location_id));
 return v_q.id;
end;
$function$
