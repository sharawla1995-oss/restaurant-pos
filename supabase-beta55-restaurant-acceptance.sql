-- Sharawla POS 10.5.4-beta.55 — Restaurant formal acceptance helpers
-- Apply only to the isolated Beta operational backend used by SH-0007.
-- Helpers create/clean only rows carrying the requested ACC-* run marker.

begin;

create or replace function public.sharawla_beta55_restaurant_acceptance_fixture_v1(
  p_run_id text,
  p_branch_id bigint
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_run text:=trim(coalesce(p_run_id,''));
  v_emp bigint;
  v_other bigint;
  v_product bigint;
  v_shift bigint;
  v_product_name text;
  v_shift_key text;
begin
  if auth.uid() is null then raise exception 'ACCEPTANCE_AUTH_REQUIRED'; end if;
  if not public.is_admin() then raise exception 'ACCEPTANCE_ADMIN_REQUIRED'; end if;
  if v_run !~ '^ACC-[0-9]{8}-[0-9]{6}-[A-Z0-9]{5}$' then raise exception 'ACCEPTANCE_RUN_ID_INVALID'; end if;
  if p_branch_id is null or not public.has_branch_access(p_branch_id) then raise exception 'ACCEPTANCE_BRANCH_INVALID'; end if;
  v_emp:=public.current_employee_id();
  if v_emp is null then raise exception 'ACCEPTANCE_EMPLOYEE_MISSING'; end if;
  select b.id into v_other from public.branches b
   where b.active=true and b.id<>p_branch_id and public.has_branch_access(b.id)
   order by b.id limit 1;
  if v_other is null then raise exception 'ACCEPTANCE_SECOND_BRANCH_REQUIRED'; end if;

  v_product_name:='B55 Restaurant '||v_run;
  select id into v_product from public.products where name=v_product_name order by id limit 1;
  if v_product is null then
    v_product:=nextval(pg_get_serial_sequence('public.products','id'));
    insert into public.products(id,category_id,name,price,cost,active,allow_modifiers,allow_remove_ingredients,allow_notes,website_visible,website_sort_order,allow_extras,allow_removals,allow_item_notes,removable_components)
    values(v_product,null,v_product_name,100,0,true,false,false,true,false,0,false,false,true,'{}'::text[]);
  end if;

  v_shift_key:=v_run||'-B55R-SHIFT';
  select id into v_shift from public.shifts where client_open_tx_id=v_shift_key order by id limit 1;
  if v_shift is null then
    v_shift:=nextval(pg_get_serial_sequence('public.shifts','id'));
    insert into public.shifts(id,branch_id,employee_id,opening_cash,status,opened_at,client_open_tx_id)
    values(v_shift,p_branch_id,v_emp,0,'open',now(),v_shift_key);
  end if;

  return jsonb_build_object(
    'ok',true,'run_id',v_run,'employee_id',v_emp,
    'branch_id',p_branch_id,'other_branch_id',v_other,
    'product_id',v_product,'shift_id',v_shift
  );
end;
$$;

create or replace function public.sharawla_beta55_restaurant_acceptance_cleanup_v1(
  p_run_id text
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_run text:=trim(coalesce(p_run_id,''));
  v_marker text;
  v_products bigint[]:=array[]::bigint[];
  v_ingredients bigint[]:=array[]::bigint[];
  v_suppliers bigint[]:=array[]::bigint[];
  v_preps bigint[]:=array[]::bigint[];
  v_recipes bigint[]:=array[]::bigint[];
  v_versions bigint[]:=array[]::bigint[];
  v_batches bigint[]:=array[]::bigint[];
  v_purchases bigint[]:=array[]::bigint[];
  v_receipts bigint[]:=array[]::bigint[];
  v_supplier_returns bigint[]:=array[]::bigint[];
  v_counts bigint[]:=array[]::bigint[];
  v_transfers bigint[]:=array[]::bigint[];
  v_sessions bigint[]:=array[]::bigint[];
  v_orders bigint[]:=array[]::bigint[];
  v_returns bigint[]:=array[]::bigint[];
  v_floors bigint[]:=array[]::bigint[];
  v_tables bigint[]:=array[]::bigint[];
  v_shifts bigint[]:=array[]::bigint[];
  v_residue int:=0;
begin
  if auth.uid() is null then raise exception 'ACCEPTANCE_AUTH_REQUIRED'; end if;
  if not public.is_admin() then raise exception 'ACCEPTANCE_ADMIN_REQUIRED'; end if;
  if v_run !~ '^ACC-[0-9]{8}-[0-9]{6}-[A-Z0-9]{5}$' then raise exception 'ACCEPTANCE_RUN_ID_INVALID'; end if;
  v_marker:='SHARAWLA_ACCEPTANCE:'||v_run||':B55R';

  select coalesce(array_agg(id),array[]::bigint[]) into v_products from public.products where name='B55 Restaurant '||v_run;
  select coalesce(array_agg(id),array[]::bigint[]) into v_ingredients from public.ingredients where sku like 'B55R-'||v_run||'-%';
  select coalesce(array_agg(id),array[]::bigint[]) into v_suppliers from public.suppliers where notes=v_marker;
  select coalesce(array_agg(id),array[]::bigint[]) into v_preps from public.food_prep_items where notes=v_marker;
  select coalesce(array_agg(id),array[]::bigint[]) into v_recipes from public.food_recipe_headers where product_id=any(v_products) or prep_item_id=any(v_preps);
  select coalesce(array_agg(id),array[]::bigint[]) into v_versions from public.food_recipe_versions where recipe_id=any(v_recipes);
  select coalesce(array_agg(id),array[]::bigint[]) into v_batches from public.food_production_batches where client_tx_id like v_run||'-B55R-%';
  select coalesce(array_agg(id),array[]::bigint[]) into v_purchases from public.purchases where client_tx_id like v_run||'-B55R-%';
  select coalesce(array_agg(id),array[]::bigint[]) into v_receipts from public.food_purchase_receipts where client_tx_id like v_run||'-B55R-%';
  select coalesce(array_agg(id),array[]::bigint[]) into v_supplier_returns from public.food_supplier_returns where client_tx_id like v_run||'-B55R-%';
  select coalesce(array_agg(id),array[]::bigint[]) into v_counts from public.food_stock_counts where client_tx_id like v_run||'-B55R-%';
  select coalesce(array_agg(id),array[]::bigint[]) into v_transfers from public.stock_transfers where client_tx_id like v_run||'-B55R-%';
  select coalesce(array_agg(id),array[]::bigint[]) into v_sessions from public.restaurant_table_sessions where client_tx_id like v_run||'-B55R-%';
  select coalesce(array_agg(id),array[]::bigint[]) into v_orders from public.orders where client_tx_id like v_run||'-B55R-%';
  select coalesce(array_agg(id),array[]::bigint[]) into v_returns from public.returns where client_tx_id like v_run||'-B55R-%';
  select coalesce(array_agg(id),array[]::bigint[]) into v_floors from public.restaurant_floors where name=v_marker;
  select coalesce(array_agg(id),array[]::bigint[]) into v_tables from public.restaurant_tables where code=v_run||'-B55R-T1';
  select coalesce(array_agg(id),array[]::bigint[]) into v_shifts from public.shifts where client_open_tx_id=v_run||'-B55R-SHIFT';

  delete from public.restaurant_table_session_orders where session_id=any(v_sessions) or order_id=any(v_orders);
  delete from public.restaurant_table_sessions where id=any(v_sessions);
  update public.restaurant_tables set status='available',updated_at=now() where id=any(v_tables);
  delete from public.restaurant_tables where id=any(v_tables);
  delete from public.restaurant_floors where id=any(v_floors);

  delete from public.food_return_consumption_snapshots where return_id=any(v_returns) or order_item_id in(select id from public.order_items where order_id=any(v_orders));
  delete from public.food_return_consumption_postings where return_id=any(v_returns) or order_id=any(v_orders) or client_tx_id like v_run||'-B55R-%';
  delete from public.return_payments where return_id=any(v_returns);
  delete from public.return_items where return_id=any(v_returns);
  delete from public.returns where id=any(v_returns);
  delete from public.food_order_item_cost_snapshots where order_item_id in(select id from public.order_items where order_id=any(v_orders));
  delete from public.food_order_item_consumption_snapshots where order_item_id in(select id from public.order_items where order_id=any(v_orders));
  delete from public.order_item_modifiers where order_item_id in(select id from public.order_items where order_id=any(v_orders));
  delete from public.order_payments where order_id=any(v_orders);
  delete from public.order_items where order_id=any(v_orders);
  delete from public.orders where id=any(v_orders);

  delete from public.food_production_consumptions where production_batch_id=any(v_batches);
  delete from public.food_production_batches where id=any(v_batches);
  delete from public.food_waste_events where client_tx_id like v_run||'-B55R-%' or ingredient_id=any(v_ingredients);

  delete from public.food_purchase_receipt_items where receipt_id=any(v_receipts);
  delete from public.food_purchase_receipts where id=any(v_receipts);
  delete from public.food_supplier_return_items where supplier_return_id=any(v_supplier_returns);
  delete from public.food_supplier_returns where id=any(v_supplier_returns);
  delete from public.food_stock_count_items where stock_count_id=any(v_counts);
  delete from public.food_stock_counts where id=any(v_counts);
  delete from public.stock_transfer_items where transfer_id=any(v_transfers);
  delete from public.stock_transfers where id=any(v_transfers);
  delete from public.purchase_items where purchase_id=any(v_purchases);
  delete from public.purchases where id=any(v_purchases);

  delete from public.food_modifier_recipe_impacts where recipe_version_id=any(v_versions);
  delete from public.food_recipe_removal_mappings where recipe_version_id=any(v_versions);
  delete from public.food_recipe_lines where recipe_version_id=any(v_versions);
  delete from public.food_recipe_versions where id=any(v_versions);
  delete from public.food_recipe_headers where id=any(v_recipes);
  delete from public.food_prep_items where id=any(v_preps);

  delete from public.stock_movements where ingredient_id=any(v_ingredients);
  delete from public.food_ingredient_adjustment_events where ingredient_id=any(v_ingredients);
  delete from public.ingredient_unit_conversions where ingredient_id=any(v_ingredients);
  delete from public.ingredient_stock where ingredient_id=any(v_ingredients);
  delete from public.recipes where ingredient_id=any(v_ingredients) or product_id=any(v_products);
  delete from public.suppliers where id=any(v_suppliers);
  delete from public.ingredients where id=any(v_ingredients);
  delete from public.branch_products where product_id=any(v_products);
  delete from public.products where id=any(v_products);
  delete from public.shifts where id=any(v_shifts);

  select
    (select count(*) from public.products where name='B55 Restaurant '||v_run)+
    (select count(*) from public.ingredients where sku like 'B55R-'||v_run||'-%')+
    (select count(*) from public.suppliers where notes=v_marker)+
    (select count(*) from public.purchases where client_tx_id like v_run||'-B55R-%')+
    (select count(*) from public.food_supplier_returns where client_tx_id like v_run||'-B55R-%')+
    (select count(*) from public.food_stock_counts where client_tx_id like v_run||'-B55R-%')+
    (select count(*) from public.stock_transfers where client_tx_id like v_run||'-B55R-%')+
    (select count(*) from public.food_waste_events where client_tx_id like v_run||'-B55R-%')+
    (select count(*) from public.food_production_batches where client_tx_id like v_run||'-B55R-%')+
    (select count(*) from public.restaurant_table_sessions where client_tx_id like v_run||'-B55R-%')+
    (select count(*) from public.orders where client_tx_id like v_run||'-B55R-%')+
    (select count(*) from public.returns where client_tx_id like v_run||'-B55R-%')+
    (select count(*) from public.shifts where client_open_tx_id=v_run||'-B55R-SHIFT')
  into v_residue;

  return jsonb_build_object('ok',v_residue=0,'run_id',v_run,'residue',v_residue);
end;
$$;

revoke all on function public.sharawla_beta55_restaurant_acceptance_fixture_v1(text,bigint) from public;
revoke all on function public.sharawla_beta55_restaurant_acceptance_cleanup_v1(text) from public;
grant execute on function public.sharawla_beta55_restaurant_acceptance_fixture_v1(text,bigint) to authenticated;
grant execute on function public.sharawla_beta55_restaurant_acceptance_cleanup_v1(text) to authenticated;

commit;
