-- Point4 Pre-Cutover 46 Guard Installation — Batch 7
-- Contracts #32 + #33 only. Retail transfer create/receive.
-- Source-only. No deployment / activation / cutover.

create or replace function public.retail_transfer_create(p_from_branch_id bigint,p_to_branch_id bigint,p_items jsonb,p_notes text,p_client_tx_id text)
returns bigint language plpgsql security definer set search_path=public as $$
declare v_id bigint; v_emp bigint; v record; v_bal public.retail_inventory_balances%rowtype; v_qty numeric(14,3); v_new numeric(14,3); v_frozen_items jsonb:='[]'::jsonb; v_guard_product_id bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية التحويلات'; end if;
 if p_from_branch_id=p_to_branch_id then raise exception 'اختر فرعين مختلفين'; end if;
 if not public.has_branch_access(p_from_branch_id) then raise exception 'ليس لديك صلاحية الفرع المصدر'; end if;
 perform pg_advisory_xact_lock(hashtextextended('retail-transfer:'||p_client_tx_id,0));
 select id into v_id from public.retail_transfers where client_tx_id=p_client_tx_id; if v_id is not null then return v_id; end if;
 -- Phase A: validate and freeze the complete effective source-branch product set.
 for v in select * from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) as x(product_id bigint,quantity numeric) loop
  v_qty:=round(coalesce(v.quantity,0),3); if v_qty<=0 then raise exception 'كمية التحويل غير صحيحة'; end if;
  if v.product_id is null then raise exception 'الصنف مطلوب'; end if;
  v_frozen_items:=v_frozen_items||jsonb_build_array(jsonb_build_object('product_id',v.product_id,'quantity',v_qty));
 end loop;
 if jsonb_array_length(v_frozen_items)=0 then raise exception 'لا توجد أصناف للتحويل'; end if;
 for v_guard_product_id in select distinct x.product_id from jsonb_to_recordset(v_frozen_items) as x(product_id bigint) order by x.product_id loop
  perform public.inventory_stock_assert_legacy_write_allowed_v2(p_from_branch_id,'product',v_guard_product_id);
 end loop;
 v_emp:=public.current_employee_id();
 insert into public.retail_transfers(from_branch_id,to_branch_id,notes,client_tx_id,created_by_employee_id) values(p_from_branch_id,p_to_branch_id,nullif(trim(coalesce(p_notes,'')),''),p_client_tx_id,v_emp) returning id into v_id;
 -- Phase B: stock locks and transfer-out execution use only the frozen set.
 for v in select * from jsonb_to_recordset(v_frozen_items) as x(product_id bigint,quantity numeric) loop
  v_qty:=v.quantity;
  select * into v_bal from public.retail_inventory_balances where branch_id=p_from_branch_id and product_id=v.product_id for update;
  if not found or (v_bal.track_inventory and v_bal.quantity<v_qty) then raise exception 'المخزون غير كافٍ للصنف %',v.product_id; end if;
  v_new:=round(v_bal.quantity-v_qty,3);
  update public.retail_inventory_balances set quantity=v_new,updated_at=now() where branch_id=p_from_branch_id and product_id=v.product_id;
  insert into public.retail_transfer_items(transfer_id,product_id,quantity,unit_cost) values(v_id,v.product_id,v_qty,v_bal.average_unit_cost);
  insert into public.retail_inventory_movements(branch_id,product_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,employee_id)
  values(p_from_branch_id,v.product_id,'transfer_out',-v_qty,v_new,v_bal.average_unit_cost,'transfer',v_id::text,p_client_tx_id||':out:'||v.product_id,v_emp);
 end loop; return v_id;
end $$;

create or replace function public.retail_transfer_receive(p_transfer_id bigint) returns bigint language plpgsql security definer set search_path=public as $$
declare v_t public.retail_transfers%rowtype; v_emp bigint; v record; v_bal public.retail_inventory_balances%rowtype; v_new numeric(14,3); v_frozen_items jsonb:='[]'::jsonb; v_guard_product_id bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 select * into v_t from public.retail_transfers where id=p_transfer_id for update;
 if not found then raise exception 'التحويل غير موجود'; end if;
 if not public.has_branch_access(v_t.to_branch_id) then raise exception 'ليس لديك صلاحية الفرع المستلم'; end if;
 if v_t.status='received' then return v_t.id; end if;
 if v_t.status<>'sent' then raise exception 'التحويل غير قابل للاستلام'; end if;
 -- Freeze the authoritative stored transfer lines before any destination mutation.
 select coalesce(jsonb_agg(jsonb_build_object('product_id',x.product_id,'quantity',x.quantity,'unit_cost',x.unit_cost) order by x.product_id),'[]'::jsonb)
   into v_frozen_items
   from public.retail_transfer_items x
  where x.transfer_id=v_t.id;
 if jsonb_array_length(v_frozen_items)=0 then raise exception 'التحويل لا يحتوي أصنافًا'; end if;
 for v_guard_product_id in select distinct x.product_id from jsonb_to_recordset(v_frozen_items) as x(product_id bigint) order by x.product_id loop
  perform public.inventory_stock_assert_legacy_write_allowed_v2(v_t.to_branch_id,'product',v_guard_product_id);
 end loop;
 v_emp:=public.current_employee_id();
 for v in select * from jsonb_to_recordset(v_frozen_items) as x(product_id bigint,quantity numeric,unit_cost numeric) order by product_id loop
  insert into public.retail_inventory_balances(branch_id,product_id,quantity,average_unit_cost,last_purchase_cost) values(v_t.to_branch_id,v.product_id,0,v.unit_cost,v.unit_cost) on conflict(branch_id,product_id) do nothing;
  select * into v_bal from public.retail_inventory_balances where branch_id=v_t.to_branch_id and product_id=v.product_id for update;
  v_new:=round(v_bal.quantity+v.quantity,3);
  update public.retail_inventory_balances set quantity=v_new,average_unit_cost=case when v_new>0 then round(((v_bal.quantity*v_bal.average_unit_cost)+(v.quantity*v.unit_cost))/v_new,4) else v.unit_cost end,updated_at=now() where branch_id=v_t.to_branch_id and product_id=v.product_id;
  insert into public.retail_inventory_movements(branch_id,product_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,employee_id)
  values(v_t.to_branch_id,v.product_id,'transfer_in',v.quantity,v_new,v.unit_cost,'transfer',v_t.id::text,v_t.client_tx_id||':in:'||v.product_id,v_emp);
 end loop;
 update public.retail_transfers set status='received',received_by_employee_id=v_emp,received_at=now() where id=v_t.id; return v_t.id;
end $$;
