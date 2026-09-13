-- Sharawla POS 10.5.4-beta.54
-- Shared Business Core — HR adjustments / payroll / treasury runtime
-- Sandbox-first / additive. No Production mutation.

begin;

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
 if not public.has_action_permission_v2('hr.adjustments.manage') then raise exception 'ليس لديك صلاحية إدارة الخصومات والمكافآت';end if;
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

create or replace function public.hr_payroll_run_v1(
 p_branch_id bigint,
 p_period_start date,
 p_period_end date,
 p_notes text,
 p_client_tx_id text
)
returns bigint language plpgsql security definer set search_path=public
as $$
declare pid bigint;e bigint;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');r record;basev numeric;bonusv numeric;otv numeric;dedv numeric;advv numeric;grossv numeric;netv numeric;begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not public.has_action_permission_v2('hr.payroll.run') then raise exception 'ليس لديك صلاحية إعداد مسير المرتبات';end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 if p_period_start is null or p_period_end is null or p_period_end<p_period_start then raise exception 'فترة المرتب غير صحيحة';end if;
 if k is null then raise exception 'معرف الحركة مطلوب';end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-payroll-run:'||k,0));
 select id into pid from public.hr_payroll_periods where client_tx_id=k;if pid is not null then return pid;end if;
 if exists(select 1 from public.hr_payroll_periods where branch_id=p_branch_id and status<>'cancelled' and daterange(period_start,period_end,'[]') && daterange(p_period_start,p_period_end,'[]')) then raise exception 'يوجد مسير مرتبات متداخل لنفس الفرع';end if;
 e:=public.current_employee_id();
 insert into public.hr_payroll_periods(branch_id,period_start,period_end,notes,client_tx_id,created_by_employee_id)
 values(p_branch_id,p_period_start,p_period_end,nullif(trim(coalesce(p_notes,'')),''),k,e) returning id into pid;
 for r in select h.id,h.name,c.salary_basis,c.base_salary from public.hr_employees h left join public.hr_employee_compensation c on c.employee_id=h.id where h.home_branch_id=p_branch_id and h.active=true and h.employment_status='active' order by h.id loop
   basev:=case when coalesce(r.salary_basis,'monthly')='monthly' then coalesce(r.base_salary,0) else 0 end;
   select coalesce(sum(amount) filter(where adjustment_type='bonus'),0),coalesce(sum(amount) filter(where adjustment_type='overtime'),0),coalesce(sum(amount) filter(where adjustment_type='deduction'),0)
     into bonusv,otv,dedv from public.hr_employee_adjustments where employee_id=r.id and status='pending' and effective_date between p_period_start and p_period_end;
   grossv:=round(basev+bonusv+otv,2);
   dedv:=least(round(dedv,2),grossv);
   select coalesce(sum(case when repayment_mode='installments' then least(outstanding_amount,coalesce(installment_amount,outstanding_amount)) else outstanding_amount end),0)
     into advv from public.hr_employee_advances where employee_id=r.id and status='active' and outstanding_amount>0;
   advv:=least(round(advv,2),greatest(grossv-dedv,0));
   netv:=greatest(round(grossv-dedv-advv,2),0);
   insert into public.hr_payroll_items(payroll_period_id,employee_id,base_amount,overtime_amount,bonus_amount,deduction_amount,advance_deduction,net_amount,notes)
   values(pid,r.id,round(basev,2),round(otv,2),round(bonusv,2),round(dedv,2),round(advv,2),netv,
     case when coalesce(r.salary_basis,'monthly')<>'monthly' then 'الأجر اليومي/بالساعة يحتاج إدخال حضور/ساعات قبل الاعتماد' else null end);
 end loop;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(e,p_branch_id,'hr_payroll_run','hr_payroll_period',pid,jsonb_build_object('period_start',p_period_start,'period_end',p_period_end));
 return pid;
end;$$;

create or replace function public.hr_payroll_approve_v1(p_payroll_period_id bigint,p_note text default null)
returns boolean language plpgsql security definer set search_path=public
as $$
declare p public.hr_payroll_periods%rowtype;e bigint;begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not public.has_action_permission_v2('hr.payroll.approve') then raise exception 'ليس لديك صلاحية اعتماد المرتبات';end if;
 select * into p from public.hr_payroll_periods where id=p_payroll_period_id for update;if not found then raise exception 'مسير المرتبات غير موجود';end if;
 if p.branch_id is not null and not public.has_branch_access(p.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 if p.status='approved' then return true;end if;
 if p.status<>'draft' then raise exception 'المسير ليس في حالة مسودة';end if;
 if not exists(select 1 from public.hr_payroll_items where payroll_period_id=p.id) then raise exception 'المسير لا يحتوي موظفين';end if;
 if exists(select 1 from public.hr_payroll_items where payroll_period_id=p.id and notes like 'الأجر اليومي/بالساعة%') then raise exception 'يوجد موظف يومي/بالساعة يحتاج استكمال الحضور/الساعات قبل الاعتماد';end if;
 e:=public.current_employee_id();
 update public.hr_payroll_periods set status='approved',approved_by_employee_id=e,approved_at=now(),notes=concat_ws(E'\n',notes,nullif(trim(coalesce(p_note,'')),'')) where id=p.id;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,p.branch_id,'hr_payroll_approve','hr_payroll_period',p.id,'{}'::jsonb);
 return true;
end;$$;

create or replace function public.hr_payroll_pay_v1(p_payroll_period_id bigint,p_method text,p_reference text,p_shift_id bigint,p_client_tx_id text)
returns boolean language plpgsql security definer set search_path=public
as $$
declare p public.hr_payroll_periods%rowtype;i record;a record;e bigint;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');remain numeric;takev numeric;begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not public.has_action_permission_v2('hr.payroll.pay') or not public.has_action_permission_v2('treasury.post') then raise exception 'ليس لديك صلاحية صرف المرتبات';end if;
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

create or replace function public.treasury_manual_post_v1(
 p_branch_id bigint,
 p_direction text,
 p_amount numeric,
 p_method text,
 p_reference text,
 p_notes text,
 p_shift_id bigint,
 p_client_tx_id text
)
returns bigint language plpgsql security definer set search_path=public
as $$
declare idv bigint;e bigint;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not public.has_action_permission_v2('treasury.post') then raise exception 'ليس لديك صلاحية تسجيل حركة خزنة';end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 if p_direction not in ('in','out') or coalesce(p_amount,0)<=0 then raise exception 'بيانات حركة الخزنة غير صحيحة';end if;
 if k is null then raise exception 'معرف الحركة مطلوب';end if;
 perform pg_advisory_xact_lock(hashtextextended('treasury-manual:'||k,0));
 select id into idv from public.treasury_movements where client_tx_id=k;if idv is not null then return idv;end if;
 e:=public.current_employee_id();
 insert into public.treasury_movements(branch_id,shift_id,direction,movement_type,amount,method,reference,notes,client_tx_id,employee_id)
 values(p_branch_id,p_shift_id,p_direction,case when p_direction='in' then 'cash_in' else 'cash_out' end,round(p_amount,2),coalesce(nullif(trim(coalesce(p_method,'')),''),'cash'),nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''),k,e) returning id into idv;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(e,p_branch_id,'treasury_manual_post','treasury_movement',idv,jsonb_build_object('direction',p_direction,'amount',round(p_amount,2),'method',p_method));
 return idv;
end;$$;

grant execute on function public.hr_adjustment_create_v1(bigint,text,numeric,date,text,text) to authenticated;
grant execute on function public.hr_payroll_run_v1(bigint,date,date,text,text) to authenticated;
grant execute on function public.hr_payroll_approve_v1(bigint,text) to authenticated;
grant execute on function public.hr_payroll_pay_v1(bigint,text,text,bigint,text) to authenticated;
grant execute on function public.treasury_manual_post_v1(bigint,text,numeric,text,text,text,bigint,text) to authenticated;

commit;
