-- Sharawla POS 10.5.4-beta.54
-- HR UI support — view permission + employee edit
begin;

insert into public.permission_actions_v2(code,name_ar,domain,legacy_permission,sort_order) values
 ('hr.adjustments.view','عرض الخصومات والمكافآت','hr','financialSettings',1185)
on conflict(code) do update set name_ar=excluded.name_ar,domain=excluded.domain,legacy_permission=excluded.legacy_permission,sort_order=excluded.sort_order,active=true;

drop policy if exists hr_employee_adjustments_read_v1 on public.hr_employee_adjustments;
create policy hr_employee_adjustments_read_v1 on public.hr_employee_adjustments for select to authenticated using(
 (public.has_action_permission_v2('hr.adjustments.view') or public.has_action_permission_v2('hr.payroll.view') or public.has_action_permission_v2('hr.adjustments.manage'))
 and public.has_branch_access(branch_id)
);

create or replace function public.hr_employee_update_v1(
 p_employee_id bigint,
 p_name text,
 p_phone text,
 p_employee_code text,
 p_job_title text,
 p_department text,
 p_hire_date date,
 p_employment_status text,
 p_notes text,
 p_active boolean
)
returns boolean language plpgsql security definer set search_path=public
as $$
declare h public.hr_employees%rowtype;e bigint;nm text:=nullif(trim(coalesce(p_name,'')),'');beforev jsonb;begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not public.has_action_permission_v2('hr.employees.edit') then raise exception 'ليس لديك صلاحية تعديل الموظفين';end if;
 select * into h from public.hr_employees where id=p_employee_id for update;if not found then raise exception 'الموظف غير موجود';end if;
 if not public.has_branch_access(h.home_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 if nm is null then raise exception 'اسم الموظف مطلوب';end if;
 if p_employment_status not in ('active','leave','terminated') then raise exception 'حالة الموظف غير صحيحة';end if;
 beforev:=to_jsonb(h);e:=public.current_employee_id();
 update public.hr_employees set
   name=nm,
   phone=nullif(trim(coalesce(p_phone,'')),''),
   employee_code=nullif(trim(coalesce(p_employee_code,'')),''),
   job_title=nullif(trim(coalesce(p_job_title,'')),''),
   department=nullif(trim(coalesce(p_department,'')),''),
   hire_date=p_hire_date,
   employment_status=p_employment_status,
   notes=nullif(trim(coalesce(p_notes,'')),''),
   active=coalesce(p_active,true),
   updated_at=now()
 where id=p_employee_id;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(e,h.home_branch_id,'hr_employee_update','hr_employee',p_employee_id,jsonb_build_object('before',beforev,'after',jsonb_build_object('name',nm,'phone',p_phone,'employee_code',p_employee_code,'job_title',p_job_title,'department',p_department,'hire_date',p_hire_date,'employment_status',p_employment_status,'active',p_active)));
 return true;
end;$$;

grant execute on function public.hr_employee_update_v1(bigint,text,text,text,text,text,date,text,text,boolean) to authenticated;

commit;
