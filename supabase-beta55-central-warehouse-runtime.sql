-- Sharawla POS — Beta55 Central Warehouse Runtime Support
-- Additive follow-up to supabase-beta55-central-warehouse-foundation.sql.

begin;

-- Ensure the live catalog view runs with caller privileges/RLS semantics.
drop view if exists public.inventory_supply_catalog_live_v1;
create view public.inventory_supply_catalog_live_v1
with (security_invoker=true) as
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
  case when c.item_type='product' then coalesce(srcp.quantity,0) else coalesce(srci.quantity,0) end::numeric(14,3) as source_quantity,
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
where c.active=true;

grant select on public.inventory_supply_catalog_live_v1 to authenticated;

create or replace function public.inventory_location_set_type_v1(
  p_branch_id bigint,
  p_location_type text,
  p_location_code text
) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_emp bigint;v_old text;
begin
  if auth.uid() is null then raise exception 'غير مصرح';end if;
  if not public.has_action_permission_v2('inventory.supply.configure') then raise exception 'ليس لديك صلاحية إعداد المواقع والمخازن';end if;
  if p_location_type not in ('branch','central_warehouse') then raise exception 'نوع الموقع غير صحيح';end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية هذا الموقع';end if;
  select location_type into v_old from public.branches where id=p_branch_id for update;
  if not found then raise exception 'الموقع غير موجود';end if;
  v_emp:=public.current_employee_id();
  update public.branches
     set location_type=p_location_type,
         location_code=nullif(trim(coalesce(p_location_code,'')),''),
         website_visible=case when p_location_type='central_warehouse' then false else website_visible end
   where id=p_branch_id;
  insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
  values(v_emp,p_branch_id,'inventory.location.type.set','branch',p_branch_id,
    jsonb_build_object('from',v_old,'to',p_location_type,'location_code',nullif(trim(coalesce(p_location_code,'')),'')));
  return p_branch_id;
end$$;

grant execute on function public.inventory_location_set_type_v1(bigint,text,text) to authenticated;

-- Read helper for the current user's supply routes. Kept as SECURITY INVOKER so
-- normal branch RLS and action permissions remain authoritative.
create or replace function public.inventory_supply_my_routes_v1()
returns table(
  route_id bigint,
  source_location_id bigint,
  source_name text,
  destination_branch_id bigint,
  destination_name text,
  cutoff_time time,
  lead_time_days integer,
  allow_emergency boolean,
  active boolean
)
language sql stable security invoker set search_path=public as $$
  select r.id,r.source_location_id,src.name,r.destination_branch_id,dst.name,
         r.cutoff_time,r.lead_time_days,r.allow_emergency,r.active
  from public.inventory_supply_routes r
  join public.branches src on src.id=r.source_location_id
  join public.branches dst on dst.id=r.destination_branch_id
  where public.has_action_permission_v2('inventory.supply.view')
    and (public.has_branch_access(r.source_location_id) or public.has_branch_access(r.destination_branch_id))
  order by dst.name,src.name,r.id
$$;

grant execute on function public.inventory_supply_my_routes_v1() to authenticated;

commit;
