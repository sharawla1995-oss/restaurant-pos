-- Sharawla POS 10.5.13 -> 10.5.12 EMERGENCY COMPATIBILITY ROLLBACK
-- Generated from the observed Top Burger Production baseline before 10.5.13.
-- Goal: restore 10.5.12 runtime compatibility quickly without destructive CASCADE/data deletion.
-- IMPORTANT: additive 10.5.13 tables/columns are intentionally left in place; 10.5.12 ignores them.
-- Production baseline project: kzokretuuigjhxjzdlmk
-- Baseline app: 10.5.12 @ abc487b60b71c911b3d396acc82e765f54d9a5c2

begin;

-- 1) Disable 10.5.13 Extras synchronization side effects.
drop trigger if exists trg_sync_extra_product_modifier_v1 on public.products;
drop trigger if exists trg_sync_extra_category_products_v1 on public.categories;

-- 2) Restore the pre-10.5.13 return owner used by the stable runtime.
create or replace function public.create_order_return(
  p_order_id bigint,p_reason text,p_notes text,p_items jsonb,p_payments jsonb
) returns bigint language plpgsql security definer set search_path=public as $$
declare v_order public.orders%rowtype; v_emp bigint; v_shift bigint; v_allow_closed boolean:=false; v_return_id bigint; v_return_no bigint; v_item jsonb; v_oi public.order_items%rowtype; v_qty numeric(12,3); v_prev numeric(12,3); v_line numeric(12,2); v_sub numeric(12,2):=0; v_ratio numeric(18,8):=0; v_discount numeric(12,2):=0; v_tax numeric(12,2):=0; v_service numeric(12,2):=0; v_total numeric(12,2):=0; v_prices_include_tax boolean:=true; v_pay jsonb; v_pay_total numeric(12,2):=0; v_method text; v_amount numeric(12,2);
begin
 if not (public.is_admin() or public.has_permission('returns')) then raise exception 'ليس لديك صلاحية عمل مرتجع'; end if;
 v_emp:=public.current_employee_id(); if v_emp is null then raise exception 'المستخدم غير مربوط بموظف'; end if;
 select * into v_order from public.orders where id=p_order_id for update; if not found then raise exception 'الفاتورة غير موجودة'; end if;
 if not public.has_branch_access(v_order.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if; if v_order.status='cancelled' then raise exception 'لا يمكن عمل مرتجع لفاتورة ملغية'; end if;
 select coalesce(value,'false')::boolean into v_allow_closed from public.app_settings where key='returns_allow_closed_shifts';
 select coalesce(bfs.prices_include_tax,true) into v_prices_include_tax from public.branch_financial_settings bfs where bfs.branch_id=v_order.branch_id; if not found then v_prices_include_tax:=true; end if;
 select id into v_shift from public.shifts where branch_id=v_order.branch_id and employee_id=v_emp and status='open' and closed_at is null order by opened_at desc limit 1; if v_shift is null then raise exception 'افتح وردية أولًا قبل عمل المرتجع'; end if;
 if not v_allow_closed and v_order.shift_id is distinct from v_shift then raise exception 'المرتجع مسموح لفواتير الوردية الحالية فقط'; end if;
 if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'سبب المرتجع مطلوب'; end if; if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'اختر صنفًا واحدًا على الأقل'; end if;
 for v_item in select * from jsonb_array_elements(p_items) loop
  select * into v_oi from public.order_items where id=(v_item->>'order_item_id')::bigint and order_id=v_order.id; if not found then raise exception 'صنف المرتجع غير موجود بالفاتورة'; end if;
  v_qty:=coalesce((v_item->>'quantity')::numeric,0); if v_qty<=0 then raise exception 'كمية المرتجع غير صحيحة'; end if;
  select coalesce(sum(ri.quantity),0) into v_prev from public.return_items ri join public.returns r on r.id=ri.return_id where r.order_id=v_order.id and ri.order_item_id=v_oi.id;
  if v_qty+v_prev>v_oi.quantity then raise exception 'كمية المرتجع أكبر من الكمية المتاحة للصنف %',v_oi.product_name; end if;
  v_line:=round((coalesce(v_oi.total,0)/nullif(v_oi.quantity,0))*v_qty,2); v_sub:=v_sub+v_line;
 end loop;
 if coalesce(v_order.subtotal,0)>0 then v_ratio:=least(1,v_sub/v_order.subtotal); end if;
 v_discount:=round(coalesce(v_order.discount,0)*v_ratio,2); v_tax:=round(coalesce(v_order.tax_amount,0)*v_ratio,2); v_service:=round(coalesce(v_order.service_amount,0)*v_ratio,2); v_total:=greatest(0,round(v_sub-v_discount+(case when v_prices_include_tax then 0 else v_tax end)+v_service,2));
 if p_payments is null or jsonb_typeof(p_payments)<>'array' or jsonb_array_length(p_payments)=0 then raise exception 'حدد طريقة رد المبلغ'; end if;
 for v_pay in select * from jsonb_array_elements(p_payments) loop v_method:=nullif(trim(v_pay->>'method'),''); v_amount:=coalesce((v_pay->>'amount')::numeric,0); if v_method is null or v_amount<=0 then raise exception 'بيانات رد المبلغ غير صحيحة'; end if; v_pay_total:=v_pay_total+v_amount; end loop;
 if abs(v_pay_total-v_total)>0.01 then raise exception 'إجمالي رد المبلغ يجب أن يساوي %',v_total; end if;
 insert into public.branch_return_counters(branch_id,next_number) values(v_order.branch_id,2) on conflict(branch_id) do update set next_number=public.branch_return_counters.next_number+1 returning next_number-1 into v_return_no;
 insert into public.returns(branch_id,return_number,order_id,original_invoice_number,original_bon_number,employee_id,shift_id,reason,notes,subtotal,discount_adjustment,tax_adjustment,service_adjustment,total) values(v_order.branch_id,v_return_no,v_order.id,v_order.invoice_number,v_order.bon_number,v_emp,v_shift,trim(p_reason),nullif(trim(coalesce(p_notes,'')),''),v_sub,v_discount,v_tax,v_service,v_total) returning id into v_return_id;
 for v_item in select * from jsonb_array_elements(p_items) loop select * into v_oi from public.order_items where id=(v_item->>'order_item_id')::bigint and order_id=v_order.id; v_qty:=(v_item->>'quantity')::numeric; v_line:=round((coalesce(v_oi.total,0)/nullif(v_oi.quantity,0))*v_qty,2); insert into public.return_items(return_id,order_item_id,product_id,product_name,quantity,unit_refund,total) values(v_return_id,v_oi.id,v_oi.product_id,v_oi.product_name,v_qty,round(v_line/v_qty,2),v_line); end loop;
 for v_pay in select * from jsonb_array_elements(p_payments) loop insert into public.return_payments(return_id,method,amount) values(v_return_id,trim(v_pay->>'method'),(v_pay->>'amount')::numeric); end loop;
 return v_return_id;
end; $$;

revoke all on function public.create_order_return(bigint,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_order_return(bigint,text,text,jsonb,jsonb) to authenticated;

-- 3) Preserve the pre-existing idempotent wrapper and driver-settlement durable columns.
-- They existed before 10.5.13 and MUST NOT be dropped.

-- 4) 10.5.13-only objects are deliberately retained.
-- Keeping additive tables/columns is safer than destructive DROP CASCADE and remains
-- compatible with the 10.5.12 application. Their UI is unavailable after app rollback.

notify pgrst, 'reload schema';
commit;

-- After execution: reinstall the pinned 10.5.12 installer and smoke-test
-- Login -> Branch Picker -> Home -> POS -> Delivery -> receipt/BON -> return.
