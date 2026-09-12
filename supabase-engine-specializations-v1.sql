-- Sharawla POS — Specialization Engines V1
-- Automotive / Testers / Consignment / Trade-in / Education / Healthcare foundations.

begin;

-- Automotive fitment / cross-reference / VIN-linked customer vehicles.
create table if not exists public.automotive_vehicle_models_v1 (
 id bigserial primary key,make text not null,model text not null,year_from integer,year_to integer,engine_code text,trim_name text,active boolean not null default true,created_at timestamptz not null default now(),
 constraint automotive_vehicle_years check(year_to is null or year_from is null or year_to>=year_from)
);
create table if not exists public.automotive_product_fitments_v1 (
 id bigserial primary key,product_id bigint not null references public.products(id) on delete cascade,vehicle_model_id bigint not null references public.automotive_vehicle_models_v1(id) on delete cascade,notes text,unique(product_id,vehicle_model_id)
);
create table if not exists public.automotive_cross_references_v1 (
 id bigserial primary key,product_id bigint not null references public.products(id) on delete cascade,reference_type text not null default 'oem' check(reference_type in('oem','aftermarket','supplier')),reference_code text not null,brand text,created_at timestamptz not null default now(),unique(reference_type,reference_code,brand)
);
create index if not exists automotive_cross_reference_code_idx on public.automotive_cross_references_v1(lower(reference_code));
create table if not exists public.automotive_customer_vehicles_v1 (
 id bigserial primary key,customer_id bigint not null references public.customers(id) on delete cascade,vehicle_model_id bigint references public.automotive_vehicle_models_v1(id) on delete set null,vin text,plate_number text,year integer,color text,notes text,active boolean not null default true,created_at timestamptz not null default now()
);
create unique index if not exists automotive_customer_vehicle_vin_uidx on public.automotive_customer_vehicles_v1(vin) where vin is not null and trim(vin)<>'';

create or replace function public.automotive_part_search_v1(p_query text,p_vehicle_model_id bigint default null)
returns table(product_id bigint,product_name text,barcode text,matched_reference text,fitment_match boolean)
language sql stable security definer set search_path=public as $$
 select distinct p.id,p.name,p.barcode,cr.reference_code,
   case when p_vehicle_model_id is null then false else exists(select 1 from public.automotive_product_fitments_v1 f where f.product_id=p.id and f.vehicle_model_id=p_vehicle_model_id) end
 from public.products p left join public.automotive_cross_references_v1 cr on cr.product_id=p.id
 where p.active is distinct from false and (
   lower(p.name) like '%'||lower(trim(p_query))||'%' or lower(coalesce(p.barcode,''))=lower(trim(p_query)) or lower(coalesce(cr.reference_code,''))=lower(trim(p_query))
 ) and (p_vehicle_model_id is null or exists(select 1 from public.automotive_product_fitments_v1 f where f.product_id=p.id and f.vehicle_model_id=p_vehicle_model_id))
 order by p.name limit 100;
$$;

-- Testers: move stock from sellable inventory into non-sale tester custody.
create table if not exists public.inventory_tester_balances_v1 (
 branch_id bigint not null references public.branches(id) on delete cascade,product_id bigint not null references public.products(id) on delete restrict,variant_id bigint references public.product_variants(id) on delete restrict,quantity numeric(14,3) not null default 0 check(quantity>=0),unit_cost numeric(14,4) not null default 0 check(unit_cost>=0),updated_at timestamptz not null default now(),primary key(branch_id,product_id,variant_id)
);
create table if not exists public.inventory_tester_movements_v1 (
 id bigserial primary key,branch_id bigint not null references public.branches(id),product_id bigint not null references public.products(id),variant_id bigint references public.product_variants(id),movement_type text not null check(movement_type in('issue','consume','adjustment')),quantity_delta numeric(14,3) not null check(quantity_delta<>0),balance_after numeric(14,3) not null,unit_cost numeric(14,4) not null default 0,reason text,employee_id bigint references public.employees(id),client_tx_id text unique,created_at timestamptz not null default now()
);

-- Consignment contracts and settlement basis.
create table if not exists public.commerce_consignment_contracts_v1 (
 id bigserial primary key,supplier_id bigint not null references public.retail_suppliers(id) on delete restrict,name text not null,starts_on date not null default current_date,ends_on date,settlement_basis text not null default 'sold_value' check(settlement_basis in('sold_value','unit_cost')),supplier_share_percent numeric(7,4) not null default 100 check(supplier_share_percent between 0 and 100),status text not null default 'active' check(status in('active','closed','cancelled')),notes text,created_at timestamptz not null default now()
);
create table if not exists public.commerce_consignment_items_v1 (
 id bigserial primary key,contract_id bigint not null references public.commerce_consignment_contracts_v1(id) on delete cascade,product_id bigint not null references public.products(id) on delete restrict,variant_id bigint references public.product_variants(id) on delete restrict,quantity_received numeric(14,3) not null default 0,quantity_sold numeric(14,3) not null default 0,quantity_returned numeric(14,3) not null default 0,supplier_unit_cost numeric(14,4) not null default 0,unique(contract_id,product_id,variant_id)
);

-- Trade-in / used inventory intake.
create table if not exists public.commerce_trade_in_items_v1 (
 id bigserial primary key,branch_id bigint not null references public.branches(id),customer_id bigint references public.customers(id),source_order_id bigint references public.orders(id) on delete set null,brand text,model text,serial_number text,imei text,condition_grade text,condition_notes text,valuation_amount numeric(14,2) not null default 0 check(valuation_amount>=0),resale_price numeric(14,2) not null default 0 check(resale_price>=0),status text not null default 'received' check(status in('received','inspection','available','sold','rejected','returned')),client_tx_id text not null unique,created_by_employee_id bigint references public.employees(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists commerce_trade_in_imei_idx on public.commerce_trade_in_items_v1(imei) where imei is not null;

-- School / institutional lists.
create table if not exists public.education_school_lists_v1 (
 id bigserial primary key,school_name text not null,grade_name text,academic_year text not null,status text not null default 'active' check(status in('draft','active','expired','cancelled')),notes text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.education_school_list_items_v1 (
 id bigserial primary key,school_list_id bigint not null references public.education_school_lists_v1(id) on delete cascade,product_id bigint not null references public.products(id) on delete restrict,quantity numeric(14,3) not null default 1 check(quantity>0),contract_unit_price numeric(14,2),notes text,unique(school_list_id,product_id)
);

-- Healthcare lightweight EMR and insurance layer.
create table if not exists public.healthcare_patient_profiles_v1 (
 customer_id bigint primary key references public.customers(id) on delete cascade,blood_type text,allergies text,chronic_conditions text,medical_notes text,emergency_contact_name text,emergency_contact_phone text,updated_at timestamptz not null default now()
);
create table if not exists public.healthcare_encounters_v1 (
 id bigserial primary key,branch_id bigint not null references public.branches(id),customer_id bigint not null references public.customers(id),provider_employee_id bigint references public.employees(id),appointment_id bigint references public.service_appointments_v1(id) on delete set null,encounter_type text not null default 'visit',chief_complaint text,clinical_notes text,diagnosis text,follow_up_at timestamptz,status text not null default 'open' check(status in('open','closed','cancelled')),created_at timestamptz not null default now(),closed_at timestamptz
);
create table if not exists public.healthcare_insurance_providers_v1 (
 id bigserial primary key,name text not null,code text unique,active boolean not null default true,contact_info jsonb not null default '{}'::jsonb
);
create table if not exists public.healthcare_patient_policies_v1 (
 id bigserial primary key,customer_id bigint not null references public.customers(id),provider_id bigint not null references public.healthcare_insurance_providers_v1(id),member_number text not null,plan_name text,coverage_percent numeric(7,4) not null default 100 check(coverage_percent between 0 and 100),starts_on date,ends_on date,active boolean not null default true,unique(provider_id,member_number)
);
create table if not exists public.healthcare_insurance_approvals_v1 (
 id bigserial primary key,policy_id bigint not null references public.healthcare_patient_policies_v1(id),encounter_id bigint references public.healthcare_encounters_v1(id) on delete set null,approval_number text,requested_amount numeric(14,2) not null default 0,approved_amount numeric(14,2) not null default 0,status text not null default 'pending' check(status in('pending','approved','partial','rejected','expired')),requested_at timestamptz not null default now(),responded_at timestamptz,notes text
);

create or replace function public.commerce_trade_in_create_v1(p_branch_id bigint,p_customer_id bigint,p_brand text,p_model text,p_serial text,p_imei text,p_condition_grade text,p_condition_notes text,p_valuation numeric,p_resale_price numeric,p_client_tx_id text)
returns bigint language plpgsql security definer set search_path=public
as $$declare idv bigint;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');e bigint;begin if auth.uid() is null then raise exception 'غير مصرح';end if;if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;if k is null then raise exception 'معرف الحركة مطلوب';end if;perform pg_advisory_xact_lock(hashtextextended('trade-in:'||k,0));select id into idv from public.commerce_trade_in_items_v1 where client_tx_id=k;if idv is not null then return idv;end if;e:=public.current_employee_id();insert into public.commerce_trade_in_items_v1(branch_id,customer_id,brand,model,serial_number,imei,condition_grade,condition_notes,valuation_amount,resale_price,client_tx_id,created_by_employee_id) values(p_branch_id,p_customer_id,nullif(trim(coalesce(p_brand,'')),''),nullif(trim(coalesce(p_model,'')),''),nullif(trim(coalesce(p_serial,'')),''),nullif(trim(coalesce(p_imei,'')),''),nullif(trim(coalesce(p_condition_grade,'')),''),nullif(trim(coalesce(p_condition_notes,'')),''),greatest(coalesce(p_valuation,0),0),greatest(coalesce(p_resale_price,0),0),k,e) returning id into idv;return idv;end;$$;

create or replace function public.healthcare_patient_profile_set_v1(p_customer_id bigint,p_blood_type text,p_allergies text,p_chronic_conditions text,p_medical_notes text,p_emergency_name text,p_emergency_phone text)
returns public.healthcare_patient_profiles_v1 language plpgsql security definer set search_path=public
as $$declare r public.healthcare_patient_profiles_v1%rowtype;begin if auth.uid() is null then raise exception 'غير مصرح';end if;insert into public.healthcare_patient_profiles_v1(customer_id,blood_type,allergies,chronic_conditions,medical_notes,emergency_contact_name,emergency_contact_phone) values(p_customer_id,nullif(trim(coalesce(p_blood_type,'')),''),nullif(trim(coalesce(p_allergies,'')),''),nullif(trim(coalesce(p_chronic_conditions,'')),''),nullif(trim(coalesce(p_medical_notes,'')),''),nullif(trim(coalesce(p_emergency_name,'')),''),nullif(trim(coalesce(p_emergency_phone,'')),'')) on conflict(customer_id) do update set blood_type=excluded.blood_type,allergies=excluded.allergies,chronic_conditions=excluded.chronic_conditions,medical_notes=excluded.medical_notes,emergency_contact_name=excluded.emergency_contact_name,emergency_contact_phone=excluded.emergency_contact_phone,updated_at=now() returning * into r;return r;end;$$;

alter table public.automotive_vehicle_models_v1 enable row level security;alter table public.automotive_product_fitments_v1 enable row level security;alter table public.automotive_cross_references_v1 enable row level security;alter table public.automotive_customer_vehicles_v1 enable row level security;alter table public.inventory_tester_balances_v1 enable row level security;alter table public.inventory_tester_movements_v1 enable row level security;alter table public.commerce_consignment_contracts_v1 enable row level security;alter table public.commerce_consignment_items_v1 enable row level security;alter table public.commerce_trade_in_items_v1 enable row level security;alter table public.education_school_lists_v1 enable row level security;alter table public.education_school_list_items_v1 enable row level security;alter table public.healthcare_patient_profiles_v1 enable row level security;alter table public.healthcare_encounters_v1 enable row level security;alter table public.healthcare_insurance_providers_v1 enable row level security;alter table public.healthcare_patient_policies_v1 enable row level security;alter table public.healthcare_insurance_approvals_v1 enable row level security;

-- Read policies. Mutations are RPC/admin-only until each specialization UI is enabled.
create policy automotive_vehicle_models_read_v1 on public.automotive_vehicle_models_v1 for select to authenticated using(active=true);create policy automotive_fitments_read_v1 on public.automotive_product_fitments_v1 for select to authenticated using(true);create policy automotive_cross_refs_read_v1 on public.automotive_cross_references_v1 for select to authenticated using(true);create policy automotive_customer_vehicles_read_v1 on public.automotive_customer_vehicles_v1 for select to authenticated using(true);create policy inventory_tester_balances_read_v1 on public.inventory_tester_balances_v1 for select to authenticated using(public.has_branch_access(branch_id));create policy inventory_tester_movements_read_v1 on public.inventory_tester_movements_v1 for select to authenticated using(public.has_branch_access(branch_id));create policy commerce_consignment_contracts_read_v1 on public.commerce_consignment_contracts_v1 for select to authenticated using(true);create policy commerce_consignment_items_read_v1 on public.commerce_consignment_items_v1 for select to authenticated using(true);create policy commerce_trade_in_read_v1 on public.commerce_trade_in_items_v1 for select to authenticated using(public.has_branch_access(branch_id));create policy education_school_lists_read_v1 on public.education_school_lists_v1 for select to authenticated using(status='active');create policy education_school_list_items_read_v1 on public.education_school_list_items_v1 for select to authenticated using(true);create policy healthcare_patient_profiles_read_v1 on public.healthcare_patient_profiles_v1 for select to authenticated using(true);create policy healthcare_encounters_read_v1 on public.healthcare_encounters_v1 for select to authenticated using(public.has_branch_access(branch_id));create policy healthcare_insurance_providers_read_v1 on public.healthcare_insurance_providers_v1 for select to authenticated using(active=true);create policy healthcare_patient_policies_read_v1 on public.healthcare_patient_policies_v1 for select to authenticated using(true);create policy healthcare_insurance_approvals_read_v1 on public.healthcare_insurance_approvals_v1 for select to authenticated using(true);

grant select on public.automotive_vehicle_models_v1,public.automotive_product_fitments_v1,public.automotive_cross_references_v1,public.automotive_customer_vehicles_v1,public.inventory_tester_balances_v1,public.inventory_tester_movements_v1,public.commerce_consignment_contracts_v1,public.commerce_consignment_items_v1,public.commerce_trade_in_items_v1,public.education_school_lists_v1,public.education_school_list_items_v1,public.healthcare_patient_profiles_v1,public.healthcare_encounters_v1,public.healthcare_insurance_providers_v1,public.healthcare_patient_policies_v1,public.healthcare_insurance_approvals_v1 to authenticated;
grant execute on function public.automotive_part_search_v1(text,bigint) to authenticated;grant execute on function public.commerce_trade_in_create_v1(bigint,bigint,text,text,text,text,text,text,numeric,numeric,text) to authenticated;grant execute on function public.healthcare_patient_profile_set_v1(bigint,text,text,text,text,text,text) to authenticated;

commit;
