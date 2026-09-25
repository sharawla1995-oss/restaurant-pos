-- Point 4 FT-6 — Retail mixed Product/Variant writers
-- Contracts #25 + #27 + #30 only.
-- Source-only. No deployment / activation / cutover.
-- Boundary: Replay -> Validate/Precompute -> Freeze ALL -> Guard ALL -> First Commitment -> Execute frozen set.

create or replace function public.retail_landed_cost_post_v1(p_landed_cost_id bigint)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
 lc public.retail_landed_costs%rowtype; g public.retail_goods_receipts%rowtype; r record;
 bal public.retail_inventory_balances%rowtype; vbal public.retail_variant_inventory_balances%rowtype;
 emp bigint; posted integer:=0; v_frozen_items jsonb:='[]'::jsonb; v_guard record;
begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية ترحيل تكلفة الشحن';end if;
 select * into lc from public.retail_landed_costs where id=p_landed_cost_id for update;if not found then raise exception 'Landed Cost غير موجود';end if;
 select * into g from public.retail_goods_receipts where id=lc.goods_receipt_id;if not found or not public.has_branch_access(g.branch_id) then raise exception 'GRN غير موجود أو غير مصرح';end if;
 if lc.status='posted' then return jsonb_build_object('ok',true,'already_posted',true,'posted_lines',(select count(*) from public.retail_inventory_value_adjustments_v1 where landed_cost_id=lc.id));end if;
 if lc.status<>'allocated' then raise exception 'يجب توزيع Landed Cost أولًا';end if;
 if not exists(select 1 from public.retail_landed_cost_allocations where landed_cost_id=lc.id and allocated_amount>0) then raise exception 'لا توجد توزيعات للترحيل';end if;

 -- Phase A: validate, lock and freeze the complete positive allocation set before any value mutation.
 for r in
   select a.goods_receipt_item_id,a.allocated_amount,gi.product_id,gi.variant_id
   from public.retail_landed_cost_allocations a
   join public.retail_goods_receipt_items gi on gi.id=a.goods_receipt_item_id
   where a.landed_cost_id=lc.id and a.allocated_amount>0 order by a.id
 loop
   if r.variant_id is not null then
     if exists(select 1 from public.retail_variant_inventory_movements m where m.branch_id=g.branch_id and m.variant_id=r.variant_id and m.created_at>=g.received_at and (m.movement_type in('sale','supplier_return','transfer_out','waste','adjustment') or m.quantity_delta<0)) then raise exception 'لا يمكن ترحيل Landed Cost: توجد حركة خروج/تسوية بعد الاستلام للـVariant %',r.variant_id;end if;
     select * into vbal from public.retail_variant_inventory_balances where branch_id=g.branch_id and variant_id=r.variant_id for update;
     if not found or vbal.quantity<=0 then raise exception 'لا يوجد رصيد صالح للـVariant %',r.variant_id;end if;
     v_frozen_items:=v_frozen_items||jsonb_build_array(jsonb_build_object(
       'goods_receipt_item_id',r.goods_receipt_item_id,'product_id',r.product_id,'variant_id',r.variant_id,
       'stock_kind','variant','stock_id',r.variant_id,'allocated_amount',r.allocated_amount,
       'quantity_at_post',vbal.quantity,'old_average_unit_cost',coalesce(vbal.average_unit_cost,0),
       'new_average_unit_cost',round(coalesce(vbal.average_unit_cost,0)+(r.allocated_amount/vbal.quantity),6)));
   else
     if exists(select 1 from public.retail_inventory_movements m where m.branch_id=g.branch_id and m.product_id=r.product_id and m.created_at>=g.received_at and (m.movement_type in('sale','supplier_return','transfer_out','waste','adjustment') or m.quantity_delta<0)) then raise exception 'لا يمكن ترحيل Landed Cost: توجد حركة خروج/تسوية بعد الاستلام للصنف %',r.product_id;end if;
     select * into bal from public.retail_inventory_balances where branch_id=g.branch_id and product_id=r.product_id for update;
     if not found or bal.quantity<=0 then raise exception 'لا يوجد رصيد صالح للصنف %',r.product_id;end if;
     v_frozen_items:=v_frozen_items||jsonb_build_array(jsonb_build_object(
       'goods_receipt_item_id',r.goods_receipt_item_id,'product_id',r.product_id,'variant_id',null,
       'stock_kind','product','stock_id',r.product_id,'allocated_amount',r.allocated_amount,
       'quantity_at_post',bal.quantity,'old_average_unit_cost',coalesce(bal.average_unit_cost,0),
       'new_average_unit_cost',round(coalesce(bal.average_unit_cost,0)+(r.allocated_amount/bal.quantity),6)));
   end if;
 end loop;
 if jsonb_array_length(v_frozen_items)=0 then raise exception 'لا توجد توزيعات للترحيل';end if;

 -- Guard the exact frozen mixed identity set deterministically before the first cost/value write.
 for v_guard in
   select distinct x.stock_kind,x.stock_id
   from jsonb_to_recordset(v_frozen_items) as x(stock_kind text,stock_id bigint)
   order by x.stock_kind,x.stock_id
 loop
   perform public.inventory_stock_assert_legacy_write_allowed_v2(g.branch_id,v_guard.stock_kind,v_guard.stock_id);
 end loop;

 emp:=public.current_employee_id();
 -- Phase B: execute exactly the frozen set; no allocation/identity rediscovery after guards.
 for r in select * from jsonb_to_recordset(v_frozen_items) as x(
   goods_receipt_item_id bigint,product_id bigint,variant_id bigint,stock_kind text,stock_id bigint,
   allocated_amount numeric,quantity_at_post numeric,old_average_unit_cost numeric,new_average_unit_cost numeric)
 loop
   if r.stock_kind='variant' then
     update public.retail_variant_inventory_balances set average_unit_cost=r.new_average_unit_cost,updated_at=now()
      where branch_id=g.branch_id and variant_id=r.stock_id;
   else
     update public.retail_inventory_balances set average_unit_cost=r.new_average_unit_cost,updated_at=now()
      where branch_id=g.branch_id and product_id=r.stock_id;
   end if;
   insert into public.retail_inventory_value_adjustments_v1(
     branch_id,product_id,variant_id,landed_cost_id,goods_receipt_item_id,amount,quantity_at_post,
     old_average_unit_cost,new_average_unit_cost,employee_id)
   values(g.branch_id,r.product_id,r.variant_id,lc.id,r.goods_receipt_item_id,r.allocated_amount,
     r.quantity_at_post,r.old_average_unit_cost,r.new_average_unit_cost,emp)
   on conflict(landed_cost_id,goods_receipt_item_id) do nothing;
   posted:=posted+1;
 end loop;
 update public.retail_landed_costs set status='posted',updated_at=now() where id=lc.id;
 insert into public.retail_purchase_workflow_events(entity_type,entity_id,from_status,to_status,note,employee_id)
 values('landed_cost',lc.id,'allocated','posted','Safe inventory value adjustment posted',emp);
 return jsonb_build_object('ok',true,'already_posted',false,'posted_lines',posted,'landed_cost_id',lc.id);
end;$$;

create or replace function public.retail_purchase_receive_v2(
  p_purchase_order_id bigint,p_items jsonb,p_client_tx_id text
) returns bigint
language plpgsql security definer set search_path=public
as $$
declare
 v_po public.retail_purchase_orders%rowtype; v_grn bigint; v_emp bigint;
 v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),''); v record;
 v_line public.retail_purchase_order_items%rowtype; v_bal public.retail_inventory_balances%rowtype;
 v_vbal public.retail_variant_inventory_balances%rowtype; v_qty numeric(14,3); v_new numeric(14,3);
 v_avg numeric(14,4); v_old_status text; v_frozen_items jsonb:='[]'::jsonb; v_guard record;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية الاستلام'; end if;
 if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
 perform pg_advisory_xact_lock(hashtextextended('retail-grn-v2:'||v_key,0));
 select id into v_grn from public.retail_goods_receipts where client_tx_id=v_key;
 if v_grn is not null then return v_grn; end if;
 select * into v_po from public.retail_purchase_orders where id=p_purchase_order_id for update;
 if not found then raise exception 'أمر الشراء غير موجود'; end if;
 if not public.has_branch_access(v_po.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 if v_po.status not in('approved','partially_received') then raise exception 'أمر الشراء غير جاهز للاستلام'; end if;
 if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'لا توجد كميات للاستلام'; end if;

 -- Phase A1: resolve and freeze every submitted line identity/quantity/cost before the GRN header.
 for v in select * from jsonb_to_recordset(p_items) as x(purchase_order_item_id bigint,quantity numeric) loop
   select * into v_line from public.retail_purchase_order_items
    where id=v.purchase_order_item_id and purchase_order_id=v_po.id for update;
   if not found then raise exception 'صنف الاستلام غير موجود في أمر الشراء'; end if;
   v_qty:=round(coalesce(v.quantity,0)::numeric,3);
   if v_qty<=0 then raise exception 'كمية الاستلام يجب أن تكون أكبر من صفر'; end if;
   v_frozen_items:=v_frozen_items||jsonb_build_array(jsonb_build_object(
     'purchase_order_item_id',v_line.id,'product_id',v_line.product_id,'variant_id',v_line.variant_id,
     'stock_kind',case when v_line.variant_id is null then 'product' else 'variant' end,
     'stock_id',coalesce(v_line.variant_id,v_line.product_id),'quantity',v_qty,'unit_cost',v_line.unit_cost));
 end loop;
 if jsonb_array_length(v_frozen_items)=0 then raise exception 'لا توجد كميات للاستلام'; end if;

 -- Phase A2: preserve cumulative over-receipt semantics for duplicate submitted PO lines.
 for v in
   select x.purchase_order_item_id,sum(x.quantity) quantity
   from jsonb_to_recordset(v_frozen_items) as x(purchase_order_item_id bigint,quantity numeric)
   group by x.purchase_order_item_id order by x.purchase_order_item_id
 loop
   select * into v_line from public.retail_purchase_order_items where id=v.purchase_order_item_id and purchase_order_id=v_po.id for update;
   if v_line.quantity_received+v.quantity>v_line.quantity_ordered then raise exception 'كمية الاستلام تتجاوز المتبقي للصنف %',v_line.product_id; end if;
 end loop;

 for v_guard in
   select distinct x.stock_kind,x.stock_id from jsonb_to_recordset(v_frozen_items) as x(stock_kind text,stock_id bigint)
   order by x.stock_kind,x.stock_id
 loop
   perform public.inventory_stock_assert_legacy_write_allowed_v2(v_po.branch_id,v_guard.stock_kind,v_guard.stock_id);
 end loop;

 v_emp:=public.current_employee_id(); v_old_status:=v_po.status;
 insert into public.retail_goods_receipts(purchase_order_id,branch_id,supplier_id,client_tx_id,created_by_employee_id)
 values(v_po.id,v_po.branch_id,v_po.supplier_id,v_key,v_emp) returning id into v_grn;

 -- Phase B: stock/document execution uses only the frozen lines.
 for v in select * from jsonb_to_recordset(v_frozen_items) as x(
   purchase_order_item_id bigint,product_id bigint,variant_id bigint,stock_kind text,stock_id bigint,quantity numeric,unit_cost numeric)
 loop
   v_qty:=v.quantity;
   if v.stock_kind='variant' then
     insert into public.retail_variant_inventory_balances(branch_id,variant_id,quantity)
     values(v_po.branch_id,v.stock_id,0) on conflict(branch_id,variant_id) do nothing;
     select * into v_vbal from public.retail_variant_inventory_balances where branch_id=v_po.branch_id and variant_id=v.stock_id for update;
     v_new:=round(v_vbal.quantity+v_qty,3);
     v_avg:=case when v_new<=0 then round(v.unit_cost,4) else round(((v_vbal.quantity*v_vbal.average_unit_cost)+(v_qty*v.unit_cost))/v_new,4) end;
     update public.retail_variant_inventory_balances set quantity=v_new,average_unit_cost=v_avg,last_purchase_cost=round(v.unit_cost,4),updated_at=now()
      where branch_id=v_po.branch_id and variant_id=v.stock_id;
     insert into public.retail_variant_inventory_movements(branch_id,variant_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,employee_id)
     values(v_po.branch_id,v.stock_id,'purchase',v_qty,v_new,v.unit_cost,'grn',v_grn::text,v_key||':'||v.purchase_order_item_id,v_emp);
   else
     insert into public.retail_inventory_balances(branch_id,product_id,quantity)
     values(v_po.branch_id,v.stock_id,0) on conflict(branch_id,product_id) do nothing;
     select * into v_bal from public.retail_inventory_balances where branch_id=v_po.branch_id and product_id=v.stock_id for update;
     v_new:=round(v_bal.quantity+v_qty,3);
     v_avg:=case when v_new<=0 then round(v.unit_cost,4) else round(((v_bal.quantity*v_bal.average_unit_cost)+(v_qty*v.unit_cost))/v_new,4) end;
     update public.retail_inventory_balances set quantity=v_new,average_unit_cost=v_avg,last_purchase_cost=round(v.unit_cost,4),updated_at=now()
      where branch_id=v_po.branch_id and product_id=v.stock_id;
     insert into public.retail_inventory_movements(branch_id,product_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,employee_id)
     values(v_po.branch_id,v.stock_id,'purchase',v_qty,v_new,v.unit_cost,'grn',v_grn::text,v_key||':'||v.purchase_order_item_id,v_emp);
   end if;
   update public.retail_purchase_order_items set quantity_received=round(quantity_received+v_qty,3) where id=v.purchase_order_item_id;
   insert into public.retail_goods_receipt_items(goods_receipt_id,purchase_order_item_id,product_id,variant_id,quantity,unit_cost)
   values(v_grn,v.purchase_order_item_id,v.product_id,v.variant_id,v_qty,v.unit_cost);
 end loop;
 update public.retail_purchase_orders po set status=case when not exists(
   select 1 from public.retail_purchase_order_items i where i.purchase_order_id=po.id and i.quantity_received<i.quantity_ordered)
   then 'received' else 'partially_received' end,updated_at=now() where id=v_po.id;
 insert into public.retail_purchase_workflow_events(entity_type,entity_id,from_status,to_status,note,employee_id)
 values('goods_receipt',v_grn,null,'posted','Variant-aware GRN posted',v_emp);
 insert into public.retail_purchase_workflow_events(entity_type,entity_id,from_status,to_status,note,employee_id)
 select 'purchase_order',v_po.id,v_old_status,status,'GRN '||v_grn,v_emp from public.retail_purchase_orders where id=v_po.id;
 return v_grn;
end;$$;

create or replace function public.retail_supplier_return_create_v2(
 p_branch_id bigint,p_supplier_id bigint,p_notes text,p_items jsonb,p_client_tx_id text
) returns bigint
language plpgsql security definer set search_path=public
as $$
declare
 v_ret bigint; v_emp bigint; v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),''); v record;
 v_bal public.retail_inventory_balances%rowtype; v_vbal public.retail_variant_inventory_balances%rowtype;
 v_qty numeric(14,3); v_new numeric(14,3); v_frozen_items jsonb:='[]'::jsonb; v_guard record;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية مرتجع المورد'; end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
 if not exists(select 1 from public.retail_suppliers where id=p_supplier_id and active) then raise exception 'المورد غير موجود أو موقوف'; end if;
 perform pg_advisory_xact_lock(hashtextextended('retail-supplier-return-v2:'||v_key,0));
 select id into v_ret from public.retail_supplier_returns where client_tx_id=v_key;
 if v_ret is not null then return v_ret; end if;

 -- Phase A1: validate and freeze all submitted mixed identities before the return header.
 for v in select * from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb))
   as x(product_id bigint,variant_id bigint,quantity numeric,unit_cost numeric)
 loop
   v_qty:=round(coalesce(v.quantity,0)::numeric,3);
   if v_qty<=0 then raise exception 'كمية المرتجع يجب أن تكون أكبر من صفر'; end if;
   if v.variant_id is not null and not exists(
     select 1 from public.product_variants where id=v.variant_id and product_id=v.product_id and is_stock_unit=true
   ) then raise exception 'Variant غير صالح'; end if;
   v_frozen_items:=v_frozen_items||jsonb_build_array(jsonb_build_object(
     'product_id',v.product_id,'variant_id',v.variant_id,
     'stock_kind',case when v.variant_id is null then 'product' else 'variant' end,
     'stock_id',coalesce(v.variant_id,v.product_id),'quantity',v_qty,
     'unit_cost',round(coalesce(v.unit_cost,0)::numeric,4)));
 end loop;
 if jsonb_array_length(v_frozen_items)=0 then raise exception 'لا توجد أصناف للمرتجع'; end if;

 -- Phase A2: lock each effective balance and validate cumulative duplicate-identity demand.
 for v in
   select x.stock_kind,x.stock_id,sum(x.quantity) quantity
   from jsonb_to_recordset(v_frozen_items) as x(stock_kind text,stock_id bigint,quantity numeric)
   group by x.stock_kind,x.stock_id order by x.stock_kind,x.stock_id
 loop
   if v.stock_kind='variant' then
     select * into v_vbal from public.retail_variant_inventory_balances where branch_id=p_branch_id and variant_id=v.stock_id for update;
     if not found or v_vbal.quantity<v.quantity then raise exception 'مخزون Variant غير كافٍ للمرتجع'; end if;
   else
     select * into v_bal from public.retail_inventory_balances where branch_id=p_branch_id and product_id=v.stock_id for update;
     if not found or v_bal.quantity<v.quantity then raise exception 'المخزون غير كافٍ لمرتجع المورد للصنف %',v.stock_id; end if;
   end if;
 end loop;

 for v_guard in
   select distinct x.stock_kind,x.stock_id from jsonb_to_recordset(v_frozen_items) as x(stock_kind text,stock_id bigint)
   order by x.stock_kind,x.stock_id
 loop
   perform public.inventory_stock_assert_legacy_write_allowed_v2(p_branch_id,v_guard.stock_kind,v_guard.stock_id);
 end loop;

 v_emp:=public.current_employee_id();
 insert into public.retail_supplier_returns(branch_id,supplier_id,notes,client_tx_id,created_by_employee_id)
 values(p_branch_id,p_supplier_id,nullif(trim(coalesce(p_notes,'')),''),v_key,v_emp) returning id into v_ret;

 -- Phase B: execute only frozen identities/quantities/costs.
 for v in select * from jsonb_to_recordset(v_frozen_items) as x(
   product_id bigint,variant_id bigint,stock_kind text,stock_id bigint,quantity numeric,unit_cost numeric)
 loop
   v_qty:=v.quantity;
   if v.stock_kind='variant' then
     select * into v_vbal from public.retail_variant_inventory_balances where branch_id=p_branch_id and variant_id=v.stock_id for update;
     v_new:=round(v_vbal.quantity-v_qty,3);
     update public.retail_variant_inventory_balances set quantity=v_new,updated_at=now() where branch_id=p_branch_id and variant_id=v.stock_id;
     insert into public.retail_variant_inventory_movements(branch_id,variant_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,employee_id)
     values(p_branch_id,v.stock_id,'supplier_return',-v_qty,v_new,v.unit_cost,'supplier_return',v_ret::text,v_key||':'||v.stock_id,v_emp);
   else
     select * into v_bal from public.retail_inventory_balances where branch_id=p_branch_id and product_id=v.stock_id for update;
     v_new:=round(v_bal.quantity-v_qty,3);
     update public.retail_inventory_balances set quantity=v_new,updated_at=now() where branch_id=p_branch_id and product_id=v.stock_id;
     insert into public.retail_inventory_movements(branch_id,product_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,employee_id)
     values(p_branch_id,v.stock_id,'supplier_return',-v_qty,v_new,v.unit_cost,'supplier_return',v_ret::text,v_key||':'||v.stock_id,v_emp);
   end if;
   insert into public.retail_supplier_return_items(supplier_return_id,product_id,variant_id,quantity,unit_cost)
   values(v_ret,v.product_id,v.variant_id,v_qty,v.unit_cost);
 end loop;
 return v_ret;
end;$$;
