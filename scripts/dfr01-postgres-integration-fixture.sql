-- DFR-01 PostgreSQL 16 isolated compile/integration fixture.
-- NEVER point this fixture at Supabase/Beta/Production.
\set ON_ERROR_STOP on

create schema if not exists auth;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
end $$;

create or replace function auth.uid()
returns uuid language sql stable
as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;

create or replace function public.is_admin()
returns boolean language sql stable
as $$ select false $$;

create or replace function public.has_permission(p_code text)
returns boolean language sql stable
as $$ select p_code='reports' $$;

create or replace function public.has_branch_access(p_branch_id bigint)
returns boolean language sql stable
as $$ select p_branch_id in (1,2) $$;

create table public.employees(
  id bigint primary key,
  name text not null
);

create table public.orders(
  id bigint primary key,
  branch_id bigint not null,
  employee_id bigint not null,
  customer_id bigint null,
  customer_name text null,
  status text null,
  total numeric(12,2) not null,
  created_at timestamptz not null
);

create table public.order_payments(
  id bigint primary key,
  order_id bigint not null references public.orders(id) on delete cascade,
  method text not null,
  amount numeric(12,2) not null
);

create table public.returns(
  id bigint primary key,
  branch_id bigint not null,
  order_id bigint not null references public.orders(id),
  employee_id bigint not null,
  total numeric(12,2) not null,
  created_at timestamptz not null
);

create table public.return_payments(
  id bigint primary key,
  return_id bigint not null references public.returns(id) on delete cascade,
  method text not null,
  amount numeric(12,2) not null
);

create table public.retail_suppliers(
  id bigint primary key,
  name text not null
);

create table public.retail_purchase_orders(
  id bigint primary key,
  branch_id bigint not null,
  supplier_id bigint not null references public.retail_suppliers(id),
  status text not null,
  po_number text null,
  created_by_employee_id bigint null,
  approved_by_employee_id bigint null,
  created_at timestamptz not null
);

create table public.retail_purchase_order_items(
  id bigint primary key,
  purchase_order_id bigint not null references public.retail_purchase_orders(id) on delete cascade,
  quantity_ordered numeric(14,3) not null,
  quantity_received numeric(14,3) not null,
  unit_cost numeric(14,4) not null
);

create table public.retail_goods_receipts(
  id bigint primary key,
  purchase_order_id bigint not null references public.retail_purchase_orders(id),
  branch_id bigint not null,
  supplier_id bigint not null references public.retail_suppliers(id),
  created_by_employee_id bigint null,
  received_at timestamptz not null
);

create table public.retail_goods_receipt_items(
  id bigint primary key,
  goods_receipt_id bigint not null references public.retail_goods_receipts(id) on delete cascade,
  quantity numeric(14,3) not null,
  unit_cost numeric(14,4) not null
);

create table public.retail_supplier_returns(
  id bigint primary key,
  branch_id bigint not null,
  supplier_id bigint not null references public.retail_suppliers(id),
  created_by_employee_id bigint null,
  created_at timestamptz not null
);

create table public.retail_supplier_return_items(
  id bigint primary key,
  supplier_return_id bigint not null references public.retail_supplier_returns(id) on delete cascade,
  quantity numeric(14,3) not null,
  unit_cost numeric(14,4) not null
);

insert into public.employees(id,name) values
 (10,'Ali'),
 (20,'Sara'),
 (30,'Mona');

insert into public.orders(id,branch_id,employee_id,customer_id,customer_name,status,total,created_at) values
 (1,1,10,100,'Client A','completed',100,'2026-10-01 10:00:00+00'),
 (2,1,20,null,null,'completed',50,'2026-10-01 11:00:00+00'),
 (3,2,10,200,'Branch 2 Client','completed',999,'2026-10-01 10:30:00+00'),
 (4,1,10,300,'Cancelled','cancelled',400,'2026-10-01 13:00:00+00'),
 (5,1,10,400,'Boundary','completed',700,'2026-10-02 00:00:00+00');

insert into public.order_payments(id,order_id,method,amount) values
 (1,1,'cash',60),
 (2,1,'wallet',40),
 (3,2,'instapay',50),
 (4,3,'cash',999),
 (5,4,'cash',400),
 (6,5,'cash',700);

insert into public.returns(id,branch_id,order_id,employee_id,total,created_at) values
 (1,1,1,20,20,'2026-10-01 12:00:00+00'),
 (2,2,3,10,100,'2026-10-01 12:30:00+00');

insert into public.return_payments(id,return_id,method,amount) values
 (1,1,'wallet',20),
 (2,2,'cash',100);

insert into public.retail_suppliers(id,name) values
 (1,'Supplier One'),
 (2,'Supplier Two');

insert into public.retail_purchase_orders(
 id,branch_id,supplier_id,status,po_number,created_by_employee_id,approved_by_employee_id,created_at
) values
 (1,1,1,'partially_received','PO-1',10,20,'2026-10-01 09:00:00+00'),
 (2,2,2,'approved','PO-2',10,20,'2026-10-01 09:30:00+00');

insert into public.retail_purchase_order_items(
 id,purchase_order_id,quantity_ordered,quantity_received,unit_cost
) values
 (1,1,10,6,10),
 (2,2,100,0,9);

insert into public.retail_goods_receipts(
 id,purchase_order_id,branch_id,supplier_id,created_by_employee_id,received_at
) values
 (1,1,1,1,20,'2026-10-01 10:00:00+00'),
 (2,2,2,2,20,'2026-10-01 10:00:00+00');

insert into public.retail_goods_receipt_items(id,goods_receipt_id,quantity,unit_cost) values
 (1,1,6,10),
 (2,2,10,9);

insert into public.retail_supplier_returns(
 id,branch_id,supplier_id,created_by_employee_id,created_at
) values
 (1,1,1,30,'2026-10-01 14:00:00+00'),
 (2,2,2,30,'2026-10-01 14:00:00+00');

insert into public.retail_supplier_return_items(id,supplier_return_id,quantity,unit_cost) values
 (1,1,2,10),
 (2,2,1,9);

-- Compile/load the exact source artifact.
\ir supabase-dfr01-readonly-report-drilldowns.sql

-- Existence/signature count.
do $$
declare v_count integer;
begin
 select count(*) into v_count
 from pg_proc p
 join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public'
   and p.proname in (
     'report_sales_by_payment_method_v1',
     'report_sales_by_employee_v1',
     'report_sales_by_customer_v1',
     'report_purchases_by_supplier_v1',
     'report_purchases_by_employee_v1',
     'report_purchase_orders_detail_v1'
   );
 if v_count<>6 then raise exception 'DFR01_FUNCTION_COUNT expected=6 actual=%',v_count; end if;
end $$;

-- Payment split/refund/date/branch isolation.
do $$
declare
  cash_net numeric;
  wallet_net numeric;
  instapay_net numeric;
  total_sales numeric;
begin
 select net_amount into cash_net
 from public.report_sales_by_payment_method_v1(1,'2026-10-01','2026-10-02')
 where method='cash';
 select net_amount into wallet_net
 from public.report_sales_by_payment_method_v1(1,'2026-10-01','2026-10-02')
 where method='wallet';
 select net_amount into instapay_net
 from public.report_sales_by_payment_method_v1(1,'2026-10-01','2026-10-02')
 where method='instapay';
 select sum(sale_amount) into total_sales
 from public.report_sales_by_payment_method_v1(1,'2026-10-01','2026-10-02');

 if cash_net<>60 then raise exception 'cash net expected 60 got %',cash_net; end if;
 if wallet_net<>20 then raise exception 'wallet net expected 20 got %',wallet_net; end if;
 if instapay_net<>50 then raise exception 'instapay net expected 50 got %',instapay_net; end if;
 if total_sales<>150 then raise exception 'branch/date isolated sales expected 150 got %',total_sales; end if;
end $$;

-- Customer attribution, including walk-in bucket and return through original order.
do $$
declare
  known_net numeric;
  walkin_net numeric;
begin
 select net_sales into known_net
 from public.report_sales_by_customer_v1(1,'2026-10-01','2026-10-02',100)
 where customer_id=100;
 select net_sales into walkin_net
 from public.report_sales_by_customer_v1(1,'2026-10-01','2026-10-02',100)
 where customer_id is null;
 if known_net<>80 then raise exception 'customer 100 net expected 80 got %',known_net; end if;
 if walkin_net<>50 then raise exception 'walk-in net expected 50 got %',walkin_net; end if;
end $$;

-- Employee attribution keeps sale creator and return processor distinct.
do $$
declare
  ali_net numeric;
  sara_net numeric;
begin
 select net_activity into ali_net
 from public.report_sales_by_employee_v1(1,'2026-10-01','2026-10-02')
 where employee_id=10;
 select net_activity into sara_net
 from public.report_sales_by_employee_v1(1,'2026-10-01','2026-10-02')
 where employee_id=20;
 if ali_net<>100 then raise exception 'Ali net activity expected 100 got %',ali_net; end if;
 if sara_net<>30 then raise exception 'Sara net activity expected 30 got %',sara_net; end if;
end $$;

-- Supplier operational net.
do $$
declare v numeric;
begin
 select net_purchase_value into v
 from public.report_purchases_by_supplier_v1(1,'2026-10-01','2026-10-02')
 where supplier_id=1;
 if v<>40 then raise exception 'supplier net expected 40 got %',v; end if;
end $$;

-- Purchase employee roles stay separate.
do $$
declare
  po_value numeric;
  grn_value numeric;
  return_value numeric;
begin
 select operational_value into po_value
 from public.report_purchases_by_employee_v1(1,'2026-10-01','2026-10-02')
 where role_code='po_created' and employee_id=10;
 select operational_value into grn_value
 from public.report_purchases_by_employee_v1(1,'2026-10-01','2026-10-02')
 where role_code='grn_received' and employee_id=20;
 select operational_value into return_value
 from public.report_purchases_by_employee_v1(1,'2026-10-01','2026-10-02')
 where role_code='supplier_return_created' and employee_id=30;
 if po_value<>100 then raise exception 'PO creator value expected 100 got %',po_value; end if;
 if grn_value<>60 then raise exception 'GRN receiver value expected 60 got %',grn_value; end if;
 if return_value<>20 then raise exception 'supplier return creator value expected 20 got %',return_value; end if;
end $$;

-- PO detail ordered/received/outstanding.
do $$
declare
  ordered numeric;
  received numeric;
  outstanding_qty numeric;
  outstanding_val numeric;
begin
 select ordered_value,received_value,outstanding_quantity,outstanding_value
 into ordered,received,outstanding_qty,outstanding_val
 from public.report_purchase_orders_detail_v1(1,'2026-10-01','2026-10-02',null,null)
 where purchase_order_id=1;
 if ordered<>100 then raise exception 'PO ordered expected 100 got %',ordered; end if;
 if received<>60 then raise exception 'PO received expected 60 got %',received; end if;
 if outstanding_qty<>4 then raise exception 'PO outstanding qty expected 4 got %',outstanding_qty; end if;
 if outstanding_val<>40 then raise exception 'PO outstanding value expected 40 got %',outstanding_val; end if;
end $$;

-- Explicit branch-access denial.
do $$
begin
 begin
   perform * from public.report_sales_by_payment_method_v1(999,'2026-10-01','2026-10-02');
   raise exception 'expected branch access denial';
 exception
   when others then
     if sqlerrm='expected branch access denial' then raise; end if;
     if position('ليس لديك صلاحية لهذا الفرع' in sqlerrm)=0 then raise; end if;
 end;
end $$;

select 'DFR01_POSTGRES_INTEGRATION_PASS' as result;

