-- Top Burger POS V9.6.1 — Returns search/settings + Website branch pickup
-- Run AFTER supabase-v9-6-0-returns.sql and v9-5-0 website control.

insert into public.app_settings(key,value) values ('returns_allow_closed_shifts','false')
on conflict(key) do nothing;

alter table public.website_orders add column if not exists order_type text not null default 'delivery';
alter table public.website_orders drop constraint if exists website_orders_order_type_check;
alter table public.website_orders add constraint website_orders_order_type_check check(order_type in ('delivery','pickup'));

-- Replace website order RPC with pickup-aware version.
create or replace function public.create_website_order(
  p_branch_id bigint, p_customer_name text, p_customer_phone text,
  p_customer_address text, p_customer_notes text, p_items jsonb,
  p_payment_method_code text default 'cash', p_payment_reference text default null,
  p_payment_receipt_path text default null, p_order_type text default 'delivery'
) returns bigint language plpgsql security definer set search_path=public as $$
declare
  v_order_id bigint; v_subtotal numeric(12,2):=0; v_total numeric(12,2):=0;
  v_item jsonb; v_product public.products%rowtype; v_variant public.product_variants%rowtype;
  v_qty integer; v_unit numeric(12,2); v_extras numeric(12,2); v_line numeric(12,2); v_wi bigint;
  v_modifier jsonb; v_mod public.modifiers%rowtype; v_payment public.payment_methods%rowtype;
  v_bpm public.branch_payment_methods%rowtype; v_bs public.branch_website_settings%rowtype; v_type text;
begin
  v_type:=lower(coalesce(nullif(trim(p_order_type),''),'delivery'));
  if v_type not in ('delivery','pickup') then raise exception 'نوع الاستلام غير صحيح'; end if;
  if nullif(trim(p_customer_name),'') is null then raise exception 'اسم العميل مطلوب'; end if;
  if nullif(trim(p_customer_phone),'') is null then raise exception 'رقم الهاتف مطلوب'; end if;
  if v_type='delivery' and nullif(trim(coalesce(p_customer_address,'')),'') is null then raise exception 'عنوان التوصيل مطلوب'; end if;
  if p_items is null or jsonb_array_length(p_items)=0 then raise exception 'السلة فارغة'; end if;
  if not exists(select 1 from public.branches where id=p_branch_id and active=true and website_visible=true) then raise exception 'الفرع غير متاح'; end if;
  select * into v_bs from public.branch_website_settings where branch_id=p_branch_id;
  if found and (v_bs.orders_open=false or (v_bs.orders_paused_until is not null and v_bs.orders_paused_until>now())) then raise exception 'الفرع أوقف استقبال الطلبات'; end if;
  select * into v_payment from public.payment_methods where code=coalesce(nullif(trim(p_payment_method_code),''),'cash') and active=true;
  if not found then raise exception 'طريقة الدفع غير متاحة'; end if;
  select * into v_bpm from public.branch_payment_methods where branch_id=p_branch_id and payment_method_id=v_payment.id and active=true and website_enabled=true;
  if not found then raise exception 'طريقة الدفع غير متاحة على الموقع لهذا الفرع'; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id=(v_item->>'product_id')::bigint and active=true and website_visible=true;
    if not found then raise exception 'أحد الأصناف غير متاح'; end if;
    if not exists(select 1 from public.branch_products bp where bp.branch_id=p_branch_id and bp.product_id=v_product.id and bp.active=true and (bp.website_paused_until is null or bp.website_paused_until<=now())) then raise exception 'أحد الأصناف غير متاح في الفرع'; end if;
    v_qty:=greatest(1,coalesce((v_item->>'quantity')::integer,1));
    if nullif(v_item->>'variant_id','') is not null then
      select * into v_variant from public.product_variants where id=(v_item->>'variant_id')::bigint and product_id=v_product.id and active=true;
      if not found then raise exception 'اختيار الحجم غير متاح'; end if; v_unit:=v_variant.price;
    else select coalesce(bp.price_override,v_product.price) into v_unit from public.branch_products bp where bp.branch_id=p_branch_id and bp.product_id=v_product.id; end if;
    v_extras:=0;
    for v_modifier in select * from jsonb_array_elements(coalesce(v_item->'modifiers','[]'::jsonb)) loop
      select * into v_mod from public.modifiers where id=(v_modifier->>'modifier_id')::bigint and active=true;
      if not found or not exists(select 1 from public.product_modifiers pm where pm.product_id=v_product.id and pm.modifier_id=v_mod.id) then raise exception 'إضافة غير متاحة'; end if;
      v_extras:=v_extras+coalesce(v_mod.price,0);
    end loop;
    v_line:=(v_unit+v_extras)*v_qty; v_subtotal:=v_subtotal+v_line;
  end loop;
  v_total:=v_subtotal;
  insert into public.website_orders(branch_id,customer_name,customer_phone,customer_address,customer_notes,subtotal,delivery_fee,total,status,payment_method_code,payment_method_name,payment_reference,payment_receipt_path,payment_status,order_type)
  values(p_branch_id,trim(p_customer_name),trim(p_customer_phone),case when v_type='pickup' then null else trim(p_customer_address) end,nullif(trim(coalesce(p_customer_notes,'')),''),v_subtotal,0,v_total,'pending',v_payment.code,v_payment.name,nullif(trim(coalesce(p_payment_reference,'')),''),nullif(trim(coalesce(p_payment_receipt_path,'')),''),case when v_payment.code='cash' then 'unpaid' else case when p_payment_receipt_path is not null or nullif(trim(coalesce(p_payment_reference,'')),'') is not null then 'proof_submitted' else 'unpaid' end end,v_type)
  returning id into v_order_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id=(v_item->>'product_id')::bigint; v_qty:=greatest(1,coalesce((v_item->>'quantity')::integer,1));
    if nullif(v_item->>'variant_id','') is not null then select * into v_variant from public.product_variants where id=(v_item->>'variant_id')::bigint; v_unit:=v_variant.price;
    else select coalesce(bp.price_override,v_product.price) into v_unit from public.branch_products bp where bp.branch_id=p_branch_id and bp.product_id=v_product.id; v_variant.id:=null; v_variant.name:=null; end if;
    v_extras:=0; for v_modifier in select * from jsonb_array_elements(coalesce(v_item->'modifiers','[]'::jsonb)) loop select * into v_mod from public.modifiers where id=(v_modifier->>'modifier_id')::bigint; v_extras:=v_extras+coalesce(v_mod.price,0); end loop;
    v_line:=(v_unit+v_extras)*v_qty;
    insert into public.website_order_items(website_order_id,product_id,product_name,variant_id,variant_name,quantity,unit_price,extras_total,line_total,notes) values(v_order_id,v_product.id,v_product.name,v_variant.id,v_variant.name,v_qty,v_unit,v_extras,v_line,nullif(trim(coalesce(v_item->>'notes','')),'')) returning id into v_wi;
    for v_modifier in select * from jsonb_array_elements(coalesce(v_item->'modifiers','[]'::jsonb)) loop select * into v_mod from public.modifiers where id=(v_modifier->>'modifier_id')::bigint; insert into public.website_order_item_modifiers(website_order_item_id,modifier_id,modifier_name,price) values(v_wi,v_mod.id,v_mod.name,v_mod.price); end loop;
  end loop;
  return v_order_id;
end; $$;
revoke all on function public.create_website_order(bigint,text,text,text,text,jsonb,text,text,text,text) from public;
grant execute on function public.create_website_order(bigint,text,text,text,text,jsonb,text,text,text,text) to anon,authenticated;

-- Accept both delivery and branch pickup website orders.
create or replace function public.accept_website_order(p_website_order_id bigint) returns bigint language plpgsql security definer set search_path=public as $$
declare w public.website_orders%rowtype; wi record; wm record; v_employee_id bigint; v_order_id bigint; v_order_item_id bigint; v_shift_id bigint; v_type text;
begin
 v_employee_id:=public.current_employee_id(); if v_employee_id is null then raise exception 'المستخدم غير مربوط بموظف'; end if;
 select * into w from public.website_orders where id=p_website_order_id for update; if not found then raise exception 'طلب الموقع غير موجود'; end if;
 if not public.has_branch_access(w.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if; if w.status<>'pending' then raise exception 'تم التعامل مع الطلب بالفعل'; end if;
 select id into v_shift_id from public.shifts where branch_id=w.branch_id and employee_id=v_employee_id and status='open' and closed_at is null order by opened_at desc limit 1; if v_shift_id is null then raise exception 'افتح وردية أولًا قبل استلام طلب الموقع'; end if;
 v_type:=case when coalesce(w.order_type,'delivery')='pickup' then 'takeaway' else 'delivery' end;
 insert into public.orders(branch_id,employee_id,customer_id,shift_id,order_type,payment_method,subtotal,discount,delivery_fee,total,status,notes,source,customer_phone,delivery_address,customer_name,website_order_id,payment_status,payment_reference,payment_receipt_path)
 values(w.branch_id,v_employee_id,null,v_shift_id,v_type,coalesce(w.payment_method_code,'cash'),w.subtotal,0,case when v_type='delivery' then w.delivery_fee else 0 end,w.total,'new',w.customer_notes,'website',w.customer_phone,case when v_type='delivery' then w.customer_address else null end,w.customer_name,w.id,coalesce(w.payment_status,'unpaid'),w.payment_reference,w.payment_receipt_path) returning id into v_order_id;
 for wi in select * from public.website_order_items where website_order_id=w.id order by id loop
  insert into public.order_items(order_id,product_id,product_name,quantity,unit_price,cost,total,notes) values(v_order_id,wi.product_id,wi.product_name,wi.quantity,wi.unit_price,coalesce((select cost from public.products where id=wi.product_id),0),wi.line_total,wi.notes) returning id into v_order_item_id;
  for wm in select * from public.website_order_item_modifiers where website_order_item_id=wi.id order by id loop insert into public.order_item_modifiers(order_item_id,modifier_id,modifier_name,price) values(v_order_item_id,wm.modifier_id,wm.modifier_name,wm.price); end loop;
 end loop;
 update public.website_orders set status='accepted',accepted_at=now(),order_id=v_order_id where id=w.id; return v_order_id;
end; $$;
revoke all on function public.accept_website_order(bigint) from public; grant execute on function public.accept_website_order(bigint) to authenticated;

-- Harden returns: optional old-shift return, always posts to CURRENT open shift.
create or replace function public.create_order_return(p_order_id bigint,p_reason text,p_notes text,p_items jsonb,p_payments jsonb) returns bigint language plpgsql security definer set search_path=public as $$
declare v_order public.orders%rowtype; v_emp bigint; v_shift bigint; v_allow_closed boolean:=false; v_return_id bigint; v_return_no bigint; v_item jsonb; v_oi public.order_items%rowtype; v_qty numeric(12,3); v_prev numeric(12,3); v_line numeric(12,2); v_sub numeric(12,2):=0; v_ratio numeric(18,8):=0; v_discount numeric(12,2):=0; v_tax numeric(12,2):=0; v_service numeric(12,2):=0; v_total numeric(12,2):=0; v_prices_include_tax boolean:=true; v_pay jsonb; v_pay_total numeric(12,2):=0; v_method text; v_amount numeric(12,2);
begin
 if not (public.is_admin() or public.has_permission('returns')) then raise exception 'ليس لديك صلاحية عمل مرتجع'; end if;
 v_emp:=public.current_employee_id(); if v_emp is null then raise exception 'المستخدم غير مربوط بموظف'; end if;
 select * into v_order from public.orders where id=p_order_id for update; if not found then raise exception 'الفاتورة غير موجودة'; end if;
 if not public.has_branch_access(v_order.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if; if v_order.status='cancelled' then raise exception 'لا يمكن عمل مرتجع لفاتورة ملغية'; end if;
 select coalesce(value,'false')::boolean into v_allow_closed from public.app_settings where key='returns_allow_closed_shifts';
 select coalesce(bfs.prices_include_tax,true) into v_prices_include_tax from public.branch_financial_settings bfs where bfs.branch_id=v_order.branch_id;
 if not found then v_prices_include_tax:=true; end if;
 select id into v_shift from public.shifts where branch_id=v_order.branch_id and employee_id=v_emp and status='open' and closed_at is null order by opened_at desc limit 1; if v_shift is null then raise exception 'افتح وردية أولًا قبل عمل المرتجع'; end if;
 if not v_allow_closed and v_order.shift_id is distinct from v_shift then raise exception 'المرتجع مسموح لفواتير الوردية الحالية فقط'; end if;
 if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'سبب المرتجع مطلوب'; end if; if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'اختر صنفًا واحدًا على الأقل'; end if;
 for v_item in select * from jsonb_array_elements(p_items) loop
  select * into v_oi from public.order_items where id=(v_item->>'order_item_id')::bigint and order_id=v_order.id; if not found then raise exception 'صنف المرتجع غير موجود بالفاتورة'; end if;
  v_qty:=coalesce((v_item->>'quantity')::numeric,0); if v_qty<=0 then raise exception 'كمية المرتجع غير صحيحة'; end if;
  select coalesce(sum(ri.quantity),0) into v_prev from public.return_items ri join public.returns r on r.id=ri.return_id where r.order_id=v_order.id and ri.order_item_id=v_oi.id;
  if v_qty+v_prev>v_oi.quantity then raise exception 'كمية المرتجع أكبر من الكمية المتاحة للصنف %',v_oi.product_name; end if;
  v_line:=round((coalesce(v_oi.total,0)/nullif(v_oi.quantity,0))*v_qty,2); v_sub:=v_sub+v_line;
 end loop;
 if coalesce(v_order.subtotal,0)>0 then v_ratio:=least(1,v_sub/v_order.subtotal); end if;
 v_discount:=round(coalesce(v_order.discount,0)*v_ratio,2); v_tax:=round(coalesce(v_order.tax_amount,0)*v_ratio,2); v_service:=round(coalesce(v_order.service_amount,0)*v_ratio,2); v_total:=greatest(0,round(v_sub-v_discount+(case when v_prices_include_tax then 0 else v_tax end)+v_service,2));
 if p_payments is null or jsonb_typeof(p_payments)<>'array' or jsonb_array_length(p_payments)=0 then raise exception 'حدد طريقة رد المبلغ'; end if;
 for v_pay in select * from jsonb_array_elements(p_payments) loop v_method:=nullif(trim(v_pay->>'method'),''); v_amount:=coalesce((v_pay->>'amount')::numeric,0); if v_method is null or v_amount<=0 then raise exception 'بيانات رد المبلغ غير صحيحة'; end if; v_pay_total:=v_pay_total+v_amount; end loop;
 if abs(v_pay_total-v_total)>0.01 then raise exception 'إجمالي رد المبلغ يجب أن يساوي %',v_total; end if;
 insert into public.branch_return_counters(branch_id,next_number) values(v_order.branch_id,2) on conflict(branch_id) do update set next_number=public.branch_return_counters.next_number+1 returning next_number-1 into v_return_no;
 insert into public.returns(branch_id,return_number,order_id,original_invoice_number,original_bon_number,employee_id,shift_id,reason,notes,subtotal,discount_adjustment,tax_adjustment,service_adjustment,total) values(v_order.branch_id,v_return_no,v_order.id,v_order.invoice_number,v_order.bon_number,v_emp,v_shift,trim(p_reason),nullif(trim(coalesce(p_notes,'')),''),v_sub,v_discount,v_tax,v_service,v_total) returning id into v_return_id;
 for v_item in select * from jsonb_array_elements(p_items) loop select * into v_oi from public.order_items where id=(v_item->>'order_item_id')::bigint and order_id=v_order.id; v_qty:=(v_item->>'quantity')::numeric; v_line:=round((coalesce(v_oi.total,0)/nullif(v_oi.quantity,0))*v_qty,2); insert into public.return_items(return_id,order_item_id,product_id,product_name,quantity,unit_refund,total) values(v_return_id,v_oi.id,v_oi.product_id,v_oi.product_name,v_qty,round(v_line/v_qty,2),v_line); end loop;
 for v_pay in select * from jsonb_array_elements(p_payments) loop insert into public.return_payments(return_id,method,amount) values(v_return_id,trim(v_pay->>'method'),(v_pay->>'amount')::numeric); end loop; return v_return_id;
end; $$;
revoke all on function public.create_order_return(bigint,text,text,jsonb,jsonb) from public; grant execute on function public.create_order_return(bigint,text,text,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
