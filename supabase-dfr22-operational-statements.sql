-- Sharawla DFR-22 — Operational customer/supplier statements
-- SOURCE ONLY. These are operational event streams, not AR/AP ledgers.
-- Baseline: 40511daacf42b8aed6201bd610f99f6d015d1a23

begin;

create or replace function public.customer_operational_statement_v1(
  p_branch_id bigint,
  p_customer_id bigint,
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 500
)
returns table(
  event_at timestamptz,
  event_type text,
  document_id bigint,
  document_no text,
  amount numeric,
  method text,
  related_document_id bigint
)
language plpgsql security definer set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('reports')) then raise exception 'ليس لديك صلاحية التقارير'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if p_customer_id is null or not exists(select 1 from public.customers c where c.id=p_customer_id) then raise exception 'العميل غير موجود'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception 'الفترة غير صحيحة'; end if;

  return query
  with events as (
    select o.created_at event_at,'sale'::text event_type,o.id document_id,
           coalesce(nullif(o.order_number,''),o.invoice_number::text,o.id::text) document_no,
           round(coalesce(o.total,0),2) amount,null::text method,null::bigint related_document_id
    from public.orders o
    where o.branch_id=p_branch_id and o.customer_id=p_customer_id
      and o.created_at>=p_from and o.created_at<p_to and coalesce(o.status,'')<>'cancelled'
    union all
    select coalesce(op.created_at,o.created_at),'payment',op.id,
           coalesce(nullif(o.order_number,''),o.invoice_number::text,o.id::text),round(op.amount,2),op.method,o.id
    from public.order_payments op join public.orders o on o.id=op.order_id
    where o.branch_id=p_branch_id and o.customer_id=p_customer_id
      and o.created_at>=p_from and o.created_at<p_to and coalesce(o.status,'')<>'cancelled'
    union all
    select r.created_at,'return',r.id,r.return_number::text,round(coalesce(r.total,0),2),null::text,r.order_id
    from public.returns r join public.orders o on o.id=r.order_id
    where r.branch_id=p_branch_id and o.customer_id=p_customer_id
      and r.created_at>=p_from and r.created_at<p_to
    union all
    select r.created_at,'refund',rp.id,r.return_number::text,round(rp.amount,2),rp.method,r.id
    from public.return_payments rp join public.returns r on r.id=rp.return_id join public.orders o on o.id=r.order_id
    where r.branch_id=p_branch_id and o.customer_id=p_customer_id
      and r.created_at>=p_from and r.created_at<p_to
  )
  select e.event_at,e.event_type,e.document_id,e.document_no,e.amount,e.method,e.related_document_id
  from events e order by e.event_at desc,e.document_id desc
  limit greatest(1,least(coalesce(p_limit,500),1500));
end;$$;

create or replace function public.supplier_operational_parties_v1(
  p_branch_id bigint,
  p_limit integer default 300
)
returns table(supplier_id bigint,supplier_name text)
language plpgsql security definer set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('reports')) then raise exception 'ليس لديك صلاحية التقارير'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  return query
  with ids as (
    select si.supplier_id from public.retail_supplier_invoices si where si.branch_id=p_branch_id
    union select g.supplier_id from public.retail_goods_receipts g where g.branch_id=p_branch_id
    union select r.supplier_id from public.retail_supplier_returns r where r.branch_id=p_branch_id
  )
  select s.id,s.name from ids i join public.retail_suppliers s on s.id=i.supplier_id
  order by s.name limit greatest(1,least(coalesce(p_limit,300),1000));
end;$$;

create or replace function public.supplier_operational_statement_v1(
  p_branch_id bigint,
  p_supplier_id bigint,
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 500
)
returns table(
  event_at timestamptz,
  event_type text,
  document_id bigint,
  document_no text,
  amount numeric,
  currency_code text,
  status text,
  related_document_id bigint
)
language plpgsql security definer set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('reports')) then raise exception 'ليس لديك صلاحية التقارير'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if p_supplier_id is null or not exists(select 1 from public.retail_suppliers s where s.id=p_supplier_id) then raise exception 'المورد غير موجود'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception 'الفترة غير صحيحة'; end if;

  return query
  with grn_value as (
    select g.id,g.purchase_order_id,g.received_at,round(sum(i.quantity*i.unit_cost),2) amount
    from public.retail_goods_receipts g join public.retail_goods_receipt_items i on i.goods_receipt_id=g.id
    where g.branch_id=p_branch_id and g.supplier_id=p_supplier_id and g.received_at>=p_from and g.received_at<p_to
    group by g.id,g.purchase_order_id,g.received_at
  ), return_value as (
    select r.id,r.created_at,round(sum(i.quantity*i.unit_cost),2) amount
    from public.retail_supplier_returns r join public.retail_supplier_return_items i on i.supplier_return_id=r.id
    where r.branch_id=p_branch_id and r.supplier_id=p_supplier_id and r.created_at>=p_from and r.created_at<p_to
    group by r.id,r.created_at
  ), events as (
    select si.created_at event_at,'supplier_invoice'::text event_type,si.id document_id,si.invoice_number document_no,
           round(si.total_amount,2) amount,nullif(trim(coalesce(si.currency_code,'')),'') currency_code,si.status,si.purchase_order_id related_document_id
    from public.retail_supplier_invoices si
    where si.branch_id=p_branch_id and si.supplier_id=p_supplier_id
      and si.created_at>=p_from and si.created_at<p_to and si.status<>'cancelled'
    union all
    select g.received_at,'goods_receipt',g.id,g.id::text,g.amount,
           nullif(trim(coalesce(po.currency_code,'')),'') currency_code,'received'::text,g.purchase_order_id
    from grn_value g left join public.retail_purchase_orders po on po.id=g.purchase_order_id
    union all
    select r.created_at,'supplier_return',r.id,r.id::text,r.amount,null::text,null::text,null::bigint
    from return_value r
  )
  select e.event_at,e.event_type,e.document_id,e.document_no,e.amount,e.currency_code,e.status,e.related_document_id
  from events e order by e.event_at desc,e.document_id desc
  limit greatest(1,least(coalesce(p_limit,500),1500));
end;$$;

revoke all on function public.customer_operational_statement_v1(bigint,bigint,timestamptz,timestamptz,integer) from public,anon;
revoke all on function public.supplier_operational_parties_v1(bigint,integer) from public,anon;
revoke all on function public.supplier_operational_statement_v1(bigint,bigint,timestamptz,timestamptz,integer) from public,anon;
grant execute on function public.customer_operational_statement_v1(bigint,bigint,timestamptz,timestamptz,integer) to authenticated;
grant execute on function public.supplier_operational_parties_v1(bigint,integer) to authenticated;
grant execute on function public.supplier_operational_statement_v1(bigint,bigint,timestamptz,timestamptz,integer) to authenticated;

commit;