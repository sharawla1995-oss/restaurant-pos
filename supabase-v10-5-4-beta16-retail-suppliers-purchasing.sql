-- Sharawla POS V10.5.4-beta.16 — Retail Suppliers & Purchasing Foundation
-- Apply to the isolated Beta operational backend first.
-- Builds on beta.15 Retail Inventory Foundation; does not replace Restaurant flows.

alter table public.retail_inventory_balances add column if not exists average_unit_cost numeric(14,4) not null default 0;
alter table public.retail_inventory_balances add column if not exists last_purchase_cost numeric(14,4) not null default 0;

create table if not exists public.retail_suppliers(
 id bigserial primary key,
 name text not null,
 phone text null,
 tax_no text null,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.retail_purchase_orders(
 id bigserial primary key,
 branch_id bigint not null references public.branches(id) on delete restrict,
 supplier_id bigint not null references public.retail_suppliers(id) on delete restrict,
 status text not null default 'draft' check(status in('draft','approved','partially_received','received','cancelled')),
 notes text null,
 client_tx_id text not null unique,
 created_by_employee_id bigint null references public.employees(id),
 approved_by_employee_id bigint null references public.employees(id),
 approved_at timestamptz null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.retail_purchase_order_items(
 id bigserial primary key,
 purchase_order_id bigint not null references public.retail_purchase_orders(id) on delete cascade,
 product_id bigint not null references public.products(id) on delete restrict,
 quantity_ordered numeric(14,3) not null check(quantity_ordered>0),
 quantity_received numeric(14,3) not null default 0 check(quantity_received>=0),
 unit_cost numeric(14,4) not null check(unit_cost>=0),
 unique(purchase_order_id,product_id)
);
create table if not exists public.retail_goods_receipts(
 id bigserial primary key,
 purchase_order_id bigint not null references public.retail_purchase_orders(id) on delete restrict,
 branch_id bigint not null references public.branches(id) on delete restrict,
 supplier_id bigint not null references public.retail_suppliers(id) on delete restrict,
 client_tx_id text not null unique,
 created_by_employee_id bigint null references public.employees(id),
 received_at timestamptz not null default now()
);
create table if not exists public.retail_goods_receipt_items(
 id bigserial primary key,
 goods_receipt_id bigint not null references public.retail_goods_receipts(id) on delete cascade,
 purchase_order_item_id bigint not null references public.retail_purchase_order_items(id) on delete restrict,
 product_id bigint not null references public.products(id) on delete restrict,
 quantity numeric(14,3) not null check(quantity>0),
 unit_cost numeric(14,4) not null check(unit_cost>=0)
);
create table if not exists public.retail_supplier_returns(
 id bigserial primary key,
 branch_id bigint not null references public.branches(id) on delete restrict,
 supplier_id bigint not null references public.retail_suppliers(id) on delete restrict,
 notes text null,
 client_tx_id text not null unique,
 created_by_employee_id bigint null references public.employees(id),
 created_at timestamptz not null default now()
);
create table if not exists public.retail_supplier_return_items(
 id bigserial primary key,
 supplier_return_id bigint not null references public.retail_supplier_returns(id) on delete cascade,
 product_id bigint not null references public.products(id) on delete restrict,
 quantity numeric(14,3) not null check(quantity>0),
 unit_cost numeric(14,4) not null check(unit_cost>=0)
);

create index if not exists retail_po_branch_created_idx on public.retail_purchase_orders(branch_id,created_at desc);
create index if not exists retail_grn_branch_received_idx on public.retail_goods_receipts(branch_id,received_at desc);
create index if not exists retail_supplier_returns_branch_created_idx on public.retail_supplier_returns(branch_id,created_at desc);

alter table public.retail_suppliers enable row level security;
alter table public.retail_purchase_orders enable row level security;
alter table public.retail_purchase_order_items enable row level security;
alter table public.retail_goods_receipts enable row level security;
alter table public.retail_goods_receipt_items enable row level security;
alter table public.retail_supplier_returns enable row level security;
alter table public.retail_supplier_return_items enable row level security;

drop policy if exists retail_suppliers_select on public.retail_suppliers;
create policy retail_suppliers_select on public.retail_suppliers for select to authenticated using(true);
drop policy if exists retail_po_select on public.retail_purchase_orders;
create policy retail_po_select on public.retail_purchase_orders for select to authenticated using(public.has_branch_access(branch_id));
drop policy if exists retail_po_items_select on public.retail_purchase_order_items;
create policy retail_po_items_select on public.retail_purchase_order_items for select to authenticated using(exists(select 1 from public.retail_purchase_orders po where po.id=purchase_order_id and public.has_branch_access(po.branch_id)));
drop policy if exists retail_grn_select on public.retail_goods_receipts;
create policy retail_grn_select on public.retail_goods_receipts for select to authenticated using(public.has_branch_access(branch_id));
drop policy if exists retail_grn_items_select on public.retail_goods_receipt_items;
create policy retail_grn_items_select on public.retail_goods_receipt_items for select to authenticated using(exists(select 1 from public.retail_goods_receipts g where g.id=goods_receipt_id and public.has_branch_access(g.branch_id)));
drop policy if exists retail_supplier_returns_select on public.retail_supplier_returns;
create policy retail_supplier_returns_select on public.retail_supplier_returns for select to authenticated using(public.has_branch_access(branch_id));
drop policy if exists retail_supplier_return_items_select on public.retail_supplier_return_items;
create policy retail_supplier_return_items_select on public.retail_supplier_return_items for select to authenticated using(exists(select 1 from public.retail_supplier_returns r where r.id=supplier_return_id and public.has_branch_access(r.branch_id)));

grant select on public.retail_suppliers,public.retail_purchase_orders,public.retail_purchase_order_items,public.retail_goods_receipts,public.retail_goods_receipt_items,public.retail_supplier_returns,public.retail_supplier_return_items to authenticated;
revoke insert,update,delete on public.retail_suppliers,public.retail_purchase_orders,public.retail_purchase_order_items,public.retail_goods_receipts,public.retail_goods_receipt_items,public.retail_supplier_returns,public.retail_supplier_return_items from authenticated;

create or replace function public.retail_supplier_create(p_name text,p_phone text,p_tax_no text) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_id bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية الموردين'; end if;
 if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'اسم المورد مطلوب'; end if;
 insert into public.retail_suppliers(name,phone,tax_no) values(trim(p_name),nullif(trim(coalesce(p_phone,'')),''),nullif(trim(coalesce(p_tax_no,'')),'')) returning id into v_id;
 return v_id;
end;$$;
revoke all on function public.retail_supplier_create(text,text,text) from public; grant execute on function public.retail_supplier_create(text,text,text) to authenticated;

create or replace function public.retail_purchase_order_create(p_branch_id bigint,p_supplier_id bigint,p_notes text,p_items jsonb,p_client_tx_id text) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_id bigint;v_emp bigint;v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v record;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية المشتريات'; end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
 if not exists(select 1 from public.retail_suppliers where id=p_supplier_id and active) then raise exception 'المورد غير موجود أو موقوف'; end if;
 if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'أضف صنفًا واحدًا على الأقل'; end if;
 perform pg_advisory_xact_lock(hashtextextended('retail-po:'||v_key,0));
 select id into v_id from public.retail_purchase_orders where client_tx_id=v_key; if v_id is not null then return v_id; end if;
 v_emp:=public.current_employee_id();
 insert into public.retail_purchase_orders(branch_id,supplier_id,notes,client_tx_id,created_by_employee_id) values(p_branch_id,p_supplier_id,nullif(trim(coalesce(p_notes,'')),''),v_key,v_emp) returning id into v_id;
 for v in select * from jsonb_to_recordset(p_items) as x(product_id bigint,quantity numeric,unit_cost numeric) loop
  if coalesce(v.quantity,0)<=0 or coalesce(v.unit_cost,-1)<0 then raise exception 'كمية/تكلفة غير صحيحة'; end if;
  if not exists(select 1 from public.products where id=v.product_id and active is distinct from false) then raise exception 'صنف غير صالح %',v.product_id; end if;
  insert into public.retail_purchase_order_items(purchase_order_id,product_id,quantity_ordered,unit_cost) values(v_id,v.product_id,round(v.quantity,3),round(v.unit_cost,4));
 end loop;
 return v_id;
end;$$;
revoke all on function public.retail_purchase_order_create(bigint,bigint,text,jsonb,text) from public; grant execute on function public.retail_purchase_order_create(bigint,bigint,text,jsonb,text) to authenticated;

create or replace function public.retail_purchase_order_approve(p_purchase_order_id bigint) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_po public.retail_purchase_orders%rowtype;v_emp bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية اعتماد المشتريات'; end if;
 select * into v_po from public.retail_purchase_orders where id=p_purchase_order_id for update;
 if not found then raise exception 'أمر الشراء غير موجود'; end if;
 if not public.has_branch_access(v_po.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 if v_po.status<>'draft' then raise exception 'يمكن اعتماد المسودة فقط'; end if;
 v_emp:=public.current_employee_id(); update public.retail_purchase_orders set status='approved',approved_by_employee_id=v_emp,approved_at=now(),updated_at=now() where id=v_po.id; return v_po.id;
end;$$;
revoke all on function public.retail_purchase_order_approve(bigint) from public; grant execute on function public.retail_purchase_order_approve(bigint) to authenticated;

create or replace function public.retail_purchase_receive(p_purchase_order_id bigint,p_items jsonb,p_client_tx_id text) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_po public.retail_purchase_orders%rowtype;v_grn bigint;v_emp bigint;v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v record;v_line public.retail_purchase_order_items%rowtype;v_bal public.retail_inventory_balances%rowtype;v_qty numeric(14,3);v_new numeric(14,3);v_avg numeric(14,4);
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية الاستلام'; end if;
 if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
 perform pg_advisory_xact_lock(hashtextextended('retail-grn:'||v_key,0)); select id into v_grn from public.retail_goods_receipts where client_tx_id=v_key; if v_grn is not null then return v_grn; end if;
 select * into v_po from public.retail_purchase_orders where id=p_purchase_order_id for update;
 if not found then raise exception 'أمر الشراء غير موجود'; end if; if not public.has_branch_access(v_po.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 if v_po.status not in('approved','partially_received') then raise exception 'أمر الشراء غير جاهز للاستلام'; end if;
 if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'لا توجد كميات للاستلام'; end if;
 v_emp:=public.current_employee_id(); insert into public.retail_goods_receipts(purchase_order_id,branch_id,supplier_id,client_tx_id,created_by_employee_id) values(v_po.id,v_po.branch_id,v_po.supplier_id,v_key,v_emp) returning id into v_grn;
 for v in select * from jsonb_to_recordset(p_items) as x(purchase_order_item_id bigint,quantity numeric) loop
  select * into v_line from public.retail_purchase_order_items where id=v.purchase_order_item_id and purchase_order_id=v_po.id for update; if not found then raise exception 'صنف الاستلام غير موجود في أمر الشراء'; end if;
  v_qty:=round(coalesce(v.quantity,0)::numeric,3); if v_qty<=0 then raise exception 'كمية الاستلام يجب أن تكون أكبر من صفر'; end if; if v_line.quantity_received+v_qty>v_line.quantity_ordered then raise exception 'كمية الاستلام تتجاوز المتبقي للصنف %',v_line.product_id; end if;
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
revoke all on function public.retail_purchase_receive(bigint,jsonb,text) from public; grant execute on function public.retail_purchase_receive(bigint,jsonb,text) to authenticated;

create or replace function public.retail_supplier_return_create(p_branch_id bigint,p_supplier_id bigint,p_notes text,p_items jsonb,p_client_tx_id text) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_ret bigint;v_emp bigint;v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v record;v_bal public.retail_inventory_balances%rowtype;v_qty numeric(14,3);v_new numeric(14,3);
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if; if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية مرتجع المورد'; end if; if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if; if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
 if not exists(select 1 from public.retail_suppliers where id=p_supplier_id and active) then raise exception 'المورد غير موجود أو موقوف'; end if;
 perform pg_advisory_xact_lock(hashtextextended('retail-supplier-return:'||v_key,0)); select id into v_ret from public.retail_supplier_returns where client_tx_id=v_key; if v_ret is not null then return v_ret; end if;
 v_emp:=public.current_employee_id(); insert into public.retail_supplier_returns(branch_id,supplier_id,notes,client_tx_id,created_by_employee_id) values(p_branch_id,p_supplier_id,nullif(trim(coalesce(p_notes,'')),''),v_key,v_emp) returning id into v_ret;
 for v in select * from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) as x(product_id bigint,quantity numeric,unit_cost numeric) loop
  v_qty:=round(coalesce(v.quantity,0)::numeric,3); if v_qty<=0 then raise exception 'كمية المرتجع يجب أن تكون أكبر من صفر'; end if;
  select * into v_bal from public.retail_inventory_balances where branch_id=p_branch_id and product_id=v.product_id for update; if not found or v_bal.quantity<v_qty then raise exception 'المخزون غير كافٍ لمرتجع المورد للصنف %',v.product_id; end if;
  v_new:=round(v_bal.quantity-v_qty,3); update public.retail_inventory_balances set quantity=v_new,updated_at=now() where branch_id=p_branch_id and product_id=v.product_id;
  insert into public.retail_supplier_return_items(supplier_return_id,product_id,quantity,unit_cost) values(v_ret,v.product_id,v_qty,round(coalesce(v.unit_cost,0)::numeric,4));
  insert into public.retail_inventory_movements(branch_id,product_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,employee_id) values(p_branch_id,v.product_id,'supplier_return',-v_qty,v_new,round(coalesce(v.unit_cost,0)::numeric,4),'supplier_return',v_ret::text,v_key||':'||v.product_id,v_emp);
 end loop; return v_ret;
end;$$;
revoke all on function public.retail_supplier_return_create(bigint,bigint,text,jsonb,text) from public; grant execute on function public.retail_supplier_return_create(bigint,bigint,text,jsonb,text) to authenticated;

notify pgrst,'reload schema';
