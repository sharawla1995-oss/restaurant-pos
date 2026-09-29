-- Sharawla HR Attendance & Payroll Extension V1
-- SOURCE ONLY. Additive extension of Beta54 HR/Payroll; no deployment is performed by this file.

begin;

create extension if not exists pgcrypto;

insert into public.permission_actions_v2(code,name_ar,domain,legacy_permission,sort_order) values
 ('hr.attendance.view','عرض الحضور والانصراف','hr','users',1240),
 ('hr.attendance.manage','إدارة الحضور والانصراف','hr','users',1250),
 ('hr.attendance.adjust','تصحيح الحضور والانصراف','hr','financialSettings',1260),
 ('hr.schedules.view','عرض جداول العمل','hr','users',1270),
 ('hr.schedules.manage','إدارة جداول العمل','hr','users',1280),
 ('hr.geofence.manage','إدارة نطاقات الفروع','hr','settings',1290),
 ('hr.staff_accounts.manage','إدارة حسابات تطبيق الموظفين','hr','users',1300),
 ('hr.deduction_rules.view','عرض قواعد الخصومات والمكافآت','hr','financialSettings',1310),
 ('hr.deduction_rules.manage','إدارة قواعد الخصومات والمكافآت','hr','financialSettings',1320),
 ('hr.leave.view','عرض الإجازات والأذونات','hr','users',1330),
 ('hr.leave.manage','إدارة الإجازات والأذونات','hr','users',1340),
 ('hr.reports.view','عرض تقارير الموارد البشرية','hr','reports',1350),
 ('hr.settings.manage','إدارة إعدادات الموارد البشرية','hr','settings',1360)
on conflict(code) do update set name_ar=excluded.name_ar,domain=excluded.domain,
 legacy_permission=excluded.legacy_permission,sort_order=excluded.sort_order,active=true;

create table if not exists public.hr_settings(
 branch_id bigint primary key references public.branches(id) on delete restrict,
 timezone text not null default 'Africa/Cairo',
 outside_geofence_policy text not null default 'pending_review' check(outside_geofence_policy in ('reject','pending_review')),
 poor_accuracy_policy text not null default 'pending_review' check(poor_accuracy_policy in ('reject','pending_review')),
 require_selfie boolean not null default true,
 selfie_retention_days integer not null default 90 check(selfie_retention_days between 1 and 3650),
 updated_by_employee_id bigint references public.employees(id) on delete set null,
 updated_at timestamptz not null default now()
);

create table if not exists public.hr_work_schedules(
 id bigserial primary key,
 branch_id bigint not null references public.branches(id) on delete restrict,
 name text not null check(trim(name)<>''),
 timezone text not null default 'Africa/Cairo',
 work_days smallint[] not null default array[0,1,2,3,4]::smallint[],
 scheduled_start time not null,
 scheduled_end time not null,
 grace_minutes integer not null default 0 check(grace_minutes>=0),
 break_minutes integer not null default 0 check(break_minutes>=0),
 overtime_after_minutes integer not null default 0 check(overtime_after_minutes>=0),
 early_leave_grace_minutes integer not null default 0 check(early_leave_grace_minutes>=0),
 overnight boolean not null default false,
 effective_from date not null default current_date,
 effective_to date,
 active boolean not null default true,
 break_policy jsonb not null default '{}'::jsonb,
 overtime_policy jsonb not null default '{}'::jsonb,
 early_leave_policy jsonb not null default '{}'::jsonb,
 created_by_employee_id bigint references public.employees(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint hr_work_schedules_dates check(effective_to is null or effective_to>=effective_from),
 constraint hr_work_schedules_days check(work_days <@ array[0,1,2,3,4,5,6]::smallint[]),
 constraint hr_work_schedules_overnight check(overnight or scheduled_end>scheduled_start)
);
create index if not exists hr_work_schedules_branch_effective_idx on public.hr_work_schedules(branch_id,active,effective_from,effective_to);

create table if not exists public.hr_employee_schedule_assignments(
 id bigserial primary key,
 employee_id bigint not null references public.hr_employees(id) on delete restrict,
 schedule_id bigint not null references public.hr_work_schedules(id) on delete restrict,
 branch_id bigint not null references public.branches(id) on delete restrict,
 effective_from date not null,
 effective_to date,
 active boolean not null default true,
 created_by_employee_id bigint references public.employees(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint hr_employee_schedule_assignment_dates check(effective_to is null or effective_to>=effective_from)
);
create index if not exists hr_schedule_assignments_employee_effective_idx on public.hr_employee_schedule_assignments(employee_id,active,effective_from,effective_to);
create index if not exists hr_schedule_assignments_branch_idx on public.hr_employee_schedule_assignments(branch_id,schedule_id);

create table if not exists public.hr_branch_geofences(
 id bigserial primary key,
 branch_id bigint not null unique references public.branches(id) on delete restrict,
 latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180),
 allowed_radius_m numeric(10,2) not null check(allowed_radius_m>0),
 minimum_accuracy_m numeric(10,2) check(minimum_accuracy_m is null or minimum_accuracy_m>0),
 active boolean not null default true,
 created_by_employee_id bigint references public.employees(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.hr_staff_accounts(
 id bigserial primary key,
 employee_id bigint not null unique references public.hr_employees(id) on delete restrict,
 pin_hash text not null,
 must_change_pin boolean not null default true,
 active boolean not null default true,
 failed_attempts integer not null default 0 check(failed_attempts>=0),
 locked_until timestamptz,
 token_version integer not null default 1 check(token_version>0),
 last_login_at timestamptz,
 pin_changed_at timestamptz,
 disabled_at timestamptz,
 disabled_by_employee_id bigint references public.employees(id) on delete set null,
 created_by_employee_id bigint references public.employees(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint hr_staff_accounts_pin_hash_not_plain check(pin_hash like '$2%')
);

create table if not exists public.hr_attendance_devices(
 id bigserial primary key,
 staff_account_id bigint not null references public.hr_staff_accounts(id) on delete cascade,
 employee_id bigint not null references public.hr_employees(id) on delete restrict,
 device_uid text not null,
 device_name text,
 device_model text,
 platform text,
 user_agent text,
 first_seen_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 active boolean not null default true,
 revoked_at timestamptz,
 revoked_by_employee_id bigint references public.employees(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(staff_account_id,device_uid)
);
create index if not exists hr_attendance_devices_employee_idx on public.hr_attendance_devices(employee_id,active,last_seen_at desc);
alter table public.hr_attendance_devices add column if not exists pending_queue_count integer not null default 0 check(pending_queue_count>=0);
alter table public.hr_attendance_devices add column if not exists last_sync_at timestamptz;
alter table public.hr_attendance_devices add column if not exists last_sync_error text;

create table if not exists public.hr_staff_sessions(
 id uuid primary key default gen_random_uuid(),
 staff_account_id bigint not null references public.hr_staff_accounts(id) on delete cascade,
 device_id bigint not null references public.hr_attendance_devices(id) on delete cascade,
 token_digest bytea not null unique,
 token_version integer not null,
 created_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz
);
create index if not exists hr_staff_sessions_account_idx on public.hr_staff_sessions(staff_account_id,expires_at) where revoked_at is null;

create table if not exists public.hr_staff_selfie_uploads(
 id bigserial primary key,
 staff_account_id bigint not null references public.hr_staff_accounts(id) on delete restrict,
 employee_id bigint not null references public.hr_employees(id) on delete restrict,
 client_tx_id text not null,
 storage_bucket text not null default 'hr-attendance-selfies',
 storage_path text not null unique,
 content_sha256 text not null,
 captured_at_device timestamptz not null,
 upload_status text not null default 'reserved' check(upload_status in ('reserved','uploaded','attached','failed','purged')),
 uploaded_at timestamptz,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 unique(staff_account_id,client_tx_id)
);

create table if not exists public.hr_attendance_events(
 id bigserial primary key,
 staff_account_id bigint not null references public.hr_staff_accounts(id) on delete restrict,
 employee_id bigint not null references public.hr_employees(id) on delete restrict,
 branch_id bigint not null references public.branches(id) on delete restrict,
 event_type text not null check(event_type in ('check_in','check_out')),
 client_tx_id text not null,
 payload_digest bytea not null,
 captured_at_device timestamptz not null,
 received_at_server timestamptz not null default now(),
 latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180),
 accuracy_m numeric(10,2) not null check(accuracy_m>=0),
 distance_from_branch_m numeric(12,2),
 selfie_storage_reference text not null,
 selfie_sha256 text,
 device_id bigint not null references public.hr_attendance_devices(id) on delete restrict,
 captured_offline boolean not null default false,
 verification_status text not null check(verification_status in ('verified','verified_after_sync','pending_review','rejected')),
 verification_reason text,
 app_version text not null,
 device_time_offset_minutes integer,
 clock_drift_seconds integer,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 unique(staff_account_id,client_tx_id)
);
create index if not exists hr_attendance_events_employee_time_idx on public.hr_attendance_events(employee_id,captured_at_device desc);
create index if not exists hr_attendance_events_branch_time_idx on public.hr_attendance_events(branch_id,captured_at_device desc);
create index if not exists hr_attendance_events_verification_idx on public.hr_attendance_events(verification_status,received_at_server desc);

create table if not exists public.hr_attendance_daily_summary(
 id bigserial primary key,
 employee_id bigint not null references public.hr_employees(id) on delete restrict,
 branch_id bigint not null references public.branches(id) on delete restrict,
 schedule_id bigint references public.hr_work_schedules(id) on delete set null,
 work_date date not null,
 scheduled_start_at timestamptz,
 scheduled_end_at timestamptz,
 actual_check_in_at timestamptz,
 actual_check_out_at timestamptz,
 worked_minutes integer not null default 0 check(worked_minutes>=0),
 break_minutes integer not null default 0 check(break_minutes>=0),
 late_minutes integer not null default 0 check(late_minutes>=0),
 early_leave_minutes integer not null default 0 check(early_leave_minutes>=0),
 overtime_minutes integer not null default 0 check(overtime_minutes>=0),
 absent boolean not null default false,
 incomplete boolean not null default false,
 missing_check_out boolean not null default false,
 approved_leave boolean not null default false,
 verification_status text not null default 'draft' check(verification_status in ('draft','pending_review','approved','rejected')),
 input_digest bytea,
 calculated_at timestamptz not null default now(),
 approved_at timestamptz,
 approved_by_employee_id bigint references public.employees(id) on delete set null,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(employee_id,work_date)
);
create index if not exists hr_attendance_summary_branch_date_idx on public.hr_attendance_daily_summary(branch_id,work_date,verification_status);

create table if not exists public.hr_attendance_adjustments(
 id bigserial primary key,
 employee_id bigint not null references public.hr_employees(id) on delete restrict,
 branch_id bigint not null references public.branches(id) on delete restrict,
 original_event_id bigint references public.hr_attendance_events(id) on delete restrict,
 summary_id bigint references public.hr_attendance_daily_summary(id) on delete restrict,
 before_value jsonb not null,
 after_value jsonb not null,
 reason text not null check(trim(reason)<>''),
 status text not null default 'approved' check(status in ('pending','approved','rejected','cancelled')),
 adjusted_by_employee_id bigint not null references public.employees(id) on delete restrict,
 adjusted_at timestamptz not null default now(),
 approved_by_employee_id bigint references public.employees(id) on delete set null,
 approved_at timestamptz,
 client_tx_id text not null unique,
 created_at timestamptz not null default now(),
 constraint hr_attendance_adjustment_target check(original_event_id is not null or summary_id is not null)
);
create index if not exists hr_attendance_adjustments_employee_idx on public.hr_attendance_adjustments(employee_id,adjusted_at desc);

create table if not exists public.hr_deduction_rules(
 id bigserial primary key,
 name text not null check(trim(name)<>''),
 rule_type text not null check(rule_type in ('late_fixed','late_minutes','late_count','absence_day','early_leave','fixed_deduction','fixed_bonus','overtime_bonus','attendance_bonus')),
 scope text not null default 'branch' check(scope in ('all','branch','employee')),
 branch_id bigint references public.branches(id) on delete restrict,
 threshold numeric(14,3),
 amount numeric(14,2) check(amount is null or amount>=0),
 formula jsonb not null default '{}'::jsonb,
 frequency text not null check(frequency in ('per_event','daily','weekly','monthly','threshold_count','one_time')),
 effective_from date not null default current_date,
 effective_to date,
 active boolean not null default true,
 created_by_employee_id bigint references public.employees(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint hr_deduction_rules_dates check(effective_to is null or effective_to>=effective_from),
 constraint hr_deduction_rules_scope check((scope='all' and branch_id is null) or scope<>'all')
);
create index if not exists hr_deduction_rules_lookup_idx on public.hr_deduction_rules(active,effective_from,effective_to,branch_id);

create table if not exists public.hr_deduction_rule_assignments(
 id bigserial primary key,
 rule_id bigint not null references public.hr_deduction_rules(id) on delete cascade,
 employee_id bigint references public.hr_employees(id) on delete cascade,
 branch_id bigint references public.branches(id) on delete cascade,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 constraint hr_rule_assignment_target check((employee_id is not null and branch_id is null) or (employee_id is null and branch_id is not null))
);
create unique index if not exists hr_rule_assignment_employee_uidx on public.hr_deduction_rule_assignments(rule_id,employee_id) where employee_id is not null;
create unique index if not exists hr_rule_assignment_branch_uidx on public.hr_deduction_rule_assignments(rule_id,branch_id) where branch_id is not null;

create table if not exists public.hr_leave_requests(
 id bigserial primary key,
 employee_id bigint not null references public.hr_employees(id) on delete restrict,
 branch_id bigint not null references public.branches(id) on delete restrict,
 request_type text not null check(request_type in ('leave','permission','late_permission','early_leave_permission','sick_leave','unpaid_leave')),
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
 reason text,
 manager_note text,
 client_tx_id text not null unique,
 payload_digest bytea not null,
 requested_by_staff_account_id bigint references public.hr_staff_accounts(id) on delete set null,
 created_by_employee_id bigint references public.employees(id) on delete set null,
 decided_by_employee_id bigint references public.employees(id) on delete set null,
 decided_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint hr_leave_request_dates check(ends_at>starts_at)
);
create index if not exists hr_leave_requests_employee_dates_idx on public.hr_leave_requests(employee_id,starts_at,ends_at,status);

create table if not exists public.hr_recurring_adjustments(
 id bigserial primary key,
 employee_id bigint not null references public.hr_employees(id) on delete restrict,
 branch_id bigint not null references public.branches(id) on delete restrict,
 adjustment_type text not null check(adjustment_type in ('deduction','bonus')),
 amount numeric(14,2) not null check(amount>0),
 frequency text not null check(frequency in ('weekly','monthly','scheduled')),
 start_date date not null,
 end_date date,
 occurrences_limit integer check(occurrences_limit is null or occurrences_limit>0),
 occurrences_applied integer not null default 0 check(occurrences_applied>=0),
 status text not null default 'active' check(status in ('active','paused','completed','cancelled')),
 reason text not null,
 created_by_employee_id bigint references public.employees(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint hr_recurring_adjustment_dates check(end_date is null or end_date>=start_date)
);

create table if not exists public.hr_payroll_item_lines(
 id bigserial primary key,
 payroll_item_id bigint not null references public.hr_payroll_items(id) on delete cascade,
 employee_id bigint not null references public.hr_employees(id) on delete restrict,
 line_type text not null check(line_type in ('basic_salary','worked_days','worked_hours','overtime','bonus','late_deduction','absence_deduction','early_leave_deduction','recurring_deduction','advance_installment','manual_deduction')),
 amount numeric(14,2) not null default 0,
 quantity numeric(14,3),
 unit text,
 effective_date date,
 reason text not null,
 source_type text,
 source_id bigint,
 source_identity text not null,
 created_at timestamptz not null default now(),
 unique(payroll_item_id,source_identity)
);
create index if not exists hr_payroll_item_lines_employee_idx on public.hr_payroll_item_lines(employee_id,effective_date,line_type);

alter table public.hr_employee_adjustments add column if not exists rule_id bigint references public.hr_deduction_rules(id) on delete set null;
alter table public.hr_employee_adjustments add column if not exists source_attendance_event_id bigint references public.hr_attendance_events(id) on delete set null;
alter table public.hr_employee_adjustments add column if not exists source_daily_summary_id bigint references public.hr_attendance_daily_summary(id) on delete set null;
alter table public.hr_employee_adjustments add column if not exists source_identity text;
alter table public.hr_employee_adjustments add column if not exists source_detail jsonb not null default '{}'::jsonb;
alter table public.hr_employee_adjustments add column if not exists approval_status text not null default 'approved' check(approval_status in ('pending','approved','rejected'));
create unique index if not exists hr_employee_adjustments_source_identity_uidx on public.hr_employee_adjustments(source_identity) where source_identity is not null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('hr-attendance-selfies','hr-attendance-selfies',false,5242880,array['image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Evidence is immutable even to authenticated table grants. Corrections are separate rows.
create or replace function public.hr_attendance_events_immutable_v1()
returns trigger language plpgsql set search_path=public as $$
begin
 raise exception 'سجل الحضور الأصلي غير قابل للتعديل أو الحذف؛ استخدم تصحيح حضور';
end;$$;
drop trigger if exists hr_attendance_events_immutable_v1 on public.hr_attendance_events;
create trigger hr_attendance_events_immutable_v1 before update or delete on public.hr_attendance_events
for each row execute function public.hr_attendance_events_immutable_v1();

-- RLS: POS users read only through action permission + branch scope. Staff uses the Edge API RPC boundary.
do $$declare t text;begin
 foreach t in array array[
  'hr_settings','hr_work_schedules','hr_employee_schedule_assignments','hr_branch_geofences',
  'hr_staff_accounts','hr_attendance_devices','hr_staff_sessions','hr_staff_selfie_uploads',
  'hr_attendance_events','hr_attendance_daily_summary','hr_attendance_adjustments',
  'hr_deduction_rules','hr_deduction_rule_assignments','hr_leave_requests',
  'hr_recurring_adjustments','hr_payroll_item_lines'
 ] loop execute format('alter table public.%I enable row level security',t); end loop;
end$$;

drop policy if exists hr_settings_admin_read_v1 on public.hr_settings;
create policy hr_settings_admin_read_v1 on public.hr_settings for select to authenticated using(public.has_action_permission_v2('hr.settings.manage') and public.has_branch_access(branch_id));
drop policy if exists hr_work_schedules_read_v1 on public.hr_work_schedules;
create policy hr_work_schedules_read_v1 on public.hr_work_schedules for select to authenticated using(public.has_action_permission_v2('hr.schedules.view') and public.has_branch_access(branch_id));
drop policy if exists hr_schedule_assignments_read_v1 on public.hr_employee_schedule_assignments;
create policy hr_schedule_assignments_read_v1 on public.hr_employee_schedule_assignments for select to authenticated using(public.has_action_permission_v2('hr.schedules.view') and public.has_branch_access(branch_id));
drop policy if exists hr_geofences_read_v1 on public.hr_branch_geofences;
create policy hr_geofences_read_v1 on public.hr_branch_geofences for select to authenticated using((public.has_action_permission_v2('hr.attendance.view') or public.has_action_permission_v2('hr.geofence.manage')) and public.has_branch_access(branch_id));
drop policy if exists hr_staff_accounts_read_v1 on public.hr_staff_accounts;
create policy hr_staff_accounts_read_v1 on public.hr_staff_accounts for select to authenticated using(public.has_action_permission_v2('hr.staff_accounts.manage') and exists(select 1 from public.hr_employees h where h.id=employee_id and public.has_branch_access(h.home_branch_id)));
drop policy if exists hr_attendance_devices_read_v1 on public.hr_attendance_devices;
create policy hr_attendance_devices_read_v1 on public.hr_attendance_devices for select to authenticated using(public.has_action_permission_v2('hr.staff_accounts.manage') and exists(select 1 from public.hr_employees h where h.id=employee_id and public.has_branch_access(h.home_branch_id)));
drop policy if exists hr_attendance_events_read_v1 on public.hr_attendance_events;
create policy hr_attendance_events_read_v1 on public.hr_attendance_events for select to authenticated using(public.has_action_permission_v2('hr.attendance.view') and public.has_branch_access(branch_id));
drop policy if exists hr_attendance_summary_read_v1 on public.hr_attendance_daily_summary;
create policy hr_attendance_summary_read_v1 on public.hr_attendance_daily_summary for select to authenticated using((public.has_action_permission_v2('hr.attendance.view') or public.has_action_permission_v2('hr.payroll.view')) and public.has_branch_access(branch_id));
drop policy if exists hr_attendance_adjustments_read_v1 on public.hr_attendance_adjustments;
create policy hr_attendance_adjustments_read_v1 on public.hr_attendance_adjustments for select to authenticated using(public.has_action_permission_v2('hr.attendance.view') and public.has_branch_access(branch_id));
drop policy if exists hr_deduction_rules_read_v1 on public.hr_deduction_rules;
create policy hr_deduction_rules_read_v1 on public.hr_deduction_rules for select to authenticated using(public.has_action_permission_v2('hr.deduction_rules.view') and (branch_id is null or public.has_branch_access(branch_id)));
drop policy if exists hr_rule_assignments_read_v1 on public.hr_deduction_rule_assignments;
create policy hr_rule_assignments_read_v1 on public.hr_deduction_rule_assignments for select to authenticated using(public.has_action_permission_v2('hr.deduction_rules.view') and ((branch_id is not null and public.has_branch_access(branch_id)) or (employee_id is not null and exists(select 1 from public.hr_employees h where h.id=employee_id and public.has_branch_access(h.home_branch_id)))));
drop policy if exists hr_leave_requests_read_v1 on public.hr_leave_requests;
create policy hr_leave_requests_read_v1 on public.hr_leave_requests for select to authenticated using(public.has_action_permission_v2('hr.leave.view') and public.has_branch_access(branch_id));
drop policy if exists hr_recurring_adjustments_read_v1 on public.hr_recurring_adjustments;
create policy hr_recurring_adjustments_read_v1 on public.hr_recurring_adjustments for select to authenticated using(public.has_action_permission_v2('hr.deduction_rules.view') and public.has_branch_access(branch_id));
drop policy if exists hr_payroll_item_lines_read_v1 on public.hr_payroll_item_lines;
create policy hr_payroll_item_lines_read_v1 on public.hr_payroll_item_lines for select to authenticated using(public.has_action_permission_v2('hr.payroll.view') and exists(select 1 from public.hr_payroll_items i join public.hr_payroll_periods p on p.id=i.payroll_period_id where i.id=payroll_item_id and (p.branch_id is null or public.has_branch_access(p.branch_id))));

grant select on public.hr_settings,public.hr_work_schedules,public.hr_employee_schedule_assignments,
 public.hr_branch_geofences,public.hr_attendance_devices,
 public.hr_attendance_events,public.hr_attendance_daily_summary,public.hr_attendance_adjustments,
 public.hr_deduction_rules,public.hr_deduction_rule_assignments,public.hr_leave_requests,
 public.hr_recurring_adjustments,public.hr_payroll_item_lines to authenticated;

-- Managers can administer account state, but PIN hashes never cross the database boundary.
revoke select on public.hr_staff_accounts from anon,authenticated;
grant select(id,employee_id,must_change_pin,active,failed_attempts,locked_until,token_version,
 last_login_at,pin_changed_at,disabled_at,disabled_by_employee_id,created_by_employee_id,created_at,updated_at)
on public.hr_staff_accounts to authenticated;

-- Internal helpers are service-only and never grant a Staff session POS permissions.
create or replace function public.hr_staff_session_context_v1(p_session_token text)
returns table(staff_account_id bigint,employee_id bigint,branch_id bigint,device_id bigint,must_change_pin boolean)
language plpgsql security definer set search_path=public as $$
declare d bytea;begin
 if nullif(trim(coalesce(p_session_token,'')),'') is null then return;end if;
 d:=digest(convert_to(p_session_token,'UTF8'),'sha256');
 return query
 select a.id,a.employee_id,h.home_branch_id,s.device_id,a.must_change_pin
 from public.hr_staff_sessions s join public.hr_staff_accounts a on a.id=s.staff_account_id
 join public.hr_employees h on h.id=a.employee_id join public.hr_attendance_devices v on v.id=s.device_id
 where s.token_digest=d and s.revoked_at is null and s.expires_at>now()
   and s.token_version=a.token_version and a.active=true and h.active=true and h.employment_status<>'terminated'
   and v.active=true and v.revoked_at is null;
end;$$;

create or replace function public.hr_staff_login_v1(p_identity text,p_pin text,p_device_uid text,p_device_name text,p_device_model text,p_platform text,p_user_agent text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.hr_staff_accounts%rowtype;h public.hr_employees%rowtype;dv bigint;raw_token text;sid uuid;nowv timestamptz:=now();matches integer;begin
 if nullif(trim(coalesce(p_identity,'')),'') is null or p_pin !~ '^[0-9]{6}$' or nullif(trim(coalesce(p_device_uid,'')),'') is null then return jsonb_build_object('ok',false,'code','INVALID_CREDENTIALS');end if;
 select count(*) into matches from public.hr_staff_accounts sa join public.hr_employees he on he.id=sa.employee_id
 where sa.active=true and he.active=true and he.employment_status<>'terminated' and (lower(coalesce(he.employee_code,''))=lower(trim(p_identity)) or regexp_replace(coalesce(he.phone,''),'[^0-9]','','g')=regexp_replace(trim(p_identity),'[^0-9]','','g'));
 if matches<>1 then return jsonb_build_object('ok',false,'code','INVALID_CREDENTIALS');end if;
 select sa.* into a from public.hr_staff_accounts sa join public.hr_employees he on he.id=sa.employee_id
 where sa.active=true and he.active=true and he.employment_status<>'terminated'
   and (lower(coalesce(he.employee_code,''))=lower(trim(p_identity)) or regexp_replace(coalesce(he.phone,''),'[^0-9]','','g')=regexp_replace(trim(p_identity),'[^0-9]','','g'))
 order by sa.id limit 1 for update of sa;
 if not found or (a.locked_until is not null and a.locked_until>nowv) or crypt(p_pin,a.pin_hash)<>a.pin_hash then
   if found then update public.hr_staff_accounts set failed_attempts=failed_attempts+1,locked_until=case when failed_attempts+1>=5 then nowv+interval '15 minutes' else locked_until end,updated_at=nowv where id=a.id;end if;
   return jsonb_build_object('ok',false,'code','INVALID_CREDENTIALS');
 end if;
 select * into h from public.hr_employees where id=a.employee_id;
 insert into public.hr_attendance_devices(staff_account_id,employee_id,device_uid,device_name,device_model,platform,user_agent,last_seen_at)
 values(a.id,a.employee_id,trim(p_device_uid),nullif(trim(coalesce(p_device_name,'')),''),nullif(trim(coalesce(p_device_model,'')),''),nullif(trim(coalesce(p_platform,'')),''),nullif(trim(coalesce(p_user_agent,'')),''),nowv)
 on conflict(staff_account_id,device_uid) do update set device_name=excluded.device_name,device_model=excluded.device_model,platform=excluded.platform,user_agent=excluded.user_agent,last_seen_at=nowv
 returning id into dv;
 if exists(select 1 from public.hr_attendance_devices where id=dv and (active=false or revoked_at is not null)) then raise exception 'هذا الجهاز موقوف';end if;
 raw_token:=encode(gen_random_bytes(32),'hex');
 insert into public.hr_staff_sessions(staff_account_id,device_id,token_digest,token_version,expires_at)
 values(a.id,dv,digest(convert_to(raw_token,'UTF8'),'sha256'),a.token_version,nowv+interval '30 days') returning id into sid;
 update public.hr_staff_accounts set failed_attempts=0,locked_until=null,last_login_at=nowv,updated_at=nowv where id=a.id;
 return jsonb_build_object('ok',true,'session_token',raw_token,'session_id',sid,'expires_at',nowv+interval '30 days','must_change_pin',a.must_change_pin,'employee',jsonb_build_object('id',h.id,'name',h.name,'employee_code',h.employee_code,'branch_id',h.home_branch_id),'device_id',dv);
end;$$;

create or replace function public.hr_staff_change_pin_v1(p_session_token text,p_current_pin text,p_new_pin text)
returns boolean language plpgsql security definer set search_path=public as $$
declare c record;a public.hr_staff_accounts%rowtype;begin
 select * into c from public.hr_staff_session_context_v1(p_session_token);if not found then raise exception 'جلسة الموظف غير صالحة';end if;
 if p_current_pin !~ '^[0-9]{6}$' or p_new_pin !~ '^[0-9]{6}$' or p_new_pin=p_current_pin then raise exception 'PIN الجديد يجب أن يكون 6 أرقام ومختلفًا';end if;
 select * into a from public.hr_staff_accounts where id=c.staff_account_id for update;
 if crypt(p_current_pin,a.pin_hash)<>a.pin_hash then raise exception 'PIN الحالي غير صحيح';end if;
 update public.hr_staff_accounts set pin_hash=crypt(p_new_pin,gen_salt('bf',10)),must_change_pin=false,pin_changed_at=now(),token_version=token_version+1,updated_at=now() where id=a.id;
 update public.hr_staff_sessions set revoked_at=now() where staff_account_id=a.id;
 return true;
end;$$;

create or replace function public.hr_staff_selfie_reserve_v1(p_session_token text,p_client_tx_id text,p_content_sha256 text,p_captured_at_device timestamptz,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c record;r public.hr_staff_selfie_uploads%rowtype;pathv text;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');begin
 select * into c from public.hr_staff_session_context_v1(p_session_token);if not found or c.must_change_pin then raise exception 'جلسة الموظف غير صالحة أو يلزم تغيير PIN';end if;
 if k is null or p_content_sha256 !~ '^[a-fA-F0-9]{64}$' then raise exception 'هوية السيلفي غير صحيحة';end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-selfie:'||c.staff_account_id||':'||k,0));
 select * into r from public.hr_staff_selfie_uploads where staff_account_id=c.staff_account_id and client_tx_id=k;
 if found then
  if lower(r.content_sha256)<>lower(p_content_sha256) then raise exception 'نفس client_tx_id مستخدم لسيلفي مختلف';end if;
  return jsonb_build_object('id',r.id,'bucket',r.storage_bucket,'path',r.storage_path,'status',r.upload_status,'replay',true);
 end if;
 pathv:=c.employee_id||'/'||to_char(coalesce(p_captured_at_device,now()) at time zone 'UTC','YYYY/MM/DD')||'/'||encode(digest(convert_to(k,'UTF8'),'sha256'),'hex')||'.jpg';
 insert into public.hr_staff_selfie_uploads(staff_account_id,employee_id,client_tx_id,storage_path,content_sha256,captured_at_device,metadata)
 values(c.staff_account_id,c.employee_id,k,pathv,lower(p_content_sha256),coalesce(p_captured_at_device,now()),coalesce(p_metadata,'{}'::jsonb)) returning * into r;
 return jsonb_build_object('id',r.id,'bucket',r.storage_bucket,'path',r.storage_path,'status',r.upload_status,'replay',false);
end;$$;

create or replace function public.hr_staff_selfie_complete_v1(p_session_token text,p_client_tx_id text,p_content_sha256 text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c record;r public.hr_staff_selfie_uploads%rowtype;begin
 select * into c from public.hr_staff_session_context_v1(p_session_token);if not found then raise exception 'جلسة الموظف غير صالحة';end if;
 select * into r from public.hr_staff_selfie_uploads where staff_account_id=c.staff_account_id and client_tx_id=p_client_tx_id for update;
 if not found or lower(r.content_sha256)<>lower(p_content_sha256) then raise exception 'حجز السيلفي غير مطابق';end if;
 update public.hr_staff_selfie_uploads set upload_status=case when upload_status='attached' then 'attached' else 'uploaded' end,uploaded_at=coalesce(uploaded_at,now()) where id=r.id returning * into r;
 return jsonb_build_object('reference',r.storage_bucket||'/'||r.storage_path,'status',r.upload_status);
end;$$;

create or replace function public.hr_haversine_m_v1(lat1 double precision,lon1 double precision,lat2 double precision,lon2 double precision)
returns numeric language sql immutable set search_path=pg_catalog,public as $$
 select round((6371000*2*asin(sqrt(power(sin(radians(lat2-lat1)/2),2)+cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lon2-lon1)/2),2))))::numeric,2)
$$;

create or replace function public.hr_attendance_recalculate_day_v1(p_employee_id bigint,p_work_date date)
returns bigint language plpgsql security definer set search_path=public as $$
declare h public.hr_employees%rowtype;s record;tz text;startv timestamptz;endv timestamptz;inv timestamptz;outv timestamptz;
 worked int:=0;latev int:=0;earlyv int:=0;otv int:=0;leavev boolean:=false;absentv boolean:=false;incompletev boolean:=false;missingv boolean:=false;
 digestv bytea;old_digest bytea;old_status text;sid bigint;adj jsonb;begin
 select * into h from public.hr_employees where id=p_employee_id;if not found then raise exception 'الموظف غير موجود';end if;
 select ws.*,a.id assignment_id into s from public.hr_employee_schedule_assignments a join public.hr_work_schedules ws on ws.id=a.schedule_id
 where a.employee_id=p_employee_id and a.active=true and ws.active=true and a.effective_from<=p_work_date and (a.effective_to is null or a.effective_to>=p_work_date)
 and ws.effective_from<=p_work_date and (ws.effective_to is null or ws.effective_to>=p_work_date) order by a.effective_from desc,a.id desc limit 1;
 if found and not (extract(dow from p_work_date)::smallint=any(s.work_days)) then s.id:=null;end if;
 tz:=coalesce(nullif(s.timezone,''),(select timezone from public.hr_settings where branch_id=h.home_branch_id),'Africa/Cairo');
 if s.id is not null then
  startv:=(p_work_date+s.scheduled_start) at time zone tz;
  endv:=((p_work_date+case when s.overnight then 1 else 0 end)+s.scheduled_end) at time zone tz;
 end if;
 select min(captured_at_device) filter(where event_type='check_in'),max(captured_at_device) filter(where event_type='check_out') into inv,outv
 from public.hr_attendance_events where employee_id=p_employee_id and verification_status in ('verified','verified_after_sync')
 and captured_at_device>=coalesce(startv,p_work_date::timestamp at time zone tz)-interval '6 hours'
 and captured_at_device<=coalesce(endv,(p_work_date+1)::timestamp at time zone tz)+interval '6 hours';
 select a.after_value into adj from public.hr_attendance_adjustments a left join public.hr_attendance_daily_summary ds on ds.id=a.summary_id
 where a.employee_id=p_employee_id and a.status='approved' and (ds.work_date=p_work_date or (a.after_value->>'work_date')::date=p_work_date)
 order by a.approved_at desc nulls last,a.adjusted_at desc limit 1;
 if adj ? 'actual_check_in_at' then inv:=nullif(adj->>'actual_check_in_at','')::timestamptz;end if;
 if adj ? 'actual_check_out_at' then outv:=nullif(adj->>'actual_check_out_at','')::timestamptz;end if;
 select exists(select 1 from public.hr_leave_requests l where l.employee_id=p_employee_id and l.status='approved' and l.starts_at<(p_work_date+1)::timestamp at time zone tz and l.ends_at>p_work_date::timestamp at time zone tz) into leavev;
 if s.id is not null then
  absentv:=inv is null and not leavev;
  missingv:=inv is not null and outv is null;
  incompletev:=missingv or (inv is null and outv is not null);
  if inv is not null then latev:=greatest(0,floor(extract(epoch from(inv-startv))/60)::int-s.grace_minutes);end if;
  if outv is not null then earlyv:=greatest(0,floor(extract(epoch from(endv-outv))/60)::int-s.early_leave_grace_minutes);otv:=greatest(0,floor(extract(epoch from(outv-endv))/60)::int-s.overtime_after_minutes);end if;
  if inv is not null and outv is not null and outv>inv then worked:=greatest(0,floor(extract(epoch from(outv-inv))/60)::int-s.break_minutes);end if;
 end if;
 if adj ? 'late_minutes' then latev:=greatest(0,(adj->>'late_minutes')::int);end if;
 if adj ? 'early_leave_minutes' then earlyv:=greatest(0,(adj->>'early_leave_minutes')::int);end if;
 if adj ? 'overtime_minutes' then otv:=greatest(0,(adj->>'overtime_minutes')::int);end if;
 if adj ? 'worked_minutes' then worked:=greatest(0,(adj->>'worked_minutes')::int);end if;
 digestv:=digest(convert_to(jsonb_build_object('schedule',s.id,'in',inv,'out',outv,'leave',leavev,'adjustment',adj)::text,'UTF8'),'sha256');
 select input_digest,verification_status into old_digest,old_status from public.hr_attendance_daily_summary where employee_id=p_employee_id and work_date=p_work_date;
 insert into public.hr_attendance_daily_summary(employee_id,branch_id,schedule_id,work_date,scheduled_start_at,scheduled_end_at,actual_check_in_at,actual_check_out_at,worked_minutes,break_minutes,late_minutes,early_leave_minutes,overtime_minutes,absent,incomplete,missing_check_out,approved_leave,verification_status,input_digest,calculated_at,updated_at)
 values(p_employee_id,h.home_branch_id,s.id,p_work_date,startv,endv,inv,outv,worked,coalesce(s.break_minutes,0),latev,earlyv,otv,absentv,incompletev,missingv,leavev,case when old_digest=digestv and old_status='approved' then 'approved' else 'draft' end,digestv,now(),now())
 on conflict(employee_id,work_date) do update set branch_id=excluded.branch_id,schedule_id=excluded.schedule_id,scheduled_start_at=excluded.scheduled_start_at,scheduled_end_at=excluded.scheduled_end_at,actual_check_in_at=excluded.actual_check_in_at,actual_check_out_at=excluded.actual_check_out_at,worked_minutes=excluded.worked_minutes,break_minutes=excluded.break_minutes,late_minutes=excluded.late_minutes,early_leave_minutes=excluded.early_leave_minutes,overtime_minutes=excluded.overtime_minutes,absent=excluded.absent,incomplete=excluded.incomplete,missing_check_out=excluded.missing_check_out,approved_leave=excluded.approved_leave,verification_status=excluded.verification_status,input_digest=excluded.input_digest,calculated_at=now(),updated_at=now()
 returning id into sid;
 return sid;
end;$$;

create or replace function public.hr_staff_attendance_submit_v1(p_session_token text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c record;a public.hr_attendance_events%rowtype;g public.hr_branch_geofences%rowtype;st public.hr_settings%rowtype;up public.hr_staff_selfie_uploads%rowtype;
 k text;et text;cap timestamptz;lat double precision;lon double precision;acc numeric;dist numeric;dig bytea;statusv text;reasonv text;workd date;tz text;begin
 select * into c from public.hr_staff_session_context_v1(p_session_token);if not found or c.must_change_pin then raise exception 'جلسة الموظف غير صالحة أو يلزم تغيير PIN';end if;
 k:=nullif(trim(coalesce(p_payload->>'client_tx_id','')),'');et:=p_payload->>'event_type';cap:=(p_payload->>'captured_at_device')::timestamptz;lat:=(p_payload->>'latitude')::double precision;lon:=(p_payload->>'longitude')::double precision;acc:=(p_payload->>'accuracy_m')::numeric;
 if k is null or et not in ('check_in','check_out') or cap is null or acc<0 or nullif(trim(coalesce(p_payload->>'app_version','')),'') is null then raise exception 'بيانات حركة الحضور غير صحيحة';end if;
 if (p_payload->>'branch_id')::bigint<>c.branch_id then raise exception 'الفرع لا يطابق ملف الموظف';end if;
 dig:=digest(convert_to((p_payload-'session_token')::text,'UTF8'),'sha256');perform pg_advisory_xact_lock(hashtextextended('hr-attendance:'||c.staff_account_id||':'||k,0));
 select * into a from public.hr_attendance_events where staff_account_id=c.staff_account_id and client_tx_id=k;
 if found then if a.payload_digest<>dig then raise exception 'نفس client_tx_id مستخدم ببيانات حضور مختلفة';end if;return jsonb_build_object('event_id',a.id,'verification_status',a.verification_status,'replay',true,'received_at_server',a.received_at_server);end if;
 select * into g from public.hr_branch_geofences where branch_id=c.branch_id and active=true;if not found then raise exception 'نطاق الفرع غير مُعد';end if;
 select * into st from public.hr_settings where branch_id=c.branch_id;if not found then st.outside_geofence_policy:='pending_review';st.poor_accuracy_policy:='pending_review';st.require_selfie:=true;st.timezone:='Africa/Cairo';end if;
 select * into up from public.hr_staff_selfie_uploads where staff_account_id=c.staff_account_id and client_tx_id=k and upload_status in ('uploaded','attached');
 if coalesce(st.require_selfie,true) and not found then raise exception 'يجب رفع سيلفي الكاميرا قبل تسجيل الحضور';end if;
 if found and p_payload->>'selfie_storage_reference'<>up.storage_bucket||'/'||up.storage_path then raise exception 'مرجع السيلفي غير مطابق';end if;
 dist:=public.hr_haversine_m_v1(g.latitude,g.longitude,lat,lon);statusv:=case when coalesce((p_payload->>'captured_offline')::boolean,false) then 'verified_after_sync' else 'verified' end;reasonv:=null;
 if g.minimum_accuracy_m is not null and acc>g.minimum_accuracy_m then statusv:=case when st.poor_accuracy_policy='reject' then 'rejected' else 'pending_review' end;reasonv:='poor_gps_accuracy';
 elsif dist>g.allowed_radius_m then statusv:=case when st.outside_geofence_policy='reject' then 'rejected' else 'pending_review' end;reasonv:='outside_geofence';end if;
 if et='check_out' and not exists(select 1 from public.hr_attendance_events e where e.employee_id=c.employee_id and e.event_type='check_in' and e.verification_status in ('verified','verified_after_sync') and e.captured_at_device between cap-interval '36 hours' and cap and not exists(select 1 from public.hr_attendance_events o where o.employee_id=e.employee_id and o.event_type='check_out' and o.verification_status in ('verified','verified_after_sync') and o.captured_at_device between e.captured_at_device and cap)) then statusv:='rejected';reasonv:='missing_check_in';end if;
 insert into public.hr_attendance_events(staff_account_id,employee_id,branch_id,event_type,client_tx_id,payload_digest,captured_at_device,latitude,longitude,accuracy_m,distance_from_branch_m,selfie_storage_reference,selfie_sha256,device_id,captured_offline,verification_status,verification_reason,app_version,device_time_offset_minutes,clock_drift_seconds,metadata)
 values(c.staff_account_id,c.employee_id,c.branch_id,et,k,dig,cap,lat,lon,acc,dist,coalesce(p_payload->>'selfie_storage_reference',''),up.content_sha256,c.device_id,coalesce((p_payload->>'captured_offline')::boolean,false),statusv,reasonv,p_payload->>'app_version',nullif(p_payload->>'device_time_offset_minutes','')::integer,nullif(p_payload->>'clock_drift_seconds','')::integer,coalesce(p_payload->'metadata','{}'::jsonb)) returning * into a;
 if up.id is not null then update public.hr_staff_selfie_uploads set upload_status='attached' where id=up.id;end if;
 tz:=coalesce(st.timezone,'Africa/Cairo');workd:=(cap at time zone tz)::date;
 perform public.hr_attendance_recalculate_day_v1(c.employee_id,workd);perform public.hr_attendance_recalculate_day_v1(c.employee_id,workd-1);
 return jsonb_build_object('event_id',a.id,'verification_status',a.verification_status,'verification_reason',a.verification_reason,'distance_from_branch_m',a.distance_from_branch_m,'replay',false,'received_at_server',a.received_at_server);
end;$$;

create or replace function public.hr_staff_self_snapshot_v1(p_session_token text,p_from date default current_date-interval '31 days',p_to date default current_date+interval '31 days')
returns jsonb language plpgsql security definer set search_path=public as $$
declare c record;result jsonb;begin
 select * into c from public.hr_staff_session_context_v1(p_session_token);if not found then raise exception 'جلسة الموظف غير صالحة';end if;
 select jsonb_build_object(
  'employee',(select to_jsonb(x) from (select id,name,employee_code,phone,job_title,department,hire_date,employment_status,home_branch_id from public.hr_employees where id=c.employee_id)x),
  'today',(select to_jsonb(x) from (select * from public.hr_attendance_daily_summary where employee_id=c.employee_id and work_date=current_date)x),
  'history',coalesce((select jsonb_agg(to_jsonb(x) order by work_date desc) from (select * from public.hr_attendance_daily_summary where employee_id=c.employee_id and work_date between coalesce(p_from,current_date-31) and coalesce(p_to,current_date+31) order by work_date desc)x),'[]'::jsonb),
  'schedule',coalesce((select jsonb_agg(to_jsonb(x) order by effective_from desc) from (select ws.*,a.effective_from assignment_from,a.effective_to assignment_to from public.hr_employee_schedule_assignments a join public.hr_work_schedules ws on ws.id=a.schedule_id where a.employee_id=c.employee_id and a.active=true)x),'[]'::jsonb),
  'leave_requests',coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc) from (select * from public.hr_leave_requests where employee_id=c.employee_id order by created_at desc limit 100)x),'[]'::jsonb),
  'pending_review',coalesce((select count(*) from public.hr_attendance_events where employee_id=c.employee_id and verification_status='pending_review'),0)
 ) into result;
 update public.hr_staff_sessions set last_seen_at=now() where token_digest=digest(convert_to(p_session_token,'UTF8'),'sha256');
 update public.hr_attendance_devices set last_seen_at=now() where id=c.device_id;
 return result;
end;$$;

create or replace function public.hr_staff_leave_request_v1(p_session_token text,p_request_type text,p_starts_at timestamptz,p_ends_at timestamptz,p_reason text,p_client_tx_id text)
returns bigint language plpgsql security definer set search_path=public as $$
declare c record;idv bigint;dig bytea;old_digest bytea;begin
 select * into c from public.hr_staff_session_context_v1(p_session_token);if not found or c.must_change_pin then raise exception 'جلسة الموظف غير صالحة';end if;
 if p_request_type not in ('leave','permission','late_permission','early_leave_permission','sick_leave','unpaid_leave') or p_ends_at<=p_starts_at then raise exception 'بيانات الطلب غير صحيحة';end if;
 dig:=digest(convert_to(jsonb_build_object('employee_id',c.employee_id,'request_type',p_request_type,'starts_at',p_starts_at,'ends_at',p_ends_at,'reason',nullif(trim(coalesce(p_reason,'')),''))::text,'UTF8'),'sha256');
 perform pg_advisory_xact_lock(hashtextextended('hr-leave:'||c.staff_account_id||':'||p_client_tx_id,0));
 select id,payload_digest into idv,old_digest from public.hr_leave_requests where client_tx_id=p_client_tx_id;if found then if old_digest<>dig then raise exception 'نفس client_tx_id مستخدم بطلب إجازة مختلف';end if;return idv;end if;
 insert into public.hr_leave_requests(employee_id,branch_id,request_type,starts_at,ends_at,reason,client_tx_id,payload_digest,requested_by_staff_account_id)
 values(c.employee_id,c.branch_id,p_request_type,p_starts_at,p_ends_at,nullif(trim(coalesce(p_reason,'')),''),p_client_tx_id,dig,c.staff_account_id) returning id into idv;return idv;
end;$$;

create or replace function public.hr_staff_logout_v1(p_session_token text)
returns boolean language plpgsql security definer set search_path=public as $$begin update public.hr_staff_sessions set revoked_at=now() where token_digest=digest(convert_to(p_session_token,'UTF8'),'sha256') and revoked_at is null;return found;end;$$;

create or replace function public.hr_staff_sync_state_v1(p_session_token text,p_pending_count integer,p_last_error text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare c record;begin select * into c from public.hr_staff_session_context_v1(p_session_token);if not found then raise exception 'جلسة الموظف غير صالحة';end if;
 update public.hr_attendance_devices set pending_queue_count=greatest(coalesce(p_pending_count,0),0),last_sync_at=now(),last_sync_error=nullif(left(trim(coalesce(p_last_error,'')),500),'') ,last_seen_at=now() where id=c.device_id;return true;end;$$;

-- POS/Admin account, device and configuration operations.
create or replace function public.hr_staff_account_create_or_reset_v1(p_employee_id bigint,p_reset_existing boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare h public.hr_employees%rowtype;a public.hr_staff_accounts%rowtype;e bigint;pin text;begin
 if auth.uid() is null or not public.has_action_permission_v2('hr.staff_accounts.manage') then raise exception 'ليس لديك صلاحية إدارة حسابات الموظفين';end if;
 select * into h from public.hr_employees where id=p_employee_id for update;if not found or not h.active then raise exception 'الموظف غير موجود أو موقوف';end if;
 if not public.has_branch_access(h.home_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 select * into a from public.hr_staff_accounts where employee_id=p_employee_id for update;
 if found and not p_reset_existing then raise exception 'حساب الموظف موجود بالفعل';end if;
 pin:=lpad(((get_byte(gen_random_bytes(4),0)::integer*256*256+get_byte(gen_random_bytes(4),1)::integer*256+get_byte(gen_random_bytes(4),2)::integer)%1000000)::text,6,'0');e:=public.current_employee_id();
 insert into public.hr_staff_accounts(employee_id,pin_hash,must_change_pin,active,token_version,created_by_employee_id,updated_at)
 values(p_employee_id,crypt(pin,gen_salt('bf',10)),true,true,1,e,now())
 on conflict(employee_id) do update set pin_hash=excluded.pin_hash,must_change_pin=true,active=true,failed_attempts=0,locked_until=null,token_version=hr_staff_accounts.token_version+1,disabled_at=null,disabled_by_employee_id=null,updated_at=now()
 returning * into a;
 update public.hr_staff_sessions set revoked_at=now() where staff_account_id=a.id and revoked_at is null;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,h.home_branch_id,case when p_reset_existing then 'hr_staff_pin_reset' else 'hr_staff_account_create' end,'hr_staff_account',a.id,jsonb_build_object('hr_employee_id',p_employee_id));
 return jsonb_build_object('staff_account_id',a.id,'temporary_pin',pin,'must_change_pin',true);
end;$$;

create or replace function public.hr_staff_account_set_active_v1(p_staff_account_id bigint,p_active boolean)
returns boolean language plpgsql security definer set search_path=public as $$
declare a public.hr_staff_accounts%rowtype;h public.hr_employees%rowtype;e bigint;begin
 if auth.uid() is null or not public.has_action_permission_v2('hr.staff_accounts.manage') then raise exception 'ليس لديك صلاحية إدارة حسابات الموظفين';end if;
 select * into a from public.hr_staff_accounts where id=p_staff_account_id for update;if not found then raise exception 'الحساب غير موجود';end if;select * into h from public.hr_employees where id=a.employee_id;
 if not public.has_branch_access(h.home_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;e:=public.current_employee_id();
 update public.hr_staff_accounts set active=p_active,disabled_at=case when p_active then null else now() end,disabled_by_employee_id=case when p_active then null else e end,token_version=case when p_active then token_version else token_version+1 end,updated_at=now() where id=a.id;
 if not p_active then update public.hr_staff_sessions set revoked_at=now() where staff_account_id=a.id and revoked_at is null;end if;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,h.home_branch_id,case when p_active then 'hr_staff_account_enable' else 'hr_staff_account_disable' end,'hr_staff_account',a.id,'{}'::jsonb);return true;
end;$$;

create or replace function public.hr_staff_logout_all_v1(p_staff_account_id bigint)
returns boolean language plpgsql security definer set search_path=public as $$
declare a public.hr_staff_accounts%rowtype;h public.hr_employees%rowtype;e bigint;begin
 if auth.uid() is null or not public.has_action_permission_v2('hr.staff_accounts.manage') then raise exception 'ليس لديك صلاحية إدارة حسابات الموظفين';end if;
 select * into a from public.hr_staff_accounts where id=p_staff_account_id for update;if not found then raise exception 'الحساب غير موجود';end if;select * into h from public.hr_employees where id=a.employee_id;if not public.has_branch_access(h.home_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;e:=public.current_employee_id();
 update public.hr_staff_accounts set token_version=token_version+1,updated_at=now() where id=a.id;update public.hr_staff_sessions set revoked_at=now() where staff_account_id=a.id and revoked_at is null;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,h.home_branch_id,'hr_staff_logout_all','hr_staff_account',a.id,'{}'::jsonb);return true;
end;$$;

create or replace function public.hr_staff_device_revoke_v1(p_device_id bigint)
returns boolean language plpgsql security definer set search_path=public as $$
declare d public.hr_attendance_devices%rowtype;h public.hr_employees%rowtype;e bigint;begin
 if auth.uid() is null or not public.has_action_permission_v2('hr.staff_accounts.manage') then raise exception 'ليس لديك صلاحية إدارة أجهزة الموظفين';end if;
 select * into d from public.hr_attendance_devices where id=p_device_id for update;if not found then raise exception 'الجهاز غير موجود';end if;select * into h from public.hr_employees where id=d.employee_id;if not public.has_branch_access(h.home_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;e:=public.current_employee_id();
 update public.hr_attendance_devices set active=false,revoked_at=now(),revoked_by_employee_id=e where id=d.id;update public.hr_staff_sessions set revoked_at=now() where device_id=d.id and revoked_at is null;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,h.home_branch_id,'hr_staff_device_revoke','hr_attendance_device',d.id,jsonb_build_object('staff_account_id',d.staff_account_id));return true;
end;$$;

create or replace function public.hr_work_schedule_save_v1(p_id bigint,p_branch_id bigint,p_name text,p_work_days smallint[],p_start time,p_end time,p_grace_minutes integer,p_break_minutes integer,p_overtime_after_minutes integer,p_early_leave_grace_minutes integer,p_overnight boolean,p_effective_from date,p_effective_to date,p_timezone text default 'Africa/Cairo')
returns bigint language plpgsql security definer set search_path=public as $$
declare idv bigint;e bigint;beforev jsonb;begin
 if auth.uid() is null or not public.has_action_permission_v2('hr.schedules.manage') then raise exception 'ليس لديك صلاحية إدارة الجداول';end if;if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 if nullif(trim(coalesce(p_name,'')),'') is null or p_effective_to<p_effective_from or (not p_overnight and p_end<=p_start) then raise exception 'بيانات الجدول غير صحيحة';end if;e:=public.current_employee_id();
 if p_id is null then insert into public.hr_work_schedules(branch_id,name,work_days,scheduled_start,scheduled_end,grace_minutes,break_minutes,overtime_after_minutes,early_leave_grace_minutes,overnight,effective_from,effective_to,timezone,created_by_employee_id) values(p_branch_id,trim(p_name),p_work_days,p_start,p_end,greatest(p_grace_minutes,0),greatest(p_break_minutes,0),greatest(p_overtime_after_minutes,0),greatest(p_early_leave_grace_minutes,0),p_overnight,p_effective_from,p_effective_to,coalesce(nullif(trim(p_timezone),''),'Africa/Cairo'),e) returning id into idv;
 else select to_jsonb(x) into beforev from public.hr_work_schedules x where x.id=p_id and x.branch_id=p_branch_id for update;if not found then raise exception 'الجدول غير موجود';end if;update public.hr_work_schedules set name=trim(p_name),work_days=p_work_days,scheduled_start=p_start,scheduled_end=p_end,grace_minutes=greatest(p_grace_minutes,0),break_minutes=greatest(p_break_minutes,0),overtime_after_minutes=greatest(p_overtime_after_minutes,0),early_leave_grace_minutes=greatest(p_early_leave_grace_minutes,0),overnight=p_overnight,effective_from=p_effective_from,effective_to=p_effective_to,timezone=coalesce(nullif(trim(p_timezone),''),'Africa/Cairo'),updated_at=now() where id=p_id returning id into idv;end if;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,p_branch_id,'hr_work_schedule_save','hr_work_schedule',idv,jsonb_build_object('before',beforev,'name',p_name));return idv;
end;$$;

create or replace function public.hr_schedule_assign_v1(p_employee_id bigint,p_schedule_id bigint,p_effective_from date,p_effective_to date default null)
returns bigint language plpgsql security definer set search_path=public as $$
declare h public.hr_employees%rowtype;s public.hr_work_schedules%rowtype;idv bigint;e bigint;begin
 if auth.uid() is null or not public.has_action_permission_v2('hr.schedules.manage') then raise exception 'ليس لديك صلاحية إدارة الجداول';end if;select * into h from public.hr_employees where id=p_employee_id;if not found then raise exception 'الموظف غير موجود';end if;select * into s from public.hr_work_schedules where id=p_schedule_id and active=true;if not found or s.branch_id<>h.home_branch_id then raise exception 'الجدول غير صالح للفرع';end if;if not public.has_branch_access(h.home_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 if exists(select 1 from public.hr_employee_schedule_assignments a where a.employee_id=p_employee_id and a.active=true and daterange(a.effective_from,coalesce(a.effective_to,'infinity'::date),'[]') && daterange(p_effective_from,coalesce(p_effective_to,'infinity'::date),'[]')) then raise exception 'يوجد جدول متداخل لنفس الموظف';end if;e:=public.current_employee_id();
 insert into public.hr_employee_schedule_assignments(employee_id,schedule_id,branch_id,effective_from,effective_to,created_by_employee_id) values(p_employee_id,p_schedule_id,h.home_branch_id,p_effective_from,p_effective_to,e) returning id into idv;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,h.home_branch_id,'hr_schedule_assign','hr_employee_schedule_assignment',idv,jsonb_build_object('hr_employee_id',p_employee_id,'schedule_id',p_schedule_id));return idv;
end;$$;

create or replace function public.hr_geofence_set_v1(p_branch_id bigint,p_latitude double precision,p_longitude double precision,p_allowed_radius_m numeric,p_minimum_accuracy_m numeric,p_active boolean default true)
returns bigint language plpgsql security definer set search_path=public as $$
declare idv bigint;e bigint;beforev jsonb;begin
 if auth.uid() is null or not public.has_action_permission_v2('hr.geofence.manage') then raise exception 'ليس لديك صلاحية إدارة نطاق الفرع';end if;if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 select to_jsonb(g) into beforev from public.hr_branch_geofences g where branch_id=p_branch_id;e:=public.current_employee_id();
 insert into public.hr_branch_geofences(branch_id,latitude,longitude,allowed_radius_m,minimum_accuracy_m,active,created_by_employee_id) values(p_branch_id,p_latitude,p_longitude,p_allowed_radius_m,p_minimum_accuracy_m,p_active,e)
 on conflict(branch_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,allowed_radius_m=excluded.allowed_radius_m,minimum_accuracy_m=excluded.minimum_accuracy_m,active=excluded.active,updated_at=now() returning id into idv;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,p_branch_id,'hr_geofence_set','hr_branch_geofence',idv,jsonb_build_object('before',beforev,'after',jsonb_build_object('latitude',p_latitude,'longitude',p_longitude,'allowed_radius_m',p_allowed_radius_m,'minimum_accuracy_m',p_minimum_accuracy_m,'active',p_active)));return idv;
end;$$;

create or replace function public.hr_settings_set_v1(p_branch_id bigint,p_timezone text,p_outside_policy text,p_poor_accuracy_policy text,p_require_selfie boolean,p_selfie_retention_days integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare e bigint;beforev jsonb;begin
 if auth.uid() is null or not public.has_action_permission_v2('hr.settings.manage') then raise exception 'ليس لديك صلاحية إدارة إعدادات HR';end if;if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 if p_outside_policy not in ('reject','pending_review') or p_poor_accuracy_policy not in ('reject','pending_review') or p_selfie_retention_days not between 1 and 3650 then raise exception 'إعدادات HR غير صحيحة';end if;
 select to_jsonb(s) into beforev from public.hr_settings s where branch_id=p_branch_id;e:=public.current_employee_id();
 insert into public.hr_settings(branch_id,timezone,outside_geofence_policy,poor_accuracy_policy,require_selfie,selfie_retention_days,updated_by_employee_id,updated_at)
 values(p_branch_id,coalesce(nullif(trim(p_timezone),''),'Africa/Cairo'),p_outside_policy,p_poor_accuracy_policy,coalesce(p_require_selfie,true),p_selfie_retention_days,e,now())
 on conflict(branch_id) do update set timezone=excluded.timezone,outside_geofence_policy=excluded.outside_geofence_policy,poor_accuracy_policy=excluded.poor_accuracy_policy,require_selfie=excluded.require_selfie,selfie_retention_days=excluded.selfie_retention_days,updated_by_employee_id=e,updated_at=now();
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,p_branch_id,'hr_settings_set','hr_settings',p_branch_id,jsonb_build_object('before',beforev,'after',jsonb_build_object('timezone',p_timezone,'outside_policy',p_outside_policy,'poor_accuracy_policy',p_poor_accuracy_policy,'require_selfie',p_require_selfie,'selfie_retention_days',p_selfie_retention_days)));return true;
end;$$;

create or replace function public.hr_leave_decide_v1(p_leave_request_id bigint,p_approve boolean,p_manager_note text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare l public.hr_leave_requests%rowtype;e bigint;d date;tz text;begin
 if auth.uid() is null or not public.has_action_permission_v2('hr.leave.manage') then raise exception 'ليس لديك صلاحية إدارة الإجازات';end if;select * into l from public.hr_leave_requests where id=p_leave_request_id for update;if not found or l.status<>'pending' then raise exception 'طلب الإجازة غير صالح للقرار';end if;if not public.has_branch_access(l.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;e:=public.current_employee_id();
 update public.hr_leave_requests set status=case when p_approve then 'approved' else 'rejected' end,manager_note=nullif(trim(coalesce(p_manager_note,'')),''),decided_by_employee_id=e,decided_at=now(),updated_at=now() where id=l.id;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,l.branch_id,case when p_approve then 'hr_leave_approve' else 'hr_leave_reject' end,'hr_leave_request',l.id,jsonb_build_object('type',l.request_type,'starts_at',l.starts_at,'ends_at',l.ends_at,'note',p_manager_note));
 if p_approve then tz:=coalesce((select timezone from public.hr_settings where branch_id=l.branch_id),'Africa/Cairo');d:=(l.starts_at at time zone tz)::date;while d<=(l.ends_at at time zone tz)::date loop perform public.hr_attendance_recalculate_day_v1(l.employee_id,d);d:=d+1;end loop;end if;return true;
end;$$;

create or replace function public.hr_attendance_adjust_v1(p_employee_id bigint,p_work_date date,p_original_event_id bigint,p_before jsonb,p_after jsonb,p_reason text,p_client_tx_id text)
returns bigint language plpgsql security definer set search_path=public as $$
declare h public.hr_employees%rowtype;sid bigint;idv bigint;e bigint;begin
 if auth.uid() is null or not public.has_action_permission_v2('hr.attendance.adjust') then raise exception 'ليس لديك صلاحية تصحيح الحضور';end if;select * into h from public.hr_employees where id=p_employee_id;if not found then raise exception 'الموظف غير موجود';end if;if not public.has_branch_access(h.home_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;select id into sid from public.hr_attendance_daily_summary where employee_id=p_employee_id and work_date=p_work_date;
 if nullif(trim(coalesce(p_reason,'')),'') is null or nullif(trim(coalesce(p_client_tx_id,'')),'') is null then raise exception 'سبب ومعرف التصحيح مطلوبان';end if;perform pg_advisory_xact_lock(hashtextextended('hr-attendance-adjust:'||p_client_tx_id,0));select id into idv from public.hr_attendance_adjustments where client_tx_id=p_client_tx_id;if found then return idv;end if;e:=public.current_employee_id();
 insert into public.hr_attendance_adjustments(employee_id,branch_id,original_event_id,summary_id,before_value,after_value,reason,status,adjusted_by_employee_id,approved_by_employee_id,approved_at,client_tx_id) values(p_employee_id,h.home_branch_id,p_original_event_id,sid,coalesce(p_before,'{}'::jsonb),coalesce(p_after,'{}'::jsonb),trim(p_reason),'approved',e,e,now(),p_client_tx_id) returning id into idv;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,h.home_branch_id,'hr_attendance_adjust','hr_attendance_adjustment',idv,jsonb_build_object('original_event_id',p_original_event_id,'summary_id',sid,'before',p_before,'after',p_after,'reason',p_reason));perform public.hr_attendance_recalculate_day_v1(p_employee_id,p_work_date);return idv;
end;$$;

create or replace function public.hr_attendance_summary_approve_v1(p_summary_id bigint,p_approve boolean,p_note text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare s public.hr_attendance_daily_summary%rowtype;e bigint;begin
 if auth.uid() is null or not public.has_action_permission_v2('hr.attendance.manage') then raise exception 'ليس لديك صلاحية اعتماد الحضور';end if;select * into s from public.hr_attendance_daily_summary where id=p_summary_id for update;if not found then raise exception 'ملخص الحضور غير موجود';end if;if not public.has_branch_access(s.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;e:=public.current_employee_id();
 update public.hr_attendance_daily_summary set verification_status=case when p_approve then 'approved' else 'rejected' end,approved_by_employee_id=e,approved_at=now(),metadata=metadata||jsonb_build_object('approval_note',p_note),updated_at=now() where id=s.id;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,s.branch_id,case when p_approve then 'hr_attendance_summary_approve' else 'hr_attendance_summary_reject' end,'hr_attendance_daily_summary',s.id,jsonb_build_object('work_date',s.work_date,'note',p_note));return true;
end;$$;

create or replace function public.hr_apply_attendance_rules_v1(p_employee_id bigint,p_work_date date)
returns integer language plpgsql security definer set search_path=public as $$
declare s public.hr_attendance_daily_summary%rowtype;h public.hr_employees%rowtype;r record;amountv numeric;typev text;reasonv text;keyv text;createdv int:=0;e bigint;countv integer;bucketv text;begin
 if auth.uid() is null or not public.has_action_permission_v2('hr.deduction_rules.manage') then raise exception 'ليس لديك صلاحية تطبيق قواعد الحضور';end if;select * into s from public.hr_attendance_daily_summary where employee_id=p_employee_id and work_date=p_work_date and verification_status='approved';if not found then raise exception 'ملخص الحضور غير معتمد';end if;select * into h from public.hr_employees where id=p_employee_id;if not public.has_branch_access(s.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;e:=public.current_employee_id();
 for r in select distinct dr.* from public.hr_deduction_rules dr left join public.hr_deduction_rule_assignments ra on ra.rule_id=dr.id and ra.active=true where dr.active=true and p_work_date between dr.effective_from and coalesce(dr.effective_to,p_work_date) and ((dr.scope='all') or (dr.scope='branch' and (dr.branch_id=s.branch_id or ra.branch_id=s.branch_id)) or (dr.scope='employee' and ra.employee_id=p_employee_id)) loop
  amountv:=0;typev:='deduction';reasonv:=r.name;
  bucketv:=case r.frequency when 'weekly' then to_char(p_work_date,'IYYY-IW') when 'monthly' then to_char(p_work_date,'YYYY-MM') when 'one_time' then 'once' else p_work_date::text end;
  if r.rule_type in ('late_fixed','late_minutes') and s.late_minutes>=coalesce(r.threshold,1) then amountv:=case when r.rule_type='late_minutes' then floor(s.late_minutes/greatest(coalesce((r.formula->>'minutes_per_unit')::numeric,r.threshold,1),1))*coalesce((r.formula->>'amount_per_unit')::numeric,r.amount,0) else coalesce(r.amount,0) end;reasonv:='تأخير '||s.late_minutes||' دقيقة - '||p_work_date;
  elsif r.rule_type='late_count' then select count(*) into countv from public.hr_attendance_daily_summary ds where ds.employee_id=p_employee_id and ds.verification_status='approved' and ds.late_minutes>0 and ds.work_date between date_trunc('month',p_work_date)::date and p_work_date;if countv>=greatest(coalesce(r.threshold,1),1) then amountv:=coalesce(r.amount,0);reasonv:='تكرار التأخير '||countv||' مرات حتى '||p_work_date;bucketv:=to_char(p_work_date,'YYYY-MM')||':cycle:'||floor(countv/greatest(coalesce(r.threshold,1),1));end if;
  elsif r.rule_type='absence_day' and s.absent then amountv:=coalesce(r.amount,0);reasonv:='غياب يوم - '||p_work_date;
  elsif r.rule_type='early_leave' and s.early_leave_minutes>=coalesce(r.threshold,1) then amountv:=coalesce(r.amount,0);reasonv:='خروج مبكر '||s.early_leave_minutes||' دقيقة - '||p_work_date;
  elsif r.rule_type='overtime_bonus' and s.overtime_minutes>=coalesce(r.threshold,1) then amountv:=floor(s.overtime_minutes/greatest(coalesce((r.formula->>'minutes_per_unit')::numeric,r.threshold,1),1))*coalesce((r.formula->>'amount_per_unit')::numeric,r.amount,0);typev:='overtime';reasonv:='إضافي '||s.overtime_minutes||' دقيقة - '||p_work_date;
  elsif r.rule_type='attendance_bonus' and not s.absent and s.late_minutes=0 and not s.incomplete then amountv:=coalesce(r.amount,0);typev:='bonus';reasonv:='مكافأة انتظام - '||p_work_date;
  elsif r.rule_type='fixed_deduction' then amountv:=coalesce(r.amount,0);reasonv:=r.name||' - '||p_work_date;
  elsif r.rule_type='fixed_bonus' then amountv:=coalesce(r.amount,0);typev:='bonus';reasonv:=r.name||' - '||p_work_date;end if;
  if amountv>0 then keyv:='attendance-rule:'||r.id||':employee:'||p_employee_id||':'||bucketv;
   insert into public.hr_employee_adjustments(employee_id,branch_id,adjustment_type,amount,effective_date,reason,client_tx_id,created_by_employee_id,rule_id,source_daily_summary_id,source_identity,source_detail)
   values(p_employee_id,s.branch_id,typev,round(amountv,2),p_work_date,reasonv,keyv,e,r.id,s.id,keyv,jsonb_build_object('late_minutes',s.late_minutes,'absence',s.absent,'early_leave_minutes',s.early_leave_minutes,'overtime_minutes',s.overtime_minutes,'approval_status','approved')) on conflict(source_identity) where source_identity is not null do nothing;
   if found then createdv:=createdv+1;end if;
  end if;
 end loop;return createdv;
end;$$;

create or replace function public.hr_recurring_adjustments_generate_v1(p_branch_id bigint,p_effective_date date)
returns integer language plpgsql security definer set search_path=public as $$
declare r record;keyv text;createdv int:=0;e bigint;periodv text;begin
 if auth.uid() is null or not public.has_action_permission_v2('hr.deduction_rules.manage') then raise exception 'ليس لديك صلاحية توليد الخصومات الدورية';end if;if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;e:=public.current_employee_id();
 for r in select * from public.hr_recurring_adjustments where branch_id=p_branch_id and status='active' and start_date<=p_effective_date and (end_date is null or end_date>=p_effective_date) and (occurrences_limit is null or occurrences_applied<occurrences_limit) for update loop
  periodv:=case r.frequency when 'weekly' then to_char(p_effective_date,'IYYY-IW') when 'monthly' then to_char(p_effective_date,'YYYY-MM') else p_effective_date::text end;keyv:='recurring:'||r.id||':'||periodv;
  insert into public.hr_employee_adjustments(employee_id,branch_id,adjustment_type,amount,effective_date,reason,client_tx_id,created_by_employee_id,source_identity,source_detail) values(r.employee_id,r.branch_id,r.adjustment_type,r.amount,p_effective_date,r.reason,keyv,e,keyv,jsonb_build_object('recurring_adjustment_id',r.id,'period',periodv)) on conflict(source_identity) where source_identity is not null do nothing;
  if found then createdv:=createdv+1;update public.hr_recurring_adjustments set occurrences_applied=occurrences_applied+1,status=case when occurrences_limit is not null and occurrences_applied+1>=occurrences_limit then 'completed' else status end,updated_at=now() where id=r.id;end if;
 end loop;return createdv;
end;$$;

create or replace function public.hr_deduction_rule_save_v1(p_id bigint,p_name text,p_rule_type text,p_scope text,p_branch_id bigint,p_threshold numeric,p_amount numeric,p_formula jsonb,p_frequency text,p_effective_from date,p_effective_to date,p_active boolean)
returns bigint language plpgsql security definer set search_path=public as $$
declare idv bigint;e bigint;beforev jsonb;begin
 if auth.uid() is null or not public.has_action_permission_v2('hr.deduction_rules.manage') then raise exception 'ليس لديك صلاحية إدارة قواعد الخصومات';end if;
 if p_branch_id is not null and not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 if nullif(trim(coalesce(p_name,'')),'') is null or p_rule_type not in ('late_fixed','late_minutes','late_count','absence_day','early_leave','fixed_deduction','fixed_bonus','overtime_bonus','attendance_bonus') or p_scope not in ('all','branch','employee') or p_frequency not in ('per_event','daily','weekly','monthly','threshold_count','one_time') then raise exception 'بيانات القاعدة غير صحيحة';end if;
 e:=public.current_employee_id();
 if p_id is null then
  insert into public.hr_deduction_rules(name,rule_type,scope,branch_id,threshold,amount,formula,frequency,effective_from,effective_to,active,created_by_employee_id)
  values(trim(p_name),p_rule_type,p_scope,case when p_scope='all' then null else p_branch_id end,p_threshold,p_amount,coalesce(p_formula,'{}'::jsonb),p_frequency,p_effective_from,p_effective_to,coalesce(p_active,true),e) returning id into idv;
 else
  select to_jsonb(r) into beforev from public.hr_deduction_rules r where r.id=p_id for update;if not found then raise exception 'القاعدة غير موجودة';end if;
  update public.hr_deduction_rules set name=trim(p_name),rule_type=p_rule_type,scope=p_scope,branch_id=case when p_scope='all' then null else p_branch_id end,threshold=p_threshold,amount=p_amount,formula=coalesce(p_formula,'{}'::jsonb),frequency=p_frequency,effective_from=p_effective_from,effective_to=p_effective_to,active=coalesce(p_active,true),updated_at=now() where id=p_id returning id into idv;
 end if;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,p_branch_id,'hr_deduction_rule_save','hr_deduction_rule',idv,jsonb_build_object('before',beforev,'name',p_name,'rule_type',p_rule_type,'frequency',p_frequency));return idv;
end;$$;

create or replace function public.hr_recurring_adjustment_save_v1(p_employee_id bigint,p_adjustment_type text,p_amount numeric,p_frequency text,p_start_date date,p_end_date date,p_occurrences_limit integer,p_reason text)
returns bigint language plpgsql security definer set search_path=public as $$
declare h public.hr_employees%rowtype;idv bigint;e bigint;begin
 if auth.uid() is null or not public.has_action_permission_v2('hr.deduction_rules.manage') then raise exception 'ليس لديك صلاحية إدارة الخصومات الدورية';end if;
 select * into h from public.hr_employees where id=p_employee_id and active=true;if not found then raise exception 'الموظف غير موجود';end if;if not public.has_branch_access(h.home_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 if p_adjustment_type not in ('deduction','bonus') or coalesce(p_amount,0)<=0 or p_frequency not in ('weekly','monthly','scheduled') or nullif(trim(coalesce(p_reason,'')),'') is null or (p_end_date is not null and p_end_date<p_start_date) then raise exception 'بيانات الحركة الدورية غير صحيحة';end if;e:=public.current_employee_id();
 insert into public.hr_recurring_adjustments(employee_id,branch_id,adjustment_type,amount,frequency,start_date,end_date,occurrences_limit,reason,created_by_employee_id)
 values(p_employee_id,h.home_branch_id,p_adjustment_type,round(p_amount,2),p_frequency,p_start_date,p_end_date,p_occurrences_limit,trim(p_reason),e) returning id into idv;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,h.home_branch_id,'hr_recurring_adjustment_save','hr_recurring_adjustment',idv,jsonb_build_object('hr_employee_id',p_employee_id,'type',p_adjustment_type,'amount',p_amount,'frequency',p_frequency));return idv;
end;$$;

create or replace function public.hr_deduction_rule_assign_v1(p_rule_id bigint,p_employee_id bigint,p_branch_id bigint,p_active boolean default true)
returns bigint language plpgsql security definer set search_path=public as $$
declare r public.hr_deduction_rules%rowtype;h public.hr_employees%rowtype;idv bigint;e bigint;target_branch bigint;begin
 if auth.uid() is null or not public.has_action_permission_v2('hr.deduction_rules.manage') then raise exception 'ليس لديك صلاحية إدارة قواعد الخصومات';end if;select * into r from public.hr_deduction_rules where id=p_rule_id;if not found then raise exception 'القاعدة غير موجودة';end if;
 if p_employee_id is not null then select * into h from public.hr_employees where id=p_employee_id;if not found then raise exception 'الموظف غير موجود';end if;target_branch:=h.home_branch_id;else target_branch:=p_branch_id;end if;if target_branch is null or not public.has_branch_access(target_branch) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;e:=public.current_employee_id();
 select id into idv from public.hr_deduction_rule_assignments where rule_id=p_rule_id and employee_id is not distinct from p_employee_id and branch_id is not distinct from (case when p_employee_id is null then p_branch_id else null end) for update;
 if found then update public.hr_deduction_rule_assignments set active=coalesce(p_active,true) where id=idv;
 else insert into public.hr_deduction_rule_assignments(rule_id,employee_id,branch_id,active) values(p_rule_id,p_employee_id,case when p_employee_id is null then p_branch_id else null end,coalesce(p_active,true)) returning id into idv;end if;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,target_branch,'hr_deduction_rule_assign','hr_deduction_rule_assignment',idv,jsonb_build_object('rule_id',p_rule_id,'hr_employee_id',p_employee_id,'target_branch_id',p_branch_id,'active',p_active));return idv;
end;$$;

create or replace function public.hr_payroll_run_attendance_v1(p_branch_id bigint,p_period_start date,p_period_end date,p_notes text,p_client_tx_id text)
returns bigint language plpgsql security definer set search_path=public as $$
declare pid bigint;e bigint;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');r record;basev numeric;daysv numeric;minutesv numeric;bonusv numeric;otv numeric;dedv numeric;advv numeric;grossv numeric;netv numeric;iid bigint;a record;begin
 if auth.uid() is null or not public.has_action_permission_v2('hr.payroll.run') then raise exception 'ليس لديك صلاحية إعداد مسير المرتبات';end if;if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;if p_period_start is null or p_period_end<p_period_start or k is null then raise exception 'فترة أو معرف المرتب غير صحيح';end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-payroll-run:'||k,0));select id into pid from public.hr_payroll_periods where client_tx_id=k;if found then return pid;end if;if exists(select 1 from public.hr_payroll_periods where branch_id=p_branch_id and status<>'cancelled' and daterange(period_start,period_end,'[]')&&daterange(p_period_start,p_period_end,'[]')) then raise exception 'يوجد مسير مرتبات متداخل لنفس الفرع';end if;e:=public.current_employee_id();
 insert into public.hr_payroll_periods(branch_id,period_start,period_end,notes,client_tx_id,created_by_employee_id) values(p_branch_id,p_period_start,p_period_end,nullif(trim(coalesce(p_notes,'')),''),k,e) returning id into pid;
 for r in select h.id,h.name,coalesce(c.salary_basis,'monthly') salary_basis,coalesce(c.base_salary,0) base_salary from public.hr_employees h left join public.hr_employee_compensation c on c.employee_id=h.id where h.home_branch_id=p_branch_id and h.active=true and h.employment_status='active' order by h.id loop
  select count(*) filter(where not absent and worked_minutes>0),coalesce(sum(worked_minutes),0) into daysv,minutesv from public.hr_attendance_daily_summary where employee_id=r.id and work_date between p_period_start and p_period_end and verification_status='approved';
  if r.salary_basis in ('daily','hourly') and not exists(select 1 from public.hr_attendance_daily_summary where employee_id=r.id and work_date between p_period_start and p_period_end and verification_status='approved') then raise exception 'الحضور المعتمد مطلوب للموظف اليومي/بالساعة: %',r.name;end if;
  basev:=case r.salary_basis when 'monthly' then r.base_salary when 'daily' then r.base_salary*daysv when 'hourly' then r.base_salary*(minutesv/60.0) else 0 end;
  select coalesce(sum(amount) filter(where adjustment_type='bonus'),0),coalesce(sum(amount) filter(where adjustment_type='overtime'),0),coalesce(sum(amount) filter(where adjustment_type='deduction'),0) into bonusv,otv,dedv from public.hr_employee_adjustments where employee_id=r.id and status='pending' and approval_status='approved' and effective_date between p_period_start and p_period_end;
  grossv:=round(basev+bonusv+otv,2);dedv:=least(round(dedv,2),grossv);select coalesce(sum(case when repayment_mode='installments' then least(outstanding_amount,coalesce(installment_amount,outstanding_amount)) else outstanding_amount end),0) into advv from public.hr_employee_advances where employee_id=r.id and status='active' and outstanding_amount>0;advv:=least(round(advv,2),greatest(grossv-dedv,0));netv:=greatest(round(grossv-dedv-advv,2),0);
  insert into public.hr_payroll_items(payroll_period_id,employee_id,base_amount,overtime_amount,bonus_amount,deduction_amount,advance_deduction,net_amount,notes) values(pid,r.id,round(basev,2),round(otv,2),round(bonusv,2),round(dedv,2),round(advv,2),netv,'Attendance Payroll V1: '||r.salary_basis) returning id into iid;
  insert into public.hr_payroll_item_lines(payroll_item_id,employee_id,line_type,amount,quantity,unit,reason,source_type,source_id,source_identity) values(iid,r.id,'basic_salary',round(basev,2),case when r.salary_basis='daily' then daysv when r.salary_basis='hourly' then round(minutesv/60.0,3) else 1 end,case r.salary_basis when 'daily' then 'day' when 'hourly' then 'hour' else 'month' end,'الراتب الأساسي - '||r.salary_basis,'compensation',r.id,'basic:'||pid||':'||r.id);
  for a in select * from public.hr_employee_adjustments where employee_id=r.id and status='pending' and approval_status='approved' and effective_date between p_period_start and p_period_end order by effective_date,id loop insert into public.hr_payroll_item_lines(payroll_item_id,employee_id,line_type,amount,quantity,unit,effective_date,reason,source_type,source_id,source_identity) values(iid,r.id,case when a.adjustment_type='bonus' then 'bonus' when a.adjustment_type='overtime' then 'overtime' when a.source_identity like 'recurring:%' then 'recurring_deduction' when a.reason like 'تأخير%' then 'late_deduction' when a.reason like 'غياب%' then 'absence_deduction' when a.reason like 'خروج مبكر%' then 'early_leave_deduction' else 'manual_deduction' end,a.amount,1,'item',a.effective_date,coalesce(a.reason,'حركة مرتب'), 'hr_employee_adjustment',a.id,'adjustment:'||a.id);end loop;
  if advv>0 then insert into public.hr_payroll_item_lines(payroll_item_id,employee_id,line_type,amount,quantity,unit,reason,source_type,source_id,source_identity) values(iid,r.id,'advance_installment',advv,1,'item','قسط سلفة','hr_employee_advance',null,'advance:'||pid||':'||r.id);end if;
 end loop;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,p_branch_id,'hr_payroll_run_attendance','hr_payroll_period',pid,jsonb_build_object('period_start',p_period_start,'period_end',p_period_end));return pid;
end;$$;

create or replace function public.hr_payroll_pay_attendance_v1(p_payroll_period_id bigint,p_method text,p_reference text,p_shift_id bigint,p_client_tx_id text)
returns boolean language plpgsql security definer set search_path=public as $$
declare p public.hr_payroll_periods%rowtype;i record;a record;e bigint;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');remain numeric;takev numeric;begin
 if auth.uid() is null or not public.has_action_permission_v2('hr.payroll.pay') or not public.has_action_permission_v2('treasury.post') then raise exception 'ليس لديك صلاحية صرف المرتبات';end if;
 select * into p from public.hr_payroll_periods where id=p_payroll_period_id for update;if not found then raise exception 'مسير المرتبات غير موجود';end if;if p.branch_id is not null and not public.has_branch_access(p.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;if p.status='paid' then return true;end if;if p.status<>'approved' then raise exception 'يجب اعتماد مسير المرتبات قبل الصرف';end if;if k is null then raise exception 'معرف الحركة مطلوب';end if;e:=public.current_employee_id();
 for i in select * from public.hr_payroll_items where payroll_period_id=p.id order by id loop
  if i.net_amount>0 then insert into public.treasury_movements(branch_id,shift_id,direction,movement_type,amount,method,entity_type,entity_id,reference,notes,client_tx_id,employee_id) values(p.branch_id,p_shift_id,'out','payroll',i.net_amount,coalesce(nullif(trim(coalesce(p_method,'')),''),'cash'),'hr_payroll_item',i.id,nullif(trim(coalesce(p_reference,'')),''),'صرف مرتب موظف',k||':employee:'||i.employee_id,e) on conflict(client_tx_id) do nothing;end if;
  remain:=i.advance_deduction;if remain>0 then for a in select id,outstanding_amount from public.hr_employee_advances where employee_id=i.employee_id and status='active' and outstanding_amount>0 order by requested_on,id for update loop exit when remain<=0;takev:=least(a.outstanding_amount,remain);update public.hr_employee_advances set outstanding_amount=round(outstanding_amount-takev,2),status=case when outstanding_amount-takev<=0.009 then 'settled' else 'active' end,updated_at=now() where id=a.id;remain:=round(remain-takev,2);end loop;end if;
  update public.hr_employee_adjustments set status='applied',payroll_period_id=p.id where employee_id=i.employee_id and status='pending' and approval_status='approved' and effective_date between p.period_start and p.period_end;
 end loop;
 update public.hr_payroll_periods set status='paid',paid_by_employee_id=e,paid_at=now() where id=p.id;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,p.branch_id,'hr_payroll_pay_attendance','hr_payroll_period',p.id,jsonb_build_object('method',p_method,'reference',p_reference));return true;
end;$$;

create or replace function public.hr_employee_attendance_presence_v1(p_employee_id bigint,p_branch_id bigint,p_at timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare in_event record;out_at timestamptz;begin
 if auth.uid() is null or not (public.has_action_permission_v2('hr.attendance.view') or public.current_employee_id()=(select login_employee_id from public.hr_employees where id=p_employee_id)) then raise exception 'غير مصرح';end if;if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 select id,captured_at_device into in_event from public.hr_attendance_events where employee_id=p_employee_id and branch_id=p_branch_id and event_type='check_in' and verification_status in ('verified','verified_after_sync') and captured_at_device between p_at-interval '36 hours' and p_at order by captured_at_device desc limit 1;
 if not found then return jsonb_build_object('present',false,'reason','no_check_in');end if;select max(captured_at_device) into out_at from public.hr_attendance_events where employee_id=p_employee_id and branch_id=p_branch_id and event_type='check_out' and verification_status in ('verified','verified_after_sync') and captured_at_device>=in_event.captured_at_device;
 return jsonb_build_object('present',out_at is null,'check_in_at',in_event.captured_at_device,'check_out_at',out_at,'attendance_is_cash_shift',false);
end;$$;

-- Admin function grants.
-- Internal deterministic recalculation is reachable only from trusted wrapper functions.
revoke all on function public.hr_attendance_events_immutable_v1() from public,anon,authenticated;
revoke all on function public.hr_haversine_m_v1(double precision,double precision,double precision,double precision) from public,anon,authenticated;
revoke all on function public.hr_attendance_recalculate_day_v1(bigint,date) from public,anon,authenticated;
revoke all on function public.hr_staff_account_create_or_reset_v1(bigint,boolean) from public,anon,authenticated;
revoke all on function public.hr_staff_account_set_active_v1(bigint,boolean) from public,anon,authenticated;
revoke all on function public.hr_staff_logout_all_v1(bigint) from public,anon,authenticated;
revoke all on function public.hr_staff_device_revoke_v1(bigint) from public,anon,authenticated;
revoke all on function public.hr_work_schedule_save_v1(bigint,bigint,text,smallint[],time,time,integer,integer,integer,integer,boolean,date,date,text) from public,anon,authenticated;
revoke all on function public.hr_schedule_assign_v1(bigint,bigint,date,date) from public,anon,authenticated;
revoke all on function public.hr_geofence_set_v1(bigint,double precision,double precision,numeric,numeric,boolean) from public,anon,authenticated;
revoke all on function public.hr_settings_set_v1(bigint,text,text,text,boolean,integer) from public,anon,authenticated;
revoke all on function public.hr_leave_decide_v1(bigint,boolean,text) from public,anon,authenticated;
revoke all on function public.hr_attendance_adjust_v1(bigint,date,bigint,jsonb,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.hr_attendance_summary_approve_v1(bigint,boolean,text) from public,anon,authenticated;
revoke all on function public.hr_apply_attendance_rules_v1(bigint,date) from public,anon,authenticated;
revoke all on function public.hr_recurring_adjustments_generate_v1(bigint,date) from public,anon,authenticated;
revoke all on function public.hr_deduction_rule_save_v1(bigint,text,text,text,bigint,numeric,numeric,jsonb,text,date,date,boolean) from public,anon,authenticated;
revoke all on function public.hr_recurring_adjustment_save_v1(bigint,text,numeric,text,date,date,integer,text) from public,anon,authenticated;
revoke all on function public.hr_deduction_rule_assign_v1(bigint,bigint,bigint,boolean) from public,anon,authenticated;
revoke all on function public.hr_payroll_run_attendance_v1(bigint,date,date,text,text) from public,anon,authenticated;
revoke all on function public.hr_payroll_pay_attendance_v1(bigint,text,text,bigint,text) from public,anon,authenticated;
revoke all on function public.hr_employee_attendance_presence_v1(bigint,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.hr_staff_account_create_or_reset_v1(bigint,boolean) to authenticated;
grant execute on function public.hr_staff_account_set_active_v1(bigint,boolean) to authenticated;
grant execute on function public.hr_staff_logout_all_v1(bigint) to authenticated;
grant execute on function public.hr_staff_device_revoke_v1(bigint) to authenticated;
grant execute on function public.hr_work_schedule_save_v1(bigint,bigint,text,smallint[],time,time,integer,integer,integer,integer,boolean,date,date,text) to authenticated;
grant execute on function public.hr_schedule_assign_v1(bigint,bigint,date,date) to authenticated;
grant execute on function public.hr_geofence_set_v1(bigint,double precision,double precision,numeric,numeric,boolean) to authenticated;
grant execute on function public.hr_settings_set_v1(bigint,text,text,text,boolean,integer) to authenticated;
grant execute on function public.hr_leave_decide_v1(bigint,boolean,text) to authenticated;
grant execute on function public.hr_attendance_adjust_v1(bigint,date,bigint,jsonb,jsonb,text,text) to authenticated;
grant execute on function public.hr_attendance_summary_approve_v1(bigint,boolean,text) to authenticated;
grant execute on function public.hr_apply_attendance_rules_v1(bigint,date) to authenticated;
grant execute on function public.hr_recurring_adjustments_generate_v1(bigint,date) to authenticated;
grant execute on function public.hr_deduction_rule_save_v1(bigint,text,text,text,bigint,numeric,numeric,jsonb,text,date,date,boolean) to authenticated;
grant execute on function public.hr_recurring_adjustment_save_v1(bigint,text,numeric,text,date,date,integer,text) to authenticated;
grant execute on function public.hr_deduction_rule_assign_v1(bigint,bigint,bigint,boolean) to authenticated;
grant execute on function public.hr_payroll_run_attendance_v1(bigint,date,date,text,text) to authenticated;
grant execute on function public.hr_payroll_pay_attendance_v1(bigint,text,text,bigint,text) to authenticated;
grant execute on function public.hr_employee_attendance_presence_v1(bigint,bigint,timestamptz) to authenticated;

-- Staff/API functions are intentionally service-role only.
revoke all on function public.hr_staff_session_context_v1(text) from public,anon,authenticated;
revoke all on function public.hr_staff_login_v1(text,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.hr_staff_change_pin_v1(text,text,text) from public,anon,authenticated;
revoke all on function public.hr_staff_selfie_reserve_v1(text,text,text,timestamptz,jsonb) from public,anon,authenticated;
revoke all on function public.hr_staff_selfie_complete_v1(text,text,text) from public,anon,authenticated;
revoke all on function public.hr_staff_attendance_submit_v1(text,jsonb) from public,anon,authenticated;
revoke all on function public.hr_staff_self_snapshot_v1(text,date,date) from public,anon,authenticated;
revoke all on function public.hr_staff_leave_request_v1(text,text,timestamptz,timestamptz,text,text) from public,anon,authenticated;
revoke all on function public.hr_staff_logout_v1(text) from public,anon,authenticated;
revoke all on function public.hr_staff_sync_state_v1(text,integer,text) from public,anon,authenticated;
grant execute on function public.hr_staff_session_context_v1(text) to service_role;
grant execute on function public.hr_staff_login_v1(text,text,text,text,text,text,text) to service_role;
grant execute on function public.hr_staff_change_pin_v1(text,text,text) to service_role;
grant execute on function public.hr_staff_selfie_reserve_v1(text,text,text,timestamptz,jsonb) to service_role;
grant execute on function public.hr_staff_selfie_complete_v1(text,text,text) to service_role;
grant execute on function public.hr_staff_attendance_submit_v1(text,jsonb) to service_role;
grant execute on function public.hr_staff_self_snapshot_v1(text,date,date) to service_role;
grant execute on function public.hr_staff_leave_request_v1(text,text,timestamptz,timestamptz,text,text) to service_role;
grant execute on function public.hr_staff_logout_v1(text) to service_role;
grant execute on function public.hr_staff_sync_state_v1(text,integer,text) to service_role;

commit;
