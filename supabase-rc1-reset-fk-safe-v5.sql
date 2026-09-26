-- Sharawla RC1 — FK-safe Reset V5 (Beta SH-0007 only)
-- Preserves historical Offline evidence; does not delete Offline receipts.
-- Required deployed pre-patch reset_pos_data(text[]) MD5:
-- 91df4995ca1b0f40b3cc593a85cf02b1

begin;

do $pre$
declare v_md5 text;
begin
  select md5(pg_get_functiondef('public.reset_pos_data(text[])'::regprocedure)) into v_md5;
  if v_md5 is distinct from '91df4995ca1b0f40b3cc593a85cf02b1' then
    raise exception 'RC1 FK-safe reset refused: reset_pos_data drifted (md5=%)',v_md5;
  end if;
end;
$pre$;

create or replace function public.reset_pos_data(p_groups text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_role text;
  v_employee_id bigint;
  v_result jsonb := '{}'::jsonb;
  v_preserved_customers bigint := 0;
begin
  select e.id,e.role into v_employee_id,v_role
  from public.employees e
  where e.auth_user_id=auth.uid() and e.active=true
  limit 1;

  if v_employee_id is null or v_role is distinct from 'admin' then
    raise exception 'هذه العملية متاحة للمدير فقط';
  end if;
  if p_groups is null or coalesce(array_length(p_groups,1),0)=0 then
    raise exception 'لم يتم تحديد بيانات لإعادة الضبط';
  end if;

  -- SALES / RETURNS / WEBSITE / DELIVERY CASH HISTORY
  if 'orders'=any(p_groups) then
    delete from public.return_payments where true;
    delete from public.return_items where true;
    delete from public.returns where true;
    delete from public.promo_redemptions where true;

    delete from public.website_order_item_modifiers where true;
    delete from public.website_order_items where true;
    delete from public.website_orders where true;

    -- Newer Restaurant modules that hold RESTRICT/NO ACTION references to orders.
    delete from public.delivery_payment_events where true;
    delete from public.driver_settlement_items where true;
    delete from public.driver_settlements where true;
    delete from public.restaurant_table_session_orders where true;

    delete from public.order_item_modifiers where true;
    delete from public.order_payments where true;
    delete from public.order_items where true;
    delete from public.orders where true;

    update public.branch_invoice_counters set next_number=1 where branch_id is not null;
    update public.branch_return_counters set next_number=1 where branch_id is not null;
    delete from public.shift_bon_counters where true;

    v_result:=v_result||jsonb_build_object('orders',true);
  end if;

  -- SHIFTS: when sales are preserved, detach nullable historical references.
  if 'shifts'=any(p_groups) then
    if not ('orders'=any(p_groups)) then
      update public.orders set shift_id=null where shift_id is not null;
      update public.returns set shift_id=null where shift_id is not null;
      update public.driver_settlement_items set source_shift_id=null where source_shift_id is not null;
      update public.driver_settlements set receiving_shift_id=null where receiving_shift_id is not null;
    end if;
    if not ('expenses'=any(p_groups)) then
      update public.expenses set shift_id=null where shift_id is not null;
    end if;
    delete from public.shift_bon_counters where true;
    update public.shifts
       set status='closed',
           closed_at=coalesce(closed_at,clock_timestamp())
     where status is distinct from 'closed' or closed_at is null;
    v_result:=v_result||jsonb_build_object('shifts',true,'shift_history_preserved',true);
  end if;

  if 'expenses'=any(p_groups) then
    -- Permission V2 forbids destructive expense deletion. Preserve financial history.
    v_result:=v_result||jsonb_build_object('expenses',true,'expense_history_preserved',true);
  end if;

  -- CUSTOMERS: preserve any customer that is still authoritative evidence/history
  -- for a newer module. Orders are detached first. Offline receipt rows are NEVER reset here.
  if 'customers'=any(p_groups) then
    update public.orders set customer_id=null where customer_id is not null;
    delete from public.customer_addresses where true;

    with protected(id) as (
      select customer_id from public.offline_v2_customer_merge_receipts
      union select customer_id from public.finance_collections
      union select customer_id from public.finance_receivables
      union select customer_id from public.service_appointments_v1
      union select customer_id from public.service_customer_packages_v1
      union select customer_id from public.service_jobs_v1
      union select customer_id from public.service_warranties_v1
      union select customer_id from public.commerce_trade_in_items_v1
      union select customer_id from public.healthcare_encounters_v1
      union select customer_id from public.healthcare_patient_policies_v1
      union select client_customer_id from public.logistics_client_settlements_v1
      union select client_customer_id from public.logistics_pickup_requests_v1
      union select client_customer_id from public.logistics_shipments_v1
    )
    delete from public.customers c
    where not exists(select 1 from protected p where p.id=c.id);

    select count(*) into v_preserved_customers
    from public.customers c
    where exists(
      select 1 from public.offline_v2_customer_merge_receipts r where r.customer_id=c.id
      union all select 1 from public.finance_collections r where r.customer_id=c.id
      union all select 1 from public.finance_receivables r where r.customer_id=c.id
      union all select 1 from public.service_appointments_v1 r where r.customer_id=c.id
      union all select 1 from public.service_customer_packages_v1 r where r.customer_id=c.id
      union all select 1 from public.service_jobs_v1 r where r.customer_id=c.id
      union all select 1 from public.service_warranties_v1 r where r.customer_id=c.id
      union all select 1 from public.commerce_trade_in_items_v1 r where r.customer_id=c.id
      union all select 1 from public.healthcare_encounters_v1 r where r.customer_id=c.id
      union all select 1 from public.healthcare_patient_policies_v1 r where r.customer_id=c.id
      union all select 1 from public.logistics_client_settlements_v1 r where r.client_customer_id=c.id
      union all select 1 from public.logistics_pickup_requests_v1 r where r.client_customer_id=c.id
      union all select 1 from public.logistics_shipments_v1 r where r.client_customer_id=c.id
    );
    v_result:=v_result||jsonb_build_object('customers',true,'customers_preserved_by_history',v_preserved_customers);
  end if;

  -- DELIVERY: delete transactional children before settlement headers/drivers/zones.
  if 'delivery'=any(p_groups) then
    update public.orders set driver_id=null,delivery_zone_id=null
    where driver_id is not null or delivery_zone_id is not null;
    delete from public.delivery_payment_events where true;
    delete from public.driver_settlement_items where true;
    delete from public.driver_settlements where true;
    delete from public.delivery_drivers where true;
    delete from public.delivery_zones where true;
    v_result:=v_result||jsonb_build_object('delivery',true);
  end if;

  -- CATALOG: preserve advanced purchasing/inventory history.
  if 'catalog'=any(p_groups) then
    if exists(
      select 1 from information_schema.columns
      where table_schema='public' and table_name='order_items'
        and column_name='product_id' and is_nullable='YES'
    ) then
      execute 'update public.order_items set product_id=null where product_id is not null';
    end if;

    delete from public.product_modifiers where true;
    delete from public.branch_products where true;

    begin
      delete from public.product_variants where true;
    exception when foreign_key_violation or not_null_violation then
      update public.product_variants set active=false where active is distinct from false;
    end;

    begin
      delete from public.modifiers where true;
    exception when foreign_key_violation or not_null_violation then
      update public.modifiers set active=false where active is distinct from false;
    end;

    begin
      delete from public.products where true;
      delete from public.categories where true;
    exception when foreign_key_violation or not_null_violation then
      update public.products set active=false where active is distinct from false;
      update public.categories set active=false where active is distinct from false;
    end;
    v_result:=v_result||jsonb_build_object('catalog',true);
  end if;

  if 'promos'=any(p_groups) then
    delete from public.promo_redemptions where true;
    update public.orders set promo_code_id=null,promo_code=null,promo_discount=0
      where promo_code_id is not null or promo_code is not null or coalesce(promo_discount,0)<>0;
    update public.website_orders set promo_code_id=null,promo_code=null,promo_discount=0
      where promo_code_id is not null or promo_code is not null or coalesce(promo_discount,0)<>0;
    delete from public.promo_code_branches where true;
    delete from public.promo_code_categories where true;
    delete from public.promo_code_products where true;
    delete from public.promo_codes where true;
    v_result:=v_result||jsonb_build_object('promos',true);
  end if;

  if 'permissions'=any(p_groups) then
    delete from public.employee_permissions ep
    where exists(select 1 from public.employees e where e.id=ep.employee_id and e.role<>'admin');
    delete from public.employee_branches eb
    where exists(select 1 from public.employees e where e.id=eb.employee_id and e.role<>'admin');
    v_result:=v_result||jsonb_build_object('permissions',true);
  end if;

  if 'settings'=any(p_groups) then
    delete from public.branch_payment_methods where true;
    delete from public.payment_methods where true;
    delete from public.branch_financial_settings where true;
    delete from public.branch_print_settings where true;
    delete from public.branch_website_settings where true;
    delete from public.website_settings where true;
    delete from public.app_settings where true;
    v_result:=v_result||jsonb_build_object('settings',true);
  end if;

  if 'audit'=any(p_groups) then
    delete from public.audit_logs where true;
    v_result:=v_result||jsonb_build_object('audit',true);
  end if;

  return jsonb_build_object('ok',true,'reset',v_result);
end;
$function$;

revoke all on function public.reset_pos_data(text[]) from public,anon;
grant execute on function public.reset_pos_data(text[]) to authenticated,service_role;

do $post$
declare v_def text;
begin
  v_def:=pg_get_functiondef('public.reset_pos_data(text[])'::regprocedure);
  if position('driver_settlement_items' in v_def)=0
     or position('delivery_payment_events' in v_def)=0
     or position('restaurant_table_session_orders' in v_def)=0
     or position('customers_preserved_by_history' in v_def)=0
     or position('shift_history_preserved' in v_def)=0
     or position('expense_history_preserved' in v_def)=0
     or position('branch_invoice_counters set next_number=1 where branch_id is not null' in v_def)=0
     or position('branch_return_counters set next_number=1 where branch_id is not null' in v_def)=0
     or position('delete from public.expenses' in v_def)>0
     or position('delete from public.shifts' in v_def)>0
     or has_function_privilege('anon','public.reset_pos_data(text[])','EXECUTE')
     or not has_function_privilege('authenticated','public.reset_pos_data(text[])','EXECUTE') then
    raise exception 'RC1 FK-safe reset postcondition failed';
  end if;
end;
$post$;

commit;
