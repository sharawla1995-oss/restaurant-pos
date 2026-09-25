-- Sharawla POS — Beta55 Branch Request Read Model V2
-- Permission-aware branch replenishment catalog with open/in-transit quantities,
-- smart suggested quantity, and source-stock visibility masking.

begin;

create or replace function public.inventory_supply_branch_catalog_v2(p_route_id bigint)
returns table(
  catalog_item_id bigint,
  route_id bigint,
  source_location_id bigint,
  destination_branch_id bigint,
  item_type text,
  product_id bigint,
  ingredient_id bigint,
  item_name text,
  request_unit_code text,
  min_request_qty numeric,
  max_request_qty numeric,
  request_multiple numeric,
  reorder_min_qty numeric,
  target_stock_qty numeric,
  destination_quantity numeric,
  open_committed_qty numeric,
  in_transit_qty numeric,
  effective_stock_qty numeric,
  suggested_qty numeric,
  source_quantity numeric,
  source_visibility text,
  source_availability text,
  cutoff_time time,
  lead_time_days integer,
  allow_emergency boolean
)
language plpgsql stable security definer set search_path=public as $$
declare v_route public.inventory_supply_routes%rowtype;
begin
  if auth.uid() is null then raise exception 'غير مصرح';end if;
  if not public.has_action_permission_v2('inventory.supply.view') then raise exception 'ليس لديك صلاحية عرض التوريد الداخلي';end if;
  select * into v_route from public.inventory_supply_routes where id=p_route_id and active=true;
  if not found then raise exception 'مسار التوريد غير فعال';end if;
  if not public.has_branch_access(v_route.destination_branch_id) and not public.has_branch_access(v_route.source_location_id) then raise exception 'ليس لديك صلاحية هذا المسار';end if;

  return query
  with p as (
    select i.catalog_item_id,
      sum(case
        when q.status='submitted' then greatest(i.quantity_requested,0)
        when q.status in ('approved','preparing') then greatest(i.quantity_approved-i.quantity_dispatched,0)
        else 0 end)::numeric as open_qty,
      sum(case when q.status in ('in_transit','partially_received')
        then greatest(i.quantity_dispatched-i.quantity_received-i.quantity_damaged-i.quantity_shortage,0)
        else 0 end)::numeric as transit_qty
    from public.inventory_supply_requests q
    join public.inventory_supply_request_items i on i.request_id=q.id
    where q.route_id=p_route_id and q.status in ('submitted','approved','preparing','in_transit','partially_received')
    group by i.catalog_item_id
  ), b as (
    select
      c.id as catalog_item_id,c.route_id,r.source_location_id,r.destination_branch_id,
      c.item_type,c.product_id,c.ingredient_id,
      case when c.item_type='product' then pr.name else ing.name end as item_name,
      coalesce(c.request_unit_code,case when c.item_type='ingredient' then ing.base_unit_code else null end) as request_unit_code,
      c.min_request_qty::numeric,c.max_request_qty::numeric,c.request_multiple::numeric,
      c.reorder_min_qty::numeric,
      coalesce(c.target_stock_qty,c.suggested_target_qty,c.reorder_min_qty)::numeric as target_stock_qty,
      case when c.item_type='product' then coalesce(db.quantity,0) else coalesce(ds.quantity,0) end::numeric as dest_qty,
      case when c.item_type='product' then coalesce(sb.quantity,0) else coalesce(ss.quantity,0) end::numeric as src_qty,
      coalesce(p.open_qty,0)::numeric as open_qty,coalesce(p.transit_qty,0)::numeric as transit_qty,
      r.cutoff_time,r.lead_time_days,r.allow_emergency
    from public.inventory_supply_catalog c
    join public.inventory_supply_routes r on r.id=c.route_id and r.active=true
    left join public.products pr on pr.id=c.product_id
    left join public.ingredients ing on ing.id=c.ingredient_id
    left join public.retail_inventory_balances sb on c.item_type='product' and sb.branch_id=r.source_location_id and sb.product_id=c.product_id
    left join public.retail_inventory_balances db on c.item_type='product' and db.branch_id=r.destination_branch_id and db.product_id=c.product_id
    left join public.ingredient_stock ss on c.item_type='ingredient' and ss.branch_id=r.source_location_id and ss.ingredient_id=c.ingredient_id
    left join public.ingredient_stock ds on c.item_type='ingredient' and ds.branch_id=r.destination_branch_id and ds.ingredient_id=c.ingredient_id
    left join p on p.catalog_item_id=c.id
    where c.route_id=p_route_id and c.active=true
  ), c as (
    select b.*,(b.dest_qty+b.open_qty+b.transit_qty)::numeric as effective_qty
    from b
  ), d as (
    select c.*,case when c.effective_qty<=c.reorder_min_qty then greatest(c.target_stock_qty-c.effective_qty,0) else 0 end::numeric as suggested
    from c
  )
  select
    d.catalog_item_id,d.route_id,d.source_location_id,d.destination_branch_id,d.item_type,d.product_id,d.ingredient_id,d.item_name,d.request_unit_code,
    round(d.min_request_qty,3),case when d.max_request_qty is null then null else round(d.max_request_qty,3) end,round(d.request_multiple,3),
    round(d.reorder_min_qty,3),round(d.target_stock_qty,3),round(d.dest_qty,3),round(d.open_qty,3),round(d.transit_qty,3),round(d.effective_qty,3),round(d.suggested,3),
    case when public.has_branch_access(d.source_location_id) or public.has_action_permission_v2('inventory.supply.stock.exact') then round(d.src_qty,3) else null end,
    case
      when public.has_branch_access(d.source_location_id) or public.has_action_permission_v2('inventory.supply.stock.exact') then 'exact'
      when public.has_action_permission_v2('inventory.supply.stock.availability') then 'availability'
      else 'hidden'
    end,
    case
      when not (public.has_branch_access(d.source_location_id) or public.has_action_permission_v2('inventory.supply.stock.exact') or public.has_action_permission_v2('inventory.supply.stock.availability')) then 'hidden'
      when d.src_qty<=0 then 'unavailable'
      when d.suggested>0 and d.src_qty<d.suggested then 'limited'
      else 'available'
    end,
    d.cutoff_time,d.lead_time_days,d.allow_emergency
  from d
  order by d.item_name,d.catalog_item_id;
end$$;

grant execute on function public.inventory_supply_branch_catalog_v2(bigint) to authenticated;

commit;
