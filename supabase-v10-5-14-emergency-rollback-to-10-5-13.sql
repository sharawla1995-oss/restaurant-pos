-- Sharawla POS 10.5.14 -> 10.5.13 EMERGENCY COMPATIBILITY ROLLBACK
-- Prepared before publishing 10.5.14 Stable.
-- Goal: restore the 10.5.13 application contract without destructive data deletion.
-- Production project: kzokretuuigjhxjzdlmk
-- Stable fallback release: v10.5.13
-- IMPORTANT: V10.5.14 additive tables/columns/functions are intentionally left in place.
-- Run ONLY if an emergency rollback to the 10.5.13 desktop application is required.

begin;

-- 1) Stop V10.5.14 notification side effects while the V10.5.13 client is active.
drop trigger if exists trg_app_notify_return_approval_v14 on public.return_approval_requests;
drop trigger if exists trg_app_notify_adjustment_v14 on public.hr_employee_adjustments;
drop trigger if exists trg_app_notify_advance_v14 on public.hr_employee_advances;
drop trigger if exists trg_app_notify_leave_v14 on public.hr_leave_requests;

-- 2) Restore the exact V10.5.13 HR write contracts that V10.5.14 replaced.
create or replace function public.hr_adjustment_create_v1(
 p_employee_id bigint,
 p_adjustment_type text,
 p_amount numeric,
 p_effective_date date default current_date,
 p_reason text default null,
 p_client_tx_id text default null
)
returns bigint language plpgsql security definer set search_path=public
as $$
declare h public.hr_employees%rowtype;idv bigint;e bigint;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not public.has_permission('hr.adjustments.manage') then raise exception 'ليس لديك صلاحية إدارة الخصومات والمكافآت';end if;
 select * into h from public.hr_employees where id=p_employee_id and active=true;if not found then raise exception 'الموظف غير موجود';end if;
 if not public.has_branch_access(h.home_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 if p_adjustment_type not in ('deduction','bonus','overtime') or coalesce(p_amount,0)<=0 then raise exception 'بيانات الحركة غير صحيحة';end if;
 if k is null then raise exception 'معرف الحركة مطلوب';end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-adjustment:'||k,0));
 select id into idv from public.hr_employee_adjustments where client_tx_id=k;if idv is not null then return idv;end if;
 e:=public.current_employee_id();
 insert into public.hr_employee_adjustments(employee_id,branch_id,adjustment_type,amount,effective_date,reason,client_tx_id,created_by_employee_id)
 values(p_employee_id,h.home_branch_id,p_adjustment_type,round(p_amount,2),coalesce(p_effective_date,current_date),nullif(trim(coalesce(p_reason,'')),''),k,e)
 returning id into idv;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(e,h.home_branch_id,'hr_adjustment_create','hr_adjustment',idv,jsonb_build_object('employee_id',p_employee_id,'type',p_adjustment_type,'amount',round(p_amount,2),'effective_date',coalesce(p_effective_date,current_date)));
 return idv;
end;$$;

create or replace function public.hr_advance_disburse_v1(p_advance_id bigint,p_method text,p_reference text,p_shift_id bigint,p_client_tx_id text)
returns bigint language plpgsql security definer set search_path=public
as $$
declare a public.hr_employee_advances%rowtype;mid bigint;e bigint;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not public.has_permission('hr.advances.disburse') or not public.has_permission('treasury.post') then raise exception 'ليس لديك صلاحية صرف السلفة من الخزنة';end if;
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

create or replace function public.hr_payroll_pay_v1(p_payroll_period_id bigint,p_method text,p_reference text,p_shift_id bigint,p_client_tx_id text)
returns boolean language plpgsql security definer set search_path=public
as $$
declare p public.hr_payroll_periods%rowtype;i record;a record;e bigint;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');remain numeric;takev numeric;begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not public.has_permission('hr.payroll.pay') or not public.has_permission('treasury.post') then raise exception 'ليس لديك صلاحية صرف المرتبات';end if;
 select * into p from public.hr_payroll_periods where id=p_payroll_period_id for update;if not found then raise exception 'مسير المرتبات غير موجود';end if;
 if p.branch_id is not null and not public.has_branch_access(p.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 if p.status='paid' then return true;end if;
 if p.status<>'approved' then raise exception 'يجب اعتماد مسير المرتبات قبل الصرف';end if;
 if k is null then raise exception 'معرف الحركة مطلوب';end if;
 e:=public.current_employee_id();
 for i in select * from public.hr_payroll_items where payroll_period_id=p.id order by id loop
   if i.net_amount>0 then
     insert into public.treasury_movements(branch_id,shift_id,direction,movement_type,amount,method,entity_type,entity_id,reference,notes,client_tx_id,employee_id)
     values(p.branch_id,p_shift_id,'out','payroll',i.net_amount,coalesce(nullif(trim(coalesce(p_method,'')),''),'cash'),'hr_payroll_item',i.id,nullif(trim(coalesce(p_reference,'')),''),'صرف مرتب موظف',k||':employee:'||i.employee_id,e)
     on conflict(client_tx_id) do nothing;
   end if;
   remain:=i.advance_deduction;
   if remain>0 then
     for a in select id,outstanding_amount from public.hr_employee_advances where employee_id=i.employee_id and status='active' and outstanding_amount>0 order by requested_on,id for update loop
       exit when remain<=0;
       takev:=least(a.outstanding_amount,remain);
       update public.hr_employee_advances set outstanding_amount=round(outstanding_amount-takev,2),status=case when outstanding_amount-takev<=0.009 then 'settled' else 'active' end,updated_at=now() where id=a.id;
       remain:=round(remain-takev,2);
     end loop;
   end if;
   update public.hr_employee_adjustments set status='applied',payroll_period_id=p.id where employee_id=i.employee_id and status='pending' and effective_date between p.period_start and p.period_end;
 end loop;
 update public.hr_payroll_periods set status='paid',paid_by_employee_id=e,paid_at=now() where id=p.id;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(e,p.branch_id,'hr_payroll_pay','hr_payroll_period',p.id,jsonb_build_object('method',p_method,'reference',p_reference));
 return true;
end;$$;

create or replace function public.hr_payroll_pay_attendance_v1(p_payroll_period_id bigint,p_method text,p_reference text,p_shift_id bigint,p_client_tx_id text)
returns boolean language plpgsql security definer set search_path=public as $$
declare p public.hr_payroll_periods%rowtype;i record;a record;e bigint;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');remain numeric;takev numeric;begin
 if auth.uid() is null or not public.has_permission('hr.payroll.pay') or not public.has_permission('treasury.post') then raise exception 'ليس لديك صلاحية صرف المرتبات';end if;
 select * into p from public.hr_payroll_periods where id=p_payroll_period_id for update;if not found then raise exception 'مسير المرتبات غير موجود';end if;if p.branch_id is not null and not public.has_branch_access(p.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;if p.status='paid' then return true;end if;if p.status<>'approved' then raise exception 'يجب اعتماد مسير المرتبات قبل الصرف';end if;if k is null then raise exception 'معرف الحركة مطلوب';end if;e:=public.current_employee_id();
 for i in select * from public.hr_payroll_items where payroll_period_id=p.id order by id loop
  if i.net_amount>0 then insert into public.treasury_movements(branch_id,shift_id,direction,movement_type,amount,method,entity_type,entity_id,reference,notes,client_tx_id,employee_id) values(p.branch_id,p_shift_id,'out','payroll',i.net_amount,coalesce(nullif(trim(coalesce(p_method,'')),''),'cash'),'hr_payroll_item',i.id,nullif(trim(coalesce(p_reference,'')),''),'صرف مرتب موظف',k||':employee:'||i.employee_id,e) on conflict(client_tx_id) do nothing;end if;
  remain:=i.advance_deduction;if remain>0 then for a in select id,outstanding_amount from public.hr_employee_advances where employee_id=i.employee_id and status='active' and outstanding_amount>0 order by requested_on,id for update loop exit when remain<=0;takev:=least(a.outstanding_amount,remain);update public.hr_employee_advances set outstanding_amount=round(outstanding_amount-takev,2),status=case when outstanding_amount-takev<=0.009 then 'settled' else 'active' end,updated_at=now() where id=a.id;remain:=round(remain-takev,2);end loop;end if;
  update public.hr_employee_adjustments set status='applied',payroll_period_id=p.id where employee_id=i.employee_id and status='pending' and approval_status='approved' and effective_date between p.period_start and p.period_end;
 end loop;
 update public.hr_payroll_periods set status='paid',paid_by_employee_id=e,paid_at=now() where id=p.id;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,p.branch_id,'hr_payroll_pay_attendance','hr_payroll_period',p.id,jsonb_build_object('method',p_method,'reference',p_reference));return true;
end;$$;

-- 3) Restore V10.5.13 callable privileges for the restored entrypoints.
revoke all on function public.hr_adjustment_create_v1(bigint,text,numeric,date,text,text) from public,anon,authenticated;
grant execute on function public.hr_adjustment_create_v1(bigint,text,numeric,date,text,text) to authenticated;

revoke all on function public.hr_advance_disburse_v1(bigint,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.hr_advance_disburse_v1(bigint,text,text,bigint,text) to authenticated;

revoke all on function public.hr_payroll_pay_v1(bigint,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.hr_payroll_pay_v1(bigint,text,text,bigint,text) to authenticated;

revoke all on function public.hr_payroll_pay_attendance_v1(bigint,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.hr_payroll_pay_attendance_v1(bigint,text,text,bigint,text) to authenticated;

notify pgrst, 'reload schema';
commit;

-- AFTER EXECUTION:
-- 1) reinstall the immutable GitHub Release v10.5.13 installer matching the device architecture;
-- 2) do NOT Reset/Rebind the device;
-- 3) smoke-test Login -> Branch -> POS -> Delivery -> Return -> HR -> restart.
