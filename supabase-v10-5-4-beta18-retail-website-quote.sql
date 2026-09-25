-- Sharawla POS V10.5.4-beta.18 candidate
-- Public Retail website quote. BETA ONLY.
-- Read-only preview; final create RPC always revalidates and locks stock.

begin;

create or replace function public.retail_website_quote(
  p_branch_id bigint,
  p_order_type text,
  p_delivery_zone_id bigint,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
stable
as $$
declare
  v_type text:=lower(coalesce(nullif(trim(p_order_type),''),'pickup'));
  v_row record;
  v_product public.products%rowtype;
  v_ps public.retail_product_settings%rowtype;
  v_bp public.branch_products%rowtype;
  v_bal numeric(14,3);
  v_reserved numeric(14,3);
  v_available numeric(14,3);
  v_qty numeric(14,3);
  v_price numeric(14,4);
  v_line numeric(14,2);
  v_offer numeric(14,2);
  v_subtotal numeric(14,2):=0;
  v_discount numeric(14,2):=0;
  v_delivery numeric(14,2):=0;
  v_items jsonb:='[]'::jsonb;
begin
  if v_type not in('pickup','delivery') then raise exception 'نوع الطلب غير صالح'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'السلة فارغة'; end if;
  if jsonb_array_length(p_items)>100 then raise exception 'عدد الأصناف أكبر من الحد المسموح'; end if;
  if not public.retail_website_branch_open(p_branch_id) then raise exception 'الفرع غير متاح لاستقبال الطلبات الآن'; end if;

  if v_type='delivery' then
    if p_delivery_zone_id is null then raise exception 'منطقة التوصيل مطلوبة'; end if;
    select round(greatest(coalesce(z.delivery_fee,0),0),2)
      into v_delivery
    from public.delivery_zones z
    where z.id=p_delivery_zone_id and z.branch_id=p_branch_id and z.active=true;
    if not found then raise exception 'منطقة التوصيل غير متاحة لهذا الفرع'; end if;
  end if;

  for v_row in
    select x.product_id,sum(x.quantity)::numeric as quantity
    from jsonb_to_recordset(p_items) as x(product_id bigint,quantity numeric)
    group by x.product_id
    order by x.product_id
  loop
    select * into v_product from public.products where id=v_row.product_id and active=true and coalesce(website_visible,true)=true;
    if not found then raise exception 'أحد الأصناف غير متاح على الموقع'; end if;

    select * into v_bp from public.branch_products
      where branch_id=p_branch_id and product_id=v_product.id and active=true
        and coalesce(website_paused_until,'-infinity'::timestamptz)<=now();
    if not found then raise exception 'الصنف % غير متاح في هذا الفرع',v_product.name; end if;

    select * into v_ps from public.retail_product_settings where product_id=v_product.id;
    if found and coalesce(v_ps.online_enabled,true)=false then raise exception 'الصنف % غير متاح أونلاين',v_product.name; end if;

    v_qty:=round(coalesce(v_row.quantity,0),3);
    if v_qty<=0 then raise exception 'كمية غير صالحة للصنف %',v_product.name; end if;
    if v_qty<coalesce(v_ps.min_qty,1) then raise exception 'الكمية أقل من الحد الأدنى للصنف %',v_product.name; end if;
    if coalesce(v_ps.allow_decimal,false)=false and v_qty<>trunc(v_qty) then raise exception 'الصنف % لا يقبل كمية عشرية',v_product.name; end if;
    if coalesce(v_ps.qty_step,1)>0 and abs((v_qty/coalesce(v_ps.qty_step,1))-round(v_qty/coalesce(v_ps.qty_step,1)))>0.0001 then
      raise exception 'كمية الصنف % لا تطابق خطوة البيع',v_product.name;
    end if;

    select coalesce(quantity,0) into v_bal from public.retail_inventory_balances where branch_id=p_branch_id and product_id=v_product.id;
    select coalesce(sum(quantity),0) into v_reserved from public.retail_stock_reservations
      where branch_id=p_branch_id and product_id=v_product.id and status='active' and expires_at>now();
    v_available:=greatest(0,coalesce(v_bal,0)-coalesce(v_reserved,0));
    if v_qty>v_available then raise exception 'الكمية المطلوبة من % أكبر من المتاح',v_product.name; end if;

    v_price:=coalesce(v_bp.price_override,v_product.price,0);
    v_line:=round(v_price*v_qty,2);
    v_offer:=public.retail_website_offer_discount(p_branch_id,v_product.id,v_qty,v_price);
    v_subtotal:=v_subtotal+v_line;
    v_discount:=v_discount+v_offer;
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'product_id',v_product.id,'product_name',v_product.name,'quantity',v_qty,
      'unit_price',v_price,'line_subtotal',v_line,'offer_discount',v_offer,
      'line_total',round(greatest(0,v_line-v_offer),2),'available_qty',v_available
    ));
  end loop;

  v_discount:=round(least(v_subtotal,greatest(0,v_discount)),2);
  return jsonb_build_object(
    'ok',true,
    'items',v_items,
    'subtotal',round(v_subtotal,2),
    'offer_discount',v_discount,
    'delivery_fee',v_delivery,
    'total',round(greatest(0,v_subtotal-v_discount+v_delivery),2)
  );
end $$;
revoke all on function public.retail_website_quote(bigint,text,bigint,jsonb) from public;
grant execute on function public.retail_website_quote(bigint,text,bigint,jsonb) to anon,authenticated;

notify pgrst,'reload schema';
commit;
