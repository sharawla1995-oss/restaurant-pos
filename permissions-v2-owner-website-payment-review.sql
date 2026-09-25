-- Sharawla POS — Permissions V2 PV2-F5D
-- Website order payment review hardening.
-- SOURCE-ONLY. No database deployment is authorized by this artifact.

begin;
select sharawla_internal.assert_operational_profile_v1('restaurant');

insert into public.permission_actions_v2(code,name_ar,domain,legacy_permission,active,sort_order)
values ('orders.payment.review','مراجعة دفع طلبات الموقع','orders','orders',true,1050)
on conflict(code) do update set
 name_ar=excluded.name_ar,domain=excluded.domain,legacy_permission=excluded.legacy_permission,
 active=true,sort_order=excluded.sort_order;

insert into public.permission_action_profiles_v2(action_code,profile_code,required_feature_code,active)
values ('orders.payment.review','restaurant',null,true)
on conflict(action_code,profile_code) do update set
 required_feature_code=excluded.required_feature_code,active=true,updated_at=now();

do $$
begin
 if pg_catalog.to_regclass('public.permission_role_action_defaults_v2') is null then
   raise exception 'PV2_F5D_ROLE_DEFAULTS_REQUIRED';
 end if;
end;
$$;

insert into public.permission_role_action_defaults_v2(
 profile_code,role_code,action_code,allowed,active,source,created_at,updated_at
)
select 'restaurant',r.role_code,'orders.payment.review',
       (r.role_code in ('admin','cashier','callcenter')),
       true,'restaurant-runtime-website-payment-review-58.29',now(),now()
from (values ('admin'),('cashier'),('callcenter'),('delivery')) as r(role_code)
on conflict(profile_code,role_code,action_code) do nothing;

-- Preserve current Orders permission intent for existing non-admin employees.
with current_intent as (
 select e.id employee_id,lower(trim(coalesce(e.role,''))) role_code,
        case when exists(select 1 from public.employee_permissions ep0 where ep0.employee_id=e.id)
             then exists(select 1 from public.employee_permissions ep where ep.employee_id=e.id and ep.permission_key='orders' and ep.allowed=true)
             else lower(trim(coalesce(e.role,''))) in ('cashier','callcenter') end old_allowed
 from public.employees e
 where e.active is distinct from false and lower(trim(coalesce(e.role,'')))<>'admin'
)
insert into public.employee_action_permissions_v2(employee_id,action_code,allowed,updated_at)
select ci.employee_id,'orders.payment.review',ci.old_allowed,now()
from current_intent ci
left join public.permission_role_action_defaults_v2 d
 on d.profile_code='restaurant' and d.role_code=ci.role_code
 and d.action_code='orders.payment.review' and d.active=true
where coalesce(d.allowed,false) is distinct from ci.old_allowed
 and not exists(select 1 from public.employee_action_permissions_v2 eap
  where eap.employee_id=ci.employee_id and eap.action_code='orders.payment.review')
on conflict(employee_id,action_code) do nothing;

-- Preserve the accepted historical owner signature and semantics; add explicit Action authorization.
create or replace function public.review_order_payment(p_order_id bigint,p_status text)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare o public.orders%rowtype;
declare v_emp bigint;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.has_action_permission_v2('orders.payment.review') then
    raise exception 'ORDER_PAYMENT_REVIEW_DENIED';
  end if;
  if p_status not in ('unpaid','proof_submitted','confirmed','rejected') then raise exception 'حالة دفع غير صحيحة'; end if;
  v_emp:=public.current_employee_id();
  select * into o from public.orders where id=p_order_id for update;
  if not found then raise exception 'الطلب غير موجود'; end if;
  if not public.has_branch_access(o.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  update public.orders set payment_status=p_status where id=o.id;
  if o.website_order_id is not null then
    update public.website_orders set payment_status=p_status,payment_reviewed_at=now(),payment_reviewed_by=v_emp where id=o.website_order_id;
  end if;
  return true;
end;
$$;
revoke all on function public.review_order_payment(bigint,text) from public,anon;
grant execute on function public.review_order_payment(bigint,text) to authenticated;

-- F5D does not perform the F5E global orders privilege closure.
notify pgrst,'reload schema';
commit;
