-- Sharawla POS — Advanced Purchasing V1.1 Runtime
-- Beta-first additive migration.
-- Preserves all legacy purchasing RPCs and adds V2 variant-aware paths.

begin;

-- -----------------------------------------------------------------------------
-- 1) Variant identity on purchasing documents (nullable = legacy/product stock)
-- -----------------------------------------------------------------------------
alter table public.retail_purchase_order_items
  add column if not exists variant_id bigint references public.product_variants(id) on delete restrict;
alter table public.retail_goods_receipt_items
  add column if not exists variant_id bigint references public.product_variants(id) on delete restrict;
alter table public.retail_supplier_return_items
  add column if not exists variant_id bigint references public.product_variants(id) on delete restrict;
alter table public.retail_supplier_invoice_items
  add column if not exists variant_id bigint references public.product_variants(id) on delete restrict;

create index if not exists retail_purchase_order_items_variant_idx
  on public.retail_purchase_order_items(variant_id) where variant_id is not null;
create index if not exists retail_goods_receipt_items_variant_idx
  on public.retail_goods_receipt_items(variant_id) where variant_id is not null;
create index if not exists retail_supplier_return_items_variant_idx
  on public.retail_supplier_return_items(variant_id) where variant_id is not null;
create index if not exists retail_supplier_invoice_items_variant_idx
  on public.retail_supplier_invoice_items(variant_id) where variant_id is not null;

-- -----------------------------------------------------------------------------
-- 2) Variant-aware PO create. Legacy retail_purchase_order_create stays untouched.
-- -----------------------------------------------------------------------------
create or replace function public.retail_purchase_order_create_v2(
  p_branch_id bigint,
  p_supplier_id bigint,
  p_notes text,
  p_items jsonb,
  p_client_tx_id text,
  p_po_number text default null,
  p_expected_at timestamptz default null
) returns bigint
language plpgsql security definer set search_path=public
as $$
declare
  v_id bigint;
  v_emp bigint;
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v record;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية المشتريات'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  if not exists(select 1 from public.retail_suppliers where id=p_supplier_id and active) then raise exception 'المورد غير موجود أو موقوف'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'أضف صنفًا واحدًا على الأقل'; end if;

  perform pg_advisory_xact_lock(hashtextextended('retail-po-v2:'||v_key,0));
  select id into v_id from public.retail_purchase_orders where client_tx_id=v_key;
  if v_id is not null then return v_id; end if;

  v_emp:=public.current_employee_id();
  insert into public.retail_purchase_orders(
    branch_id,supplier_id,notes,client_tx_id,created_by_employee_id,po_number,expected_at,currency_code
  ) values(
    p_branch_id,p_supplier_id,nullif(trim(coalesce(p_notes,'')),''),v_key,v_emp,
    nullif(trim(coalesce(p_po_number,'')),''),p_expected_at,'EGP'
  ) returning id into v_id;

  for v in
    select * from jsonb_to_recordset(p_items)
      as x(product_id bigint,variant_id bigint,quantity numeric,unit_cost numeric)
  loop
    if coalesce(v.quantity,0)<=0 or coalesce(v.unit_cost,-1)<0 then raise exception 'كمية/تكلفة غير صحيحة'; end if;
    if not exists(select 1 from public.products where id=v.product_id and active is distinct from false) then raise exception 'صنف غير صالح %',v.product_id; end if;
    if v.variant_id is not null and not exists(
      select 1 from public.product_variants pv
      where pv.id=v.variant_id and pv.product_id=v.product_id and pv.active=true and pv.is_stock_unit=true
    ) then raise exception 'Variant غير صالح للصنف %',v.product_id; end if;

    insert into public.retail_purchase_order_items(
      purchase_order_id,product_id,variant_id,quantity_ordered,unit_cost
    ) values(v_id,v.product_id,v.variant_id,round(v.quantity,3),round(v.unit_cost,4));
  end loop;

  insert into public.retail_purchase_workflow_events(entity_type,entity_id,from_status,to_status,note,employee_id)
  values('purchase_order',v_id,null,'draft','PO V2 created',v_emp);
  return v_id;
end;$$;

-- -----------------------------------------------------------------------------
-- 3) Variant-aware receiving. Legacy retail_purchase_receive stays untouched.
-- -----------------------------------------------------------------------------
create or replace function public.retail_purchase_receive_v2(
  p_purchase_order_id bigint,
  p_items jsonb,
  p_client_tx_id text
) returns bigint
language plpgsql security definer set search_path=public
as $$
declare
  v_po public.retail_purchase_orders%rowtype;
  v_grn bigint;
  v_emp bigint;
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v record;
  v_line public.retail_purchase_order_items%rowtype;
  v_bal public.retail_inventory_balances%rowtype;
  v_vbal public.retail_variant_inventory_balances%rowtype;
  v_qty numeric(14,3);
  v_new numeric(14,3);
  v_avg numeric(14,4);
  v_old_status text;
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

  v_emp:=public.current_employee_id();
  v_old_status:=v_po.status;
  insert into public.retail_goods_receipts(purchase_order_id,branch_id,supplier_id,client_tx_id,created_by_employee_id)
  values(v_po.id,v_po.branch_id,v_po.supplier_id,v_key,v_emp) returning id into v_grn;

  for v in select * from jsonb_to_recordset(p_items) as x(purchase_order_item_id bigint,quantity numeric)
  loop
    select * into v_line from public.retail_purchase_order_items
    where id=v.purchase_order_item_id and purchase_order_id=v_po.id for update;
    if not found then raise exception 'صنف الاستلام غير موجود في أمر الشراء'; end if;

    v_qty:=round(coalesce(v.quantity,0)::numeric,3);
    if v_qty<=0 then raise exception 'كمية الاستلام يجب أن تكون أكبر من صفر'; end if;
    if v_line.quantity_received+v_qty>v_line.quantity_ordered then raise exception 'كمية الاستلام تتجاوز المتبقي للصنف %',v_line.product_id; end if;

    if v_line.variant_id is not null then
      insert into public.retail_variant_inventory_balances(branch_id,variant_id,quantity)
      values(v_po.branch_id,v_line.variant_id,0) on conflict(branch_id,variant_id) do nothing;
      select * into v_vbal from public.retail_variant_inventory_balances
      where branch_id=v_po.branch_id and variant_id=v_line.variant_id for update;
      v_new:=round(v_vbal.quantity+v_qty,3);
      v_avg:=case when v_new<=0 then round(v_line.unit_cost,4)
             else round(((v_vbal.quantity*v_vbal.average_unit_cost)+(v_qty*v_line.unit_cost))/v_new,4) end;
      update public.retail_variant_inventory_balances
      set quantity=v_new,average_unit_cost=v_avg,last_purchase_cost=round(v_line.unit_cost,4),updated_at=now()
      where branch_id=v_po.branch_id and variant_id=v_line.variant_id;
      insert into public.retail_variant_inventory_movements(
        branch_id,variant_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,employee_id
      ) values(v_po.branch_id,v_line.variant_id,'purchase',v_qty,v_new,v_line.unit_cost,'grn',v_grn::text,v_key||':'||v_line.id,v_emp);
    else
      insert into public.retail_inventory_balances(branch_id,product_id,quantity)
      values(v_po.branch_id,v_line.product_id,0) on conflict(branch_id,product_id) do nothing;
      select * into v_bal from public.retail_inventory_balances
      where branch_id=v_po.branch_id and product_id=v_line.product_id for update;
      v_new:=round(v_bal.quantity+v_qty,3);
      v_avg:=case when v_new<=0 then round(v_line.unit_cost,4)
             else round(((v_bal.quantity*v_bal.average_unit_cost)+(v_qty*v_line.unit_cost))/v_new,4) end;
      update public.retail_inventory_balances
      set quantity=v_new,average_unit_cost=v_avg,last_purchase_cost=round(v_line.unit_cost,4),updated_at=now()
      where branch_id=v_po.branch_id and product_id=v_line.product_id;
      insert into public.retail_inventory_movements(
        branch_id,product_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,employee_id
      ) values(v_po.branch_id,v_line.product_id,'purchase',v_qty,v_new,v_line.unit_cost,'grn',v_grn::text,v_key||':'||v_line.id,v_emp);
    end if;

    update public.retail_purchase_order_items set quantity_received=round(quantity_received+v_qty,3) where id=v_line.id;
    insert into public.retail_goods_receipt_items(goods_receipt_id,purchase_order_item_id,product_id,variant_id,quantity,unit_cost)
    values(v_grn,v_line.id,v_line.product_id,v_line.variant_id,v_qty,v_line.unit_cost);
  end loop;

  update public.retail_purchase_orders po
  set status=case when not exists(
      select 1 from public.retail_purchase_order_items i where i.purchase_order_id=po.id and i.quantity_received<i.quantity_ordered
    ) then 'received' else 'partially_received' end,
      updated_at=now()
  where id=v_po.id;

  insert into public.retail_purchase_workflow_events(entity_type,entity_id,from_status,to_status,note,employee_id)
  select 'goods_receipt',v_grn,null,'posted','Variant-aware GRN posted',v_emp;
  insert into public.retail_purchase_workflow_events(entity_type,entity_id,from_status,to_status,note,employee_id)
  select 'purchase_order',v_po.id,v_old_status,status,'GRN '||v_grn,v_emp from public.retail_purchase_orders where id=v_po.id;

  return v_grn;
end;$$;

-- -----------------------------------------------------------------------------
-- 4) Variant-aware supplier return. Legacy RPC stays untouched.
-- -----------------------------------------------------------------------------
create or replace function public.retail_supplier_return_create_v2(
  p_branch_id bigint,
  p_supplier_id bigint,
  p_notes text,
  p_items jsonb,
  p_client_tx_id text
) returns bigint
language plpgsql security definer set search_path=public
as $$
declare
  v_ret bigint;
  v_emp bigint;
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v record;
  v_bal public.retail_inventory_balances%rowtype;
  v_vbal public.retail_variant_inventory_balances%rowtype;
  v_qty numeric(14,3);
  v_new numeric(14,3);
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية مرتجع المورد'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  if not exists(select 1 from public.retail_suppliers where id=p_supplier_id and active) then raise exception 'المورد غير موجود أو موقوف'; end if;

  perform pg_advisory_xact_lock(hashtextextended('retail-supplier-return-v2:'||v_key,0));
  select id into v_ret from public.retail_supplier_returns where client_tx_id=v_key;
  if v_ret is not null then return v_ret; end if;

  v_emp:=public.current_employee_id();
  insert into public.retail_supplier_returns(branch_id,supplier_id,notes,client_tx_id,created_by_employee_id)
  values(p_branch_id,p_supplier_id,nullif(trim(coalesce(p_notes,'')),''),v_key,v_emp) returning id into v_ret;

  for v in select * from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb))
    as x(product_id bigint,variant_id bigint,quantity numeric,unit_cost numeric)
  loop
    v_qty:=round(coalesce(v.quantity,0)::numeric,3);
    if v_qty<=0 then raise exception 'كمية المرتجع يجب أن تكون أكبر من صفر'; end if;
    if v.variant_id is not null then
      if not exists(select 1 from public.product_variants where id=v.variant_id and product_id=v.product_id and is_stock_unit=true) then raise exception 'Variant غير صالح'; end if;
      select * into v_vbal from public.retail_variant_inventory_balances where branch_id=p_branch_id and variant_id=v.variant_id for update;
      if not found or v_vbal.quantity<v_qty then raise exception 'مخزون Variant غير كافٍ للمرتجع'; end if;
      v_new:=round(v_vbal.quantity-v_qty,3);
      update public.retail_variant_inventory_balances set quantity=v_new,updated_at=now() where branch_id=p_branch_id and variant_id=v.variant_id;
      insert into public.retail_variant_inventory_movements(branch_id,variant_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,employee_id)
      values(p_branch_id,v.variant_id,'supplier_return',-v_qty,v_new,round(coalesce(v.unit_cost,0)::numeric,4),'supplier_return',v_ret::text,v_key||':'||v.variant_id,v_emp);
    else
      select * into v_bal from public.retail_inventory_balances where branch_id=p_branch_id and product_id=v.product_id for update;
      if not found or v_bal.quantity<v_qty then raise exception 'المخزون غير كافٍ لمرتجع المورد للصنف %',v.product_id; end if;
      v_new:=round(v_bal.quantity-v_qty,3);
      update public.retail_inventory_balances set quantity=v_new,updated_at=now() where branch_id=p_branch_id and product_id=v.product_id;
      insert into public.retail_inventory_movements(branch_id,product_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,employee_id)
      values(p_branch_id,v.product_id,'supplier_return',-v_qty,v_new,round(coalesce(v.unit_cost,0)::numeric,4),'supplier_return',v_ret::text,v_key||':'||v.product_id,v_emp);
    end if;
    insert into public.retail_supplier_return_items(supplier_return_id,product_id,variant_id,quantity,unit_cost)
    values(v_ret,v.product_id,v.variant_id,v_qty,round(coalesce(v.unit_cost,0)::numeric,4));
  end loop;
  return v_ret;
end;$$;

-- -----------------------------------------------------------------------------
-- 5) Supplier invoice write/approve + variant-aware three-way match
-- -----------------------------------------------------------------------------
create or replace view public.retail_supplier_invoice_match_v2 as
with po as (
  select i.purchase_order_id,i.product_id,i.variant_id,
         sum(i.quantity_ordered) qty_ordered,
         sum(i.quantity_ordered*i.unit_cost) po_value
  from public.retail_purchase_order_items i
  group by i.purchase_order_id,i.product_id,i.variant_id
), grn as (
  select g.purchase_order_id,gi.product_id,gi.variant_id,
         sum(gi.quantity) qty_received,
         sum(gi.quantity*gi.unit_cost) received_value
  from public.retail_goods_receipts g
  join public.retail_goods_receipt_items gi on gi.goods_receipt_id=g.id
  group by g.purchase_order_id,gi.product_id,gi.variant_id
), inv as (
  select si.id supplier_invoice_id,si.purchase_order_id,sii.product_id,sii.variant_id,
         sum(sii.quantity) qty_invoiced,sum(sii.line_total) invoice_value
  from public.retail_supplier_invoices si
  join public.retail_supplier_invoice_items sii on sii.supplier_invoice_id=si.id
  group by si.id,si.purchase_order_id,sii.product_id,sii.variant_id
)
select inv.supplier_invoice_id,inv.purchase_order_id,inv.product_id,inv.variant_id,
       inv.qty_invoiced,
       coalesce(po.qty_ordered,0)::numeric(14,3) qty_ordered,
       coalesce(grn.qty_received,0)::numeric(14,3) qty_received,
       inv.invoice_value::numeric(14,2),
       coalesce(po.po_value,0)::numeric(14,2) po_value,
       coalesce(grn.received_value,0)::numeric(14,2) received_value,
       (inv.invoice_value-coalesce(grn.received_value,0))::numeric(14,2) invoice_vs_receipt_variance,
       case when inv.qty_invoiced=coalesce(grn.qty_received,0)
                 and abs(inv.invoice_value-coalesce(grn.received_value,0))<0.01
            then 'matched' else 'exception' end match_status
from inv
left join po on po.purchase_order_id=inv.purchase_order_id and po.product_id=inv.product_id and po.variant_id is not distinct from inv.variant_id
left join grn on grn.purchase_order_id=inv.purchase_order_id and grn.product_id=inv.product_id and grn.variant_id is not distinct from inv.variant_id;

grant select on public.retail_supplier_invoice_match_v2 to authenticated;

create or replace function public.retail_supplier_invoice_create_v1(
  p_branch_id bigint,p_supplier_id bigint,p_purchase_order_id bigint,p_invoice_number text,
  p_invoice_date date,p_currency_code text,p_discount_amount numeric,p_tax_amount numeric,
  p_other_charges numeric,p_notes text,p_items jsonb,p_client_tx_id text
) returns bigint
language plpgsql security definer set search_path=public
as $$
declare
  v_id bigint; v_emp bigint; v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v record; v_sub numeric(14,2):=0; v_total numeric(14,2); v_match text;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية فواتير الموردين'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  if nullif(trim(coalesce(p_invoice_number,'')),'') is null then raise exception 'رقم فاتورة المورد مطلوب'; end if;
  if not exists(select 1 from public.retail_suppliers where id=p_supplier_id and active) then raise exception 'المورد غير صالح'; end if;
  if p_purchase_order_id is not null and not exists(select 1 from public.retail_purchase_orders where id=p_purchase_order_id and branch_id=p_branch_id and supplier_id=p_supplier_id) then raise exception 'أمر الشراء غير مطابق'; end if;
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'أضف بندًا واحدًا على الأقل'; end if;

  perform pg_advisory_xact_lock(hashtextextended('supplier-invoice:'||v_key,0));
  select id into v_id from public.retail_supplier_invoices where client_tx_id=v_key;
  if v_id is not null then return v_id; end if;
  v_emp:=public.current_employee_id();

  for v in select * from jsonb_to_recordset(p_items) as x(product_id bigint,variant_id bigint,goods_receipt_item_id bigint,quantity numeric,unit_cost numeric,tax_amount numeric)
  loop
    if coalesce(v.quantity,0)<=0 or coalesce(v.unit_cost,-1)<0 or coalesce(v.tax_amount,0)<0 then raise exception 'بيانات بند فاتورة غير صحيحة'; end if;
    if v.variant_id is not null and not exists(select 1 from public.product_variants where id=v.variant_id and product_id=v.product_id) then raise exception 'Variant غير مطابق'; end if;
    v_sub:=v_sub+round(v.quantity*v.unit_cost,2);
  end loop;
  v_total:=greatest(0,round(v_sub-coalesce(p_discount_amount,0)+coalesce(p_tax_amount,0)+coalesce(p_other_charges,0),2));

  insert into public.retail_supplier_invoices(branch_id,supplier_id,purchase_order_id,invoice_number,invoice_date,currency_code,subtotal,discount_amount,tax_amount,other_charges,total_amount,status,client_tx_id,notes,created_by_employee_id)
  values(p_branch_id,p_supplier_id,p_purchase_order_id,trim(p_invoice_number),coalesce(p_invoice_date,current_date),coalesce(nullif(trim(coalesce(p_currency_code,'')),''),'EGP'),v_sub,greatest(0,coalesce(p_discount_amount,0)),greatest(0,coalesce(p_tax_amount,0)),greatest(0,coalesce(p_other_charges,0)),v_total,'draft',v_key,nullif(trim(coalesce(p_notes,'')),''),v_emp)
  returning id into v_id;

  for v in select * from jsonb_to_recordset(p_items) as x(product_id bigint,variant_id bigint,goods_receipt_item_id bigint,quantity numeric,unit_cost numeric,tax_amount numeric)
  loop
    insert into public.retail_supplier_invoice_items(supplier_invoice_id,product_id,variant_id,goods_receipt_item_id,quantity,unit_cost,tax_amount,line_total)
    values(v_id,v.product_id,v.variant_id,v.goods_receipt_item_id,round(v.quantity,3),round(v.unit_cost,4),round(coalesce(v.tax_amount,0),2),round(v.quantity*v.unit_cost+coalesce(v.tax_amount,0),2));
  end loop;

  select case when bool_and(match_status='matched') then 'matched' else 'exception' end into v_match
  from public.retail_supplier_invoice_match_v2 where supplier_invoice_id=v_id;
  v_match:=coalesce(v_match,'exception');
  update public.retail_supplier_invoices set status=v_match,updated_at=now() where id=v_id;
  insert into public.retail_purchase_workflow_events(entity_type,entity_id,from_status,to_status,note,employee_id)
  values('supplier_invoice',v_id,'draft',v_match,'3-way match calculated',v_emp);
  return v_id;
end;$$;

create or replace function public.retail_supplier_invoice_approve_v1(
  p_supplier_invoice_id bigint,p_accept_exception boolean default false,p_note text default null
) returns text
language plpgsql security definer set search_path=public
as $$
declare v public.retail_supplier_invoices%rowtype; v_emp bigint;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية اعتماد فاتورة المورد'; end if;
  select * into v from public.retail_supplier_invoices where id=p_supplier_invoice_id for update;
  if not found then raise exception 'فاتورة المورد غير موجودة'; end if;
  if not public.has_branch_access(v.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v.status not in('matched','exception') then raise exception 'حالة الفاتورة لا تسمح بالاعتماد'; end if;
  if v.status='exception' and not coalesce(p_accept_exception,false) then raise exception 'الفاتورة بها فروق. يلزم اعتماد الاستثناء صراحة'; end if;
  v_emp:=public.current_employee_id();
  update public.retail_supplier_invoices set status='approved',approved_by_employee_id=v_emp,approved_at=now(),updated_at=now() where id=v.id;
  insert into public.retail_purchase_workflow_events(entity_type,entity_id,from_status,to_status,note,employee_id)
  values('supplier_invoice',v.id,v.status,'approved',nullif(trim(coalesce(p_note,'')),''),v_emp);
  return 'approved';
end;$$;

-- -----------------------------------------------------------------------------
-- 6) Replenishment editor + suggestion -> Purchase Request
-- -----------------------------------------------------------------------------
create or replace function public.retail_reorder_rule_upsert_v1(
  p_branch_id bigint,p_product_id bigint,p_supplier_id bigint,p_min_stock numeric,
  p_target_stock numeric,p_reorder_quantity numeric,p_lead_time_days integer,p_active boolean
) returns bigint
language plpgsql security definer set search_path=public
as $$
declare v_id bigint;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية إعادة الطلب'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if coalesce(p_min_stock,0)<0 or coalesce(p_target_stock,0)<coalesce(p_min_stock,0) or coalesce(p_reorder_quantity,0)<0 or coalesce(p_lead_time_days,0)<0 then raise exception 'قيم إعادة الطلب غير صحيحة'; end if;
  insert into public.retail_reorder_rules(branch_id,product_id,preferred_supplier_id,min_stock,target_stock,reorder_quantity,lead_time_days,active,updated_at)
  values(p_branch_id,p_product_id,p_supplier_id,round(p_min_stock,3),round(p_target_stock,3),round(p_reorder_quantity,3),p_lead_time_days,coalesce(p_active,true),now())
  on conflict(branch_id,product_id) do update set preferred_supplier_id=excluded.preferred_supplier_id,min_stock=excluded.min_stock,target_stock=excluded.target_stock,reorder_quantity=excluded.reorder_quantity,lead_time_days=excluded.lead_time_days,active=excluded.active,updated_at=now()
  returning id into v_id;
  return v_id;
end;$$;

create or replace function public.retail_reorder_suggestion_to_request_v1(
  p_branch_id bigint,p_product_ids jsonb,p_supplier_id bigint,p_client_tx_id text
) returns bigint
language plpgsql security definer set search_path=public
as $$
declare v_items jsonb; v_id bigint;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية إعادة الطلب'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',s.product_id,'quantity',s.suggested_quantity,'estimated_unit_cost',coalesce(b.average_unit_cost,0),
    'needed_by',(current_date+s.lead_time_days)::text,'reason','replenishment'
  )),'[]'::jsonb) into v_items
  from public.retail_reorder_suggestions_v1 s
  left join public.retail_inventory_balances b on b.branch_id=s.branch_id and b.product_id=s.product_id
  where s.branch_id=p_branch_id and s.suggested_quantity>0
    and (p_product_ids is null or jsonb_array_length(p_product_ids)=0 or s.product_id in (select (value::text)::bigint from jsonb_array_elements_text(p_product_ids)));
  if jsonb_array_length(v_items)=0 then raise exception 'لا توجد اقتراحات إعادة طلب محددة'; end if;
  v_id:=public.retail_purchase_request_create_v1(p_branch_id,p_supplier_id,'تم إنشاؤه من اقتراحات إعادة الطلب',v_items,p_client_tx_id);
  return v_id;
end;$$;

-- -----------------------------------------------------------------------------
-- 7) Landed cost capture/allocation. Posting to valuation remains a separate gate.
-- -----------------------------------------------------------------------------
create or replace function public.retail_landed_cost_allocate_v1(
  p_goods_receipt_id bigint,p_cost_type text,p_amount numeric,p_allocation_method text,
  p_manual_allocations jsonb,p_notes text,p_client_tx_id text
) returns bigint
language plpgsql security definer set search_path=public
as $$
declare v_grn public.retail_goods_receipts%rowtype; v_id bigint; v_emp bigint; v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),''); v_den numeric; v record; v_sum numeric:=0;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية التكلفة الإضافية'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'قيمة التكلفة يجب أن تكون أكبر من صفر'; end if;
  if p_allocation_method not in('value','quantity','manual') then raise exception 'طريقة توزيع غير مدعومة'; end if;
  select * into v_grn from public.retail_goods_receipts where id=p_goods_receipt_id;
  if not found then raise exception 'GRN غير موجود'; end if;
  if not public.has_branch_access(v_grn.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  perform pg_advisory_xact_lock(hashtextextended('landed-cost:'||v_key,0));
  select id into v_id from public.retail_landed_costs where client_tx_id=v_key;
  if v_id is not null then return v_id; end if;
  v_emp:=public.current_employee_id();
  insert into public.retail_landed_costs(goods_receipt_id,cost_type,amount,allocation_method,status,client_tx_id,notes,created_by_employee_id)
  values(p_goods_receipt_id,trim(p_cost_type),round(p_amount,2),p_allocation_method,'draft',v_key,nullif(trim(coalesce(p_notes,'')),''),v_emp) returning id into v_id;

  if p_allocation_method='manual' then
    for v in select * from jsonb_to_recordset(coalesce(p_manual_allocations,'[]'::jsonb)) as x(goods_receipt_item_id bigint,allocated_amount numeric)
    loop
      if not exists(select 1 from public.retail_goods_receipt_items where id=v.goods_receipt_item_id and goods_receipt_id=p_goods_receipt_id) then raise exception 'بند GRN غير صالح'; end if;
      if coalesce(v.allocated_amount,-1)<0 then raise exception 'توزيع يدوي غير صالح'; end if;
      insert into public.retail_landed_cost_allocations(landed_cost_id,goods_receipt_item_id,allocated_amount)
      values(v_id,v.goods_receipt_item_id,round(v.allocated_amount,2));
      v_sum:=v_sum+round(v.allocated_amount,2);
    end loop;
    if abs(v_sum-round(p_amount,2))>0.01 then raise exception 'إجمالي التوزيع اليدوي لا يساوي قيمة التكلفة'; end if;
  else
    select case when p_allocation_method='quantity' then sum(quantity) else sum(quantity*unit_cost) end into v_den
    from public.retail_goods_receipt_items where goods_receipt_id=p_goods_receipt_id;
    if coalesce(v_den,0)<=0 then raise exception 'لا توجد قاعدة توزيع'; end if;
    insert into public.retail_landed_cost_allocations(landed_cost_id,goods_receipt_item_id,allocated_amount)
    select v_id,id,round(p_amount*(case when p_allocation_method='quantity' then quantity else quantity*unit_cost end)/v_den,2)
    from public.retail_goods_receipt_items where goods_receipt_id=p_goods_receipt_id;
    select coalesce(sum(allocated_amount),0) into v_sum from public.retail_landed_cost_allocations where landed_cost_id=v_id;
    if abs(v_sum-round(p_amount,2))>0.01 then
      update public.retail_landed_cost_allocations set allocated_amount=allocated_amount+(round(p_amount,2)-v_sum)
      where id=(select id from public.retail_landed_cost_allocations where landed_cost_id=v_id order by allocated_amount desc,id limit 1);
    end if;
  end if;
  update public.retail_landed_costs set status='allocated',updated_at=now() where id=v_id;
  insert into public.retail_purchase_workflow_events(entity_type,entity_id,from_status,to_status,note,employee_id)
  values('landed_cost',v_id,'draft','allocated','Allocation captured; valuation posting intentionally gated',v_emp);
  return v_id;
end;$$;

-- -----------------------------------------------------------------------------
-- 8) Grants
-- -----------------------------------------------------------------------------
revoke all on function public.retail_purchase_order_create_v2(bigint,bigint,text,jsonb,text,text,timestamptz) from public;
revoke all on function public.retail_purchase_receive_v2(bigint,jsonb,text) from public;
revoke all on function public.retail_supplier_return_create_v2(bigint,bigint,text,jsonb,text) from public;
revoke all on function public.retail_supplier_invoice_create_v1(bigint,bigint,bigint,text,date,text,numeric,numeric,numeric,text,jsonb,text) from public;
revoke all on function public.retail_supplier_invoice_approve_v1(bigint,boolean,text) from public;
revoke all on function public.retail_reorder_rule_upsert_v1(bigint,bigint,bigint,numeric,numeric,numeric,integer,boolean) from public;
revoke all on function public.retail_reorder_suggestion_to_request_v1(bigint,jsonb,bigint,text) from public;
revoke all on function public.retail_landed_cost_allocate_v1(bigint,text,numeric,text,jsonb,text,text) from public;

grant execute on function public.retail_purchase_order_create_v2(bigint,bigint,text,jsonb,text,text,timestamptz) to authenticated;
grant execute on function public.retail_purchase_receive_v2(bigint,jsonb,text) to authenticated;
grant execute on function public.retail_supplier_return_create_v2(bigint,bigint,text,jsonb,text) to authenticated;
grant execute on function public.retail_supplier_invoice_create_v1(bigint,bigint,bigint,text,date,text,numeric,numeric,numeric,text,jsonb,text) to authenticated;
grant execute on function public.retail_supplier_invoice_approve_v1(bigint,boolean,text) to authenticated;
grant execute on function public.retail_reorder_rule_upsert_v1(bigint,bigint,bigint,numeric,numeric,numeric,integer,boolean) to authenticated;
grant execute on function public.retail_reorder_suggestion_to_request_v1(bigint,jsonb,bigint,text) to authenticated;
grant execute on function public.retail_landed_cost_allocate_v1(bigint,text,numeric,text,jsonb,text,text) to authenticated;

commit;
