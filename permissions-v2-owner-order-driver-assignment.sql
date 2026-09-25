-- Sharawla POS — Permissions V2 PV2-F5B
-- Driver assignment owner: ready delivery order -> out_for_delivery.
-- SOURCE-ONLY. No deployment is authorized by this artifact.

begin;
select sharawla_internal.assert_operational_profile_v1('restaurant');

insert into public.permission_actions_v2(code,name_ar,domain,legacy_permission,active,sort_order)
values ('orders.delivery.assign_driver','تسليم طلب الدليفري لمندوب','delivery','orders',true,1040)
on conflict(code) do update set
 name_ar=excluded.name_ar,domain=excluded.domain,legacy_permission=excluded.legacy_permission,
 active=true,sort_order=excluded.sort_order;

insert into public.permission_action_profiles_v2(action_code,profile_code,required_feature_code,active)
values ('orders.delivery.assign_driver','restaurant',null,true)
on conflict(action_code,profile_code) do update set
 required_feature_code=excluded.required_feature_code,active=true,updated_at=now();

do $$
begin
 if pg_catalog.to_regclass('public.permission_role_action_defaults_v2') is null then
   raise exception 'PV2_F5B_ROLE_DEFAULTS_REQUIRED';
 end if;
end;
$$;

insert into public.permission_role_action_defaults_v2(
 profile_code,role_code,action_code,allowed,active,source,created_at,updated_at
)
select 'restaurant',r.role_code,'orders.delivery.assign_driver',
       (r.role_code in ('admin','cashier','callcenter')),
       true,'restaurant-runtime-delivery-assignment-58.29',now(),now()
from (values ('admin'),('cashier'),('callcenter'),('delivery')) as r(role_code)
on conflict(profile_code,role_code,action_code) do nothing;

-- Preserve the current Orders-page intent for non-admin staff where it differs.
with current_intent as (
 select e.id employee_id, lower(trim(coalesce(e.role,''))) role_code,
        case
          when exists(select 1 from public.employee_permissions ep0 where ep0.employee_id=e.id)
            then exists(select 1 from public.employee_permissions ep where ep.employee_id=e.id and ep.permission_key='orders' and ep.allowed=true)
          else lower(trim(coalesce(e.role,''))) in ('cashier','callcenter')
        end old_allowed
 from public.employees e
 where e.active is distinct from false and lower(trim(coalesce(e.role,'')))<>'admin'
)
insert into public.employee_action_permissions_v2(employee_id,action_code,allowed,updated_at)
select ci.employee_id,'orders.delivery.assign_driver',ci.old_allowed,now()
from current_intent ci
left join public.permission_role_action_defaults_v2 d
 on d.profile_code='restaurant' and d.role_code=ci.role_code
 and d.action_code='orders.delivery.assign_driver' and d.active=true
where coalesce(d.allowed,false) is distinct from ci.old_allowed
 and not exists(select 1 from public.employee_action_permissions_v2 eap
                where eap.employee_id=ci.employee_id and eap.action_code='orders.delivery.assign_driver')
on conflict(employee_id,action_code) do nothing;

create or replace function public.order_assign_driver_v2(p_order_id bigint,p_driver_id bigint)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
 v_emp bigint;
 v_order public.orders%rowtype;
 v_driver public.delivery_drivers%rowtype;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if not public.has_action_permission_v2('orders.delivery.assign_driver') then
   raise exception 'ORDER_ASSIGN_DRIVER_DENIED';
 end if;

 select * into v_order from public.orders where id=p_order_id for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if not public.has_branch_access(v_order.branch_id) then raise exception 'BRANCH_ACCESS_DENIED'; end if;
 if lower(coalesce(v_order.order_type,''))<>'delivery' then raise exception 'ORDER_NOT_DELIVERY'; end if;
 if lower(coalesce(v_order.status,''))<>'ready' then raise exception 'ORDER_NOT_READY'; end if;

 select * into v_driver from public.delivery_drivers where id=p_driver_id;
 if not found or v_driver.active is distinct from true then raise exception 'DELIVERY_DRIVER_NOT_ACTIVE'; end if;
 if v_driver.branch_id is distinct from v_order.branch_id then raise exception 'DELIVERY_DRIVER_BRANCH_MISMATCH'; end if;

 update public.orders
 set driver_id=v_driver.id,status='out_for_delivery',assigned_at=now()
 where id=v_order.id
 returning * into v_order;

 v_emp:=public.current_employee_id();
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details,created_at)
 values(v_emp,v_order.branch_id,'orders.delivery.assign_driver','order',v_order.id,
        jsonb_build_object('driver_id',v_driver.id,'to_status','out_for_delivery'),now());

 return jsonb_build_object('ok',true,'order',to_jsonb(v_order));
end;
$$;

revoke all on function public.order_assign_driver_v2(bigint,bigint) from public,anon;
grant execute on function public.order_assign_driver_v2(bigint,bigint) to authenticated;

-- F5B deliberately does NOT revoke UPDATE on public.orders.
-- Final table privilege closure remains owned by F5E after all mutation families are closed.
notify pgrst,'reload schema';
commit;
