-- Sharawla POS — Recipe Advanced V1 Runtime
-- Prep Item -> Production -> Yield -> Waste -> Food Cost
-- Additive Beta-first migration; no capability assignment is performed here.

begin;

alter table public.food_production_batches
  add column if not exists completion_client_tx_id text;
create unique index if not exists food_production_batches_completion_tx_uidx
  on public.food_production_batches(completion_client_tx_id)
  where completion_client_tx_id is not null;

-- -----------------------------------------------------------------------------
-- 1) Prep Item management
-- -----------------------------------------------------------------------------
create or replace function public.food_prep_item_save_v1(
  p_prep_item_id bigint,
  p_name text,
  p_output_ingredient_id bigint,
  p_base_unit_code text,
  p_default_batch_quantity numeric,
  p_shelf_life_minutes integer,
  p_notes text,
  p_active boolean
) returns bigint
language plpgsql security definer set search_path=public
as $$
declare v_id bigint; v_output bigint:=p_output_ingredient_id; v_name text:=nullif(trim(coalesce(p_name,'')),'');
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية إدارة التحضيرات'; end if;
  if v_name is null then raise exception 'اسم التحضير مطلوب'; end if;
  if not exists(select 1 from public.inventory_units where code=p_base_unit_code and active=true) then raise exception 'وحدة التحضير غير صالحة'; end if;
  if coalesce(p_default_batch_quantity,0)<=0 then raise exception 'كمية الباتش الافتراضية غير صحيحة'; end if;
  if p_shelf_life_minutes is not null and p_shelf_life_minutes<0 then raise exception 'مدة الصلاحية غير صحيحة'; end if;

  if v_output is null then
    insert into public.ingredients(name,unit,cost_per_unit,minimum_quantity,active,base_unit_code,purchase_unit_code,track_inventory,usable_yield_percent,shelf_life_minutes,updated_at)
    values(v_name||' — Prep Output',p_base_unit_code,0,0,true,p_base_unit_code,p_base_unit_code,true,100,p_shelf_life_minutes,now())
    returning id into v_output;
  else
    if not exists(select 1 from public.ingredients where id=v_output and active is distinct from false and (base_unit_code=p_base_unit_code or base_unit_code is null)) then
      raise exception 'خامة ناتج التحضير غير صالحة أو وحدتها مختلفة';
    end if;
    update public.ingredients set base_unit_code=coalesce(base_unit_code,p_base_unit_code),purchase_unit_code=coalesce(purchase_unit_code,p_base_unit_code),shelf_life_minutes=coalesce(p_shelf_life_minutes,shelf_life_minutes),updated_at=now() where id=v_output;
  end if;

  if p_prep_item_id is null then
    insert into public.food_prep_items(name,output_ingredient_id,base_unit_code,default_batch_quantity,shelf_life_minutes,active,notes)
    values(v_name,v_output,p_base_unit_code,round(p_default_batch_quantity,6),p_shelf_life_minutes,coalesce(p_active,true),nullif(trim(coalesce(p_notes,'')),''))
    returning id into v_id;
  else
    if not exists(select 1 from public.food_prep_items where id=p_prep_item_id) then raise exception 'Prep Item غير موجود'; end if;
    update public.food_prep_items set name=v_name,output_ingredient_id=v_output,base_unit_code=p_base_unit_code,default_batch_quantity=round(p_default_batch_quantity,6),shelf_life_minutes=p_shelf_life_minutes,active=coalesce(p_active,true),notes=nullif(trim(coalesce(p_notes,'')),''),updated_at=now() where id=p_prep_item_id returning id into v_id;
  end if;
  return v_id;
end;$$;

-- -----------------------------------------------------------------------------
-- 2) Versioned Prep recipe
-- -----------------------------------------------------------------------------
create or replace function public.food_prep_recipe_save_draft_v1(
  p_prep_item_id bigint,p_output_quantity numeric,p_output_unit_code text,p_lines jsonb,p_notes text
) returns bigint
language plpgsql security definer set search_path=public
as $$
declare v_recipe_id bigint; v_version_id bigint; v_version_no integer; v_emp bigint; v record; v_factor numeric; v_unit text;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية إدارة وصفات التحضير'; end if;
  select base_unit_code into v_unit from public.food_prep_items where id=p_prep_item_id and active=true;
  if v_unit is null then raise exception 'Prep Item غير موجود أو موقوف'; end if;
  if p_output_unit_code<>v_unit then raise exception 'وحدة ناتج الوصفة يجب أن تطابق وحدة Prep Item'; end if;
  if coalesce(p_output_quantity,0)<=0 then raise exception 'كمية الناتج غير صحيحة'; end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then raise exception 'وصفة التحضير تحتاج خامة واحدة على الأقل'; end if;

  select id into v_recipe_id from public.food_recipe_headers where prep_item_id=p_prep_item_id and recipe_kind='prep' and active=true order by id limit 1;
  if v_recipe_id is null then
    insert into public.food_recipe_headers(product_id,variant_id,prep_item_id,name,recipe_kind,active)
    values(null,null,p_prep_item_id,(select name from public.food_prep_items where id=p_prep_item_id),'prep',true) returning id into v_recipe_id;
  end if;
  select coalesce(max(version_no),0)+1 into v_version_no from public.food_recipe_versions where recipe_id=v_recipe_id;
  v_emp:=public.current_employee_id();
  insert into public.food_recipe_versions(recipe_id,version_no,status,output_quantity,output_unit_code,notes,created_by_employee_id)
  values(v_recipe_id,v_version_no,'draft',round(p_output_quantity,6),p_output_unit_code,nullif(trim(coalesce(p_notes,'')),''),v_emp)
  returning id into v_version_id;

  for v in select * from jsonb_to_recordset(p_lines) as x(ingredient_id bigint,quantity numeric,unit_code text,sort_order integer,notes text)
  loop
    if coalesce(v.quantity,0)<=0 then raise exception 'كمية خامة غير صحيحة'; end if;
    select public.ingredient_unit_factor_v1(v.ingredient_id,v.unit_code,i.base_unit_code) into v_factor from public.ingredients i where i.id=v.ingredient_id and i.active is distinct from false;
    if v_factor is null or v_factor<=0 then raise exception 'تحويل وحدة خامة التحضير غير صالح'; end if;
    insert into public.food_recipe_lines(recipe_version_id,ingredient_id,quantity,unit_code,conversion_factor_to_base,sort_order,notes)
    values(v_version_id,v.ingredient_id,round(v.quantity,6),v.unit_code,round(v_factor,6),coalesce(v.sort_order,0),nullif(trim(coalesce(v.notes,'')),''));
  end loop;
  return v_version_id;
end;$$;

-- -----------------------------------------------------------------------------
-- 3) Production batch start
-- -----------------------------------------------------------------------------
create or replace function public.food_production_batch_start_v1(
  p_branch_id bigint,p_prep_item_id bigint,p_planned_output_quantity numeric,p_batch_number text,p_notes text,p_client_tx_id text
) returns bigint
language plpgsql security definer set search_path=public
as $$
declare v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),''); v_id bigint; v_emp bigint; v_version bigint; v_output numeric; v_unit text;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية الإنتاج'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  if coalesce(p_planned_output_quantity,0)<=0 then raise exception 'كمية الإنتاج المخططة غير صحيحة'; end if;

  perform pg_advisory_xact_lock(hashtextextended('food-production-start:'||v_key,0));
  select id into v_id from public.food_production_batches where client_tx_id=v_key;
  if v_id is not null then return v_id; end if;

  select rv.id,rv.output_quantity,pi.base_unit_code into v_version,v_output,v_unit
  from public.food_prep_items pi
  join public.food_recipe_headers h on h.prep_item_id=pi.id and h.recipe_kind='prep' and h.active=true
  join public.food_recipe_versions rv on rv.recipe_id=h.id and rv.status='active'
  where pi.id=p_prep_item_id and pi.active=true
    and (rv.effective_from is null or rv.effective_from<=now())
    and (rv.effective_to is null or rv.effective_to>now())
  order by rv.version_no desc limit 1;
  if v_version is null then raise exception 'لا توجد Recipe فعالة لهذا Prep Item'; end if;

  v_emp:=public.current_employee_id();
  insert into public.food_production_batches(branch_id,prep_item_id,recipe_version_id,batch_number,status,planned_output_quantity,output_unit_code,client_tx_id,started_by_employee_id,started_at,notes)
  values(p_branch_id,p_prep_item_id,v_version,nullif(trim(coalesce(p_batch_number,'')),''),'in_progress',round(p_planned_output_quantity,6),v_unit,v_key,v_emp,now(),nullif(trim(coalesce(p_notes,'')),''))
  returning id into v_id;

  insert into public.food_production_consumptions(production_batch_id,ingredient_id,planned_base_quantity,actual_base_quantity,unit_cost_snapshot)
  select v_id,l.ingredient_id,round(l.base_quantity*p_planned_output_quantity/greatest(v_output,0.000001),6),0,0
  from public.food_recipe_lines l where l.recipe_version_id=v_version;
  return v_id;
end;$$;

-- -----------------------------------------------------------------------------
-- 4) Production completion: consume actual inputs + add output with actual cost
-- -----------------------------------------------------------------------------
create or replace function public.food_production_batch_complete_v1(
  p_production_batch_id bigint,p_actual_output_quantity numeric,p_consumptions jsonb,p_client_tx_id text,p_notes text
) returns bigint
language plpgsql security definer set search_path=public
as $$
declare
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),''); v_batch public.food_production_batches%rowtype;
  v_prep public.food_prep_items%rowtype; v record; v_stock public.ingredient_stock%rowtype;
  v_actual numeric(18,6); v_new numeric(18,6); v_unit_cost numeric(18,6); v_total_cost numeric(18,6):=0;
  v_output_cost numeric(18,6); v_emp bigint; v_output_stock public.ingredient_stock%rowtype;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية إكمال الإنتاج'; end if;
  if v_key is null then raise exception 'معرف حركة الإكمال مطلوب'; end if;
  if coalesce(p_actual_output_quantity,0)<=0 then raise exception 'الناتج الفعلي يجب أن يكون أكبر من صفر'; end if;

  perform pg_advisory_xact_lock(hashtextextended('food-production-complete:'||v_key,0));
  select * into v_batch from public.food_production_batches where id=p_production_batch_id for update;
  if not found then raise exception 'Batch غير موجود'; end if;
  if not public.has_branch_access(v_batch.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_batch.status='completed' then
    if v_batch.completion_client_tx_id=v_key then return v_batch.id; end if;
    raise exception 'Batch مكتمل بالفعل';
  end if;
  if v_batch.status<>'in_progress' then raise exception 'Batch غير جاهز للإكمال'; end if;

  select * into v_prep from public.food_prep_items where id=v_batch.prep_item_id;
  if not found then raise exception 'Prep Item غير موجود'; end if;
  v_emp:=public.current_employee_id();

  -- Update actual quantities from payload where supplied; otherwise planned quantity is used.
  update public.food_production_consumptions pc
  set actual_base_quantity=coalesce((select round((x->>'actual_base_quantity')::numeric,6) from jsonb_array_elements(coalesce(p_consumptions,'[]'::jsonb)) x where nullif(x->>'ingredient_id','')::bigint=pc.ingredient_id limit 1),pc.planned_base_quantity)
  where pc.production_batch_id=v_batch.id;

  for v in
    select pc.*,i.track_inventory,coalesce(i.cost_per_unit,0)::numeric(18,6) fallback_cost
    from public.food_production_consumptions pc
    join public.ingredients i on i.id=pc.ingredient_id and i.active is distinct from false
    where pc.production_batch_id=v_batch.id
    order by pc.ingredient_id
  loop
    v_actual:=round(coalesce(v.actual_base_quantity,0),6);
    if v_actual<0 then raise exception 'استهلاك فعلي غير صحيح'; end if;
    if v_actual=0 then continue; end if;
    insert into public.ingredient_stock(branch_id,ingredient_id,quantity)
    values(v_batch.branch_id,v.ingredient_id,0) on conflict(branch_id,ingredient_id) do nothing;
    select * into v_stock from public.ingredient_stock where branch_id=v_batch.branch_id and ingredient_id=v.ingredient_id for update;
    v_unit_cost:=coalesce(nullif(v_stock.average_unit_cost,0),v.fallback_cost,0);
    if v.track_inventory and v_stock.quantity<v_actual then raise exception 'مخزون الخامة % غير كافٍ للإنتاج',v.ingredient_id; end if;
    v_new:=round(v_stock.quantity-v_actual,6);
    update public.ingredient_stock set quantity=v_new,updated_at=now() where id=v_stock.id;
    update public.food_production_consumptions set unit_cost_snapshot=v_unit_cost where id=v.id;
    insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes)
    values(v_batch.branch_id,v.ingredient_id,'production_consume',-v_actual,'production_batch',v_batch.id,'Production input');
    v_total_cost:=v_total_cost+(v_actual*v_unit_cost);
  end loop;

  v_output_cost:=round(v_total_cost/greatest(p_actual_output_quantity,0.000001),6);
  insert into public.ingredient_stock(branch_id,ingredient_id,quantity)
  values(v_batch.branch_id,v_prep.output_ingredient_id,0) on conflict(branch_id,ingredient_id) do nothing;
  select * into v_output_stock from public.ingredient_stock where branch_id=v_batch.branch_id and ingredient_id=v_prep.output_ingredient_id for update;
  v_new:=round(v_output_stock.quantity+p_actual_output_quantity,6);
  update public.ingredient_stock
  set quantity=v_new,
      average_unit_cost=case when v_new<=0 then v_output_cost else round(((v_output_stock.quantity*v_output_stock.average_unit_cost)+(p_actual_output_quantity*v_output_cost))/v_new,6) end,
      last_purchase_cost=v_output_cost,last_costed_at=now(),updated_at=now()
  where id=v_output_stock.id;
  insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes)
  values(v_batch.branch_id,v_prep.output_ingredient_id,'production_output',round(p_actual_output_quantity,6),'production_batch',v_batch.id,'Prep output');

  update public.food_production_batches
  set status='completed',actual_output_quantity=round(p_actual_output_quantity,6),completed_by_employee_id=v_emp,completed_at=now(),completion_client_tx_id=v_key,notes=coalesce(nullif(trim(coalesce(p_notes,'')),''),notes),updated_at=now()
  where id=v_batch.id;
  return v_batch.id;
end;$$;

-- -----------------------------------------------------------------------------
-- 5) Posted waste: atomic stock deduction with cost snapshot
-- -----------------------------------------------------------------------------
create or replace function public.food_waste_post_v1(
  p_branch_id bigint,p_ingredient_id bigint,p_prep_item_id bigint,p_shift_id bigint,p_reason_code text,
  p_quantity numeric,p_unit_code text,p_notes text,p_client_tx_id text
) returns bigint
language plpgsql security definer set search_path=public
as $$
declare
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),''); v_id bigint; v_factor numeric; v_base numeric(18,6);
  v_stock public.ingredient_stock%rowtype; v_new numeric(18,6); v_cost numeric(18,6); v_emp bigint; v_track boolean; v_base_unit text;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية تسجيل الهالك'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  if coalesce(p_quantity,0)<=0 then raise exception 'كمية الهالك غير صحيحة'; end if;
  if not exists(select 1 from public.food_waste_reasons where code=p_reason_code and active=true) then raise exception 'سبب الهالك غير صالح'; end if;
  select base_unit_code,track_inventory into v_base_unit,v_track from public.ingredients where id=p_ingredient_id and active is distinct from false;
  if v_base_unit is null then raise exception 'الخامة غير مجهزة بوحدة أساسية'; end if;
  v_factor:=public.ingredient_unit_factor_v1(p_ingredient_id,p_unit_code,v_base_unit);
  if v_factor is null or v_factor<=0 then raise exception 'لا يوجد تحويل وحدة صالح للهالك'; end if;
  v_base:=round(p_quantity*v_factor,6);
  if p_prep_item_id is not null and not exists(select 1 from public.food_prep_items where id=p_prep_item_id and output_ingredient_id=p_ingredient_id) then raise exception 'Prep Item لا يطابق خامة الناتج'; end if;

  perform pg_advisory_xact_lock(hashtextextended('food-waste:'||v_key,0));
  select id into v_id from public.food_waste_events where client_tx_id=v_key;
  if v_id is not null then return v_id; end if;
  insert into public.ingredient_stock(branch_id,ingredient_id,quantity)
  values(p_branch_id,p_ingredient_id,0) on conflict(branch_id,ingredient_id) do nothing;
  select * into v_stock from public.ingredient_stock where branch_id=p_branch_id and ingredient_id=p_ingredient_id for update;
  if v_track and v_stock.quantity<v_base then raise exception 'مخزون الخامة غير كافٍ للهالك'; end if;
  v_cost:=coalesce(nullif(v_stock.average_unit_cost,0),(select coalesce(cost_per_unit,0) from public.ingredients where id=p_ingredient_id),0);
  v_new:=round(v_stock.quantity-v_base,6);
  update public.ingredient_stock set quantity=v_new,updated_at=now() where id=v_stock.id;
  v_emp:=public.current_employee_id();
  insert into public.food_waste_events(branch_id,ingredient_id,prep_item_id,shift_id,reason_code,quantity,unit_code,conversion_factor_to_base,unit_cost_snapshot,status,client_tx_id,notes,employee_id)
  values(p_branch_id,p_ingredient_id,p_prep_item_id,p_shift_id,p_reason_code,round(p_quantity,6),p_unit_code,round(v_factor,6),round(v_cost,6),'posted',v_key,nullif(trim(coalesce(p_notes,'')),''),v_emp)
  returning id into v_id;
  insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes)
  values(p_branch_id,p_ingredient_id,'waste',-v_base,'waste',v_id,p_reason_code||coalesce(' — '||nullif(trim(coalesce(p_notes,'')),''),''));
  return v_id;
end;$$;

-- -----------------------------------------------------------------------------
-- 6) Food Cost / menu engineering read model
-- -----------------------------------------------------------------------------
create or replace view public.food_menu_costing_v1 as
select
  c.branch_id,c.product_id,c.variant_id,c.recipe_version_id,c.recipe_cost,
  p.name product_name,
  coalesce(v.name,'') variant_name,
  coalesce(v.price,p.price,0)::numeric(14,2) selling_price,
  (coalesce(v.price,p.price,0)-c.recipe_cost)::numeric(18,4) gross_margin,
  case when coalesce(v.price,p.price,0)>0 then round((c.recipe_cost/coalesce(v.price,p.price,0))*100,2) else null end food_cost_percent
from public.food_recipe_branch_cost_v1 c
join public.products p on p.id=c.product_id
left join public.product_variants v on v.id=c.variant_id
where c.product_id is not null;

grant select on public.food_menu_costing_v1 to authenticated;

-- -----------------------------------------------------------------------------
-- 7) Hardening / grants
-- -----------------------------------------------------------------------------
revoke all on function public.food_prep_item_save_v1(bigint,text,bigint,text,numeric,integer,text,boolean) from public;
revoke all on function public.food_prep_recipe_save_draft_v1(bigint,numeric,text,jsonb,text) from public;
revoke all on function public.food_production_batch_start_v1(bigint,bigint,numeric,text,text,text) from public;
revoke all on function public.food_production_batch_complete_v1(bigint,numeric,jsonb,text,text) from public;
revoke all on function public.food_waste_post_v1(bigint,bigint,bigint,bigint,text,numeric,text,text,text) from public;

grant execute on function public.food_prep_item_save_v1(bigint,text,bigint,text,numeric,integer,text,boolean) to authenticated;
grant execute on function public.food_prep_recipe_save_draft_v1(bigint,numeric,text,jsonb,text) to authenticated;
grant execute on function public.food_production_batch_start_v1(bigint,bigint,numeric,text,text,text) to authenticated;
grant execute on function public.food_production_batch_complete_v1(bigint,numeric,jsonb,text,text) to authenticated;
grant execute on function public.food_waste_post_v1(bigint,bigint,bigint,bigint,text,numeric,text,text,text) to authenticated;

commit;
