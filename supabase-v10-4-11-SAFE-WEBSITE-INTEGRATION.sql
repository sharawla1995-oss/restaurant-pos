-- Top Burger POS V10.4.11 SAFE FINAL
-- Self-contained website acceptance + phone tracking/cancel safety patch.
-- Safe mapping: website pickup -> pickup (NEVER takeaway).

-- Preserve website pickup as its own order type. Do NOT convert it to takeaway.
create or replace function public.accept_website_order(p_website_order_id bigint)
returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare
  w public.website_orders%rowtype;
  wi record; wm record; v_employee_id bigint; v_order_id bigint; v_order_item_id bigint; v_shift_id bigint; v_type text;
begin
  v_employee_id:=public.current_employee_id();
  if v_employee_id is null then raise exception 'المستخدم غير مربوط بموظف'; end if;
  select * into w from public.website_orders where id=p_website_order_id for update;
  if not found then raise exception 'طلب الموقع غير موجود'; end if;
  if not public.has_branch_access(w.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if w.status<>'pending' then raise exception 'تم التعامل مع الطلب بالفعل'; end if;
  select id into v_shift_id from public.shifts where branch_id=w.branch_id and employee_id=v_employee_id and status='open' and closed_at is null order by opened_at desc limit 1;
  if v_shift_id is null then raise exception 'افتح وردية أولًا قبل استلام طلب الموقع'; end if;
  v_type:=case when coalesce(w.order_type,'delivery')='pickup' then 'pickup' else 'delivery' end;

  insert into public.orders(
    branch_id,employee_id,customer_id,shift_id,order_type,payment_method,subtotal,discount,delivery_fee,total,status,notes,source,
    customer_phone,delivery_address,delivery_zone_id,delivery_area,customer_name,website_order_id,payment_status,payment_reference,payment_receipt_path,
    promo_code_id,promo_code,promo_discount
  ) values(
    w.branch_id,v_employee_id,null,v_shift_id,v_type,coalesce(w.payment_method_code,'cash'),w.subtotal,coalesce(w.promo_discount,0),
    case when v_type='delivery' then w.delivery_fee else 0 end,w.total,'new',w.customer_notes,'website',w.customer_phone,
    case when v_type='delivery' then w.customer_address else null end,
    case when v_type='delivery' then w.delivery_zone_id else null end,
    case when v_type='delivery' then (select z.name from public.delivery_zones z where z.id=w.delivery_zone_id) else null end,
    w.customer_name,w.id,coalesce(w.payment_status,'unpaid'),w.payment_reference,w.payment_receipt_path,
    w.promo_code_id,w.promo_code,coalesce(w.promo_discount,0)
  ) returning id into v_order_id;

  for wi in select * from public.website_order_items where website_order_id=w.id order by id loop
    insert into public.order_items(order_id,product_id,product_name,quantity,unit_price,cost,total,notes)
    values(v_order_id,wi.product_id,wi.product_name,wi.quantity,wi.unit_price,coalesce((select cost from public.products where id=wi.product_id),0),wi.line_total,wi.notes)
    returning id into v_order_item_id;
    for wm in select * from public.website_order_item_modifiers where website_order_item_id=wi.id order by id loop
      insert into public.order_item_modifiers(order_item_id,modifier_id,modifier_name,price)
      values(v_order_item_id,wm.modifier_id,wm.modifier_name,wm.price);
    end loop;
  end loop;

  update public.website_orders set status='accepted',accepted_at=now(),order_id=v_order_id where id=w.id;
  update public.promo_redemptions set order_id=v_order_id where website_order_id=w.id and order_id is null;
  return v_order_id;
end;
$$;
grant execute on function public.accept_website_order(bigint) to authenticated;

-- Safety guard: a website pickup must never be inserted as takeaway.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='orders_website_pickup_not_takeaway_ck'
  ) then
    alter table public.orders
      add constraint orders_website_pickup_not_takeaway_ck
      check (not (source='website' and website_order_id is not null and order_type='takeaway')) not valid;
  end if;
end $$;


-- Phone-only tracking/cancel retained from Website V5.4 / POS V10.4.10
-- Phone-only website order tracking + customer cancellation until PREPARING.

create or replace function public.normalize_website_phone(p_phone text)
returns text
language sql
immutable
as $$
  select case
    when regexp_replace(coalesce(p_phone,''),'\D','','g') like '0020%'
      then '0' || substring(regexp_replace(coalesce(p_phone,''),'\D','','g') from 5)
    when regexp_replace(coalesce(p_phone,''),'\D','','g') like '20%'
         and length(regexp_replace(coalesce(p_phone,''),'\D','','g'))=12
      then '0' || substring(regexp_replace(coalesce(p_phone,''),'\D','','g') from 3)
    else regexp_replace(coalesce(p_phone,''),'\D','','g')
  end
$$;

revoke all on function public.normalize_website_phone(text) from public;
grant execute on function public.normalize_website_phone(text) to anon, authenticated;

-- Return recent orders for a phone number only.
-- Deliberately returns tracking-safe fields and does not expose delivery addresses.
create or replace function public.track_website_orders(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_phone text;
  v_result jsonb;
begin
  v_phone:=public.normalize_website_phone(p_phone);
  if length(v_phone)<10 then raise exception 'رقم الموبايل غير صحيح'; end if;

  select coalesce(jsonb_agg(x.obj order by x.created_at desc),'[]'::jsonb)
  into v_result
  from (
    select
      w.created_at,
      jsonb_build_object(
        'id',w.id,
        'status',
          case
            when w.status='accepted' and o.id is not null then o.status
            else w.status
          end,
        'payment_status',coalesce(o.payment_status,w.payment_status,'unpaid'),
        'created_at',w.created_at,
        'branch_id',w.branch_id,
        'branch_name',coalesce(b.name,''),
        'total',w.total,
        'order_type',coalesce(w.order_type,'delivery'),
        'can_cancel',
          case
            when w.status='pending' then true
            when w.status='accepted' and o.id is not null and o.status='new' then true
            else false
          end
      ) obj
    from public.website_orders w
    left join public.orders o on o.id=w.order_id
    left join public.branches b on b.id=w.branch_id
    where public.normalize_website_phone(w.customer_phone)=v_phone
    order by w.created_at desc
    limit 20
  ) x;

  return coalesce(v_result,'[]'::jsonb);
end;
$$;

revoke all on function public.track_website_orders(text) from public;
grant execute on function public.track_website_orders(text) to anon, authenticated;

-- Keep legacy single-order tracking available, but apply the same effective POS status.
create or replace function public.track_website_order(p_website_order_id bigint,p_phone text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare w public.website_orders%rowtype;
declare o public.orders%rowtype;
begin
  select * into w
  from public.website_orders
  where id=p_website_order_id
    and public.normalize_website_phone(customer_phone)=public.normalize_website_phone(p_phone);
  if not found then raise exception 'الطلب غير موجود أو رقم الهاتف غير مطابق'; end if;
  if w.order_id is not null then select * into o from public.orders where id=w.order_id; end if;
  return jsonb_build_object(
    'id',w.id,
    'status',case when w.status='accepted' and o.id is not null then o.status else w.status end,
    'payment_status',coalesce(o.payment_status,w.payment_status,'unpaid'),
    'created_at',w.created_at,
    'accepted_at',w.accepted_at,
    'branch_id',w.branch_id,
    'total',w.total,
    'order_type',coalesce(w.order_type,'delivery'),
    'can_cancel',case when w.status='pending' then true when w.status='accepted' and o.id is not null and o.status='new' then true else false end
  );
end;
$$;

revoke all on function public.track_website_order(bigint,text) from public;
grant execute on function public.track_website_order(bigint,text) to anon, authenticated;

-- Customer may cancel while website order is pending, or after branch acceptance
-- only while the linked POS order is still NEW. PREPARING and later are rejected.
create or replace function public.cancel_website_order_customer(p_website_order_id bigint,p_phone text)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  w public.website_orders%rowtype;
  o public.orders%rowtype;
  s public.website_settings%rowtype;
begin
  select * into s from public.website_settings where id=1;
  if found and (s.allow_customer_cancel=false or s.show_cancel_order=false) then
    raise exception 'إلغاء الطلب غير متاح حاليًا';
  end if;

  select * into w from public.website_orders where id=p_website_order_id for update;
  if not found
     or public.normalize_website_phone(w.customer_phone)<>public.normalize_website_phone(p_phone) then
    raise exception 'الطلب غير موجود أو رقم الهاتف غير مطابق';
  end if;

  if w.status='pending' then
    delete from public.promo_redemptions where website_order_id=w.id;
    update public.website_orders
      set status='rejected',rejected_at=now(),cancelled_by_customer_at=now()
      where id=w.id;
    return true;
  end if;

  if w.status='accepted' and w.order_id is not null then
    select * into o from public.orders where id=w.order_id for update;
    if not found then raise exception 'تعذر العثور على الطلب داخل الفرع'; end if;
    if o.status<>'new' then
      raise exception 'بدأ تجهيز الطلب ولا يمكن إلغاؤه من الموقع';
    end if;

    update public.orders
      set status='cancelled'
      where id=o.id;

    delete from public.promo_redemptions where website_order_id=w.id;

    update public.website_orders
      set status='rejected',rejected_at=now(),cancelled_by_customer_at=now()
      where id=w.id;
    return true;
  end if;

  raise exception 'بدأ تجهيز الطلب ولا يمكن إلغاؤه من الموقع';
end;
$$;

revoke all on function public.cancel_website_order_customer(bigint,text) from public;
grant execute on function public.cancel_website_order_customer(bigint,text) to anon, authenticated;

notify pgrst,'reload schema';

