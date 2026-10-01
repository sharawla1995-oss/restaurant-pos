-- Sharawla DFR-02 — Customer Timeline read model
-- SOURCE ONLY. Read-only operational history; not an accounting statement.
-- Baseline: 40511daacf42b8aed6201bd610f99f6d015d1a23

begin;

create or replace function public.customer_timeline_v1(
  p_branch_id bigint,
  p_customer_id bigint,
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 300
)
returns table(
  event_at timestamptz,
  event_type text,
  document_id bigint,
  document_no text,
  amount numeric,
  payment_breakdown jsonb,
  employee_id bigint,
  employee_name text,
  source text
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('customers')) then raise exception 'ليس لديك صلاحية العملاء'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if p_customer_id is null or not exists(select 1 from public.customers c where c.id=p_customer_id) then raise exception 'العميل غير موجود'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception 'الفترة غير صحيحة'; end if;

  return query
  with sale_payment_rows as (
    select op.order_id,op.method,round(sum(op.amount),2) amount
    from public.order_payments op
    group by op.order_id,op.method
  ), sale_payments as (
    select x.order_id,jsonb_object_agg(x.method,x.amount order by x.method) payment_breakdown
    from sale_payment_rows x
    group by x.order_id
  ), refund_payment_rows as (
    select rp.return_id,rp.method,round(sum(rp.amount),2) amount
    from public.return_payments rp
    group by rp.return_id,rp.method
  ), refund_payments as (
    select x.return_id,jsonb_object_agg(x.method,x.amount order by x.method) payment_breakdown
    from refund_payment_rows x
    group by x.return_id
  ), timeline as (
    select o.created_at event_at,
           'sale'::text event_type,
           o.id document_id,
           coalesce(nullif(o.order_number,''),o.invoice_number::text,o.id::text) document_no,
           round(coalesce(o.total,0),2) amount,
           coalesce(sp.payment_breakdown,'{}'::jsonb) payment_breakdown,
           o.employee_id,
           coalesce(e.name,'موظف #'||o.employee_id::text) employee_name,
           coalesce(nullif(o.source,''),'pos') source
    from public.orders o
    left join public.employees e on e.id=o.employee_id
    left join sale_payments sp on sp.order_id=o.id
    where o.branch_id=p_branch_id
      and o.customer_id=p_customer_id
      and o.created_at>=p_from and o.created_at<p_to
      and coalesce(o.status,'')<>'cancelled'

    union all

    select r.created_at,
           'return'::text,
           r.id,
           r.return_number::text,
           round(coalesce(r.total,0),2),
           coalesce(rp.payment_breakdown,'{}'::jsonb),
           r.employee_id,
           coalesce(e.name,'موظف #'||r.employee_id::text),
           'return'::text
    from public.returns r
    join public.orders o on o.id=r.order_id
    left join public.employees e on e.id=r.employee_id
    left join refund_payments rp on rp.return_id=r.id
    where r.branch_id=p_branch_id
      and o.customer_id=p_customer_id
      and r.created_at>=p_from and r.created_at<p_to
  )
  select t.event_at,t.event_type,t.document_id,t.document_no,t.amount,t.payment_breakdown,
         t.employee_id,t.employee_name,t.source
  from timeline t
  order by t.event_at desc,t.document_id desc
  limit greatest(1,least(coalesce(p_limit,300),1000));
end;
$$;

revoke all on function public.customer_timeline_v1(bigint,bigint,timestamptz,timestamptz,integer) from public,anon;
grant execute on function public.customer_timeline_v1(bigint,bigint,timestamptz,timestamptz,integer) to authenticated;

commit;