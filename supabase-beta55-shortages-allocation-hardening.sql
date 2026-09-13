-- Sharawla POS — Beta55 Shortages Allocation Hardening
-- Allocates one central warehouse's available stock once across linked branch
-- shortages, so aggregate internal and external purchase suggestions do not
-- double-count the same source quantity.

begin;

create or replace function public.inventory_supply_shortages_v1(p_source_location_id bigint)
returns table(
  route_id bigint, source_location_id bigint, destination_branch_id bigint, destination_name text,
  catalog_item_id bigint, item_type text, item_id bigint, item_name text, request_unit_code text,
  branch_quantity numeric, reorder_min_qty numeric, target_stock_qty numeric,
  open_committed_qty numeric, in_transit_qty numeric, effective_stock_qty numeric, shortage_qty numeric,
  source_quantity numeric, source_reserved_qty numeric, source_available_qty numeric,
  internal_suggested_qty numeric, purchase_shortage_qty numeric, shortage_status text
)
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'غير مصرح';end if;
  if not public.has_action_permission_v2('inventory.supply.shortages.view') then raise exception 'ليس لديك صلاحية تقرير نواقص الفروع';end if;
  if not public.has_branch_access(p_source_location_id) then raise exception 'ليس لديك صلاحية المخزن الرئيسي';end if;
  if not exists(select 1 from public.branches b where b.id=p_source_location_id and b.active=true and b.location_type='central_warehouse') then raise exception 'الموقع ليس مخزنًا رئيسيًا فعالًا';end if;

  return query
  with catalog_base as (
    select r.id route_id,r.source_location_id,r.destination_branch_id,d.name destination_name,
      c.id catalog_item_id,c.item_type,
      case when c.item_type='product' then c.product_id else c.ingredient_id end item_id,
      case when c.item_type='product' then p.name else ing.name end item_name,
      coalesce(c.request_unit_code,case when c.item_type='ingredient' then ing.base_unit_code else null end) request_unit_code,
      case when c.item_type='product' then coalesce(db.quantity,0) else coalesce(ds.quantity,0) end::numeric branch_quantity,
      c.reorder_min_qty::numeric reorder_min_qty,
      coalesce(c.target_stock_qty,c.suggested_target_qty,c.reorder_min_qty)::numeric target_stock_qty,
      case when c.item_type='product' then coalesce(sb.quantity,0) else coalesce(ss.quantity,0) end::numeric source_quantity
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
    select q.route_id,i.catalog_item_id,
      sum(case when q.status='submitted' then greatest(i.quantity_requested,0)
               when q.status in ('approved','preparing') then greatest(i.quantity_approved-i.quantity_dispatched,0)
               else 0 end)::numeric open_committed_qty,
      sum(case when q.status in ('in_transit','partially_received')
               then greatest(i.quantity_dispatched-i.quantity_received-i.quantity_damaged-i.quantity_shortage,0)
               else 0 end)::numeric in_transit_qty
    from public.inventory_supply_requests q
    join public.inventory_supply_request_items i on i.request_id=q.id
    where q.source_location_id=p_source_location_id
      and q.status in ('submitted','approved','preparing','in_transit','partially_received')
    group by q.route_id,i.catalog_item_id
  ), reserved as (
    select i.item_type,case when i.item_type='product' then i.product_id else i.ingredient_id end item_id,
           sum(i.quantity_reserved)::numeric reserved_qty
    from public.inventory_supply_requests q
    join public.inventory_supply_request_items i on i.request_id=q.id
    where q.source_location_id=p_source_location_id and q.status in ('approved','preparing') and i.quantity_reserved>0
    group by i.item_type,case when i.item_type='product' then i.product_id else i.ingredient_id end
  ), calc as (
    select c.*,coalesce(p.open_committed_qty,0)::numeric open_committed_qty,
      coalesce(p.in_transit_qty,0)::numeric in_transit_qty,coalesce(r.reserved_qty,0)::numeric source_reserved_qty,
      (c.branch_quantity+coalesce(p.open_committed_qty,0)+coalesce(p.in_transit_qty,0))::numeric effective_stock_qty
    from catalog_base c
    left join pipeline p on p.route_id=c.route_id and p.catalog_item_id=c.catalog_item_id
    left join reserved r on r.item_type=c.item_type and r.item_id=c.item_id
  ), shortage as (
    select c.*,
      case when c.effective_stock_qty<=c.reorder_min_qty then greatest(c.target_stock_qty-c.effective_stock_qty,0) else 0 end::numeric shortage_qty,
      greatest(c.source_quantity-c.source_reserved_qty,0)::numeric source_available_qty
    from calc c
  ), allocated as (
    select s.*,
      coalesce(sum(s.shortage_qty) over (
        partition by s.item_type,s.item_id
        order by s.destination_branch_id,s.route_id,s.catalog_item_id
        rows between unbounded preceding and 1 preceding
      ),0)::numeric prior_shortage_qty
    from shortage s
  )
  select a.route_id,a.source_location_id,a.destination_branch_id,a.destination_name,a.catalog_item_id,a.item_type,a.item_id,a.item_name,a.request_unit_code,
    round(a.branch_quantity,3),round(a.reorder_min_qty,3),round(a.target_stock_qty,3),round(a.open_committed_qty,3),round(a.in_transit_qty,3),
    round(a.effective_stock_qty,3),round(a.shortage_qty,3),round(a.source_quantity,3),round(a.source_reserved_qty,3),round(a.source_available_qty,3),
    round(least(a.shortage_qty,greatest(a.source_available_qty-a.prior_shortage_qty,0)),3) internal_suggested_qty,
    round(greatest(a.shortage_qty-least(a.shortage_qty,greatest(a.source_available_qty-a.prior_shortage_qty,0)),0),3) purchase_shortage_qty,
    case when a.target_stock_qty>0 and a.effective_stock_qty<=0 then 'critical'
         when a.shortage_qty>0 then 'low'
         when a.target_stock_qty>0 and a.branch_quantity>a.target_stock_qty then 'overstock'
         else 'normal' end::text shortage_status
  from allocated a
  order by case when a.target_stock_qty>0 and a.effective_stock_qty<=0 then 0 when a.shortage_qty>0 then 1 else 2 end,
           a.destination_name,a.item_name;
end$$;

grant execute on function public.inventory_supply_shortages_v1(bigint) to authenticated;

commit;
