-- Sharawla POS — Reports Engine V2
-- Shared reporting RPCs. Report packs are capability-driven in UI.

begin;

create or replace function public.report_sales_summary_v2(p_branch_id bigint,p_from timestamptz,p_to timestamptz)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare r jsonb; f timestamptz:=coalesce(p_from,date_trunc('day',now())); t timestamptz:=coalesce(p_to,now());
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 if t<=f then raise exception 'الفترة غير صحيحة'; end if;
 with sold as (
   select o.id,o.order_type,o.payment_method,o.total,o.subtotal,o.discount,o.tax_amount,o.service_amount,o.delivery_fee,
          coalesce(sum(oi.quantity),0) item_qty,
          coalesce(sum(oi.quantity*coalesce(oi.cost,0)),0) cogs
   from public.orders o left join public.order_items oi on oi.order_id=o.id
   where o.branch_id=p_branch_id and o.created_at>=f and o.created_at<t and coalesce(o.status,'')<>'cancelled'
   group by o.id
 ), ret as (
   select coalesce(sum(r.total),0) returns_total,
          coalesce(sum(ri.quantity),0) returned_qty,
          coalesce(sum(ri.quantity*coalesce(oi.cost,0)),0) returned_cogs
   from public.returns r left join public.return_items ri on ri.return_id=r.id left join public.order_items oi on oi.id=ri.order_item_id
   where r.branch_id=p_branch_id and r.created_at>=f and r.created_at<t
 ), pay as (
   select coalesce(jsonb_agg(jsonb_build_object('method',method,'amount',amount) order by amount desc),'[]'::jsonb) rows
   from (select op.method,round(sum(op.amount),2) amount from public.order_payments op join public.orders o on o.id=op.order_id where o.branch_id=p_branch_id and o.created_at>=f and o.created_at<t and coalesce(o.status,'')<>'cancelled' group by op.method) x
 ), types as (
   select coalesce(jsonb_agg(jsonb_build_object('order_type',order_type,'orders',orders,'sales',sales) order by sales desc),'[]'::jsonb) rows
   from (select coalesce(order_type,'unknown') order_type,count(*) orders,round(sum(total),2) sales from sold group by coalesce(order_type,'unknown')) x
 )
 select jsonb_build_object(
   'from',f,'to',t,
   'orders',count(*),
   'gross_sales',round(coalesce(sum(s.total),0),2),
   'returns',round(ret.returns_total,2),
   'net_sales',round(coalesce(sum(s.total),0)-ret.returns_total,2),
   'subtotal',round(coalesce(sum(s.subtotal),0),2),
   'discounts',round(coalesce(sum(s.discount),0),2),
   'tax',round(coalesce(sum(s.tax_amount),0),2),
   'service',round(coalesce(sum(s.service_amount),0),2),
   'delivery',round(coalesce(sum(s.delivery_fee),0),2),
   'items_sold',round(coalesce(sum(s.item_qty),0),3),
   'items_returned',round(ret.returned_qty,3),
   'cogs',round(coalesce(sum(s.cogs),0)-ret.returned_cogs,2),
   'gross_profit',round((coalesce(sum(s.total),0)-ret.returns_total)-(coalesce(sum(s.cogs),0)-ret.returned_cogs),2),
   'avg_ticket',round(case when count(*)=0 then 0 else (coalesce(sum(s.total),0)-ret.returns_total)/count(*) end,2),
   'payments',(select rows from pay),
   'order_types',(select rows from types)
 ) into r
 from sold s cross join ret;
 return r;
end;$$;

create or replace function public.report_item_sales_v2(p_branch_id bigint,p_from timestamptz,p_to timestamptz,p_limit integer default 200)
returns table(product_id bigint,product_name text,variant_id bigint,variant_name text,qty_sold numeric,qty_returned numeric,net_qty numeric,gross_revenue numeric,refunds numeric,net_revenue numeric,cogs numeric,gross_profit numeric)
language plpgsql security definer set search_path=public
as $$
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 return query
 with s as (
  select oi.product_id,oi.product_name,oi.variant_id,oi.variant_name,sum(oi.quantity) qty,sum(oi.total) revenue,sum(oi.quantity*coalesce(oi.cost,0)) cogs
  from public.order_items oi join public.orders o on o.id=oi.order_id
  where o.branch_id=p_branch_id and o.created_at>=p_from and o.created_at<p_to and coalesce(o.status,'')<>'cancelled'
  group by oi.product_id,oi.product_name,oi.variant_id,oi.variant_name
 ), r as (
  select ri.product_id,oi.variant_id,sum(ri.quantity) qty,sum(ri.total) refunds,sum(ri.quantity*coalesce(oi.cost,0)) cogs_back
  from public.return_items ri join public.returns rr on rr.id=ri.return_id left join public.order_items oi on oi.id=ri.order_item_id
  where rr.branch_id=p_branch_id and rr.created_at>=p_from and rr.created_at<p_to
  group by ri.product_id,oi.variant_id
 )
 select s.product_id,s.product_name,s.variant_id,s.variant_name,
        round(s.qty,3),round(coalesce(r.qty,0),3),round(s.qty-coalesce(r.qty,0),3),
        round(s.revenue,2),round(coalesce(r.refunds,0),2),round(s.revenue-coalesce(r.refunds,0),2),
        round(s.cogs-coalesce(r.cogs_back,0),2),round((s.revenue-coalesce(r.refunds,0))-(s.cogs-coalesce(r.cogs_back,0)),2)
 from s left join r on r.product_id=s.product_id and r.variant_id is not distinct from s.variant_id
 order by (s.revenue-coalesce(r.refunds,0)) desc
 limit greatest(1,least(coalesce(p_limit,200),1000));
end;$$;

create or replace function public.report_inventory_summary_v2(p_branch_id bigint)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare r jsonb;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 with base as (
  select b.product_id,p.name product_name,null::bigint variant_id,null::text variant_name,b.quantity,b.average_unit_cost,(b.quantity*b.average_unit_cost) stock_value,b.low_stock_threshold,b.track_inventory
  from public.retail_inventory_balances b join public.products p on p.id=b.product_id where b.branch_id=p_branch_id
  union all
  select v.product_id,p.name,v.variant_id,vv.name,v.quantity,v.average_unit_cost,(v.quantity*v.average_unit_cost),v.low_stock_threshold,v.track_inventory
  from public.retail_variant_inventory_balances v join public.product_variants vv on vv.id=v.variant_id join public.products p on p.id=vv.product_id where v.branch_id=p_branch_id
 )
 select jsonb_build_object(
  'sku_count',count(*),
  'stock_value',round(coalesce(sum(stock_value),0),2),
  'low_stock_count',count(*) filter(where track_inventory and low_stock_threshold is not null and quantity<=low_stock_threshold),
  'negative_stock_count',count(*) filter(where quantity<0),
  'items',coalesce(jsonb_agg(jsonb_build_object('product_id',product_id,'product_name',product_name,'variant_id',variant_id,'variant_name',variant_name,'quantity',quantity,'average_cost',average_unit_cost,'stock_value',round(stock_value,2),'low_stock_threshold',low_stock_threshold) order by stock_value desc),'[]'::jsonb)
 ) into r from base;
 return r;
end;$$;

create or replace function public.report_purchasing_summary_v2(p_branch_id bigint,p_from timestamptz,p_to timestamptz)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare r jsonb;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 with po as (
  select count(distinct p.id) po_count,coalesce(sum(i.quantity_ordered*i.unit_cost),0) ordered_value
  from public.retail_purchase_orders p left join public.retail_purchase_order_items i on i.purchase_order_id=p.id
  where p.branch_id=p_branch_id and p.created_at>=p_from and p.created_at<p_to
 ), grn as (
  select count(distinct g.id) grn_count,coalesce(sum(i.quantity*i.unit_cost),0) received_value
  from public.retail_goods_receipts g left join public.retail_goods_receipt_items i on i.goods_receipt_id=g.id
  where g.branch_id=p_branch_id and g.received_at>=p_from and g.received_at<p_to
 ), sr as (
  select count(distinct r.id) return_count,coalesce(sum(i.quantity*i.unit_cost),0) return_value
  from public.retail_supplier_returns r left join public.retail_supplier_return_items i on i.supplier_return_id=r.id
  where r.branch_id=p_branch_id and r.created_at>=p_from and r.created_at<p_to
 ), sup as (
  select coalesce(jsonb_agg(jsonb_build_object('supplier_id',supplier_id,'supplier_name',supplier_name,'received_value',round(received_value,2)) order by received_value desc),'[]'::jsonb) rows
  from (select g.supplier_id,s.name supplier_name,sum(gi.quantity*gi.unit_cost) received_value from public.retail_goods_receipts g join public.retail_goods_receipt_items gi on gi.goods_receipt_id=g.id join public.retail_suppliers s on s.id=g.supplier_id where g.branch_id=p_branch_id and g.received_at>=p_from and g.received_at<p_to group by g.supplier_id,s.name) x
 )
 select jsonb_build_object('po_count',po.po_count,'ordered_value',round(po.ordered_value,2),'grn_count',grn.grn_count,'received_value',round(grn.received_value,2),'supplier_returns',sr.return_count,'supplier_return_value',round(sr.return_value,2),'net_purchases',round(grn.received_value-sr.return_value,2),'suppliers',sup.rows) into r from po,grn,sr,sup;
 return r;
end;$$;

create or replace function public.report_order_documents_v2(p_branch_id bigint,p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare r jsonb;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 select jsonb_build_object(
  'documents',count(*),'value',round(coalesce(sum(total_amount),0),2),'deposits',round(coalesce(sum(deposit_paid),0),2),
  'open_value',round(coalesce(sum(total_amount-deposit_paid) filter(where status not in ('converted','completed','cancelled','rejected','expired')),0),2),
  'by_type',coalesce((select jsonb_agg(jsonb_build_object('type',document_type,'count',cnt,'value',round(val,2)) order by val desc) from (select document_type,count(*) cnt,sum(total_amount) val from public.commerce_order_documents where branch_id=p_branch_id and created_at>=p_from and created_at<p_to group by document_type)x),'[]'::jsonb),
  'by_status',coalesce((select jsonb_agg(jsonb_build_object('status',status,'count',cnt,'value',round(val,2)) order by cnt desc) from (select status,count(*) cnt,sum(total_amount) val from public.commerce_order_documents where branch_id=p_branch_id and created_at>=p_from and created_at<p_to group by status)x),'[]'::jsonb)
 ) into r from public.commerce_order_documents where branch_id=p_branch_id and created_at>=p_from and created_at<p_to;
 return r;
end;$$;

create or replace function public.report_food_summary_v2(p_branch_id bigint,p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare r jsonb;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 with sale_cost as (
  select coalesce(sum(c.total_food_cost*coalesce(oi.quantity,1)),0) food_cost
  from public.food_order_item_cost_snapshots c join public.order_items oi on oi.id=c.order_item_id join public.orders o on o.id=oi.order_id
  where o.branch_id=p_branch_id and o.created_at>=p_from and o.created_at<p_to and coalesce(o.status,'')<>'cancelled'
 ), waste as (
  select coalesce(sum(waste_cost),0) waste_cost,coalesce(sum(base_quantity),0) waste_qty from public.food_waste_events where branch_id=p_branch_id and occurred_at>=p_from and occurred_at<p_to and status='posted'
 ), prod as (
  select count(*) batches,coalesce(avg(case when planned_output_quantity>0 and actual_output_quantity is not null then actual_output_quantity/planned_output_quantity*100 end),0) yield_pct
  from public.food_production_batches where branch_id=p_branch_id and created_at>=p_from and created_at<p_to and status='completed'
 ), sales as (
  select coalesce(sum(total),0) net_sales from public.orders where branch_id=p_branch_id and created_at>=p_from and created_at<p_to and coalesce(status,'')<>'cancelled'
 )
 select jsonb_build_object('sales',round(sales.net_sales,2),'food_cost',round(sale_cost.food_cost,2),'food_cost_percent',round(case when sales.net_sales=0 then 0 else sale_cost.food_cost/sales.net_sales*100 end,2),'waste_cost',round(waste.waste_cost,2),'waste_quantity',round(waste.waste_qty,3),'production_batches',prod.batches,'average_yield_percent',round(prod.yield_pct,2)) into r from sale_cost,waste,prod,sales;
 return r;
end;$$;

grant execute on function public.report_sales_summary_v2(bigint,timestamptz,timestamptz) to authenticated;
grant execute on function public.report_item_sales_v2(bigint,timestamptz,timestamptz,integer) to authenticated;
grant execute on function public.report_inventory_summary_v2(bigint) to authenticated;
grant execute on function public.report_purchasing_summary_v2(bigint,timestamptz,timestamptz) to authenticated;
grant execute on function public.report_order_documents_v2(bigint,timestamptz,timestamptz) to authenticated;
grant execute on function public.report_food_summary_v2(bigint,timestamptz,timestamptz) to authenticated;

commit;
