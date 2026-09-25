-- Sharawla POS — Permissions V2 Owner Coverage PV2-F4
-- Restaurant Delivery Drivers / Zones administration.
-- SOURCE-ONLY. Do not deploy outside the coordinated isolated-Beta authorization window.
-- Existing delivery order lifecycle/settlement owners are not changed here.
-- Production SH-0005 / SH-0006 remain untouched.

begin;

select sharawla_internal.assert_operational_profile_v1('restaurant');

insert into public.permission_actions_v2(code,name_ar,domain,legacy_permission,active,sort_order)
values
 ('delivery.drivers.manage','إدارة مناديب التوصيل','delivery','deliverySettings',true,1140),
 ('delivery.zones.manage','إدارة مناطق التوصيل','delivery','deliverySettings',true,1150)
on conflict(code) do update set
 name_ar=excluded.name_ar,
 domain=excluded.domain,
 legacy_permission=excluded.legacy_permission,
 active=true,
 sort_order=excluded.sort_order;

-- F4 closes Restaurant owner coverage only. Retail/Pharmacy delivery-settings
-- ownership remains for each Profile's dedicated closure.
insert into public.permission_action_profiles_v2(action_code,profile_code,required_feature_code,active)
values
 ('delivery.drivers.manage','restaurant','commerce.delivery',true),
 ('delivery.zones.manage','restaurant','commerce.delivery',true)
on conflict(action_code,profile_code) do update set
 required_feature_code=excluded.required_feature_code,
 active=true,
 updated_at=now();

do $$
begin
 if pg_catalog.to_regclass('public.permission_role_action_defaults_v2') is null then
   raise exception 'PV2_F4_ROLE_DEFAULTS_REQUIRED';
 end if;
 if pg_catalog.to_regclass('sharawla_internal.permission_role_migration_evidence_v1') is null then
   raise exception 'PV2_F4_MIGRATION_EVIDENCE_REQUIRED';
 end if;
end;
$$;

-- deliverySettings is not part of the accepted 58.29 default pages for
-- Cashier / Call Center / Delivery. Admin retains applicable upper-gated authority.
insert into public.permission_role_action_defaults_v2(
 profile_code,role_code,action_code,allowed,active,source,created_at,updated_at
)
select
 'restaurant',
 r.role_code,
 a.action_code,
 (r.role_code='admin'),
 true,
 'restaurant-runtime-role-pages-58.29',
 now(),
 now()
from (values ('admin'),('cashier'),('callcenter'),('delivery')) as r(role_code)
cross join (values ('delivery.drivers.manage'),('delivery.zones.manage')) as a(action_code)
on conflict(profile_code,role_code,action_code) do nothing;

-- Preserve existing non-admin deliverySettings intent. Persisted legacy page
-- rows are today's backend authority; no persisted rows means the accepted
-- 58.29 Role template does not grant deliverySettings.
insert into sharawla_internal.permission_role_migration_evidence_v1(
 migration_batch,
 employee_id,
 profile_code,
 role_code,
 action_code,
 legacy_allowed,
 role_default_allowed,
 explicit_override_before,
 preservation_override_inserted,
 captured_at
)
with employee_state as (
 select
   e.id as employee_id,
   lower(trim(coalesce(e.role,''))) as role_code,
   exists(
     select 1
     from public.employee_permissions ep
     where ep.employee_id=e.id
       and ep.permission_key='deliverySettings'
       and ep.allowed=true
   ) as old_allowed
 from public.employees e
 where e.active is distinct from false
   and lower(trim(coalesce(e.role,'')))<>'admin'
),
actions(action_code) as (
 values ('delivery.drivers.manage'),('delivery.zones.manage')
)
select
 'PV2-F4-DELIVERY-SETTINGS-58.29',
 es.employee_id,
 'restaurant',
 es.role_code,
 a.action_code,
 es.old_allowed,
 coalesce(d.allowed,false),
 (
   select eap.allowed
   from public.employee_action_permissions_v2 eap
   where eap.employee_id=es.employee_id
     and eap.action_code=a.action_code
   limit 1
 ),
 false,
 now()
from employee_state es
cross join actions a
left join public.permission_role_action_defaults_v2 d
  on d.profile_code='restaurant'
 and d.role_code=es.role_code
 and d.action_code=a.action_code
 and d.active=true
on conflict(migration_batch,employee_id,action_code) do nothing;

insert into public.employee_action_permissions_v2(employee_id,action_code,allowed,updated_at)
select
 ev.employee_id,
 ev.action_code,
 ev.legacy_allowed,
 now()
from sharawla_internal.permission_role_migration_evidence_v1 ev
where ev.migration_batch='PV2-F4-DELIVERY-SETTINGS-58.29'
  and ev.explicit_override_before is null
  and ev.legacy_allowed is distinct from ev.role_default_allowed
on conflict(employee_id,action_code) do nothing;

update sharawla_internal.permission_role_migration_evidence_v1 ev
set preservation_override_inserted=true
where ev.migration_batch='PV2-F4-DELIVERY-SETTINGS-58.29'
  and ev.explicit_override_before is null
  and ev.legacy_allowed is distinct from ev.role_default_allowed
  and exists(
    select 1
    from public.employee_action_permissions_v2 eap
    where eap.employee_id=ev.employee_id
      and eap.action_code=ev.action_code
      and eap.allowed=ev.legacy_allowed
  );

create or replace function public.delivery_driver_save_v2(
 p_driver_id bigint,
 p_branch_id bigint,
 p_name text,
 p_phone text,
 p_active boolean default true
)
returns bigint
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
 v_id bigint;
 v_existing_branch bigint;
 v_name text:=nullif(trim(coalesce(p_name,'')),'');
 v_phone text:=nullif(trim(coalesce(p_phone,'')),'');
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if not public.has_action_permission_v2('delivery.drivers.manage') then
   raise exception 'DELIVERY_DRIVERS_MANAGE_DENIED';
 end if;
 if p_branch_id is null or not public.has_branch_access(p_branch_id) then
   raise exception 'BRANCH_ACCESS_DENIED';
 end if;
 if v_name is null then raise exception 'DRIVER_NAME_REQUIRED'; end if;

 if p_driver_id is null then
   insert into public.delivery_drivers(name,phone,branch_id,active)
   values(v_name,v_phone,p_branch_id,coalesce(p_active,true))
   returning id into v_id;
 else
   select d.branch_id into v_existing_branch
   from public.delivery_drivers d
   where d.id=p_driver_id
   for update;

   if not found then raise exception 'DRIVER_NOT_FOUND'; end if;
   if v_existing_branch is distinct from p_branch_id then
     raise exception 'DRIVER_BRANCH_REASSIGN_NOT_ALLOWED';
   end if;
   if not public.has_branch_access(v_existing_branch) then
     raise exception 'BRANCH_ACCESS_DENIED';
   end if;

   update public.delivery_drivers
   set name=v_name,
       phone=v_phone,
       active=coalesce(p_active,true)
   where id=p_driver_id
   returning id into v_id;
 end if;

 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(
   public.current_employee_id(),
   p_branch_id,
   'delivery.drivers.manage',
   'delivery_driver',
   v_id,
   jsonb_build_object('name',v_name,'active',coalesce(p_active,true))
 );

 return v_id;
end;
$$;

create or replace function public.delivery_zone_save_v2(
 p_zone_id bigint,
 p_branch_id bigint,
 p_name text,
 p_delivery_fee numeric,
 p_active boolean default true
)
returns bigint
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
 v_id bigint;
 v_existing_branch bigint;
 v_name text:=nullif(trim(coalesce(p_name,'')),'');
 v_fee numeric:=round(coalesce(p_delivery_fee,0)::numeric,2);
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if not public.has_action_permission_v2('delivery.zones.manage') then
   raise exception 'DELIVERY_ZONES_MANAGE_DENIED';
 end if;
 if p_branch_id is null or not public.has_branch_access(p_branch_id) then
   raise exception 'BRANCH_ACCESS_DENIED';
 end if;
 if v_name is null then raise exception 'DELIVERY_ZONE_NAME_REQUIRED'; end if;
 if v_fee<0 then raise exception 'DELIVERY_FEE_INVALID'; end if;

 if p_zone_id is null then
   insert into public.delivery_zones(name,delivery_fee,branch_id,active)
   values(v_name,v_fee,p_branch_id,coalesce(p_active,true))
   returning id into v_id;
 else
   select z.branch_id into v_existing_branch
   from public.delivery_zones z
   where z.id=p_zone_id
   for update;

   if not found then raise exception 'DELIVERY_ZONE_NOT_FOUND'; end if;
   if v_existing_branch is distinct from p_branch_id then
     raise exception 'DELIVERY_ZONE_BRANCH_REASSIGN_NOT_ALLOWED';
   end if;
   if not public.has_branch_access(v_existing_branch) then
     raise exception 'BRANCH_ACCESS_DENIED';
   end if;

   update public.delivery_zones
   set name=v_name,
       delivery_fee=v_fee,
       active=coalesce(p_active,true)
   where id=p_zone_id
   returning id into v_id;
 end if;

 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(
   public.current_employee_id(),
   p_branch_id,
   'delivery.zones.manage',
   'delivery_zone',
   v_id,
   jsonb_build_object('name',v_name,'delivery_fee',v_fee,'active',coalesce(p_active,true))
 );

 return v_id;
end;
$$;

-- Retire the legacy direct-write authority. Read paths stay unchanged.
revoke insert,update,delete on table public.delivery_drivers from public,anon,authenticated;
revoke insert,update,delete on table public.delivery_zones from public,anon,authenticated;
grant select on table public.delivery_drivers,public.delivery_zones to authenticated;

revoke all on function public.delivery_driver_save_v2(bigint,bigint,text,text,boolean) from public,anon;
revoke all on function public.delivery_zone_save_v2(bigint,bigint,text,numeric,boolean) from public,anon;
grant execute on function public.delivery_driver_save_v2(bigint,bigint,text,text,boolean) to authenticated;
grant execute on function public.delivery_zone_save_v2(bigint,bigint,text,numeric,boolean) to authenticated;

notify pgrst, 'reload schema';

commit;
