-- Top Burger POS V9.7.3.1 - Reset / Clean Start Fix
-- Run AFTER V9.7.3. Safe to re-run.
-- Fixes FK-safe deletion order for returns -> order items,
-- clears operational promo usage when sales are reset,
-- and resets invoice/return counters for a true clean start.

create or replace function public.reset_pos_data(p_groups text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_employee_id bigint;
  v_result jsonb := '{}'::jsonb;
begin
  select e.id, e.role
    into v_employee_id, v_role
  from public.employees e
  where e.auth_user_id = auth.uid()
    and e.active = true
  limit 1;

  if v_employee_id is null or v_role is distinct from 'admin' then
    raise exception 'هذه العملية متاحة للمدير فقط';
  end if;

  if p_groups is null or coalesce(array_length(p_groups, 1), 0) = 0 then
    raise exception 'لم يتم تحديد بيانات لإعادة الضبط';
  end if;

  -- SALES / RETURNS / WEBSITE INTAKE
  -- Children are always deleted before parents to satisfy foreign keys.
  if 'orders' = any(p_groups) then
    -- Returns depend on order_items and orders.
    delete from public.return_payments where true;
    delete from public.return_items where true;
    delete from public.returns where true;

    -- Promo usage is transactional data. A clean sales reset must also
    -- reset usage limits/counters without deleting promo-code definitions.
    delete from public.promo_redemptions where true;

    -- Website intake records are operational/test orders too.
    -- Delete their children first, then headers.
    delete from public.website_order_item_modifiers where true;
    delete from public.website_order_items where true;
    delete from public.website_orders where true;

    -- POS order children, then orders.
    delete from public.order_item_modifiers where true;
    delete from public.order_payments where true;
    delete from public.order_items where true;
    delete from public.orders where true;

    -- Fresh numbering after a full sales reset.
    update public.branch_invoice_counters set next_number = 1;
    update public.branch_return_counters set next_number = 1;
    delete from public.shift_bon_counters where true;

    v_result := v_result || jsonb_build_object('orders', true);
  end if;

  -- Shifts: if orders/expenses are not selected, preserve them by detaching.
  if 'shifts' = any(p_groups) then
    if not ('orders' = any(p_groups)) then
      update public.orders set shift_id = null where shift_id is not null;
    end if;

    if not ('expenses' = any(p_groups)) then
      update public.expenses set shift_id = null where shift_id is not null;
    end if;

    -- Returns also reference shifts. Detach only when sales weren't reset.
    if not ('orders' = any(p_groups)) then
      update public.returns set shift_id = null where shift_id is not null;
    end if;

    delete from public.shift_bon_counters where true;
    delete from public.shifts where id is not null;
    v_result := v_result || jsonb_build_object('shifts', true);
  end if;

  if 'expenses' = any(p_groups) then
    delete from public.expenses where true;
    v_result := v_result || jsonb_build_object('expenses', true);
  end if;

  -- Customers: keep text snapshots on orders, detach relation first.
  if 'customers' = any(p_groups) then
    update public.orders set customer_id = null where customer_id is not null;
    delete from public.customer_addresses where true;
    delete from public.customers where true;
    v_result := v_result || jsonb_build_object('customers', true);
  end if;

  -- Delivery settlements before drivers/zones. Keep historical orders by detaching.
  if 'delivery' = any(p_groups) then
    update public.orders
       set driver_id = null,
           delivery_zone_id = null
     where driver_id is not null or delivery_zone_id is not null;
    delete from public.driver_settlements where true;
    delete from public.delivery_drivers where true;
    delete from public.delivery_zones where true;
    v_result := v_result || jsonb_build_object('delivery', true);
  end if;

  -- Catalog reset. Keep historical order snapshots where possible.
  if 'catalog' = any(p_groups) then
    if exists (
      select 1
      from information_schema.columns
      where table_schema='public' and table_name='order_items'
        and column_name='product_id' and is_nullable='YES'
    ) then
      execute 'update public.order_items set product_id = null where product_id is not null';
    end if;

    delete from public.product_modifiers where true;
    delete from public.branch_products where true;
    delete from public.product_variants where true;
    delete from public.modifiers where true;

    begin
      delete from public.products where true;
      delete from public.categories where true;
    exception when foreign_key_violation or not_null_violation then
      update public.products set active = false where active is distinct from false;
      update public.categories set active = false where active is distinct from false;
    end;

    v_result := v_result || jsonb_build_object('catalog', true);
  end if;

  -- Promo definitions, separate from redemption/usage history.
  if 'promos' = any(p_groups) then
    delete from public.promo_redemptions where true;
    update public.orders set promo_code_id=null, promo_code=null, promo_discount=0
      where promo_code_id is not null or promo_code is not null or coalesce(promo_discount,0)<>0;
    update public.website_orders set promo_code_id=null, promo_code=null, promo_discount=0
      where promo_code_id is not null or promo_code is not null or coalesce(promo_discount,0)<>0;
    delete from public.promo_code_branches where true;
    delete from public.promo_code_categories where true;
    delete from public.promo_code_products where true;
    delete from public.promo_codes where true;
    v_result := v_result || jsonb_build_object('promos', true);
  end if;

  -- Permissions / branch assignments: never remove admin access.
  if 'permissions' = any(p_groups) then
    delete from public.employee_permissions ep
    where exists (
      select 1 from public.employees e
      where e.id = ep.employee_id and e.role <> 'admin'
    );

    delete from public.employee_branches eb
    where exists (
      select 1 from public.employees e
      where e.id = eb.employee_id and e.role <> 'admin'
    );

    v_result := v_result || jsonb_build_object('permissions', true);
  end if;

  -- Settings group mirrors the backup group. Keep required singleton rows usable.
  if 'settings' = any(p_groups) then
    delete from public.branch_payment_methods where true;
    delete from public.payment_methods where true;
    delete from public.branch_financial_settings where true;
    delete from public.branch_print_settings where true;
    delete from public.branch_website_settings where true;
    delete from public.website_settings where true;
    delete from public.app_settings where true;
    -- business_settings is intentionally preserved to avoid losing brand identity/logo
    -- during a normal system reset from the POS UI.
    v_result := v_result || jsonb_build_object('settings', true);
  end if;

  if 'audit' = any(p_groups) then
    delete from public.audit_logs where true;
    v_result := v_result || jsonb_build_object('audit', true);
  end if;

  return jsonb_build_object('ok', true, 'reset', v_result);
end;
$$;

revoke all on function public.reset_pos_data(text[]) from public;
grant execute on function public.reset_pos_data(text[]) to authenticated;

notify pgrst, 'reload schema';
