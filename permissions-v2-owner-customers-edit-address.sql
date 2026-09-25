-- Sharawla POS — Permissions V2 Owner Coverage PV2-F2
-- Customers Edit + Customer Address Management.
-- SOURCE-ONLY. Do not deploy outside the coordinated isolated-Beta authorization window.
-- Production SH-0005 / SH-0006 remain untouched.

begin;

select sharawla_internal.assert_operational_profile_v1('restaurant');

insert into public.permission_actions_v2(code,name_ar,domain,legacy_permission,active,sort_order)
values
 ('customers.edit','تعديل بيانات العميل','customers','customers',true,1010),
 ('customers.address.manage','إدارة عناوين العميل','customers','customers',true,1020)
on conflict(code) do update set
 name_ar=excluded.name_ar,
 domain=excluded.domain,
 legacy_permission=excluded.legacy_permission,
 active=true,
 sort_order=excluded.sort_order;

insert into public.permission_action_profiles_v2(action_code,profile_code,required_feature_code,active)
select a.code,p.profile_code,'core.customers',true
from (values ('customers.edit'),('customers.address.manage')) as a(code)
cross join (
 values ('restaurant'),('retail'),('pharmacy'),('logistics'),('membership'),('warehouse'),('service')
) as p(profile_code)
on conflict(action_code,profile_code) do update set
 required_feature_code=excluded.required_feature_code,
 active=true,
 updated_at=now();

-- PV2-E already owns the Role-default schema. F2 adds defaults for its new Actions.
do $$
begin
 if pg_catalog.to_regclass('public.permission_role_action_defaults_v2') is null then
   raise exception 'PV2_F2_ROLE_DEFAULTS_REQUIRED';
 end if;
end;
$$;

insert into public.permission_role_action_defaults_v2(
 profile_code,role_code,action_code,allowed,active,source,created_at,updated_at
)
select
 'restaurant',
 r.role_code,
 a.action_code,
 case when r.role_code in ('admin','cashier','callcenter','delivery') then true else false end,
 true,
 'restaurant-runtime-customers-page-58.29',
 now(),
 now()
from (values ('admin'),('cashier'),('callcenter'),('delivery')) as r(role_code)
cross join (values ('customers.edit'),('customers.address.manage')) as a(action_code)
on conflict(profile_code,role_code,action_code) do nothing;

-- Preserve the current renderer's Customers-page intent for active non-admin employees.
-- If persisted page permissions exist, they are authoritative today; otherwise the
-- accepted Restaurant role template grants Customers to cashier/callcenter/delivery.
with current_intent as (
 select
   e.id as employee_id,
   lower(trim(coalesce(e.role,''))) as role_code,
   case
     when exists(select 1 from public.employee_permissions ep0 where ep0.employee_id=e.id)
       then exists(
         select 1 from public.employee_permissions ep
         where ep.employee_id=e.id
           and ep.permission_key='customers'
           and ep.allowed=true
       )
     else lower(trim(coalesce(e.role,''))) in ('cashier','callcenter','delivery')
   end as old_customers_page_allowed
 from public.employees e
 where e.active is distinct from false
   and lower(trim(coalesce(e.role,'')))<>'admin'
),
new_actions(action_code) as (
 values ('customers.edit'),('customers.address.manage')
)
insert into public.employee_action_permissions_v2(employee_id,action_code,allowed,updated_at)
select
 ci.employee_id,
 na.action_code,
 ci.old_customers_page_allowed,
 now()
from current_intent ci
cross join new_actions na
left join public.permission_role_action_defaults_v2 d
  on d.profile_code='restaurant'
 and d.role_code=ci.role_code
 and d.action_code=na.action_code
 and d.active=true
where coalesce(d.allowed,false) is distinct from ci.old_customers_page_allowed
  and not exists(
    select 1
    from public.employee_action_permissions_v2 eap
    where eap.employee_id=ci.employee_id
      and eap.action_code=na.action_code
  )
on conflict(employee_id,action_code) do nothing;

create or replace function public.customer_update_v2(
 p_customer_id bigint,
 p_name text,
 p_phone text,
 p_area text default null,
 p_address text default null,
 p_notes text default null
)
returns bigint
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
 v_employee bigint;
 v_branch bigint;
 v_name text:=nullif(trim(coalesce(p_name,'')),'');
 v_phone text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
 v_area text:=nullif(trim(coalesce(p_area,'')),'');
 v_address text:=nullif(trim(coalesce(p_address,'')),'');
 v_notes text:=nullif(trim(coalesce(p_notes,'')),'');
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if not public.has_action_permission_v2('customers.edit') then
   raise exception 'CUSTOMERS_EDIT_DENIED';
 end if;
 if p_customer_id is null or not exists(select 1 from public.customers c where c.id=p_customer_id) then
   raise exception 'CUSTOMER_NOT_FOUND';
 end if;
 if v_name is null then raise exception 'CUSTOMER_NAME_REQUIRED'; end if;
 if v_phone='' then v_phone:=null; end if;
 if v_phone is not null and v_phone !~ '^01[0125][0-9]{8}$' then
   raise exception 'CUSTOMER_PHONE_INVALID';
 end if;
 if v_phone is not null and exists(
   select 1
   from public.customers c
   where c.id<>p_customer_id
     and regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')=v_phone
 ) then
   raise exception 'CUSTOMER_PHONE_DUPLICATE';
 end if;

 update public.customers
 set name=v_name,
     phone=v_phone,
     area=v_area,
     address=v_address,
     notes=v_notes,
     updated_at=now()
 where id=p_customer_id;

 v_employee:=public.current_employee_id();
 select e.branch_id into v_branch from public.employees e where e.id=v_employee;

 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details,created_at)
 values(v_employee,v_branch,'customers.edit','customer',p_customer_id,
        jsonb_build_object('name',v_name,'phone',v_phone,'area',v_area),now());

 return p_customer_id;
end;
$$;

create or replace function public.customer_address_save_v2(
 p_address_id bigint,
 p_customer_id bigint,
 p_label text,
 p_area text,
 p_address text,
 p_notes text default null,
 p_is_default boolean default false
)
returns bigint
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
 v_employee bigint;
 v_branch bigint;
 v_id bigint;
 v_label text:=nullif(trim(coalesce(p_label,'')),'');
 v_area text:=nullif(trim(coalesce(p_area,'')),'');
 v_address text:=nullif(trim(coalesce(p_address,'')),'');
 v_notes text:=nullif(trim(coalesce(p_notes,'')),'');
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if not public.has_action_permission_v2('customers.address.manage') then
   raise exception 'CUSTOMER_ADDRESS_MANAGE_DENIED';
 end if;
 if p_customer_id is null or not exists(select 1 from public.customers c where c.id=p_customer_id) then
   raise exception 'CUSTOMER_NOT_FOUND';
 end if;
 if v_address is null then raise exception 'CUSTOMER_ADDRESS_REQUIRED'; end if;

 if coalesce(p_is_default,false) then
   update public.customer_addresses
   set is_default=false
   where customer_id=p_customer_id
     and (p_address_id is null or id<>p_address_id)
     and is_default=true;
 end if;

 if p_address_id is null then
   insert into public.customer_addresses(customer_id,label,address,area,notes,is_default)
   values(p_customer_id,v_label,v_address,v_area,v_notes,coalesce(p_is_default,false))
   returning id into v_id;
 else
   if not exists(
     select 1 from public.customer_addresses ca
     where ca.id=p_address_id and ca.customer_id=p_customer_id
   ) then
     raise exception 'CUSTOMER_ADDRESS_NOT_FOUND';
   end if;

   update public.customer_addresses
   set label=v_label,
       area=v_area,
       address=v_address,
       notes=v_notes,
       is_default=coalesce(p_is_default,false)
   where id=p_address_id
     and customer_id=p_customer_id;

   v_id:=p_address_id;
 end if;

 v_employee:=public.current_employee_id();
 select e.branch_id into v_branch from public.employees e where e.id=v_employee;

 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details,created_at)
 values(v_employee,v_branch,'customers.address.manage','customer_address',v_id,
        jsonb_build_object('customer_id',p_customer_id,'is_default',coalesce(p_is_default,false)),now());

 return v_id;
end;
$$;

create or replace function public.customer_address_delete_v2(p_address_id bigint)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
 v_employee bigint;
 v_branch bigint;
 v_customer bigint;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if not public.has_action_permission_v2('customers.address.manage') then
   raise exception 'CUSTOMER_ADDRESS_MANAGE_DENIED';
 end if;

 select ca.customer_id into v_customer
 from public.customer_addresses ca
 where ca.id=p_address_id;

 if v_customer is null then raise exception 'CUSTOMER_ADDRESS_NOT_FOUND'; end if;

 delete from public.customer_addresses where id=p_address_id;

 v_employee:=public.current_employee_id();
 select e.branch_id into v_branch from public.employees e where e.id=v_employee;

 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details,created_at)
 values(v_employee,v_branch,'customers.address.manage','customer_address',p_address_id,
        jsonb_build_object('customer_id',v_customer,'operation','delete'),now());

 return true;
end;
$$;

-- Remove direct authenticated bypasses. Reads stay available.
drop policy if exists customers_staff_update on public.customers;
revoke update on table public.customers from public,anon,authenticated;
grant select on table public.customers to authenticated;

drop policy if exists customer_addresses_staff_write on public.customer_addresses;
revoke insert,update,delete on table public.customer_addresses from public,anon,authenticated;
grant select on table public.customer_addresses to authenticated;

revoke all on function public.customer_update_v2(bigint,text,text,text,text,text) from public,anon;
revoke all on function public.customer_address_save_v2(bigint,bigint,text,text,text,text,boolean) from public,anon;
revoke all on function public.customer_address_delete_v2(bigint) from public,anon;

grant execute on function public.customer_update_v2(bigint,text,text,text,text,text) to authenticated;
grant execute on function public.customer_address_save_v2(bigint,bigint,text,text,text,text,boolean) to authenticated;
grant execute on function public.customer_address_delete_v2(bigint) to authenticated;

notify pgrst, 'reload schema';

commit;
