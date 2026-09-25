-- Sharawla POS — Orders Engine V2
-- Additive operational-backend migration. Existing POS orders stay authoritative for finalized sales.

begin;

create table if not exists public.commerce_order_documents (
  id bigserial primary key,
  branch_id bigint not null references public.branches(id) on delete restrict,
  document_number text unique,
  document_type text not null check (document_type in ('quotation','sales_order','custom_order','reservation')),
  status text not null default 'draft' check (status in ('draft','submitted','approved','confirmed','converted','completed','cancelled','expired','rejected')),
  customer_id bigint references public.customers(id) on delete set null,
  customer_name text,
  customer_phone text,
  currency_code text not null default 'EGP',
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  deposit_required numeric(14,2) not null default 0 check (deposit_required >= 0),
  deposit_paid numeric(14,2) not null default 0 check (deposit_paid >= 0),
  due_at timestamptz,
  delivery_at timestamptz,
  expires_at timestamptz,
  source text not null default 'pos',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  client_tx_id text not null unique,
  created_by_employee_id bigint references public.employees(id),
  approved_by_employee_id bigint references public.employees(id),
  approved_at timestamptz,
  converted_order_id bigint references public.orders(id) on delete set null,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_order_documents_deposit_check check (deposit_paid <= total_amount + 0.01),
  constraint commerce_order_documents_dates_check check (expires_at is null or expires_at > created_at)
);

create index if not exists commerce_order_documents_branch_created_idx
  on public.commerce_order_documents(branch_id,created_at desc);
create index if not exists commerce_order_documents_customer_idx
  on public.commerce_order_documents(customer_id,created_at desc);
create index if not exists commerce_order_documents_status_idx
  on public.commerce_order_documents(status,created_at desc);

create table if not exists public.commerce_order_document_items (
  id bigserial primary key,
  document_id bigint not null references public.commerce_order_documents(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete restrict,
  variant_id bigint references public.product_variants(id) on delete restrict,
  product_name text not null,
  variant_name text,
  sku text,
  barcode text,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  unit_cost_snapshot numeric(14,4) not null default 0 check (unit_cost_snapshot >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists commerce_order_document_items_document_idx on public.commerce_order_document_items(document_id,id);

create table if not exists public.commerce_order_document_payments (
  id bigserial primary key,
  document_id bigint not null references public.commerce_order_documents(id) on delete cascade,
  payment_kind text not null default 'deposit' check (payment_kind in ('deposit','payment','refund')),
  method text not null,
  amount numeric(14,2) not null check (amount > 0),
  reference text,
  status text not null default 'confirmed' check (status in ('pending','confirmed','voided')),
  client_tx_id text not null unique,
  employee_id bigint references public.employees(id),
  created_at timestamptz not null default now()
);

create table if not exists public.commerce_order_document_events (
  id bigserial primary key,
  document_id bigint not null references public.commerce_order_documents(id) on delete cascade,
  from_status text,
  to_status text not null,
  event_type text not null,
  note text,
  employee_id bigint references public.employees(id),
  created_at timestamptz not null default now()
);
create index if not exists commerce_order_document_events_document_idx on public.commerce_order_document_events(document_id,created_at);

create table if not exists public.commerce_order_document_attachments (
  id bigserial primary key,
  document_id bigint not null references public.commerce_order_documents(id) on delete cascade,
  attachment_type text not null default 'reference',
  file_url text not null,
  file_name text,
  notes text,
  uploaded_by_employee_id bigint references public.employees(id),
  created_at timestamptz not null default now(),
  constraint commerce_order_attachment_url_not_blank check (trim(file_url) <> '')
);

create or replace function public.commerce_order_document_recalc_v2(p_document_id bigint)
returns public.commerce_order_documents
language plpgsql
security definer
set search_path=public
as $$
declare v_doc public.commerce_order_documents%rowtype; v_sub numeric(14,2); v_disc numeric(14,2); v_tax numeric(14,2); v_total numeric(14,2);
begin
  select * into v_doc from public.commerce_order_documents where id=p_document_id for update;
  if not found then raise exception 'المستند غير موجود'; end if;
  if not public.has_branch_access(v_doc.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  select coalesce(sum(unit_price*quantity),0),coalesce(sum(discount_amount),0),coalesce(sum(tax_amount),0),coalesce(sum(line_total),0)
    into v_sub,v_disc,v_tax,v_total
  from public.commerce_order_document_items where document_id=p_document_id;
  update public.commerce_order_documents
  set subtotal=round(v_sub,2),discount_amount=round(v_disc,2),tax_amount=round(v_tax,2),total_amount=round(v_total,2),updated_at=now()
  where id=p_document_id returning * into v_doc;
  return v_doc;
end;
$$;

create or replace function public.commerce_order_document_create_v2(
  p_branch_id bigint,
  p_document_type text,
  p_customer_id bigint,
  p_customer_name text,
  p_customer_phone text,
  p_due_at timestamptz,
  p_delivery_at timestamptz,
  p_expires_at timestamptz,
  p_deposit_required numeric,
  p_notes text,
  p_metadata jsonb,
  p_items jsonb,
  p_client_tx_id text
) returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare v_id bigint; v_emp bigint; v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),''); v_item record; v_prefix text; v_variant public.product_variants%rowtype; v_product public.products%rowtype; v_line_total numeric(14,2);
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('orders') or public.has_permission('pos')) then raise exception 'ليس لديك صلاحية إدارة الطلبات'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if p_document_type not in ('quotation','sales_order','custom_order','reservation') then raise exception 'نوع المستند غير صحيح'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'أضف صنفًا واحدًا على الأقل'; end if;
  perform pg_advisory_xact_lock(hashtextextended('commerce-doc:'||v_key,0));
  select id into v_id from public.commerce_order_documents where client_tx_id=v_key;
  if v_id is not null then return v_id; end if;
  v_emp:=public.current_employee_id();
  insert into public.commerce_order_documents(branch_id,document_type,customer_id,customer_name,customer_phone,due_at,delivery_at,expires_at,deposit_required,notes,metadata,client_tx_id,created_by_employee_id)
  values(p_branch_id,p_document_type,p_customer_id,nullif(trim(coalesce(p_customer_name,'')),''),nullif(trim(coalesce(p_customer_phone,'')),''),p_due_at,p_delivery_at,p_expires_at,round(greatest(coalesce(p_deposit_required,0),0),2),nullif(trim(coalesce(p_notes,'')),''),coalesce(p_metadata,'{}'::jsonb),v_key,v_emp)
  returning id into v_id;
  v_prefix:=case p_document_type when 'quotation' then 'Q' when 'sales_order' then 'SO' when 'custom_order' then 'CO' else 'RSV' end;
  update public.commerce_order_documents set document_number=v_prefix||'-'||to_char(current_date,'YYMM')||'-'||lpad(v_id::text,6,'0') where id=v_id;

  for v_item in
    select * from jsonb_to_recordset(p_items) as x(product_id bigint,variant_id bigint,quantity numeric,unit_price numeric,discount_amount numeric,tax_amount numeric,notes text,metadata jsonb)
  loop
    if coalesce(v_item.quantity,0)<=0 then raise exception 'كمية غير صحيحة'; end if;
    select * into v_product from public.products where id=v_item.product_id and active is distinct from false;
    if not found then raise exception 'صنف غير صالح %',v_item.product_id; end if;
    if v_item.variant_id is not null then
      select * into v_variant from public.product_variants where id=v_item.variant_id and product_id=v_item.product_id and active=true;
      if not found then raise exception 'Variant غير صالح للصنف %',v_item.product_id; end if;
    else
      v_variant:=null;
    end if;
    v_line_total:=round(greatest((coalesce(v_item.unit_price,coalesce(v_variant.price,v_product.price))*v_item.quantity)-coalesce(v_item.discount_amount,0)+coalesce(v_item.tax_amount,0),0),2);
    insert into public.commerce_order_document_items(document_id,product_id,variant_id,product_name,variant_name,sku,barcode,quantity,unit_price,unit_cost_snapshot,discount_amount,tax_amount,line_total,notes,metadata)
    values(v_id,v_product.id,v_item.variant_id,v_product.name,case when v_item.variant_id is null then null else v_variant.name end,case when v_item.variant_id is null then null else v_variant.sku end,case when v_item.variant_id is null then v_product.barcode else v_variant.barcode end,round(v_item.quantity,3),round(coalesce(v_item.unit_price,coalesce(v_variant.price,v_product.price)),2),round(coalesce(v_variant.cost,v_product.cost,0),4),round(coalesce(v_item.discount_amount,0),2),round(coalesce(v_item.tax_amount,0),2),v_line_total,nullif(trim(coalesce(v_item.notes,'')),''),coalesce(v_item.metadata,'{}'::jsonb));
  end loop;
  perform public.commerce_order_document_recalc_v2(v_id);
  insert into public.commerce_order_document_events(document_id,to_status,event_type,note,employee_id) values(v_id,'draft','created',null,v_emp);
  return v_id;
end;
$$;

create or replace function public.commerce_order_document_submit_v2(p_document_id bigint)
returns public.commerce_order_documents
language plpgsql security definer set search_path=public
as $$
declare v public.commerce_order_documents%rowtype; e bigint;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  select * into v from public.commerce_order_documents where id=p_document_id for update;
  if not found or not public.has_branch_access(v.branch_id) then raise exception 'المستند غير موجود أو غير مصرح'; end if;
  if v.status<>'draft' then raise exception 'يمكن إرسال المسودة فقط'; end if;
  e:=public.current_employee_id();
  update public.commerce_order_documents set status='submitted',updated_at=now() where id=v.id returning * into v;
  insert into public.commerce_order_document_events(document_id,from_status,to_status,event_type,employee_id) values(v.id,'draft','submitted','submit',e);
  return v;
end;$$;

create or replace function public.commerce_order_document_decide_v2(p_document_id bigint,p_approve boolean,p_note text)
returns public.commerce_order_documents
language plpgsql security definer set search_path=public
as $$
declare v public.commerce_order_documents%rowtype; e bigint; ns text;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not public.is_admin() then raise exception 'اعتماد المستند للمدير فقط'; end if;
  select * into v from public.commerce_order_documents where id=p_document_id for update;
  if not found or not public.has_branch_access(v.branch_id) then raise exception 'المستند غير موجود أو غير مصرح'; end if;
  if v.status not in ('submitted','confirmed') then raise exception 'المستند غير جاهز للاعتماد'; end if;
  e:=public.current_employee_id(); ns:=case when p_approve then 'approved' else 'rejected' end;
  update public.commerce_order_documents set status=ns,approved_by_employee_id=case when p_approve then e else null end,approved_at=case when p_approve then now() else null end,updated_at=now() where id=v.id returning * into v;
  insert into public.commerce_order_document_events(document_id,from_status,to_status,event_type,note,employee_id) values(v.id,'submitted',ns,'decision',nullif(trim(coalesce(p_note,'')),''),e);
  return v;
end;$$;

create or replace function public.commerce_order_document_record_payment_v2(p_document_id bigint,p_method text,p_amount numeric,p_reference text,p_client_tx_id text)
returns bigint
language plpgsql security definer set search_path=public
as $$
declare v public.commerce_order_documents%rowtype; pid bigint; e bigint; k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if k is null then raise exception 'معرف الحركة مطلوب'; end if;
  select * into v from public.commerce_order_documents where id=p_document_id for update;
  if not found or not public.has_branch_access(v.branch_id) then raise exception 'المستند غير موجود أو غير مصرح'; end if;
  if v.status in ('cancelled','expired','rejected','converted','completed') then raise exception 'لا يمكن إضافة دفعة لهذا المستند'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'قيمة الدفع غير صحيحة'; end if;
  perform pg_advisory_xact_lock(hashtextextended('commerce-doc-pay:'||k,0));
  select id into pid from public.commerce_order_document_payments where client_tx_id=k;
  if pid is not null then return pid; end if;
  e:=public.current_employee_id();
  insert into public.commerce_order_document_payments(document_id,payment_kind,method,amount,reference,client_tx_id,employee_id)
  values(v.id,'deposit',trim(p_method),round(p_amount,2),nullif(trim(coalesce(p_reference,'')),''),k,e) returning id into pid;
  update public.commerce_order_documents d set deposit_paid=(select coalesce(sum(amount),0) from public.commerce_order_document_payments p where p.document_id=d.id and p.status='confirmed' and p.payment_kind in ('deposit','payment'))-(select coalesce(sum(amount),0) from public.commerce_order_document_payments p where p.document_id=d.id and p.status='confirmed' and p.payment_kind='refund'),updated_at=now() where d.id=v.id;
  return pid;
end;$$;

create or replace function public.commerce_order_document_checkout_payload_v2(p_document_id bigint)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v public.commerce_order_documents%rowtype; items jsonb;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  select * into v from public.commerce_order_documents where id=p_document_id;
  if not found or not public.has_branch_access(v.branch_id) then raise exception 'المستند غير موجود أو غير مصرح'; end if;
  if v.status not in ('approved','confirmed') then raise exception 'المستند غير معتمد للتحويل'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('document_item_id',i.id,'product_id',i.product_id,'variant_id',i.variant_id,'product_name',i.product_name,'variant_name',i.variant_name,'quantity',i.quantity,'unit_price',i.unit_price,'cost',i.unit_cost_snapshot,'total',i.line_total,'notes',i.notes) order by i.id),'[]'::jsonb) into items from public.commerce_order_document_items i where i.document_id=v.id;
  return jsonb_build_object('document',to_jsonb(v),'items',items,'balance_due',greatest(v.total_amount-v.deposit_paid,0));
end;$$;

create or replace function public.commerce_order_document_mark_converted_v2(p_document_id bigint,p_order_id bigint)
returns public.commerce_order_documents
language plpgsql security definer set search_path=public
as $$
declare v public.commerce_order_documents%rowtype; e bigint;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  select * into v from public.commerce_order_documents where id=p_document_id for update;
  if not found or not public.has_branch_access(v.branch_id) then raise exception 'المستند غير موجود أو غير مصرح'; end if;
  if v.status not in ('approved','confirmed') then raise exception 'المستند غير جاهز للتحويل'; end if;
  if not exists(select 1 from public.orders o where o.id=p_order_id and o.branch_id=v.branch_id) then raise exception 'الفاتورة النهائية غير موجودة أو فرعها مختلف'; end if;
  e:=public.current_employee_id();
  update public.commerce_order_documents set status='converted',converted_order_id=p_order_id,converted_at=now(),updated_at=now() where id=v.id returning * into v;
  insert into public.commerce_order_document_events(document_id,from_status,to_status,event_type,note,employee_id) values(v.id,'approved','converted','convert','POS order #'||p_order_id,e);
  return v;
end;$$;

create or replace function public.commerce_order_document_cancel_v2(p_document_id bigint,p_reason text)
returns public.commerce_order_documents
language plpgsql security definer set search_path=public
as $$
declare v public.commerce_order_documents%rowtype; e bigint; os text;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  select * into v from public.commerce_order_documents where id=p_document_id for update;
  if not found or not public.has_branch_access(v.branch_id) then raise exception 'المستند غير موجود أو غير مصرح'; end if;
  if v.status in ('converted','completed','cancelled') then raise exception 'لا يمكن إلغاء المستند في حالته الحالية'; end if;
  os:=v.status;e:=public.current_employee_id();
  update public.commerce_order_documents set status='cancelled',updated_at=now() where id=v.id returning * into v;
  insert into public.commerce_order_document_events(document_id,from_status,to_status,event_type,note,employee_id) values(v.id,os,'cancelled','cancel',nullif(trim(coalesce(p_reason,'')),''),e);
  return v;
end;$$;

alter table public.commerce_order_documents enable row level security;
alter table public.commerce_order_document_items enable row level security;
alter table public.commerce_order_document_payments enable row level security;
alter table public.commerce_order_document_events enable row level security;
alter table public.commerce_order_document_attachments enable row level security;

drop policy if exists commerce_order_documents_select_v2 on public.commerce_order_documents;
create policy commerce_order_documents_select_v2 on public.commerce_order_documents for select to authenticated using (public.has_branch_access(branch_id));
drop policy if exists commerce_order_document_items_select_v2 on public.commerce_order_document_items;
create policy commerce_order_document_items_select_v2 on public.commerce_order_document_items for select to authenticated using (exists(select 1 from public.commerce_order_documents d where d.id=document_id and public.has_branch_access(d.branch_id)));
drop policy if exists commerce_order_document_payments_select_v2 on public.commerce_order_document_payments;
create policy commerce_order_document_payments_select_v2 on public.commerce_order_document_payments for select to authenticated using (exists(select 1 from public.commerce_order_documents d where d.id=document_id and public.has_branch_access(d.branch_id)));
drop policy if exists commerce_order_document_events_select_v2 on public.commerce_order_document_events;
create policy commerce_order_document_events_select_v2 on public.commerce_order_document_events for select to authenticated using (exists(select 1 from public.commerce_order_documents d where d.id=document_id and public.has_branch_access(d.branch_id)));
drop policy if exists commerce_order_document_attachments_select_v2 on public.commerce_order_document_attachments;
create policy commerce_order_document_attachments_select_v2 on public.commerce_order_document_attachments for select to authenticated using (exists(select 1 from public.commerce_order_documents d where d.id=document_id and public.has_branch_access(d.branch_id)));

revoke insert,update,delete on public.commerce_order_documents,public.commerce_order_document_items,public.commerce_order_document_payments,public.commerce_order_document_events,public.commerce_order_document_attachments from authenticated;
grant select on public.commerce_order_documents,public.commerce_order_document_items,public.commerce_order_document_payments,public.commerce_order_document_events,public.commerce_order_document_attachments to authenticated;
grant execute on function public.commerce_order_document_create_v2(bigint,text,bigint,text,text,timestamptz,timestamptz,timestamptz,numeric,text,jsonb,jsonb,text) to authenticated;
grant execute on function public.commerce_order_document_submit_v2(bigint) to authenticated;
grant execute on function public.commerce_order_document_decide_v2(bigint,boolean,text) to authenticated;
grant execute on function public.commerce_order_document_record_payment_v2(bigint,text,numeric,text,text) to authenticated;
grant execute on function public.commerce_order_document_checkout_payload_v2(bigint) to authenticated;
grant execute on function public.commerce_order_document_mark_converted_v2(bigint,bigint) to authenticated;
grant execute on function public.commerce_order_document_cancel_v2(bigint,text) to authenticated;

comment on table public.commerce_order_documents is 'Unified pre-sale order document engine. Finalized fiscal/POS sale remains public.orders.';

commit;
