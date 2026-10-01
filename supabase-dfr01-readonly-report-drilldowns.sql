-- Sharawla DFR-01 — Read-only report drilldowns
-- SOURCE ONLY. Do not deploy without explicit authorization.
-- Baseline: 40511daacf42b8aed6201bd610f99f6d015d1a23
-- Additive reporting only: no operational writes, no stock authority changes.

begin;

create or replace function public.report_sales_by_payment_method_v1(
  p_branch_id bigint,
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  method text,
  sale_amount numeric,
  refund_amount numeric,
  net_amount numeric,
  order_count bigint,
  return_count bigint
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('reports')) then raise exception 'ليس لديك صلاحية التقارير'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception 'الفترة غير صحيحة'; end if;

  return query
  with sales as (
    select op.method,
           round(sum(op.amount),2) amount,
           count(distinct o.id)::bigint docs
    from public.order_payments op
    join public.orders o on o.id=op.order_id
    where o.branch_id=p_branch_id
      and o.created_at>=p_from and o.created_at<p_to
      and coalesce(o.status,'')<>'cancelled'
    group by op.method
  ), refunds as (
    select rp.method,
           round(sum(rp.amount),2) amount,
           count(distinct r.id)::bigint docs
    from public.return_payments rp
    join public.returns r on r.id=rp.return_id
    where r.branch_id=p_branch_id
      and r.created_at>=p_from and r.created_at<p_to
    group by rp.method
  ), methods as (
    select s.method from sales s
    union
    select r.method from refunds r
  )
  select m.method,
         round(coalesce(s.amount,0),2),
         round(coalesce(r.amount,0),2),
         round(coalesce(s.amount,0)-coalesce(r.amount,0),2),
         coalesce(s.docs,0)::bigint,
         coalesce(r.docs,0)::bigint
  from methods m
  left join sales s on s.method=m.method
  left join refunds r on r.method=m.method
  order by (coalesce(s.amount,0)-coalesce(r.amount,0)) desc,m.method;
end;
$$;

create or replace function public.report_sales_by_employee_v1(
  p_branch_id bigint,
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  employee_id bigint,
  employee_name text,
  sales_orders bigint,
  gross_sales numeric,
  returns_processed bigint,
  refund_value numeric,
  net_activity numeric,
  avg_ticket numeric
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('reports')) then raise exception 'ليس لديك صلاحية التقارير'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception 'الفترة غير صحيحة'; end if;

  return query
  with sales as (
    select o.employee_id,
           count(*)::bigint docs,
           round(sum(o.total),2) amount
    from public.orders o
    where o.branch_id=p_branch_id
      and o.created_at>=p_from and o.created_at<p_to
      and coalesce(o.status,'')<>'cancelled'
    group by o.employee_id
  ), refunds as (
    -- Return attribution is intentionally the employee who processed the return,
    -- not the employee who created the original sale.
    select r.employee_id,
           count(*)::bigint docs,
           round(sum(r.total),2) amount
    from public.returns r
    where r.branch_id=p_branch_id
      and r.created_at>=p_from and r.created_at<p_to
    group by r.employee_id
  ), employee_keys as (
    select s.employee_id from sales s
    union
    select r.employee_id from refunds r
  )
  select k.employee_id,
         coalesce(e.name,'موظف #'||k.employee_id::text),
         coalesce(s.docs,0)::bigint,
         round(coalesce(s.amount,0),2),
         coalesce(r.docs,0)::bigint,
         round(coalesce(r.amount,0),2),
         round(coalesce(s.amount,0)-coalesce(r.amount,0),2),
         round(case when coalesce(s.docs,0)=0 then 0 else coalesce(s.amount,0)/s.docs end,2)
  from employee_keys k
  left join public.employees e on e.id=k.employee_id
  left join sales s on s.employee_id=k.employee_id
  left join refunds r on r.employee_id=k.employee_id
  order by (coalesce(s.amount,0)-coalesce(r.amount,0)) desc,k.employee_id;
end;
$$;

create or replace function public.report_sales_by_customer_v1(
  p_branch_id bigint,
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 200
)
returns table(
  customer_id bigint,
  customer_name text,
  orders bigint,
  gross_sales numeric,
  returns_against_customer_orders numeric,
  net_sales numeric,
  avg_ticket numeric
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('reports')) then raise exception 'ليس لديك صلاحية التقارير'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception 'الفترة غير صحيحة'; end if;

  return query
  with sales as (
    select o.customer_id,
           max(nullif(trim(o.customer_name),'')) customer_name,
           count(*)::bigint docs,
           round(sum(o.total),2) amount
    from public.orders o
    where o.branch_id=p_branch_id
      and o.created_at>=p_from and o.created_at<p_to
      and coalesce(o.status,'')<>'cancelled'
    group by o.customer_id
  ), refunds as (
    -- Customer attribution follows the original order, even when the return is
    -- processed later/by another employee.
    select o.customer_id,
           max(nullif(trim(o.customer_name),'')) customer_name,
           round(sum(r.total),2) amount
    from public.returns r
    join public.orders o on o.id=r.order_id
    where r.branch_id=p_branch_id
      and r.created_at>=p_from and r.created_at<p_to
    group by o.customer_id
  ), customer_keys as (
    select s.customer_id from sales s
    union
    select r.customer_id from refunds r
  )
  select k.customer_id,
         coalesce(s.customer_name,r.customer_name,
           case when k.customer_id is null then 'عميل بدون ملف' else 'عميل #'||k.customer_id::text end),
         coalesce(s.docs,0)::bigint,
         round(coalesce(s.amount,0),2),
         round(coalesce(r.amount,0),2),
         round(coalesce(s.amount,0)-coalesce(r.amount,0),2),
         round(case when coalesce(s.docs,0)=0 then 0 else coalesce(s.amount,0)/s.docs end,2)
  from customer_keys k
  left join sales s on s.customer_id is not distinct from k.customer_id
  left join refunds r on r.customer_id is not distinct from k.customer_id
  order by (coalesce(s.amount,0)-coalesce(r.amount,0)) desc
  limit greatest(1,least(coalesce(p_limit,200),1000));
end;
$$;

create or replace function public.report_purchases_by_supplier_v1(
  p_branch_id bigint,
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  supplier_id bigint,
  supplier_name text,
  grn_count bigint,
  received_value numeric,
  supplier_return_value numeric,
  net_purchase_value numeric
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('reports')) then raise exception 'ليس لديك صلاحية التقارير'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception 'الفترة غير صحيحة'; end if;

  return query
  with grn as (
    select g.supplier_id,
           count(distinct g.id)::bigint docs,
           round(sum(gi.quantity*gi.unit_cost),2) amount
    from public.retail_goods_receipts g
    join public.retail_goods_receipt_items gi on gi.goods_receipt_id=g.id
    where g.branch_id=p_branch_id
      and g.received_at>=p_from and g.received_at<p_to
    group by g.supplier_id
  ), supplier_returns as (
    select r.supplier_id,
           round(sum(ri.quantity*ri.unit_cost),2) amount
    from public.retail_supplier_returns r
    join public.retail_supplier_return_items ri on ri.supplier_return_id=r.id
    where r.branch_id=p_branch_id
      and r.created_at>=p_from and r.created_at<p_to
    group by r.supplier_id
  ), supplier_keys as (
    select g.supplier_id from grn g
    union
    select r.supplier_id from supplier_returns r
  )
  select k.supplier_id,
         coalesce(s.name,'مورد #'||k.supplier_id::text),
         coalesce(g.docs,0)::bigint,
         round(coalesce(g.amount,0),2),
         round(coalesce(r.amount,0),2),
         round(coalesce(g.amount,0)-coalesce(r.amount,0),2)
  from supplier_keys k
  left join public.retail_suppliers s on s.id=k.supplier_id
  left join grn g on g.supplier_id=k.supplier_id
  left join supplier_returns r on r.supplier_id=k.supplier_id
  order by (coalesce(g.amount,0)-coalesce(r.amount,0)) desc,k.supplier_id;
end;
$$;

create or replace function public.report_purchases_by_employee_v1(
  p_branch_id bigint,
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  role_code text,
  employee_id bigint,
  employee_name text,
  document_count bigint,
  operational_value numeric
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('reports')) then raise exception 'ليس لديك صلاحية التقارير'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception 'الفترة غير صحيحة'; end if;

  return query
  with po_docs as (
    select p.id,p.created_by_employee_id employee_id,
           coalesce(sum(i.quantity_ordered*i.unit_cost),0) amount
    from public.retail_purchase_orders p
    left join public.retail_purchase_order_items i on i.purchase_order_id=p.id
    where p.branch_id=p_branch_id
      and p.created_at>=p_from and p.created_at<p_to
    group by p.id,p.created_by_employee_id
  ), grn_docs as (
    select g.id,g.created_by_employee_id employee_id,
           coalesce(sum(i.quantity*i.unit_cost),0) amount
    from public.retail_goods_receipts g
    left join public.retail_goods_receipt_items i on i.goods_receipt_id=g.id
    where g.branch_id=p_branch_id
      and g.received_at>=p_from and g.received_at<p_to
    group by g.id,g.created_by_employee_id
  ), return_docs as (
    select r.id,r.created_by_employee_id employee_id,
           coalesce(sum(i.quantity*i.unit_cost),0) amount
    from public.retail_supplier_returns r
    left join public.retail_supplier_return_items i on i.supplier_return_id=r.id
    where r.branch_id=p_branch_id
      and r.created_at>=p_from and r.created_at<p_to
    group by r.id,r.created_by_employee_id
  ), roles as (
    select 'po_created'::text role_code,d.employee_id,count(*)::bigint docs,round(sum(d.amount),2) amount
    from po_docs d group by d.employee_id
    union all
    select 'grn_received'::text,d.employee_id,count(*)::bigint,round(sum(d.amount),2)
    from grn_docs d group by d.employee_id
    union all
    select 'supplier_return_created'::text,d.employee_id,count(*)::bigint,round(sum(d.amount),2)
    from return_docs d group by d.employee_id
  )
  select r.role_code,
         r.employee_id,
         case when r.employee_id is null then 'غير محدد' else coalesce(e.name,'موظف #'||r.employee_id::text) end,
         r.docs,
         round(coalesce(r.amount,0),2)
  from roles r
  left join public.employees e on e.id=r.employee_id
  order by r.role_code,r.amount desc,r.employee_id nulls last;
end;
$$;

create or replace function public.report_purchase_orders_detail_v1(
  p_branch_id bigint,
  p_from timestamptz,
  p_to timestamptz,
  p_supplier_id bigint default null,
  p_status text default null
)
returns table(
  purchase_order_id bigint,
  po_number text,
  supplier_id bigint,
  supplier_name text,
  created_by_employee_id bigint,
  created_by_employee_name text,
  approved_by_employee_id bigint,
  approved_by_employee_name text,
  status text,
  ordered_value numeric,
  received_value numeric,
  outstanding_quantity numeric,
  outstanding_value numeric,
  created_at timestamptz
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('reports')) then raise exception 'ليس لديك صلاحية التقارير'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception 'الفترة غير صحيحة'; end if;

  return query
  with po_value as (
    select i.purchase_order_id,
           round(sum(i.quantity_ordered*i.unit_cost),2) ordered_value,
           round(sum(greatest(i.quantity_ordered-i.quantity_received,0)),3) outstanding_quantity,
           round(sum(greatest(i.quantity_ordered-i.quantity_received,0)*i.unit_cost),2) outstanding_value
    from public.retail_purchase_order_items i
    group by i.purchase_order_id
  ), grn_value as (
    select g.purchase_order_id,
           round(sum(i.quantity*i.unit_cost),2) received_value
    from public.retail_goods_receipts g
    join public.retail_goods_receipt_items i on i.goods_receipt_id=g.id
    group by g.purchase_order_id
  )
  select p.id,
         p.po_number,
         p.supplier_id,
         coalesce(s.name,'مورد #'||p.supplier_id::text),
         p.created_by_employee_id,
         case when p.created_by_employee_id is null then null else coalesce(ec.name,'موظف #'||p.created_by_employee_id::text) end,
         p.approved_by_employee_id,
         case when p.approved_by_employee_id is null then null else coalesce(ea.name,'موظف #'||p.approved_by_employee_id::text) end,
         p.status,
         round(coalesce(v.ordered_value,0),2),
         round(coalesce(g.received_value,0),2),
         round(coalesce(v.outstanding_quantity,0),3),
         round(coalesce(v.outstanding_value,0),2),
         p.created_at
  from public.retail_purchase_orders p
  left join public.retail_suppliers s on s.id=p.supplier_id
  left join public.employees ec on ec.id=p.created_by_employee_id
  left join public.employees ea on ea.id=p.approved_by_employee_id
  left join po_value v on v.purchase_order_id=p.id
  left join grn_value g on g.purchase_order_id=p.id
  where p.branch_id=p_branch_id
    and p.created_at>=p_from and p.created_at<p_to
    and (p_supplier_id is null or p.supplier_id=p_supplier_id)
    and (nullif(trim(coalesce(p_status,'')),'') is null or p.status=p_status)
  order by p.created_at desc,p.id desc;
end;
$$;

revoke all on function public.report_sales_by_payment_method_v1(bigint,timestamptz,timestamptz) from public,anon;
revoke all on function public.report_sales_by_employee_v1(bigint,timestamptz,timestamptz) from public,anon;
revoke all on function public.report_sales_by_customer_v1(bigint,timestamptz,timestamptz,integer) from public,anon;
revoke all on function public.report_purchases_by_supplier_v1(bigint,timestamptz,timestamptz) from public,anon;
revoke all on function public.report_purchases_by_employee_v1(bigint,timestamptz,timestamptz) from public,anon;
revoke all on function public.report_purchase_orders_detail_v1(bigint,timestamptz,timestamptz,bigint,text) from public,anon;

grant execute on function public.report_sales_by_payment_method_v1(bigint,timestamptz,timestamptz) to authenticated;
grant execute on function public.report_sales_by_employee_v1(bigint,timestamptz,timestamptz) to authenticated;
grant execute on function public.report_sales_by_customer_v1(bigint,timestamptz,timestamptz,integer) to authenticated;
grant execute on function public.report_purchases_by_supplier_v1(bigint,timestamptz,timestamptz) to authenticated;
grant execute on function public.report_purchases_by_employee_v1(bigint,timestamptz,timestamptz) to authenticated;
grant execute on function public.report_purchase_orders_detail_v1(bigint,timestamptz,timestamptz,bigint,text) to authenticated;

commit;

