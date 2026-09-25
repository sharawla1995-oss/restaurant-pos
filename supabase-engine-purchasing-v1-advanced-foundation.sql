-- Sharawla POS — Advanced Purchasing Engine V1 Foundation
-- Additive operational-backend migration for isolated Beta first.
-- Builds on existing Retail Purchasing (PO -> approve -> partial/full receive -> weighted average cost -> supplier return).
-- Existing purchase functions and current retail checkout/inventory behavior are intentionally untouched.

begin;

-- -----------------------------------------------------------------------------
-- 1) Supplier commercial terms
-- -----------------------------------------------------------------------------
alter table public.retail_suppliers
  add column if not exists email text,
  add column if not exists address text,
  add column if not exists payment_terms_days integer not null default 0,
  add column if not exists credit_limit numeric(14,2) not null default 0,
  add column if not exists default_lead_time_days integer not null default 0,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.retail_suppliers
  drop constraint if exists retail_suppliers_payment_terms_days_check,
  add constraint retail_suppliers_payment_terms_days_check check (payment_terms_days >= 0),
  drop constraint if exists retail_suppliers_credit_limit_check,
  add constraint retail_suppliers_credit_limit_check check (credit_limit >= 0),
  drop constraint if exists retail_suppliers_default_lead_time_days_check,
  add constraint retail_suppliers_default_lead_time_days_check check (default_lead_time_days >= 0);

-- -----------------------------------------------------------------------------
-- 2) Internal Purchase Requests (PR)
-- -----------------------------------------------------------------------------
create table if not exists public.retail_purchase_requests (
  id bigserial primary key,
  branch_id bigint not null references public.branches(id) on delete restrict,
  preferred_supplier_id bigint references public.retail_suppliers(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft','submitted','approved','rejected','converted','cancelled')),
  notes text,
  client_tx_id text not null unique,
  requested_by_employee_id bigint references public.employees(id),
  submitted_at timestamptz,
  decided_by_employee_id bigint references public.employees(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.retail_purchase_request_items (
  id bigserial primary key,
  purchase_request_id bigint not null references public.retail_purchase_requests(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete restrict,
  quantity_requested numeric(14,3) not null check (quantity_requested > 0),
  quantity_approved numeric(14,3) not null default 0 check (quantity_approved >= 0),
  estimated_unit_cost numeric(14,4) not null default 0 check (estimated_unit_cost >= 0),
  needed_by date,
  reason text,
  created_at timestamptz not null default now(),
  unique(purchase_request_id,product_id)
);

create index if not exists retail_purchase_requests_branch_created_idx
  on public.retail_purchase_requests(branch_id,created_at desc);
create index if not exists retail_purchase_requests_status_idx
  on public.retail_purchase_requests(status,created_at desc);

-- Link a future/created PO back to its source request without changing existing PO behavior.
alter table public.retail_purchase_orders
  add column if not exists po_number text,
  add column if not exists expected_at timestamptz,
  add column if not exists source_request_id bigint references public.retail_purchase_requests(id) on delete set null,
  add column if not exists currency_code text;

create unique index if not exists retail_purchase_orders_po_number_uidx
  on public.retail_purchase_orders(lower(trim(po_number)))
  where po_number is not null and trim(po_number) <> '';

-- -----------------------------------------------------------------------------
-- 3) Approval / workflow audit trail
-- -----------------------------------------------------------------------------
create table if not exists public.retail_purchase_approval_events (
  id bigserial primary key,
  entity_type text not null check (entity_type in ('purchase_request','purchase_order')),
  entity_id bigint not null,
  approval_level integer not null default 1 check (approval_level > 0),
  decision text not null check (decision in ('approved','rejected')),
  note text,
  employee_id bigint references public.employees(id),
  created_at timestamptz not null default now()
);
create index if not exists retail_purchase_approval_events_entity_idx
  on public.retail_purchase_approval_events(entity_type,entity_id,created_at);

create table if not exists public.retail_purchase_workflow_events (
  id bigserial primary key,
  entity_type text not null check (entity_type in ('purchase_request','purchase_order','goods_receipt','supplier_invoice','landed_cost')),
  entity_id bigint not null,
  from_status text,
  to_status text not null,
  note text,
  employee_id bigint references public.employees(id),
  created_at timestamptz not null default now()
);
create index if not exists retail_purchase_workflow_events_entity_idx
  on public.retail_purchase_workflow_events(entity_type,entity_id,created_at);

-- -----------------------------------------------------------------------------
-- 4) Supplier invoices + three-way matching foundation
--    PO / Goods Receipt / Supplier Invoice are separate documents.
-- -----------------------------------------------------------------------------
create table if not exists public.retail_supplier_invoices (
  id bigserial primary key,
  branch_id bigint not null references public.branches(id) on delete restrict,
  supplier_id bigint not null references public.retail_suppliers(id) on delete restrict,
  purchase_order_id bigint references public.retail_purchase_orders(id) on delete set null,
  invoice_number text not null,
  invoice_date date not null default current_date,
  currency_code text,
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  other_charges numeric(14,2) not null default 0 check (other_charges >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  status text not null default 'draft'
    check (status in ('draft','matched','exception','approved','posted','cancelled')),
  client_tx_id text not null unique,
  notes text,
  created_by_employee_id bigint references public.employees(id),
  approved_by_employee_id bigint references public.employees(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(supplier_id,invoice_number)
);

create table if not exists public.retail_supplier_invoice_items (
  id bigserial primary key,
  supplier_invoice_id bigint not null references public.retail_supplier_invoices(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete restrict,
  goods_receipt_item_id bigint references public.retail_goods_receipt_items(id) on delete set null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  line_total numeric(14,2) not null check (line_total >= 0)
);
create index if not exists retail_supplier_invoices_branch_date_idx
  on public.retail_supplier_invoices(branch_id,invoice_date desc);
create index if not exists retail_supplier_invoices_po_idx
  on public.retail_supplier_invoices(purchase_order_id);

-- -----------------------------------------------------------------------------
-- 5) Landed cost documents (freight, customs, handling, insurance...)
--    Allocation is captured separately; posting to average cost is a later gate.
-- -----------------------------------------------------------------------------
create table if not exists public.retail_landed_costs (
  id bigserial primary key,
  goods_receipt_id bigint not null references public.retail_goods_receipts(id) on delete restrict,
  cost_type text not null,
  amount numeric(14,2) not null check (amount > 0),
  allocation_method text not null default 'value'
    check (allocation_method in ('value','quantity','manual')),
  status text not null default 'draft'
    check (status in ('draft','allocated','posted','cancelled')),
  client_tx_id text not null unique,
  notes text,
  created_by_employee_id bigint references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.retail_landed_cost_allocations (
  id bigserial primary key,
  landed_cost_id bigint not null references public.retail_landed_costs(id) on delete cascade,
  goods_receipt_item_id bigint not null references public.retail_goods_receipt_items(id) on delete restrict,
  allocated_amount numeric(14,2) not null check (allocated_amount >= 0),
  unique(landed_cost_id,goods_receipt_item_id)
);

-- -----------------------------------------------------------------------------
-- 6) Reorder rules + live suggestions
-- -----------------------------------------------------------------------------
create table if not exists public.retail_reorder_rules (
  id bigserial primary key,
  branch_id bigint not null references public.branches(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade,
  preferred_supplier_id bigint references public.retail_suppliers(id) on delete set null,
  min_stock numeric(14,3) not null default 0 check (min_stock >= 0),
  target_stock numeric(14,3) not null default 0 check (target_stock >= 0),
  reorder_quantity numeric(14,3) not null default 0 check (reorder_quantity >= 0),
  lead_time_days integer not null default 0 check (lead_time_days >= 0),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique(branch_id,product_id),
  constraint retail_reorder_rules_target_gte_min check (target_stock >= min_stock)
);

create or replace view public.retail_reorder_suggestions_v1 as
select
  r.id as rule_id,
  r.branch_id,
  r.product_id,
  p.name as product_name,
  r.preferred_supplier_id,
  coalesce(b.quantity,0)::numeric(14,3) as current_quantity,
  r.min_stock,
  r.target_stock,
  r.reorder_quantity,
  case
    when coalesce(b.quantity,0) > r.min_stock then 0::numeric
    else greatest(r.reorder_quantity, r.target_stock-coalesce(b.quantity,0))
  end::numeric(14,3) as suggested_quantity,
  r.lead_time_days
from public.retail_reorder_rules r
join public.products p on p.id=r.product_id
left join public.retail_inventory_balances b
  on b.branch_id=r.branch_id and b.product_id=r.product_id
where r.active=true and p.active is distinct from false;

-- -----------------------------------------------------------------------------
-- 7) Three-way match read model
-- -----------------------------------------------------------------------------
create or replace view public.retail_supplier_invoice_match_v1 as
with po as (
  select i.purchase_order_id,i.product_id,
         sum(i.quantity_ordered) qty_ordered,
         sum(i.quantity_ordered*i.unit_cost) po_value
  from public.retail_purchase_order_items i
  group by i.purchase_order_id,i.product_id
), grn as (
  select g.purchase_order_id,gi.product_id,
         sum(gi.quantity) qty_received,
         sum(gi.quantity*gi.unit_cost) received_value
  from public.retail_goods_receipts g
  join public.retail_goods_receipt_items gi on gi.goods_receipt_id=g.id
  group by g.purchase_order_id,gi.product_id
), inv as (
  select si.id supplier_invoice_id,si.purchase_order_id,sii.product_id,
         sum(sii.quantity) qty_invoiced,
         sum(sii.line_total) invoice_value
  from public.retail_supplier_invoices si
  join public.retail_supplier_invoice_items sii on sii.supplier_invoice_id=si.id
  group by si.id,si.purchase_order_id,sii.product_id
)
select
  inv.supplier_invoice_id,
  inv.purchase_order_id,
  inv.product_id,
  inv.qty_invoiced,
  coalesce(po.qty_ordered,0)::numeric(14,3) as qty_ordered,
  coalesce(grn.qty_received,0)::numeric(14,3) as qty_received,
  inv.invoice_value::numeric(14,2),
  coalesce(po.po_value,0)::numeric(14,2) as po_value,
  coalesce(grn.received_value,0)::numeric(14,2) as received_value,
  (inv.invoice_value-coalesce(grn.received_value,0))::numeric(14,2) as invoice_vs_receipt_variance,
  case
    when inv.qty_invoiced=coalesce(grn.qty_received,0)
     and abs(inv.invoice_value-coalesce(grn.received_value,0)) < 0.01 then 'matched'
    else 'exception'
  end as match_status
from inv
left join po on po.purchase_order_id=inv.purchase_order_id and po.product_id=inv.product_id
left join grn on grn.purchase_order_id=inv.purchase_order_id and grn.product_id=inv.product_id;

-- -----------------------------------------------------------------------------
-- 8) RLS and read access. Writes remain RPC-only / future UI-safe.
-- -----------------------------------------------------------------------------
alter table public.retail_purchase_requests enable row level security;
alter table public.retail_purchase_request_items enable row level security;
alter table public.retail_purchase_approval_events enable row level security;
alter table public.retail_purchase_workflow_events enable row level security;
alter table public.retail_supplier_invoices enable row level security;
alter table public.retail_supplier_invoice_items enable row level security;
alter table public.retail_landed_costs enable row level security;
alter table public.retail_landed_cost_allocations enable row level security;
alter table public.retail_reorder_rules enable row level security;

drop policy if exists retail_purchase_requests_select_v1 on public.retail_purchase_requests;
create policy retail_purchase_requests_select_v1 on public.retail_purchase_requests for select to authenticated
using (public.has_branch_access(branch_id));

drop policy if exists retail_purchase_request_items_select_v1 on public.retail_purchase_request_items;
create policy retail_purchase_request_items_select_v1 on public.retail_purchase_request_items for select to authenticated
using (exists(select 1 from public.retail_purchase_requests r where r.id=purchase_request_id and public.has_branch_access(r.branch_id)));

drop policy if exists retail_supplier_invoices_select_v1 on public.retail_supplier_invoices;
create policy retail_supplier_invoices_select_v1 on public.retail_supplier_invoices for select to authenticated
using (public.has_branch_access(branch_id));

drop policy if exists retail_supplier_invoice_items_select_v1 on public.retail_supplier_invoice_items;
create policy retail_supplier_invoice_items_select_v1 on public.retail_supplier_invoice_items for select to authenticated
using (exists(select 1 from public.retail_supplier_invoices i where i.id=supplier_invoice_id and public.has_branch_access(i.branch_id)));

drop policy if exists retail_reorder_rules_select_v1 on public.retail_reorder_rules;
create policy retail_reorder_rules_select_v1 on public.retail_reorder_rules for select to authenticated
using (public.has_branch_access(branch_id));

-- Approval/workflow events inherit access through entity documents in future RPCs; direct reads stay admin/inventory only via grants/RLS deny by default.
-- Landed cost rows inherit branch through Goods Receipt in policies below.
drop policy if exists retail_landed_costs_select_v1 on public.retail_landed_costs;
create policy retail_landed_costs_select_v1 on public.retail_landed_costs for select to authenticated
using (exists(select 1 from public.retail_goods_receipts g where g.id=goods_receipt_id and public.has_branch_access(g.branch_id)));

drop policy if exists retail_landed_cost_allocations_select_v1 on public.retail_landed_cost_allocations;
create policy retail_landed_cost_allocations_select_v1 on public.retail_landed_cost_allocations for select to authenticated
using (exists(
  select 1 from public.retail_landed_costs lc
  join public.retail_goods_receipts g on g.id=lc.goods_receipt_id
  where lc.id=landed_cost_id and public.has_branch_access(g.branch_id)
));

revoke insert,update,delete on public.retail_purchase_requests,public.retail_purchase_request_items,
  public.retail_purchase_approval_events,public.retail_purchase_workflow_events,
  public.retail_supplier_invoices,public.retail_supplier_invoice_items,
  public.retail_landed_costs,public.retail_landed_cost_allocations,
  public.retail_reorder_rules from authenticated;

grant select on public.retail_purchase_requests,public.retail_purchase_request_items,
  public.retail_supplier_invoices,public.retail_supplier_invoice_items,
  public.retail_landed_costs,public.retail_landed_cost_allocations,
  public.retail_reorder_rules to authenticated;
grant select on public.retail_reorder_suggestions_v1,public.retail_supplier_invoice_match_v1 to authenticated;

-- -----------------------------------------------------------------------------
-- 9) Purchase Request lifecycle RPCs
-- -----------------------------------------------------------------------------
create or replace function public.retail_purchase_request_create_v1(
  p_branch_id bigint,
  p_preferred_supplier_id bigint,
  p_notes text,
  p_items jsonb,
  p_client_tx_id text
) returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id bigint;
  v_emp bigint;
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v record;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية طلبات الشراء'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  if p_preferred_supplier_id is not null and not exists(select 1 from public.retail_suppliers where id=p_preferred_supplier_id and active) then
    raise exception 'المورد غير موجود أو موقوف';
  end if;
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'أضف صنفًا واحدًا على الأقل'; end if;

  perform pg_advisory_xact_lock(hashtextextended('retail-pr:'||v_key,0));
  select id into v_id from public.retail_purchase_requests where client_tx_id=v_key;
  if v_id is not null then return v_id; end if;

  v_emp:=public.current_employee_id();
  insert into public.retail_purchase_requests(branch_id,preferred_supplier_id,notes,client_tx_id,requested_by_employee_id)
  values(p_branch_id,p_preferred_supplier_id,nullif(trim(coalesce(p_notes,'')),''),v_key,v_emp)
  returning id into v_id;

  for v in select * from jsonb_to_recordset(p_items)
    as x(product_id bigint,quantity numeric,estimated_unit_cost numeric,needed_by date,reason text)
  loop
    if coalesce(v.quantity,0)<=0 or coalesce(v.estimated_unit_cost,0)<0 then raise exception 'كمية/تكلفة تقديرية غير صحيحة'; end if;
    if not exists(select 1 from public.products where id=v.product_id and active is distinct from false) then raise exception 'صنف غير صالح %',v.product_id; end if;
    insert into public.retail_purchase_request_items(
      purchase_request_id,product_id,quantity_requested,estimated_unit_cost,needed_by,reason
    ) values(
      v_id,v.product_id,round(v.quantity,3),round(coalesce(v.estimated_unit_cost,0),4),v.needed_by,nullif(trim(coalesce(v.reason,'')),'')
    );
  end loop;

  insert into public.retail_purchase_workflow_events(entity_type,entity_id,to_status,employee_id)
  values('purchase_request',v_id,'draft',v_emp);
  return v_id;
end;
$$;

create or replace function public.retail_purchase_request_submit_v1(p_purchase_request_id bigint)
returns bigint
language plpgsql security definer set search_path=public
as $$
declare v_pr public.retail_purchase_requests%rowtype; v_emp bigint;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية طلبات الشراء'; end if;
  select * into v_pr from public.retail_purchase_requests where id=p_purchase_request_id for update;
  if not found then raise exception 'طلب الشراء غير موجود'; end if;
  if not public.has_branch_access(v_pr.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_pr.status<>'draft' then raise exception 'يمكن إرسال المسودة فقط'; end if;
  v_emp:=public.current_employee_id();
  update public.retail_purchase_requests set status='submitted',submitted_at=now(),updated_at=now() where id=v_pr.id;
  insert into public.retail_purchase_workflow_events(entity_type,entity_id,from_status,to_status,employee_id)
  values('purchase_request',v_pr.id,'draft','submitted',v_emp);
  return v_pr.id;
end;
$$;

create or replace function public.retail_purchase_request_decide_v1(
  p_purchase_request_id bigint,
  p_approve boolean,
  p_note text
) returns bigint
language plpgsql security definer set search_path=public
as $$
declare v_pr public.retail_purchase_requests%rowtype; v_emp bigint; v_to text;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not public.is_admin() then raise exception 'اعتماد طلبات الشراء للمدير فقط'; end if;
  select * into v_pr from public.retail_purchase_requests where id=p_purchase_request_id for update;
  if not found then raise exception 'طلب الشراء غير موجود'; end if;
  if not public.has_branch_access(v_pr.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_pr.status<>'submitted' then raise exception 'يمكن اتخاذ قرار على الطلب المرسل فقط'; end if;
  v_emp:=public.current_employee_id();
  v_to:=case when coalesce(p_approve,false) then 'approved' else 'rejected' end;
  update public.retail_purchase_request_items
    set quantity_approved=case when v_to='approved' then quantity_requested else 0 end
    where purchase_request_id=v_pr.id;
  update public.retail_purchase_requests
    set status=v_to,decided_by_employee_id=v_emp,decided_at=now(),decision_note=nullif(trim(coalesce(p_note,'')),''),updated_at=now()
    where id=v_pr.id;
  insert into public.retail_purchase_approval_events(entity_type,entity_id,approval_level,decision,note,employee_id)
  values('purchase_request',v_pr.id,1,case when v_to='approved' then 'approved' else 'rejected' end,nullif(trim(coalesce(p_note,'')),''),v_emp);
  insert into public.retail_purchase_workflow_events(entity_type,entity_id,from_status,to_status,note,employee_id)
  values('purchase_request',v_pr.id,'submitted',v_to,nullif(trim(coalesce(p_note,'')),''),v_emp);
  return v_pr.id;
end;
$$;

create or replace function public.retail_purchase_request_convert_to_po_v1(
  p_purchase_request_id bigint,
  p_supplier_id bigint,
  p_po_number text,
  p_expected_at timestamptz,
  p_client_tx_id text
) returns bigint
language plpgsql security definer set search_path=public
as $$
declare v_pr public.retail_purchase_requests%rowtype; v_po bigint; v_items jsonb; v_emp bigint;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية المشتريات'; end if;
  select * into v_pr from public.retail_purchase_requests where id=p_purchase_request_id for update;
  if not found then raise exception 'طلب الشراء غير موجود'; end if;
  if not public.has_branch_access(v_pr.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_pr.status<>'approved' then raise exception 'طلب الشراء يجب أن يكون معتمدًا قبل التحويل'; end if;
  if not exists(select 1 from public.retail_suppliers where id=p_supplier_id and active) then raise exception 'المورد غير موجود أو موقوف'; end if;
  select jsonb_agg(jsonb_build_object(
    'product_id',i.product_id,
    'quantity',i.quantity_approved,
    'unit_cost',i.estimated_unit_cost
  ) order by i.id) into v_items
  from public.retail_purchase_request_items i
  where i.purchase_request_id=v_pr.id and i.quantity_approved>0;
  if coalesce(jsonb_array_length(v_items),0)=0 then raise exception 'لا توجد كميات معتمدة للتحويل'; end if;

  v_po:=public.retail_purchase_order_create(v_pr.branch_id,p_supplier_id,v_pr.notes,v_items,p_client_tx_id);
  update public.retail_purchase_orders
    set source_request_id=v_pr.id,
        po_number=nullif(trim(coalesce(p_po_number,'')),''),
        expected_at=p_expected_at,
        updated_at=now()
    where id=v_po;
  v_emp:=public.current_employee_id();
  update public.retail_purchase_requests set status='converted',updated_at=now() where id=v_pr.id;
  insert into public.retail_purchase_workflow_events(entity_type,entity_id,from_status,to_status,employee_id)
  values('purchase_request',v_pr.id,'approved','converted',v_emp);
  return v_po;
end;
$$;

revoke all on function public.retail_purchase_request_create_v1(bigint,bigint,text,jsonb,text) from public;
revoke all on function public.retail_purchase_request_submit_v1(bigint) from public;
revoke all on function public.retail_purchase_request_decide_v1(bigint,boolean,text) from public;
revoke all on function public.retail_purchase_request_convert_to_po_v1(bigint,bigint,text,timestamptz,text) from public;
grant execute on function public.retail_purchase_request_create_v1(bigint,bigint,text,jsonb,text) to authenticated;
grant execute on function public.retail_purchase_request_submit_v1(bigint) to authenticated;
grant execute on function public.retail_purchase_request_decide_v1(bigint,boolean,text) to authenticated;
grant execute on function public.retail_purchase_request_convert_to_po_v1(bigint,bigint,text,timestamptz,text) to authenticated;

commit;
