-- V10.5.16 behavioral PostgreSQL contract assertions.
\set ON_ERROR_STOP on

insert into public.products(id,name,price,cost,active) values(100,'Test Burger',100,0,true);
insert into public.modifiers(id,name,price,active) values(200,'Extra Cheddar',10,true);

select public.food_ingredient_save_v1(null,'Burger Base','g','kg','BASE',null,0.05,0,true,100,null,true) as base_ingredient \gset
select public.food_ingredient_save_v1(null,'Cheddar','g','kg','CHEDDAR',null,0.10,0,true,100,null,true) as cheddar_ingredient \gset

insert into public.ingredient_stock(branch_id,ingredient_id,quantity,average_unit_cost,last_purchase_cost)
values
  (1,:base_ingredient,1000,0.05,0.05),
  (1,:cheddar_ingredient,1000,0.10,0.10),
  (2,:base_ingredient,500,0.05,0.05),
  (2,:cheddar_ingredient,500,0.10,0.10);

select public.food_recipe_save_draft_v1(
  100,null,'Test Burger Recipe',1,'pc',
  jsonb_build_array(jsonb_build_object(
    'ingredient_id',:base_ingredient,'quantity',10,'unit_code','g','sort_order',1
  )),
  jsonb_build_array(jsonb_build_object(
    'modifier_id',200,'ingredient_id',:cheddar_ingredient,'quantity',20,'unit_code','g'
  )),
  '[]'::jsonb,
  'contract'
) as recipe_version \gset
select public.food_recipe_activate_version_v1(:recipe_version);

-- 3 sandwiches + Cheddar x1 => base consumes 30g; modifier consumes exactly 20g.
select public.create_food_pos_order_atomic_v1(
  jsonb_build_object(
    'branch_id',1,'employee_id',1,'shift_id',1,'subtotal',310,'total',310,
    'client_tx_id','contract-sale-1','bon_number',1,'invoice_number',1
  ),
  jsonb_build_array(jsonb_build_object(
    'product_id',100,'product_name','Test Burger','quantity',3,'unit_price',100,'total',310,
    'modifiers',jsonb_build_array(jsonb_build_object(
      'id',200,'name','Extra Cheddar','price',10,'qty',1
    ))
  )),
  jsonb_build_array(jsonb_build_object('method','cash','amount',310))
) as sale1 \gset

do $$
declare b numeric; m numeric; q integer; snap numeric;
begin
  select quantity into b from public.ingredient_stock where branch_id=1 and ingredient_id=(select id from public.ingredients where sku='BASE');
  select quantity into m from public.ingredient_stock where branch_id=1 and ingredient_id=(select id from public.ingredients where sku='CHEDDAR');
  if b<>970 then raise exception 'Exact Extras gate failed: base stock expected 970, got %',b; end if;
  if m<>980 then raise exception 'Exact Extras gate failed: modifier qty1 expected stock 980, got %',m; end if;
  select quantity into q
  from public.order_item_modifiers
  where order_item_id=(select max(id) from public.order_items);
  if q<>1 then raise exception 'Persisted modifier quantity expected 1, got %',q; end if;
  select sum(base_quantity) into snap
  from public.food_order_item_consumption_snapshots
  where order_item_id=(select max(id) from public.order_items) and source_kind='modifier';
  if snap<>20 then raise exception 'Modifier snapshot qty1 expected 20g, got %',snap; end if;
end $$;

-- 3 sandwiches + Cheddar x2 => modifier consumes 40g, not 60g.
select public.create_food_pos_order_atomic_v1(
  jsonb_build_object(
    'branch_id',1,'employee_id',1,'shift_id',1,'subtotal',320,'total',320,
    'client_tx_id','contract-sale-2','bon_number',2,'invoice_number',2
  ),
  jsonb_build_array(jsonb_build_object(
    'product_id',100,'product_name','Test Burger','quantity',3,'unit_price',100,'total',320,
    'modifiers',jsonb_build_array(jsonb_build_object(
      'id',200,'name','Extra Cheddar','price',10,'qty',2
    ))
  )),
  jsonb_build_array(jsonb_build_object('method','cash','amount',320))
);

do $$
declare b numeric; m numeric; q integer; snap numeric;
begin
  select quantity into b from public.ingredient_stock where branch_id=1 and ingredient_id=(select id from public.ingredients where sku='BASE');
  select quantity into m from public.ingredient_stock where branch_id=1 and ingredient_id=(select id from public.ingredients where sku='CHEDDAR');
  if b<>940 then raise exception 'Exact Extras gate failed: second base stock expected 940, got %',b; end if;
  if m<>940 then raise exception 'Exact Extras gate failed: modifier qty2 expected stock 940, got %',m; end if;
  select quantity into q from public.order_item_modifiers where order_item_id=(select max(id) from public.order_items);
  if q<>2 then raise exception 'Persisted modifier quantity expected 2, got %',q; end if;
  select sum(base_quantity) into snap
  from public.food_order_item_consumption_snapshots
  where order_item_id=(select max(id) from public.order_items) and source_kind='modifier';
  if snap<>40 then raise exception 'Modifier snapshot qty2 expected 40g, got %',snap; end if;
end $$;

-- Full historical return restores exactly the frozen first-sale snapshot.
select public.create_food_order_return_idempotent_v1(
  (select id from public.orders where client_tx_id='contract-sale-1'),
  'contract return',null,
  jsonb_build_array(jsonb_build_object(
    'order_item_id',(select oi.id from public.order_items oi join public.orders o on o.id=oi.order_id where o.client_tx_id='contract-sale-1'),
    'quantity',3
  )),
  jsonb_build_array(jsonb_build_object('method','cash','amount',310)),
  'contract-return-1'
);

do $$
declare b numeric; m numeric;
begin
  select quantity into b from public.ingredient_stock where branch_id=1 and ingredient_id=(select id from public.ingredients where sku='BASE');
  select quantity into m from public.ingredient_stock where branch_id=1 and ingredient_id=(select id from public.ingredients where sku='CHEDDAR');
  if b<>970 then raise exception 'Historical return expected base stock 970, got %',b; end if;
  if m<>960 then raise exception 'Historical return expected modifier stock 960, got %',m; end if;
end $$;

-- Purchasing flow: Draft -> Approved -> Partial -> Received, with unit conversion and weighted stock.
select public.food_supplier_save_v1(null,'Contract Supplier','01000000000',null,null,null,null,true) as supplier_id \gset
select public.food_purchase_order_create_v1(
  1,:supplier_id,'PO-1','contract',
  jsonb_build_array(jsonb_build_object(
    'ingredient_id',:cheddar_ingredient,'quantity',2,'unit_code','kg','unit_cost',100
  )),
  'po-contract-1'
) as purchase_id \gset
select public.food_purchase_order_approve_v1(:purchase_id);
select id as purchase_item_id from public.purchase_items where purchase_id=:purchase_id \gset
select public.food_purchase_receive_v1(
  :purchase_id,
  jsonb_build_array(jsonb_build_object('purchase_item_id',:purchase_item_id,'quantity',1)),
  'grn-contract-1'
);

do $$
declare st text; q numeric;
begin
  select status into st from public.purchases where id=(select id from public.purchases where client_tx_id='po-contract-1');
  if st<>'partially_received' then raise exception 'PO expected partially_received, got %',st; end if;
  select quantity into q from public.ingredient_stock where branch_id=1 and ingredient_id=(select id from public.ingredients where sku='CHEDDAR');
  if q<>1960 then raise exception 'Partial receive expected cheddar stock 1960, got %',q; end if;
end $$;

select public.food_purchase_receive_v1(
  :purchase_id,
  jsonb_build_array(jsonb_build_object('purchase_item_id',:purchase_item_id,'quantity',1)),
  'grn-contract-2'
);

do $$
declare st text; q numeric;
begin
  select status into st from public.purchases where id=(select id from public.purchases where client_tx_id='po-contract-1');
  if st<>'received' then raise exception 'PO expected received, got %',st; end if;
  select quantity into q from public.ingredient_stock where branch_id=1 and ingredient_id=(select id from public.ingredients where sku='CHEDDAR');
  if q<>2960 then raise exception 'Full receive expected cheddar stock 2960, got %',q; end if;
end $$;

-- Supplier return and stock count.
select public.food_supplier_return_create_v1(
  1,:supplier_id,'contract supplier return',
  jsonb_build_array(jsonb_build_object(
    'ingredient_id',:cheddar_ingredient,'quantity',100,'unit_code','g'
  )),
  'supplier-return-1'
);

select public.food_stock_count_post_v1(
  1,'contract count',
  jsonb_build_array(jsonb_build_object(
    'ingredient_id',:cheddar_ingredient,'counted_quantity',2800
  )),
  'count-contract-1'
);

do $$
declare q numeric;
begin
  select quantity into q from public.ingredient_stock where branch_id=1 and ingredient_id=(select id from public.ingredients where sku='CHEDDAR');
  if q<>2800 then raise exception 'Stock count expected 2800, got %',q; end if;
end $$;

-- Transfer: send deducts source; receive adds destination.
select public.food_stock_transfer_create_v1(
  1,2,
  jsonb_build_array(jsonb_build_object('ingredient_id',:cheddar_ingredient,'quantity',200)),
  'contract transfer','transfer-contract-1'
) as transfer_id \gset

do $$
declare q numeric;
begin
  select quantity into q from public.ingredient_stock where branch_id=1 and ingredient_id=(select id from public.ingredients where sku='CHEDDAR');
  if q<>2600 then raise exception 'Transfer send expected source 2600, got %',q; end if;
end $$;

select public.food_stock_transfer_receive_v1(:transfer_id);

do $$
declare q numeric;
begin
  select quantity into q from public.ingredient_stock where branch_id=2 and ingredient_id=(select id from public.ingredients where sku='CHEDDAR');
  if q<>700 then raise exception 'Transfer receive expected destination 700, got %',q; end if;
end $$;

-- A second sent transfer can be cancelled and source balance restored.
select public.food_stock_transfer_create_v1(
  1,2,
  jsonb_build_array(jsonb_build_object('ingredient_id',:cheddar_ingredient,'quantity',100)),
  'contract cancel','transfer-contract-2'
) as transfer_cancel_id \gset
select public.food_stock_transfer_cancel_v1(:transfer_cancel_id,'cancel test');

do $$
declare q numeric; st text;
begin
  select quantity into q from public.ingredient_stock where branch_id=1 and ingredient_id=(select id from public.ingredients where sku='CHEDDAR');
  if q<>2600 then raise exception 'Transfer cancel expected restored source 2600, got %',q; end if;
  select status into st from public.stock_transfers where id=(select id from public.stock_transfers where client_tx_id='transfer-contract-2');
  if st<>'cancelled' then raise exception 'Transfer cancel status expected cancelled, got %',st; end if;
end $$;

-- Return approval lifetime must be two hours for new requests.
insert into public.orders(branch_id,employee_id,shift_id,bon_number,invoice_number,total,status,client_tx_id)
values(1,1,1,99,99,50,'completed','approval-order');

select public.request_order_return_approval_v1(
  (select id from public.orders where client_tx_id='approval-order'),
  'approval contract',null,
  jsonb_build_array(jsonb_build_object('order_item_id',1,'quantity',1)),
  jsonb_build_array(jsonb_build_object('method','cash','amount',50)),
  'approval-2h-contract'
) as approval_result \gset

do $$
declare diff_seconds numeric;
begin
  select extract(epoch from (expires_at-created_at))
  into diff_seconds
  from public.return_approval_requests
  where client_tx_id='approval-2h-contract';
  if diff_seconds<7195 or diff_seconds>7205 then
    raise exception 'Return approval lifetime expected ~7200 seconds, got %',diff_seconds;
  end if;
end $$;

-- Owner transition must have removed both legacy write triggers.
do $$
begin
  if exists(select 1 from pg_trigger where tgrelid='public.order_items'::regclass and tgname='trg_recipe_order_item_fail_open_v1' and not tgisinternal) then
    raise exception 'Legacy sale recipe trigger still active';
  end if;
  if exists(select 1 from pg_trigger where tgrelid='public.return_items'::regclass and tgname='trg_recipe_return_item_fail_open_v1' and not tgisinternal) then
    raise exception 'Legacy return recipe trigger still active';
  end if;
end $$;

select 'V10.5.16_RESTAURANT_FOOD_POSTGRES_CONTRACT_PASS' as result;
