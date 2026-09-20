-- Sharawla POS Point 4
-- Gate 3B: Food Returns + Food Retail Returns + Pharmacy — SOURCE ONLY.
-- Exactly three Transitive replacements. No Direct Root/public signature/cutover changes.

create or replace function public.create_food_order_return_idempotent_v1(
  p_order_id bigint,p_reason text,p_notes text,p_items jsonb,p_payments jsonb,p_client_tx_id text
)
returns bigint language plpgsql security definer set search_path to 'public'
as $function$
declare v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),''); v_existing bigint; v_branch bigint; v_identity record; v_return_id bigint;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  perform pg_advisory_xact_lock(hashtextextended('food-return-wrapper:'||v_key,0));
  select id into v_existing from public.returns where client_tx_id=v_key limit 1;
  if v_existing is not null and exists(select 1 from public.food_return_consumption_postings where client_tx_id=v_key or return_id=v_existing) then return v_existing; end if;
  select branch_id into v_branch from public.orders where id=p_order_id;
  if v_branch is null or not public.has_branch_access(v_branch) then raise exception 'الفاتورة/صلاحية الفرع غير صالحة'; end if;
  for v_identity in
    select distinct s.ingredient_id item_id
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
    join public.order_items oi on oi.id=nullif(x->>'order_item_id','')::bigint and oi.order_id=p_order_id
    join public.food_order_item_consumption_snapshots s on s.order_item_id=oi.id
    where exists(select 1 from public.stock_movements sm where sm.reference_type='order_item' and sm.reference_id=oi.id and sm.ingredient_id=s.ingredient_id and sm.movement_type='sale' and sm.quantity<0)
  loop
    perform public.inventory_stock_assert_legacy_write_allowed_v2(v_branch,'ingredient',v_identity.item_id);
  end loop;
  -- Ownership barrier precedes the complete Base Return, including branch_return_counters.
  v_return_id:=public.create_order_return_idempotent(p_order_id,p_reason,p_notes,p_items,p_payments,v_key);
  return public.food_apply_return_consumption_v1(v_return_id,p_order_id,p_items,v_key);
end;$function$;

create or replace function public.create_food_retail_order_return_idempotent_v1(
  p_order_id bigint,p_reason text,p_notes text,p_items jsonb,p_payments jsonb,p_client_tx_id text,p_use_variants boolean default false
)
returns bigint language plpgsql security definer set search_path to 'public'
as $function$
declare v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),''); v_existing bigint; v_branch bigint; v_identity record; v_return_id bigint;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  perform pg_advisory_xact_lock(hashtextextended('food-retail-return-wrapper:'||v_key,0));
  select id into v_existing from public.returns where client_tx_id=v_key limit 1;
  if v_existing is not null and exists(select 1 from public.food_return_consumption_postings where client_tx_id=v_key or return_id=v_existing) then return v_existing; end if;
  select branch_id into v_branch from public.orders where id=p_order_id;
  if v_branch is null or not public.has_branch_access(v_branch) then raise exception 'الفاتورة/صلاحية الفرع غير صالحة'; end if;

  -- Historical Retail/Variant identities.
  for v_identity in
    select distinct
      case when coalesce(p_use_variants,false) and oi.variant_id is not null then 'variant' else 'product' end item_kind,
      case when coalesce(p_use_variants,false) and oi.variant_id is not null then oi.variant_id else oi.product_id end item_id
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
    join public.order_items oi on oi.id=nullif(x->>'order_item_id','')::bigint and oi.order_id=p_order_id
    where oi.product_id is not null
  loop
    perform public.inventory_stock_assert_legacy_write_allowed_v2(v_branch,v_identity.item_kind,v_identity.item_id);
  end loop;

  -- Historical Food restore identities; no current Recipe resolution.
  for v_identity in
    select distinct s.ingredient_id item_id
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
    join public.order_items oi on oi.id=nullif(x->>'order_item_id','')::bigint and oi.order_id=p_order_id
    join public.food_order_item_consumption_snapshots s on s.order_item_id=oi.id
    where exists(select 1 from public.stock_movements sm where sm.reference_type='order_item' and sm.reference_id=oi.id and sm.ingredient_id=s.ingredient_id and sm.movement_type='sale' and sm.quantity<0)
  loop
    perform public.inventory_stock_assert_legacy_write_allowed_v2(v_branch,'ingredient',v_identity.item_id);
  end loop;

  if coalesce(p_use_variants,false) then
    v_return_id:=public.create_retail_variant_order_return_idempotent_v1(p_order_id,p_reason,p_notes,p_items,p_payments,v_key);
  else
    v_return_id:=public.create_retail_order_return_idempotent(p_order_id,p_reason,p_notes,p_items,p_payments,v_key);
  end if;
  return public.food_apply_return_consumption_v1(v_return_id,p_order_id,p_items,v_key);
end;$function$;

create or replace function public.create_pharmacy_pos_order_atomic(
  p_order jsonb,p_items jsonb,p_payments jsonb,p_batch_allocations jsonb default '[]'::jsonb,
  p_prescription_id bigint default null,p_insurance jsonb default null
)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_branch bigint:=nullif(p_order->>'branch_id','')::bigint; v_emp bigint; v_result jsonb; v_order_id bigint; x jsonb; v_identity record; v_batch public.pharmacy_batches%rowtype; v_qty numeric; v_expected numeric; v_alloc numeric; v_claim_id bigint; v_gross numeric; v_patient numeric; v_insurer numeric;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if v_branch is null or not public.has_branch_access(v_branch) then raise exception 'ليس لديك صلاحية على هذا الفرع'; end if;
 v_emp:=public.current_employee_id();
 for x in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
   if exists(select 1 from public.pharmacy_product_details d where d.product_id=(x->>'product_id')::bigint and d.track_batch=true) then
     v_expected:=coalesce((x->>'quantity')::numeric,0);
     select coalesce(sum((a->>'quantity')::numeric),0) into v_alloc from jsonb_array_elements(coalesce(p_batch_allocations,'[]'::jsonb)) a where (a->>'product_id')::bigint=(x->>'product_id')::bigint;
     if abs(v_expected-v_alloc)>0.0005 then raise exception 'يجب توزيع كامل كمية الصنف % على الباتشات',x->>'product_id'; end if;
   end if;
 end loop;
 for x in select * from jsonb_array_elements(coalesce(p_batch_allocations,'[]'::jsonb)) loop
   select * into v_batch from public.pharmacy_batches where id=(x->>'batch_id')::bigint for update;
   if not found then raise exception 'الباتش غير موجود'; end if;
   if v_batch.branch_id<>v_branch or v_batch.product_id<>(x->>'product_id')::bigint then raise exception 'بيانات الباتش غير متطابقة'; end if;
   v_qty:=coalesce((x->>'quantity')::numeric,0);
   if v_qty<=0 or v_batch.active is not true or v_batch.expiry_date<current_date or v_batch.quantity<v_qty then raise exception 'بيانات/كمية الباتش غير صالحة'; end if;
 end loop;

 -- Point4 scope: Retail product identities only; pharmacy_batches remains its separate domain.
 for v_identity in select distinct nullif(x->>'product_id','')::bigint item_id from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
 loop
   if v_identity.item_id is null then raise exception 'Retail product identity غير مكتملة'; end if;
   perform public.inventory_stock_assert_legacy_write_allowed_v2(v_branch,'product',v_identity.item_id);
 end loop;

 -- Guard is before the Retail Direct Root and its balance initialization.
 v_result:=public.create_retail_pos_order_atomic(p_order,p_items,p_payments);
 v_order_id:=nullif(v_result#>>'{order,id}','')::bigint;
 if v_order_id is null then raise exception 'تعذر إنشاء فاتورة الصيدلية'; end if;
 for x in select * from jsonb_array_elements(coalesce(p_batch_allocations,'[]'::jsonb)) loop
   select * into v_batch from public.pharmacy_batches where id=(x->>'batch_id')::bigint for update;
   v_qty:=(x->>'quantity')::numeric;
   update public.pharmacy_batches set quantity=round(quantity-v_qty,3),updated_at=now() where id=v_batch.id returning quantity into v_alloc;
   insert into public.pharmacy_order_batch_allocations(order_id,product_id,batch_id,quantity) values(v_order_id,v_batch.product_id,v_batch.id,v_qty);
   insert into public.pharmacy_batch_movements(branch_id,product_id,batch_id,movement_type,quantity_delta,balance_after,reference_type,reference_id,client_tx_id,employee_id)
   values(v_branch,v_batch.product_id,v_batch.id,'sale',-v_qty,v_alloc,'order',v_order_id::text,p_order->>'client_tx_id',v_emp);
 end loop;
 if p_prescription_id is not null then update public.pharmacy_prescriptions set status='dispensed',order_id=v_order_id,updated_at=now() where id=p_prescription_id and branch_id=v_branch; end if;
 if p_insurance is not null and jsonb_typeof(p_insurance)='object' and nullif(p_insurance->>'company_id','') is not null then
   v_gross:=coalesce(nullif(p_insurance->>'gross_amount','')::numeric,coalesce((p_order->>'total')::numeric,0)); v_patient:=coalesce(nullif(p_insurance->>'patient_amount','')::numeric,0); v_insurer:=coalesce(nullif(p_insurance->>'insurer_amount','')::numeric,greatest(v_gross-v_patient,0));
   insert into public.pharmacy_insurance_claims(branch_id,order_id,company_id,plan_id,member_no,approval_no,gross_amount,patient_amount,insurer_amount,status,created_by,notes)
   values(v_branch,v_order_id,(p_insurance->>'company_id')::bigint,nullif(p_insurance->>'plan_id','')::bigint,nullif(trim(p_insurance->>'member_no'),''),nullif(trim(p_insurance->>'approval_no'),''),v_gross,v_patient,v_insurer,'draft',v_emp,p_insurance->>'notes') returning id into v_claim_id;
   v_result:=v_result||jsonb_build_object('insurance_claim_id',v_claim_id);
 end if;
 return v_result;
end;$function$;
