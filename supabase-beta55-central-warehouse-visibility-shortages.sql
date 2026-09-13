-- Sharawla POS — Beta55 Central Warehouse Visibility / Shortages / Reservation Safety
-- Sandbox-first additive migration for SH-0007.
-- Adds permission-driven source-stock visibility, central shortages reporting,
-- direct replenishment request creation from shortages, approval reservations,
-- and cancellation reservation release. No production identifiers are embedded.

begin;

insert into public.permission_actions_v2(code,name_ar,domain,legacy_permission,active,sort_order)
values
 ('inventory.supply.stock.availability','عرض حالة توفر مخزون المصدر','inventory','inventory',true,1328),
 ('inventory.supply.stock.exact','عرض الكمية الدقيقة لمخزون المصدر','inventory',null,true,1329),
 ('inventory.supply.shortages.view','عرض تقرير نواقص الفروع','inventory','inventory',true,1330),
 ('inventory.supply.shortages.create','إنشاء توريد من تقرير النواقص','inventory','inventory',true,1331)
on conflict(code) do update set
 name_ar=excluded.name_ar,
 domain=excluded.domain,
 legacy_permission=excluded.legacy_permission,
 active=excluded.active,
 sort_order=excluded.sort_order;

alter table public.inventory_supply_catalog
  add column if not exists reorder_min_qty numeric(14,3) not null default 0,
  add column if not exists target_stock_qty numeric(14,3);

alter table public.inventory_supply_catalog
  drop constraint if exists inventory_supply_catalog_reorder_min_check,
  add constraint inventory_supply_catalog_reorder_min_check check (reorder_min_qty >= 0),
  drop constraint if exists inventory_supply_catalog_target_stock_check,
  add constraint inventory_supply_catalog_target_stock_check check (target_stock_qty is null or target_stock_qty >= reorder_min_qty);

update public.inventory_supply_catalog
set target_stock_qty=coalesce(target_stock_qty,suggested_target_qty)
where target_stock_qty is null and suggested_target_qty is not null;

alter table public.inventory_supply_request_items
  add column if not exists quantity_reserved numeric(14,3) not null default 0;

alter table public.inventory_supply_request_items
  drop constraint if exists inventory_supply_request_items_reserved_check,
  add constraint inventory_supply_request_items_reserved_check check (quantity_reserved >= 0);

create or replace function public.inventory_supply_catalog_policy_set_v1(
  p_catalog_item_id bigint,
  p_reorder_min_qty numeric,
  p_target_stock_qty numeric
) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_row public.inventory_supply_catalog%rowtype;v_emp bigint;v_source bigint;v_dest bigint;
begin
  if auth.uid() is null then raise exception 'غير مصرح';end if;
  if not public.has_action_permission_v2('inventory.supply.configure') then raise exception 'ليس لديك صلاحية إعداد التوريد الداخلي';end if;
  select c.* into v_row from public.inventory_supply_catalog c where c.id=p_catalog_item_id for update;
  if not found then raise exception 'صنف التوريد غير موجود';end if;
  select r.source_location_id,r.destination_branch_id into v_source,v_dest from public.inventory_supply_routes r where r.id=v_row.route_id;
  if not public.has_branch_access(v_source) and not public.has_branch_access(v_dest) then raise exception 'ليس لديك صلاحية هذا المسار';end if;
  if coalesce(p_reorder_min_qty,0)<0 then raise exception 'حد النقص غير صحيح';end if;
  if p_target_stock_qty is not null and p_target_stock_qty<coalesce(p_reorder_min_qty,0) then raise exception 'المخزون المستهدف يجب أن يساوي أو يتجاوز حد النقص';end if;
  update public.inventory_supply_catalog
     set reorder_min_qty=round(coalesce(p_reorder_min_qty,0),3),
         target_stock_qty=case when p_target_stock_qty is null then null else round(p_target_stock_qty,3) end,
         suggested_target_qty=case when p_target_stock_qty is null then suggested_target_qty else round(p_target_stock_qty,3) end,
         updated_at=now()
   where id=p_catalog_item_id;
  v_emp:=public.current_employee_id();
  insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
  values(v_emp,v_source,'inventory.supply.catalog.policy.set','inventory_supply_catalog',p_catalog_item_id,
    jsonb_build_object('destination_branch_id',v_dest,'reorder_min_qty',round(coalesce(p_reorder_min_qty,0),3),'target_stock_qty',p_target_stock_qty));
  return p_catalog_item_id;
end$$;

grant execute on function public.inventory_supply_catalog_policy_set_v1(bigint,numeric,numeric) to authenticated;

drop view if exists public.inventory_supply_catalog_live_v1;
create view public.inventory_supply_catalog_live_v1
with (security_barrier=true) as
with base as (
  select
    c.id as catalog_item_id,
    c.route_id,
    r.source_location_id,
    r.destination_branch_id,
    r.cutoff_time,
    r.lead_time_days,
    r.allow_emergency,
    c.item_type,
    c.product_id,
    c.ingredient_id,
    case when c.item_type='product' then p.name else i.name end as item_name,
    coalesce(c.request_unit_code,case when c.item_type='ingredient' then i.base_unit_code else null end) as request_unit_code,
    c.min_request_qty,
    c.max_request_qty,
    c.request_multiple,
    c.suggested_target_qty,
    c.reorder_min_qty,
    coalesce(c.target_stock_qty,c.suggested_target_qty,c.reorder_min_qty)::numeric(14,3) as target_stock_qty,
    case when c.item_type='product' then coalesce(srcp.quantity,0) else coalesce(srci.quantity,0) end::numeric(14,3) as raw_source_quantity,
    case when c.item_type='product' then coalesce(dstp.quantity,0) else coalesce(dsti.quantity,0) end::numeric(14,3) as destination_quantity,
    c.sort_order,
    c.notes
  from public.inventory_supply_catalog c
  join public.inventory_supply_routes r on r.id=c.route_id and r.active=true
  left join public.products p on p.id=c.product_id
  left join public.ingredients i on i.id=c.ingredient_id
  left join public.retail_inventory_balances srcp
    on c.item_type='product' and srcp.branch_id=r.source_location_id and srcp.product_id=c.product_id
  left join public.retail_inventory_balances dstp
    on c.item_type='product' and dstp.branch_id=r.destination_branch_id and dstp.product_id=c.product_id
  left join public.ingredient_stock srci
    on c.item_type='ingredient' and srci.branch_id=r.source_location_id and srci.ingredient_id=c.ingredient_id
  left join public.ingredient_stock dsti
    on c.item_type='ingredient' and dsti.branch_id=r.destination_branch_id and dsti.ingredient_id=c.ingredient_id
  where c.active=true
    and public.has_action_permission_v2('inventory.supply.view')
    and (public.has_branch_access(r.source_location_id) or public.has_branch_access(r.destination_branch_id))
)
select
  b.catalog_item_id,b.route_id,b.source_location_id,b.destination_branch_id,b.cutoff_time,b.lead_time_days,b.allow_emergency,
  b.item_type,b.product_id,b.ingredient_id,b.item_name,b.request_unit_code,
  b.min_request_qty,b.max_request_qty,b.request_multiple,b.suggested_target_qty,
  case when public.has_branch_access(b.source_location_id) or public.has_action_permission_v2('inventory.supply.stock.exact') then b.raw_source_quantity else null end::numeric(14,3) as source_quantity,
  b.destination_quantity,b.sort_order,b.notes,
  b.reorder_min_qty,b.target_stock_qty,
  case
    when public.has_branch_access(b.source_location_id) or public.has_action_permission_v2('inventory.supply.stock.exact') then 'exact'
    when public.has_action_permission_v2('inventory.supply.stock.availability') then 'availability'
    else 'hidden'
  end::text as source_visibility,
  case
    when not (public.has_branch_access(b.source_location_id) or public.has_action_permission_v2('inventory.supply.stock.exact') or public.has_action_permission_v2('inventory.supply.stock.availability')) then 'hidden'
    when b.raw_source_quantity<=0 then 'unavailable'
    when greatest(b.target_stock_qty-b.destination_quantity,0)>0 and b.raw_source_quantity<greatest(b.target_stock_qty-b.destination_quantity,0) then 'limited'
    else 'available'
  end::text as source_availability
from base b;

grant select on public.inventory_supply_catalog_live_v1 to authenticated;

create or replace function public.inventory_supply_shortages_v1(p_source_location_id bigint)
returns table(
  route_id bigint,
  source_location_id bigint,
  destination_branch_id bigint,
  destination_name text,
  catalog_item_id bigint,
  item_type text,
  item_id bigint,
  item_name text,
  request_unit_code text,
  branch_quantity numeric,
  reorder_min_qty numeric,
  target_stock_qty numeric,
  open_committed_qty numeric,
  in_transit_qty numeric,
  effective_stock_qty numeric,
  shortage_qty numeric,
  source_quantity numeric,
  source_reserved_qty numeric,
  source_available_qty numeric,
  internal_suggested_qty numeric,
  purchase_shortage_qty numeric,
  shortage_status text
)
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'غير مصرح';end if;
  if not public.has_action_permission_v2('inventory.supply.shortages.view') then raise exception 'ليس لديك صلاحية تقرير نواقص الفروع';end if;
  if not public.has_branch_access(p_source_location_id) then raise exception 'ليس لديك صلاحية المخزن الرئيسي';end if;
  if not exists(select 1 from public.branches b where b.id=p_source_location_id and b.active=true and b.location_type='central_warehouse') then raise exception 'الموقع ليس مخزنًا رئيسيًا فعالًا';end if;

  return query
  with catalog_base as (
    select
      r.id as route_id,r.source_location_id,r.destination_branch_id,d.name as destination_name,
      c.id as catalog_item_id,c.item_type,
      case when c.item_type='product' then c.product_id else c.ingredient_id end as item_id,
      case when c.item_type='product' then p.name else ing.name end as item_name,
      coalesce(c.request_unit_code,case when c.item_type='ingredient' then ing.base_unit_code else null end) as request_unit_code,
      case when c.item_type='product' then coalesce(db.quantity,0) else coalesce(ds.quantity,0) end::numeric as branch_quantity,
      c.reorder_min_qty::numeric as reorder_min_qty,
      coalesce(c.target_stock_qty,c.suggested_target_qty,c.reorder_min_qty)::numeric as target_stock_qty,
      case when c.item_type='product' then coalesce(sb.quantity,0) else coalesce(ss.quantity,0) end::numeric as source_quantity
    from public.inventory_supply_routes r
    join public.branches d on d.id=r.destination_branch_id and d.active=true
    join public.inventory_supply_catalog c on c.route_id=r.id and c.active=true
    left join public.products p on p.id=c.product_id
    left join public.ingredients ing on ing.id=c.ingredient_id
    left join public.retail_inventory_balances sb on c.item_type='product' and sb.branch_id=r.source_location_id and sb.product_id=c.product_id
    left join public.retail_inventory_balances db on c.item_type='product' and db.branch_id=r.destination_branch_id and db.product_id=c.product_id
    left join public.ingredient_stock ss on c.item_type='ingredient' and ss.branch_id=r.source_location_id and ss.ingredient_id=c.ingredient_id
    left join public.ingredient_stock ds on c.item_type='ingredient' and ds.branch_id=r.destination_branch_id and ds.ingredient_id=c.ingredient_id
    where r.active=true and r.source_location_id=p_source_location_id
  ), pipeline as (
    select
      q.route_id,i.catalog_item_id,
      sum(case
        when q.status='submitted' then greatest(i.quantity_requested,0)
        when q.status in ('approved','preparing') then greatest(i.quantity_approved-i.quantity_dispatched,0)
        else 0 end)::numeric as open_committed_qty,
      sum(case when q.status in ('in_transit','partially_received')
        then greatest(i.quantity_dispatched-i.quantity_received-i.quantity_damaged-i.quantity_shortage,0)
        else 0 end)::numeric as in_transit_qty
    from public.inventory_supply_requests q
    join public.inventory_supply_request_items i on i.request_id=q.id
    where q.source_location_id=p_source_location_id
      and q.status in ('submitted','approved','preparing','in_transit','partially_received')
    group by q.route_id,i.catalog_item_id
  ), reserved as (
    select i.item_type,
           case when i.item_type='product' then i.product_id else i.ingredient_id end as item_id,
           sum(i.quantity_reserved)::numeric as reserved_qty
    from public.inventory_supply_requests q
    join public.inventory_supply_request_items i on i.request_id=q.id
    where q.source_location_id=p_source_location_id
      and q.status in ('approved','preparing')
      and i.quantity_reserved>0
    group by i.item_type,case when i.item_type='product' then i.product_id else i.ingredient_id end
  ), calc as (
    select c.*,
      coalesce(p.open_committed_qty,0)::numeric as open_committed_qty,
      coalesce(p.in_transit_qty,0)::numeric as in_transit_qty,
      coalesce(r.reserved_qty,0)::numeric as source_reserved_qty,
      (c.branch_quantity+coalesce(p.open_committed_qty,0)+coalesce(p.in_transit_qty,0))::numeric as effective_stock_qty
    from catalog_base c
    left join pipeline p on p.route_id=c.route_id and p.catalog_item_id=c.catalog_item_id
    left join reserved r on r.item_type=c.item_type and r.item_id=c.item_id
  ), calc2 as (
    select c.*,
      case when c.effective_stock_qty<=c.reorder_min_qty then greatest(c.target_stock_qty-c.effective_stock_qty,0) else 0 end::numeric as shortage_qty,
      greatest(c.source_quantity-c.source_reserved_qty,0)::numeric as source_available_qty
    from calc c
  )
  select
    c.route_id,c.source_location_id,c.destination_branch_id,c.destination_name,c.catalog_item_id,c.item_type,c.item_id,c.item_name,c.request_unit_code,
    round(c.branch_quantity,3),round(c.reorder_min_qty,3),round(c.target_stock_qty,3),
    round(c.open_committed_qty,3),round(c.in_transit_qty,3),round(c.effective_stock_qty,3),round(c.shortage_qty,3),
    round(c.source_quantity,3),round(c.source_reserved_qty,3),round(c.source_available_qty,3),
    round(least(c.shortage_qty,c.source_available_qty),3) as internal_suggested_qty,
    round(greatest(c.shortage_qty-c.source_available_qty,0),3) as purchase_shortage_qty,
    case
      when c.target_stock_qty>0 and c.effective_stock_qty<=0 then 'critical'
      when c.shortage_qty>0 then 'low'
      when c.target_stock_qty>0 and c.branch_quantity>c.target_stock_qty then 'overstock'
      else 'normal'
    end::text as shortage_status
  from calc2 c
  order by case when c.target_stock_qty>0 and c.effective_stock_qty<=0 then 0 when c.shortage_qty>0 then 1 else 2 end,
           c.destination_name,c.item_name;
end$$;

grant execute on function public.inventory_supply_shortages_v1(bigint) to authenticated;

create or replace function public.inventory_supply_shortage_request_create_v1(
  p_route_id bigint,
  p_items jsonb,
  p_notes text,
  p_client_tx_id text
) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_id bigint;v_emp bigint;v_route public.inventory_supply_routes%rowtype;v record;v_c public.inventory_supply_catalog%rowtype;v_qty numeric(14,3);v_count integer:=0;
begin
  if auth.uid() is null then raise exception 'غير مصرح';end if;
  if not public.has_action_permission_v2('inventory.supply.shortages.create') then raise exception 'ليس لديك صلاحية إنشاء توريد من تقرير النواقص';end if;
  if trim(coalesce(p_client_tx_id,''))='' then raise exception 'معرف العملية مطلوب';end if;
  select * into v_route from public.inventory_supply_routes where id=p_route_id and active=true;
  if not found then raise exception 'مسار التوريد غير فعال';end if;
  if not public.has_branch_access(v_route.source_location_id) then raise exception 'ليس لديك صلاحية المخزن المصدر';end if;
  perform pg_advisory_xact_lock(hashtextextended('inventory-supply-shortage-request:'||p_client_tx_id,0));
  select id into v_id from public.inventory_supply_requests where client_tx_id=p_client_tx_id;
  if v_id is not null then return v_id;end if;
  v_emp:=public.current_employee_id();
  insert into public.inventory_supply_requests(route_id,source_location_id,destination_branch_id,request_type,status,notes,client_tx_id,created_by_employee_id,submitted_by_employee_id,submitted_at)
  values(v_route.id,v_route.source_location_id,v_route.destination_branch_id,'normal','submitted',nullif(trim(coalesce(p_notes,'')),''),p_client_tx_id,v_emp,v_emp,now()) returning id into v_id;
  for v in select * from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) as x(catalog_item_id bigint,quantity numeric,line_note text)
  loop
    select * into v_c from public.inventory_supply_catalog where id=v.catalog_item_id and route_id=v_route.id and active=true;
    if not found then raise exception 'الصنف % غير متاح لهذا الفرع',v.catalog_item_id;end if;
    v_qty:=round(coalesce(v.quantity,0),3);
    if v_qty<=0 then raise exception 'كمية الطلب غير صحيحة';end if;
    if v_qty<v_c.min_request_qty then raise exception 'الكمية أقل من الحد الأدنى للصنف %',v.catalog_item_id;end if;
    if v_c.max_request_qty is not null and v_qty>v_c.max_request_qty then raise exception 'الكمية أكبر من الحد الأقصى للصنف %',v.catalog_item_id;end if;
    if v_c.request_multiple>0 and abs((v_qty/v_c.request_multiple)-round(v_qty/v_c.request_multiple))>0.0001 then raise exception 'الكمية لا تطابق مضاعف الطلب للصنف %',v.catalog_item_id;end if;
    insert into public.inventory_supply_request_items(request_id,catalog_item_id,item_type,product_id,ingredient_id,quantity_requested,line_note)
    values(v_id,v_c.id,v_c.item_type,v_c.product_id,v_c.ingredient_id,v_qty,nullif(trim(coalesce(v.line_note,'')),''));
    v_count:=v_count+1;
  end loop;
  if v_count=0 then raise exception 'اختر صنفًا واحدًا على الأقل';end if;
  insert into public.inventory_supply_request_events(request_id,from_status,to_status,note,employee_id,details)
  values(v_id,null,'submitted','تم إنشاء الطلب من تقرير نواقص الفروع',v_emp,jsonb_build_object('source','shortages_report','items',v_count));
  insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
  values(v_emp,v_route.source_location_id,'inventory.supply.shortages.create_request','inventory_supply_request',v_id,
    jsonb_build_object('destination_branch_id',v_route.destination_branch_id,'items',v_count));
  return v_id;
end$$;

grant execute on function public.inventory_supply_shortage_request_create_v1(bigint,jsonb,text,text) to authenticated;

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

grant execute on function public.inventory_supply_request_decide_v1(bigint,boolean,jsonb,text) to authenticated;

create or replace function public.inventory_supply_release_reservation_on_dispatch_v1()
returns trigger language plpgsql as $$
begin
  if NEW.quantity_dispatched is distinct from OLD.quantity_dispatched
     or NEW.quantity_backordered is distinct from OLD.quantity_backordered then
    NEW.quantity_reserved:=0;
  end if;
  return NEW;
end$$;

drop trigger if exists inventory_supply_release_reservation_on_dispatch_v1 on public.inventory_supply_request_items;
create trigger inventory_supply_release_reservation_on_dispatch_v1
before update of quantity_dispatched,quantity_backordered on public.inventory_supply_request_items
for each row execute function public.inventory_supply_release_reservation_on_dispatch_v1();

create or replace function public.inventory_supply_request_cancel_v1(p_request_id bigint,p_note text)
returns bigint language plpgsql security definer set search_path=public as $$
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
  update public.inventory_supply_request_items set quantity_reserved=0 where request_id=v_q.id;
  update public.inventory_supply_requests set status='cancelled',decision_note=nullif(trim(coalesce(p_note,'')),''),updated_at=now() where id=v_q.id;
  insert into public.inventory_supply_request_events(request_id,from_status,to_status,note,employee_id,details)
  values(v_q.id,v_q.status,'cancelled',nullif(trim(coalesce(p_note,'')),''),v_emp,jsonb_build_object('reservation_released',true));
  insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
  values(v_emp,case when v_q.status in ('approved','preparing') then v_q.source_location_id else v_q.destination_branch_id end,
    'inventory.supply.request.cancel','inventory_supply_request',v_q.id,jsonb_build_object('from_status',v_q.status,'reservation_released',true));
  return v_q.id;
end$$;

grant execute on function public.inventory_supply_request_cancel_v1(bigint,text) to authenticated;

commit;
