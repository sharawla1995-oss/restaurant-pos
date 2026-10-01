\set ON_ERROR_STOP on

create schema if not exists auth;
do $roles$
begin
  if not exists(select 1 from pg_roles where rolname='anon') then execute 'create role anon nologin'; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then execute 'create role authenticated nologin'; end if;
end
$roles$;
create or replace function auth.uid() returns uuid language sql stable as $$select '11111111-1111-1111-1111-111111111111'::uuid$$;
create or replace function public.is_admin() returns boolean language sql stable as $$select true$$;
create or replace function public.has_permission(text) returns boolean language sql stable as $$select true$$;
create or replace function public.has_branch_access(bigint) returns boolean language sql stable as $$select true$$;
create or replace function public.has_action_permission_v2(text) returns boolean language sql stable as $$select true$$;

create table public.branches(id bigint primary key,name text);
create table public.employees(id bigint primary key,name text);
create table public.customers(id bigint primary key,name text,phone text);
create table public.orders(
 id bigint primary key,branch_id bigint,employee_id bigint,customer_id bigint,order_number text,invoice_number bigint,
 total numeric(12,2),created_at timestamptz,status text,source text,customer_name text
);
create table public.order_payments(id bigint primary key,order_id bigint,method text,amount numeric(12,2),created_at timestamptz);
create table public.returns(id bigint primary key,branch_id bigint,return_number bigint,order_id bigint,employee_id bigint,total numeric(12,2),created_at timestamptz);
create table public.return_payments(id bigint primary key,return_id bigint,method text,amount numeric(12,2));
create table public.audit_logs(id bigint primary key,employee_id bigint,branch_id bigint,action text,entity_type text,entity_id bigint,details jsonb,created_at timestamptz);
create table public.permission_actions_v2(code text primary key,name_ar text,domain text,legacy_permission text,active boolean default true,sort_order integer default 0);

create table public.retail_suppliers(id bigint primary key,name text);
create table public.retail_purchase_orders(id bigint primary key,branch_id bigint,supplier_id bigint,currency_code text);
create table public.retail_goods_receipts(id bigint primary key,purchase_order_id bigint,branch_id bigint,supplier_id bigint,received_at timestamptz);
create table public.retail_goods_receipt_items(id bigint primary key,goods_receipt_id bigint,quantity numeric(14,3),unit_cost numeric(14,4));
create table public.retail_supplier_returns(id bigint primary key,branch_id bigint,supplier_id bigint,created_at timestamptz);
create table public.retail_supplier_return_items(id bigint primary key,supplier_return_id bigint,quantity numeric(14,3),unit_cost numeric(14,4));
create table public.retail_supplier_invoices(id bigint primary key,branch_id bigint,supplier_id bigint,purchase_order_id bigint,invoice_number text,invoice_date date,currency_code text,total_amount numeric(14,2),status text,created_at timestamptz);

insert into public.branches values(1,'TEST');
insert into public.employees values(10,'Cashier A'),(20,'Manager B');
insert into public.customers values(100,'Customer A','01000000000');
insert into public.orders values(1000,1,10,100,'ORD-1000',5001,150.00,'2026-10-01 08:00+00','completed','pos','Customer A');
insert into public.order_payments values(1,1000,'cash',100.00,'2026-10-01 08:00+00'),(2,1000,'wallet',50.00,'2026-10-01 08:00+00');
insert into public.returns values(2000,1,1,1000,20,30.00,'2026-10-01 09:00+00');
insert into public.return_payments values(3,2000,'cash',30.00);
insert into public.audit_logs values
 (1,10,1,'create_order','order',1000,'{"invoice_number":"5001","bon_number":"77","total":"150","payment":"mixed","secret":"DO_NOT_LEAK"}','2026-10-01 08:00+00'),
 (2,20,1,'unknown_action','secret',99,'{"secret":"DO_NOT_LEAK_UNKNOWN"}','2026-10-01 09:30+00');

insert into public.retail_suppliers values(300,'Supplier A');
insert into public.retail_purchase_orders values(400,1,300,'EGP');
insert into public.retail_goods_receipts values(500,400,1,300,'2026-10-01 10:00+00');
insert into public.retail_goods_receipt_items values(501,500,2,40.00);
insert into public.retail_supplier_returns values(600,1,300,'2026-10-01 11:00+00');
insert into public.retail_supplier_return_items values(601,600,1,40.00);
insert into public.retail_supplier_invoices values(700,1,300,400,'INV-700','2026-10-01','EGP',80.00,'approved','2026-10-01 10:30+00');

\i supabase-dfr02-customer-timeline-read-model.sql
\i supabase-dfr04-activity-log-read-model.sql
\i supabase-dfr22-operational-statements.sql

DO $$
declare n int; j jsonb; begin
 select count(*) into n from public.customer_timeline_v1(1,100,'2026-10-01 00:00+00','2026-10-02 00:00+00',100);
 if n<>2 then raise exception 'DFR02 timeline count expected 2, got %',n;end if;
 select payment_breakdown into j from public.customer_timeline_v1(1,100,'2026-10-01 00:00+00','2026-10-02 00:00+00',100) where event_type='sale';
 if j->>'cash'<>'100.00' or j->>'wallet'<>'50.00' then raise exception 'DFR02 split payment mismatch: %',j;end if;
end$$;

DO $$
declare n int; s jsonb; begin
 select count(*) into n from public.activity_log_read_v1(1,'2026-10-01 00:00+00','2026-10-02 00:00+00',100);
 if n<>2 then raise exception 'DFR04 activity count expected 2, got %',n;end if;
 select safe_summary into s from public.activity_log_read_v1(1,'2026-10-01 00:00+00','2026-10-02 00:00+00',100) where action='create_order';
 if s ? 'secret' then raise exception 'DFR04 leaked secret key';end if;
 if s->>'invoice_number'<>'5001' then raise exception 'DFR04 safe summary missing invoice';end if;
 select safe_summary into s from public.activity_log_read_v1(1,'2026-10-01 00:00+00','2026-10-02 00:00+00',100) where action='unknown_action';
 if s is not null then raise exception 'DFR04 unknown action must have null summary';end if;
end$$;

DO $$
declare n int; begin
 select count(*) into n from public.customer_operational_statement_v1(1,100,'2026-10-01 00:00+00','2026-10-02 00:00+00',100);
 if n<>5 then raise exception 'DFR22 customer event count expected 5, got %',n;end if;
 select count(*) into n from public.supplier_operational_parties_v1(1,100);
 if n<>1 then raise exception 'DFR22 supplier parties expected 1, got %',n;end if;
 select count(*) into n from public.supplier_operational_statement_v1(1,300,'2026-10-01 00:00+00','2026-10-02 00:00+00',100);
 if n<>3 then raise exception 'DFR22 supplier events expected 3, got %',n;end if;
 if exists(select 1 from public.supplier_operational_statement_v1(1,300,'2026-10-01 00:00+00','2026-10-02 00:00+00',100) where event_type='supplier_invoice' and currency_code<>'EGP') then raise exception 'DFR22 supplier invoice currency mismatch';end if;
end$$;

select 'WAVE1_POSTGRES_INTEGRATION_PASS' result;