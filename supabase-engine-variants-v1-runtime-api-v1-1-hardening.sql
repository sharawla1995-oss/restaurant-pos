-- Sharawla POS — Variants Engine V1 Runtime API v1.1 hardening
-- Prevents duplicate matrix combinations for the same parent product.

begin;

alter table public.product_variants
  add column if not exists matrix_signature text;

create unique index if not exists product_variants_matrix_signature_uidx
  on public.product_variants(product_id,matrix_signature)
  where is_stock_unit=true and matrix_signature is not null;

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
  v_signature text;
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

  select count(*),count(distinct x.axis_id)
    into v_count,v_distinct
  from jsonb_to_recordset(coalesce(p_selections,'[]'::jsonb)) as x(axis_id bigint,axis_value_id bigint);

  if v_count=0 then raise exception 'اختر قيمة Variant واحدة على الأقل'; end if;
  if v_count<>v_distinct then raise exception 'لا يمكن اختيار أكثر من قيمة لنفس الخاصية'; end if;

  select count(*) into v_valid
  from jsonb_to_recordset(p_selections) as x(axis_id bigint,axis_value_id bigint)
  join public.product_variant_axes a
    on a.id=x.axis_id and a.product_id=p_product_id and a.active=true
  join public.product_variant_axis_values av
    on av.id=x.axis_value_id and av.axis_id=a.id and av.active=true;

  if v_valid<>v_count then raise exception 'أحد اختيارات Variant غير صالح لهذا الصنف'; end if;

  select string_agg(x.axis_id::text||'='||x.axis_value_id::text,'|' order by x.axis_id)
    into v_signature
  from jsonb_to_recordset(p_selections) as x(axis_id bigint,axis_value_id bigint);

  if v_signature is null then raise exception 'تعذر تكوين بصمة التركيبة'; end if;

  if exists(
    select 1 from public.product_variants pv
    where pv.product_id=p_product_id
      and pv.is_stock_unit=true
      and pv.matrix_signature=v_signature
      and (p_variant_id is null or pv.id<>p_variant_id)
  ) then
    raise exception 'هذه التركيبة موجودة بالفعل لهذا الصنف';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('retail-variant-product:'||p_product_id::text,0));

  if p_variant_id is null then
    insert into public.product_variants(
      product_id,name,price,sort_order,active,sku,barcode,cost,is_stock_unit,matrix_signature,metadata
    ) values(
      p_product_id,v_name,round(coalesce(p_price,0),2),0,coalesce(p_active,true),
      v_sku,v_barcode,round(coalesce(p_cost,0),4),true,v_signature,'{}'::jsonb
    ) returning id into v_id;
  else
    select is_stock_unit into v_existing_stock_unit
    from public.product_variants
    where id=p_variant_id and product_id=p_product_id
    for update;

    if not found then raise exception 'Variant غير موجود لهذا الصنف'; end if;
    if coalesce(v_existing_stock_unit,false)<>true then
      raise exception 'لا يمكن تحويل Restaurant Legacy Variant إلى Stock Unit تلقائيًا';
    end if;

    update public.product_variants
    set name=v_name,
        price=round(coalesce(p_price,0),2),
        active=coalesce(p_active,true),
        sku=v_sku,
        barcode=v_barcode,
        cost=round(coalesce(p_cost,0),4),
        matrix_signature=v_signature,
        updated_at=now()
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

revoke all on function public.retail_variant_combination_save_v1(bigint,bigint,text,text,text,numeric,numeric,boolean,jsonb) from public;
grant execute on function public.retail_variant_combination_save_v1(bigint,bigint,text,text,text,numeric,numeric,boolean,jsonb) to authenticated;

comment on column public.product_variants.matrix_signature is
  'Normalized axis=value signature for true stock-unit variants. Unique per parent product.';

commit;
