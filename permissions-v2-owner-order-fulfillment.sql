-- Sharawla POS — Permissions V2 PV2-F5A
-- Order fulfillment lifecycle owner: preparing / ready / pickup-completed.
-- SOURCE-ONLY. No deployment is authorized by this artifact.
-- Preserves Delivery completion, Website acceptance/cancellation, payment review and Offline bridge.

begin;

select sharawla_internal.assert_operational_profile_v1('restaurant');

insert into public.permission_actions_v2(code,name_ar,domain,legacy_permission,active,sort_order)
values
 ('orders.fulfillment.manage','إدارة تجهيز وتسليم الطلبات','orders','orders',true,1030)
on conflict(code) do update set
 name_ar=excluded.name_ar,
 domain=excluded.domain,
 legacy_permission=excluded.legacy_permission,
 active=true,
 sort_order=excluded.sort_order;

insert into public.permission_action_profiles_v2(action_code,profile_code,required_feature_code,active)
values ('orders.fulfillment.manage','restaurant',null,true)
on conflict(action_code,profile_code) do update set
 required_feature_code=excluded.required_feature_code,
 active=true,
 updated_at=now();

do $$
begin
 if pg_catalog.to_regclass('public.permission_role_action_defaults_v2') is null then
   raise exception 'PV2_F5A_ROLE_DEFAULTS_REQUIRED';
 end if;
end;
$$;

insert into public.permission_role_action_defaults_v2(
 profile_code,role_code,action_code,allowed,active,source,created_at,updated_at
)
select 'restaurant',r.role_code,'orders.fulfillment.manage',
       (r.role_code in ('admin','cashier','callcenter','delivery')),
       true,'restaurant-runtime-orders-page-58.29',now(),now()
from (values ('admin'),('cashier'),('callcenter'),('delivery')) as r(role_code)
on conflict(profile_code,role_code,action_code) do nothing;

-- Preserve current persisted Orders-page intent where it differs from the new default.
with current_intent as (
 select e.id employee_id,
        lower(trim(coalesce(e.role,''))) role_code,
        case
          when exists(select 1 from public.employee_permissions ep0 where ep0.employee_id=e.id)
            then exists(select 1 from public.employee_permissions ep where ep.employee_id=e.id and ep.permission_key='orders' and ep.allowed=true)
          else lower(trim(coalesce(e.role,''))) in ('cashier','callcenter','delivery')
        end old_allowed
 from public.employees e
 where e.active is distinct from false
   and lower(trim(coalesce(e.role,'')))<>'admin'
)
insert into public.employee_action_permissions_v2(employee_id,action_code,allowed,updated_at)
select ci.employee_id,'orders.fulfillment.manage',ci.old_allowed,now()
from current_intent ci
left join public.permission_role_action_defaults_v2 d
  on d.profile_code='restaurant'
 and d.role_code=ci.role_code
 and d.action_code='orders.fulfillment.manage'
 and d.active=true
where coalesce(d.allowed,false) is distinct from ci.old_allowed
  and not exists(
    select 1 from public.employee_action_permissions_v2 eap
    where eap.employee_id=ci.employee_id
      and eap.action_code='orders.fulfillment.manage'
  )
on conflict(employee_id,action_code) do nothing;

create or replace function public.order_fulfillment_transition_v2(
 p_order_id bigint,
 p_target_status text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
 v_emp bigint;
 v_order public.orders%rowtype;
 v_target text:=lower(trim(coalesce(p_target_status,'')));
 v_from text;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if not public.has_action_permission_v2('orders.fulfillment.manage') then
   raise exception 'ORDERS_FULFILLMENT_DENIED';
 end if;

 select * into v_order from public.orders where id=p_order_id for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if not public.has_branch_access(v_order.branch_id) then raise exception 'BRANCH_ACCESS_DENIED'; end if;

 v_from:=lower(coalesce(v_order.status,''));

 if v_target='preparing' then
   if v_from<>'new' then raise exception 'INVALID_ORDER_TRANSITION'; end if;
 elsif v_target='ready' then
   if v_from<>'preparing' then raise exception 'INVALID_ORDER_TRANSITION'; end if;
 elsif v_target='completed' then
   if v_from<>'ready' then raise exception 'INVALID_ORDER_TRANSITION'; end if;
   -- F5A completed is intentionally pickup/non-delivery only.
   -- Delivery completion remains owned by delivery_mark_delivered_v2.
   if lower(coalesce(v_order.order_type,''))='delivery' then
     raise exception 'DELIVERY_COMPLETION_REQUIRES_DELIVERY_OWNER';
   end if;
 else
   raise exception 'FULFILLMENT_TARGET_NOT_ALLOWED';
 end if;

 update public.orders
 set status=v_target,
     delivered_at=case when v_target='completed' then coalesce(delivered_at,now()) else delivered_at end
 where id=v_order.id
 returning * into v_order;

 v_emp:=public.current_employee_id();
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details,created_at)
 values(v_emp,v_order.branch_id,'orders.fulfillment.manage','order',v_order.id,
        jsonb_build_object('from_status',v_from,'to_status',v_target),now());

 return jsonb_build_object('ok',true,'order',to_jsonb(v_order));
end;
$$;

revoke all on function public.order_fulfillment_transition_v2(bigint,text) from public,anon;
grant execute on function public.order_fulfillment_transition_v2(bigint,text) to authenticated;

-- IMPORTANT: F5A deliberately does NOT revoke UPDATE on public.orders.
-- F5E owns final table privilege closure only after Driver Assignment,
-- Delivery completion/offline compatibility, and Website Payment Review are closed.

notify pgrst,'reload schema';
commit;
