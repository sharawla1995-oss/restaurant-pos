-- Sharawla POS 10.5.13 Candidate — Operations Polish Batch
-- SOURCE ONLY. Do not apply to Production from this candidate branch.
-- Scope: unified extras, delivery settlement permission, delivery payment correction,
-- Customer 360 read model, and return approval workflow.

begin;

-- ---------------------------------------------------------------------------
-- 1) Extras: Products in category "إضافات" are the source of truth.
--    Legacy modifiers remain as compatibility/runtime projection so historical
--    order_item_modifiers and existing product_modifiers are never destroyed.
-- ---------------------------------------------------------------------------
alter table public.modifiers
  add column if not exists source_product_id bigint references public.products(id) on delete set null;

create unique index if not exists modifiers_source_product_uidx
  on public.modifiers(source_product_id)
  where source_product_id is not null;

create or replace function public.sync_extra_product_modifier_v1(p_product_id bigint)
returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare
  v_product public.products%rowtype;
  v_category_name text;
  v_is_extra boolean:=false;
  v_modifier_id bigint;
begin
  select p.* into v_product
  from public.products p
  where p.id=p_product_id;

  if not found then return null; end if;

  select coalesce(c.name,'') into v_category_name
  from public.categories c
  where c.id=v_product.category_id;

  v_is_extra :=
    trim(v_category_name) in ('إضافات','الإضافات','الاضافات')
    or lower(trim(v_category_name)) like '%extra%';

  select m.id into v_modifier_id
  from public.modifiers m
  where m.source_product_id=v_product.id
  order by m.id
  limit 1;

  if v_is_extra then
    if v_modifier_id is null then
      select m.id into v_modifier_id
      from public.modifiers m
      where m.source_product_id is null
        and lower(trim(m.name))=lower(trim(v_product.name))
      order by m.id
      limit 1;
    end if;

    if v_modifier_id is null then
      insert into public.modifiers(name,price,active,source_product_id)
      values(v_product.name,coalesce(v_product.price,0),coalesce(v_product.active,true),v_product.id)
      returning id into v_modifier_id;
    else
      update public.modifiers
      set name=v_product.name,
          price=coalesce(v_product.price,0),
          active=coalesce(v_product.active,true),
          source_product_id=v_product.id
      where id=v_modifier_id;
    end if;
  elsif v_modifier_id is not null then
    -- Preserve the legacy row for history but remove it from new-sale choices.
    update public.modifiers set active=false where id=v_modifier_id;
  end if;

  return v_modifier_id;
end;
$$;

revoke all on function public.sync_extra_product_modifier_v1(bigint) from public,anon,authenticated;

create or replace function public.sync_extra_product_modifier_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.sync_extra_product_modifier_v1(new.id);
  return new;
end;
$$;

revoke all on function public.sync_extra_product_modifier_trigger_v1() from public,anon,authenticated;

drop trigger if exists trg_sync_extra_product_modifier_v1 on public.products;
create trigger trg_sync_extra_product_modifier_v1
after insert or update of name,price,active,category_id on public.products
for each row execute function public.sync_extra_product_modifier_trigger_v1();

create or replace function public.sync_extra_category_products_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $
declare r record;
begin
  if old.name is distinct from new.name then
    for r in select id from public.products where category_id=new.id loop
      perform public.sync_extra_product_modifier_v1(r.id);
    end loop;
  end if;
  return new;
end;
$;

revoke all on function public.sync_extra_category_products_trigger_v1() from public,anon,authenticated;
drop trigger if exists trg_sync_extra_category_products_v1 on public.categories;
create trigger trg_sync_extra_category_products_v1
after update of name on public.categories
for each row execute function public.sync_extra_category_products_trigger_v1();

-- Initial non-destructive backfill.
do $$
declare r record;
begin
  for r in select id from public.products order by id loop
    perform public.sync_extra_product_modifier_v1(r.id);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 2) Driver settlement: same atomic owner, permission-based instead of Admin UI.
-- ---------------------------------------------------------------------------
create or replace function public.settle_driver_orders_v1(
  p_branch_id bigint,
  p_driver_id bigint,
  p_order_ids bigint[],
  p_client_tx_id text
)
returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare
  v_employee_id bigint;
  v_order_ids bigint[];
  v_digest text;
  v_existing public.driver_settlements%rowtype;
  v_count integer;
  v_amount numeric(12,2);
  v_now timestamptz := now();
  v_settlement_id bigint;
begin
  if not (public.is_admin() or public.has_permission('deliverySettlement')) then
    raise exception 'ليس لديك صلاحية تسوية تحصيلات المندوبين';
  end if;

  v_employee_id := public.current_employee_id();
  if v_employee_id is null then raise exception 'المستخدم غير مربوط بموظف'; end if;
  if p_branch_id is null or p_driver_id is null then raise exception 'الفرع والمندوب مطلوبان'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if nullif(btrim(coalesce(p_client_tx_id,'')),'') is null then raise exception 'client_tx_id مطلوب'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended('settle_driver_orders_v1:' || btrim(p_client_tx_id), 0)
  );

  select coalesce(array_agg(x order by x),'{}'::bigint[])
  into v_order_ids
  from (select distinct unnest(coalesce(p_order_ids,'{}'::bigint[])) as x) q;

  if coalesce(cardinality(v_order_ids),0)=0 then raise exception 'لا توجد طلبات للتسوية'; end if;

  v_digest := md5(jsonb_build_object(
    'branch_id',p_branch_id,'driver_id',p_driver_id,'order_ids',to_jsonb(v_order_ids)
  )::text);

  select * into v_existing
  from public.driver_settlements
  where client_tx_id=p_client_tx_id
  limit 1;

  if found then
    if coalesce(v_existing.request_digest,'')<>v_digest then
      raise exception 'client_tx_id مستخدم ببيانات مختلفة';
    end if;
    return v_existing.id;
  end if;

  perform 1 from public.orders where id=any(v_order_ids) order by id for update;

  select count(*),coalesce(sum(total),0)
  into v_count,v_amount
  from public.orders
  where id=any(v_order_ids);

  if v_count<>cardinality(v_order_ids) then raise exception 'بعض الطلبات غير موجودة'; end if;

  if exists(
    select 1 from public.orders o
    where o.id=any(v_order_ids)
      and (
        o.branch_id<>p_branch_id
        or o.driver_id is distinct from p_driver_id
        or o.order_type<>'delivery'
        or o.status<>'delivered'
        or lower(coalesce(o.payment_method,''))<>'cash'
      )
  ) then
    raise exception 'الطلبات لا تطابق الفرع أو المندوب أو شروط تسوية الكاش';
  end if;

  if exists(
    select 1 from public.orders o
    where o.id=any(v_order_ids) and o.driver_settled_at is not null
  ) then raise exception 'يوجد طلب تمت تسويته بالفعل'; end if;

  insert into public.driver_settlements(
    driver_id,branch_id,employee_id,orders_count,amount,created_at,
    client_tx_id,request_digest,order_ids
  ) values(
    p_driver_id,p_branch_id,v_employee_id,cardinality(v_order_ids),v_amount,v_now,
    p_client_tx_id,v_digest,v_order_ids
  )
  returning id into v_settlement_id;

  update public.orders
  set driver_settled_at=v_now
  where id=any(v_order_ids) and driver_settled_at is null;

  if not found then raise exception 'تعذر إتمام التسوية'; end if;
  return v_settlement_id;
exception
  when unique_violation then
    select * into v_existing
    from public.driver_settlements
    where client_tx_id=p_client_tx_id
    limit 1;
    if found and coalesce(v_existing.request_digest,'')=v_digest then return v_existing.id; end if;
    raise;
end;
$$;

revoke all on function public.settle_driver_orders_v1(bigint,bigint,bigint[],text) from public,anon;
grant execute on function public.settle_driver_orders_v1(bigint,bigint,bigint[],text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Delivery payment method correction before driver settlement.
-- ---------------------------------------------------------------------------
-- V5 originally restricted order_payments.method to cash/wallet/instapay.
-- V9.4 introduced dynamic payment methods, so remove only that legacy-named
-- CHECK constraint. Runtime writes remain validated against the active
-- branch payment-method catalog by the RPC below.
alter table public.order_payments
  drop constraint if exists order_payments_method_check;

create table if not exists public.delivery_payment_changes_v1(
  id bigint generated by default as identity primary key,
  order_id bigint not null references public.orders(id) on delete restrict,
  branch_id bigint not null references public.branches(id) on delete restrict,
  employee_id bigint not null references public.employees(id) on delete restrict,
  old_method text not null,
  new_method text not null,
  amount numeric(12,2) not null,
  client_tx_id text not null,
  request_digest text not null,
  created_at timestamptz not null default now(),
  unique(client_tx_id)
);

alter table public.delivery_payment_changes_v1 enable row level security;
revoke all on public.delivery_payment_changes_v1 from anon,authenticated;
grant select on public.delivery_payment_changes_v1 to authenticated;
grant usage,select on sequence public.delivery_payment_changes_v1_id_seq to authenticated;

drop policy if exists delivery_payment_changes_read_v1 on public.delivery_payment_changes_v1;
create policy delivery_payment_changes_read_v1
on public.delivery_payment_changes_v1 for select to authenticated
using(public.is_admin() or public.has_branch_access(branch_id));

create or replace function public.change_delivery_order_payment_v1(
  p_order_id bigint,
  p_new_method text,
  p_client_tx_id text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_emp bigint;
  v_order public.orders%rowtype;
  v_method text:=lower(trim(coalesce(p_new_method,'')));
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_digest text;
  v_existing public.delivery_payment_changes_v1%rowtype;
  v_payment_count integer;
  v_old_method text;
  v_id bigint;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('deliveryPaymentCorrection')) then
    raise exception 'ليس لديك صلاحية تعديل طريقة دفع الدليفري';
  end if;

  v_emp:=public.current_employee_id();
  if v_emp is null then raise exception 'المستخدم غير مربوط بموظف'; end if;
  if p_order_id is null then raise exception 'الطلب مطلوب'; end if;
  if v_method='' then raise exception 'طريقة الدفع الجديدة مطلوبة'; end if;
  if v_key is null then raise exception 'client_tx_id مطلوب'; end if;

  v_digest:=md5(jsonb_build_object('order_id',p_order_id,'new_method',v_method)::text);
  perform pg_advisory_xact_lock(hashtextextended('delivery-payment-change:'||v_key,0));

  select * into v_existing
  from public.delivery_payment_changes_v1
  where client_tx_id=v_key
  limit 1;

  if found then
    if v_existing.request_digest<>v_digest then
      raise exception 'client_tx_id مستخدم ببيانات مختلفة';
    end if;
    return jsonb_build_object(
      'change_id',v_existing.id,'order_id',v_existing.order_id,
      'old_method',v_existing.old_method,'new_method',v_existing.new_method,
      'amount',v_existing.amount
    );
  end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'الأوردر غير موجود'; end if;
  if not public.has_branch_access(v_order.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_order.order_type<>'delivery' then raise exception 'تعديل طريقة الدفع متاح لأوردرات الدليفري فقط'; end if;
  if v_order.status='cancelled' then raise exception 'لا يمكن تعديل دفع أوردر ملغي'; end if;
  if v_order.driver_settled_at is not null then
    raise exception 'لا يمكن تعديل طريقة الدفع بعد تسوية المندوب';
  end if;
  if lower(coalesce(v_order.payment_method,''))='mixed' then
    raise exception 'الدفع المختلط يحتاج مسار تصحيح مالي منفصل';
  end if;

  if not exists(
    select 1
    from public.payment_methods pm
    join public.branch_payment_methods bpm on bpm.payment_method_id=pm.id
    where lower(pm.code)=v_method
      and pm.active=true
      and bpm.branch_id=v_order.branch_id
      and bpm.active=true
  ) then raise exception 'طريقة الدفع غير متاحة لهذا الفرع'; end if;

  select count(*) into v_payment_count
  from public.order_payments
  where order_id=v_order.id;

  if v_payment_count>1 then
    raise exception 'الأوردر به أكثر من حركة دفع ويحتاج مسار تصحيح مالي منفصل';
  end if;

  v_old_method:=lower(coalesce(v_order.payment_method,''));
  if v_old_method='' then v_old_method:='unknown'; end if;

  update public.orders
  set payment_method=v_method
  where id=v_order.id;

  if v_payment_count=0 then
    insert into public.order_payments(order_id,method,amount)
    values(v_order.id,v_method,coalesce(v_order.total,0));
  else
    update public.order_payments
    set method=v_method
    where order_id=v_order.id;
  end if;

  insert into public.delivery_payment_changes_v1(
    order_id,branch_id,employee_id,old_method,new_method,amount,client_tx_id,request_digest
  ) values(
    v_order.id,v_order.branch_id,v_emp,v_old_method,v_method,coalesce(v_order.total,0),v_key,v_digest
  )
  returning id into v_id;

  insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
  values(
    v_emp,v_order.branch_id,'delivery_payment_method_changed','order',v_order.id,
    jsonb_build_object('old_method',v_old_method,'new_method',v_method,'amount',coalesce(v_order.total,0))
  );

  return jsonb_build_object(
    'change_id',v_id,'order_id',v_order.id,'old_method',v_old_method,
    'new_method',v_method,'amount',coalesce(v_order.total,0)
  );
end;
$$;

revoke all on function public.change_delivery_order_payment_v1(bigint,text,text) from public,anon;
grant execute on function public.change_delivery_order_payment_v1(bigint,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Customer 360: read-only cross-branch operational view, filtered by access.
-- ---------------------------------------------------------------------------
create or replace function public.customer_360_v1(
  p_customer_id bigint,
  p_branch_id bigint default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_customer public.customers%rowtype;
  v_from timestamptz:=coalesce(p_from,'2000-01-01'::timestamptz);
  v_to timestamptz:=coalesce(p_to,now()+interval '1 day');
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('customers')) then
    raise exception 'ليس لديك صلاحية العملاء';
  end if;
  if p_branch_id is not null and not public.has_branch_access(p_branch_id) then
    raise exception 'ليس لديك صلاحية لهذا الفرع';
  end if;
  if v_to<=v_from then raise exception 'الفترة غير صحيحة'; end if;

  select * into v_customer from public.customers where id=p_customer_id;
  if not found then raise exception 'العميل غير موجود'; end if;

  select jsonb_build_object(
    'customer',to_jsonb(v_customer),
    'addresses',coalesce((
      select jsonb_agg(to_jsonb(a) order by a.is_default desc,a.id desc)
      from public.customer_addresses a where a.customer_id=p_customer_id
    ),'[]'::jsonb),
    'summary',coalesce((
      select jsonb_build_object(
        'orders_count',count(*) filter(where o.status<>'cancelled'),
        'cancelled_count',count(*) filter(where o.status='cancelled'),
        'sales_total',round(coalesce(sum(o.total) filter(where o.status<>'cancelled'),0),2),
        'average_order',round(coalesce(avg(o.total) filter(where o.status<>'cancelled'),0),2),
        'first_order_at',min(o.created_at) filter(where o.status<>'cancelled'),
        'last_order_at',max(o.created_at) filter(where o.status<>'cancelled'),
        'returns_total',coalesce((
          select round(coalesce(sum(r.total),0),2)
          from public.returns r
          join public.orders ro on ro.id=r.order_id
          where ro.customer_id=p_customer_id
            and public.has_branch_access(ro.branch_id)
            and (p_branch_id is null or ro.branch_id=p_branch_id)
            and r.created_at>=v_from and r.created_at<v_to
        ),0)
      )
      from public.orders o
      where o.customer_id=p_customer_id
        and public.has_branch_access(o.branch_id)
        and (p_branch_id is null or o.branch_id=p_branch_id)
        and o.created_at>=v_from and o.created_at<v_to
    ),jsonb_build_object('orders_count',0,'cancelled_count',0,'sales_total',0,'average_order',0,'returns_total',0)),
    'branches',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.sales_total desc)
      from (
        select o.branch_id,coalesce(b.name,'فرع #'||o.branch_id::text) branch_name,
               count(*) filter(where o.status<>'cancelled') orders_count,
               round(coalesce(sum(o.total) filter(where o.status<>'cancelled'),0),2) sales_total,
               max(o.created_at) last_order_at
        from public.orders o
        left join public.branches b on b.id=o.branch_id
        where o.customer_id=p_customer_id
          and public.has_branch_access(o.branch_id)
          and (p_branch_id is null or o.branch_id=p_branch_id)
          and o.created_at>=v_from and o.created_at<v_to
        group by o.branch_id,b.name
      ) x
    ),'[]'::jsonb),
    'payments',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.amount desc)
      from (
        select op.method,round(sum(op.amount),2) amount,count(distinct op.order_id) orders_count
        from public.order_payments op
        join public.orders o on o.id=op.order_id
        where o.customer_id=p_customer_id
          and o.status<>'cancelled'
          and public.has_branch_access(o.branch_id)
          and (p_branch_id is null or o.branch_id=p_branch_id)
          and o.created_at>=v_from and o.created_at<v_to
        group by op.method
      ) x
    ),'[]'::jsonb),
    'top_products',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.qty desc,x.sales_total desc)
      from (
        select oi.product_name,round(sum(oi.quantity),3) qty,round(sum(oi.total),2) sales_total
        from public.order_items oi
        join public.orders o on o.id=oi.order_id
        where o.customer_id=p_customer_id
          and o.status<>'cancelled'
          and public.has_branch_access(o.branch_id)
          and (p_branch_id is null or o.branch_id=p_branch_id)
          and o.created_at>=v_from and o.created_at<v_to
        group by oi.product_name
        order by sum(oi.quantity) desc,sum(oi.total) desc
        limit 10
      ) x
    ),'[]'::jsonb),
    'top_modifiers',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.qty desc,x.sales_total desc)
      from (
        select m.modifier_name,
               round(sum(oi.quantity),3) qty,
               round(sum(coalesce(m.price,0)*oi.quantity),2) sales_total
        from public.order_item_modifiers m
        join public.order_items oi on oi.id=m.order_item_id
        join public.orders o on o.id=oi.order_id
        where o.customer_id=p_customer_id
          and o.status<>'cancelled'
          and public.has_branch_access(o.branch_id)
          and (p_branch_id is null or o.branch_id=p_branch_id)
          and o.created_at>=v_from and o.created_at<v_to
        group by m.modifier_name
        order by sum(oi.quantity) desc,sum(coalesce(m.price,0)*oi.quantity) desc
        limit 10
      ) x
    ),'[]'::jsonb),
    'timeline',coalesce((
      select jsonb_agg(to_jsonb(t) order by t.event_at desc,t.document_id desc)
      from (
        select o.created_at event_at,'sale'::text event_type,o.id document_id,
               coalesce(nullif(o.order_number,''),o.invoice_number::text,o.id::text) document_no,
               o.branch_id,coalesce(b.name,'فرع #'||o.branch_id::text) branch_name,
               o.total amount,o.status,o.order_type,o.payment_method,o.employee_id,
               coalesce(e.name,'موظف') employee_name
        from public.orders o
        left join public.branches b on b.id=o.branch_id
        left join public.employees e on e.id=o.employee_id
        where o.customer_id=p_customer_id
          and public.has_branch_access(o.branch_id)
          and (p_branch_id is null or o.branch_id=p_branch_id)
          and o.created_at>=v_from and o.created_at<v_to
        union all
        select r.created_at,'return'::text,r.id,r.return_number::text,
               r.branch_id,coalesce(b.name,'فرع #'||r.branch_id::text),
               -r.total,'returned'::text,'return'::text,null::text,r.employee_id,
               coalesce(e.name,'موظف')
        from public.returns r
        join public.orders o on o.id=r.order_id
        left join public.branches b on b.id=r.branch_id
        left join public.employees e on e.id=r.employee_id
        where o.customer_id=p_customer_id
          and public.has_branch_access(r.branch_id)
          and (p_branch_id is null or r.branch_id=p_branch_id)
          and r.created_at>=v_from and r.created_at<v_to
        order by event_at desc,document_id desc
        limit 300
      ) t
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.customer_360_v1(bigint,bigint,timestamptz,timestamptz) from public,anon;
grant execute on function public.customer_360_v1(bigint,bigint,timestamptz,timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Return Approval V1, ported over the current return/recipe baseline.
--    return_items remain the durable return evidence, so the existing 10.5.8
--    AFTER INSERT recipe-return trigger restores frozen historical consumption.
-- ---------------------------------------------------------------------------
alter table public.returns
  add column if not exists approved_by_employee_id bigint references public.employees(id) on delete set null,
  add column if not exists approval_request_id bigint,
  add column if not exists request_digest text;

create table if not exists public.return_approval_requests(
  id bigint generated by default as identity primary key,
  branch_id bigint not null references public.branches(id) on delete restrict,
  order_id bigint not null references public.orders(id) on delete restrict,
  requester_employee_id bigint not null references public.employees(id) on delete restrict,
  requester_shift_id bigint not null references public.shifts(id) on delete restrict,
  requester_name text not null,
  order_bon_number bigint,
  order_invoice_number bigint,
  reason text not null,
  notes text,
  items jsonb not null,
  payments jsonb not null,
  expected_total numeric(12,2) not null check(expected_total>=0),
  status text not null default 'pending' check(status in ('pending','approved','rejected','expired')),
  client_tx_id text not null unique,
  request_digest text not null,
  expires_at timestamptz not null,
  approver_employee_id bigint references public.employees(id) on delete set null,
  decision_at timestamptz,
  decision_note text,
  decision_client_tx_id text,
  decision_digest text,
  return_id bigint references public.returns(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists return_approval_requests_decision_tx_uidx
  on public.return_approval_requests(decision_client_tx_id)
  where decision_client_tx_id is not null;
create index if not exists return_approval_requests_pending_idx
  on public.return_approval_requests(branch_id,status,expires_at,created_at desc);
create unique index if not exists returns_approval_request_uidx
  on public.returns(approval_request_id)
  where approval_request_id is not null;

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conname='returns_approval_request_fk'
      and conrelid='public.returns'::regclass
  ) then
    alter table public.returns
      add constraint returns_approval_request_fk
      foreign key(approval_request_id)
      references public.return_approval_requests(id)
      on delete set null;
  end if;
end
$$;

alter table public.return_approval_requests enable row level security;
grant select on public.return_approval_requests to authenticated;
grant usage,select on sequence public.return_approval_requests_id_seq to authenticated;

drop policy if exists return_approval_requests_read on public.return_approval_requests;
create policy return_approval_requests_read
on public.return_approval_requests for select to authenticated
using(
  requester_employee_id=public.current_employee_id()
  or (
    public.has_branch_access(branch_id)
    and (public.is_admin() or public.has_permission('returnApprovals'))
  )
);

create or replace function public.return_approval_validate_v1(
  p_order_id bigint,p_items jsonb,p_payments jsonb
) returns numeric
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.orders%rowtype;
  v_item jsonb;
  v_oi public.order_items%rowtype;
  v_qty numeric(12,3);
  v_prev numeric(12,3);
  v_sub numeric(12,2):=0;
  v_ratio numeric(18,8):=0;
  v_total numeric(12,2):=0;
  v_pay jsonb;
  v_pay_total numeric(12,2):=0;
  v_method text;
  v_amount numeric(12,2);
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'الفاتورة غير موجودة'; end if;
  if v_order.status='cancelled' then raise exception 'لا يمكن عمل مرتجع لفاتورة ملغية'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'اختر صنفًا واحدًا على الأقل';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_oi from public.order_items
    where id=(v_item->>'order_item_id')::bigint and order_id=v_order.id;
    if not found then raise exception 'صنف المرتجع غير موجود بالفاتورة'; end if;
    v_qty:=coalesce((v_item->>'quantity')::numeric,0);
    if v_qty<=0 then raise exception 'كمية المرتجع غير صحيحة'; end if;
    select coalesce(sum(ri.quantity),0) into v_prev
    from public.return_items ri
    join public.returns r on r.id=ri.return_id
    where r.order_id=v_order.id and ri.order_item_id=v_oi.id;
    if v_qty+v_prev>v_oi.quantity then
      raise exception 'كمية المرتجع أكبر من الكمية المتاحة للصنف %',v_oi.product_name;
    end if;
    v_sub:=v_sub+round((coalesce(v_oi.total,0)/nullif(v_oi.quantity,0))*v_qty,2);
  end loop;

  if coalesce(v_order.subtotal,0)>0 then v_ratio:=least(1,v_sub/v_order.subtotal); end if;
  v_total:=greatest(0,round(
    v_sub
    - round(coalesce(v_order.discount,0)*v_ratio,2)
    + round(coalesce(v_order.tax_amount,0)*v_ratio,2)
    + round(coalesce(v_order.service_amount,0)*v_ratio,2)
  ,2));

  if p_payments is null or jsonb_typeof(p_payments)<>'array' or jsonb_array_length(p_payments)=0 then
    raise exception 'حدد طريقة رد المبلغ';
  end if;

  for v_pay in select * from jsonb_array_elements(p_payments) loop
    v_method:=nullif(trim(v_pay->>'method'),'');
    v_amount:=coalesce((v_pay->>'amount')::numeric,0);
    if v_method is null or v_amount<=0 then raise exception 'بيانات رد المبلغ غير صحيحة'; end if;
    if not exists(
      select 1 from public.payment_methods pm
      join public.branch_payment_methods bpm on bpm.payment_method_id=pm.id
      where pm.code=v_method and pm.active=true and bpm.branch_id=v_order.branch_id and bpm.active=true
    ) then raise exception 'طريقة رد المبلغ غير متاحة للفرع'; end if;
    v_pay_total:=v_pay_total+v_amount;
  end loop;

  if abs(v_pay_total-v_total)>0.01 then raise exception 'إجمالي رد المبلغ يجب أن يساوي %',v_total; end if;
  return v_total;
end;
$$;

revoke all on function public.return_approval_validate_v1(bigint,jsonb,jsonb) from public,anon,authenticated;

create or replace function public.create_approved_order_return_v1(
  p_order_id bigint,p_reason text,p_notes text,p_items jsonb,p_payments jsonb,
  p_requester_employee_id bigint,p_requester_shift_id bigint,
  p_approver_employee_id bigint,p_approval_request_id bigint
) returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.orders%rowtype;
  v_return_id bigint;
  v_return_no bigint;
  v_item jsonb;
  v_oi public.order_items%rowtype;
  v_qty numeric(12,3);
  v_line numeric(12,2);
  v_sub numeric(12,2):=0;
  v_ratio numeric(18,8):=0;
  v_discount numeric(12,2):=0;
  v_tax numeric(12,2):=0;
  v_service numeric(12,2):=0;
  v_total numeric(12,2):=0;
  v_pay jsonb;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'الفاتورة غير موجودة'; end if;

  if not exists(
    select 1 from public.shifts s
    where s.id=p_requester_shift_id
      and s.employee_id=p_requester_employee_id
      and s.branch_id=v_order.branch_id
      and s.status='open' and s.closed_at is null
  ) then raise exception 'وردية الموظف لم تعد مفتوحة'; end if;

  if not exists(
    select 1 from public.employees e
    where e.id=p_requester_employee_id
      and coalesce(e.active,true)=true
      and (
        e.role='admin'
        or e.branch_id=v_order.branch_id
        or exists(
          select 1 from public.employee_branches eb
          where eb.employee_id=e.id and eb.branch_id=v_order.branch_id
        )
      )
  ) then raise exception 'الموظف لم يعد مصرحًا له على هذا الفرع'; end if;

  v_total:=public.return_approval_validate_v1(p_order_id,p_items,p_payments);

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_oi from public.order_items
    where id=(v_item->>'order_item_id')::bigint and order_id=v_order.id;
    v_qty:=(v_item->>'quantity')::numeric;
    v_line:=round((coalesce(v_oi.total,0)/nullif(v_oi.quantity,0))*v_qty,2);
    v_sub:=v_sub+v_line;
  end loop;

  if coalesce(v_order.subtotal,0)>0 then v_ratio:=least(1,v_sub/v_order.subtotal); end if;
  v_discount:=round(coalesce(v_order.discount,0)*v_ratio,2);
  v_tax:=round(coalesce(v_order.tax_amount,0)*v_ratio,2);
  v_service:=round(coalesce(v_order.service_amount,0)*v_ratio,2);

  insert into public.branch_return_counters(branch_id,next_number)
  values(v_order.branch_id,2)
  on conflict(branch_id) do update
    set next_number=public.branch_return_counters.next_number+1
  returning next_number-1 into v_return_no;

  insert into public.returns(
    branch_id,return_number,order_id,original_invoice_number,original_bon_number,
    employee_id,shift_id,reason,notes,subtotal,discount_adjustment,tax_adjustment,
    service_adjustment,total,approved_by_employee_id,approval_request_id
  ) values(
    v_order.branch_id,v_return_no,v_order.id,v_order.invoice_number,v_order.bon_number,
    p_requester_employee_id,p_requester_shift_id,trim(p_reason),
    nullif(trim(coalesce(p_notes,'')),''),v_sub,v_discount,v_tax,v_service,v_total,
    p_approver_employee_id,p_approval_request_id
  )
  returning id into v_return_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_oi from public.order_items
    where id=(v_item->>'order_item_id')::bigint and order_id=v_order.id;
    v_qty:=(v_item->>'quantity')::numeric;
    v_line:=round((coalesce(v_oi.total,0)/nullif(v_oi.quantity,0))*v_qty,2);
    insert into public.return_items(
      return_id,order_item_id,product_id,product_name,quantity,unit_refund,total
    ) values(
      v_return_id,v_oi.id,v_oi.product_id,v_oi.product_name,v_qty,round(v_line/v_qty,2),v_line
    );
  end loop;

  for v_pay in select * from jsonb_array_elements(p_payments) loop
    insert into public.return_payments(return_id,method,amount)
    values(v_return_id,trim(v_pay->>'method'),(v_pay->>'amount')::numeric);
  end loop;

  return v_return_id;
end;
$$;

revoke all on function public.create_approved_order_return_v1(bigint,text,text,jsonb,jsonb,bigint,bigint,bigint,bigint) from public,anon,authenticated;

create or replace function public.request_order_return_approval_v1(
  p_order_id bigint,p_reason text,p_notes text,p_items jsonb,p_payments jsonb,p_client_tx_id text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_emp bigint;
  v_emp_name text;
  v_order public.orders%rowtype;
  v_shift bigint;
  v_total numeric(12,2);
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_digest text;
  v_existing public.return_approval_requests%rowtype;
  v_id bigint;
  v_expires timestamptz:=now()+interval '5 minutes';
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('returns')) then
    raise exception 'ليس لديك صلاحية طلب مرتجع';
  end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'سبب المرتجع مطلوب'; end if;

  v_emp:=public.current_employee_id();
  if v_emp is null then raise exception 'المستخدم غير مربوط بموظف'; end if;
  select name into v_emp_name from public.employees where id=v_emp;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'الفاتورة غير موجودة'; end if;
  if not public.has_branch_access(v_order.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;

  select id into v_shift
  from public.shifts
  where branch_id=v_order.branch_id and employee_id=v_emp and status='open' and closed_at is null
  order by opened_at desc limit 1;
  if v_shift is null then raise exception 'افتح وردية أولًا قبل طلب المرتجع'; end if;

  v_digest:=md5(jsonb_build_object(
    'employee_id',v_emp,'shift_id',v_shift,'order_id',p_order_id,
    'reason',trim(p_reason),'notes',coalesce(nullif(trim(coalesce(p_notes,'')),''),''),
    'items',coalesce(p_items,'[]'::jsonb),'payments',coalesce(p_payments,'[]'::jsonb)
  )::text);

  perform pg_advisory_xact_lock(hashtextextended('return-approval-request:'||v_key,0));
  select * into v_existing from public.return_approval_requests where client_tx_id=v_key limit 1;

  if found then
    if v_existing.request_digest<>v_digest then raise exception 'معرف الطلب مستخدم ببيانات مختلفة'; end if;
    return jsonb_build_object(
      'request_id',v_existing.id,'status',v_existing.status,
      'expected_total',v_existing.expected_total,'expires_at',v_existing.expires_at,
      'return_id',v_existing.return_id
    );
  end if;

  v_total:=public.return_approval_validate_v1(p_order_id,p_items,p_payments);

  insert into public.return_approval_requests(
    branch_id,order_id,requester_employee_id,requester_shift_id,requester_name,
    order_bon_number,order_invoice_number,reason,notes,items,payments,expected_total,
    client_tx_id,request_digest,expires_at
  ) values(
    v_order.branch_id,v_order.id,v_emp,v_shift,coalesce(v_emp_name,'موظف'),
    v_order.bon_number,v_order.invoice_number,trim(p_reason),
    nullif(trim(coalesce(p_notes,'')),''),p_items,p_payments,v_total,
    v_key,v_digest,v_expires
  ) returning id into v_id;

  insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
  values(v_emp,v_order.branch_id,'return_approval_requested','return_approval_request',v_id,
    jsonb_build_object('order_id',v_order.id,'shift_id',v_shift,'expected_total',v_total));

  return jsonb_build_object(
    'request_id',v_id,'status','pending','expected_total',v_total,
    'expires_at',v_expires,'return_id',null
  );
end;
$$;

revoke all on function public.request_order_return_approval_v1(bigint,text,text,jsonb,jsonb,text) from public,anon;
grant execute on function public.request_order_return_approval_v1(bigint,text,text,jsonb,jsonb,text) to authenticated;

create or replace function public.decide_order_return_approval_v1(
  p_request_id bigint,p_decision text,p_note text,p_client_tx_id text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_emp bigint;
  v_req public.return_approval_requests%rowtype;
  v_decision text:=lower(trim(coalesce(p_decision,'')));
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_digest text;
  v_return_id bigint;
  v_total numeric(12,2);
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if v_key is null then raise exception 'معرف القرار مطلوب'; end if;
  if v_decision not in ('approve','reject') then raise exception 'قرار غير صحيح'; end if;

  v_emp:=public.current_employee_id();
  if v_emp is null then raise exception 'المستخدم غير مربوط بموظف'; end if;

  perform pg_advisory_xact_lock(hashtextextended('return-approval-decision:'||p_request_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('return-approval-decision-tx:'||v_key,0));

  select * into v_req
  from public.return_approval_requests
  where id=p_request_id
  for update;
  if not found then raise exception 'طلب الاعتماد غير موجود'; end if;

  if not public.has_branch_access(v_req.branch_id)
     or not (public.is_admin() or public.has_permission('returnApprovals')) then
    raise exception 'ليس لديك صلاحية اعتماد المرتجعات لهذا الفرع';
  end if;
  if v_emp=v_req.requester_employee_id then raise exception 'لا يمكن اعتماد طلب المرتجع الذي أنشأته بنفسك'; end if;

  v_digest:=md5(jsonb_build_object(
    'request_id',p_request_id,'decision',v_decision,
    'note',coalesce(nullif(trim(coalesce(p_note,'')),''),'')
  )::text);

  if v_req.decision_client_tx_id=v_key and v_req.decision_digest is distinct from v_digest then
    raise exception 'معرف القرار مستخدم ببيانات مختلفة';
  end if;

  if v_req.status<>'pending' then
    return jsonb_build_object(
      'request_id',v_req.id,'status',v_req.status,'return_id',v_req.return_id,
      'approver_employee_id',v_req.approver_employee_id,'decision_at',v_req.decision_at
    );
  end if;

  if now()>v_req.expires_at then
    update public.return_approval_requests set status='expired',updated_at=now() where id=v_req.id;
    return jsonb_build_object('request_id',v_req.id,'status','expired','return_id',null);
  end if;

  if v_decision='reject' then
    update public.return_approval_requests
    set status='rejected',approver_employee_id=v_emp,decision_at=now(),
        decision_note=nullif(trim(coalesce(p_note,'')),''),
        decision_client_tx_id=v_key,decision_digest=v_digest,updated_at=now()
    where id=v_req.id;

    insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
    values(v_emp,v_req.branch_id,'return_approval_rejected','return_approval_request',v_req.id,
      jsonb_build_object('order_id',v_req.order_id,'requester_employee_id',v_req.requester_employee_id));

    return jsonb_build_object(
      'request_id',v_req.id,'status','rejected','return_id',null,'approver_employee_id',v_emp
    );
  end if;

  if not exists(
    select 1 from public.shifts s
    where s.id=v_req.requester_shift_id
      and s.employee_id=v_req.requester_employee_id
      and s.branch_id=v_req.branch_id
      and s.status='open' and s.closed_at is null
  ) then raise exception 'وردية الموظف لم تعد مفتوحة'; end if;

  v_total:=public.return_approval_validate_v1(v_req.order_id,v_req.items,v_req.payments);
  if abs(v_total-v_req.expected_total)>0.01 then raise exception 'قيمة المرتجع تغيرت منذ إنشاء طلب الاعتماد'; end if;

  v_return_id:=public.create_approved_order_return_v1(
    v_req.order_id,v_req.reason,v_req.notes,v_req.items,v_req.payments,
    v_req.requester_employee_id,v_req.requester_shift_id,v_emp,v_req.id
  );

  update public.return_approval_requests
  set status='approved',approver_employee_id=v_emp,decision_at=now(),
      decision_note=nullif(trim(coalesce(p_note,'')),''),
      decision_client_tx_id=v_key,decision_digest=v_digest,return_id=v_return_id,updated_at=now()
  where id=v_req.id;

  insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
  values(v_emp,v_req.branch_id,'return_approval_approved','return_approval_request',v_req.id,
    jsonb_build_object(
      'order_id',v_req.order_id,'requester_employee_id',v_req.requester_employee_id,
      'requester_shift_id',v_req.requester_shift_id,'return_id',v_return_id,'total',v_total
    ));

  return jsonb_build_object(
    'request_id',v_req.id,'status','approved','return_id',v_return_id,
    'approver_employee_id',v_emp
  );
end;
$$;

revoke all on function public.decide_order_return_approval_v1(bigint,text,text,text) from public,anon;
grant execute on function public.decide_order_return_approval_v1(bigint,text,text,text) to authenticated;

-- Direct execution is a separate permission. Keep the current canonical return
-- owner and its recipe trigger; only the durable public idempotent wrapper changes.
create or replace function public.create_order_return_idempotent(
  p_order_id bigint,p_reason text,p_notes text,p_items jsonb,p_payments jsonb,p_client_tx_id text
) returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id bigint;
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_digest text;
  v_existing_digest text;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('returnExecute')) then
    raise exception 'المرتجع يحتاج اعتماد مدير';
  end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;

  v_digest:=md5(jsonb_build_object(
    'order_id',p_order_id,'reason',trim(coalesce(p_reason,'')),
    'notes',coalesce(p_notes,''),'items',coalesce(p_items,'[]'::jsonb),
    'payments',coalesce(p_payments,'[]'::jsonb)
  )::text);

  perform pg_advisory_xact_lock(hashtextextended('create-order-return:'||v_key,0));

  select id,request_digest into v_id,v_existing_digest
  from public.returns where client_tx_id=v_key limit 1;

  if v_id is not null then
    if v_existing_digest is not null and v_existing_digest<>v_digest then
      raise exception 'معرف الحركة مستخدم ببيانات مختلفة';
    end if;
    return v_id;
  end if;

  v_id:=public.create_order_return(p_order_id,p_reason,p_notes,p_items,p_payments);
  update public.returns set client_tx_id=v_key,request_digest=v_digest where id=v_id;
  return v_id;
end;
$$;

revoke all on function public.create_order_return(bigint,text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.create_order_return_idempotent(bigint,text,text,jsonb,jsonb,text) from public,anon;
grant execute on function public.create_order_return_idempotent(bigint,text,text,jsonb,jsonb,text) to authenticated;

notify pgrst,'reload schema';
commit;
