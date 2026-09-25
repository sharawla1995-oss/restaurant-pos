-- Top Burger POS V10.4.6 FINAL STABILITY PATCH
-- Safe targeted patch. Does NOT replace the promo-aware website ordering RPC.

insert into public.app_settings(key,value) values ('returns_allow_closed_shifts','false')
on conflict(key) do nothing;

alter table public.orders add column if not exists client_tx_id text;
create unique index if not exists orders_client_tx_id_uidx on public.orders(client_tx_id) where client_tx_id is not null;

-- Correct return calculation for tax-inclusive branches and optional old-shift returns.
create or replace function public.create_order_return(p_order_id bigint,p_reason text,p_notes text,p_items jsonb,p_payments jsonb) returns bigint language plpgsql security definer set search_path=public as $$
declare v_order public.orders%rowtype; v_emp bigint; v_shift bigint; v_allow_closed boolean:=false; v_return_id bigint; v_return_no bigint; v_item jsonb; v_oi public.order_items%rowtype; v_qty numeric(12,3); v_prev numeric(12,3); v_line numeric(12,2); v_sub numeric(12,2):=0; v_ratio numeric(18,8):=0; v_discount numeric(12,2):=0; v_tax numeric(12,2):=0; v_service numeric(12,2):=0; v_total numeric(12,2):=0; v_prices_include_tax boolean:=true; v_pay jsonb; v_pay_total numeric(12,2):=0; v_method text; v_amount numeric(12,2);
begin
 if not (public.is_admin() or public.has_permission('returns')) then raise exception 'ليس لديك صلاحية عمل مرتجع'; end if;
 v_emp:=public.current_employee_id(); if v_emp is null then raise exception 'المستخدم غير مربوط بموظف'; end if;
 select * into v_order from public.orders where id=p_order_id for update; if not found then raise exception 'الفاتورة غير موجودة'; end if;
 if not public.has_branch_access(v_order.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if; if v_order.status='cancelled' then raise exception 'لا يمكن عمل مرتجع لفاتورة ملغية'; end if;
 select coalesce(value,'false')::boolean into v_allow_closed from public.app_settings where key='returns_allow_closed_shifts';
 select coalesce(bfs.prices_include_tax,true) into v_prices_include_tax from public.branch_financial_settings bfs where bfs.branch_id=v_order.branch_id;
 if not found then v_prices_include_tax:=true; end if;
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
 for v_pay in select * from jsonb_array_elements(p_payments) loop insert into public.return_payments(return_id,method,amount) values(v_return_id,trim(v_pay->>'method'),(v_pay->>'amount')::numeric); end loop; return v_return_id;
end; $$;
revoke all on function public.create_order_return(bigint,text,text,jsonb,jsonb) from public; grant execute on function public.create_order_return(bigint,text,text,jsonb,jsonb) to authenticated;


-- Ensure atomic/offline sale idempotency persists client_tx_id on the created order.
create or replace function public.create_pos_order_atomic(
  p_order jsonb,
  p_items jsonb,
  p_payments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_emp bigint;
  v_branch bigint;
  v_shift bigint;
  v_order public.orders%rowtype;
  v_item_row public.order_items%rowtype;
  v_item jsonb;
  v_mod jsonb;
  v_payment jsonb;
  v_saved_items jsonb := '[]'::jsonb;
  v_payment_total numeric(12,2) := 0;
  v_items_total numeric(12,2) := 0;
  v_subtotal numeric(12,2) := coalesce((p_order->>'subtotal')::numeric,0);
  v_total numeric(12,2) := coalesce((p_order->>'total')::numeric,0);
  v_promo_id bigint := nullif(p_order->>'promo_code_id','')::bigint;
  v_promo_code text := nullif(trim(coalesce(p_order->>'promo_code','')),'');
  v_promo_discount numeric(12,2) := coalesce((p_order->>'promo_discount')::numeric,0);
  v_promo_items jsonb := '[]'::jsonb;
  v_preview jsonb;
  v_preview_discount numeric(12,2) := 0;
  v_phone text := nullif(trim(coalesce(p_order->>'customer_phone','')),'');
  v_order_type text := coalesce(nullif(p_order->>'order_type',''),'takeaway');
  v_payment_method text := coalesce(nullif(p_order->>'payment_method',''),'cash');
  v_client_tx_id text := nullif(trim(coalesce(p_order->>'client_tx_id','')),'');
begin
  if auth.uid() is null then
    raise exception 'غير مصرح';
  end if;

  v_emp := public.current_employee_id();
  if v_emp is null then
    raise exception 'تعذر تحديد الموظف الحالي';
  end if;

  -- Idempotency for offline/weak-network sync: the same client transaction can never create two invoices.
  if v_client_tx_id is not null then
    select * into v_order from public.orders where client_tx_id=v_client_tx_id limit 1;
    if found then
      select coalesce(jsonb_agg(to_jsonb(oi) order by oi.id),'[]'::jsonb) into v_saved_items from public.order_items oi where oi.order_id=v_order.id;
      return jsonb_build_object('order',to_jsonb(v_order),'items',v_saved_items,'duplicate_prevented',true);
    end if;
  end if;

  v_branch := nullif(p_order->>'branch_id','')::bigint;
  v_shift := nullif(p_order->>'shift_id','')::bigint;

  if v_branch is null or not public.has_branch_access(v_branch) then
    raise exception 'ليس لديك صلاحية على هذا الفرع';
  end if;

  if nullif(p_order->>'employee_id','')::bigint is distinct from v_emp then
    raise exception 'بيانات الموظف غير مطابقة للجلسة الحالية';
  end if;

  if v_shift is null or not exists(
    select 1 from public.shifts s
    where s.id=v_shift
      and s.branch_id=v_branch
      and s.employee_id=v_emp
      and s.status='open'
      and s.closed_at is null
  ) then
    raise exception 'الوردية غير مفتوحة أو غير مطابقة للموظف والفرع';
  end if;

  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then
    raise exception 'الأوردر فارغ';
  end if;

  -- Verify item totals and build the promo preview payload from the exact sale lines.
  for v_item in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    if coalesce((v_item->>'quantity')::numeric,0) <= 0 then
      raise exception 'كمية صنف غير صحيحة';
    end if;
    if coalesce((v_item->>'total')::numeric,0) < 0 then
      raise exception 'إجمالي صنف غير صحيح';
    end if;
    v_items_total := v_items_total + coalesce((v_item->>'total')::numeric,0);
    v_promo_items := v_promo_items || jsonb_build_array(jsonb_build_object(
      'product_id', nullif(v_item->>'product_id','')::bigint,
      'line_total', coalesce((v_item->>'total')::numeric,0)
    ));
  end loop;

  if abs(v_items_total-v_subtotal) > 0.02 then
    raise exception 'إجمالي الأصناف تغير. أعد حساب الطلب وحاول مرة أخرى';
  end if;

  -- Lock the promo row before re-validation. This prevents two tills from consuming
  -- the last allowed use at the same time.
  if v_promo_id is not null then
    perform 1 from public.promo_codes where id=v_promo_id for update;
    if not found then raise exception 'البرومو كود غير موجود'; end if;

    v_preview := public.preview_promo_code(
      v_promo_code,
      v_branch,
      'pos',
      v_phone,
      v_promo_items,
      v_subtotal
    );

    if (v_preview->>'promo_id')::bigint <> v_promo_id then
      raise exception 'بيانات البرومو كود تغيرت. أعد تطبيق الكود';
    end if;

    v_preview_discount := coalesce((v_preview->>'discount')::numeric,0);
    if abs(v_preview_discount-v_promo_discount) > 0.01 then
      raise exception 'قيمة البرومو كود تغيرت. أعد تطبيق الكود';
    end if;
  elsif v_promo_discount > 0 then
    raise exception 'خصم البرومو غير صالح';
  end if;

  -- Payments must be complete before any sale row is committed.
  if jsonb_typeof(coalesce(p_payments,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_payments,'[]'::jsonb))=0 then
    raise exception 'طريقة الدفع غير موجودة';
  end if;

  for v_payment in select * from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb)) loop
    if nullif(trim(coalesce(v_payment->>'method','')),'') is null then
      raise exception 'طريقة دفع غير صحيحة';
    end if;
    if coalesce((v_payment->>'amount')::numeric,0) < 0 then
      raise exception 'قيمة دفع غير صحيحة';
    end if;
    v_payment_total := v_payment_total + coalesce((v_payment->>'amount')::numeric,0);
  end loop;

  if abs(v_payment_total-v_total) > 0.02 then
    raise exception 'مجموع طرق الدفع لا يساوي إجمالي الفاتورة';
  end if;

  insert into public.orders(
    branch_id,employee_id,customer_id,shift_id,order_type,payment_method,
    subtotal,discount,discount_type,discount_value,tax_amount,service_amount,
    delivery_fee,total,promo_code_id,promo_code,promo_discount,status,source,payment_status,
    customer_phone,customer_name,delivery_address,delivery_area,delivery_zone_id,
    driver_id,assigned_at,client_tx_id,notes
  ) values (
    v_branch,
    v_emp,
    nullif(p_order->>'customer_id','')::bigint,
    v_shift,
    v_order_type,
    v_payment_method,
    v_subtotal,
    coalesce((p_order->>'discount')::numeric,0),
    nullif(p_order->>'discount_type',''),
    coalesce((p_order->>'discount_value')::numeric,0),
    coalesce((p_order->>'tax_amount')::numeric,0),
    coalesce((p_order->>'service_amount')::numeric,0),
    coalesce((p_order->>'delivery_fee')::numeric,0),
    v_total,
    v_promo_id,
    v_promo_code,
    v_promo_discount,
    coalesce(nullif(p_order->>'status',''),case when v_order_type='delivery' then 'new' else 'completed' end),
    coalesce(nullif(p_order->>'source',''),'pos'),
    'confirmed',
    v_phone,
    nullif(trim(coalesce(p_order->>'customer_name','')),''),
    nullif(trim(coalesce(p_order->>'delivery_address','')),''),
    nullif(trim(coalesce(p_order->>'delivery_area','')),''),
    nullif(p_order->>'delivery_zone_id','')::bigint,
    nullif(p_order->>'driver_id','')::bigint,
    nullif(p_order->>'assigned_at','')::timestamptz,
    v_client_tx_id,
    nullif(trim(coalesce(p_order->>'notes','')),'')
  ) returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.order_items(
      order_id,product_id,product_name,quantity,unit_price,cost,total,notes
    ) values (
      v_order.id,
      nullif(v_item->>'product_id','')::bigint,
      coalesce(v_item->>'product_name',''),
      (v_item->>'quantity')::numeric,
      coalesce((v_item->>'unit_price')::numeric,0),
      coalesce((v_item->>'cost')::numeric,0),
      coalesce((v_item->>'total')::numeric,0),
      nullif(trim(coalesce(v_item->>'notes','')),'')
    ) returning * into v_item_row;

    v_saved_items := v_saved_items || jsonb_build_array(to_jsonb(v_item_row));

    for v_mod in select * from jsonb_array_elements(coalesce(v_item->'modifiers','[]'::jsonb)) loop
      insert into public.order_item_modifiers(order_item_id,modifier_id,modifier_name,price)
      values(
        v_item_row.id,
        nullif(v_mod->>'id','')::bigint,
        coalesce(v_mod->>'name',''),
        coalesce((v_mod->>'price')::numeric,0)
      );
    end loop;
  end loop;

  for v_payment in select * from jsonb_array_elements(p_payments) loop
    insert into public.order_payments(order_id,method,amount)
    values(v_order.id,v_payment->>'method',(v_payment->>'amount')::numeric);
  end loop;

  if v_promo_id is not null and v_promo_discount > 0 then
    perform public.redeem_promo_code(
      v_promo_id,
      v_promo_code,
      v_branch,
      'pos',
      v_phone,
      v_promo_discount,
      v_order.id,
      null
    );
  end if;

  insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
  values(
    v_emp,v_branch,'create_order','order',v_order.id,
    jsonb_build_object(
      'invoice_number',v_order.invoice_number,
      'bon_number',v_order.bon_number,
      'total',v_total,
      'payment',v_payment_method,
      'order_type',v_order_type,
      'shift_id',v_shift,
      'atomic',true
    )
  );

  return jsonb_build_object('order',to_jsonb(v_order),'items',v_saved_items);
end;
$$;

revoke all on function public.create_pos_order_atomic(jsonb,jsonb,jsonb) from public;
grant execute on function public.create_pos_order_atomic(jsonb,jsonb,jsonb) to authenticated;



notify pgrst, 'reload schema';
