-- Sharawla POS — Phase B tenant-safe reset_pos_data_v7
-- Generated from the CURRENT LIVE Beta body. This file defines the function only.
-- DO NOT execute a reset as part of migration deployment.

begin;
CREATE OR REPLACE FUNCTION public.reset_pos_data_v7(p_branch_id bigint, p_groups text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_business_id uuid;
  v_employee_id bigint;
  v_role text;
  v_auth_uid uuid:=auth.uid();
  v_jwt_claims text:=current_setting('request.jwt.claims',true);
  v_allowed text[]:=array['orders','shifts','expenses','customers','delivery','catalog','promos','permissions','settings','audit'];
  v_unknown text[];
  v_result jsonb:='{}'::jsonb;
  v_count bigint;
  v_preserved_customers bigint:=0;
begin
  v_business_id:=public.current_business_id();
  if v_business_id is null then
    raise exception 'MULTITENANT_CONTEXT_REQUIRED' using errcode='42501';
  end if;

  select e.id,e.role into v_employee_id,v_role
  from public.employees e
  where e.auth_user_id=v_auth_uid and e.business_id=v_business_id and e.active=true
  limit 1;

  if v_employee_id is null or v_role is distinct from 'admin' then
    raise exception 'RESET_V7_ADMIN_ONLY';
  end if;
  if p_branch_id is null or not exists(select 1 from public.branches b where b.id=p_branch_id and b.business_id=v_business_id) then
    raise exception 'RESET_V7_INVALID_BRANCH';
  end if;
  if not exists(
    select 1 from public.employee_branches eb
    where eb.employee_id=v_employee_id and eb.branch_id=p_branch_id and eb.business_id=v_business_id
  ) and not exists(
    select 1 from public.employees e
    where e.id=v_employee_id and e.branch_id=p_branch_id and e.business_id=v_business_id
  ) then
    raise exception 'RESET_V7_BRANCH_ACCESS_DENIED';
  end if;
  if p_groups is null or coalesce(array_length(p_groups,1),0)=0 then
    raise exception 'RESET_V7_NO_GROUPS';
  end if;

  select array_agg(distinct g) into v_unknown
  from unnest(p_groups) g
  where not (g=any(v_allowed));
  if coalesce(array_length(v_unknown,1),0)>0 then
    raise exception 'RESET_V7_UNSUPPORTED_GROUPS: %',array_to_string(v_unknown,',');
  end if;

  -- Capture roots once. Children are always selected by these IDs, never globally.
  create temp table _reset_v7_orders(id bigint primary key) on commit drop;
  insert into _reset_v7_orders select id from public.orders where business_id=v_business_id and branch_id=p_branch_id;

  create temp table _reset_v7_returns(id bigint primary key) on commit drop;
  insert into _reset_v7_returns
  select r.id from public.returns r
  where r.business_id=v_business_id and (r.branch_id=p_branch_id or r.order_id in(select id from _reset_v7_orders));

  create temp table _reset_v7_weborders(id bigint primary key) on commit drop;
  insert into _reset_v7_weborders select id from public.website_orders where business_id=v_business_id and branch_id=p_branch_id;

  create temp table _reset_v7_shifts(id bigint primary key) on commit drop;
  insert into _reset_v7_shifts select id from public.shifts where business_id=v_business_id and branch_id=p_branch_id;

  if 'orders'=any(p_groups) then
    delete from public.delivery_payment_events where branch_id=p_branch_id or order_id in(select id from _reset_v7_orders);
    delete from public.restaurant_table_session_orders where order_id in(select id from _reset_v7_orders);
    delete from public.driver_settlement_items
      where order_id in(select id from _reset_v7_orders)
         or settlement_id in(select id from public.driver_settlements where branch_id=p_branch_id);
    delete from public.driver_settlements where branch_id=p_branch_id;

    delete from public.return_payments where return_id in(select id from _reset_v7_returns);
    delete from public.return_items where return_id in(select id from _reset_v7_returns);
    delete from public.returns where id in(select id from _reset_v7_returns);

    delete from public.promo_redemptions
      where branch_id=p_branch_id
         or order_id in(select id from _reset_v7_orders)
         or website_order_id in(select id from _reset_v7_weborders);

    delete from public.website_order_item_modifiers
      where website_order_item_id in(
        select wi.id from public.website_order_items wi where wi.website_order_id in(select id from _reset_v7_weborders)
      );
    delete from public.website_order_items where website_order_id in(select id from _reset_v7_weborders);
    delete from public.website_orders where id in(select id from _reset_v7_weborders);

    delete from public.order_item_modifiers
      where order_item_id in(select oi.id from public.order_items oi where oi.order_id in(select id from _reset_v7_orders));
    delete from public.order_payments where order_id in(select id from _reset_v7_orders);
    delete from public.order_items where order_id in(select id from _reset_v7_orders);
    delete from public.orders where id in(select id from _reset_v7_orders);

    update public.branch_invoice_counters set next_number=1 where branch_id=p_branch_id;
    update public.branch_return_counters set next_number=1 where branch_id=p_branch_id;
    delete from public.shift_bon_counters where branch_id=p_branch_id;

    if exists(select 1 from public.orders where business_id=v_business_id and branch_id=p_branch_id)
       or exists(select 1 from public.returns where business_id=v_business_id and branch_id=p_branch_id)
       or exists(select 1 from public.website_orders where business_id=v_business_id and branch_id=p_branch_id) then
      raise exception 'RESET_V7_VERIFY_ORDERS_FAILED';
    end if;
    v_result:=v_result||jsonb_build_object('orders',jsonb_build_object('scope','branch','branch_id',p_branch_id));
  end if;

  if 'expenses'=any(p_groups) then
    perform set_config('request.jwt.claim.sub','',true);
    perform set_config('request.jwt.claims','{}',true);
    delete from public.expenses where branch_id=p_branch_id;
    perform set_config('request.jwt.claim.sub',v_auth_uid::text,true);
    perform set_config('request.jwt.claims',coalesce(v_jwt_claims,'{}'),true);
    if exists(select 1 from public.expenses where business_id=v_business_id and branch_id=p_branch_id) then
      raise exception 'RESET_V7_VERIFY_EXPENSES_FAILED';
    end if;
    v_result:=v_result||jsonb_build_object('expenses',jsonb_build_object('scope','branch','branch_id',p_branch_id));
  end if;

  if 'shifts'=any(p_groups) then
    update public.orders set shift_id=null
      where branch_id=p_branch_id and shift_id in(select id from _reset_v7_shifts);
    update public.returns set shift_id=null
      where branch_id=p_branch_id and shift_id in(select id from _reset_v7_shifts);
    update public.driver_settlement_items set source_shift_id=null
      where source_shift_id in(select id from _reset_v7_shifts);
    update public.driver_settlements set receiving_shift_id=null
      where branch_id=p_branch_id and receiving_shift_id in(select id from _reset_v7_shifts);
    update public.food_waste_events set shift_id=null where shift_id in(select id from _reset_v7_shifts);
    update public.treasury_movements set shift_id=null where shift_id in(select id from _reset_v7_shifts);
    update public.expenses set shift_id=null
      where branch_id=p_branch_id and shift_id in(select id from _reset_v7_shifts);
    delete from public.shift_bon_counters where branch_id=p_branch_id;

    perform set_config('request.jwt.claim.sub','',true);
    perform set_config('request.jwt.claims','{}',true);
    delete from public.shifts where id in(select id from _reset_v7_shifts);
    perform set_config('request.jwt.claim.sub',v_auth_uid::text,true);
    perform set_config('request.jwt.claims',coalesce(v_jwt_claims,'{}'),true);
    if exists(select 1 from public.shifts where business_id=v_business_id and branch_id=p_branch_id) then
      raise exception 'RESET_V7_VERIFY_SHIFTS_FAILED';
    end if;
    v_result:=v_result||jsonb_build_object('shifts',jsonb_build_object('scope','branch','branch_id',p_branch_id));
  end if;

  -- Customers are global within the selected business only.
  if 'customers'=any(p_groups) then
    update public.orders
    set customer_id=null
    where business_id=v_business_id and customer_id is not null;

    delete from public.customer_addresses
    where business_id=v_business_id;

    with protected(id) as (
      select customer_id from public.offline_v2_customer_merge_receipts where business_id=v_business_id
      union select customer_id from public.finance_collections where business_id=v_business_id
      union select customer_id from public.finance_receivables where business_id=v_business_id
      union select customer_id from public.service_appointments_v1 where business_id=v_business_id
      union select customer_id from public.service_customer_packages_v1 where business_id=v_business_id
      union select customer_id from public.service_jobs_v1 where business_id=v_business_id
      union select customer_id from public.service_warranties_v1 where business_id=v_business_id
      union select customer_id from public.commerce_trade_in_items_v1 where business_id=v_business_id
      union select customer_id from public.healthcare_encounters_v1 where business_id=v_business_id
      union select customer_id from public.healthcare_patient_policies_v1 where business_id=v_business_id
      union select client_customer_id from public.logistics_client_settlements_v1 where business_id=v_business_id
      union select client_customer_id from public.logistics_pickup_requests_v1 where business_id=v_business_id
      union select client_customer_id from public.logistics_shipments_v1 where business_id=v_business_id
    )
    delete from public.customers c
    where c.business_id=v_business_id
      and not exists(select 1 from protected p where p.id=c.id);

    select count(*) into v_preserved_customers
    from public.customers
    where business_id=v_business_id;

    v_result:=v_result||jsonb_build_object(
      'customers',
      jsonb_build_object(
        'scope','business',
        'business_id',v_business_id,
        'preserved_by_history',v_preserved_customers
      )
    );
  end if;

  if 'delivery'=any(p_groups) then
    update public.orders set driver_id=null,delivery_zone_id=null
      where branch_id=p_branch_id and (driver_id is not null or delivery_zone_id is not null);
    update public.website_orders set delivery_zone_id=null
      where branch_id=p_branch_id and delivery_zone_id is not null;
    update public.retail_website_orders set delivery_zone_id=null
      where branch_id=p_branch_id and delivery_zone_id is not null;
    delete from public.delivery_payment_events where branch_id=p_branch_id;
    delete from public.driver_settlement_items
      where settlement_id in(select id from public.driver_settlements where branch_id=p_branch_id);
    delete from public.driver_settlements where branch_id=p_branch_id;
    delete from public.delivery_drivers where branch_id=p_branch_id;
    delete from public.delivery_zones where branch_id=p_branch_id;
    if exists(select 1 from public.delivery_drivers where business_id=v_business_id and branch_id=p_branch_id)
       or exists(select 1 from public.delivery_zones where business_id=v_business_id and branch_id=p_branch_id) then
      raise exception 'RESET_V7_VERIFY_DELIVERY_FAILED';
    end if;
    v_result:=v_result||jsonb_build_object('delivery',jsonb_build_object('scope','branch','branch_id',p_branch_id));
  end if;

  -- Master catalog is business-global. A branch reset removes only that branch's mapping.
  if 'catalog'=any(p_groups) then
    delete from public.branch_products where branch_id=p_branch_id;
    if exists(select 1 from public.branch_products where business_id=v_business_id and branch_id=p_branch_id) then
      raise exception 'RESET_V7_VERIFY_CATALOG_FAILED';
    end if;
    v_result:=v_result||jsonb_build_object('catalog',jsonb_build_object('scope','branch_mapping','branch_id',p_branch_id));
  end if;

  -- Promo masters are business-global; remove branch assignment/history only.
  if 'promos'=any(p_groups) then
    delete from public.promo_redemptions where branch_id=p_branch_id;
    delete from public.promo_code_branches where branch_id=p_branch_id;
    if exists(select 1 from public.promo_code_branches where business_id=v_business_id and branch_id=p_branch_id) then
      raise exception 'RESET_V7_VERIFY_PROMOS_FAILED';
    end if;
    v_result:=v_result||jsonb_build_object('promos',jsonb_build_object('scope','branch_mapping','branch_id',p_branch_id));
  end if;

  -- Employee permissions are employee-global; branch reset removes only employee-branch mappings.
  if 'permissions'=any(p_groups) then
    delete from public.employee_branches eb
    where eb.branch_id=p_branch_id
      and exists(select 1 from public.employees e where e.id=eb.employee_id and e.role<>'admin');
    v_result:=v_result||jsonb_build_object('permissions',jsonb_build_object('scope','branch_mapping','branch_id',p_branch_id,'employee_permissions_preserved',true));
  end if;

  -- Global app/business/payment masters are preserved; reset only branch-owned settings.
  if 'settings'=any(p_groups) then
    delete from public.branch_payment_methods where branch_id=p_branch_id;
    delete from public.branch_financial_settings where branch_id=p_branch_id;
    delete from public.branch_print_settings where branch_id=p_branch_id;
    delete from public.branch_website_settings where branch_id=p_branch_id;
    v_result:=v_result||jsonb_build_object('settings',jsonb_build_object('scope','branch','branch_id',p_branch_id,'global_settings_preserved',true));
  end if;

  if 'audit'=any(p_groups) then
    delete from public.audit_logs where branch_id=p_branch_id;
    if exists(select 1 from public.audit_logs where business_id=v_business_id and branch_id=p_branch_id) then
      raise exception 'RESET_V7_VERIFY_AUDIT_FAILED';
    end if;
    v_result:=v_result||jsonb_build_object('audit',jsonb_build_object('scope','branch','branch_id',p_branch_id));
  end if;

  return jsonb_build_object('ok',true,'contract','reset_pos_data_v7','branch_id',p_branch_id,'reset',v_result);
exception when others then
  -- restore JWT claim inside the transaction before propagating; PostgreSQL rolls all writes back.
  perform set_config('request.jwt.claim.sub',coalesce(v_auth_uid::text,''),true);
  perform set_config('request.jwt.claims',coalesce(v_jwt_claims,'{}'),true);
  raise;
end;
$function$;

commit;
