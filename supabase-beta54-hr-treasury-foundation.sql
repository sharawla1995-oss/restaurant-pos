-- Sharawla POS 10.5.4-beta.54
-- Shared Business Core — HR / Advances / Payroll / Treasury foundation
-- Additive and sandbox-first. Existing public.employees remains the Login/User identity table.

begin;

insert into public.permission_actions_v2(code,name_ar,domain,legacy_permission,sort_order) values
 ('hr.employees.view','عرض الموظفين','hr','users',1100),
 ('hr.employees.create','إضافة موظف','hr','users',1110),
 ('hr.employees.edit','تعديل بيانات الموظف','hr','users',1120),
 ('hr.salary.view','عرض الرواتب','hr','financialSettings',1130),
 ('hr.salary.manage','تعديل الرواتب','hr','financialSettings',1140),
 ('hr.advances.view','عرض السلف','hr','financialSettings',1150),
 ('hr.advances.create','إنشاء سلفة','hr','financialSettings',1160),
 ('hr.advances.approve','اعتماد أو رفض سلفة','hr','financialSettings',1170),
 ('hr.advances.disburse','صرف سلفة','hr','financialSettings',1180),
 ('hr.adjustments.manage','إدارة الخصومات والمكافآت والإضافي','hr','financialSettings',1190),
 ('hr.payroll.view','عرض المرتبات','hr','financialSettings',1200),
 ('hr.payroll.run','إعداد مسير مرتبات','hr','financialSettings',1210),
 ('hr.payroll.approve','اعتماد مسير مرتبات','hr','financialSettings',1220),
 ('hr.payroll.pay','صرف المرتبات','hr','financialSettings',1230),
 ('treasury.view','عرض حركة الخزنة','treasury','financialSettings',1300),
 ('treasury.post','تسجيل حركة خزنة','treasury','financialSettings',1310),
 ('finance.supplier.statement.view','عرض كشف حساب المورد','finance','financialSettings',1320),
 ('finance.supplier.payment.post','تسجيل دفعة مورد','finance','financialSettings',1330)
on conflict(code) do update set name_ar=excluded.name_ar,domain=excluded.domain,legacy_permission=excluded.legacy_permission,sort_order=excluded.sort_order,active=true;

create table if not exists public.hr_employees(
 id bigserial primary key,
 login_employee_id bigint unique references public.employees(id) on delete set null,
 home_branch_id bigint not null references public.branches(id) on delete restrict,
 employee_code text unique,
 name text not null,
 phone text,
 job_title text,
 department text,
 hire_date date,
 employment_status text not null default 'active' check(employment_status in ('active','leave','terminated')),
 notes text,
 active boolean not null default true,
 created_by_employee_id bigint references public.employees(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint hr_employees_name_not_blank check(trim(name)<>'')
);
create index if not exists hr_employees_branch_idx on public.hr_employees(home_branch_id,active);

create table if not exists public.hr_employee_compensation(
 employee_id bigint primary key references public.hr_employees(id) on delete cascade,
 salary_basis text not null default 'monthly' check(salary_basis in ('monthly','daily','hourly')),
 base_salary numeric(14,2) not null default 0 check(base_salary>=0),
 effective_from date not null default current_date,
 updated_by_employee_id bigint references public.employees(id) on delete set null,
 updated_at timestamptz not null default now()
);

create table if not exists public.hr_employee_advances(
 id bigserial primary key,
 employee_id bigint not null references public.hr_employees(id) on delete restrict,
 branch_id bigint not null references public.branches(id) on delete restrict,
 amount numeric(14,2) not null check(amount>0),
 outstanding_amount numeric(14,2) not null check(outstanding_amount>=0),
 repayment_mode text not null default 'one_time' check(repayment_mode in ('one_time','installments')),
 installment_amount numeric(14,2) check(installment_amount is null or installment_amount>0),
 installments_count integer check(installments_count is null or installments_count>0),
 status text not null default 'draft' check(status in ('draft','approved','rejected','active','settled','cancelled')),
 requested_on date not null default current_date,
 approved_at timestamptz,
 disbursed_at timestamptz,
 payment_method text,
 payment_reference text,
 reason text,
 notes text,
 client_tx_id text not null unique,
 created_by_employee_id bigint references public.employees(id) on delete set null,
 approved_by_employee_id bigint references public.employees(id) on delete set null,
 disbursed_by_employee_id bigint references public.employees(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists hr_employee_advances_lookup_idx on public.hr_employee_advances(employee_id,status,requested_on desc);

create table if not exists public.hr_employee_adjustments(
 id bigserial primary key,
 employee_id bigint not null references public.hr_employees(id) on delete restrict,
 branch_id bigint not null references public.branches(id) on delete restrict,
 adjustment_type text not null check(adjustment_type in ('deduction','bonus','overtime')),
 amount numeric(14,2) not null check(amount>0),
 effective_date date not null default current_date,
 reason text,
 payroll_period_id bigint,
 status text not null default 'pending' check(status in ('pending','applied','cancelled')),
 client_tx_id text not null unique,
 created_by_employee_id bigint references public.employees(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists hr_employee_adjustments_lookup_idx on public.hr_employee_adjustments(employee_id,effective_date,status);

create table if not exists public.hr_payroll_periods(
 id bigserial primary key,
 branch_id bigint references public.branches(id) on delete restrict,
 period_start date not null,
 period_end date not null,
 status text not null default 'draft' check(status in ('draft','approved','paid','cancelled')),
 notes text,
 client_tx_id text not null unique,
 created_by_employee_id bigint references public.employees(id) on delete set null,
 approved_by_employee_id bigint references public.employees(id) on delete set null,
 approved_at timestamptz,
 paid_by_employee_id bigint references public.employees(id) on delete set null,
 paid_at timestamptz,
 created_at timestamptz not null default now(),
 constraint hr_payroll_period_dates check(period_end>=period_start)
);

create table if not exists public.hr_payroll_items(
 id bigserial primary key,
 payroll_period_id bigint not null references public.hr_payroll_periods(id) on delete cascade,
 employee_id bigint not null references public.hr_employees(id) on delete restrict,
 base_amount numeric(14,2) not null default 0 check(base_amount>=0),
 overtime_amount numeric(14,2) not null default 0 check(overtime_amount>=0),
 bonus_amount numeric(14,2) not null default 0 check(bonus_amount>=0),
 deduction_amount numeric(14,2) not null default 0 check(deduction_amount>=0),
 advance_deduction numeric(14,2) not null default 0 check(advance_deduction>=0),
 net_amount numeric(14,2) not null default 0 check(net_amount>=0),
 notes text,
 unique(payroll_period_id,employee_id)
);

alter table public.hr_employee_adjustments drop constraint if exists hr_employee_adjustments_payroll_period_id_fkey;
alter table public.hr_employee_adjustments add constraint hr_employee_adjustments_payroll_period_id_fkey foreign key(payroll_period_id) references public.hr_payroll_periods(id) on delete set null;

create table if not exists public.treasury_movements(
 id bigserial primary key,
 branch_id bigint not null references public.branches(id) on delete restrict,
 shift_id bigint references public.shifts(id) on delete set null,
 direction text not null check(direction in ('in','out')),
 movement_type text not null check(movement_type in ('cash_in','cash_out','employee_advance','payroll','supplier_payment','customer_collection','driver_settlement','merchant_settlement','transfer')),
 amount numeric(14,2) not null check(amount>0),
 method text not null default 'cash',
 entity_type text,
 entity_id bigint,
 reference text,
 notes text,
 client_tx_id text not null unique,
 employee_id bigint references public.employees(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists treasury_movements_branch_date_idx on public.treasury_movements(branch_id,created_at desc);

alter table public.hr_employees enable row level security;
alter table public.hr_employee_compensation enable row level security;
alter table public.hr_employee_advances enable row level security;
alter table public.hr_employee_adjustments enable row level security;
alter table public.hr_payroll_periods enable row level security;
alter table public.hr_payroll_items enable row level security;
alter table public.treasury_movements enable row level security;

drop policy if exists hr_employees_read_v1 on public.hr_employees;
create policy hr_employees_read_v1 on public.hr_employees for select to authenticated using(
 public.has_action_permission_v2('hr.employees.view') and public.has_branch_access(home_branch_id)
);
drop policy if exists hr_employee_compensation_read_v1 on public.hr_employee_compensation;
create policy hr_employee_compensation_read_v1 on public.hr_employee_compensation for select to authenticated using(
 public.has_action_permission_v2('hr.salary.view') and exists(select 1 from public.hr_employees h where h.id=employee_id and public.has_branch_access(h.home_branch_id))
);
drop policy if exists hr_employee_advances_read_v1 on public.hr_employee_advances;
create policy hr_employee_advances_read_v1 on public.hr_employee_advances for select to authenticated using(
 public.has_action_permission_v2('hr.advances.view') and public.has_branch_access(branch_id)
);
drop policy if exists hr_employee_adjustments_read_v1 on public.hr_employee_adjustments;
create policy hr_employee_adjustments_read_v1 on public.hr_employee_adjustments for select to authenticated using(
 (public.has_action_permission_v2('hr.payroll.view') or public.has_action_permission_v2('hr.adjustments.manage')) and public.has_branch_access(branch_id)
);
drop policy if exists hr_payroll_periods_read_v1 on public.hr_payroll_periods;
create policy hr_payroll_periods_read_v1 on public.hr_payroll_periods for select to authenticated using(
 public.has_action_permission_v2('hr.payroll.view') and (branch_id is null or public.has_branch_access(branch_id))
);
drop policy if exists hr_payroll_items_read_v1 on public.hr_payroll_items;
create policy hr_payroll_items_read_v1 on public.hr_payroll_items for select to authenticated using(
 public.has_action_permission_v2('hr.payroll.view') and exists(select 1 from public.hr_payroll_periods p where p.id=payroll_period_id and (p.branch_id is null or public.has_branch_access(p.branch_id)))
);
drop policy if exists treasury_movements_read_v1 on public.treasury_movements;
create policy treasury_movements_read_v1 on public.treasury_movements for select to authenticated using(
 public.has_action_permission_v2('treasury.view') and public.has_branch_access(branch_id)
);

grant select on public.hr_employees,public.hr_employee_compensation,public.hr_employee_advances,public.hr_employee_adjustments,public.hr_payroll_periods,public.hr_payroll_items,public.treasury_movements to authenticated;

create or replace function public.hr_employee_create_v1(
 p_branch_id bigint,
 p_name text,
 p_phone text default null,
 p_employee_code text default null,
 p_job_title text default null,
 p_department text default null,
 p_hire_date date default null,
 p_notes text default null,
 p_client_tx_id text default null
)
returns bigint language plpgsql security definer set search_path=public
as $$
declare idv bigint;e bigint;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');nm text:=nullif(trim(coalesce(p_name,'')),'');begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not public.has_action_permission_v2('hr.employees.create') then raise exception 'ليس لديك صلاحية إضافة موظف';end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 if nm is null then raise exception 'اسم الموظف مطلوب';end if;
 if k is null then raise exception 'معرف الحركة مطلوب';end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-employee:'||k,0));
 select id into idv from public.hr_employees where notes like '%[tx:'||k||']%' limit 1;
 if idv is not null then return idv;end if;
 e:=public.current_employee_id();
 insert into public.hr_employees(home_branch_id,employee_code,name,phone,job_title,department,hire_date,notes,created_by_employee_id)
 values(p_branch_id,nullif(trim(coalesce(p_employee_code,'')),''),nm,nullif(trim(coalesce(p_phone,'')),''),nullif(trim(coalesce(p_job_title,'')),''),nullif(trim(coalesce(p_department,'')),''),p_hire_date,concat_ws(' ',nullif(trim(coalesce(p_notes,'')),''),'[tx:'||k||']'),e)
 returning id into idv;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,p_branch_id,'hr_employee_create','hr_employee',idv,jsonb_build_object('name',nm,'employee_code',p_employee_code));
 return idv;
end;$$;

create or replace function public.hr_employee_compensation_set_v1(p_employee_id bigint,p_salary_basis text,p_base_salary numeric,p_effective_from date default current_date)
returns boolean language plpgsql security definer set search_path=public
as $$
declare h public.hr_employees%rowtype;e bigint;begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not public.has_action_permission_v2('hr.salary.manage') then raise exception 'ليس لديك صلاحية تعديل الرواتب';end if;
 select * into h from public.hr_employees where id=p_employee_id and active=true;if not found then raise exception 'الموظف غير موجود';end if;
 if not public.has_branch_access(h.home_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 if p_salary_basis not in ('monthly','daily','hourly') or coalesce(p_base_salary,-1)<0 then raise exception 'بيانات الراتب غير صحيحة';end if;
 e:=public.current_employee_id();
 insert into public.hr_employee_compensation(employee_id,salary_basis,base_salary,effective_from,updated_by_employee_id,updated_at)
 values(p_employee_id,p_salary_basis,round(p_base_salary,2),coalesce(p_effective_from,current_date),e,now())
 on conflict(employee_id) do update set salary_basis=excluded.salary_basis,base_salary=excluded.base_salary,effective_from=excluded.effective_from,updated_by_employee_id=e,updated_at=now();
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,h.home_branch_id,'hr_salary_update','hr_employee',p_employee_id,jsonb_build_object('salary_basis',p_salary_basis,'base_salary',round(p_base_salary,2),'effective_from',coalesce(p_effective_from,current_date)));
 return true;
end;$$;

create or replace function public.hr_advance_create_v1(p_employee_id bigint,p_amount numeric,p_repayment_mode text,p_installment_amount numeric,p_installments_count integer,p_reason text,p_notes text,p_client_tx_id text)
returns bigint language plpgsql security definer set search_path=public
as $$
declare h public.hr_employees%rowtype;idv bigint;e bigint;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not public.has_action_permission_v2('hr.advances.create') then raise exception 'ليس لديك صلاحية إنشاء سلفة';end if;
 select * into h from public.hr_employees where id=p_employee_id and active=true;if not found then raise exception 'الموظف غير موجود';end if;
 if not public.has_branch_access(h.home_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 if coalesce(p_amount,0)<=0 or p_repayment_mode not in ('one_time','installments') then raise exception 'بيانات السلفة غير صحيحة';end if;
 if p_repayment_mode='installments' and (coalesce(p_installment_amount,0)<=0 or coalesce(p_installments_count,0)<=0) then raise exception 'بيانات أقساط السلفة غير صحيحة';end if;
 if k is null then raise exception 'معرف الحركة مطلوب';end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-advance:'||k,0));
 select id into idv from public.hr_employee_advances where client_tx_id=k;if idv is not null then return idv;end if;
 e:=public.current_employee_id();
 insert into public.hr_employee_advances(employee_id,branch_id,amount,outstanding_amount,repayment_mode,installment_amount,installments_count,reason,notes,client_tx_id,created_by_employee_id)
 values(p_employee_id,h.home_branch_id,round(p_amount,2),round(p_amount,2),p_repayment_mode,case when p_repayment_mode='installments' then round(p_installment_amount,2) else null end,case when p_repayment_mode='installments' then p_installments_count else null end,nullif(trim(coalesce(p_reason,'')),''),nullif(trim(coalesce(p_notes,'')),''),k,e) returning id into idv;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,h.home_branch_id,'hr_advance_create','hr_advance',idv,jsonb_build_object('employee_id',p_employee_id,'amount',round(p_amount,2),'repayment_mode',p_repayment_mode));
 return idv;
end;$$;

create or replace function public.hr_advance_decide_v1(p_advance_id bigint,p_approve boolean,p_note text default null)
returns boolean language plpgsql security definer set search_path=public
as $$
declare a public.hr_employee_advances%rowtype;e bigint;begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not public.has_action_permission_v2('hr.advances.approve') then raise exception 'ليس لديك صلاحية اعتماد السلف';end if;
 select * into a from public.hr_employee_advances where id=p_advance_id for update;if not found then raise exception 'السلفة غير موجودة';end if;
 if not public.has_branch_access(a.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 if a.status<>'draft' then raise exception 'السلفة ليست في حالة مسودة';end if;
 e:=public.current_employee_id();
 update public.hr_employee_advances set status=case when p_approve then 'approved' else 'rejected' end,approved_at=now(),approved_by_employee_id=e,notes=concat_ws(E'\n',notes,nullif(trim(coalesce(p_note,'')),'')),updated_at=now() where id=p_advance_id;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,a.branch_id,case when p_approve then 'hr_advance_approve' else 'hr_advance_reject' end,'hr_advance',p_advance_id,jsonb_build_object('amount',a.amount,'note',p_note));
 return true;
end;$$;

create or replace function public.hr_advance_disburse_v1(p_advance_id bigint,p_method text,p_reference text,p_shift_id bigint,p_client_tx_id text)
returns bigint language plpgsql security definer set search_path=public
as $$
declare a public.hr_employee_advances%rowtype;mid bigint;e bigint;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not public.has_action_permission_v2('hr.advances.disburse') or not public.has_action_permission_v2('treasury.post') then raise exception 'ليس لديك صلاحية صرف السلفة من الخزنة';end if;
 select * into a from public.hr_employee_advances where id=p_advance_id for update;if not found then raise exception 'السلفة غير موجودة';end if;
 if not public.has_branch_access(a.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 if a.status='active' then select id into mid from public.treasury_movements where entity_type='hr_advance' and entity_id=a.id limit 1;return mid;end if;
 if a.status<>'approved' then raise exception 'يجب اعتماد السلفة قبل الصرف';end if;
 if k is null then raise exception 'معرف الحركة مطلوب';end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-advance-disburse:'||k,0));
 select id into mid from public.treasury_movements where client_tx_id=k;if mid is not null then return mid;end if;
 e:=public.current_employee_id();
 insert into public.treasury_movements(branch_id,shift_id,direction,movement_type,amount,method,entity_type,entity_id,reference,notes,client_tx_id,employee_id)
 values(a.branch_id,p_shift_id,'out','employee_advance',a.amount,coalesce(nullif(trim(coalesce(p_method,'')),''),'cash'),'hr_advance',a.id,nullif(trim(coalesce(p_reference,'')),''),'صرف سلفة موظف',k,e) returning id into mid;
 update public.hr_employee_advances set status='active',disbursed_at=now(),payment_method=coalesce(nullif(trim(coalesce(p_method,'')),''),'cash'),payment_reference=nullif(trim(coalesce(p_reference,'')),''),disbursed_by_employee_id=e,updated_at=now() where id=a.id;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,a.branch_id,'hr_advance_disburse','hr_advance',a.id,jsonb_build_object('amount',a.amount,'method',p_method,'treasury_movement_id',mid));
 return mid;
end;$$;

grant execute on function public.hr_employee_create_v1(bigint,text,text,text,text,text,date,text,text) to authenticated;
grant execute on function public.hr_employee_compensation_set_v1(bigint,text,numeric,date) to authenticated;
grant execute on function public.hr_advance_create_v1(bigint,numeric,text,numeric,integer,text,text,text) to authenticated;
grant execute on function public.hr_advance_decide_v1(bigint,boolean,text) to authenticated;
grant execute on function public.hr_advance_disburse_v1(bigint,text,text,bigint,text) to authenticated;

commit;
