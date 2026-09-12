-- Sharawla POS — Variants Engine V1 Runtime API
-- Applies only after supabase-engine-variants-v1-foundation.sql.
-- Secure CRUD for axes, values and stock-unit combinations.
-- Checkout/returns are intentionally NOT changed by this migration.

begin;

-- -----------------------------------------------------------------------------
-- 1) Save a product-scoped axis (Size / Color / Shade / Capacity ...)
-- -----------------------------------------------------------------------------
create or replace function public.retail_variant_axis_save_v1(
  p_product_id bigint,
  p_axis_id bigint,
  p_code text,
  p_name text,
  p_sort_order integer,
  p_active boolean
) returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id bigint;
  v_code text:=lower(trim(coalesce(p_code,'')));
  v_name text:=trim(coalesce(p_name,''));
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('products') or public.has_permission('inventory')) then
    raise exception 'ليس لديك صلاحية إدارة Variants';
  end if;
  if not exists(select 1 from public.products where id=p_product_id and active is distinct from false) then
    raise exception 'الصنف غير موجود أو موقوف';
  end if;
  if v_code='' or v_name='' then raise exception 'كود واسم الخاصية مطلوبان'; end if;

  if p_axis_id is null then
    insert into public.product_variant_axes(product_id,code,name,sort_order,active)
    values(p_product_id,v_code,v_name,coalesce(p_sort_order,0),coalesce(p_active,true))
    returning id into v_id;
  else
    update public.product_variant_axes
    set code=v_code,name=v_name,sort_order=coalesce(p_sort_order,0),active=coalesce(p_active,true),updated_at=now()
    where id=p_axis_id and product_id=p_product_id
    returning id into v_id;
    if v_id is null then raise exception 'خاصية Variant غير موجودة لهذا الصنف'; end if;
  end if;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2) Save an axis value
-- -----------------------------------------------------------------------------
create or replace function public.retail_variant_axis_value_save_v1(
  p_axis_id bigint,
  p_value_id bigint,
  p_code text,
  p_value text,
  p_sort_order integer,
  p_active boolean,
  p_metadata jsonb
) returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id bigint;
  v_code text:=lower(trim(coalesce(p_code,'')));
  v_value text:=trim(coalesce(p_value,''));
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('products') or public.has_permission('inventory')) then
    raise exception 'ليس لديك صلاحية إدارة Variants';
  end if;
  if not exists(select 1 from public.product_variant_axes where id=p_axis_id) then
    raise exception 'خاصية Variant غير موجودة';
  end if;
  if v_code='' or v_value='' then raise exception 'كود وقيمة الاختيار مطلوبان'; end if;

  if p_value_id is null then
    insert into public.product_variant_axis_values(axis_id,code,value,sort_order,active,metadata)
    values(p_axis_id,v_code,v_value,coalesce(p_sort_order,0),coalesce(p_active,true),coalesce(p_metadata,'{}'::jsonb))
    returning id into v_id;
  else
    update public.product_variant_axis_values
    set code=v_code,value=v_value,sort_order=coalesce(p_sort_order,0),active=coalesce(p_active,true),metadata=coalesce(p_metadata,'{}'::jsonb),updated_at=now()
    where id=p_value_id and axis_id=p_axis_id
    returning id into v_id;
    if v_id is null then raise exception 'قيمة Variant غير موجودة لهذه الخاصية'; end if;
  end if;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) Save a true stock-unit combination
--    p_selections = [{"axis_id":1,"axis_value_id":10}, ...]
-- -----------------------------------------------------------------------------
create or replace function public.retail_variant_combination_save_v1(
  p_product_id bigint,
  p_variant_id bigint,
  p_name text,
  p_sku text,
  p_barcode text,
  p_price numeric,
  p_cost numeric,
  p_active boolean,
  p_selections jsonb
) returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id bigint;
  v_name text:=trim(coalesce(p_name,''));
  v_sku text:=nullif(trim(coalesce(p_sku,'')),'');
  v_barcode text:=nullif(trim(coalesce(p_barcode,'')),'');
  v_count integer;
  v_distinct integer;
  v_valid integer;
  v_existing_stock_unit boolean;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('products') or public.has_permission('inventory')) then
    raise exception 'ليس لديك صلاحية إدارة Variants';
  end if;
  if not exists(select 1 from public.products where id=p_product_id and active is distinct from false) then
    raise exception 'الصنف غير موجود أو موقوف';
  end if;
  if v_name='' then raise exception 'اسم التركيبة مطلوب'; end if;
  if coalesce(p_price,0)<0 or coalesce(p_cost,0)<0 then raise exception 'السعر أو التكلفة غير صحيحة'; end if;
  if jsonb_typeof(coalesce(p_selections,'[]'::jsonb))<>'array' then raise exception 'اختيارات التركيبة غير صحيحة'; end if;

  select count(*),count(distinct (x.axis_id)) into v_count,v_distinct
  from jsonb_to_recordset(coalesce(p_selections,'[]'::jsonb)) as x(axis_id bigint,axis_value_id bigint);
  if v_count=0 then raise exception 'اختر قيمة Variant واحدة على الأقل'; end if;
  if v_count<>v_distinct then raise exception 'لا يمكن اختيار أكثر من قيمة لنفس الخاصية'; end if;

  select count(*) into v_valid
  from jsonb_to_recordset(p_selections) as x(axis_id bigint,axis_value_id bigint)
  join public.product_variant_axes a on a.id=x.axis_id and a.product_id=p_product_id and a.active=true
  join public.product_variant_axis_values av on av.id=x.axis_value_id and av.axis_id=a.id and av.active=true;
  if v_valid<>v_count then raise exception 'أحد اختيارات Variant غير صالح لهذا الصنف'; end if;

  perform pg_advisory_xact_lock(hashtextextended('retail-variant-product:'||p_product_id::text,0));

  if p_variant_id is null then
    insert into public.product_variants(product_id,name,price,sort_order,active,sku,barcode,cost,is_stock_unit,metadata)
    values(p_product_id,v_name,round(coalesce(p_price,0),2),0,coalesce(p_active,true),v_sku,v_barcode,round(coalesce(p_cost,0),4),true,'{}'::jsonb)
    returning id into v_id;
  else
    select is_stock_unit into v_existing_stock_unit
    from public.product_variants where id=p_variant_id and product_id=p_product_id for update;
    if not found then raise exception 'Variant غير موجود لهذا الصنف'; end if;
    if coalesce(v_existing_stock_unit,false)<>true then
      raise exception 'لا يمكن تحويل Restaurant Legacy Variant إلى Stock Unit تلقائيًا';
    end if;
    update public.product_variants
    set name=v_name,price=round(coalesce(p_price,0),2),active=coalesce(p_active,true),sku=v_sku,barcode=v_barcode,
        cost=round(coalesce(p_cost,0),4),updated_at=now()
    where id=p_variant_id
    returning id into v_id;
    delete from public.product_variant_selections where variant_id=v_id;
  end if;

  insert into public.product_variant_selections(variant_id,axis_id,axis_value_id)
  select v_id,x.axis_id,x.axis_value_id
  from jsonb_to_recordset(p_selections) as x(axis_id bigint,axis_value_id bigint);

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Read one full product matrix as JSON
-- -----------------------------------------------------------------------------
create or replace function public.retail_variant_matrix_get_v1(p_product_id bigint)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not exists(select 1 from public.products where id=p_product_id) then raise exception 'الصنف غير موجود'; end if;

  select jsonb_build_object(
    'product_id',p_product_id,
    'axes',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'code',a.code,'name',a.name,'sort_order',a.sort_order,'active',a.active,
        'values',coalesce((select jsonb_agg(jsonb_build_object(
          'id',av.id,'code',av.code,'value',av.value,'sort_order',av.sort_order,'active',av.active,'metadata',av.metadata
        ) order by av.sort_order,av.id) from public.product_variant_axis_values av where av.axis_id=a.id),'[]'::jsonb)
      ) order by a.sort_order,a.id)
      from public.product_variant_axes a where a.product_id=p_product_id
    ),'[]'::jsonb),
    'variants',coalesce((
      select jsonb_agg(jsonb_build_object(
        'variant_id',m.variant_id,'name',m.variant_name,'sku',m.sku,'barcode',m.barcode,
        'price',m.price,'cost',m.effective_cost,'active',m.active,'is_stock_unit',m.is_stock_unit,
        'selections',m.selections
      ) order by m.sort_order,m.variant_id)
      from public.product_variant_matrix_v1 m
      where m.product_id=p_product_id and m.is_stock_unit=true
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) Exact SKU/barcode resolver with branch stock
-- -----------------------------------------------------------------------------
create or replace function public.retail_variant_lookup_v1(
  p_branch_id bigint,
  p_lookup text
) returns table(
  variant_id bigint,
  product_id bigint,
  product_name text,
  variant_name text,
  sku text,
  barcode text,
  price numeric,
  cost numeric,
  quantity numeric,
  track_inventory boolean
)
language plpgsql
security definer
set search_path=public
as $$
declare v_lookup text:=trim(coalesce(p_lookup,''));
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_lookup='' then return; end if;

  return query
  select pv.id,pv.product_id,p.name,pv.name,pv.sku,pv.barcode,pv.price,
         coalesce(pv.cost,p.cost,0),coalesce(b.quantity,0),coalesce(b.track_inventory,true)
  from public.product_variants pv
  join public.products p on p.id=pv.product_id
  left join public.retail_variant_inventory_balances b on b.branch_id=p_branch_id and b.variant_id=pv.id
  where pv.is_stock_unit=true and pv.active=true and p.active is distinct from false
    and (pv.barcode=v_lookup or lower(coalesce(pv.sku,''))=lower(v_lookup))
  order by case when pv.barcode=v_lookup then 0 else 1 end,pv.id
  limit 1;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) Explicit deactivate; never delete historical variant identity
-- -----------------------------------------------------------------------------
create or replace function public.retail_variant_combination_set_active_v1(
  p_variant_id bigint,
  p_active boolean
) returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare v_id bigint;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('products') or public.has_permission('inventory')) then
    raise exception 'ليس لديك صلاحية إدارة Variants';
  end if;
  update public.product_variants
  set active=coalesce(p_active,false),updated_at=now()
  where id=p_variant_id and is_stock_unit=true
  returning id into v_id;
  if v_id is null then raise exception 'Stock Variant غير موجود'; end if;
  return v_id;
end;
$$;

revoke all on function public.retail_variant_axis_save_v1(bigint,bigint,text,text,integer,boolean) from public;
revoke all on function public.retail_variant_axis_value_save_v1(bigint,bigint,text,text,integer,boolean,jsonb) from public;
revoke all on function public.retail_variant_combination_save_v1(bigint,bigint,text,text,text,numeric,numeric,boolean,jsonb) from public;
revoke all on function public.retail_variant_matrix_get_v1(bigint) from public;
revoke all on function public.retail_variant_lookup_v1(bigint,text) from public;
revoke all on function public.retail_variant_combination_set_active_v1(bigint,boolean) from public;

grant execute on function public.retail_variant_axis_save_v1(bigint,bigint,text,text,integer,boolean) to authenticated;
grant execute on function public.retail_variant_axis_value_save_v1(bigint,bigint,text,text,integer,boolean,jsonb) to authenticated;
grant execute on function public.retail_variant_combination_save_v1(bigint,bigint,text,text,text,numeric,numeric,boolean,jsonb) to authenticated;
grant execute on function public.retail_variant_matrix_get_v1(bigint) to authenticated;
grant execute on function public.retail_variant_lookup_v1(bigint,text) to authenticated;
grant execute on function public.retail_variant_combination_set_active_v1(bigint,boolean) to authenticated;

comment on function public.retail_variant_combination_save_v1(bigint,bigint,text,text,text,numeric,numeric,boolean,jsonb) is
  'Creates/updates only true stock-unit variants. Legacy Restaurant variants are never converted automatically.';
comment on function public.retail_variant_lookup_v1(bigint,text) is
  'Exact retail stock-unit resolver by barcode/SKU with branch quantity. Checkout integration remains a separate gate.';

commit;
