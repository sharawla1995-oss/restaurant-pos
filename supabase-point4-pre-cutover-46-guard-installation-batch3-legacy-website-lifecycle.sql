-- Point4 Pre-Cutover 46 Guard Installation — Batch 3
-- Legacy Website Lifecycle only: contracts #2, #4, #20.
-- Source-only. No deployment / activation / cutover.

create or replace function public.accept_retail_website_order(p_retail_website_order_id bigint)
returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare
  v_web public.retail_website_orders%rowtype;
  v_emp bigint;
  v_shift bigint;
  v_result jsonb;
  v_order_id bigint;
  v_items jsonb;
  v_order jsonb;
  v_payments jsonb;
  v_frozen_items jsonb;
  v_guard_product_id bigint;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  v_emp:=public.current_employee_id();
  if v_emp is null then raise exception 'تعذر تحديد الموظف الحالي'; end if;

  perform pg_advisory_xact_lock(hashtextextended('retail-web-accept:'||p_retail_website_order_id::text,0));
  select * into v_web from public.retail_website_orders where id=p_retail_website_order_id for update;
  if not found then raise exception 'طلب الموقع غير موجود'; end if;
  if not public.has_branch_access(v_web.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_web.status='accepted' and v_web.accepted_order_id is not null then return v_web.accepted_order_id; end if;
  if v_web.status<>'pending' then raise exception 'طلب الموقع لم يعد معلقًا'; end if;

  -- Read-only precompute before the guard. Preserve legacy expiry semantics by
  -- deferring the open-shift error until after the guarded expiry branch.
  select id into v_shift from public.shifts
   where branch_id=v_web.branch_id and employee_id=v_emp and status='open' and closed_at is null
   order by opened_at desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',wi.id,'product_id',wi.product_id,'product_name',wi.product_name,
    'quantity',wi.quantity,'unit_price',wi.unit_price,
    'unit_cost_snapshot',wi.unit_cost_snapshot,'line_subtotal',wi.line_subtotal,
    'notes',wi.notes) order by wi.id),'[]'::jsonb)
    into v_frozen_items
    from public.retail_website_order_items wi
   where wi.retail_website_order_id=v_web.id;

  for v_guard_product_id in
    select distinct (x->>'product_id')::bigint
      from jsonb_array_elements(v_frozen_items) x
     where nullif(x->>'product_id','') is not null
     order by 1
  loop
    perform public.inventory_stock_assert_legacy_write_allowed_v2(
      v_web.branch_id,'product',v_guard_product_id
    );
  end loop;

  if v_web.reservation_expires_at<=now() then
    update public.retail_website_orders set status='expired',updated_at=now() where id=v_web.id;
    update public.retail_stock_reservations set status='expired'
     where website_order_id=v_web.id and status='active'
       and product_id in (
         select distinct (x->>'product_id')::bigint
           from jsonb_array_elements(v_frozen_items) x
          where nullif(x->>'product_id','') is not null
       );
    raise exception 'انتهت مدة حجز المخزون لهذا الطلب';
  end if;

  if v_shift is null then raise exception 'افتح وردية أولًا قبل استلام طلب الموقع'; end if;

  perform 1
  from public.retail_inventory_balances b
  join (
    select distinct (x->>'product_id')::bigint product_id
      from jsonb_array_elements(v_frozen_items) x
     where nullif(x->>'product_id','') is not null
  ) wi on wi.product_id=b.product_id
  where b.branch_id=v_web.branch_id
  order by b.product_id
  for update of b;

  if exists(
    select 1
      from jsonb_to_recordset(v_frozen_items) as wi(product_id bigint,quantity numeric)
      left join public.retail_stock_reservations r
        on r.website_order_id=v_web.id and r.reservation_key=v_web.reservation_key
       and r.product_id=wi.product_id and r.status='active' and r.expires_at>now()
     where r.id is null or r.quantity<wi.quantity
  ) then raise exception 'حجز المخزون غير صالح أو انتهى'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',wi.product_id,'product_name',wi.product_name,'quantity',wi.quantity,
    'unit_price',wi.unit_price,'cost',wi.unit_cost_snapshot,'total',wi.line_subtotal,
    'notes',wi.notes,'modifiers','[]'::jsonb
  ) order by wi.id),'[]'::jsonb) into v_items
  from jsonb_to_recordset(v_frozen_items) as wi(
    id bigint,product_id bigint,product_name text,quantity numeric,
    unit_price numeric,unit_cost_snapshot numeric,line_subtotal numeric,notes text
  );

  v_order:=jsonb_build_object(
    'branch_id',v_web.branch_id,'employee_id',v_emp,'shift_id',v_shift,
    'order_type',v_web.order_type,'payment_method',v_web.payment_method_code,
    'subtotal',v_web.subtotal,'discount',v_web.offer_discount,'discount_type','amount',
    'discount_value',v_web.offer_discount,'tax_amount',0,'service_amount',0,
    'delivery_fee',v_web.delivery_fee,'total',v_web.total,
    'promo_discount',0,'status','new','source','website',
    'customer_phone',v_web.customer_phone,'customer_name',v_web.customer_name,
    'delivery_address',case when v_web.order_type='delivery' then v_web.customer_address else null end,
    'delivery_zone_id',case when v_web.order_type='delivery' then v_web.delivery_zone_id else null end,
    'notes',nullif(concat_ws(' | ',v_web.customer_notes,
      case when v_web.offer_discount>0 then 'Retail Website Offers: '||v_web.offer_discount::text else null end),''),
    'client_tx_id','retail-web:'||v_web.id::text
  );
  v_payments:=jsonb_build_array(jsonb_build_object('method',v_web.payment_method_code,'amount',v_web.total));

  v_result:=public.create_retail_pos_order_atomic(v_order,v_items,v_payments);
  v_order_id:=nullif(v_result->'order'->>'id','')::bigint;
  if v_order_id is null then raise exception 'تعذر إنشاء فاتورة Retail من طلب الموقع'; end if;

  update public.orders
     set website_order_id=v_web.id,
         payment_status=case when v_web.payment_status='confirmed' then 'confirmed' else v_web.payment_status end,
         payment_reference=v_web.payment_reference
   where id=v_order_id;

  update public.retail_stock_reservations set status='consumed'
    where website_order_id=v_web.id and reservation_key=v_web.reservation_key and status='active'
      and product_id in (
        select distinct (x->>'product_id')::bigint
          from jsonb_array_elements(v_frozen_items) x
         where nullif(x->>'product_id','') is not null
      );
  update public.retail_website_orders
     set status='accepted',accepted_order_id=v_order_id,accepted_by_employee_id=v_emp,
         accepted_at=now(),updated_at=now()
   where id=v_web.id;

  return v_order_id;
end $$;
revoke all on function public.accept_retail_website_order(bigint) from public;
grant execute on function public.accept_retail_website_order(bigint) to authenticated;

create or replace function public.cancel_retail_website_order_customer(p_order_code text,p_customer_phone text)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_phone text:=public.retail_website_normalize_phone(p_customer_phone);
  v_web public.retail_website_orders%rowtype;
  v_frozen_items jsonb;
  v_guard_product_id bigint;
begin
  select * into v_web from public.retail_website_orders
   where public_order_code=upper(trim(coalesce(p_order_code,''))) and customer_phone=v_phone for update;
  if not found then raise exception 'الطلب غير موجود'; end if;
  if v_web.status<>'pending' then raise exception 'لا يمكن إلغاء الطلب بعد استلامه داخل الفرع'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('product_id',wi.product_id) order by wi.id),'[]'::jsonb)
    into v_frozen_items from public.retail_website_order_items wi
   where wi.retail_website_order_id=v_web.id;

  for v_guard_product_id in
    select distinct (x->>'product_id')::bigint from jsonb_array_elements(v_frozen_items) x
     where nullif(x->>'product_id','') is not null order by 1
  loop
    perform public.inventory_stock_assert_legacy_write_allowed_v2(v_web.branch_id,'product',v_guard_product_id);
  end loop;

  update public.retail_website_orders set status='cancelled',cancelled_at=now(),updated_at=now() where id=v_web.id;
  update public.retail_stock_reservations set status='released'
    where website_order_id=v_web.id and reservation_key=v_web.reservation_key and status='active'
      and product_id in (
        select distinct (x->>'product_id')::bigint from jsonb_array_elements(v_frozen_items) x
         where nullif(x->>'product_id','') is not null
      );
  return true;
end $$;
revoke all on function public.cancel_retail_website_order_customer(text,text) from public;
grant execute on function public.cancel_retail_website_order_customer(text,text) to anon,authenticated;

create or replace function public.reject_retail_website_order(p_retail_website_order_id bigint,p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_web public.retail_website_orders%rowtype;
  v_frozen_items jsonb;
  v_guard_product_id bigint;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  select * into v_web from public.retail_website_orders where id=p_retail_website_order_id for update;
  if not found then raise exception 'طلب الموقع غير موجود'; end if;
  if not public.has_branch_access(v_web.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_web.status='rejected' then return true; end if;
  if v_web.status<>'pending' then raise exception 'لا يمكن رفض الطلب في حالته الحالية'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('product_id',wi.product_id) order by wi.id),'[]'::jsonb)
    into v_frozen_items from public.retail_website_order_items wi
   where wi.retail_website_order_id=v_web.id;

  for v_guard_product_id in
    select distinct (x->>'product_id')::bigint from jsonb_array_elements(v_frozen_items) x
     where nullif(x->>'product_id','') is not null order by 1
  loop
    perform public.inventory_stock_assert_legacy_write_allowed_v2(v_web.branch_id,'product',v_guard_product_id);
  end loop;

  update public.retail_website_orders
     set status='rejected',rejected_at=now(),updated_at=now(),
         customer_notes=concat_ws(' | ',customer_notes,nullif('رفض الفرع: '||trim(coalesce(p_reason,'')),'رفض الفرع: '))
   where id=v_web.id;
  update public.retail_stock_reservations set status='released'
    where website_order_id=v_web.id and reservation_key=v_web.reservation_key and status='active'
      and product_id in (
        select distinct (x->>'product_id')::bigint from jsonb_array_elements(v_frozen_items) x
         where nullif(x->>'product_id','') is not null
      );
  return true;
end $$;
revoke all on function public.reject_retail_website_order(bigint,text) from public;
grant execute on function public.reject_retail_website_order(bigint,text) to authenticated;
