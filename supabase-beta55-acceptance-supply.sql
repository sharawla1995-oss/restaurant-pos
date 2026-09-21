-- Sharawla POS — Beta55 Supply Acceptance Fixture / Cleanup
-- Sandbox-only acceptance support. Every row is isolated by ACC-* run id and is
-- deleted by the paired cleanup RPC. Production identifiers are intentionally absent.

begin;

create or replace function public.sharawla_beta55_supply_acceptance_cleanup_v1(p_run_id text)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_key text:=substr(md5(coalesce(p_run_id,'')),1,12);
  v_wh bigint;v_br bigint;v_product bigint;v_balance_identity record;v_residue bigint:=0;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Beta55 acceptance cleanup للمدير فقط';end if;
  if coalesce(p_run_id,'') !~ '^ACC-' then raise exception 'Acceptance run id غير صالح';end if;

  select id into v_wh from public.branches where location_code='ACC55-WH-'||v_key order by id desc limit 1;
  select id into v_br from public.branches where location_code='ACC55-BR-'||v_key order by id desc limit 1;
  select id into v_product from public.products where barcode='ACC55-'||v_key order by id desc limit 1;

  -- Point 4 #39: freeze exactly the balance identities this cleanup can delete,
  -- then guard every tuple before the first destructive DML.
  for v_balance_identity in
    select distinct b.branch_id,b.product_id
    from public.retail_inventory_balances b
    where (
      v_product is not null
      and (b.product_id=v_product or b.branch_id in (v_wh,v_br))
    ) or (
      v_product is null
      and b.branch_id in (v_wh,v_br)
    )
    order by b.branch_id,b.product_id
  loop
    perform public.inventory_stock_assert_legacy_write_allowed_v2(
      v_balance_identity.branch_id,'product',v_balance_identity.product_id
    );
  end loop;

  delete from public.audit_logs a
   where (v_wh is not null and a.branch_id=v_wh)
      or (v_br is not null and a.branch_id=v_br)
      or coalesce(a.details::text,'') like '%'||p_run_id||'%'
      or (a.entity_type='inventory_supply_request' and a.entity_id in (
          select q.id from public.inventory_supply_requests q where q.client_tx_id like p_run_id||'-%'
      ));

  delete from public.retail_inventory_movements m
   where (v_wh is not null and m.branch_id=v_wh)
      or (v_br is not null and m.branch_id=v_br)
      or coalesce(m.client_tx_id,'') like p_run_id||'-%';

  delete from public.inventory_supply_receipts r
   where r.request_id in (
     select q.id from public.inventory_supply_requests q
     where q.client_tx_id like p_run_id||'-%'
        or (v_wh is not null and q.source_location_id=v_wh)
        or (v_br is not null and q.destination_branch_id=v_br)
   );

  delete from public.inventory_supply_requests q
   where q.client_tx_id like p_run_id||'-%'
      or (v_wh is not null and q.source_location_id=v_wh)
      or (v_br is not null and q.destination_branch_id=v_br);

  delete from public.inventory_supply_catalog c
   where c.route_id in (
     select r.id from public.inventory_supply_routes r
     where (v_wh is not null and r.source_location_id=v_wh)
        or (v_br is not null and r.destination_branch_id=v_br)
   );

  delete from public.inventory_supply_routes r
   where (v_wh is not null and r.source_location_id=v_wh)
      or (v_br is not null and r.destination_branch_id=v_br);

  if v_product is not null then
    delete from public.retail_reorder_rules where product_id=v_product;
    delete from public.retail_inventory_balances where product_id=v_product or branch_id in (v_wh,v_br);
    delete from public.products where id=v_product;
  else
    delete from public.retail_inventory_balances where branch_id in (v_wh,v_br);
  end if;

  if v_br is not null then delete from public.branches where id=v_br;end if;
  if v_wh is not null then delete from public.branches where id=v_wh;end if;

  select
    (select count(*) from public.branches where location_code in ('ACC55-WH-'||v_key,'ACC55-BR-'||v_key))+
    (select count(*) from public.products where barcode='ACC55-'||v_key)+
    (select count(*) from public.inventory_supply_requests where client_tx_id like p_run_id||'-%')+
    (select count(*) from public.retail_inventory_movements where coalesce(client_tx_id,'') like p_run_id||'-%')
  into v_residue;

  return jsonb_build_object('ok',v_residue=0,'residue',v_residue,'run_id',p_run_id);
end$$;

grant execute on function public.sharawla_beta55_supply_acceptance_cleanup_v1(text) to authenticated;

create or replace function public.sharawla_beta55_supply_acceptance_fixture_v1(p_run_id text)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_key text:=substr(md5(coalesce(p_run_id,'')),1,12);
  v_wh bigint;v_br bigint;v_product bigint;v_route bigint;v_catalog bigint;
  v_clean jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Beta55 acceptance fixture للمدير فقط';end if;
  if coalesce(p_run_id,'') !~ '^ACC-' then raise exception 'Acceptance run id غير صالح';end if;

  v_clean:=public.sharawla_beta55_supply_acceptance_cleanup_v1(p_run_id);
  if coalesce((v_clean->>'residue')::bigint,0)<>0 then raise exception 'تعذر تنظيف Fixture سابق';end if;

  v_wh:=nextval('public.branches_id_seq');
  insert into public.branches(id,name,active,website_visible,website_orders_enabled,location_type,location_code)
  values(v_wh,'ACC55 Warehouse '||v_key,true,false,false,'central_warehouse','ACC55-WH-'||v_key);

  v_br:=nextval('public.branches_id_seq');
  insert into public.branches(id,name,active,website_visible,website_orders_enabled,location_type,location_code)
  values(v_br,'ACC55 Branch '||v_key,true,false,false,'branch','ACC55-BR-'||v_key);

  v_product:=nextval('public.products_id_seq');
  insert into public.products(id,name,price,cost,barcode,active,website_visible)
  values(v_product,'ACC55 Supply Product '||v_key,25,10,'ACC55-'||v_key,true,false);

  insert into public.retail_inventory_balances(branch_id,product_id,quantity,track_inventory,average_unit_cost,last_purchase_cost)
  values
    (v_wh,v_product,10,true,10,10),
    (v_br,v_product,2,true,10,10)
  on conflict(branch_id,product_id) do update set quantity=excluded.quantity,track_inventory=true,average_unit_cost=excluded.average_unit_cost,last_purchase_cost=excluded.last_purchase_cost,updated_at=now();

  insert into public.inventory_supply_routes(source_location_id,destination_branch_id,active,lead_time_days,allow_emergency,notes,created_by_employee_id)
  values(v_wh,v_br,true,1,true,'SHARAWLA_ACCEPTANCE:'||p_run_id,public.current_employee_id())
  returning id into v_route;

  insert into public.inventory_supply_catalog(
    route_id,item_type,product_id,request_unit_code,min_request_qty,max_request_qty,request_multiple,
    suggested_target_qty,reorder_min_qty,target_stock_qty,active,sort_order,notes
  ) values(
    v_route,'product',v_product,null,0,null,0,10,4,10,true,0,'SHARAWLA_ACCEPTANCE:'||p_run_id
  ) returning id into v_catalog;

  return jsonb_build_object(
    'ok',true,'run_id',p_run_id,'warehouse_id',v_wh,'branch_id',v_br,'product_id',v_product,
    'route_id',v_route,'catalog_item_id',v_catalog,'warehouse_qty',10,'branch_qty',2,'reorder_min',4,'target_stock',10
  );
end$$;

grant execute on function public.sharawla_beta55_supply_acceptance_fixture_v1(text) to authenticated;

commit;
