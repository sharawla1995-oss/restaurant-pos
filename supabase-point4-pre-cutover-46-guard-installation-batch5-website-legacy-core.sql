-- Point4 Pre-Cutover 46 Guard Installation — Batch 5
-- Contract #22 only. Effective private beta18 core implementation.
-- Public retail_create_website_order(...) wrapper/signature/replay behavior is unchanged.
-- Source-only. No deployment / activation / cutover.

create or replace function public.retail_create_website_order_beta18_core(
  p_branch_id bigint,
  p_idempotency_key text,
  p_reservation_key text,
  p_customer_name text,
  p_customer_phone text,
  p_order_type text,
  p_delivery_zone_id bigint,
  p_customer_address text,
  p_customer_notes text,
  p_payment_method_code text,
  p_payment_reference text,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_idem text:=nullif(trim(coalesce(p_idempotency_key,'')),'');
  v_res_key text:=nullif(trim(coalesce(p_reservation_key,'')),'');
  v_phone text:=public.retail_website_normalize_phone(p_customer_phone);
  v_type text:=lower(coalesce(nullif(trim(p_order_type),''),'pickup'));
  v_pay text:=lower(coalesce(nullif(trim(p_payment_method_code),''),'cash'));
  v_existing public.retail_website_orders%rowtype;
  v_order public.retail_website_orders%rowtype;
  v_row record;
  v_product public.products%rowtype;
  v_ps public.retail_product_settings%rowtype;
  v_balance public.retail_inventory_balances%rowtype;
  v_bp public.branch_products%rowtype;
  v_qty numeric(14,3);
  v_price numeric(14,4);
  v_line numeric(14,2);
  v_offer numeric(14,2);
  v_available numeric(14,3);
  v_reserved numeric(14,3);
  v_subtotal numeric(14,2):=0;
  v_discount numeric(14,2):=0;
  v_delivery numeric(14,2):=0;
  v_total numeric(14,2):=0;
  v_expiry timestamptz:=now()+interval '15 minutes';
  v_items jsonb:='[]'::jsonb;
  v_frozen_products jsonb:='[]'::jsonb;
  v_guard_product_id bigint;
begin
  if v_idem is null or length(v_idem)<8 or length(v_idem)>160 then raise exception 'معرف الطلب غير صالح'; end if;
  if v_res_key is null or length(v_res_key)<8 or length(v_res_key)>160 then raise exception 'معرف الحجز غير صالح'; end if;
  if nullif(trim(coalesce(p_customer_name,'')),'') is null then raise exception 'اسم العميل مطلوب'; end if;
  if length(v_phone)<10 or length(v_phone)>15 then raise exception 'رقم الهاتف غير صالح'; end if;
  if v_type not in('pickup','delivery') then raise exception 'نوع الطلب غير صالح'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'السلة فارغة'; end if;
  if jsonb_array_length(p_items)>100 then raise exception 'عدد الأصناف أكبر من الحد المسموح'; end if;
  if not public.retail_website_branch_open(p_branch_id) then raise exception 'الفرع غير متاح لاستقبال الطلبات الآن'; end if;

  perform pg_advisory_xact_lock(hashtextextended('retail-web-idem:'||v_idem,0));
  select * into v_existing from public.retail_website_orders where idempotency_key=v_idem;
  if found then
    return jsonb_build_object(
      'ok',true,'id',v_existing.id,'order_code',v_existing.public_order_code,
      'status',v_existing.status,'total',v_existing.total,
      'reservation_expires_at',v_existing.reservation_expires_at,'idempotent',true
    );
  end if;

  -- Coarse anonymous anti-hoarding guard. Stronger WAF/CAPTCHA/rate limiting can
  -- be layered at an Edge/API gateway later without changing this RPC contract.
  if (select count(*) from public.retail_website_orders w
      where w.branch_id=p_branch_id and w.customer_phone=v_phone
        and w.status='pending' and w.reservation_expires_at>now()
        and w.created_at>now()-interval '10 minutes') >= 3 then
    raise exception 'يوجد عدة طلبات معلقة لهذا الرقم. حاول بعد قليل';
  end if;

  -- Validate website payment method if website payment configuration exists.
  if exists(select 1 from public.payment_methods) then
    if not exists(
      select 1 from public.payment_methods pm
      join public.branch_payment_methods bpm on bpm.payment_method_id=pm.id
      where pm.code=v_pay and pm.active=true and bpm.branch_id=p_branch_id
        and bpm.active=true and coalesce(bpm.website_enabled,false)=true
    ) then raise exception 'طريقة الدفع غير متاحة على الموقع لهذا الفرع'; end if;
  end if;

  if v_type='delivery' then
    if p_delivery_zone_id is null then raise exception 'منطقة التوصيل مطلوبة'; end if;
    select round(greatest(coalesce(z.delivery_fee,0),0),2) into v_delivery
      from public.delivery_zones z
      where z.id=p_delivery_zone_id and z.branch_id=p_branch_id and z.active=true;
    if not found then raise exception 'منطقة التوصيل غير متاحة لهذا الفرع'; end if;
    if nullif(trim(coalesce(p_customer_address,'')),'') is null then raise exception 'عنوان التوصيل مطلوب'; end if;
  else
    v_delivery:=0;
  end if;

  -- Phase A: resolve and validate the complete submitted product universe
  -- without durable inventory/reservation writes. Freeze deterministic product
  -- evidence before any Legacy stock lifecycle mutation.
  for v_row in
    select nullif(x->>'product_id','')::bigint as product_id,
           round(sum(coalesce((x->>'quantity')::numeric,0)),3) as quantity,
           max(nullif(trim(coalesce(x->>'notes','')),'')) as notes
    from jsonb_array_elements(p_items) x
    where nullif(x->>'product_id','') is not null
    group by nullif(x->>'product_id','')::bigint
    order by nullif(x->>'product_id','')::bigint
  loop
    v_qty:=v_row.quantity;
    if v_qty<=0 then raise exception 'كمية صنف غير صحيحة'; end if;

    select * into v_product from public.products where id=v_row.product_id and active=true;
    if not found then raise exception 'أحد الأصناف غير متاح'; end if;

    select * into v_ps from public.retail_product_settings where product_id=v_product.id;
    if not found then
      v_ps.product_id:=v_product.id; v_ps.unit_type:='piece'; v_ps.allow_decimal:=false;
      v_ps.qty_step:=1; v_ps.min_qty:=1; v_ps.online_enabled:=true;
    end if;
    if coalesce(v_ps.online_enabled,true) is not true then raise exception 'الصنف % غير متاح أونلاين',v_product.name; end if;
    if v_qty<coalesce(v_ps.min_qty,1) then raise exception 'الكمية أقل من الحد الأدنى للصنف %',v_product.name; end if;
    if not coalesce(v_ps.allow_decimal,false) and v_qty<>trunc(v_qty) then raise exception 'الصنف % لا يسمح بكمية عشرية',v_product.name; end if;
    if abs((v_qty/coalesce(v_ps.qty_step,1))-round(v_qty/coalesce(v_ps.qty_step,1)))>0.0001 then raise exception 'كمية الصنف % لا تطابق خطوة البيع',v_product.name; end if;

    select * into v_bp from public.branch_products where branch_id=p_branch_id and product_id=v_product.id;
    if found and v_bp.active is false then raise exception 'الصنف % غير متاح في هذا الفرع',v_product.name; end if;
    if found and v_bp.website_paused_until is not null and v_bp.website_paused_until>now() then raise exception 'الصنف % موقوف مؤقتًا على الموقع',v_product.name; end if;
    v_price:=coalesce(v_bp.price_override,v_product.price,0);
    if v_price<0 then raise exception 'سعر الصنف غير صالح'; end if;

    v_frozen_products:=v_frozen_products||jsonb_build_array(jsonb_build_object(
      'product_id',v_product.id,
      'product_name',v_product.name,
      'unit_type',coalesce(v_ps.unit_type,'piece'),
      'quantity',v_qty,
      'unit_price',v_price,
      'unit_cost_snapshot',coalesce(v_product.cost,0),
      'notes',v_row.notes
    ));
  end loop;

  if jsonb_array_length(v_frozen_products)=0 then raise exception 'السلة لا تحتوي أصنافًا صالحة'; end if;

  -- Guard ALL identities from the complete frozen set before the first durable
  -- inventory/reservation lifecycle write.
  for v_guard_product_id in
    select distinct x.product_id
    from jsonb_to_recordset(v_frozen_products) as x(product_id bigint)
    order by x.product_id
  loop
    perform public.inventory_stock_assert_legacy_write_allowed_v2(
      p_branch_id,'product',v_guard_product_id
    );
  end loop;

  -- Phase B: mutable stock state is read only after the guard. Product identity
  -- and quantity come exclusively from the frozen evidence.
  for v_row in
    select *
    from jsonb_to_recordset(v_frozen_products) as x(
      product_id bigint,
      product_name text,
      unit_type text,
      quantity numeric,
      unit_price numeric,
      unit_cost_snapshot numeric,
      notes text
    )
    order by product_id
  loop
    v_qty:=v_row.quantity;
    v_price:=v_row.unit_price;

    insert into public.retail_inventory_balances(branch_id,product_id,quantity)
      values(p_branch_id,v_row.product_id,0) on conflict(branch_id,product_id) do nothing;
    select * into v_balance from public.retail_inventory_balances
      where branch_id=p_branch_id and product_id=v_row.product_id for update;

    update public.retail_stock_reservations
       set status='expired'
     where branch_id=p_branch_id and product_id=v_row.product_id and status='active' and expires_at<=now();

    select coalesce(sum(r.quantity),0) into v_reserved
      from public.retail_stock_reservations r
      where r.branch_id=p_branch_id and r.product_id=v_row.product_id
        and r.status='active' and r.expires_at>now();
    v_available:=round(coalesce(v_balance.quantity,0)-v_reserved,3);
    if coalesce(v_balance.track_inventory,true) and v_available<v_qty then
      raise exception 'المخزون غير كافٍ للصنف % — المتاح %',v_row.product_name,v_available;
    end if;

    v_line:=round(v_price*v_qty,2);
    v_offer:=public.retail_website_offer_discount(p_branch_id,v_row.product_id,v_qty,v_price);
    v_subtotal:=v_subtotal+v_line;
    v_discount:=v_discount+least(v_line,v_offer);
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'product_id',v_row.product_id,'product_name',v_row.product_name,'unit_type',v_row.unit_type,
      'quantity',v_qty,'unit_price',v_price,'unit_cost_snapshot',v_row.unit_cost_snapshot,
      'line_subtotal',v_line,'offer_discount',least(v_line,v_offer),
      'line_total',round(greatest(0,v_line-least(v_line,v_offer)),2),'notes',v_row.notes
    ));
  end loop;

  if jsonb_array_length(v_items)=0 then raise exception 'السلة لا تحتوي أصنافًا صالحة'; end if;
  v_discount:=round(least(v_subtotal,greatest(0,v_discount)),2);
  v_total:=round(greatest(0,v_subtotal-v_discount+v_delivery),2);

  insert into public.retail_website_orders(
    branch_id,idempotency_key,reservation_key,customer_name,customer_phone,
    customer_address,customer_notes,order_type,delivery_zone_id,payment_method_code,
    payment_status,payment_reference,subtotal,offer_discount,delivery_fee,total,
    status,reservation_expires_at
  ) values(
    p_branch_id,v_idem,v_res_key,trim(p_customer_name),v_phone,
    nullif(trim(coalesce(p_customer_address,'')),''),nullif(trim(coalesce(p_customer_notes,'')),''),
    v_type,case when v_type='delivery' then p_delivery_zone_id else null end,v_pay,
    case when nullif(trim(coalesce(p_payment_reference,'')),'') is null then 'unpaid' else 'proof_submitted' end,
    nullif(trim(coalesce(p_payment_reference,'')),''),v_subtotal,v_discount,v_delivery,v_total,
    'pending',v_expiry
  ) returning * into v_order;

  update public.retail_website_orders set public_order_code='RW-'||lpad(v_order.id::text,8,'0') where id=v_order.id
    returning * into v_order;

  insert into public.retail_website_order_items(
    retail_website_order_id,product_id,product_name,unit_type,quantity,unit_price,
    unit_cost_snapshot,line_subtotal,offer_discount,line_total,notes
  )
  select v_order.id,x.product_id,x.product_name,x.unit_type,x.quantity,x.unit_price,
         x.unit_cost_snapshot,x.line_subtotal,x.offer_discount,x.line_total,x.notes
  from jsonb_to_recordset(v_items) as x(
    product_id bigint,product_name text,unit_type text,quantity numeric,unit_price numeric,
    unit_cost_snapshot numeric,line_subtotal numeric,offer_discount numeric,line_total numeric,notes text
  );

  insert into public.retail_stock_reservations(
    branch_id,product_id,quantity,reservation_key,status,expires_at,website_order_id
  )
  select p_branch_id,x.product_id,x.quantity,v_res_key,'active',v_expiry,v_order.id
  from jsonb_to_recordset(v_items) as x(product_id bigint,quantity numeric)
  on conflict(reservation_key,product_id) do update
    set quantity=excluded.quantity,status='active',expires_at=excluded.expires_at,website_order_id=excluded.website_order_id;

  return jsonb_build_object(
    'ok',true,'id',v_order.id,'order_code',v_order.public_order_code,'status',v_order.status,
    'subtotal',v_order.subtotal,'offer_discount',v_order.offer_discount,
    'delivery_fee',v_order.delivery_fee,'total',v_order.total,
    'reservation_expires_at',v_order.reservation_expires_at,'idempotent',false
  );
end $$;
