-- Sharawla POS — Beta55 Central Warehouse / Branch Replenishment Foundation
-- Sandbox-first, additive only. No production migration is implied by this file.
-- Shared inventory core: a Restaurant/Retail/etc business may have normal branches
-- plus one or more locations of type central_warehouse. Branches request only
-- catalog items assigned to their route. Stock dispatch/receipt posting is a
-- separate runtime gate; this foundation covers configuration + request workflow.

begin;

-- -----------------------------------------------------------------------------
-- 1) Business locations
-- -----------------------------------------------------------------------------
alter table public.branches
  add column if not exists location_type text not null default 'branch',
  add column if not exists location_code text;

alter table public.branches
  drop constraint if exists branches_location_type_check,
  add constraint branches_location_type_check
    check (location_type in ('branch','central_warehouse'));

create index if not exists branches_location_type_active_idx
  on public.branches(location_type,active,id);

-- -----------------------------------------------------------------------------
-- 2) Action permissions. Existing legacy inventory permission is the fallback;
--    explicit employee overrides in Permission Actions V2 still win.
-- -----------------------------------------------------------------------------
insert into public.permission_actions_v2(code,name_ar,domain,legacy_permission,active,sort_order)
values
 ('inventory.supply.view','عرض طلبات التوريد الداخلي','inventory','inventory',true,1320),
 ('inventory.supply.configure','إعداد المخازن ومسارات وأصناف التوريد','inventory','inventory',true,1321),
 ('inventory.supply.request.create','إنشاء طلب توريد من مخزن','inventory','inventory',true,1322),
 ('inventory.supply.request.submit','إرسال طلب توريد للمخزن','inventory','inventory',true,1323),
 ('inventory.supply.request.approve','اعتماد أو رفض طلب توريد','inventory','inventory',true,1324),
 ('inventory.supply.request.fulfill','تجهيز وصرف طلب توريد','inventory','inventory',true,1325),
 ('inventory.supply.request.receive','استلام طلب توريد بالفرع','inventory','inventory',true,1326),
 ('inventory.supply.request.emergency','إنشاء طلب توريد عاجل','inventory','inventory',true,1327)
on conflict(code) do update set
 name_ar=excluded.name_ar,
 domain=excluded.domain,
 legacy_permission=excluded.legacy_permission,
 active=excluded.active,
 sort_order=excluded.sort_order;

-- -----------------------------------------------------------------------------
-- 3) Supply routes: one source location -> one destination branch.
-- -----------------------------------------------------------------------------
create table if not exists public.inventory_supply_routes (
  id bigserial primary key,
  source_location_id bigint not null references public.branches(id) on delete restrict,
  destination_branch_id bigint not null references public.branches(id) on delete restrict,
  active boolean not null default true,
  cutoff_time time,
  lead_time_days integer not null default 1 check (lead_time_days >= 0),
  allow_emergency boolean not null default true,
  notes text,
  created_by_employee_id bigint references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_supply_routes_different_locations check (source_location_id <> destination_branch_id),
  unique(source_location_id,destination_branch_id)
);

create index if not exists inventory_supply_routes_destination_idx
  on public.inventory_supply_routes(destination_branch_id,active,id);
create index if not exists inventory_supply_routes_source_idx
  on public.inventory_supply_routes(source_location_id,active,id);

-- -----------------------------------------------------------------------------
-- 4) Per-branch request catalog. A route can expose Products, Ingredients, or both.
-- -----------------------------------------------------------------------------
create table if not exists public.inventory_supply_catalog (
  id bigserial primary key,
  route_id bigint not null references public.inventory_supply_routes(id) on delete cascade,
  item_type text not null check (item_type in ('product','ingredient')),
  product_id bigint references public.products(id) on delete restrict,
  ingredient_id bigint references public.ingredients(id) on delete restrict,
  request_unit_code text references public.inventory_units(code) on delete set null,
  min_request_qty numeric(14,3) not null default 0 check (min_request_qty >= 0),
  max_request_qty numeric(14,3) check (max_request_qty is null or max_request_qty > 0),
  request_multiple numeric(14,3) not null default 0 check (request_multiple >= 0),
  suggested_target_qty numeric(14,3) check (suggested_target_qty is null or suggested_target_qty >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_supply_catalog_item_check check (
    (item_type='product' and product_id is not null and ingredient_id is null)
    or
    (item_type='ingredient' and ingredient_id is not null and product_id is null)
  ),
  constraint inventory_supply_catalog_max_gte_min check (
    max_request_qty is null or max_request_qty >= min_request_qty
  )
);

create unique index if not exists inventory_supply_catalog_route_product_uidx
  on public.inventory_supply_catalog(route_id,product_id)
  where item_type='product' and product_id is not null;
create unique index if not exists inventory_supply_catalog_route_ingredient_uidx
  on public.inventory_supply_catalog(route_id,ingredient_id)
  where item_type='ingredient' and ingredient_id is not null;
create index if not exists inventory_supply_catalog_route_active_idx
  on public.inventory_supply_catalog(route_id,active,sort_order,id);

-- -----------------------------------------------------------------------------
-- 5) Branch requests + lines + immutable workflow timeline.
-- -----------------------------------------------------------------------------
create table if not exists public.inventory_supply_requests (
  id bigserial primary key,
  route_id bigint not null references public.inventory_supply_routes(id) on delete restrict,
  source_location_id bigint not null references public.branches(id) on delete restrict,
  destination_branch_id bigint not null references public.branches(id) on delete restrict,
  request_type text not null default 'normal' check (request_type in ('normal','emergency')),
  status text not null default 'draft' check (status in (
    'draft','submitted','approved','rejected','cancelled',
    'preparing','in_transit','partially_received','received'
  )),
  notes text,
  decision_note text,
  client_tx_id text not null unique,
  created_by_employee_id bigint references public.employees(id),
  submitted_by_employee_id bigint references public.employees(id),
  decided_by_employee_id bigint references public.employees(id),
  dispatched_by_employee_id bigint references public.employees(id),
  received_by_employee_id bigint references public.employees(id),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  decided_at timestamptz,
  dispatched_at timestamptz,
  received_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists inventory_supply_requests_destination_status_idx
  on public.inventory_supply_requests(destination_branch_id,status,created_at desc);
create index if not exists inventory_supply_requests_source_status_idx
  on public.inventory_supply_requests(source_location_id,status,created_at desc);

create table if not exists public.inventory_supply_request_items (
  id bigserial primary key,
  request_id bigint not null references public.inventory_supply_requests(id) on delete cascade,
  catalog_item_id bigint not null references public.inventory_supply_catalog(id) on delete restrict,
  item_type text not null check (item_type in ('product','ingredient')),
  product_id bigint references public.products(id) on delete restrict,
  ingredient_id bigint references public.ingredients(id) on delete restrict,
  quantity_requested numeric(14,3) not null check (quantity_requested > 0),
  quantity_approved numeric(14,3) not null default 0 check (quantity_approved >= 0),
  quantity_dispatched numeric(14,3) not null default 0 check (quantity_dispatched >= 0),
  quantity_received numeric(14,3) not null default 0 check (quantity_received >= 0),
  quantity_damaged numeric(14,3) not null default 0 check (quantity_damaged >= 0),
  line_note text,
  created_at timestamptz not null default now(),
  constraint inventory_supply_request_items_item_check check (
    (item_type='product' and product_id is not null and ingredient_id is null)
    or
    (item_type='ingredient' and ingredient_id is not null and product_id is null)
  ),
  unique(request_id,catalog_item_id)
);

create table if not exists public.inventory_supply_request_events (
  id bigserial primary key,
  request_id bigint not null references public.inventory_supply_requests(id) on delete cascade,
  from_status text,
  to_status text not null,
  note text,
  employee_id bigint references public.employees(id),
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists inventory_supply_request_events_request_idx
  on public.inventory_supply_request_events(request_id,created_at,id);

-- -----------------------------------------------------------------------------
-- 6) Live request catalog read model: only assigned items appear to the branch.
--    It also exposes source + destination current stock for a better request UI.
-- -----------------------------------------------------------------------------
-- POINT4 corrective deployment: preserve newer inventory_supply_catalog_live_v1 already installed by deployment order 2.
-- The older view definition from this historical artifact is intentionally omitted to prevent a runtime downgrade.


-- -----------------------------------------------------------------------------
-- 7) RLS: direct writes are not exposed. Operational writes go through RPCs.
-- -----------------------------------------------------------------------------
alter table public.inventory_supply_routes enable row level security;
alter table public.inventory_supply_catalog enable row level security;
alter table public.inventory_supply_requests enable row level security;
alter table public.inventory_supply_request_items enable row level security;
alter table public.inventory_supply_request_events enable row level security;

drop policy if exists inventory_supply_routes_select_v1 on public.inventory_supply_routes;
create policy inventory_supply_routes_select_v1 on public.inventory_supply_routes
for select to authenticated using (
  public.has_action_permission_v2('inventory.supply.view')
  and (public.has_branch_access(source_location_id) or public.has_branch_access(destination_branch_id))
);

drop policy if exists inventory_supply_catalog_select_v1 on public.inventory_supply_catalog;
create policy inventory_supply_catalog_select_v1 on public.inventory_supply_catalog
for select to authenticated using (
  public.has_action_permission_v2('inventory.supply.view')
  and exists (
    select 1 from public.inventory_supply_routes r
    where r.id=route_id
      and (public.has_branch_access(r.source_location_id) or public.has_branch_access(r.destination_branch_id))
  )
);

drop policy if exists inventory_supply_requests_select_v1 on public.inventory_supply_requests;
create policy inventory_supply_requests_select_v1 on public.inventory_supply_requests
for select to authenticated using (
  public.has_action_permission_v2('inventory.supply.view')
  and (public.has_branch_access(source_location_id) or public.has_branch_access(destination_branch_id))
);

drop policy if exists inventory_supply_request_items_select_v1 on public.inventory_supply_request_items;
create policy inventory_supply_request_items_select_v1 on public.inventory_supply_request_items
for select to authenticated using (
  exists (
    select 1 from public.inventory_supply_requests q
    where q.id=request_id
      and public.has_action_permission_v2('inventory.supply.view')
      and (public.has_branch_access(q.source_location_id) or public.has_branch_access(q.destination_branch_id))
  )
);

drop policy if exists inventory_supply_request_events_select_v1 on public.inventory_supply_request_events;
create policy inventory_supply_request_events_select_v1 on public.inventory_supply_request_events
for select to authenticated using (
  exists (
    select 1 from public.inventory_supply_requests q
    where q.id=request_id
      and public.has_action_permission_v2('inventory.supply.view')
      and (public.has_branch_access(q.source_location_id) or public.has_branch_access(q.destination_branch_id))
  )
);

grant select on public.inventory_supply_routes,public.inventory_supply_catalog,
  public.inventory_supply_requests,public.inventory_supply_request_items,
  public.inventory_supply_request_events to authenticated;
grant select on public.inventory_supply_catalog_live_v1 to authenticated;
revoke insert,update,delete on public.inventory_supply_routes,public.inventory_supply_catalog,
  public.inventory_supply_requests,public.inventory_supply_request_items,
  public.inventory_supply_request_events from authenticated;

-- -----------------------------------------------------------------------------
-- 8) Configuration RPCs
-- -----------------------------------------------------------------------------
create or replace function public.inventory_supply_route_upsert_v1(
  p_route_id bigint,
  p_source_location_id bigint,
  p_destination_branch_id bigint,
  p_cutoff_time time,
  p_lead_time_days integer,
  p_allow_emergency boolean,
  p_notes text,
  p_active boolean
) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_id bigint;v_emp bigint;v_source_type text;
begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not public.has_action_permission_v2('inventory.supply.configure') then raise exception 'ليس لديك صلاحية إعداد التوريد الداخلي';end if;
 if p_source_location_id is null or p_destination_branch_id is null or p_source_location_id=p_destination_branch_id then raise exception 'اختر مخزن مصدر وفرع مستلم مختلفين';end if;
 if not public.has_branch_access(p_source_location_id) or not public.has_branch_access(p_destination_branch_id) then raise exception 'ليس لديك صلاحية أحد المواقع';end if;
 select location_type into v_source_type from public.branches where id=p_source_location_id and active=true;
 if v_source_type is distinct from 'central_warehouse' then raise exception 'الموقع المصدر يجب أن يكون مخزنًا رئيسيًا';end if;
 if not exists(select 1 from public.branches where id=p_destination_branch_id and active=true and location_type='branch') then raise exception 'الجهة المستلمة يجب أن تكون فرعًا فعالًا';end if;
 v_emp:=public.current_employee_id();
 if p_route_id is null then
   insert into public.inventory_supply_routes(source_location_id,destination_branch_id,cutoff_time,lead_time_days,allow_emergency,notes,active,created_by_employee_id)
   values(p_source_location_id,p_destination_branch_id,p_cutoff_time,greatest(coalesce(p_lead_time_days,0),0),coalesce(p_allow_emergency,true),nullif(trim(coalesce(p_notes,'')),''),coalesce(p_active,true),v_emp)
   on conflict(source_location_id,destination_branch_id) do update set cutoff_time=excluded.cutoff_time,lead_time_days=excluded.lead_time_days,allow_emergency=excluded.allow_emergency,notes=excluded.notes,active=excluded.active,updated_at=now()
   returning id into v_id;
 else
   update public.inventory_supply_routes set source_location_id=p_source_location_id,destination_branch_id=p_destination_branch_id,cutoff_time=p_cutoff_time,lead_time_days=greatest(coalesce(p_lead_time_days,0),0),allow_emergency=coalesce(p_allow_emergency,true),notes=nullif(trim(coalesce(p_notes,'')),''),active=coalesce(p_active,true),updated_at=now() where id=p_route_id returning id into v_id;
   if v_id is null then raise exception 'مسار التوريد غير موجود';end if;
 end if;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(v_emp,p_destination_branch_id,'inventory.supply.route.upsert','inventory_supply_route',v_id,jsonb_build_object('source_location_id',p_source_location_id,'destination_branch_id',p_destination_branch_id,'active',coalesce(p_active,true)));
 return v_id;
end$$;

create or replace function public.inventory_supply_catalog_upsert_v1(
  p_catalog_item_id bigint,
  p_route_id bigint,
  p_item_type text,
  p_item_id bigint,
  p_request_unit_code text,
  p_min_request_qty numeric,
  p_max_request_qty numeric,
  p_request_multiple numeric,
  p_suggested_target_qty numeric,
  p_sort_order integer,
  p_notes text,
  p_active boolean
) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_id bigint;v_emp bigint;v_route public.inventory_supply_routes%rowtype;
begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not public.has_action_permission_v2('inventory.supply.configure') then raise exception 'ليس لديك صلاحية إعداد أصناف التوريد';end if;
 select * into v_route from public.inventory_supply_routes where id=p_route_id;
 if not found then raise exception 'مسار التوريد غير موجود';end if;
 if not public.has_branch_access(v_route.source_location_id) or not public.has_branch_access(v_route.destination_branch_id) then raise exception 'ليس لديك صلاحية أحد المواقع';end if;
 if p_item_type not in ('product','ingredient') then raise exception 'نوع الصنف غير صحيح';end if;
 if p_item_id is null then raise exception 'الصنف مطلوب';end if;
 if p_item_type='product' and not exists(select 1 from public.products where id=p_item_id and active is distinct from false) then raise exception 'الصنف غير موجود أو غير فعال';end if;
 if p_item_type='ingredient' and not exists(select 1 from public.ingredients where id=p_item_id and active is distinct from false) then raise exception 'الخامة غير موجودة أو غير فعالة';end if;
 if coalesce(p_min_request_qty,0)<0 or (p_max_request_qty is not null and p_max_request_qty<greatest(coalesce(p_min_request_qty,0),0)) or coalesce(p_request_multiple,0)<0 then raise exception 'حدود كمية الطلب غير صحيحة';end if;
 v_emp:=public.current_employee_id();
 if p_catalog_item_id is null then
   insert into public.inventory_supply_catalog(route_id,item_type,product_id,ingredient_id,request_unit_code,min_request_qty,max_request_qty,request_multiple,suggested_target_qty,sort_order,notes,active)
   values(p_route_id,p_item_type,case when p_item_type='product' then p_item_id end,case when p_item_type='ingredient' then p_item_id end,nullif(trim(coalesce(p_request_unit_code,'')),''),greatest(coalesce(p_min_request_qty,0),0),p_max_request_qty,greatest(coalesce(p_request_multiple,0),0),p_suggested_target_qty,coalesce(p_sort_order,0),nullif(trim(coalesce(p_notes,'')),''),coalesce(p_active,true))
   returning id into v_id;
 else
   update public.inventory_supply_catalog set route_id=p_route_id,item_type=p_item_type,product_id=case when p_item_type='product' then p_item_id end,ingredient_id=case when p_item_type='ingredient' then p_item_id end,request_unit_code=nullif(trim(coalesce(p_request_unit_code,'')),''),min_request_qty=greatest(coalesce(p_min_request_qty,0),0),max_request_qty=p_max_request_qty,request_multiple=greatest(coalesce(p_request_multiple,0),0),suggested_target_qty=p_suggested_target_qty,sort_order=coalesce(p_sort_order,0),notes=nullif(trim(coalesce(p_notes,'')),''),active=coalesce(p_active,true),updated_at=now() where id=p_catalog_item_id returning id into v_id;
   if v_id is null then raise exception 'صنف التوريد غير موجود';end if;
 end if;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(v_emp,v_route.destination_branch_id,'inventory.supply.catalog.upsert','inventory_supply_catalog',v_id,jsonb_build_object('route_id',p_route_id,'item_type',p_item_type,'item_id',p_item_id,'active',coalesce(p_active,true)));
 return v_id;
end$$;

-- -----------------------------------------------------------------------------
-- 9) Request workflow RPCs (no stock mutation yet).
-- -----------------------------------------------------------------------------
create or replace function public.inventory_supply_request_create_v1(
  p_route_id bigint,
  p_request_type text,
  p_items jsonb,
  p_notes text,
  p_client_tx_id text
) returns bigint
language plpgsql security definer set search_path=public as $$
declare
 v_id bigint;v_emp bigint;v_route public.inventory_supply_routes%rowtype;v record;
 v_c public.inventory_supply_catalog%rowtype;v_qty numeric(14,3);v_count integer:=0;
 v_frozen_items jsonb:='[]'::jsonb;
begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not public.has_action_permission_v2('inventory.supply.request.create') then raise exception 'ليس لديك صلاحية إنشاء طلب توريد';end if;
 if trim(coalesce(p_client_tx_id,''))='' then raise exception 'معرف العملية مطلوب';end if;
 if p_request_type not in ('normal','emergency') then raise exception 'نوع الطلب غير صحيح';end if;
 select * into v_route from public.inventory_supply_routes where id=p_route_id and active=true;
 if not found then raise exception 'مسار التوريد غير فعال';end if;
 if not public.has_branch_access(v_route.destination_branch_id) then raise exception 'ليس لديك صلاحية الفرع الطالب';end if;
 if p_request_type='emergency' and (not v_route.allow_emergency or not public.has_action_permission_v2('inventory.supply.request.emergency')) then raise exception 'الطلبات العاجلة غير مسموحة';end if;
 perform pg_advisory_xact_lock(hashtextextended('inventory-supply-request:'||p_client_tx_id,0));
 select id into v_id from public.inventory_supply_requests where client_tx_id=p_client_tx_id;
 if v_id is not null then return v_id;end if;
 v_emp:=public.current_employee_id();

 -- Point 4 #42: validate and freeze every request line before the workflow barrier
 -- and before the first durable request write.
 for v in select * from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) as x(catalog_item_id bigint,quantity numeric,line_note text)
 loop
   select * into v_c from public.inventory_supply_catalog where id=v.catalog_item_id and route_id=v_route.id and active=true;
   if not found then raise exception 'الصنف % غير متاح لهذا الفرع',v.catalog_item_id;end if;
   v_qty:=round(coalesce(v.quantity,0),3);
   if v_qty<=0 then raise exception 'كمية الطلب غير صحيحة';end if;
   if v_qty<v_c.min_request_qty then raise exception 'الكمية أقل من الحد الأدنى للصنف %',v.catalog_item_id;end if;
   if v_c.max_request_qty is not null and v_qty>v_c.max_request_qty then raise exception 'الكمية أكبر من الحد الأقصى للصنف %',v.catalog_item_id;end if;
   if v_c.request_multiple>0 and abs((v_qty/v_c.request_multiple)-round(v_qty/v_c.request_multiple))>0.0001 then raise exception 'الكمية لا تطابق مضاعف الطلب للصنف %',v.catalog_item_id;end if;
   v_frozen_items:=v_frozen_items||jsonb_build_array(jsonb_build_object(
     'catalog_item_id',v_c.id,'item_type',v_c.item_type,'product_id',v_c.product_id,
     'ingredient_id',v_c.ingredient_id,'quantity_requested',v_qty,
     'line_note',nullif(trim(coalesce(v.line_note,'')),'')
   ));
   v_count:=v_count+1;
 end loop;
 if v_count=0 then raise exception 'اختر صنفًا واحدًا على الأقل';end if;

 perform public.inventory_stock_assert_document_workflow_allowed_v2(
   'inventory_supply_request_create_v1(bigint,text,jsonb,text,text)'
 );

 insert into public.inventory_supply_requests(route_id,source_location_id,destination_branch_id,request_type,notes,client_tx_id,created_by_employee_id)
 values(v_route.id,v_route.source_location_id,v_route.destination_branch_id,p_request_type,nullif(trim(coalesce(p_notes,'')),''),p_client_tx_id,v_emp)
 returning id into v_id;

 insert into public.inventory_supply_request_items(
   request_id,catalog_item_id,item_type,product_id,ingredient_id,quantity_requested,line_note
 )
 select v_id,x.catalog_item_id,x.item_type,x.product_id,x.ingredient_id,x.quantity_requested,x.line_note
 from jsonb_to_recordset(v_frozen_items) as x(
   catalog_item_id bigint,item_type text,product_id bigint,ingredient_id bigint,
   quantity_requested numeric,line_note text
 );

 insert into public.inventory_supply_request_events(request_id,from_status,to_status,note,employee_id,details)
 values(v_id,null,'draft','تم إنشاء الطلب',v_emp,jsonb_build_object('request_type',p_request_type,'items',v_count));
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(v_emp,v_route.destination_branch_id,'inventory.supply.request.create','inventory_supply_request',v_id,jsonb_build_object('route_id',p_route_id,'request_type',p_request_type,'items',v_count));
 return v_id;
end$$;

CREATE OR REPLACE FUNCTION public.inventory_supply_request_submit_v1(p_request_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_q public.inventory_supply_requests%rowtype;v_emp bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not public.has_action_permission_v2('inventory.supply.request.submit') then raise exception 'ليس لديك صلاحية إرسال طلب التوريد';end if;
 select * into v_q from public.inventory_supply_requests where id=p_request_id for update;
 if not found then raise exception 'طلب التوريد غير موجود';end if;
 if not public.has_branch_access(v_q.destination_branch_id) then raise exception 'ليس لديك صلاحية الفرع الطالب';end if;
 if v_q.status='submitted' then return v_q.id;end if;
 if v_q.status<>'draft' then raise exception 'لا يمكن إرسال الطلب في حالته الحالية';end if;
 v_emp:=public.current_employee_id();
 perform public.inventory_stock_assert_document_workflow_allowed_v2('inventory_supply_request_submit_v1(bigint)');
 update public.inventory_supply_requests set status='submitted',submitted_by_employee_id=v_emp,submitted_at=now(),updated_at=now() where id=v_q.id;
 insert into public.inventory_supply_request_events(request_id,from_status,to_status,note,employee_id) values(v_q.id,'draft','submitted','تم إرسال الطلب للمخزن',v_emp);
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(v_emp,v_q.destination_branch_id,'inventory.supply.request.submit','inventory_supply_request',v_q.id,jsonb_build_object('source_location_id',v_q.source_location_id));
 return v_q.id;
end;
$function$

create or replace function public.inventory_supply_request_decide_v1(
  p_request_id bigint,
  p_approve boolean,
  p_approved_items jsonb,
  p_note text
) returns bigint language plpgsql security definer set search_path=public as $$
declare
  v_q public.inventory_supply_requests%rowtype;v_emp bigint;v record;v_qty numeric(14,3);v_seen integer:=0;
  v_i public.inventory_supply_request_items%rowtype;v_stock numeric(14,3);v_other_reserved numeric(14,3);
begin
  if auth.uid() is null then raise exception 'غير مصرح';end if;
  if not public.has_action_permission_v2('inventory.supply.request.approve') then raise exception 'ليس لديك صلاحية اعتماد طلبات التوريد';end if;
  select * into v_q from public.inventory_supply_requests where id=p_request_id for update;
  if not found then raise exception 'طلب التوريد غير موجود';end if;
  if not public.has_branch_access(v_q.source_location_id) then raise exception 'ليس لديك صلاحية المخزن المصدر';end if;
  if v_q.status in ('approved','rejected') then return v_q.id;end if;
  if v_q.status<>'submitted' then raise exception 'الطلب غير جاهز للاعتماد';end if;
  v_emp:=public.current_employee_id();
  perform public.inventory_stock_assert_document_workflow_allowed_v2(
    'inventory_supply_request_decide_v1(bigint,boolean,jsonb,text)'
  );
  if coalesce(p_approve,false)=false then
    update public.inventory_supply_request_items set quantity_reserved=0 where request_id=v_q.id;
    update public.inventory_supply_requests set status='rejected',decision_note=nullif(trim(coalesce(p_note,'')),''),decided_by_employee_id=v_emp,decided_at=now(),updated_at=now() where id=v_q.id;
    insert into public.inventory_supply_request_events(request_id,from_status,to_status,note,employee_id) values(v_q.id,'submitted','rejected',nullif(trim(coalesce(p_note,'')),''),v_emp);
  else
    update public.inventory_supply_request_items set quantity_approved=quantity_requested,quantity_reserved=0 where request_id=v_q.id;
    if jsonb_typeof(coalesce(p_approved_items,'[]'::jsonb))='array' and jsonb_array_length(coalesce(p_approved_items,'[]'::jsonb))>0 then
      update public.inventory_supply_request_items set quantity_approved=0 where request_id=v_q.id;
      for v in select * from jsonb_to_recordset(p_approved_items) as x(item_id bigint,quantity numeric)
      loop
        v_qty:=round(coalesce(v.quantity,0),3);
        if v_qty<0 then raise exception 'كمية الاعتماد غير صحيحة';end if;
        update public.inventory_supply_request_items set quantity_approved=least(v_qty,quantity_requested) where id=v.item_id and request_id=v_q.id;
        if found then v_seen:=v_seen+1;end if;
      end loop;
      if v_seen=0 then raise exception 'بنود الاعتماد غير صحيحة';end if;
    end if;
    if not exists(select 1 from public.inventory_supply_request_items where request_id=v_q.id and quantity_approved>0) then raise exception 'لا توجد كمية معتمدة';end if;

    for v_i in select * from public.inventory_supply_request_items where request_id=v_q.id and quantity_approved>0 order by id for update
    loop
      if v_i.item_type='product' then
        select b.quantity into v_stock from public.retail_inventory_balances b
         where b.branch_id=v_q.source_location_id and b.product_id=v_i.product_id and b.track_inventory=true for update;
        if not found then raise exception 'لا يوجد مخزون متتبع للصنف % في المخزن المصدر',v_i.product_id;end if;
        select coalesce(sum(i.quantity_reserved),0) into v_other_reserved
        from public.inventory_supply_request_items i join public.inventory_supply_requests q on q.id=i.request_id
        where q.source_location_id=v_q.source_location_id and q.id<>v_q.id and q.status in ('approved','preparing')
          and i.item_type='product' and i.product_id=v_i.product_id;
      else
        select s.quantity into v_stock from public.ingredient_stock s
         where s.branch_id=v_q.source_location_id and s.ingredient_id=v_i.ingredient_id for update;
        if not found then raise exception 'لا يوجد مخزون للخامة % في المخزن المصدر',v_i.ingredient_id;end if;
        select coalesce(sum(i.quantity_reserved),0) into v_other_reserved
        from public.inventory_supply_request_items i join public.inventory_supply_requests q on q.id=i.request_id
        where q.source_location_id=v_q.source_location_id and q.id<>v_q.id and q.status in ('approved','preparing')
          and i.item_type='ingredient' and i.ingredient_id=v_i.ingredient_id;
      end if;
      if coalesce(v_stock,0)-coalesce(v_other_reserved,0)<v_i.quantity_approved then
        raise exception 'المتاح بعد الحجوزات غير كافٍ للبند % (متاح %، مطلوب %)',v_i.id,round(greatest(coalesce(v_stock,0)-coalesce(v_other_reserved,0),0),3),v_i.quantity_approved;
      end if;
      update public.inventory_supply_request_items set quantity_reserved=quantity_approved where id=v_i.id;
    end loop;

    update public.inventory_supply_requests set status='approved',decision_note=nullif(trim(coalesce(p_note,'')),''),decided_by_employee_id=v_emp,decided_at=now(),updated_at=now() where id=v_q.id;
    insert into public.inventory_supply_request_events(request_id,from_status,to_status,note,employee_id,details)
    values(v_q.id,'submitted','approved',nullif(trim(coalesce(p_note,'')),''),v_emp,
      jsonb_build_object('reservation','created'));
  end if;
  insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
  values(v_emp,v_q.source_location_id,case when coalesce(p_approve,false) then 'inventory.supply.request.approve' else 'inventory.supply.request.reject' end,
    'inventory_supply_request',v_q.id,jsonb_build_object('destination_branch_id',v_q.destination_branch_id,'reservation',coalesce(p_approve,false)));
  return v_q.id;
end$$;

CREATE OR REPLACE FUNCTION public.inventory_supply_request_cancel_v1(p_request_id bigint, p_note text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_q public.inventory_supply_requests%rowtype;v_emp bigint;v_can boolean:=false;
begin
  if auth.uid() is null then raise exception 'غير مصرح';end if;
  select * into v_q from public.inventory_supply_requests where id=p_request_id for update;
  if not found then raise exception 'طلب التوريد غير موجود';end if;
  if v_q.status='cancelled' then return v_q.id;end if;
  if v_q.status not in ('draft','submitted','approved','preparing') then raise exception 'لا يمكن إلغاء الطلب بعد الصرف';end if;
  if exists(select 1 from public.inventory_supply_request_items where request_id=v_q.id and quantity_dispatched>0) then raise exception 'لا يمكن إلغاء طلب تم صرف جزء منه';end if;
  if v_q.status in ('draft','submitted') then
    v_can:=public.has_branch_access(v_q.destination_branch_id) and public.has_action_permission_v2('inventory.supply.request.create');
  else
    v_can:=public.has_branch_access(v_q.source_location_id) and public.has_action_permission_v2('inventory.supply.request.approve');
  end if;
  if not v_can then raise exception 'ليس لديك صلاحية إلغاء الطلب في حالته الحالية';end if;
  v_emp:=public.current_employee_id();
  perform public.inventory_stock_assert_document_workflow_allowed_v2('inventory_supply_request_cancel_v1(bigint,text)');
  update public.inventory_supply_request_items set quantity_reserved=0 where request_id=v_q.id;
  update public.inventory_supply_requests set status='cancelled',decision_note=nullif(trim(coalesce(p_note,'')),''),updated_at=now() where id=v_q.id;
  insert into public.inventory_supply_request_events(request_id,from_status,to_status,note,employee_id,details)
  values(v_q.id,v_q.status,'cancelled',nullif(trim(coalesce(p_note,'')),''),v_emp,jsonb_build_object('reservation_released',true));
  insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
  values(v_emp,case when v_q.status in ('approved','preparing') then v_q.source_location_id else v_q.destination_branch_id end,
    'inventory.supply.request.cancel','inventory_supply_request',v_q.id,jsonb_build_object('from_status',v_q.status,'reservation_released',true));
  return v_q.id;
end;
$function$

-- inventory_supply_request_prepare_v1(bigint,text)

grant execute on function public.inventory_supply_route_upsert_v1(bigint,bigint,bigint,time,integer,boolean,text,boolean) to authenticated;
grant execute on function public.inventory_supply_catalog_upsert_v1(bigint,bigint,text,bigint,text,numeric,numeric,numeric,numeric,integer,text,boolean) to authenticated;
grant execute on function public.inventory_supply_request_create_v1(bigint,text,jsonb,text,text) to authenticated;
grant execute on function public.inventory_supply_request_submit_v1(bigint) to authenticated;
grant execute on function public.inventory_supply_request_decide_v1(bigint,boolean,jsonb,text) to authenticated;
grant execute on function public.inventory_supply_request_cancel_v1(bigint,text) to authenticated;

commit;
