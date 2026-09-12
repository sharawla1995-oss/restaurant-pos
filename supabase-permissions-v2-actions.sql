-- Sharawla POS — Permissions V2 (action-level, additive)
begin;

create table if not exists public.permission_actions_v2(
  code text primary key,
  name_ar text not null,
  domain text not null,
  legacy_permission text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint permission_actions_v2_code_not_blank check(trim(code)<>'')
);

create table if not exists public.employee_action_permissions_v2(
  employee_id bigint not null references public.employees(id) on delete cascade,
  action_code text not null references public.permission_actions_v2(code) on delete cascade,
  allowed boolean not null,
  updated_at timestamptz not null default now(),
  primary key(employee_id,action_code)
);

insert into public.permission_actions_v2(code,name_ar,domain,legacy_permission,sort_order) values
 ('purchasing.request.create','إنشاء طلب شراء','purchasing','inventory',10),
 ('purchasing.request.approve','اعتماد طلب شراء','purchasing','inventory',20),
 ('purchasing.po.create','إنشاء أمر شراء','purchasing','inventory',30),
 ('purchasing.po.approve','اعتماد أمر شراء','purchasing','inventory',40),
 ('purchasing.receive','استلام مشتريات','purchasing','inventory',50),
 ('purchasing.supplier_return','مرتجع مورد','purchasing','inventory',60),
 ('inventory.adjust','تسوية مخزون','inventory','inventory',100),
 ('recipe.manage','إدارة الوصفات والخامات','food','inventory',200),
 ('production.manage','إدارة الإنتاج والتحضير','food','inventory',210),
 ('waste.post','تسجيل فاقد','food','inventory',220),
 ('orders.quotation.manage','إدارة عروض الأسعار','orders','orders',300),
 ('orders.sales.approve','اعتماد أمر بيع','orders','orders',310),
 ('orders.custom.manage','إدارة الطلبات الخاصة','orders','orders',320),
 ('finance.credit.manage','إدارة حدود الائتمان','finance','customers',400),
 ('finance.collection.post','تسجيل تحصيل','finance','financialSettings',410),
 ('service.appointment.manage','إدارة المواعيد','service','customers',500),
 ('service.job.manage','إدارة أوامر الخدمة','service','orders',510),
 ('service.job.complete','إكمال أمر الخدمة','service','orders',520),
 ('service.warranty.manage','إدارة الضمان','service','orders',530),
 ('membership.subscription.manage','إدارة الاشتراكات','membership','customers',600),
 ('membership.checkin','تسجيل دخول عضو','membership','customers',610),
 ('membership.freeze','تجميد اشتراك','membership','customers',620),
 ('logistics.shipment.create','إنشاء شحنة','logistics','orders',700),
 ('logistics.shipment.status','تحديث حالة الشحنة','logistics','orders',710),
 ('logistics.cod.settle','تسوية تحصيلات COD','logistics','financialSettings',720),
 ('reports.export','تصدير التقارير','reports','reports',800),
 ('settings.capabilities','إعداد خصائص النشاط','settings','settings',900)
on conflict(code) do update set name_ar=excluded.name_ar,domain=excluded.domain,legacy_permission=excluded.legacy_permission,sort_order=excluded.sort_order,active=true;

create or replace function public.has_action_permission_v2(p_action_code text)
returns boolean language plpgsql stable security definer set search_path=public
as $$
declare e bigint;v boolean;legacy text;begin
  if auth.uid() is null then return false;end if;
  if public.is_admin() then return true;end if;
  e:=public.current_employee_id();if e is null then return false;end if;
  select allowed into v from public.employee_action_permissions_v2 where employee_id=e and action_code=p_action_code;
  if found then return v;end if;
  select legacy_permission into legacy from public.permission_actions_v2 where code=p_action_code and active=true;
  if legacy is null then return false;end if;
  return public.has_permission(legacy);
end;$$;

create or replace function public.admin_set_employee_action_permission_v2(p_employee_id bigint,p_action_code text,p_allowed boolean)
returns boolean language plpgsql security definer set search_path=public
as $$begin
  if auth.uid() is null or not public.is_admin() then raise exception 'للمدير فقط';end if;
  if not exists(select 1 from public.employees where id=p_employee_id and active is distinct from false) then raise exception 'الموظف غير موجود أو موقوف';end if;
  if not exists(select 1 from public.permission_actions_v2 where code=p_action_code and active=true) then raise exception 'الصلاحية غير موجودة';end if;
  insert into public.employee_action_permissions_v2(employee_id,action_code,allowed,updated_at) values(p_employee_id,p_action_code,p_allowed,now())
  on conflict(employee_id,action_code) do update set allowed=excluded.allowed,updated_at=now();
  return true;
end;$$;

create or replace function public.admin_reset_employee_action_permission_v2(p_employee_id bigint,p_action_code text)
returns boolean language plpgsql security definer set search_path=public
as $$begin
  if auth.uid() is null or not public.is_admin() then raise exception 'للمدير فقط';end if;
  delete from public.employee_action_permissions_v2 where employee_id=p_employee_id and action_code=p_action_code;
  return true;
end;$$;

alter table public.permission_actions_v2 enable row level security;
alter table public.employee_action_permissions_v2 enable row level security;
drop policy if exists permission_actions_v2_read on public.permission_actions_v2;
create policy permission_actions_v2_read on public.permission_actions_v2 for select to authenticated using(active=true);
drop policy if exists employee_action_permissions_v2_read on public.employee_action_permissions_v2;
create policy employee_action_permissions_v2_read on public.employee_action_permissions_v2 for select to authenticated using(employee_id=public.current_employee_id() or public.is_admin());

grant select on public.permission_actions_v2,public.employee_action_permissions_v2 to authenticated;
grant execute on function public.has_action_permission_v2(text) to authenticated;
grant execute on function public.admin_set_employee_action_permission_v2(bigint,text,boolean) to authenticated;
grant execute on function public.admin_reset_employee_action_permission_v2(bigint,text) to authenticated;

commit;
