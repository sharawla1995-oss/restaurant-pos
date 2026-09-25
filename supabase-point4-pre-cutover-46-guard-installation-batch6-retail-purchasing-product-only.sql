-- Point4 Pre-Cutover 46 Guard Installation — Batch 6
-- Contracts #28 + #31 only. Product-only purchasing/supplier-return writers.
-- Source-only. No deployment / activation / cutover.

create or replace function public.retail_purchase_receive(p_purchase_order_id bigint,p_items jsonb,p_client_tx_id text) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_po public.retail_purchase_orders%rowtype;v_grn bigint;v_emp bigint;v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v record;v_line public.retail_purchase_order_items%rowtype;v_bal public.retail_inventory_balances%rowtype;v_qty numeric(14,3);v_new numeric(14,3);v_avg numeric(14,4);v_frozen_items jsonb:='[]'::jsonb;v_guard_product_id bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية الاستلام'; end if;
 if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
 perform pg_advisory_xact_lock(hashtextextended('retail-grn:'||v_key,0)); select id into v_grn from public.retail_goods_receipts where client_tx_id=v_key; if v_grn is not null then return v_grn; end if;
 select * into v_po from public.retail_purchase_orders where id=p_purchase_order_id for update;
 if not found then raise exception 'أمر الشراء غير موجود'; end if; if not public.has_branch_access(v_po.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 if v_po.status not in('approved','partially_received') then raise exception 'أمر الشراء غير جاهز للاستلام'; end if;
 if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'لا توجد كميات للاستلام'; end if;
 -- Phase A: validate and freeze every effective receipt line before durable writes.
 for v in select * from jsonb_to_recordset(p_items) as x(purchase_order_item_id bigint,quantity numeric) loop
  select * into v_line from public.retail_purchase_order_items where id=v.purchase_order_item_id and purchase_order_id=v_po.id for update; if not found then raise exception 'صنف الاستلام غير موجود في أمر الشراء'; end if;
  v_qty:=round(coalesce(v.quantity,0)::numeric,3); if v_qty<=0 then raise exception 'كمية الاستلام يجب أن تكون أكبر من صفر'; end if; if v_line.quantity_received+v_qty>v_line.quantity_ordered then raise exception 'كمية الاستلام تتجاوز المتبقي للصنف %',v_line.product_id; end if;
  v_frozen_items:=v_frozen_items||jsonb_build_array(jsonb_build_object('purchase_order_item_id',v_line.id,'product_id',v_line.product_id,'quantity',v_qty,'unit_cost',v_line.unit_cost));
 end loop;
 if jsonb_array_length(v_frozen_items)=0 then raise exception 'لا توجد كميات للاستلام'; end if;
 for v_guard_product_id in select distinct x.product_id from jsonb_to_recordset(v_frozen_items) as x(product_id bigint) order by x.product_id loop
  perform public.inventory_stock_assert_legacy_write_allowed_v2(v_po.branch_id,'product',v_guard_product_id);
 end loop;
 v_emp:=public.current_employee_id(); insert into public.retail_goods_receipts(purchase_order_id,branch_id,supplier_id,client_tx_id,created_by_employee_id) values(v_po.id,v_po.branch_id,v_po.supplier_id,v_key,v_emp) returning id into v_grn;
 -- Phase B: execute only the frozen receipt lines.
 for v in select * from jsonb_to_recordset(v_frozen_items) as x(purchase_order_item_id bigint,product_id bigint,quantity numeric,unit_cost numeric) loop
  v_line.id:=v.purchase_order_item_id; v_line.product_id:=v.product_id; v_line.unit_cost:=v.unit_cost; v_qty:=v.quantity;
  insert into public.retail_inventory_balances(branch_id,product_id,quantity) values(v_po.branch_id,v_line.product_id,0) on conflict(branch_id,product_id) do nothing;
  select * into v_bal from public.retail_inventory_balances where branch_id=v_po.branch_id and product_id=v_line.product_id for update;
  v_new:=round(v_bal.quantity+v_qty,3);
  v_avg:=case when v_new<=0 then round(v_line.unit_cost,4) else round(((v_bal.quantity*v_bal.average_unit_cost)+(v_qty*v_line.unit_cost))/v_new,4) end;
  update public.retail_inventory_balances set quantity=v_new,average_unit_cost=v_avg,last_purchase_cost=round(v_line.unit_cost,4),updated_at=now() where branch_id=v_po.branch_id and product_id=v_line.product_id;
  update public.retail_purchase_order_items set quantity_received=round(quantity_received+v_qty,3) where id=v_line.id;
  insert into public.retail_goods_receipt_items(goods_receipt_id,purchase_order_item_id,product_id,quantity,unit_cost) values(v_grn,v_line.id,v_line.product_id,v_qty,v_line.unit_cost);
  insert into public.retail_inventory_movements(branch_id,product_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,employee_id) values(v_po.branch_id,v_line.product_id,'purchase',v_qty,v_new,v_line.unit_cost,'grn',v_grn::text,v_key||':'||v_line.id,v_emp);
 end loop;
 update public.retail_purchase_orders po set status=case when not exists(select 1 from public.retail_purchase_order_items i where i.purchase_order_id=po.id and i.quantity_received<i.quantity_ordered) then 'received' else 'partially_received' end,updated_at=now() where id=v_po.id;
 return v_grn;
end;$$;

create or replace function public.retail_supplier_return_create(p_branch_id bigint,p_supplier_id bigint,p_notes text,p_items jsonb,p_client_tx_id text) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_ret bigint;v_emp bigint;v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v record;v_bal public.retail_inventory_balances%rowtype;v_qty numeric(14,3);v_new numeric(14,3);v_frozen_items jsonb:='[]'::jsonb;v_guard_product_id bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if; if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية مرتجع المورد'; end if; if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if; if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
 if not exists(select 1 from public.retail_suppliers where id=p_supplier_id and active) then raise exception 'المورد غير موجود أو موقوف'; end if;
 perform pg_advisory_xact_lock(hashtextextended('retail-supplier-return:'||v_key,0)); select id into v_ret from public.retail_supplier_returns where client_tx_id=v_key; if v_ret is not null then return v_ret; end if;
 -- Phase A: validate and freeze the submitted effective return lines.
 for v in select * from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) as x(product_id bigint,quantity numeric,unit_cost numeric) loop
  v_qty:=round(coalesce(v.quantity,0)::numeric,3); if v_qty<=0 then raise exception 'كمية المرتجع يجب أن تكون أكبر من صفر'; end if;
  if v.product_id is null then raise exception 'الصنف مطلوب'; end if;
  v_frozen_items:=v_frozen_items||jsonb_build_array(jsonb_build_object('product_id',v.product_id,'quantity',v_qty,'unit_cost',round(coalesce(v.unit_cost,0)::numeric,4)));
 end loop;
 if jsonb_array_length(v_frozen_items)=0 then raise exception 'لا توجد أصناف للمرتجع'; end if;
 for v_guard_product_id in select distinct x.product_id from jsonb_to_recordset(v_frozen_items) as x(product_id bigint) order by x.product_id loop
  perform public.inventory_stock_assert_legacy_write_allowed_v2(p_branch_id,'product',v_guard_product_id);
 end loop;
 v_emp:=public.current_employee_id(); insert into public.retail_supplier_returns(branch_id,supplier_id,notes,client_tx_id,created_by_employee_id) values(p_branch_id,p_supplier_id,nullif(trim(coalesce(p_notes,'')),''),v_key,v_emp) returning id into v_ret;
 -- Phase B: mutable stock checks and execution use only frozen identities/quantities.
 for v in select * from jsonb_to_recordset(v_frozen_items) as x(product_id bigint,quantity numeric,unit_cost numeric) loop
  v_qty:=v.quantity;
  select * into v_bal from public.retail_inventory_balances where branch_id=p_branch_id and product_id=v.product_id for update; if not found or v_bal.quantity<v_qty then raise exception 'المخزون غير كافٍ لمرتجع المورد للصنف %',v.product_id; end if;
  v_new:=round(v_bal.quantity-v_qty,3); update public.retail_inventory_balances set quantity=v_new,updated_at=now() where branch_id=p_branch_id and product_id=v.product_id;
  insert into public.retail_supplier_return_items(supplier_return_id,product_id,quantity,unit_cost) values(v_ret,v.product_id,v_qty,round(coalesce(v.unit_cost,0)::numeric,4));
  insert into public.retail_inventory_movements(branch_id,product_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,employee_id) values(p_branch_id,v.product_id,'supplier_return',-v_qty,v_new,round(coalesce(v.unit_cost,0)::numeric,4),'supplier_return',v_ret::text,v_key||':'||v.product_id,v_emp);
 end loop; return v_ret;
end;$$;
