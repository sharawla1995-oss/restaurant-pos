-- Sharawla POS 10.5.14 Candidate
-- Notifications V1 + HR approval/branch-disbursement separation + Summary V2.
-- Additive except permission checks on HR disbursement RPCs, intentionally moved to branch finance.
begin;

create table if not exists public.app_notifications_v1(
 id bigserial primary key,
 recipient_employee_id bigint references public.employees(id) on delete cascade,
 recipient_hr_employee_id bigint references public.hr_employees(id) on delete cascade,
 branch_id bigint references public.branches(id) on delete cascade,
 kind text not null,
 title text not null,
 body text,
 entity_type text,
 entity_id bigint,
 action_page text,
 dedupe_key text not null,
 read_at timestamptz,
 created_at timestamptz not null default now(),
 constraint app_notifications_v1_one_recipient_chk check(
   (recipient_employee_id is not null)::int + (recipient_hr_employee_id is not null)::int = 1
 )
);
create unique index if not exists app_notifications_v1_pos_dedupe_uidx
 on public.app_notifications_v1(recipient_employee_id,dedupe_key) where recipient_employee_id is not null;
create unique index if not exists app_notifications_v1_staff_dedupe_uidx
 on public.app_notifications_v1(recipient_hr_employee_id,dedupe_key) where recipient_hr_employee_id is not null;
create index if not exists app_notifications_v1_pos_unread_idx
 on public.app_notifications_v1(recipient_employee_id,read_at,created_at desc) where recipient_employee_id is not null;
create index if not exists app_notifications_v1_staff_idx
 on public.app_notifications_v1(recipient_hr_employee_id,created_at desc) where recipient_hr_employee_id is not null;

alter table public.app_notifications_v1 enable row level security;
revoke all on public.app_notifications_v1 from anon,authenticated;
grant select on public.app_notifications_v1 to authenticated;
grant update(read_at) on public.app_notifications_v1 to authenticated;
grant usage,select on sequence public.app_notifications_v1_id_seq to authenticated;

drop policy if exists app_notifications_v1_pos_read on public.app_notifications_v1;
create policy app_notifications_v1_pos_read on public.app_notifications_v1
 for select to authenticated using(recipient_employee_id=public.current_employee_id());
drop policy if exists app_notifications_v1_pos_update on public.app_notifications_v1;
create policy app_notifications_v1_pos_update on public.app_notifications_v1
 for update to authenticated using(recipient_employee_id=public.current_employee_id())
 with check(recipient_employee_id=public.current_employee_id());

create or replace function public.app_notify_permission_v14(
 p_permission text,p_branch_id bigint,p_kind text,p_title text,p_body text,
 p_entity_type text,p_entity_id bigint,p_action_page text,p_dedupe_prefix text
) returns integer
language plpgsql security definer set search_path=public as $$
declare n integer:=0;
begin
 insert into public.app_notifications_v1(
  recipient_employee_id,branch_id,kind,title,body,entity_type,entity_id,action_page,dedupe_key
 )
 select e.id,p_branch_id,p_kind,p_title,p_body,p_entity_type,p_entity_id,p_action_page,
        p_dedupe_prefix||':employee:'||e.id
 from public.employees e
 where e.active=true
   and (
     e.role='admin'
     or exists(select 1 from public.employee_permissions ep where ep.employee_id=e.id and ep.permission_key=p_permission and ep.allowed=true)
   )
   and (
     e.role='admin'
     or e.branch_id=p_branch_id
     or exists(select 1 from public.employee_branches eb where eb.employee_id=e.id and eb.branch_id=p_branch_id)
   )
 on conflict do nothing;
 get diagnostics n=row_count;
 return n;
end;$$;
revoke all on function public.app_notify_permission_v14(text,bigint,text,text,text,text,bigint,text,text) from public,anon,authenticated;

create or replace function public.app_notify_pos_employee_v14(
 p_employee_id bigint,p_branch_id bigint,p_kind text,p_title text,p_body text,
 p_entity_type text,p_entity_id bigint,p_action_page text,p_dedupe_key text
) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 if p_employee_id is null then return false; end if;
 insert into public.app_notifications_v1(recipient_employee_id,branch_id,kind,title,body,entity_type,entity_id,action_page,dedupe_key)
 values(p_employee_id,p_branch_id,p_kind,p_title,p_body,p_entity_type,p_entity_id,p_action_page,p_dedupe_key)
 on conflict do nothing;
 return true;
end;$$;
revoke all on function public.app_notify_pos_employee_v14(bigint,bigint,text,text,text,text,bigint,text,text) from public,anon,authenticated;

create or replace function public.app_notify_staff_v14(
 p_hr_employee_id bigint,p_branch_id bigint,p_kind text,p_title text,p_body text,
 p_entity_type text,p_entity_id bigint,p_dedupe_key text
) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 if p_hr_employee_id is null then return false; end if;
 insert into public.app_notifications_v1(recipient_hr_employee_id,branch_id,kind,title,body,entity_type,entity_id,dedupe_key)
 values(p_hr_employee_id,p_branch_id,p_kind,p_title,p_body,p_entity_type,p_entity_id,p_dedupe_key)
 on conflict do nothing;
 return true;
end;$$;
revoke all on function public.app_notify_staff_v14(bigint,bigint,text,text,text,text,bigint,text) from public,anon,authenticated;

-- Return approvals -> manager notification; decision -> requester notification.
create or replace function public.app_notify_return_approval_v14()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' then
  perform public.app_notify_permission_v14(
   'returnApprovals',new.branch_id,'return_approval','طلب اعتماد مرتجع جديد',
   'مرتجع بقيمة '||coalesce(new.expected_total,0)::text||' — بون '||coalesce(new.order_bon_number::text,'-'),
   'return_approval',new.id,'approvals','return-request:'||new.id
  );
 elsif new.status is distinct from old.status then
  perform public.app_notify_pos_employee_v14(
   new.requester_employee_id,new.branch_id,'return_decision',
   case when new.status='approved' then 'تم اعتماد المرتجع' when new.status='rejected' then 'تم رفض المرتجع' else 'تحديث طلب المرتجع' end,
   'حالة طلب المرتجع: '||new.status,'return_approval',new.id,'approvals','return-decision:'||new.id||':'||new.status
  );
 end if;
 return new;
end;$$;
drop trigger if exists trg_app_notify_return_approval_v14 on public.return_approval_requests;
create trigger trg_app_notify_return_approval_v14 after insert or update of status on public.return_approval_requests
for each row execute function public.app_notify_return_approval_v14();

-- HR adjustment requests require explicit HR approval before payroll.
alter table public.hr_employee_adjustments add column if not exists approval_status text not null default 'approved';
do $$begin
 if not exists(select 1 from pg_constraint where conname='hr_employee_adjustments_approval_status_v14_chk') then
  alter table public.hr_employee_adjustments add constraint hr_employee_adjustments_approval_status_v14_chk
   check(approval_status in ('pending','approved','rejected'));
 end if;
end$$;
alter table public.hr_employee_adjustments add column if not exists approval_note text;
alter table public.hr_employee_adjustments add column if not exists approved_by_employee_id bigint references public.employees(id) on delete set null;
alter table public.hr_employee_adjustments add column if not exists approved_at timestamptz;

create or replace function public.hr_adjustment_create_v1(
 p_employee_id bigint,p_adjustment_type text,p_amount numeric,p_effective_date date default current_date,
 p_reason text default null,p_client_tx_id text default null
) returns bigint language plpgsql security definer set search_path=public as $$
declare h public.hr_employees%rowtype;idv bigint;e bigint;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not (public.has_permission('hr.adjustments.manage') or public.has_permission('branch.hr.adjustments.request')) then
  raise exception 'ليس لديك صلاحية رفع طلب خصم أو مكافأة';
 end if;
 select * into h from public.hr_employees where id=p_employee_id and active=true;
 if not found then raise exception 'الموظف غير موجود';end if;
 if not public.has_branch_access(h.home_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 if p_adjustment_type not in ('deduction','bonus','overtime') or coalesce(p_amount,0)<=0 then raise exception 'بيانات الحركة غير صحيحة';end if;
 if k is null then raise exception 'معرف الحركة مطلوب';end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-adjustment:'||k,0));
 select id into idv from public.hr_employee_adjustments where client_tx_id=k;
 if idv is not null then return idv;end if;
 e:=public.current_employee_id();
 insert into public.hr_employee_adjustments(
  employee_id,branch_id,adjustment_type,amount,effective_date,reason,client_tx_id,created_by_employee_id,approval_status
 ) values(
  p_employee_id,h.home_branch_id,p_adjustment_type,round(p_amount,2),coalesce(p_effective_date,current_date),
  nullif(trim(coalesce(p_reason,'')),''),k,e,'pending'
 ) returning id into idv;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(e,h.home_branch_id,'hr_adjustment_request','hr_adjustment',idv,jsonb_build_object('employee_id',p_employee_id,'type',p_adjustment_type,'amount',round(p_amount,2)));
 return idv;
end;$$;

create or replace function public.hr_adjustment_decide_v2(p_adjustment_id bigint,p_approve boolean,p_note text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare a public.hr_employee_adjustments%rowtype;e bigint;
begin
 if auth.uid() is null or not public.has_permission('hr.adjustments.manage') then raise exception 'ليس لديك صلاحية اعتماد الجزاءات والمكافآت';end if;
 select * into a from public.hr_employee_adjustments where id=p_adjustment_id for update;
 if not found then raise exception 'الحركة غير موجودة';end if;
 if not public.has_branch_access(a.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 if a.approval_status<>'pending' then raise exception 'تم اتخاذ قرار على الحركة بالفعل';end if;
 e:=public.current_employee_id();
 update public.hr_employee_adjustments
 set approval_status=case when p_approve then 'approved' else 'rejected' end,
     approval_note=nullif(trim(coalesce(p_note,'')),''),
     approved_by_employee_id=e,approved_at=now()
 where id=a.id;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(e,a.branch_id,case when p_approve then 'hr_adjustment_approve' else 'hr_adjustment_reject' end,'hr_adjustment',a.id,jsonb_build_object('note',p_note));
 return true;
end;$$;
grant execute on function public.hr_adjustment_decide_v2(bigint,boolean,text) to authenticated;

create or replace function public.app_notify_adjustment_v14()
returns trigger language plpgsql security definer set search_path=public as $$
declare nm text;
begin
 if tg_op='INSERT' and new.approval_status='pending' then
  perform public.app_notify_permission_v14(
   'hr.adjustments.manage',new.branch_id,'hr_adjustment_request','طلب جزاء / مكافأة جديد',
   'حركة '||new.adjustment_type||' بقيمة '||new.amount::text,'hr_adjustment',new.id,'hr-adjustments','hr-adjustment-request:'||new.id
  );
 elsif tg_op='UPDATE' and new.approval_status is distinct from old.approval_status then
  nm:=case when new.approval_status='approved' then 'تم اعتماد حركة HR' else 'تم رفض حركة HR' end;
  perform public.app_notify_pos_employee_v14(new.created_by_employee_id,new.branch_id,'hr_adjustment_decision',nm,new.adjustment_type||' — '||new.amount::text,'hr_adjustment',new.id,'hr-adjustments','hr-adjustment-decision-pos:'||new.id||':'||new.approval_status);
  perform public.app_notify_staff_v14(new.employee_id,new.branch_id,'hr_adjustment_decision',nm,new.adjustment_type||' — '||new.amount::text,'hr_adjustment',new.id,'hr-adjustment-decision-staff:'||new.id||':'||new.approval_status);
 end if;
 return new;
end;$$;
drop trigger if exists trg_app_notify_adjustment_v14 on public.hr_employee_adjustments;
create trigger trg_app_notify_adjustment_v14 after insert or update of approval_status on public.hr_employee_adjustments
for each row execute function public.app_notify_adjustment_v14();

-- Staff can request advances; HR still owns approve/reject.
create or replace function public.hr_staff_advance_request_v1(
 p_session_token text,p_amount numeric,p_repayment_mode text,p_installment_amount numeric,
 p_installments_count integer,p_reason text,p_client_tx_id text
) returns bigint language plpgsql security definer set search_path=public as $$
declare c record;idv bigint;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');oldr public.hr_employee_advances%rowtype;
begin
 select * into c from public.hr_staff_session_context_v1(p_session_token);
 if not found or c.must_change_pin then raise exception 'جلسة الموظف غير صالحة';end if;
 if coalesce(p_amount,0)<=0 or p_repayment_mode not in ('one_time','installments') then raise exception 'بيانات السلفة غير صحيحة';end if;
 if p_repayment_mode='installments' and (coalesce(p_installment_amount,0)<=0 or coalesce(p_installments_count,0)<=0) then raise exception 'بيانات الأقساط غير صحيحة';end if;
 if k is null then raise exception 'معرف الطلب مطلوب';end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-staff-advance:'||c.staff_account_id||':'||k,0));
 select * into oldr from public.hr_employee_advances where client_tx_id=k;
 if found then
  if oldr.employee_id<>c.employee_id or oldr.amount<>round(p_amount,2) or oldr.repayment_mode<>p_repayment_mode then raise exception 'نفس client_tx_id مستخدم بطلب مختلف';end if;
  return oldr.id;
 end if;
 insert into public.hr_employee_advances(
  employee_id,branch_id,amount,outstanding_amount,repayment_mode,installment_amount,installments_count,
  status,reason,client_tx_id,created_by_employee_id
 ) values(
  c.employee_id,c.branch_id,round(p_amount,2),round(p_amount,2),p_repayment_mode,
  case when p_repayment_mode='installments' then round(p_installment_amount,2) else null end,
  case when p_repayment_mode='installments' then p_installments_count else null end,
  'draft',nullif(trim(coalesce(p_reason,'')),''),k,null
 ) returning id into idv;
 return idv;
end;$$;
revoke all on function public.hr_staff_advance_request_v1(text,numeric,text,numeric,integer,text,text) from public,anon,authenticated;
grant execute on function public.hr_staff_advance_request_v1(text,numeric,text,numeric,integer,text,text) to service_role;

create or replace function public.app_notify_advance_v14()
returns trigger language plpgsql security definer set search_path=public as $$
declare nm text;
begin
 if tg_op='INSERT' and new.status='draft' then
  perform public.app_notify_permission_v14('hr.advances.approve',new.branch_id,'hr_advance_request','طلب سلفة جديد','سلفة بقيمة '||new.amount::text,'hr_advance',new.id,'hr-advances','hr-advance-request:'||new.id);
 elsif tg_op='UPDATE' and new.status is distinct from old.status then
  nm:=case when new.status='approved' then 'تم اعتماد السلفة' when new.status='rejected' then 'تم رفض السلفة' when new.status='active' then 'تم صرف السلفة' when new.status='settled' then 'تم سداد السلفة' else 'تحديث السلفة' end;
  perform public.app_notify_staff_v14(new.employee_id,new.branch_id,'hr_advance_status',nm,'المبلغ '||new.amount::text,'hr_advance',new.id,'hr-advance-staff:'||new.id||':'||new.status);
  if new.created_by_employee_id is not null then
   perform public.app_notify_pos_employee_v14(new.created_by_employee_id,new.branch_id,'hr_advance_status',nm,'المبلغ '||new.amount::text,'hr_advance',new.id,'hr-advances','hr-advance-pos:'||new.id||':'||new.status);
  end if;
  if new.status='approved' then
   perform public.app_notify_permission_v14('branch.hr.finance.disburse',new.branch_id,'hr_advance_ready','سلفة معتمدة في انتظار الصرف','سلفة بقيمة '||new.amount::text,'hr_advance',new.id,'branch-hr-finance','hr-advance-finance:'||new.id);
  elsif new.status='active' then
   perform public.app_notify_permission_v14('hr.advances.view',new.branch_id,'hr_advance_paid','تم صرف سلفة معتمدة','سلفة بقيمة '||new.amount::text,'hr_advance',new.id,'hr-advances','hr-advance-paid-hr:'||new.id);
  end if;
 end if;
 return new;
end;$$;
drop trigger if exists trg_app_notify_advance_v14 on public.hr_employee_advances;
create trigger trg_app_notify_advance_v14 after insert or update of status on public.hr_employee_advances
for each row execute function public.app_notify_advance_v14();

-- Leave request notification to HR and decision back to Staff.
create or replace function public.app_notify_leave_v14()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' and new.status='pending' then
  perform public.app_notify_permission_v14('hr.leave.manage',new.branch_id,'hr_leave_request','طلب إجازة / إذن جديد','نوع الطلب: '||new.request_type,'hr_leave',new.id,'hr-leave','hr-leave-request:'||new.id);
 elsif tg_op='UPDATE' and new.status is distinct from old.status then
  perform public.app_notify_staff_v14(new.employee_id,new.branch_id,'hr_leave_status',
    case when new.status='approved' then 'تم اعتماد طلب الإجازة/الإذن' when new.status='rejected' then 'تم رفض طلب الإجازة/الإذن' else 'تحديث طلب الإجازة/الإذن' end,
    coalesce(new.manager_note,new.request_type),'hr_leave',new.id,'hr-leave-staff:'||new.id||':'||new.status);
 end if;
 return new;
end;$$;
drop trigger if exists trg_app_notify_leave_v14 on public.hr_leave_requests;
create trigger trg_app_notify_leave_v14 after insert or update of status on public.hr_leave_requests
for each row execute function public.app_notify_leave_v14();

-- Staff snapshot now includes requests, payslips and notifications.
create or replace function public.hr_staff_self_snapshot_v1(p_session_token text,p_from date default current_date-interval '31 days',p_to date default current_date+interval '31 days')
returns jsonb language plpgsql security definer set search_path=public as $$
declare c record;result jsonb;
begin
 select * into c from public.hr_staff_session_context_v1(p_session_token);if not found then raise exception 'جلسة الموظف غير صالحة';end if;
 select jsonb_build_object(
  'employee',(select to_jsonb(x) from (select id,name,employee_code,phone,job_title,department,hire_date,employment_status,home_branch_id from public.hr_employees where id=c.employee_id)x),
  'today',(select to_jsonb(x) from (select * from public.hr_attendance_daily_summary where employee_id=c.employee_id and work_date=current_date)x),
  'history',coalesce((select jsonb_agg(to_jsonb(x) order by work_date desc) from (select * from public.hr_attendance_daily_summary where employee_id=c.employee_id and work_date between coalesce(p_from,current_date-31) and coalesce(p_to,current_date+31) order by work_date desc)x),'[]'::jsonb),
  'schedule',coalesce((select jsonb_agg(to_jsonb(x) order by effective_from desc) from (select ws.*,a.effective_from assignment_from,a.effective_to assignment_to from public.hr_employee_schedule_assignments a join public.hr_work_schedules ws on ws.id=a.schedule_id where a.employee_id=c.employee_id and a.active=true)x),'[]'::jsonb),
  'leave_requests',coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc) from (select * from public.hr_leave_requests where employee_id=c.employee_id order by created_at desc limit 100)x),'[]'::jsonb),
  'advance_requests',coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc) from (select id,amount,outstanding_amount,repayment_mode,installment_amount,installments_count,status,requested_on,reason,disbursed_at,payment_method,created_at from public.hr_employee_advances where employee_id=c.employee_id order by created_at desc limit 50)x),'[]'::jsonb),
  'adjustments',coalesce((select jsonb_agg(to_jsonb(x) order by effective_date desc) from (select id,adjustment_type,amount,effective_date,reason,approval_status,status from public.hr_employee_adjustments where employee_id=c.employee_id and approval_status='approved' order by effective_date desc,id desc limit 100)x),'[]'::jsonb),
  'payroll',coalesce((select jsonb_agg(to_jsonb(x) order by period_end desc) from (
    select i.id item_id,p.id payroll_period_id,p.period_start,p.period_end,p.status,i.base_amount,i.overtime_amount,i.bonus_amount,i.deduction_amount,i.advance_deduction,i.net_amount,p.paid_at
    from public.hr_payroll_items i join public.hr_payroll_periods p on p.id=i.payroll_period_id
    where i.employee_id=c.employee_id order by p.period_end desc,p.id desc limit 24
  )x),'[]'::jsonb),
  'notifications',coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc) from (
    select id,kind,title,body,entity_type,entity_id,read_at,created_at from public.app_notifications_v1
    where recipient_hr_employee_id=c.employee_id order by created_at desc limit 100
  )x),'[]'::jsonb),
  'pending_review',coalesce((select count(*) from public.hr_attendance_events where employee_id=c.employee_id and verification_status='pending_review'),0)
 ) into result;
 update public.hr_staff_sessions set last_seen_at=now() where token_digest=extensions.digest(convert_to(p_session_token,'UTF8'),'sha256');
 update public.hr_attendance_devices set last_seen_at=now() where id=c.device_id;
 return result;
end;$$;
revoke all on function public.hr_staff_self_snapshot_v1(text,date,date) from public,anon,authenticated;
grant execute on function public.hr_staff_self_snapshot_v1(text,date,date) to service_role;

-- Move actual disbursement authority from HR to branch finance.
create or replace function public.hr_advance_disburse_v1(p_advance_id bigint,p_method text,p_reference text,p_shift_id bigint,p_client_tx_id text)
returns bigint language plpgsql security definer set search_path=public as $$
declare a public.hr_employee_advances%rowtype;mid bigint;e bigint;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not public.has_permission('branch.hr.finance.disburse') or not public.has_permission('treasury.post') then raise exception 'ليس لديك صلاحية صرف مستحقات HR من الفرع';end if;
 select * into a from public.hr_employee_advances where id=p_advance_id for update;if not found then raise exception 'السلفة غير موجودة';end if;
 if not public.has_branch_access(a.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 if a.status='active' then select id into mid from public.treasury_movements where entity_type='hr_advance' and entity_id=a.id limit 1;return mid;end if;
 if a.status<>'approved' then raise exception 'يجب اعتماد السلفة من HR قبل الصرف';end if;
 if k is null then raise exception 'معرف الحركة مطلوب';end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-advance-disburse:'||k,0));
 select id into mid from public.treasury_movements where client_tx_id=k;if mid is not null then return mid;end if;
 e:=public.current_employee_id();
 insert into public.treasury_movements(branch_id,shift_id,direction,movement_type,amount,method,entity_type,entity_id,reference,notes,client_tx_id,employee_id)
 values(a.branch_id,p_shift_id,'out','employee_advance',a.amount,coalesce(nullif(trim(coalesce(p_method,'')),''),'cash'),'hr_advance',a.id,nullif(trim(coalesce(p_reference,'')),''),'صرف سلفة موظف بعد اعتماد HR',k,e) returning id into mid;
 update public.hr_employee_advances set status='active',disbursed_at=now(),payment_method=coalesce(nullif(trim(coalesce(p_method,'')),''),'cash'),payment_reference=nullif(trim(coalesce(p_reference,'')),''),disbursed_by_employee_id=e,updated_at=now() where id=a.id;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,a.branch_id,'branch_hr_advance_disburse','hr_advance',a.id,jsonb_build_object('amount',a.amount,'method',p_method,'treasury_movement_id',mid));
 return mid;
end;$$;

create or replace function public.hr_payroll_pay_attendance_v1(p_payroll_period_id bigint,p_method text,p_reference text,p_shift_id bigint,p_client_tx_id text)
returns boolean language plpgsql security definer set search_path=public as $$
declare p public.hr_payroll_periods%rowtype;i record;a record;e bigint;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');remain numeric;takev numeric;
begin
 if auth.uid() is null or not public.has_permission('branch.hr.finance.disburse') or not public.has_permission('treasury.post') then raise exception 'ليس لديك صلاحية صرف المرتبات المعتمدة من الفرع';end if;
 select * into p from public.hr_payroll_periods where id=p_payroll_period_id for update;if not found then raise exception 'مسير المرتبات غير موجود';end if;
 if p.branch_id is not null and not public.has_branch_access(p.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 if p.status='paid' then return true;end if;if p.status<>'approved' then raise exception 'يجب اعتماد مسير المرتبات من HR قبل الصرف';end if;if k is null then raise exception 'معرف الحركة مطلوب';end if;e:=public.current_employee_id();
 for i in select * from public.hr_payroll_items where payroll_period_id=p.id order by id loop
  if i.net_amount>0 then
   insert into public.treasury_movements(branch_id,shift_id,direction,movement_type,amount,method,entity_type,entity_id,reference,notes,client_tx_id,employee_id)
   values(p.branch_id,p_shift_id,'out','payroll',i.net_amount,coalesce(nullif(trim(coalesce(p_method,'')),''),'cash'),'hr_payroll_item',i.id,nullif(trim(coalesce(p_reference,'')),''),'صرف مرتب موظف بعد اعتماد HR',k||':employee:'||i.employee_id,e)
   on conflict(client_tx_id) do nothing;
  end if;
  remain:=i.advance_deduction;
  if remain>0 then
   for a in select id,outstanding_amount from public.hr_employee_advances where employee_id=i.employee_id and status='active' and outstanding_amount>0 order by requested_on,id for update loop
    exit when remain<=0;takev:=least(a.outstanding_amount,remain);
    update public.hr_employee_advances set outstanding_amount=round(outstanding_amount-takev,2),status=case when outstanding_amount-takev<=0.009 then 'settled' else 'active' end,updated_at=now() where id=a.id;
    remain:=round(remain-takev,2);
   end loop;
  end if;
  update public.hr_employee_adjustments set status='applied',payroll_period_id=p.id where employee_id=i.employee_id and status='pending' and approval_status='approved' and effective_date between p.period_start and p.period_end;
 end loop;
 update public.hr_payroll_periods set status='paid',paid_by_employee_id=e,paid_at=now() where id=p.id;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,p.branch_id,'branch_hr_payroll_pay','hr_payroll_period',p.id,jsonb_build_object('method',p_method,'reference',p_reference));
 perform public.app_notify_permission_v14('hr.payroll.view',p.branch_id,'hr_payroll_paid','تم صرف مسير مرتبات معتمد','الفترة '||p.period_start::text||' إلى '||p.period_end::text,'hr_payroll_period',p.id,'hr-payroll','hr-payroll-paid:'||p.id);
 for i in select employee_id,net_amount from public.hr_payroll_items where payroll_period_id=p.id loop
  perform public.app_notify_staff_v14(i.employee_id,p.branch_id,'hr_payroll_paid','تم صرف المرتب','صافي المرتب '||i.net_amount::text,'hr_payroll_period',p.id,'hr-payroll-staff:'||p.id||':'||i.employee_id);
 end loop;
 return true;
end;$$;

create or replace function public.branch_hr_finance_queue_v1(p_branch_id bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.has_permission('branch.hr.finance.view') then raise exception 'ليس لديك صلاحية عرض مستحقات HR للفرع';end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 return jsonb_build_object(
  'advances',coalesce((select jsonb_agg(to_jsonb(x) order by requested_on,id) from (
   select a.id,a.employee_id,h.name employee_name,a.amount,a.outstanding_amount,a.requested_on,a.reason,a.repayment_mode,a.installment_amount,a.installments_count
   from public.hr_employee_advances a join public.hr_employees h on h.id=a.employee_id
   where a.branch_id=p_branch_id and a.status='approved'
  )x),'[]'::jsonb),
  'payrolls',coalesce((select jsonb_agg(to_jsonb(x) order by period_end,id) from (
   select p.id,p.period_start,p.period_end,p.status,round(coalesce(sum(i.net_amount),0),2) total,count(i.id) employees_count
   from public.hr_payroll_periods p left join public.hr_payroll_items i on i.payroll_period_id=p.id
   where p.branch_id=p_branch_id and p.status='approved'
   group by p.id,p.period_start,p.period_end,p.status
  )x),'[]'::jsonb)
 );
end;$$;
grant execute on function public.branch_hr_finance_queue_v1(bigint) to authenticated;

-- Summary V2: read-only aggregated operational view.
create or replace function public.business_summary_v2(p_branch_id bigint,p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare vf timestamptz:=coalesce(p_from,date_trunc('day',now()));vt timestamptz:=coalesce(p_to,date_trunc('day',now())+interval '1 day');r jsonb;
begin
 if auth.uid() is null or not (public.is_admin() or public.has_permission('reports')) then raise exception 'ليس لديك صلاحية التقارير';end if;
 if p_branch_id is not null and not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 if vt<=vf then raise exception 'الفترة غير صحيحة';end if;
 select jsonb_build_object(
  'summary',jsonb_build_object(
   'orders_count',(select count(*) from public.orders o where o.created_at>=vf and o.created_at<vt and o.status<>'cancelled' and (p_branch_id is null or o.branch_id=p_branch_id) and public.has_branch_access(o.branch_id)),
   'sales_total',(select round(coalesce(sum(o.total),0),2) from public.orders o where o.created_at>=vf and o.created_at<vt and o.status<>'cancelled' and (p_branch_id is null or o.branch_id=p_branch_id) and public.has_branch_access(o.branch_id)),
   'returns_total',(select round(coalesce(sum(rn.total),0),2) from public.returns rn where rn.created_at>=vf and rn.created_at<vt and (p_branch_id is null or rn.branch_id=p_branch_id) and public.has_branch_access(rn.branch_id)),
   'expenses_total',(select round(coalesce(sum(ex.amount),0),2) from public.expenses ex where ex.created_at>=vf and ex.created_at<vt and (p_branch_id is null or ex.branch_id=p_branch_id) and public.has_branch_access(ex.branch_id))
  ),
  'order_types',coalesce((select jsonb_agg(to_jsonb(x) order by sales desc) from (
   select o.order_type,count(*) orders,round(sum(o.total),2) sales from public.orders o
   where o.created_at>=vf and o.created_at<vt and o.status<>'cancelled' and (p_branch_id is null or o.branch_id=p_branch_id) and public.has_branch_access(o.branch_id)
   group by o.order_type
  )x),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(to_jsonb(x) order by amount desc) from (
   select coalesce(op.method,o.payment_method,'unknown') method,round(sum(coalesce(op.amount,o.total)),2) amount,count(distinct o.id) orders
   from public.orders o left join public.order_payments op on op.order_id=o.id
   where o.created_at>=vf and o.created_at<vt and o.status<>'cancelled' and (p_branch_id is null or o.branch_id=p_branch_id) and public.has_branch_access(o.branch_id)
   group by coalesce(op.method,o.payment_method,'unknown')
  )x),'[]'::jsonb),
  'hourly',coalesce((select jsonb_agg(to_jsonb(x) order by hour) from (
   select extract(hour from o.created_at)::int hour,count(*) orders,round(sum(o.total),2) sales from public.orders o
   where o.created_at>=vf and o.created_at<vt and o.status<>'cancelled' and (p_branch_id is null or o.branch_id=p_branch_id) and public.has_branch_access(o.branch_id)
   group by extract(hour from o.created_at)
  )x),'[]'::jsonb),
  'top_products',coalesce((select jsonb_agg(to_jsonb(x) order by qty desc,sales desc) from (
   select oi.product_name,round(sum(oi.quantity),2) qty,round(sum(oi.total),2) sales
   from public.order_items oi join public.orders o on o.id=oi.order_id
   where o.created_at>=vf and o.created_at<vt and o.status<>'cancelled' and (p_branch_id is null or o.branch_id=p_branch_id) and public.has_branch_access(o.branch_id)
   group by oi.product_name order by qty desc,sales desc limit 10
  )x),'[]'::jsonb),
  'branches',coalesce((select jsonb_agg(to_jsonb(x) order by sales desc) from (
   select o.branch_id,coalesce(b.name,'فرع #'||o.branch_id::text) branch_name,count(*) orders,round(sum(o.total),2) sales
   from public.orders o left join public.branches b on b.id=o.branch_id
   where o.created_at>=vf and o.created_at<vt and o.status<>'cancelled' and public.has_branch_access(o.branch_id) and (p_branch_id is null or o.branch_id=p_branch_id)
   group by o.branch_id,b.name
  )x),'[]'::jsonb)
 ) into r;
 r:=jsonb_set(r,'{summary,net_sales}',to_jsonb(round(coalesce((r#>>'{summary,sales_total}')::numeric,0)-coalesce((r#>>'{summary,returns_total}')::numeric,0),2)));
 r:=jsonb_set(r,'{summary,net_income}',to_jsonb(round(coalesce((r#>>'{summary,sales_total}')::numeric,0)-coalesce((r#>>'{summary,returns_total}')::numeric,0)-coalesce((r#>>'{summary,expenses_total}')::numeric,0),2)));
 return r;
end;$$;
grant execute on function public.business_summary_v2(bigint,timestamptz,timestamptz) to authenticated;

commit;
