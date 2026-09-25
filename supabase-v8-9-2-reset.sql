-- V8.9.2 - Safe granular reset for Top Burger POS
-- Run once in Supabase SQL Editor.
-- The function is callable only by an active admin employee.

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

  -- Orders and all direct sales details.
  if 'orders' = any(p_groups) then
    delete from public.order_item_modifiers where true;
    delete from public.order_payments where true;
    delete from public.order_items where true;
    delete from public.orders where true;
    v_result := v_result || jsonb_build_object('orders', true);
  end if;

  -- Shifts are independent: orders/expenses keep their history and their shift_id becomes NULL
  -- because the V6 foreign keys use ON DELETE SET NULL.
  if 'shifts' = any(p_groups) then
    delete from public.shifts where true;
    v_result := v_result || jsonb_build_object('shifts', true);
  end if;

  if 'expenses' = any(p_groups) then
    delete from public.expenses where true;
    v_result := v_result || jsonb_build_object('expenses', true);
  end if;

  -- Keep order text history, but detach customer relation before clearing customers.
  if 'customers' = any(p_groups) then
    update public.orders set customer_id = null where customer_id is not null;
    delete from public.customer_addresses where true;
    delete from public.customers where true;
    v_result := v_result || jsonb_build_object('customers', true);
  end if;

  -- Delivery settlements must be removed before drivers because of ON DELETE RESTRICT.
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

  -- Catalog reset. Order history already stores product_name/unit_price snapshots.
  -- Detach product_id only when that column exists and is nullable.
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
    delete from public.modifiers where true;

    begin
      delete from public.products where true;
      delete from public.categories where true;
    exception when foreign_key_violation or not_null_violation then
      -- If historical order rows use a mandatory product FK, preserve the rows but hide them.
      update public.products set active = false where active is distinct from false;
      update public.categories set active = false where active is distinct from false;
    end;

    v_result := v_result || jsonb_build_object('catalog', true);
  end if;

  -- Reset staff permissions/branch assignments but never remove admin access.
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

  if 'settings' = any(p_groups) then
    delete from public.app_settings where true;
    v_result := v_result || jsonb_build_object('settings', true);
  end if;

  return jsonb_build_object('ok', true, 'reset', v_result);
end;
$$;

revoke all on function public.reset_pos_data(text[]) from public;
grant execute on function public.reset_pos_data(text[]) to authenticated;

notify pgrst, 'reload schema';
