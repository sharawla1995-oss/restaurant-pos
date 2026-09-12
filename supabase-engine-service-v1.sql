-- Sharawla POS — Shared Service Engine V1
-- Appointments, jobs, assets, packages, warranty, installation and commissions.

begin;

create table if not exists public.service_catalog (
  id bigserial primary key,
  code text unique,
  name text not null,
  category text,
  duration_minutes integer not null default 30 check (duration_minutes>0),
  base_price numeric(14,2) not null default 0 check (base_price>=0),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_assets_v1 (
  id bigserial primary key,
  customer_id bigint not null references public.customers(id) on delete cascade,
  asset_type text not null,
  name text,
  brand text,
  model text,
  serial_number text,
  plate_number text,
  vin text,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_assets_customer_idx on public.service_assets_v1(customer_id,active);
create index if not exists service_assets_serial_idx on public.service_assets_v1(serial_number) where serial_number is not null;

create table if not exists public.service_appointments_v1 (
  id bigserial primary key,
  branch_id bigint not null references public.branches(id) on delete restrict,
  customer_id bigint not null references public.customers(id) on delete restrict,
  service_id bigint references public.service_catalog(id) on delete set null,
  provider_employee_id bigint references public.employees(id) on delete set null,
  asset_id bigint references public.service_assets_v1(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'booked' check(status in ('booked','confirmed','arrived','in_service','completed','no_show','cancelled')),
  source text not null default 'pos',
  deposit_amount numeric(14,2) not null default 0 check(deposit_amount>=0),
  notes text,
  client_tx_id text not null unique,
  created_by_employee_id bigint references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_appointments_dates_check check(ends_at>starts_at)
);
create index if not exists service_appointments_branch_start_idx on public.service_appointments_v1(branch_id,starts_at);
create index if not exists service_appointments_provider_start_idx on public.service_appointments_v1(provider_employee_id,starts_at);

create table if not exists public.service_jobs_v1 (
  id bigserial primary key,
  job_number text unique,
  branch_id bigint not null references public.branches(id) on delete restrict,
  customer_id bigint not null references public.customers(id) on delete restrict,
  appointment_id bigint references public.service_appointments_v1(id) on delete set null,
  asset_id bigint references public.service_assets_v1(id) on delete set null,
  service_id bigint references public.service_catalog(id) on delete set null,
  assigned_employee_id bigint references public.employees(id) on delete set null,
  status text not null default 'received' check(status in ('received','diagnosis','estimate','awaiting_approval','approved','in_progress','ready','completed','cancelled')),
  complaint text,
  diagnosis text,
  estimate_amount numeric(14,2) not null default 0 check(estimate_amount>=0),
  labor_amount numeric(14,2) not null default 0 check(labor_amount>=0),
  parts_amount numeric(14,2) not null default 0 check(parts_amount>=0),
  total_amount numeric(14,2) not null default 0 check(total_amount>=0),
  deposit_paid numeric(14,2) not null default 0 check(deposit_paid>=0),
  customer_approved_at timestamptz,
  started_at timestamptz,
  ready_at timestamptz,
  completed_at timestamptz,
  warranty_id bigint,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  client_tx_id text not null unique,
  created_by_employee_id bigint references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_jobs_branch_status_idx on public.service_jobs_v1(branch_id,status,created_at desc);

create table if not exists public.service_job_parts_v1 (
  id bigserial primary key,
  job_id bigint not null references public.service_jobs_v1(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete restrict,
  variant_id bigint references public.product_variants(id) on delete restrict,
  quantity numeric(14,3) not null check(quantity>0),
  unit_price numeric(14,2) not null check(unit_price>=0),
  unit_cost_snapshot numeric(14,4) not null default 0 check(unit_cost_snapshot>=0),
  total numeric(14,2) not null check(total>=0),
  posted_to_inventory boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.service_packages_v1 (
  id bigserial primary key,
  code text unique,
  name text not null,
  total_sessions integer not null check(total_sessions>0),
  validity_days integer check(validity_days is null or validity_days>0),
  price numeric(14,2) not null default 0 check(price>=0),
  service_id bigint references public.service_catalog(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_customer_packages_v1 (
  id bigserial primary key,
  customer_id bigint not null references public.customers(id) on delete restrict,
  package_id bigint not null references public.service_packages_v1(id) on delete restrict,
  purchased_sessions integer not null check(purchased_sessions>0),
  remaining_sessions integer not null check(remaining_sessions>=0),
  starts_on date not null default current_date,
  expires_on date,
  paid_amount numeric(14,2) not null default 0 check(paid_amount>=0),
  status text not null default 'active' check(status in ('active','completed','expired','cancelled')),
  client_tx_id text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.service_package_usage_v1 (
  id bigserial primary key,
  customer_package_id bigint not null references public.service_customer_packages_v1(id) on delete restrict,
  appointment_id bigint references public.service_appointments_v1(id) on delete set null,
  job_id bigint references public.service_jobs_v1(id) on delete set null,
  sessions_used integer not null default 1 check(sessions_used>0),
  employee_id bigint references public.employees(id),
  client_tx_id text not null unique,
  used_at timestamptz not null default now()
);

create table if not exists public.service_warranties_v1 (
  id bigserial primary key,
  customer_id bigint not null references public.customers(id) on delete restrict,
  asset_id bigint references public.service_assets_v1(id) on delete set null,
  order_id bigint references public.orders(id) on delete set null,
  order_item_id bigint references public.order_items(id) on delete set null,
  warranty_type text not null default 'store' check(warranty_type in ('store','manufacturer','extended')),
  starts_on date not null,
  ends_on date not null,
  terms text,
  status text not null default 'active' check(status in ('active','expired','void')),
  created_at timestamptz not null default now(),
  constraint service_warranty_dates check(ends_on>=starts_on)
);

alter table public.service_jobs_v1 drop constraint if exists service_jobs_warranty_fkey;
alter table public.service_jobs_v1 add constraint service_jobs_warranty_fkey foreign key(warranty_id) references public.service_warranties_v1(id) on delete set null;

create table if not exists public.service_installations_v1 (
  id bigserial primary key,
  job_id bigint not null unique references public.service_jobs_v1(id) on delete cascade,
  scheduled_at timestamptz,
  installer_employee_id bigint references public.employees(id) on delete set null,
  address text,
  status text not null default 'scheduled' check(status in ('scheduled','dispatched','in_progress','completed','cancelled')),
  completed_at timestamptz,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_commission_rules_v1 (
  id bigserial primary key,
  employee_id bigint references public.employees(id) on delete cascade,
  service_id bigint references public.service_catalog(id) on delete cascade,
  basis text not null default 'service' check(basis in ('service','labor','job_total','product')),
  calculation text not null default 'percent' check(calculation in ('percent','fixed')),
  value numeric(14,4) not null check(value>=0),
  active boolean not null default true,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now()
);

create table if not exists public.finance_commission_entries_v1 (
  id bigserial primary key,
  employee_id bigint not null references public.employees(id) on delete restrict,
  rule_id bigint references public.finance_commission_rules_v1(id) on delete set null,
  source_type text not null check(source_type in ('service_job','sale','manual')),
  source_id bigint,
  base_amount numeric(14,2) not null default 0,
  commission_amount numeric(14,2) not null default 0,
  status text not null default 'earned' check(status in ('earned','approved','paid','void')),
  earned_at timestamptz not null default now(),
  notes text
);

create or replace function public.service_catalog_save_v1(p_id bigint,p_code text,p_name text,p_duration_minutes integer,p_base_price numeric,p_active boolean)
returns public.service_catalog language plpgsql security definer set search_path=public
as $$ declare r public.service_catalog%rowtype;begin if auth.uid() is null or not public.is_admin() then raise exception 'إدارة الخدمات للمدير فقط';end if;if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'اسم الخدمة مطلوب';end if;if p_id is null then insert into public.service_catalog(code,name,duration_minutes,base_price,active) values(nullif(lower(trim(coalesce(p_code,''))),''),trim(p_name),greatest(coalesce(p_duration_minutes,30),1),greatest(coalesce(p_base_price,0),0),coalesce(p_active,true)) returning * into r;else update public.service_catalog set code=nullif(lower(trim(coalesce(p_code,''))),''),name=trim(p_name),duration_minutes=greatest(coalesce(p_duration_minutes,30),1),base_price=greatest(coalesce(p_base_price,0),0),active=coalesce(p_active,true),updated_at=now() where id=p_id returning * into r;end if;return r;end;$$;

create or replace function public.service_appointment_create_v1(p_branch_id bigint,p_customer_id bigint,p_service_id bigint,p_provider_employee_id bigint,p_asset_id bigint,p_starts_at timestamptz,p_notes text,p_client_tx_id text)
returns bigint language plpgsql security definer set search_path=public
as $$ declare idv bigint;e bigint;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');mins integer:=30;begin if auth.uid() is null then raise exception 'غير مصرح';end if;if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;if k is null then raise exception 'معرف الحركة مطلوب';end if;perform pg_advisory_xact_lock(hashtextextended('service-appt:'||k,0));select id into idv from public.service_appointments_v1 where client_tx_id=k;if idv is not null then return idv;end if;select duration_minutes into mins from public.service_catalog where id=p_service_id;mins:=coalesce(mins,30);if p_provider_employee_id is not null and exists(select 1 from public.service_appointments_v1 where provider_employee_id=p_provider_employee_id and status not in('cancelled','no_show','completed') and tstzrange(starts_at,ends_at,'[)') && tstzrange(p_starts_at,p_starts_at+make_interval(mins=>mins),'[)')) then raise exception 'الموظف لديه حجز متعارض';end if;e:=public.current_employee_id();insert into public.service_appointments_v1(branch_id,customer_id,service_id,provider_employee_id,asset_id,starts_at,ends_at,notes,client_tx_id,created_by_employee_id) values(p_branch_id,p_customer_id,p_service_id,p_provider_employee_id,p_asset_id,p_starts_at,p_starts_at+make_interval(mins=>mins),nullif(trim(coalesce(p_notes,'')),''),k,e) returning id into idv;return idv;end;$$;

create or replace function public.service_appointment_status_v1(p_appointment_id bigint,p_status text)
returns public.service_appointments_v1 language plpgsql security definer set search_path=public
as $$ declare r public.service_appointments_v1%rowtype;begin if auth.uid() is null then raise exception 'غير مصرح';end if;select * into r from public.service_appointments_v1 where id=p_appointment_id for update;if not found or not public.has_branch_access(r.branch_id) then raise exception 'الحجز غير موجود أو غير مصرح';end if;if p_status not in('booked','confirmed','arrived','in_service','completed','no_show','cancelled') then raise exception 'حالة غير صحيحة';end if;update public.service_appointments_v1 set status=p_status,updated_at=now() where id=r.id returning * into r;return r;end;$$;

create or replace function public.service_job_create_v1(p_branch_id bigint,p_customer_id bigint,p_appointment_id bigint,p_asset_id bigint,p_service_id bigint,p_assigned_employee_id bigint,p_complaint text,p_estimate_amount numeric,p_client_tx_id text)
returns bigint language plpgsql security definer set search_path=public
as $$ declare idv bigint;e bigint;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');begin if auth.uid() is null then raise exception 'غير مصرح';end if;if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;if k is null then raise exception 'معرف الحركة مطلوب';end if;perform pg_advisory_xact_lock(hashtextextended('service-job:'||k,0));select id into idv from public.service_jobs_v1 where client_tx_id=k;if idv is not null then return idv;end if;e:=public.current_employee_id();insert into public.service_jobs_v1(branch_id,customer_id,appointment_id,asset_id,service_id,assigned_employee_id,complaint,estimate_amount,total_amount,client_tx_id,created_by_employee_id) values(p_branch_id,p_customer_id,p_appointment_id,p_asset_id,p_service_id,p_assigned_employee_id,nullif(trim(coalesce(p_complaint,'')),''),greatest(coalesce(p_estimate_amount,0),0),greatest(coalesce(p_estimate_amount,0),0),k,e) returning id into idv;update public.service_jobs_v1 set job_number='JOB-'||to_char(current_date,'YYMM')||'-'||lpad(idv::text,6,'0') where id=idv;return idv;end;$$;

create or replace function public.service_job_status_v1(p_job_id bigint,p_status text,p_diagnosis text,p_labor_amount numeric)
returns public.service_jobs_v1 language plpgsql security definer set search_path=public
as $$ declare r public.service_jobs_v1%rowtype;begin if auth.uid() is null then raise exception 'غير مصرح';end if;select * into r from public.service_jobs_v1 where id=p_job_id for update;if not found or not public.has_branch_access(r.branch_id) then raise exception 'أمر الخدمة غير موجود أو غير مصرح';end if;if p_status not in('received','diagnosis','estimate','awaiting_approval','approved','in_progress','ready','completed','cancelled') then raise exception 'حالة غير صحيحة';end if;update public.service_jobs_v1 set status=p_status,diagnosis=coalesce(nullif(trim(coalesce(p_diagnosis,'')),''),diagnosis),labor_amount=case when p_labor_amount is null then labor_amount else greatest(p_labor_amount,0) end,total_amount=case when p_labor_amount is null then total_amount else greatest(p_labor_amount,0)+parts_amount end,customer_approved_at=case when p_status='approved' then coalesce(customer_approved_at,now()) else customer_approved_at end,started_at=case when p_status='in_progress' then coalesce(started_at,now()) else started_at end,ready_at=case when p_status='ready' then coalesce(ready_at,now()) else ready_at end,completed_at=case when p_status='completed' then coalesce(completed_at,now()) else completed_at end,updated_at=now() where id=r.id returning * into r;return r;end;$$;

create or replace function public.service_package_purchase_v1(p_customer_id bigint,p_package_id bigint,p_paid_amount numeric,p_client_tx_id text)
returns bigint language plpgsql security definer set search_path=public
as $$ declare idv bigint;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');p public.service_packages_v1%rowtype;begin if auth.uid() is null then raise exception 'غير مصرح';end if;if k is null then raise exception 'معرف الحركة مطلوب';end if;perform pg_advisory_xact_lock(hashtextextended('service-package:'||k,0));select id into idv from public.service_customer_packages_v1 where client_tx_id=k;if idv is not null then return idv;end if;select * into p from public.service_packages_v1 where id=p_package_id and active=true;if not found then raise exception 'الباكدج غير موجود';end if;insert into public.service_customer_packages_v1(customer_id,package_id,purchased_sessions,remaining_sessions,expires_on,paid_amount,client_tx_id) values(p_customer_id,p.id,p.total_sessions,p.total_sessions,case when p.validity_days is null then null else current_date+p.validity_days end,greatest(coalesce(p_paid_amount,0),0),k) returning id into idv;return idv;end;$$;

create or replace function public.service_package_use_v1(p_customer_package_id bigint,p_appointment_id bigint,p_job_id bigint,p_sessions integer,p_client_tx_id text)
returns bigint language plpgsql security definer set search_path=public
as $$ declare cp public.service_customer_packages_v1%rowtype;idv bigint;e bigint;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');q integer:=greatest(coalesce(p_sessions,1),1);begin if auth.uid() is null then raise exception 'غير مصرح';end if;if k is null then raise exception 'معرف الحركة مطلوب';end if;perform pg_advisory_xact_lock(hashtextextended('service-package-use:'||k,0));select id into idv from public.service_package_usage_v1 where client_tx_id=k;if idv is not null then return idv;end if;select * into cp from public.service_customer_packages_v1 where id=p_customer_package_id for update;if not found or cp.status<>'active' or (cp.expires_on is not null and cp.expires_on<current_date) then raise exception 'الباكدج غير صالح';end if;if cp.remaining_sessions<q then raise exception 'رصيد الجلسات غير كافٍ';end if;e:=public.current_employee_id();insert into public.service_package_usage_v1(customer_package_id,appointment_id,job_id,sessions_used,employee_id,client_tx_id) values(cp.id,p_appointment_id,p_job_id,q,e,k) returning id into idv;update public.service_customer_packages_v1 set remaining_sessions=remaining_sessions-q,status=case when remaining_sessions-q=0 then 'completed' else status end where id=cp.id;return idv;end;$$;

create or replace function public.service_warranty_create_v1(p_customer_id bigint,p_asset_id bigint,p_order_id bigint,p_order_item_id bigint,p_warranty_type text,p_starts_on date,p_ends_on date,p_terms text)
returns bigint language plpgsql security definer set search_path=public
as $$ declare idv bigint;begin if auth.uid() is null or not public.is_admin() then raise exception 'إدارة الضمان للمدير فقط';end if;insert into public.service_warranties_v1(customer_id,asset_id,order_id,order_item_id,warranty_type,starts_on,ends_on,terms) values(p_customer_id,p_asset_id,p_order_id,p_order_item_id,coalesce(p_warranty_type,'store'),p_starts_on,p_ends_on,nullif(trim(coalesce(p_terms,'')),'')) returning id into idv;return idv;end;$$;

create or replace function public.service_installation_set_v1(p_job_id bigint,p_scheduled_at timestamptz,p_installer_employee_id bigint,p_address text,p_status text,p_notes text)
returns public.service_installations_v1 language plpgsql security definer set search_path=public
as $$ declare r public.service_installations_v1%rowtype;j public.service_jobs_v1%rowtype;begin if auth.uid() is null then raise exception 'غير مصرح';end if;select * into j from public.service_jobs_v1 where id=p_job_id;if not found or not public.has_branch_access(j.branch_id) then raise exception 'أمر الخدمة غير موجود أو غير مصرح';end if;insert into public.service_installations_v1(job_id,scheduled_at,installer_employee_id,address,status,completed_at,notes) values(p_job_id,p_scheduled_at,p_installer_employee_id,nullif(trim(coalesce(p_address,'')),''),coalesce(p_status,'scheduled'),case when p_status='completed' then now() else null end,nullif(trim(coalesce(p_notes,'')),'')) on conflict(job_id) do update set scheduled_at=excluded.scheduled_at,installer_employee_id=excluded.installer_employee_id,address=excluded.address,status=excluded.status,completed_at=case when excluded.status='completed' then coalesce(public.service_installations_v1.completed_at,now()) else public.service_installations_v1.completed_at end,notes=excluded.notes,updated_at=now() returning * into r;return r;end;$$;

alter table public.service_catalog enable row level security;alter table public.service_assets_v1 enable row level security;alter table public.service_appointments_v1 enable row level security;alter table public.service_jobs_v1 enable row level security;alter table public.service_job_parts_v1 enable row level security;alter table public.service_packages_v1 enable row level security;alter table public.service_customer_packages_v1 enable row level security;alter table public.service_package_usage_v1 enable row level security;alter table public.service_warranties_v1 enable row level security;alter table public.service_installations_v1 enable row level security;alter table public.finance_commission_rules_v1 enable row level security;alter table public.finance_commission_entries_v1 enable row level security;

drop policy if exists service_catalog_select_v1 on public.service_catalog;create policy service_catalog_select_v1 on public.service_catalog for select to authenticated using(active=true);
drop policy if exists service_assets_select_v1 on public.service_assets_v1;create policy service_assets_select_v1 on public.service_assets_v1 for select to authenticated using(true);
drop policy if exists service_appointments_select_v1 on public.service_appointments_v1;create policy service_appointments_select_v1 on public.service_appointments_v1 for select to authenticated using(public.has_branch_access(branch_id));
drop policy if exists service_jobs_select_v1 on public.service_jobs_v1;create policy service_jobs_select_v1 on public.service_jobs_v1 for select to authenticated using(public.has_branch_access(branch_id));
drop policy if exists service_job_parts_select_v1 on public.service_job_parts_v1;create policy service_job_parts_select_v1 on public.service_job_parts_v1 for select to authenticated using(exists(select 1 from public.service_jobs_v1 j where j.id=job_id and public.has_branch_access(j.branch_id)));
drop policy if exists service_packages_select_v1 on public.service_packages_v1;create policy service_packages_select_v1 on public.service_packages_v1 for select to authenticated using(active=true);
drop policy if exists service_customer_packages_select_v1 on public.service_customer_packages_v1;create policy service_customer_packages_select_v1 on public.service_customer_packages_v1 for select to authenticated using(true);
drop policy if exists service_package_usage_select_v1 on public.service_package_usage_v1;create policy service_package_usage_select_v1 on public.service_package_usage_v1 for select to authenticated using(true);
drop policy if exists service_warranties_select_v1 on public.service_warranties_v1;create policy service_warranties_select_v1 on public.service_warranties_v1 for select to authenticated using(true);
drop policy if exists service_installations_select_v1 on public.service_installations_v1;create policy service_installations_select_v1 on public.service_installations_v1 for select to authenticated using(exists(select 1 from public.service_jobs_v1 j where j.id=job_id and public.has_branch_access(j.branch_id)));
drop policy if exists finance_commission_rules_select_v1 on public.finance_commission_rules_v1;create policy finance_commission_rules_select_v1 on public.finance_commission_rules_v1 for select to authenticated using(active=true);
drop policy if exists finance_commission_entries_select_v1 on public.finance_commission_entries_v1;create policy finance_commission_entries_select_v1 on public.finance_commission_entries_v1 for select to authenticated using(true);

revoke insert,update,delete on public.service_catalog,public.service_assets_v1,public.service_appointments_v1,public.service_jobs_v1,public.service_job_parts_v1,public.service_packages_v1,public.service_customer_packages_v1,public.service_package_usage_v1,public.service_warranties_v1,public.service_installations_v1,public.finance_commission_rules_v1,public.finance_commission_entries_v1 from authenticated;
grant select on public.service_catalog,public.service_assets_v1,public.service_appointments_v1,public.service_jobs_v1,public.service_job_parts_v1,public.service_packages_v1,public.service_customer_packages_v1,public.service_package_usage_v1,public.service_warranties_v1,public.service_installations_v1,public.finance_commission_rules_v1,public.finance_commission_entries_v1 to authenticated;
grant execute on function public.service_catalog_save_v1(bigint,text,text,integer,numeric,boolean) to authenticated;grant execute on function public.service_appointment_create_v1(bigint,bigint,bigint,bigint,bigint,timestamptz,text,text) to authenticated;grant execute on function public.service_appointment_status_v1(bigint,text) to authenticated;grant execute on function public.service_job_create_v1(bigint,bigint,bigint,bigint,bigint,bigint,text,numeric,text) to authenticated;grant execute on function public.service_job_status_v1(bigint,text,text,numeric) to authenticated;grant execute on function public.service_package_purchase_v1(bigint,bigint,numeric,text) to authenticated;grant execute on function public.service_package_use_v1(bigint,bigint,bigint,integer,text) to authenticated;grant execute on function public.service_warranty_create_v1(bigint,bigint,bigint,bigint,text,date,date,text) to authenticated;grant execute on function public.service_installation_set_v1(bigint,timestamptz,bigint,text,text,text) to authenticated;

commit;
