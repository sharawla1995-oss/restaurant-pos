-- Top Burger POS / Website V10.4.6 final integration patch
-- Run AFTER the existing promo-code and website-order SQL migrations.
-- 1) Keep website pickup distinct from takeaway (handled by V5.3 accept_website_order).
-- 2) Release a promo redemption when a still-pending website order is rejected/cancelled.

create or replace function public.reject_website_order(p_website_order_id bigint)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare w public.website_orders%rowtype;
begin
  select * into w from public.website_orders where id=p_website_order_id for update;
  if not found then raise exception 'طلب الموقع غير موجود'; end if;
  if not public.has_branch_access(w.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if w.status<>'pending' then raise exception 'تم التعامل مع الطلب بالفعل'; end if;
  delete from public.promo_redemptions where website_order_id=w.id and order_id is null;
  update public.website_orders set status='rejected',rejected_at=now() where id=w.id;
  return true;
end;
$$;
revoke all on function public.reject_website_order(bigint) from public;
grant execute on function public.reject_website_order(bigint) to authenticated;

create or replace function public.cancel_website_order_customer(p_website_order_id bigint,p_phone text)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare w public.website_orders%rowtype;
declare s public.website_settings%rowtype;
begin
  select * into s from public.website_settings where id=1;
  if found and (s.allow_customer_cancel=false or s.show_cancel_order=false) then raise exception 'إلغاء الطلب غير متاح حاليًا'; end if;
  select * into w from public.website_orders where id=p_website_order_id for update;
  if not found or regexp_replace(w.customer_phone,'\D','','g')<>regexp_replace(p_phone,'\D','','g') then raise exception 'الطلب غير موجود أو رقم الهاتف غير مطابق'; end if;
  if w.status<>'pending' then raise exception 'بعد استلام الفرع للطلب، تواصل مع الفرع للإلغاء'; end if;
  delete from public.promo_redemptions where website_order_id=w.id and order_id is null;
  update public.website_orders set status='rejected',rejected_at=now(),cancelled_by_customer_at=now() where id=w.id;
  return true;
end;
$$;
revoke all on function public.cancel_website_order_customer(bigint,text) from public;
grant execute on function public.cancel_website_order_customer(bigint,text) to anon,authenticated;

notify pgrst,'reload schema';
