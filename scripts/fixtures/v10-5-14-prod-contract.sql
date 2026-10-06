-- Minimal production-contract fixture for V10.5.14 migration compilation.
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function auth.uid() returns uuid language sql stable as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;

create table public.branches(id bigint primary key,name text);
create table public.employees(id bigint primary key,name text,active boolean default true,role text,branch_id bigint references public.branches(id));
create table public.employee_permissions(employee_id bigint references public.employees(id),permission_key text,allowed boolean);
create table public.employee_branches(employee_id bigint references public.employees(id),branch_id bigint references public.branches(id));
create table public.audit_logs(id bigserial primary key,employee_id bigint,branch_id bigint,action text,entity_type text,entity_id bigint,details jsonb,created_at timestamptz default now());

create table public.hr_employees(
 id bigint primary key,home_branch_id bigint references public.branches(id),active boolean default true,
 employment_status text default 'active',name text,employee_code text,phone text,job_title text,department text,hire_date date
);
create table public.hr_employee_advances(
 id bigserial primary key,employee_id bigint references public.hr_employees(id),branch_id bigint references public.branches(id),
 amount numeric(14,2),outstanding_amount numeric(14,2),repayment_mode text,installment_amount numeric(14,2),installments_count integer,
 status text,requested_on date default current_date,approved_at timestamptz,disbursed_at timestamptz,payment_method text,payment_reference text,
 reason text,notes text,client_tx_id text unique,created_by_employee_id bigint references public.employees(id),
 approved_by_employee_id bigint references public.employees(id),disbursed_by_employee_id bigint references public.employees(id),
 created_at timestamptz default now(),updated_at timestamptz default now()
);
create table public.hr_employee_adjustments(
 id bigserial primary key,employee_id bigint references public.hr_employees(id),branch_id bigint references public.branches(id),
 adjustment_type text,amount numeric(14,2),effective_date date default current_date,reason text,payroll_period_id bigint,
 status text default 'pending',client_tx_id text unique,created_by_employee_id bigint references public.employees(id),
 created_at timestamptz default now(),approval_status text default 'approved'
);
create table public.hr_payroll_periods(
 id bigserial primary key,branch_id bigint references public.branches(id),period_start date,period_end date,status text,
 notes text,client_tx_id text unique,created_by_employee_id bigint,approved_by_employee_id bigint,approved_at timestamptz,
 paid_by_employee_id bigint,paid_at timestamptz,created_at timestamptz default now()
);
create table public.hr_payroll_items(
 id bigserial primary key,payroll_period_id bigint references public.hr_payroll_periods(id),employee_id bigint references public.hr_employees(id),
 base_amount numeric(14,2) default 0,overtime_amount numeric(14,2) default 0,bonus_amount numeric(14,2) default 0,
 deduction_amount numeric(14,2) default 0,advance_deduction numeric(14,2) default 0,net_amount numeric(14,2) default 0,notes text
);
alter table public.hr_employee_adjustments add constraint hr_adjustment_period_fixture_fk foreign key(payroll_period_id) references public.hr_payroll_periods(id);

create table public.hr_work_schedules(id bigint primary key,name text);
create table public.hr_employee_schedule_assignments(id bigint primary key,employee_id bigint,schedule_id bigint,effective_from date,effective_to date,active boolean);
create table public.hr_attendance_daily_summary(id bigint primary key,employee_id bigint,work_date date,worked_minutes integer,late_minutes integer,overtime_minutes integer,early_leave_minutes integer,absent boolean,approved_leave boolean,incomplete boolean);
create table public.hr_attendance_events(id bigint primary key,employee_id bigint,verification_status text);
create table public.hr_attendance_devices(id bigint primary key,last_seen_at timestamptz);
create table public.hr_staff_sessions(id uuid primary key default gen_random_uuid(),token_digest bytea,last_seen_at timestamptz);
create table public.hr_leave_requests(
 id bigint primary key,employee_id bigint references public.hr_employees(id),branch_id bigint references public.branches(id),
 request_type text,status text,manager_note text,created_at timestamptz default now()
);

create table public.return_approval_requests(
 id bigint primary key,branch_id bigint references public.branches(id),requester_employee_id bigint references public.employees(id),
 expected_total numeric,order_bon_number bigint,status text
);

create table public.treasury_movements(
 id bigserial primary key,branch_id bigint,shift_id bigint,direction text,movement_type text,amount numeric,method text,
 entity_type text,entity_id bigint,reference text,notes text,client_tx_id text unique,employee_id bigint
);

create table public.orders(
 id bigint primary key,branch_id bigint references public.branches(id),bon_number bigint,invoice_number bigint,created_at timestamptz default now(),
 order_type text,payment_method text,status text,total numeric,discount numeric default 0,promo_discount numeric default 0,
 customer_name text,customer_phone text
);
create table public.returns(id bigint primary key,branch_id bigint references public.branches(id),created_at timestamptz default now(),total numeric);
create table public.expenses(id bigint primary key,branch_id bigint references public.branches(id),created_at timestamptz default now(),amount numeric);
create table public.order_payments(id bigint primary key,order_id bigint references public.orders(id),method text,amount numeric);
create table public.order_items(id bigint primary key,order_id bigint references public.orders(id),product_name text,quantity numeric,total numeric);
create table public.order_item_modifiers(
 id bigserial primary key,
 order_item_id bigint not null references public.order_items(id),
 modifier_id bigint,
 modifier_name text not null,
 price numeric default 0
);
alter table public.order_item_modifiers enable row level security;

create or replace function public.current_employee_id() returns bigint language sql stable as $$select 1::bigint$$;
create or replace function public.is_admin() returns boolean language sql stable as $$select false$$;
create or replace function public.has_permission(p_permission text) returns boolean language sql stable as $$select true$$;
create or replace function public.has_branch_access(p_branch_id bigint) returns boolean language sql stable as $$select true$$;
create or replace function public.hr_staff_session_context_v1(p_session_token text)
returns table(staff_account_id bigint,employee_id bigint,branch_id bigint,device_id bigint,must_change_pin boolean)
language sql stable as $$select 1::bigint,1::bigint,1::bigint,1::bigint,false$$;

insert into public.branches(id,name) values(1,'TEST');
insert into public.employees(id,name,active,role,branch_id) values(1,'Admin',true,'admin',1);
insert into public.hr_employees(id,home_branch_id,active,employment_status,name,employee_code) values(1,1,true,'active','Employee','E1');
