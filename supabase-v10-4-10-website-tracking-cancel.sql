-- Top Burger Website V5.4 / POS V10.4.10
-- Phone-only website order tracking + customer cancellation until PREPARING.
-- Run once in Supabase SQL Editor AFTER the existing V5.3 + V10.4.6 website SQL.

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
