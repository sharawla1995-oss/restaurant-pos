-- Service V1.1 — assets/packages/commissions completion
begin;

create unique index if not exists finance_commission_entries_source_uidx
on public.finance_commission_entries_v1(employee_id,rule_id,source_type,source_id)
where source_id is not null and rule_id is not null and status<>'void';

create or replace function public.service_asset_save_v1(
 p_asset_id bigint,p_customer_id bigint,p_asset_type text,p_name text,p_brand text,p_model text,p_serial_number text,p_plate_number text,p_vin text,p_metadata jsonb,p_active boolean
) returns public.service_assets_v1
language plpgsql security definer set search_path=public
as $$declare r public.service_assets_v1%rowtype;begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not (public.is_admin() or public.has_permission('customers')) then raise exception 'ليس لديك صلاحية إدارة أصول العملاء';end if;
 if not exists(select 1 from public.customers where id=p_customer_id) then raise exception 'العميل غير موجود';end if;
 if nullif(trim(coalesce(p_asset_type,'')),'') is null then raise exception 'نوع الأصل مطلوب';end if;
 if p_asset_id is null then
  insert into public.service_assets_v1(customer_id,asset_type,name,brand,model,serial_number,plate_number,vin,metadata,active)
  values(p_customer_id,trim(p_asset_type),nullif(trim(coalesce(p_name,'')),''),nullif(trim(coalesce(p_brand,'')),''),nullif(trim(coalesce(p_model,'')),''),nullif(trim(coalesce(p_serial_number,'')),''),nullif(trim(coalesce(p_plate_number,'')),''),nullif(trim(coalesce(p_vin,'')),''),coalesce(p_metadata,'{}'::jsonb),coalesce(p_active,true)) returning * into r;
 else
  update public.service_assets_v1 set customer_id=p_customer_id,asset_type=trim(p_asset_type),name=nullif(trim(coalesce(p_name,'')),''),brand=nullif(trim(coalesce(p_brand,'')),''),model=nullif(trim(coalesce(p_model,'')),''),serial_number=nullif(trim(coalesce(p_serial_number,'')),''),plate_number=nullif(trim(coalesce(p_plate_number,'')),''),vin=nullif(trim(coalesce(p_vin,'')),''),metadata=coalesce(p_metadata,'{}'::jsonb),active=coalesce(p_active,true),updated_at=now() where id=p_asset_id returning * into r;
  if r.id is null then raise exception 'الأصل غير موجود';end if;
 end if;return r;
end;$$;

create or replace function public.service_package_save_v1(p_package_id bigint,p_code text,p_name text,p_total_sessions integer,p_validity_days integer,p_price numeric,p_service_id bigint,p_active boolean)
returns public.service_packages_v1 language plpgsql security definer set search_path=public
as $$declare r public.service_packages_v1%rowtype;begin
 if auth.uid() is null or not public.is_admin() then raise exception 'إدارة الباكدجات للمدير فقط';end if;
 if nullif(trim(coalesce(p_name,'')),'') is null or coalesce(p_total_sessions,0)<=0 then raise exception 'اسم الباكدج وعدد الجلسات مطلوبان';end if;
 if p_package_id is null then
  insert into public.service_packages_v1(code,name,total_sessions,validity_days,price,service_id,active) values(nullif(lower(trim(coalesce(p_code,''))),''),trim(p_name),p_total_sessions,case when coalesce(p_validity_days,0)<=0 then null else p_validity_days end,greatest(coalesce(p_price,0),0),p_service_id,coalesce(p_active,true)) returning * into r;
 else
  update public.service_packages_v1 set code=nullif(lower(trim(coalesce(p_code,''))),''),name=trim(p_name),total_sessions=p_total_sessions,validity_days=case when coalesce(p_validity_days,0)<=0 then null else p_validity_days end,price=greatest(coalesce(p_price,0),0),service_id=p_service_id,active=coalesce(p_active,true),updated_at=now() where id=p_package_id returning * into r;
  if r.id is null then raise exception 'الباكدج غير موجود';end if;
 end if;return r;
end;$$;

create or replace function public.finance_commission_rule_save_v1(p_rule_id bigint,p_employee_id bigint,p_service_id bigint,p_basis text,p_calculation text,p_value numeric,p_starts_on date,p_ends_on date,p_active boolean)
returns public.finance_commission_rules_v1 language plpgsql security definer set search_path=public
as $$declare r public.finance_commission_rules_v1%rowtype;begin
 if auth.uid() is null or not public.is_admin() then raise exception 'إدارة العمولات للمدير فقط';end if;
 if p_basis not in('service','labor','job_total','product') or p_calculation not in('percent','fixed') or coalesce(p_value,-1)<0 then raise exception 'بيانات العمولة غير صحيحة';end if;
 if p_calculation='percent' and p_value>100 then raise exception 'نسبة العمولة لا تتجاوز مائة بالمائة';end if;
 if p_ends_on is not null and p_starts_on is not null and p_ends_on<p_starts_on then raise exception 'فترة العمولة غير صحيحة';end if;
 if p_rule_id is null then insert into public.finance_commission_rules_v1(employee_id,service_id,basis,calculation,value,active,starts_on,ends_on) values(p_employee_id,p_service_id,p_basis,p_calculation,p_value,coalesce(p_active,true),p_starts_on,p_ends_on) returning * into r;
 else update public.finance_commission_rules_v1 set employee_id=p_employee_id,service_id=p_service_id,basis=p_basis,calculation=p_calculation,value=p_value,active=coalesce(p_active,true),starts_on=p_starts_on,ends_on=p_ends_on where id=p_rule_id returning * into r;end if;
 return r;
end;$$;

create or replace function public.service_post_job_commissions_v1(p_job_id bigint)
returns integer language plpgsql security definer set search_path=public
as $$declare j public.service_jobs_v1%rowtype;r record;base numeric;amt numeric;cnt integer:=0;begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 select * into j from public.service_jobs_v1 where id=p_job_id;if not found or not public.has_branch_access(j.branch_id) then raise exception 'أمر الخدمة غير موجود أو غير مصرح';end if;
 if j.status<>'completed' then raise exception 'العمولة تُحتسب بعد اكتمال أمر الخدمة';end if;
 if j.assigned_employee_id is null then return 0;end if;
 for r in select * from public.finance_commission_rules_v1 x where x.active=true and (x.employee_id is null or x.employee_id=j.assigned_employee_id) and (x.service_id is null or x.service_id=j.service_id) and (x.starts_on is null or x.starts_on<=current_date) and (x.ends_on is null or x.ends_on>=current_date) loop
  base:=case r.basis when 'labor' then j.labor_amount when 'job_total' then j.total_amount else j.total_amount end;
  amt:=case r.calculation when 'percent' then round(base*r.value/100.0,2) else round(r.value,2) end;
  if amt>0 then insert into public.finance_commission_entries_v1(employee_id,rule_id,source_type,source_id,base_amount,commission_amount,status,notes) values(j.assigned_employee_id,r.id,'service_job',j.id,base,amt,'earned','Auto from completed job') on conflict do nothing;cnt:=cnt+1;end if;
 end loop;return cnt;
end;$$;

create or replace function public.service_job_status_v1(p_job_id bigint,p_status text,p_diagnosis text,p_labor_amount numeric)
returns public.service_jobs_v1 language plpgsql security definer set search_path=public
as $$declare r public.service_jobs_v1%rowtype;begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 select * into r from public.service_jobs_v1 where id=p_job_id for update;if not found or not public.has_branch_access(r.branch_id) then raise exception 'أمر الخدمة غير موجود أو غير مصرح';end if;
 if p_status not in('received','diagnosis','estimate','awaiting_approval','approved','in_progress','ready','completed','cancelled') then raise exception 'حالة غير صحيحة';end if;
 update public.service_jobs_v1 set status=p_status,diagnosis=coalesce(nullif(trim(coalesce(p_diagnosis,'')),''),diagnosis),labor_amount=case when p_labor_amount is null then labor_amount else greatest(p_labor_amount,0) end,total_amount=case when p_labor_amount is null then total_amount else greatest(p_labor_amount,0)+parts_amount end,customer_approved_at=case when p_status='approved' then coalesce(customer_approved_at,now()) else customer_approved_at end,started_at=case when p_status='in_progress' then coalesce(started_at,now()) else started_at end,ready_at=case when p_status='ready' then coalesce(ready_at,now()) else ready_at end,completed_at=case when p_status='completed' then coalesce(completed_at,now()) else completed_at end,updated_at=now() where id=r.id returning * into r;
 if p_status='completed' then perform public.service_post_job_commissions_v1(r.id);end if;return r;
end;$$;

grant execute on function public.service_asset_save_v1(bigint,bigint,text,text,text,text,text,text,text,jsonb,boolean) to authenticated;
grant execute on function public.service_package_save_v1(bigint,text,text,integer,integer,numeric,bigint,boolean) to authenticated;
grant execute on function public.finance_commission_rule_save_v1(bigint,bigint,bigint,text,text,numeric,date,date,boolean) to authenticated;
grant execute on function public.service_post_job_commissions_v1(bigint) to authenticated;
commit;
