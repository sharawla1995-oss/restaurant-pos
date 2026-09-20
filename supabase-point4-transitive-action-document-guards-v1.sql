-- Sharawla POS Point 4 — Gate 3C
-- Eight Action/Document Transitive guards. SOURCE ONLY.
-- No Direct Root/public signature/cutover/activation changes.

create or replace function public.food_ingredient_stock_adjust_action_v2(p_branch_id bigint,p_ingredient_id bigint,p_quantity_delta numeric,p_unit_cost numeric,p_reason text,p_client_tx_id text)
returns bigint language plpgsql security definer set search_path to 'public' as $function$
declare v_id bigint; v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not public.has_action_permission_v2('food.ingredients.stock.adjust') then raise exception 'ليس لديك صلاحية تعديل مخزون الخامات'; end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
 select id into v_id from public.food_ingredient_adjustment_events where client_tx_id=v_key;
 if v_id is not null then return v_id; end if;
 perform public.inventory_stock_assert_legacy_write_allowed_v2(p_branch_id,'ingredient',p_ingredient_id);
 v_id:=public.food_ingredient_stock_adjust_v1(p_branch_id,p_ingredient_id,p_quantity_delta,p_unit_cost,p_reason,v_key);
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(public.current_employee_id(),p_branch_id,'food.ingredients.stock.adjust','ingredient_adjustment',v_id,jsonb_build_object('ingredient_id',p_ingredient_id,'quantity_delta',p_quantity_delta,'client_tx_id',v_key));
 return v_id;
end;$function$;

create or replace function public.food_production_batch_complete_action_v2(p_production_batch_id bigint,p_actual_output_quantity numeric,p_consumptions jsonb,p_client_tx_id text,p_notes text)
returns bigint language plpgsql security definer set search_path to 'public' as $function$
declare v_id bigint;v_branch bigint;v_status text;v_completion_tx text;v_output bigint;v_identity record;v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not public.has_action_permission_v2('food.production.complete') then raise exception 'ليس لديك صلاحية إكمال دفعة إنتاج'; end if;
 select b.branch_id,b.status,b.completion_client_tx_id,p.output_ingredient_id into v_branch,v_status,v_completion_tx,v_output from public.food_production_batches b join public.food_prep_items p on p.id=b.prep_item_id where b.id=p_production_batch_id;
 if v_branch is null or not public.has_branch_access(v_branch) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 if v_status='completed' and v_completion_tx=v_key then return p_production_batch_id; end if;
 for v_identity in
   select distinct pc.ingredient_id item_id from public.food_production_consumptions pc join public.ingredients i on i.id=pc.ingredient_id where pc.production_batch_id=p_production_batch_id and coalesce(i.track_inventory,true)
   union select v_output where v_output is not null and coalesce((select track_inventory from public.ingredients where id=v_output),true)
 loop perform public.inventory_stock_assert_legacy_write_allowed_v2(v_branch,'ingredient',v_identity.item_id); end loop;
 v_id:=public.food_production_batch_complete_v1(p_production_batch_id,p_actual_output_quantity,p_consumptions,v_key,p_notes);
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(public.current_employee_id(),v_branch,'food.production.complete','food_production_batch',v_id,jsonb_build_object('actual_output_quantity',p_actual_output_quantity,'client_tx_id',v_key));
 return v_id;
end;$function$;

create or replace function public.food_purchase_receive_v1(p_purchase_id bigint,p_items jsonb,p_client_tx_id text)
returns bigint language plpgsql security definer set search_path to 'public' as $function$
declare v_po public.purchases%rowtype;v_receipt bigint;v_emp bigint;v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v record;v_line public.purchase_items%rowtype;v_qty numeric(18,6);v_base_qty numeric(18,6);v_base_cost numeric(18,6);
begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;if not public.has_action_permission_v2('food.purchasing.receive') then raise exception 'ليس لديك صلاحية استلام مشتريات الخامات';end if;if v_key is null then raise exception 'معرف الحركة مطلوب';end if;
 perform pg_advisory_xact_lock(hashtextextended('food-receive:'||v_key,0));select id into v_receipt from public.food_purchase_receipts where client_tx_id=v_key;if v_receipt is not null then return v_receipt;end if;
 select * into v_po from public.purchases where id=p_purchase_id for update;if not found then raise exception 'أمر الشراء غير موجود';end if;if not public.has_branch_access(v_po.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;if v_po.status not in('approved','partially_received') then raise exception 'أمر الشراء غير جاهز للاستلام';end if;if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'لا توجد كميات للاستلام';end if;
 -- Resolve/validate the complete set before the receipt document exists.
 for v in select * from jsonb_to_recordset(p_items) as x(purchase_item_id bigint,quantity numeric) loop
  select * into v_line from public.purchase_items where id=v.purchase_item_id and purchase_id=v_po.id;if not found then raise exception 'سطر الاستلام غير موجود في أمر الشراء';end if;
  v_qty:=round(coalesce(v.quantity,0)::numeric,6);if v_qty<=0 or v_line.received_quantity+v_qty>v_line.quantity then raise exception 'كمية الاستلام غير صالحة';end if;
  perform public.inventory_stock_assert_legacy_write_allowed_v2(v_po.branch_id,'ingredient',v_line.ingredient_id);
 end loop;
 v_emp:=public.current_employee_id();insert into public.food_purchase_receipts(purchase_id,branch_id,supplier_id,client_tx_id,created_by_employee_id) values(v_po.id,v_po.branch_id,v_po.supplier_id,v_key,v_emp) returning id into v_receipt;
 for v in select * from jsonb_to_recordset(p_items) as x(purchase_item_id bigint,quantity numeric) loop
  select * into v_line from public.purchase_items where id=v.purchase_item_id and purchase_id=v_po.id for update;v_qty:=round(v.quantity,6);v_base_qty:=round(v_qty*v_line.conversion_factor_to_base,6);v_base_cost:=case when v_line.conversion_factor_to_base>0 then round(v_line.unit_cost/v_line.conversion_factor_to_base,6) else 0 end;
  perform public.food_apply_ingredient_delta_internal_v1(v_po.branch_id,v_line.ingredient_id,v_base_qty,v_base_cost,'purchase','food_purchase_receipt',v_receipt,'استلام أمر شراء خامات');
  update public.purchase_items set received_quantity=round(received_quantity+v_qty,6),base_quantity_received=round(base_quantity_received+v_base_qty,6) where id=v_line.id;
  insert into public.food_purchase_receipt_items(receipt_id,purchase_item_id,ingredient_id,quantity,unit_code,conversion_factor_to_base,base_quantity,unit_cost,base_unit_cost) values(v_receipt,v_line.id,v_line.ingredient_id,v_qty,coalesce(v_line.unit_code,''),v_line.conversion_factor_to_base,v_base_qty,v_line.unit_cost,v_base_cost);
 end loop;
 update public.purchases p set status=case when not exists(select 1 from public.purchase_items i where i.purchase_id=p.id and i.received_quantity<i.quantity) then 'received' else 'partially_received' end,received_by_employee_id=v_emp,received_at=case when not exists(select 1 from public.purchase_items i where i.purchase_id=p.id and i.received_quantity<i.quantity) then now() else received_at end,updated_at=now() where p.id=v_po.id;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(v_emp,v_po.branch_id,'food.purchasing.receive','food_purchase_receipt',v_receipt,jsonb_build_object('purchase_id',v_po.id,'client_tx_id',v_key));return v_receipt;
end;$function$;

create or replace function public.food_stock_transfer_create_v1(p_from_branch_id bigint,p_to_branch_id bigint,p_items jsonb,p_notes text,p_client_tx_id text)
returns bigint language plpgsql security definer set search_path to 'public' as $function$
declare v_id bigint;v_emp bigint;v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v record;v_stock public.ingredient_stock%rowtype;v_qty numeric(18,6);
begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;if not public.has_action_permission_v2('food.transfer.create') then raise exception 'ليس لديك صلاحية إنشاء تحويل خامات';end if;if p_from_branch_id=p_to_branch_id then raise exception 'اختر فرعين مختلفين';end if;if not public.has_branch_access(p_from_branch_id) then raise exception 'ليس لديك صلاحية الفرع المصدر';end if;if v_key is null then raise exception 'معرف الحركة مطلوب';end if;if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'أضف خامة واحدة على الأقل';end if;
 perform pg_advisory_xact_lock(hashtextextended('food-transfer:'||v_key,0));select id into v_id from public.stock_transfers where client_tx_id=v_key;if v_id is not null then return v_id;end if;
 for v in select * from jsonb_to_recordset(p_items) as x(ingredient_id bigint,quantity numeric) loop v_qty:=round(coalesce(v.quantity,0),6);if v_qty<=0 then raise exception 'كمية التحويل غير صحيحة';end if;select * into v_stock from public.ingredient_stock where branch_id=p_from_branch_id and ingredient_id=v.ingredient_id;if not found or v_stock.quantity<v_qty then raise exception 'المخزون غير كافٍ للخامة %',v.ingredient_id;end if;perform public.inventory_stock_assert_legacy_write_allowed_v2(p_from_branch_id,'ingredient',v.ingredient_id);end loop;
 v_emp:=public.current_employee_id();insert into public.stock_transfers(from_branch_id,to_branch_id,status,notes,client_tx_id,created_by_employee_id) values(p_from_branch_id,p_to_branch_id,'sent',nullif(trim(coalesce(p_notes,'')),''),v_key,v_emp) returning id into v_id;
 for v in select * from jsonb_to_recordset(p_items) as x(ingredient_id bigint,quantity numeric) loop v_qty:=round(v.quantity,6);select * into v_stock from public.ingredient_stock where branch_id=p_from_branch_id and ingredient_id=v.ingredient_id for update;perform public.food_apply_ingredient_delta_internal_v1(p_from_branch_id,v.ingredient_id,-v_qty,v_stock.average_unit_cost,'transfer_out','stock_transfer',v_id,'تحويل خامات صادر');insert into public.stock_transfer_items(transfer_id,ingredient_id,quantity,unit_code,conversion_factor_to_base,base_quantity,unit_cost_snapshot) select v_id,v.ingredient_id,v_qty,coalesce(i.base_unit_code,i.unit),1,v_qty,v_stock.average_unit_cost from public.ingredients i where i.id=v.ingredient_id;end loop;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(v_emp,p_from_branch_id,'food.transfer.create','stock_transfer',v_id,jsonb_build_object('to_branch_id',p_to_branch_id,'client_tx_id',v_key));return v_id;
end;$function$;

create or replace function public.food_stock_transfer_receive_v1(p_transfer_id bigint)
returns bigint language plpgsql security definer set search_path to 'public' as $function$
declare v_t public.stock_transfers%rowtype;v_emp bigint;v record;
begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;if not public.has_action_permission_v2('food.transfer.receive') then raise exception 'ليس لديك صلاحية استلام تحويل خامات';end if;select * into v_t from public.stock_transfers where id=p_transfer_id for update;if not found then raise exception 'التحويل غير موجود';end if;if not public.has_branch_access(v_t.to_branch_id) then raise exception 'ليس لديك صلاحية الفرع المستلم';end if;if v_t.status='received' then return v_t.id;end if;if v_t.status<>'sent' then raise exception 'التحويل غير قابل للاستلام';end if;
 for v in select * from public.stock_transfer_items where transfer_id=v_t.id order by id loop perform public.inventory_stock_assert_legacy_write_allowed_v2(v_t.to_branch_id,'ingredient',v.ingredient_id);end loop;
 v_emp:=public.current_employee_id();for v in select * from public.stock_transfer_items where transfer_id=v_t.id order by id loop perform public.food_apply_ingredient_delta_internal_v1(v_t.to_branch_id,v.ingredient_id,coalesce(v.base_quantity,v.quantity),v.unit_cost_snapshot,'transfer_in','stock_transfer',v_t.id,'استلام تحويل خامات');end loop;
 update public.stock_transfers set status='received',received_by_employee_id=v_emp,received_at=now(),completed_at=now() where id=v_t.id;insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(v_emp,v_t.to_branch_id,'food.transfer.receive','stock_transfer',v_t.id,jsonb_build_object('from_branch_id',v_t.from_branch_id));return v_t.id;
end;$function$;

create or replace function public.food_stock_transfer_cancel_v1(p_transfer_id bigint,p_reason text)
returns bigint language plpgsql security definer set search_path to 'public' as $function$
declare v_t public.stock_transfers%rowtype;v_emp bigint;v record;
begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;if not public.has_action_permission_v2('food.transfer.cancel') then raise exception 'ليس لديك صلاحية إلغاء تحويل خامات';end if;select * into v_t from public.stock_transfers where id=p_transfer_id for update;if not found then raise exception 'التحويل غير موجود';end if;if not public.has_branch_access(v_t.from_branch_id) then raise exception 'ليس لديك صلاحية الفرع المصدر';end if;if v_t.status='cancelled' then return v_t.id;end if;if v_t.status<>'sent' then raise exception 'لا يمكن إلغاء التحويل بعد الاستلام';end if;
 for v in select * from public.stock_transfer_items where transfer_id=v_t.id order by id loop perform public.inventory_stock_assert_legacy_write_allowed_v2(v_t.from_branch_id,'ingredient',v.ingredient_id);end loop;
 v_emp:=public.current_employee_id();for v in select * from public.stock_transfer_items where transfer_id=v_t.id order by id loop perform public.food_apply_ingredient_delta_internal_v1(v_t.from_branch_id,v.ingredient_id,coalesce(v.base_quantity,v.quantity),v.unit_cost_snapshot,'transfer_cancel','stock_transfer',v_t.id,'إلغاء تحويل خامات');end loop;
 update public.stock_transfers set status='cancelled',cancelled_by_employee_id=v_emp,cancelled_at=now(),notes=concat_ws(E'\n',notes,nullif(trim(coalesce(p_reason,'')),'')) where id=v_t.id;insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(v_emp,v_t.from_branch_id,'food.transfer.cancel','stock_transfer',v_t.id,jsonb_build_object('reason',p_reason));return v_t.id;
end;$function$;

create or replace function public.food_supplier_return_create_v1(p_branch_id bigint,p_supplier_id bigint,p_notes text,p_items jsonb,p_client_tx_id text)
returns bigint language plpgsql security definer set search_path to 'public' as $function$
declare v_ret bigint;v_emp bigint;v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v record;v_base text;v_unit text;v_factor numeric(18,6);v_qty numeric(18,6);v_base_qty numeric(18,6);v_stock public.ingredient_stock%rowtype;
begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;if not public.has_action_permission_v2('food.purchasing.return') then raise exception 'ليس لديك صلاحية مرتجع المورد';end if;if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;if v_key is null then raise exception 'معرف الحركة مطلوب';end if;if p_supplier_id is not null and not exists(select 1 from public.suppliers where id=p_supplier_id) then raise exception 'المورد غير موجود';end if;if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'أضف خامة واحدة على الأقل';end if;
 perform pg_advisory_xact_lock(hashtextextended('food-supplier-return:'||v_key,0));select id into v_ret from public.food_supplier_returns where client_tx_id=v_key;if v_ret is not null then return v_ret;end if;
 -- Resolve units, quantities and stock sufficiency before document insert; guard the complete set.
 for v in select * from jsonb_to_recordset(p_items) as x(ingredient_id bigint,quantity numeric,unit_code text) loop
  select coalesce(base_unit_code,unit),coalesce(purchase_unit_code,base_unit_code,unit) into v_base,v_unit from public.ingredients where id=v.ingredient_id and active is distinct from false;if not found then raise exception 'خامة غير صالحة %',v.ingredient_id;end if;v_unit:=coalesce(nullif(trim(coalesce(v.unit_code,'')),''),v_unit,v_base);v_qty:=round(coalesce(v.quantity,0),6);if v_qty<=0 then raise exception 'كمية المرتجع غير صحيحة';end if;v_factor:=public.ingredient_unit_factor_v1(v.ingredient_id,v_unit,v_base);if v_factor is null or v_factor<=0 then raise exception 'تحويل الوحدة غير صالح';end if;v_base_qty:=round(v_qty*v_factor,6);select * into v_stock from public.ingredient_stock where branch_id=p_branch_id and ingredient_id=v.ingredient_id;if not found or v_stock.quantity<v_base_qty then raise exception 'مخزون الخامة غير كافٍ للمرتجع';end if;perform public.inventory_stock_assert_legacy_write_allowed_v2(p_branch_id,'ingredient',v.ingredient_id);
 end loop;
 v_emp:=public.current_employee_id();insert into public.food_supplier_returns(branch_id,supplier_id,notes,client_tx_id,created_by_employee_id) values(p_branch_id,p_supplier_id,nullif(trim(coalesce(p_notes,'')),''),v_key,v_emp) returning id into v_ret;
 for v in select * from jsonb_to_recordset(p_items) as x(ingredient_id bigint,quantity numeric,unit_code text) loop
  select coalesce(base_unit_code,unit),coalesce(purchase_unit_code,base_unit_code,unit) into v_base,v_unit from public.ingredients where id=v.ingredient_id;v_unit:=coalesce(nullif(trim(coalesce(v.unit_code,'')),''),v_unit,v_base);v_qty:=round(v.quantity,6);v_factor:=public.ingredient_unit_factor_v1(v.ingredient_id,v_unit,v_base);v_base_qty:=round(v_qty*v_factor,6);select * into v_stock from public.ingredient_stock where branch_id=p_branch_id and ingredient_id=v.ingredient_id for update;perform public.food_apply_ingredient_delta_internal_v1(p_branch_id,v.ingredient_id,-v_base_qty,v_stock.average_unit_cost,'supplier_return','food_supplier_return',v_ret,'مرتجع مورد خامات');insert into public.food_supplier_return_items(supplier_return_id,ingredient_id,quantity,unit_code,conversion_factor_to_base,base_quantity,unit_cost_snapshot) values(v_ret,v.ingredient_id,v_qty,v_unit,v_factor,v_base_qty,v_stock.average_unit_cost);
 end loop;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(v_emp,p_branch_id,'food.purchasing.return','food_supplier_return',v_ret,jsonb_build_object('supplier_id',p_supplier_id,'client_tx_id',v_key));return v_ret;
end;$function$;

create or replace function public.food_waste_post_action_v2(p_branch_id bigint,p_ingredient_id bigint,p_prep_item_id bigint,p_shift_id bigint,p_reason_code text,p_quantity numeric,p_unit_code text,p_notes text,p_client_tx_id text)
returns bigint language plpgsql security definer set search_path to 'public' as $function$
declare v_id bigint;v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;if not public.has_action_permission_v2('food.waste.post') then raise exception 'ليس لديك صلاحية ترحيل الهالك'; end if;if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 select id into v_id from public.food_waste_events where client_tx_id=v_key;if v_id is not null then return v_id;end if;
 perform public.inventory_stock_assert_legacy_write_allowed_v2(p_branch_id,'ingredient',p_ingredient_id);
 v_id:=public.food_waste_post_v1(p_branch_id,p_ingredient_id,p_prep_item_id,p_shift_id,p_reason_code,p_quantity,p_unit_code,p_notes,v_key);
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(public.current_employee_id(),p_branch_id,'food.waste.post','food_waste_event',v_id,jsonb_build_object('ingredient_id',p_ingredient_id,'quantity',p_quantity,'unit_code',p_unit_code,'client_tx_id',v_key));return v_id;
end;$function$;
