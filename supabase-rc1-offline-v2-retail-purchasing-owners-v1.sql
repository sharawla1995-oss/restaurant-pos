-- Sharawla RC1 — Retail Offline Sync Owners V1
-- SOURCE ONLY. Do not deploy without explicit Beta DB authorization.
-- Adds replay-safe Retail supplier create + PO approval owners.
begin;

create table if not exists public.retail_offline_supplier_receipts(
  client_tx_id text primary key,
  supplier_id bigint not null references public.retail_suppliers(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.retail_offline_po_approval_receipts(
  client_tx_id text primary key,
  purchase_order_id bigint not null references public.retail_purchase_orders(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.retail_offline_supplier_receipts enable row level security;
alter table public.retail_offline_po_approval_receipts enable row level security;
revoke all on public.retail_offline_supplier_receipts, public.retail_offline_po_approval_receipts from public, authenticated;

create or replace function public.offline_retail_supplier_create_v1(
  p_name text,p_phone text,p_tax_no text,p_client_tx_id text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),''); v_id bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية الموردين'; end if;
 if v_tx is null then raise exception 'معرف الحركة مطلوب'; end if;
 if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'اسم المورد مطلوب'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-retail-supplier:'||v_tx,0));
 select supplier_id into v_id from public.retail_offline_supplier_receipts where client_tx_id=v_tx;
 if v_id is not null then return jsonb_build_object('supplier_id',v_id,'replayed',true); end if;
 insert into public.retail_suppliers(name,phone,tax_no)
 values(trim(p_name),nullif(trim(coalesce(p_phone,'')),''),nullif(trim(coalesce(p_tax_no,'')),''))
 returning id into v_id;
 insert into public.retail_offline_supplier_receipts(client_tx_id,supplier_id) values(v_tx,v_id);
 return jsonb_build_object('supplier_id',v_id,'replayed',false);
end;$$;

create or replace function public.offline_retail_purchase_order_approve_v1(
  p_purchase_order_id bigint,p_client_tx_id text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),''); v_id bigint; v_po public.retail_purchase_orders%rowtype; v_emp bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية اعتماد المشتريات'; end if;
 if v_tx is null then raise exception 'معرف الحركة مطلوب'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-retail-po-approve:'||v_tx,0));
 select purchase_order_id into v_id from public.retail_offline_po_approval_receipts where client_tx_id=v_tx;
 if v_id is not null then
   if v_id<>p_purchase_order_id then raise exception 'معرف الحركة مستخدم لأمر شراء آخر'; end if;
   return jsonb_build_object('purchase_order_id',v_id,'replayed',true);
 end if;
 select * into v_po from public.retail_purchase_orders where id=p_purchase_order_id for update;
 if not found then raise exception 'أمر الشراء غير موجود'; end if;
 if not public.has_branch_access(v_po.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 if v_po.status<>'draft' then raise exception 'يمكن اعتماد المسودة فقط'; end if;
 v_emp:=public.current_employee_id();
 update public.retail_purchase_orders set status='approved',approved_by_employee_id=v_emp,approved_at=now(),updated_at=now() where id=v_po.id;
 insert into public.retail_offline_po_approval_receipts(client_tx_id,purchase_order_id) values(v_tx,v_po.id);
 return jsonb_build_object('purchase_order_id',v_po.id,'replayed',false);
end;$$;

revoke all on function public.offline_retail_supplier_create_v1(text,text,text,text) from public;
revoke all on function public.offline_retail_purchase_order_approve_v1(bigint,text) from public;
grant execute on function public.offline_retail_supplier_create_v1(text,text,text,text) to authenticated;
grant execute on function public.offline_retail_purchase_order_approve_v1(bigint,text) to authenticated;
commit;
