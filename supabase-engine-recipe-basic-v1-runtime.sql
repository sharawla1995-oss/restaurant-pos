-- Sharawla POS — Recipe Basic V1 Runtime
-- Beta-first, additive, capability-gated by the POS bridge.
-- Legacy create_pos_order_atomic / create_order_return_idempotent remain untouched.

begin;

-- -----------------------------------------------------------------------------
-- 1) Idempotency / audit tables for ingredient adjustments and food returns
-- -----------------------------------------------------------------------------
create table if not exists public.food_ingredient_adjustment_events (
  id bigserial primary key,
  branch_id bigint not null references public.branches(id) on delete restrict,
  ingredient_id bigint not null references public.ingredients(id) on delete restrict,
  quantity_delta numeric(18,6) not null check (quantity_delta <> 0),
  balance_after numeric(18,6) not null,
  unit_cost numeric(18,6) not null default 0 check (unit_cost >= 0),
  reason text,
  client_tx_id text not null unique,
  employee_id bigint references public.employees(id),
  created_at timestamptz not null default now()
);

create table if not exists public.food_return_consumption_postings (
  return_id bigint primary key references public.returns(id) on delete cascade,
  order_id bigint not null references public.orders(id) on delete cascade,
  client_tx_id text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.food_return_consumption_snapshots (
  id bigserial primary key,
  return_id bigint not null references public.returns(id) on delete cascade,
  order_item_id bigint not null references public.order_items(id) on delete cascade,
  ingredient_id bigint not null references public.ingredients(id) on delete restrict,
  restored_base_quantity numeric(18,6) not null check (restored_base_quantity > 0),
  unit_cost_snapshot numeric(18,6) not null default 0 check (unit_cost_snapshot >= 0),
  restored_cost numeric(18,6) generated always as (restored_base_quantity*unit_cost_snapshot) stored,
  created_at timestamptz not null default now(),
  unique(return_id,order_item_id,ingredient_id)
);

create index if not exists food_return_consumption_order_item_idx
  on public.food_return_consumption_snapshots(order_item_id);

alter table public.food_ingredient_adjustment_events enable row level security;
alter table public.food_return_consumption_postings enable row level security;
alter table public.food_return_consumption_snapshots enable row level security;

-- Read-only policies follow branch ownership through the referenced documents.
drop policy if exists food_ingredient_adjustment_events_select_v1 on public.food_ingredient_adjustment_events;
create policy food_ingredient_adjustment_events_select_v1 on public.food_ingredient_adjustment_events
for select to authenticated using (public.has_branch_access(branch_id));

drop policy if exists food_return_consumption_postings_select_v1 on public.food_return_consumption_postings;
create policy food_return_consumption_postings_select_v1 on public.food_return_consumption_postings
for select to authenticated using (
  exists(select 1 from public.orders o where o.id=order_id and public.has_branch_access(o.branch_id))
);

drop policy if exists food_return_consumption_snapshots_select_v1 on public.food_return_consumption_snapshots;
create policy food_return_consumption_snapshots_select_v1 on public.food_return_consumption_snapshots
for select to authenticated using (
  exists(
    select 1 from public.order_items oi
    join public.orders o on o.id=oi.order_id
    where oi.id=order_item_id and public.has_branch_access(o.branch_id)
  )
);

revoke insert,update,delete on public.food_ingredient_adjustment_events,
  public.food_return_consumption_postings,public.food_return_consumption_snapshots from authenticated;
grant select on public.food_ingredient_adjustment_events,
  public.food_return_consumption_postings,public.food_return_consumption_snapshots to authenticated;

-- -----------------------------------------------------------------------------
-- 2) Ingredient CRUD and stock adjustment
-- -----------------------------------------------------------------------------
create or replace function public.food_ingredient_save_v1(
  p_ingredient_id bigint,
  p_name text,
  p_base_unit_code text,
  p_purchase_unit_code text,
  p_sku text,
  p_barcode text,
  p_cost_per_base_unit numeric,
  p_minimum_quantity numeric,
  p_track_inventory boolean,
  p_usable_yield_percent numeric,
  p_shelf_life_minutes integer,
  p_active boolean
) returns bigint
language plpgsql security definer set search_path=public
as $$
declare v_id bigint; v_name text:=nullif(trim(coalesce(p_name,'')),'');
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية إدارة الخامات'; end if;
  if v_name is null then raise exception 'اسم الخامة مطلوب'; end if;
  if not exists(select 1 from public.inventory_units where code=p_base_unit_code and active=true) then raise exception 'وحدة التخزين غير صالحة'; end if;
  if p_purchase_unit_code is not null and not exists(select 1 from public.inventory_units where code=p_purchase_unit_code and active=true) then raise exception 'وحدة الشراء غير صالحة'; end if;
  if coalesce(p_cost_per_base_unit,0)<0 or coalesce(p_minimum_quantity,0)<0 then raise exception 'التكلفة أو الحد الأدنى غير صالح'; end if;
  if coalesce(p_usable_yield_percent,100)<=0 or coalesce(p_usable_yield_percent,100)>100 then raise exception 'Yield يجب أن يكون أكبر من 0 وحتى 100'; end if;
  if p_shelf_life_minutes is not null and p_shelf_life_minutes<0 then raise exception 'مدة الصلاحية غير صحيحة'; end if;

  if p_ingredient_id is null then
    insert into public.ingredients(name,unit,cost_per_unit,minimum_quantity,active,base_unit_code,purchase_unit_code,sku,barcode,track_inventory,usable_yield_percent,shelf_life_minutes,updated_at)
    values(v_name,p_base_unit_code,round(coalesce(p_cost_per_base_unit,0),6),round(coalesce(p_minimum_quantity,0),6),coalesce(p_active,true),p_base_unit_code,coalesce(p_purchase_unit_code,p_base_unit_code),nullif(trim(coalesce(p_sku,'')),''),nullif(trim(coalesce(p_barcode,'')),''),coalesce(p_track_inventory,true),coalesce(p_usable_yield_percent,100),p_shelf_life_minutes,now())
    returning id into v_id;
  else
    if not exists(select 1 from public.ingredients where id=p_ingredient_id) then raise exception 'الخامة غير موجودة'; end if;
    update public.ingredients
    set name=v_name,unit=p_base_unit_code,cost_per_unit=round(coalesce(p_cost_per_base_unit,0),6),minimum_quantity=round(coalesce(p_minimum_quantity,0),6),active=coalesce(p_active,true),base_unit_code=p_base_unit_code,purchase_unit_code=coalesce(p_purchase_unit_code,p_base_unit_code),sku=nullif(trim(coalesce(p_sku,'')),''),barcode=nullif(trim(coalesce(p_barcode,'')),''),track_inventory=coalesce(p_track_inventory,true),usable_yield_percent=coalesce(p_usable_yield_percent,100),shelf_life_minutes=p_shelf_life_minutes,updated_at=now()
    where id=p_ingredient_id returning id into v_id;
  end if;
  return v_id;
end;$$;

create or replace function public.food_ingredient_conversion_save_v1(
  p_ingredient_id bigint,p_from_unit_code text,p_to_unit_code text,p_factor numeric,p_active boolean
) returns bigint
language plpgsql security definer set search_path=public
as $$
declare v_id bigint;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية إدارة تحويلات الوحدات'; end if;
  if not exists(select 1 from public.ingredients where id=p_ingredient_id) then raise exception 'الخامة غير موجودة'; end if;
  if p_from_unit_code=p_to_unit_code or coalesce(p_factor,0)<=0 then raise exception 'تحويل الوحدة غير صحيح'; end if;
  if not exists(select 1 from public.inventory_units where code=p_from_unit_code and active=true) or not exists(select 1 from public.inventory_units where code=p_to_unit_code and active=true) then raise exception 'وحدة غير صالحة'; end if;
  insert into public.ingredient_unit_conversions(ingredient_id,from_unit_code,to_unit_code,factor,active,updated_at)
  values(p_ingredient_id,p_from_unit_code,p_to_unit_code,round(p_factor,6),coalesce(p_active,true),now())
  on conflict(ingredient_id,from_unit_code,to_unit_code) do update set factor=excluded.factor,active=excluded.active,updated_at=now()
  returning id into v_id;
  return v_id;
end;$$;

create or replace function public.food_ingredient_stock_adjust_v1(
  p_branch_id bigint,p_ingredient_id bigint,p_quantity_delta numeric,p_unit_cost numeric,p_reason text,p_client_tx_id text
) returns bigint
language plpgsql security definer set search_path=public
as $$
declare
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),''); v_id bigint; v_emp bigint;
  v_stock public.ingredient_stock%rowtype; v_new numeric(18,6); v_cost numeric(18,6); v_track boolean;
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

  insert into public.ingredient_stock(branch_id,ingredient_id,quantity)
  values(p_branch_id,p_ingredient_id,0) on conflict(branch_id,ingredient_id) do nothing;
  select * into v_stock from public.ingredient_stock where branch_id=p_branch_id and ingredient_id=p_ingredient_id for update;
  v_new:=round(v_stock.quantity+p_quantity_delta,6);
  if v_track and v_new<0 then raise exception 'مخزون الخامة غير كافٍ'; end if;
  v_cost:=round(coalesce(nullif(p_unit_cost,0),nullif(v_stock.average_unit_cost,0),0),6);

  -- Positive stock with an explicit cost updates weighted average; negative adjustment keeps average unchanged.
  if p_quantity_delta>0 and coalesce(p_unit_cost,0)>0 then
    v_cost:=case when v_new<=0 then round(p_unit_cost,6)
      else round(((v_stock.quantity*v_stock.average_unit_cost)+(p_quantity_delta*p_unit_cost))/v_new,6) end;
  else
    v_cost:=v_stock.average_unit_cost;
  end if;

  update public.ingredient_stock
  set quantity=v_new,average_unit_cost=greatest(0,v_cost),last_purchase_cost=case when p_quantity_delta>0 and coalesce(p_unit_cost,0)>0 then round(p_unit_cost,6) else last_purchase_cost end,last_costed_at=case when p_quantity_delta>0 and coalesce(p_unit_cost,0)>0 then now() else last_costed_at end,updated_at=now()
  where id=v_stock.id;

  v_emp:=public.current_employee_id();
  insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes)
  values(p_branch_id,p_ingredient_id,'adjustment',round(p_quantity_delta,6),'food_adjustment',null,nullif(trim(coalesce(p_reason,'')),''));
  insert into public.food_ingredient_adjustment_events(branch_id,ingredient_id,quantity_delta,balance_after,unit_cost,reason,client_tx_id,employee_id)
  values(p_branch_id,p_ingredient_id,round(p_quantity_delta,6),v_new,coalesce(p_unit_cost,0),nullif(trim(coalesce(p_reason,'')),''),v_key,v_emp)
  returning id into v_id;
  return v_id;
end;$$;

-- -----------------------------------------------------------------------------
-- 3) Immutable Recipe draft/version creation + activation
-- -----------------------------------------------------------------------------
create or replace function public.food_recipe_save_draft_v1(
  p_product_id bigint,p_variant_id bigint,p_name text,p_output_quantity numeric,p_output_unit_code text,
  p_lines jsonb,p_modifier_impacts jsonb,p_removal_mappings jsonb,p_notes text
) returns bigint
language plpgsql security definer set search_path=public
as $$
declare
  v_recipe_id bigint; v_version_id bigint; v_version_no integer; v_emp bigint; v record; v_factor numeric;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية إدارة الوصفات'; end if;
  if not exists(select 1 from public.products where id=p_product_id and active is distinct from false) then raise exception 'الصنف غير موجود'; end if;
  if p_variant_id is not null and not exists(select 1 from public.product_variants where id=p_variant_id and product_id=p_product_id and active=true) then raise exception 'الـVariant غير مطابق للصنف'; end if;
  if coalesce(p_output_quantity,0)<=0 then raise exception 'كمية ناتج الوصفة غير صحيحة'; end if;
  if not exists(select 1 from public.inventory_units where code=p_output_unit_code and active=true) then raise exception 'وحدة الناتج غير صالحة'; end if;
  if jsonb_typeof(coalesce(p_lines,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then raise exception 'الوصفة تحتاج خامة واحدة على الأقل'; end if;

  select id into v_recipe_id from public.food_recipe_headers
  where product_id=p_product_id and variant_id is not distinct from p_variant_id and recipe_kind='sale' and active=true
  order by id limit 1;
  if v_recipe_id is null then
    insert into public.food_recipe_headers(product_id,variant_id,name,recipe_kind,active)
    values(p_product_id,p_variant_id,nullif(trim(coalesce(p_name,'')),''),'sale',true) returning id into v_recipe_id;
  else
    update public.food_recipe_headers set name=coalesce(nullif(trim(coalesce(p_name,'')),''),name),updated_at=now() where id=v_recipe_id;
  end if;

  select coalesce(max(version_no),0)+1 into v_version_no from public.food_recipe_versions where recipe_id=v_recipe_id;
  v_emp:=public.current_employee_id();
  insert into public.food_recipe_versions(recipe_id,version_no,status,output_quantity,output_unit_code,notes,created_by_employee_id)
  values(v_recipe_id,v_version_no,'draft',round(p_output_quantity,6),p_output_unit_code,nullif(trim(coalesce(p_notes,'')),''),v_emp)
  returning id into v_version_id;

  for v in select * from jsonb_to_recordset(p_lines) as x(ingredient_id bigint,quantity numeric,unit_code text,sort_order integer,notes text)
  loop
    if coalesce(v.quantity,0)<=0 then raise exception 'كمية خامة غير صحيحة'; end if;
    if not exists(select 1 from public.ingredients where id=v.ingredient_id and active is distinct from false) then raise exception 'خامة غير صالحة %',v.ingredient_id; end if;
    select public.ingredient_unit_factor_v1(v.ingredient_id,v.unit_code,i.base_unit_code) into v_factor from public.ingredients i where i.id=v.ingredient_id;
    if v_factor is null or v_factor<=0 then raise exception 'لا يوجد تحويل من % إلى وحدة التخزين للخامة %',v.unit_code,v.ingredient_id; end if;
    insert into public.food_recipe_lines(recipe_version_id,ingredient_id,quantity,unit_code,conversion_factor_to_base,sort_order,notes)
    values(v_version_id,v.ingredient_id,round(v.quantity,6),v.unit_code,round(v_factor,6),coalesce(v.sort_order,0),nullif(trim(coalesce(v.notes,'')),''));
  end loop;

  for v in select * from jsonb_to_recordset(coalesce(p_modifier_impacts,'[]'::jsonb)) as x(modifier_id bigint,ingredient_id bigint,quantity numeric,unit_code text)
  loop
    if coalesce(v.quantity,0)<=0 then raise exception 'تأثير الإضافة على الخامة يجب أن يكون موجبًا؛ استخدم Removal للحذف'; end if;
    if not exists(select 1 from public.modifiers where id=v.modifier_id) then raise exception 'الإضافة غير موجودة'; end if;
    select public.ingredient_unit_factor_v1(v.ingredient_id,v.unit_code,i.base_unit_code) into v_factor from public.ingredients i where i.id=v.ingredient_id and i.active is distinct from false;
    if v_factor is null or v_factor<=0 then raise exception 'تحويل وحدة Modifier غير صالح'; end if;
    insert into public.food_modifier_recipe_impacts(recipe_version_id,modifier_id,ingredient_id,quantity_delta,unit_code,conversion_factor_to_base)
    values(v_version_id,v.modifier_id,v.ingredient_id,round(v.quantity,6),v.unit_code,round(v_factor,6));
  end loop;

  for v in select * from jsonb_to_recordset(coalesce(p_removal_mappings,'[]'::jsonb)) as x(component_name text,ingredient_id bigint)
  loop
    if nullif(trim(coalesce(v.component_name,'')),'') is null then raise exception 'اسم المكون القابل للحذف مطلوب'; end if;
    if not exists(select 1 from public.ingredients where id=v.ingredient_id) then raise exception 'خامة Removal غير موجودة'; end if;
    insert into public.food_recipe_removal_mappings(recipe_version_id,component_name,ingredient_id,behavior)
    values(v_version_id,trim(v.component_name),v.ingredient_id,'exclude');
  end loop;
  return v_version_id;
end;$$;

create or replace function public.food_recipe_activate_version_v1(p_recipe_version_id bigint) returns bigint
language plpgsql security definer set search_path=public
as $$
declare v public.food_recipe_versions%rowtype;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية اعتماد الوصفة'; end if;
  select * into v from public.food_recipe_versions where id=p_recipe_version_id for update;
  if not found then raise exception 'نسخة الوصفة غير موجودة'; end if;
  if v.status<>'draft' then raise exception 'يمكن اعتماد نسخة Draft فقط'; end if;
  if not exists(select 1 from public.food_recipe_lines where recipe_version_id=v.id) then raise exception 'الوصفة بدون خامات'; end if;
  update public.food_recipe_versions set status='retired',effective_to=coalesce(effective_to,now()),updated_at=now()
  where recipe_id=v.recipe_id and status='active';
  update public.food_recipe_versions set status='active',effective_from=now(),effective_to=null,updated_at=now() where id=v.id;
  return v.id;
end;$$;

-- -----------------------------------------------------------------------------
-- 4) Atomic sale wrapper: base order + ingredient stock + historical snapshots
-- -----------------------------------------------------------------------------
create or replace function public.create_food_pos_order_atomic_v1(
  p_order jsonb,p_items jsonb,p_payments jsonb
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_result jsonb; v_branch bigint:=nullif(p_order->>'branch_id','')::bigint; v_pair record;
  v_input jsonb; v_saved jsonb; v_order_item_id bigint; v_product_id bigint; v_variant_id bigint; v_qty numeric;
  v_recipe_version bigint; v_output_qty numeric; v_line record; v_stock public.ingredient_stock%rowtype;
  v_need numeric(18,6); v_new numeric(18,6); v_unit_cost numeric(18,6);
  v_base_cost numeric(18,6); v_mod_cost numeric(18,6); v_total_cost numeric(18,6); v_emp bigint;
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
    v_input:=v_pair.input_item; v_saved:=v_pair.saved_item;
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
    v_base_cost:=0; v_mod_cost:=0;

    -- Base recipe lines, excluding explicitly removed components.
    for v_line in
      select l.ingredient_id,l.base_quantity,i.track_inventory,coalesce(nullif(s.average_unit_cost,0),coalesce(i.cost_per_unit,0))::numeric(18,6) as unit_cost
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
      insert into public.ingredient_stock(branch_id,ingredient_id,quantity)
      values(v_branch,v_line.ingredient_id,0) on conflict(branch_id,ingredient_id) do nothing;
      select * into v_stock from public.ingredient_stock where branch_id=v_branch and ingredient_id=v_line.ingredient_id for update;
      v_unit_cost:=coalesce(nullif(v_stock.average_unit_cost,0),v_line.unit_cost,0);
      if v_line.track_inventory and v_stock.quantity<v_need then raise exception 'مخزون الخامة غير كافٍ للخامة % — المتاح % والمطلوب %',v_line.ingredient_id,v_stock.quantity,v_need; end if;
      v_new:=round(v_stock.quantity-v_need,6);
      update public.ingredient_stock set quantity=v_new,updated_at=now() where id=v_stock.id;
      insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes)
      values(v_branch,v_line.ingredient_id,'sale',-v_need,'order_item',v_order_item_id,'Recipe Basic V1');
      insert into public.food_order_item_consumption_snapshots(order_item_id,recipe_version_id,ingredient_id,source_kind,modifier_id,base_quantity,unit_cost_snapshot)
      values(v_order_item_id,v_recipe_version,v_line.ingredient_id,'base',null,v_need,v_unit_cost);
      v_base_cost:=v_base_cost+(v_need*v_unit_cost);
    end loop;

    -- Positive modifier impacts (Extras). Removal is modeled separately above.
    for v_line in
      select mi.ingredient_id,mi.modifier_id,mi.base_quantity_delta,i.track_inventory,coalesce(nullif(s.average_unit_cost,0),coalesce(i.cost_per_unit,0))::numeric(18,6) as unit_cost
      from public.food_modifier_recipe_impacts mi
      join public.ingredients i on i.id=mi.ingredient_id and i.active is distinct from false
      left join public.ingredient_stock s on s.branch_id=v_branch and s.ingredient_id=i.id
      where mi.recipe_version_id=v_recipe_version and mi.modifier_id in (
        select nullif(x->>'id','')::bigint from jsonb_array_elements(coalesce(v_input->'modifiers','[]'::jsonb)) x
      )
      order by mi.ingredient_id,mi.modifier_id
    loop
      v_need:=round(v_line.base_quantity_delta*v_qty/greatest(v_output_qty,0.000001),6);
      if v_need<=0 then continue; end if;
      insert into public.ingredient_stock(branch_id,ingredient_id,quantity)
      values(v_branch,v_line.ingredient_id,0) on conflict(branch_id,ingredient_id) do nothing;
      select * into v_stock from public.ingredient_stock where branch_id=v_branch and ingredient_id=v_line.ingredient_id for update;
      v_unit_cost:=coalesce(nullif(v_stock.average_unit_cost,0),v_line.unit_cost,0);
      if v_line.track_inventory and v_stock.quantity<v_need then raise exception 'مخزون الخامة غير كافٍ لإضافة %',v_line.ingredient_id; end if;
      v_new:=round(v_stock.quantity-v_need,6);
      update public.ingredient_stock set quantity=v_new,updated_at=now() where id=v_stock.id;
      insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes)
      values(v_branch,v_line.ingredient_id,'sale',-v_need,'order_item',v_order_item_id,'Recipe modifier');
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
end;$$;

-- -----------------------------------------------------------------------------
-- 5) Atomic food return: restore from historical snapshots, never recalculate recipe
-- -----------------------------------------------------------------------------
create or replace function public.create_food_order_return_idempotent_v1(
  p_order_id bigint,p_reason text,p_notes text,p_items jsonb,p_payments jsonb,p_client_tx_id text
) returns bigint
language plpgsql security definer set search_path=public
as $$
declare
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),''); v_return_id bigint; v_branch bigint;
  v record; v_stock public.ingredient_stock%rowtype; v_restore numeric(18,6); v_new numeric(18,6); v_emp bigint;
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
    select oi.id order_item_id,oi.quantity original_qty,s.ingredient_id,
           sum(s.base_quantity) sold_base_quantity,
           case when sum(s.base_quantity)>0 then sum(s.base_quantity*s.unit_cost_snapshot)/sum(s.base_quantity) else 0 end unit_cost,
           coalesce((x->>'quantity')::numeric,0) return_qty
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
    join public.order_items oi on oi.id=nullif(x->>'order_item_id','')::bigint and oi.order_id=p_order_id
    join public.food_order_item_consumption_snapshots s on s.order_item_id=oi.id
    group by oi.id,oi.quantity,s.ingredient_id,x->>'quantity'
    order by s.ingredient_id,oi.id
  loop
    if v.return_qty<=0 or v.original_qty<=0 then continue; end if;
    v_restore:=round(v.sold_base_quantity*least(v.return_qty,v.original_qty)/v.original_qty,6);
    if v_restore<=0 then continue; end if;
    insert into public.ingredient_stock(branch_id,ingredient_id,quantity)
    values(v_branch,v.ingredient_id,0) on conflict(branch_id,ingredient_id) do nothing;
    select * into v_stock from public.ingredient_stock where branch_id=v_branch and ingredient_id=v.ingredient_id for update;
    v_new:=round(v_stock.quantity+v_restore,6);
    update public.ingredient_stock set quantity=v_new,updated_at=now() where id=v_stock.id;
    insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes)
    values(v_branch,v.ingredient_id,'return',v_restore,'return',v_return_id,'Recipe return snapshot restore');
    insert into public.food_return_consumption_snapshots(return_id,order_item_id,ingredient_id,restored_base_quantity,unit_cost_snapshot)
    values(v_return_id,v.order_item_id,v.ingredient_id,v_restore,round(v.unit_cost,6))
    on conflict(return_id,order_item_id,ingredient_id) do nothing;
  end loop;

  insert into public.food_return_consumption_postings(return_id,order_id,client_tx_id)
  values(v_return_id,p_order_id,v_key) on conflict do nothing;
  return v_return_id;
end;$$;

-- Net theoretical consumption after returns, for operational variance reports.
create or replace view public.food_theoretical_consumption_net_v1 as
with sales as (
  select o.branch_id,date(o.created_at) business_date,s.ingredient_id,
         sum(s.base_quantity)::numeric(18,6) qty,
         sum(s.total_cost)::numeric(18,4) cost
  from public.food_order_item_consumption_snapshots s
  join public.order_items oi on oi.id=s.order_item_id
  join public.orders o on o.id=oi.order_id
  group by o.branch_id,date(o.created_at),s.ingredient_id
), rets as (
  select o.branch_id,date(r.created_at) business_date,fr.ingredient_id,
         sum(fr.restored_base_quantity)::numeric(18,6) qty,
         sum(fr.restored_cost)::numeric(18,4) cost
  from public.food_return_consumption_snapshots fr
  join public.returns r on r.id=fr.return_id
  join public.orders o on o.id=r.order_id
  group by o.branch_id,date(r.created_at),fr.ingredient_id
), keys as (
  select branch_id,business_date,ingredient_id from sales
  union select branch_id,business_date,ingredient_id from rets
)
select k.branch_id,k.business_date,k.ingredient_id,
       (coalesce(s.qty,0)-coalesce(r.qty,0))::numeric(18,6) theoretical_base_quantity,
       (coalesce(s.cost,0)-coalesce(r.cost,0))::numeric(18,4) theoretical_cost
from keys k
left join sales s using(branch_id,business_date,ingredient_id)
left join rets r using(branch_id,business_date,ingredient_id);

grant select on public.food_theoretical_consumption_net_v1 to authenticated;

-- -----------------------------------------------------------------------------
-- 6) Function hardening / grants
-- -----------------------------------------------------------------------------
revoke all on function public.food_ingredient_save_v1(bigint,text,text,text,text,text,numeric,numeric,boolean,numeric,integer,boolean) from public;
revoke all on function public.food_ingredient_conversion_save_v1(bigint,text,text,numeric,boolean) from public;
revoke all on function public.food_ingredient_stock_adjust_v1(bigint,bigint,numeric,numeric,text,text) from public;
revoke all on function public.food_recipe_save_draft_v1(bigint,bigint,text,numeric,text,jsonb,jsonb,jsonb,text) from public;
revoke all on function public.food_recipe_activate_version_v1(bigint) from public;
revoke all on function public.create_food_pos_order_atomic_v1(jsonb,jsonb,jsonb) from public;
revoke all on function public.create_food_order_return_idempotent_v1(bigint,text,text,jsonb,jsonb,text) from public;

grant execute on function public.food_ingredient_save_v1(bigint,text,text,text,text,text,numeric,numeric,boolean,numeric,integer,boolean) to authenticated;
grant execute on function public.food_ingredient_conversion_save_v1(bigint,text,text,numeric,boolean) to authenticated;
grant execute on function public.food_ingredient_stock_adjust_v1(bigint,bigint,numeric,numeric,text,text) to authenticated;
grant execute on function public.food_recipe_save_draft_v1(bigint,bigint,text,numeric,text,jsonb,jsonb,jsonb,text) to authenticated;
grant execute on function public.food_recipe_activate_version_v1(bigint) to authenticated;
grant execute on function public.create_food_pos_order_atomic_v1(jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.create_food_order_return_idempotent_v1(bigint,text,text,jsonb,jsonb,text) to authenticated;

commit;
