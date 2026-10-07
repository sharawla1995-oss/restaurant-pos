-- Sharawla POS — Beta Multi-Tenant V1 ON CONFLICT target hardening
-- SOURCE PREPARATION ONLY. Generated from live Beta function bodies.
-- Apply AFTER tenant shadow uniques exist and BEFORE later specialized public/offline RPC drafts.
--
-- Explicit ON CONFLICT targets are changed from (key...) to
-- (business_id,key...) so conflict ownership is tenant-scoped.
-- Targetless ON CONFLICT DO NOTHING statements are intentionally left unchanged;
-- they become safe only after legacy global non-primary uniques are finalized.

begin;

do $guard$
begin
  if current_setting('sharawla.multitenant_apply', true) is distinct from 'beta-only-approved' then
    raise exception 'MULTITENANT_V1_SOURCE_ONLY: explicit Beta apply guard is not set';
  end if;
end
$guard$;

-- admin_set_employee_action_permission_v2(p_employee_id bigint, p_action_code text, p_allowed boolean)
CREATE OR REPLACE FUNCTION public.admin_set_employee_action_permission_v2(p_employee_id bigint, p_action_code text, p_allowed boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$begin if auth.uid() is null or not public.is_admin() then raise exception 'للمدير فقط';end if;if not exists(select 1 from public.employees where id=p_employee_id and active is distinct from false) then raise exception 'الموظف غير موجود أو موقوف';end if;if not exists(select 1 from public.permission_actions_v2 where code=p_action_code and active=true) then raise exception 'الصلاحية غير موجودة';end if;insert into public.employee_action_permissions_v2(employee_id,action_code,allowed,updated_at) values(p_employee_id,p_action_code,p_allowed,now()) on conflict(business_id,employee_id,action_code) do update set allowed=excluded.allowed,updated_at=now();return true;end;$function$


-- assign_order_numbers()
CREATE OR REPLACE FUNCTION public.assign_order_numbers()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v bigint;
begin

  -- ربط الطلب بالوردية المفتوحة للموظف إن أمكن
  if new.shift_id is null and new.employee_id is not null then
    select s.id
    into new.shift_id
    from public.shifts s
    where s.branch_id=new.branch_id
      and s.employee_id=new.employee_id
      and s.status='open'
      and s.closed_at is null
    order by s.opened_at desc
    limit 1;
  end if;

  -- رقم الفاتورة الداخلي المستمر لكل فرع
  if new.invoice_number is null then

    insert into public.branch_invoice_counters(
      branch_id,
      next_number
    )
    values(
      new.branch_id,
      2
    )
    on conflict(business_id,branch_id)
    do update
    set next_number=
      public.branch_invoice_counters.next_number+1
    returning next_number-1 into v;

    new.invoice_number:=v;

  end if;

  -- رقم البون يبدأ من 1 لكل وردية
  if new.shift_id is not null
     and new.bon_number is null then

    insert into public.shift_bon_counters(
      shift_id,
      branch_id,
      next_number
    )
    values(
      new.shift_id,
      new.branch_id,
      2
    )
    on conflict(business_id,shift_id)
    do update
    set next_number=
      public.shift_bon_counters.next_number+1
    returning next_number-1 into v;

    new.bon_number:=v::integer;

  end if;

  return new;
end;
$function$


-- commerce_customer_price_tier_set_v2(p_customer_id bigint, p_tier_id bigint)
CREATE OR REPLACE FUNCTION public.commerce_customer_price_tier_set_v2(p_customer_id bigint, p_tier_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'إدارة فئات العملاء للمدير فقط';end if;
 if not exists(select 1 from public.customers where id=p_customer_id) then raise exception 'العميل غير موجود';end if;
 if p_tier_id is null then delete from public.commerce_customer_price_tiers where customer_id=p_customer_id;return;end if;
 if not exists(select 1 from public.commerce_price_tiers where id=p_tier_id and active=true) then raise exception 'فئة السعر غير صالحة';end if;
 insert into public.commerce_customer_price_tiers(customer_id,tier_id) values(p_customer_id,p_tier_id) on conflict(business_id,customer_id) do update set tier_id=excluded.tier_id,updated_at=now();
end;$function$


-- copy_branch_configuration(p_source_branch_id bigint, p_target_branch_id bigint)
CREATE OR REPLACE FUNCTION public.copy_branch_configuration(p_source_branch_id bigint, p_target_branch_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if not (public.current_employee_role()='admin' or public.has_permission('branchManagement')) then
    raise exception 'ليس لديك صلاحية إدارة الفروع';
  end if;

  if p_source_branch_id=p_target_branch_id then
    raise exception 'اختر فرعين مختلفين';
  end if;

  if not exists(select 1 from public.branches where id=p_source_branch_id)
     or not exists(select 1 from public.branches where id=p_target_branch_id) then
    raise exception 'أحد الفروع غير موجود';
  end if;

  insert into public.branch_products(
    branch_id,
    product_id,
    active,
    price_override,
    website_paused_until
  )
  select
    p_target_branch_id,
    p.id,
    coalesce(src.active,true),
    src.price_override,
    null
  from public.products p
  left join public.branch_products src
    on src.branch_id=p_source_branch_id
   and src.product_id=p.id
  on conflict(business_id,branch_id,product_id)
  do update set
    active=excluded.active,
    price_override=excluded.price_override,
    website_paused_until=null;

  insert into public.branch_website_settings(
    branch_id,
    orders_open,
    orders_paused_until,
    prep_min,
    prep_max,
    updated_at
  )
  select
    p_target_branch_id,
    true,
    null,
    coalesce(s.prep_min,30),
    coalesce(s.prep_max,45),
    now()
  from (select 1) x
  left join public.branch_website_settings s
    on s.branch_id=p_source_branch_id
  on conflict(business_id,branch_id)
  do update set
    prep_min=excluded.prep_min,
    prep_max=excluded.prep_max,
    orders_paused_until=null,
    updated_at=now();
end;
$function$


-- create_approved_order_return_v1(p_order_id bigint, p_reason text, p_notes text, p_items jsonb, p_payments jsonb, p_requester_employee_id bigint, p_requester_shift_id bigint, p_approver_employee_id bigint, p_approval_request_id bigint)
CREATE OR REPLACE FUNCTION public.create_approved_order_return_v1(p_order_id bigint, p_reason text, p_notes text, p_items jsonb, p_payments jsonb, p_requester_employee_id bigint, p_requester_shift_id bigint, p_approver_employee_id bigint, p_approval_request_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  on conflict(business_id,branch_id) do update
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

  -- Stable 10.5.12 restores recipe stock via the return_items trigger.
  -- Advanced Beta/Point-4 runtimes use the authoritative food return owner
  -- instead. Never run both paths for the same return.
  if not exists(
       select 1 from pg_trigger
       where tgrelid='public.return_items'::regclass
         and tgname='trg_recipe_return_item_fail_open_v1'
         and not tgisinternal
     )
     and to_regprocedure('public.food_apply_return_consumption_v1(bigint,bigint,jsonb,text)') is not null then
    execute 'select public.food_apply_return_consumption_v1($1,$2,$3,$4)'
      using v_return_id,p_order_id,p_items,
            'return-approval-food:'||p_approval_request_id::text;
  end if;

  return v_return_id;
end;
$function$


-- create_branch_full(p_name text, p_phone text, p_address text, p_source_branch_id bigint, p_website_visible boolean)
CREATE OR REPLACE FUNCTION public.create_branch_full(p_name text, p_phone text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_source_branch_id bigint DEFAULT NULL::bigint, p_website_visible boolean DEFAULT true)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_branch_id bigint;
  v_employee_id bigint;
  v_prep_min integer := 30;
  v_prep_max integer := 45;
begin
  if not (
    public.current_employee_role() = 'admin'
    or public.has_permission('branchManagement')
  ) then
    raise exception 'ليس لديك صلاحية إدارة الفروع';
  end if;

  if nullif(trim(p_name),'') is null then
    raise exception 'اسم الفرع مطلوب';
  end if;

  if exists(
    select 1
    from public.branches
    where lower(trim(name)) = lower(trim(p_name))
      and active = true
  ) then
    raise exception 'يوجد فرع فعال بنفس الاسم';
  end if;

  if p_source_branch_id is not null
     and not exists(
       select 1 from public.branches
       where id = p_source_branch_id
     ) then
    raise exception 'الفرع النموذج غير موجود';
  end if;

  insert into public.branches(
    name,
    active,
    phone,
    address,
    website_visible,
    sort_order
  )
  values(
    trim(p_name),
    true,
    nullif(trim(coalesce(p_phone,'')),''),
    nullif(trim(coalesce(p_address,'')),''),
    coalesce(p_website_visible,true),
    (select coalesce(max(sort_order),0)+1 from public.branches)
  )
  returning id into v_branch_id;

  if p_source_branch_id is not null then
    select
      coalesce(prep_min,30),
      coalesce(prep_max,45)
    into
      v_prep_min,
      v_prep_max
    from public.branch_website_settings
    where branch_id = p_source_branch_id;
  end if;

  insert into public.branch_website_settings(
    branch_id,
    orders_open,
    orders_paused_until,
    prep_min,
    prep_max,
    updated_at
  )
  values(
    v_branch_id,
    true,
    null,
    v_prep_min,
    v_prep_max,
    now()
  )
  on conflict(business_id,branch_id)
  do update set
    prep_min = excluded.prep_min,
    prep_max = excluded.prep_max,
    updated_at = now();

  -- إضافة كل الأصناف للفرع الجديد
  -- ونسخ السعر والتوافر من الفرع النموذج
  -- بدون نسخ الإيقافات المؤقتة
  insert into public.branch_products(
    branch_id,
    product_id,
    active,
    price_override,
    website_paused_until
  )
  select
    v_branch_id,
    p.id,
    coalesce(src.active,true),
    src.price_override,
    null
  from public.products p
  left join public.branch_products src
    on src.product_id = p.id
   and src.branch_id = p_source_branch_id
  on conflict(business_id,branch_id,product_id) do nothing;

  -- ربط منشئ الفرع بالفرع الجديد
  v_employee_id := public.current_employee_id();

  if v_employee_id is not null then
    insert into public.employee_branches(
      employee_id,
      branch_id
    )
    values(
      v_employee_id,
      v_branch_id
    )
    on conflict do nothing;
  end if;

  return v_branch_id;
end;
$function$


-- create_order_return(p_order_id bigint, p_reason text, p_notes text, p_items jsonb, p_payments jsonb)
CREATE OR REPLACE FUNCTION public.create_order_return(p_order_id bigint, p_reason text, p_notes text, p_items jsonb, p_payments jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_order public.orders%rowtype;
  v_emp bigint;
  v_shift bigint;
  v_allow_closed boolean:=false;
  v_return_id bigint;
  v_return_no bigint;
  v_item jsonb;
  v_oi public.order_items%rowtype;
  v_qty numeric(12,3);
  v_prev numeric(12,3);
  v_line numeric(12,2);
  v_sub numeric(12,2):=0;
  v_ratio numeric(18,8):=0;
  v_discount numeric(12,2):=0;
  v_tax numeric(12,2):=0;
  v_service numeric(12,2):=0;
  v_total numeric(12,2):=0;
  v_prices_include_tax boolean:=true;
  v_pay jsonb;
  v_pay_total numeric(12,2):=0;
  v_method text;
  v_amount numeric(12,2);
begin
  if not (public.is_admin() or public.has_permission('returns')) then
    raise exception 'ليس لديك صلاحية عمل مرتجع';
  end if;

  v_emp:=public.current_employee_id();

  if v_emp is null then
    raise exception 'المستخدم غير مربوط بموظف';
  end if;

  select *
  into v_order
  from public.orders
  where id=p_order_id
  for update;

  if not found then
    raise exception 'الفاتورة غير موجودة';
  end if;

  if not public.has_branch_access(v_order.branch_id) then
    raise exception 'ليس لديك صلاحية لهذا الفرع';
  end if;

  if v_order.status='cancelled' then
    raise exception 'لا يمكن عمل مرتجع لفاتورة ملغية';
  end if;

  select coalesce(value,'false')::boolean
  into v_allow_closed
  from public.app_settings
  where key='returns_allow_closed_shifts';

  select coalesce(bfs.prices_include_tax,true)
  into v_prices_include_tax
  from public.branch_financial_settings bfs
  where bfs.branch_id=v_order.branch_id;

  if not found then
    v_prices_include_tax:=true;
  end if;

  select id
  into v_shift
  from public.shifts
  where branch_id=v_order.branch_id
    and employee_id=v_emp
    and status='open'
    and closed_at is null
  order by opened_at desc
  limit 1;

  if v_shift is null then
    raise exception 'افتح وردية أولًا قبل عمل المرتجع';
  end if;

  if not v_allow_closed
     and v_order.shift_id is distinct from v_shift then
    raise exception 'المرتجع مسموح لفواتير الوردية الحالية فقط';
  end if;

  if nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'سبب المرتجع مطلوب';
  end if;

  if p_items is null
     or jsonb_typeof(p_items)<>'array'
     or jsonb_array_length(p_items)=0 then
    raise exception 'اختر صنفًا واحدًا على الأقل';
  end if;

  for v_item in
    select * from jsonb_array_elements(p_items)
  loop
    select *
    into v_oi
    from public.order_items
    where id=(v_item->>'order_item_id')::bigint
      and order_id=v_order.id;

    if not found then
      raise exception 'صنف المرتجع غير موجود بالفاتورة';
    end if;

    v_qty:=coalesce((v_item->>'quantity')::numeric,0);

    if v_qty<=0 then
      raise exception 'كمية المرتجع غير صحيحة';
    end if;

    select coalesce(sum(ri.quantity),0)
    into v_prev
    from public.return_items ri
    join public.returns r on r.id=ri.return_id
    where r.order_id=v_order.id
      and ri.order_item_id=v_oi.id;

    if v_qty+v_prev>v_oi.quantity then
      raise exception
        'كمية المرتجع أكبر من الكمية المتاحة للصنف %',
        v_oi.product_name;
    end if;

    v_line:=round(
      (coalesce(v_oi.total,0)/nullif(v_oi.quantity,0))*v_qty,
      2
    );

    v_sub:=v_sub+v_line;
  end loop;

  if coalesce(v_order.subtotal,0)>0 then
    v_ratio:=least(1,v_sub/v_order.subtotal);
  end if;

  v_discount:=round(coalesce(v_order.discount,0)*v_ratio,2);
  v_tax:=round(coalesce(v_order.tax_amount,0)*v_ratio,2);
  v_service:=round(coalesce(v_order.service_amount,0)*v_ratio,2);

  v_total:=greatest(
    0,
    round(
      v_sub-v_discount+
      (case when v_prices_include_tax then 0 else v_tax end)+
      v_service,
      2
    )
  );

  if p_payments is null
     or jsonb_typeof(p_payments)<>'array'
     or jsonb_array_length(p_payments)=0 then
    raise exception 'حدد طريقة رد المبلغ';
  end if;

  for v_pay in
    select * from jsonb_array_elements(p_payments)
  loop
    v_method:=nullif(trim(v_pay->>'method'),'');
    v_amount:=coalesce((v_pay->>'amount')::numeric,0);

    if v_method is null or v_amount<=0 then
      raise exception 'بيانات رد المبلغ غير صحيحة';
    end if;

    v_pay_total:=v_pay_total+v_amount;
  end loop;

  if abs(v_pay_total-v_total)>0.01 then
    raise exception 'إجمالي رد المبلغ يجب أن يساوي %',v_total;
  end if;

  insert into public.branch_return_counters(branch_id,next_number)
  values(v_order.branch_id,2)
  on conflict(business_id,branch_id)
  do update set
    next_number=public.branch_return_counters.next_number+1
  returning next_number-1 into v_return_no;

  insert into public.returns(
    branch_id,
    return_number,
    order_id,
    original_invoice_number,
    original_bon_number,
    employee_id,
    shift_id,
    reason,
    notes,
    subtotal,
    discount_adjustment,
    tax_adjustment,
    service_adjustment,
    total
  )
  values(
    v_order.branch_id,
    v_return_no,
    v_order.id,
    v_order.invoice_number,
    v_order.bon_number,
    v_emp,
    v_shift,
    trim(p_reason),
    nullif(trim(coalesce(p_notes,'')),''),
    v_sub,
    v_discount,
    v_tax,
    v_service,
    v_total
  )
  returning id into v_return_id;

  for v_item in
    select * from jsonb_array_elements(p_items)
  loop
    select *
    into v_oi
    from public.order_items
    where id=(v_item->>'order_item_id')::bigint
      and order_id=v_order.id;

    v_qty:=(v_item->>'quantity')::numeric;

    v_line:=round(
      (coalesce(v_oi.total,0)/nullif(v_oi.quantity,0))*v_qty,
      2
    );

    insert into public.return_items(
      return_id,
      order_item_id,
      product_id,
      product_name,
      quantity,
      unit_refund,
      total
    )
    values(
      v_return_id,
      v_oi.id,
      v_oi.product_id,
      v_oi.product_name,
      v_qty,
      round(v_line/v_qty,2),
      v_line
    );
  end loop;

  for v_pay in
    select * from jsonb_array_elements(p_payments)
  loop
    insert into public.return_payments(
      return_id,
      method,
      amount
    )
    values(
      v_return_id,
      trim(v_pay->>'method'),
      (v_pay->>'amount')::numeric
    );
  end loop;

  return v_return_id;
end;
$function$


-- create_retail_order_return_idempotent(p_order_id bigint, p_reason text, p_notes text, p_items jsonb, p_payments jsonb, p_client_tx_id text)
CREATE OR REPLACE FUNCTION public.create_retail_order_return_idempotent(p_order_id bigint, p_reason text, p_notes text, p_items jsonb, p_payments jsonb, p_client_tx_id text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_key text:=nullif(
    trim(coalesce(p_client_tx_id,'')),
    ''
  );
  v_existing bigint;
  v_return_id bigint;
  v_branch bigint;
  v_emp bigint;
  v_row record;
  v_balance public.retail_inventory_balances%rowtype;
  v_new_balance numeric(14,3);
begin
  if auth.uid() is null then
    raise exception 'غير مصرح';
  end if;

  if v_key is null then
    raise exception 'معرف الحركة مطلوب';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'retail-return:'||v_key,
      0
    )
  );

  select id
  into v_existing
  from public.returns
  where client_tx_id=v_key
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  select branch_id
  into v_branch
  from public.orders
  where id=p_order_id;

  if v_branch is null then
    raise exception 'الفاتورة غير موجودة';
  end if;

  if not public.has_branch_access(v_branch) then
    raise exception 'ليس لديك صلاحية لهذا الفرع';
  end if;

  v_emp:=public.current_employee_id();

  v_return_id:=public.create_order_return_idempotent(
    p_order_id,
    p_reason,
    p_notes,
    p_items,
    p_payments,
    v_key
  );

  for v_row in
    select
      oi.product_id,
      round(
        sum(
          coalesce(
            (x->>'quantity')::numeric,
            0
          )
        ),
        3
      ) as qty,
      round(
        avg(
          coalesce(
            oi.cost,
            0
          )
        ),
        4
      ) as unit_cost
    from jsonb_array_elements(
      coalesce(
        p_items,
        '[]'::jsonb
      )
    ) x
    join public.order_items oi
      on oi.id=
        nullif(
          x->>'order_item_id',
          ''
        )::bigint
     and oi.order_id=p_order_id
    where oi.product_id is not null
    group by oi.product_id
    order by oi.product_id
  loop
    insert into public.retail_inventory_balances(
      branch_id,
      product_id,
      quantity
    )
    values(
      v_branch,
      v_row.product_id,
      0
    )
    on conflict(business_id,branch_id,product_id)
    do nothing;

    select *
    into v_balance
    from public.retail_inventory_balances
    where branch_id=v_branch
      and product_id=v_row.product_id
    for update;

    if not v_balance.track_inventory then
      continue;
    end if;

    v_new_balance:=round(
      v_balance.quantity+v_row.qty,
      3
    );

    update public.retail_inventory_balances
    set
      quantity=v_new_balance,
      updated_at=now()
    where branch_id=v_branch
      and product_id=v_row.product_id;

    insert into public.retail_inventory_movements(
      branch_id,
      product_id,
      movement_type,
      quantity_delta,
      balance_after,
      unit_cost,
      reference_type,
      reference_id,
      client_tx_id,
      employee_id
    )
    values(
      v_branch,
      v_row.product_id,
      'return',
      v_row.qty,
      v_new_balance,
      v_row.unit_cost,
      'return',
      v_return_id::text,
      v_key,
      v_emp
    );
  end loop;

  return v_return_id;
end;
$function$


-- create_retail_pos_order_atomic(p_order jsonb, p_items jsonb, p_payments jsonb)
CREATE OR REPLACE FUNCTION public.create_retail_pos_order_atomic(p_order jsonb, p_items jsonb, p_payments jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_branch bigint:=nullif(p_order->>'branch_id','')::bigint;
  v_client_tx_id text:=nullif(
    trim(coalesce(p_order->>'client_tx_id','')),
    ''
  );
  v_emp bigint;
  v_allow_negative boolean:=false;
  v_result jsonb;
  v_existing_order_id bigint;
  v_row record;
  v_balance public.retail_inventory_balances%rowtype;
  v_new_balance numeric(14,3);
begin
  if auth.uid() is null then
    raise exception 'غير مصرح';
  end if;

  if v_client_tx_id is null then
    raise exception 'معرف الحركة مطلوب';
  end if;

  if v_branch is null
     or not public.has_branch_access(v_branch)
  then
    raise exception 'ليس لديك صلاحية على هذا الفرع';
  end if;

  v_emp:=public.current_employee_id();

  perform pg_advisory_xact_lock(
    hashtextextended(
      'retail-sale:'||v_client_tx_id,
      0
    )
  );

  select id
  into v_existing_order_id
  from public.orders
  where client_tx_id=v_client_tx_id
  limit 1;

  if v_existing_order_id is not null then
    return public.create_pos_order_atomic(
      p_order,
      p_items,
      p_payments
    );
  end if;

  select coalesce(
    allow_negative_stock,
    false
  )
  into v_allow_negative
  from public.retail_inventory_settings
  where branch_id=v_branch;

  if not found then
    v_allow_negative:=false;
  end if;

  -- Lock and validate every tracked product
  -- before creating the invoice.
  for v_row in
    select
      nullif(x->>'product_id','')::bigint
        as product_id,
      round(
        sum(
          coalesce(
            (x->>'quantity')::numeric,
            0
          )
        ),
        3
      ) as qty
    from jsonb_array_elements(
      coalesce(
        p_items,
        '[]'::jsonb
      )
    ) x
    where nullif(
      x->>'product_id',
      ''
    ) is not null
    group by
      nullif(
        x->>'product_id',
        ''
      )::bigint
    order by
      nullif(
        x->>'product_id',
        ''
      )::bigint
  loop
    insert into public.retail_inventory_balances(
      branch_id,
      product_id,
      quantity
    )
    values(
      v_branch,
      v_row.product_id,
      0
    )
    on conflict(business_id,branch_id,product_id)
    do nothing;

    select *
    into v_balance
    from public.retail_inventory_balances
    where branch_id=v_branch
      and product_id=v_row.product_id
    for update;

    if v_balance.track_inventory
       and not v_allow_negative
       and v_balance.quantity < v_row.qty
    then
      raise exception
        'المخزون غير كافٍ للصنف % — المتاح %',
        v_row.product_id,
        v_balance.quantity;
    end if;
  end loop;

  -- Existing proven checkout remains the source of truth
  -- for invoice/payment creation.
  -- Because this call is inside the same outer transaction,
  -- any inventory failure rolls the sale back too.
  v_result:=public.create_pos_order_atomic(
    p_order,
    p_items,
    p_payments
  );

  for v_row in
    select
      nullif(x->>'product_id','')::bigint
        as product_id,
      round(
        sum(
          coalesce(
            (x->>'quantity')::numeric,
            0
          )
        ),
        3
      ) as qty,
      round(
        sum(
          coalesce(
            (x->>'cost')::numeric,
            0
          )
          *
          coalesce(
            (x->>'quantity')::numeric,
            0
          )
        )
        /
        nullif(
          sum(
            coalesce(
              (x->>'quantity')::numeric,
              0
            )
          ),
          0
        ),
        4
      ) as unit_cost
    from jsonb_array_elements(
      coalesce(
        p_items,
        '[]'::jsonb
      )
    ) x
    where nullif(
      x->>'product_id',
      ''
    ) is not null
    group by
      nullif(
        x->>'product_id',
        ''
      )::bigint
    order by
      nullif(
        x->>'product_id',
        ''
      )::bigint
  loop
    select *
    into v_balance
    from public.retail_inventory_balances
    where branch_id=v_branch
      and product_id=v_row.product_id
    for update;

    if not v_balance.track_inventory then
      continue;
    end if;

    v_new_balance:=round(
      v_balance.quantity-v_row.qty,
      3
    );

    update public.retail_inventory_balances
    set
      quantity=v_new_balance,
      updated_at=now()
    where branch_id=v_branch
      and product_id=v_row.product_id;

    insert into public.retail_inventory_movements(
      branch_id,
      product_id,
      movement_type,
      quantity_delta,
      balance_after,
      unit_cost,
      reference_type,
      reference_id,
      client_tx_id,
      employee_id
    )
    values(
      v_branch,
      v_row.product_id,
      'sale',
      -v_row.qty,
      v_new_balance,
      v_row.unit_cost,
      'order',
      v_result->'order'->>'id',
      v_client_tx_id,
      v_emp
    );
  end loop;

  return v_result;
end;
$function$


-- create_retail_variant_order_return_idempotent_v1(p_order_id bigint, p_reason text, p_notes text, p_items jsonb, p_payments jsonb, p_client_tx_id text)
CREATE OR REPLACE FUNCTION public.create_retail_variant_order_return_idempotent_v1(p_order_id bigint, p_reason text, p_notes text, p_items jsonb, p_payments jsonb, p_client_tx_id text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_existing bigint;v_return_id bigint;v_branch bigint;v_emp bigint;v_row record;v_balance public.retail_inventory_balances%rowtype;v_variant_balance public.retail_variant_inventory_balances%rowtype;v_new_balance numeric(14,3);
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if; if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
 perform pg_advisory_xact_lock(hashtextextended('retail-variant-return:'||v_key,0)); select id into v_existing from public.returns where client_tx_id=v_key limit 1; if v_existing is not null then return v_existing; end if;
 select branch_id into v_branch from public.orders where id=p_order_id; if v_branch is null then raise exception 'الفاتورة غير موجودة'; end if; if not public.has_branch_access(v_branch) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if; v_emp:=public.current_employee_id();
 v_return_id:=public.create_order_return_idempotent(p_order_id,p_reason,p_notes,p_items,p_payments,v_key);
 for v_row in select oi.product_id,round(sum(coalesce((x->>'quantity')::numeric,0)),3) qty,round(avg(coalesce(oi.cost,0)),4) unit_cost from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x join public.order_items oi on oi.id=nullif(x->>'order_item_id','')::bigint and oi.order_id=p_order_id where oi.product_id is not null and oi.variant_id is null group by oi.product_id order by oi.product_id loop
  insert into public.retail_inventory_balances(branch_id,product_id,quantity) values(v_branch,v_row.product_id,0) on conflict(business_id,branch_id,product_id) do nothing; select * into v_balance from public.retail_inventory_balances where branch_id=v_branch and product_id=v_row.product_id for update; if not v_balance.track_inventory then continue; end if; v_new_balance:=round(v_balance.quantity+v_row.qty,3); update public.retail_inventory_balances set quantity=v_new_balance,updated_at=now() where branch_id=v_branch and product_id=v_row.product_id; insert into public.retail_inventory_movements(branch_id,product_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,employee_id) values(v_branch,v_row.product_id,'return',v_row.qty,v_new_balance,v_row.unit_cost,'return',v_return_id::text,v_key,v_emp);
 end loop;
 for v_row in select oi.variant_id,round(sum(coalesce((x->>'quantity')::numeric,0)),3) qty,round(avg(coalesce(oi.cost,0)),4) unit_cost from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x join public.order_items oi on oi.id=nullif(x->>'order_item_id','')::bigint and oi.order_id=p_order_id where oi.variant_id is not null group by oi.variant_id order by oi.variant_id loop
  insert into public.retail_variant_inventory_balances(branch_id,variant_id,quantity) values(v_branch,v_row.variant_id,0) on conflict(business_id,branch_id,variant_id) do nothing; select * into v_variant_balance from public.retail_variant_inventory_balances where branch_id=v_branch and variant_id=v_row.variant_id for update; if not v_variant_balance.track_inventory then continue; end if; v_new_balance:=round(v_variant_balance.quantity+v_row.qty,3); update public.retail_variant_inventory_balances set quantity=v_new_balance,updated_at=now() where branch_id=v_branch and variant_id=v_row.variant_id; insert into public.retail_variant_inventory_movements(branch_id,variant_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,employee_id) values(v_branch,v_row.variant_id,'return',v_row.qty,v_new_balance,v_row.unit_cost,'return',v_return_id::text,v_key,v_emp);
 end loop; return v_return_id;
end;$function$


-- create_retail_variant_pos_order_atomic_v1(p_order jsonb, p_items jsonb, p_payments jsonb)
CREATE OR REPLACE FUNCTION public.create_retail_variant_pos_order_atomic_v1(p_order jsonb, p_items jsonb, p_payments jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_branch bigint:=nullif(p_order->>'branch_id','')::bigint;v_client_tx_id text:=nullif(trim(coalesce(p_order->>'client_tx_id','')),'');v_emp bigint;v_allow_negative boolean:=false;v_existing_order_id bigint;v_result jsonb;v_saved_items jsonb;v_row record;v_balance public.retail_inventory_balances%rowtype;v_variant_balance public.retail_variant_inventory_balances%rowtype;v_new_balance numeric(14,3);v_variant public.product_variants%rowtype;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if v_client_tx_id is null then raise exception 'معرف الحركة مطلوب'; end if;
 if v_branch is null or not public.has_branch_access(v_branch) then raise exception 'ليس لديك صلاحية على هذا الفرع'; end if;
 if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'الأوردر فارغ'; end if;
 v_emp:=public.current_employee_id(); perform pg_advisory_xact_lock(hashtextextended('retail-variant-sale:'||v_client_tx_id,0));
 select id into v_existing_order_id from public.orders where client_tx_id=v_client_tx_id limit 1;
 if v_existing_order_id is not null then select coalesce(jsonb_agg(to_jsonb(oi) order by oi.id),'[]'::jsonb) into v_saved_items from public.order_items oi where oi.order_id=v_existing_order_id; return jsonb_build_object('order',(select to_jsonb(o) from public.orders o where o.id=v_existing_order_id),'items',v_saved_items,'duplicate_prevented',true); end if;
 select coalesce(allow_negative_stock,false) into v_allow_negative from public.retail_inventory_settings where branch_id=v_branch; if not found then v_allow_negative:=false; end if;
 for v_row in select nullif(x->>'variant_id','')::bigint variant_id,nullif(x->>'product_id','')::bigint product_id,round(sum(coalesce((x->>'quantity')::numeric,0)),3) qty from jsonb_array_elements(p_items) x where nullif(x->>'variant_id','') is not null group by nullif(x->>'variant_id','')::bigint,nullif(x->>'product_id','')::bigint order by nullif(x->>'variant_id','')::bigint loop
  if v_row.product_id is null or v_row.qty<=0 then raise exception 'بيانات Variant غير صحيحة'; end if;
  select * into v_variant from public.product_variants where id=v_row.variant_id and product_id=v_row.product_id and is_stock_unit=true and active=true; if not found then raise exception 'Variant % غير موجود أو غير صالح للصنف',v_row.variant_id; end if;
  insert into public.retail_variant_inventory_balances(branch_id,variant_id,quantity) values(v_branch,v_row.variant_id,0) on conflict(business_id,branch_id,variant_id) do nothing;
  select * into v_variant_balance from public.retail_variant_inventory_balances where branch_id=v_branch and variant_id=v_row.variant_id for update;
  if v_variant_balance.track_inventory and not v_allow_negative and v_variant_balance.quantity<v_row.qty then raise exception 'المخزون غير كافٍ للتركيبة % — المتاح %',v_variant.name,v_variant_balance.quantity; end if;
 end loop;
 for v_row in select nullif(x->>'product_id','')::bigint product_id,round(sum(coalesce((x->>'quantity')::numeric,0)),3) qty from jsonb_array_elements(p_items) x where nullif(x->>'product_id','') is not null and nullif(x->>'variant_id','') is null group by nullif(x->>'product_id','')::bigint order by nullif(x->>'product_id','')::bigint loop
  insert into public.retail_inventory_balances(branch_id,product_id,quantity) values(v_branch,v_row.product_id,0) on conflict(business_id,branch_id,product_id) do nothing;
  select * into v_balance from public.retail_inventory_balances where branch_id=v_branch and product_id=v_row.product_id for update;
  if v_balance.track_inventory and not v_allow_negative and v_balance.quantity<v_row.qty then raise exception 'المخزون غير كافٍ للصنف % — المتاح %',v_row.product_id,v_balance.quantity; end if;
 end loop;
 v_result:=public.create_pos_order_atomic(p_order,p_items,p_payments);
 with src as (select ord::bigint rn,nullif(item->>'variant_id','')::bigint variant_id from jsonb_array_elements(p_items) with ordinality t(item,ord)),dst as (select oi.id,row_number() over(order by oi.id)::bigint rn from public.order_items oi where oi.order_id=(v_result->'order'->>'id')::bigint) update public.order_items oi set variant_id=pv.id,variant_name=pv.name,variant_sku=pv.sku,variant_barcode=pv.barcode from src join dst on dst.rn=src.rn join public.product_variants pv on pv.id=src.variant_id where oi.id=dst.id and src.variant_id is not null;
 for v_row in select nullif(x->>'product_id','')::bigint product_id,round(sum(coalesce((x->>'quantity')::numeric,0)),3) qty,round(sum(coalesce((x->>'cost')::numeric,0)*coalesce((x->>'quantity')::numeric,0))/nullif(sum(coalesce((x->>'quantity')::numeric,0)),0),4) unit_cost from jsonb_array_elements(p_items) x where nullif(x->>'product_id','') is not null and nullif(x->>'variant_id','') is null group by nullif(x->>'product_id','')::bigint order by nullif(x->>'product_id','')::bigint loop
  select * into v_balance from public.retail_inventory_balances where branch_id=v_branch and product_id=v_row.product_id for update; if not v_balance.track_inventory then continue; end if; v_new_balance:=round(v_balance.quantity-v_row.qty,3); update public.retail_inventory_balances set quantity=v_new_balance,updated_at=now() where branch_id=v_branch and product_id=v_row.product_id;
  insert into public.retail_inventory_movements(branch_id,product_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,employee_id) values(v_branch,v_row.product_id,'sale',-v_row.qty,v_new_balance,v_row.unit_cost,'order',v_result->'order'->>'id',v_client_tx_id,v_emp);
 end loop;
 for v_row in select nullif(x->>'variant_id','')::bigint variant_id,round(sum(coalesce((x->>'quantity')::numeric,0)),3) qty,round(sum(coalesce((x->>'cost')::numeric,0)*coalesce((x->>'quantity')::numeric,0))/nullif(sum(coalesce((x->>'quantity')::numeric,0)),0),4) unit_cost from jsonb_array_elements(p_items) x where nullif(x->>'variant_id','') is not null group by nullif(x->>'variant_id','')::bigint order by nullif(x->>'variant_id','')::bigint loop
  select * into v_variant_balance from public.retail_variant_inventory_balances where branch_id=v_branch and variant_id=v_row.variant_id for update; if not v_variant_balance.track_inventory then continue; end if; v_new_balance:=round(v_variant_balance.quantity-v_row.qty,3); update public.retail_variant_inventory_balances set quantity=v_new_balance,updated_at=now() where branch_id=v_branch and variant_id=v_row.variant_id;
  insert into public.retail_variant_inventory_movements(branch_id,variant_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,employee_id) values(v_branch,v_row.variant_id,'sale',-v_row.qty,v_new_balance,v_row.unit_cost,'order',v_result->'order'->>'id',v_client_tx_id,v_emp);
 end loop;
 select coalesce(jsonb_agg(to_jsonb(oi) order by oi.id),'[]'::jsonb) into v_saved_items from public.order_items oi where oi.order_id=(v_result->'order'->>'id')::bigint;
 return jsonb_build_object('order',v_result->'order','items',v_saved_items);
end;$function$


-- finance_customer_account_set_v2(p_customer_id bigint, p_credit_limit numeric, p_payment_terms_days integer, p_credit_hold boolean, p_notes text)
CREATE OR REPLACE FUNCTION public.finance_customer_account_set_v2(p_customer_id bigint, p_credit_limit numeric, p_payment_terms_days integer, p_credit_hold boolean, p_notes text)
 RETURNS finance_customer_accounts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare r public.finance_customer_accounts%rowtype; e bigint;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'إدارة الائتمان للمدير فقط'; end if;
 if not exists(select 1 from public.customers where id=p_customer_id) then raise exception 'العميل غير موجود'; end if;
 e:=public.current_employee_id();
 insert into public.finance_customer_accounts(customer_id,credit_limit,payment_terms_days,credit_hold,notes,updated_by_employee_id)
 values(p_customer_id,greatest(coalesce(p_credit_limit,0),0),greatest(coalesce(p_payment_terms_days,0),0),coalesce(p_credit_hold,false),nullif(trim(coalesce(p_notes,'')),''),e)
 on conflict(business_id,customer_id) do update set credit_limit=excluded.credit_limit,payment_terms_days=excluded.payment_terms_days,credit_hold=excluded.credit_hold,notes=excluded.notes,updated_by_employee_id=e,updated_at=now()
 returning * into r; return r;
end;$function$


-- food_apply_ingredient_delta_internal_v1(p_branch_id bigint, p_ingredient_id bigint, p_quantity_delta numeric, p_unit_cost numeric, p_movement_type text, p_reference_type text, p_reference_id bigint, p_notes text)
CREATE OR REPLACE FUNCTION public.food_apply_ingredient_delta_internal_v1(p_branch_id bigint, p_ingredient_id bigint, p_quantity_delta numeric, p_unit_cost numeric, p_movement_type text, p_reference_type text, p_reference_id bigint, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_stock public.ingredient_stock%rowtype;v_track boolean;v_new numeric(18,6);v_avg numeric(18,6);v_cost numeric(18,6):=greatest(0,coalesce(p_unit_cost,0));
begin
 if coalesce(p_quantity_delta,0)=0 then select * into v_stock from public.ingredient_stock where branch_id=p_branch_id and ingredient_id=p_ingredient_id;return jsonb_build_object('quantity',coalesce(v_stock.quantity,0),'average_unit_cost',coalesce(v_stock.average_unit_cost,0));end if;
 select track_inventory into v_track from public.ingredients where id=p_ingredient_id and active is distinct from false;if not found then raise exception 'الخامة غير موجودة أو موقوفة';end if;
 if not coalesce(v_track,true) then raise exception 'الخامة غير متتبعة بالمخزون';end if;
 insert into public.ingredient_stock(branch_id,ingredient_id,quantity) values(p_branch_id,p_ingredient_id,0) on conflict(business_id,branch_id,ingredient_id) do nothing;
 select * into v_stock from public.ingredient_stock where branch_id=p_branch_id and ingredient_id=p_ingredient_id for update;
 v_new:=round(v_stock.quantity+p_quantity_delta,6);if v_new<0 then raise exception 'مخزون الخامة غير كافٍ';end if;
 v_avg:=v_stock.average_unit_cost;if p_quantity_delta>0 and v_cost>0 then v_avg:=case when v_new<=0 then v_cost else round(((v_stock.quantity*v_stock.average_unit_cost)+(p_quantity_delta*v_cost))/v_new,6) end;end if;
 update public.ingredient_stock set quantity=v_new,average_unit_cost=greatest(0,coalesce(v_avg,0)),last_purchase_cost=case when p_movement_type='purchase' and v_cost>0 then v_cost else last_purchase_cost end,last_costed_at=case when p_movement_type='purchase' and v_cost>0 then now() else last_costed_at end,updated_at=now() where id=v_stock.id;
 insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes) values(p_branch_id,p_ingredient_id,p_movement_type,round(p_quantity_delta,6),p_reference_type,p_reference_id,p_notes);
 return jsonb_build_object('quantity',v_new,'average_unit_cost',greatest(0,coalesce(v_avg,0)));
end;$function$


-- food_apply_order_consumption_v1(p_result jsonb, p_items jsonb)
CREATE OR REPLACE FUNCTION public.food_apply_order_consumption_v1(p_result jsonb, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_branch bigint;
  v_order_id bigint;
  v_pair record;
  v_input jsonb;
  v_saved jsonb;
  v_order_item_id bigint;
  v_product_id bigint;
  v_variant_id bigint;
  v_qty numeric;
  v_recipe_version bigint;
  v_output_qty numeric;
  v_line record;
  v_stock public.ingredient_stock%rowtype;
  v_need numeric(18,6);
  v_new numeric(18,6);
  v_unit_cost numeric(18,6);
  v_base_cost numeric(18,6);
  v_mod_cost numeric(18,6);
  v_total_cost numeric(18,6);
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  -- Beta42 composition: duplicate base orders may still need missing Recipe postings; per-item snapshots are the idempotency guard.

  v_order_id:=nullif(p_result->'order'->>'id','')::bigint;
  if v_order_id is null then raise exception 'تعذر تحديد الفاتورة لتطبيق Recipe'; end if;
  select branch_id into v_branch from public.orders where id=v_order_id;
  if v_branch is null or not public.has_branch_access(v_branch) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;

  perform pg_advisory_xact_lock(hashtextextended('food-consume-order:'||v_order_id::text,0));

  for v_pair in
    select a.value as input_item,b.value as saved_item
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) with ordinality a(value,ord)
    join jsonb_array_elements(coalesce(p_result->'items','[]'::jsonb)) with ordinality b(value,ord) using(ord)
  loop
    v_input:=v_pair.input_item;
    v_saved:=v_pair.saved_item;
    v_order_item_id:=nullif(v_saved->>'id','')::bigint;
    v_product_id:=nullif(v_input->>'product_id','')::bigint;
    v_variant_id:=nullif(v_input->>'variant_id','')::bigint;
    v_qty:=coalesce((v_input->>'quantity')::numeric,0);
    if v_order_item_id is null or v_product_id is null or v_qty<=0 then continue; end if;

    -- Helper-level idempotency protects wrapper composition/retries.
    if exists(select 1 from public.food_order_item_cost_snapshots where order_item_id=v_order_item_id) then
      continue;
    end if;

    select rv.id,rv.output_quantity into v_recipe_version,v_output_qty
    from public.food_recipe_headers h
    join public.food_recipe_versions rv on rv.recipe_id=h.id and rv.status='active'
    where h.active=true and h.recipe_kind='sale' and h.product_id=v_product_id
      and (h.variant_id is null or h.variant_id=v_variant_id)
      and (rv.effective_from is null or rv.effective_from<=clock_timestamp())
      and (rv.effective_to is null or rv.effective_to>clock_timestamp())
    order by case when h.variant_id is not null and h.variant_id=v_variant_id then 0 else 1 end,h.id desc
    limit 1;
    if v_recipe_version is null then continue; end if;

    v_base_cost:=0;
    v_mod_cost:=0;

    for v_line in
      select l.ingredient_id,l.base_quantity,i.track_inventory,
        coalesce(nullif(s.average_unit_cost,0),coalesce(i.cost_per_unit,0))::numeric(18,6) as unit_cost
      from public.food_recipe_lines l
      join public.ingredients i on i.id=l.ingredient_id and i.active is distinct from false
      left join public.ingredient_stock s on s.branch_id=v_branch and s.ingredient_id=i.id
      where l.recipe_version_id=v_recipe_version
        and not exists(
          select 1 from public.food_recipe_removal_mappings rm
          where rm.recipe_version_id=v_recipe_version and rm.ingredient_id=l.ingredient_id
            and lower(trim(rm.component_name)) in (
              select lower(trim(x)) from jsonb_array_elements_text(coalesce(v_input->'removed','[]'::jsonb)) x
            )
        )
      order by l.ingredient_id
    loop
      v_need:=round(v_line.base_quantity*v_qty/greatest(v_output_qty,0.000001),6);
      if v_need<=0 then continue; end if;
      v_unit_cost:=coalesce(v_line.unit_cost,0);

      if coalesce(v_line.track_inventory,true) then
        insert into public.ingredient_stock(branch_id,ingredient_id,quantity)
        values(v_branch,v_line.ingredient_id,0)
        on conflict(business_id,branch_id,ingredient_id) do nothing;
        select * into v_stock from public.ingredient_stock
        where branch_id=v_branch and ingredient_id=v_line.ingredient_id for update;
        v_unit_cost:=coalesce(nullif(v_stock.average_unit_cost,0),v_line.unit_cost,0);
        if v_stock.quantity<v_need then
          raise exception 'مخزون الخامة غير كافٍ للخامة % — المتاح % والمطلوب %',v_line.ingredient_id,v_stock.quantity,v_need;
        end if;
        v_new:=round(v_stock.quantity-v_need,6);
        update public.ingredient_stock set quantity=v_new,updated_at=clock_timestamp() where id=v_stock.id;
        insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes)
        values(v_branch,v_line.ingredient_id,'sale',-v_need,'order_item',v_order_item_id,'Recipe Basic V1');
      end if;

      insert into public.food_order_item_consumption_snapshots(
        order_item_id,recipe_version_id,ingredient_id,source_kind,modifier_id,base_quantity,unit_cost_snapshot
      ) values(v_order_item_id,v_recipe_version,v_line.ingredient_id,'base',null,v_need,v_unit_cost);
      v_base_cost:=v_base_cost+(v_need*v_unit_cost);
    end loop;

    for v_line in
      select mi.ingredient_id,mi.modifier_id,mi.base_quantity_delta,i.track_inventory,
        coalesce(nullif(s.average_unit_cost,0),coalesce(i.cost_per_unit,0))::numeric(18,6) as unit_cost
      from public.food_modifier_recipe_impacts mi
      join public.ingredients i on i.id=mi.ingredient_id and i.active is distinct from false
      left join public.ingredient_stock s on s.branch_id=v_branch and s.ingredient_id=i.id
      where mi.recipe_version_id=v_recipe_version
        and mi.modifier_id in (
          select nullif(x->>'id','')::bigint from jsonb_array_elements(coalesce(v_input->'modifiers','[]'::jsonb)) x
        )
      order by mi.ingredient_id,mi.modifier_id
    loop
      v_need:=round(v_line.base_quantity_delta*v_qty/greatest(v_output_qty,0.000001),6);
      if v_need<=0 then continue; end if;
      v_unit_cost:=coalesce(v_line.unit_cost,0);

      if coalesce(v_line.track_inventory,true) then
        insert into public.ingredient_stock(branch_id,ingredient_id,quantity)
        values(v_branch,v_line.ingredient_id,0)
        on conflict(business_id,branch_id,ingredient_id) do nothing;
        select * into v_stock from public.ingredient_stock
        where branch_id=v_branch and ingredient_id=v_line.ingredient_id for update;
        v_unit_cost:=coalesce(nullif(v_stock.average_unit_cost,0),v_line.unit_cost,0);
        if v_stock.quantity<v_need then raise exception 'مخزون الخامة غير كافٍ لإضافة %',v_line.ingredient_id; end if;
        v_new:=round(v_stock.quantity-v_need,6);
        update public.ingredient_stock set quantity=v_new,updated_at=clock_timestamp() where id=v_stock.id;
        insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes)
        values(v_branch,v_line.ingredient_id,'sale',-v_need,'order_item',v_order_item_id,'Recipe modifier');
      end if;

      insert into public.food_order_item_consumption_snapshots(
        order_item_id,recipe_version_id,ingredient_id,source_kind,modifier_id,base_quantity,unit_cost_snapshot
      ) values(v_order_item_id,v_recipe_version,v_line.ingredient_id,'modifier',v_line.modifier_id,v_need,v_unit_cost);
      v_mod_cost:=v_mod_cost+(v_need*v_unit_cost);
    end loop;

    v_total_cost:=round(v_base_cost+v_mod_cost,6);
    insert into public.food_order_item_cost_snapshots(order_item_id,recipe_version_id,base_recipe_cost,modifier_cost,total_food_cost)
    values(v_order_item_id,v_recipe_version,round(v_base_cost,6),round(v_mod_cost,6),v_total_cost)
    on conflict(business_id,order_item_id) do nothing;
    update public.order_items set cost=round(v_total_cost/greatest(v_qty,0.000001),6) where id=v_order_item_id;
  end loop;
  return p_result;
end;
$function$


-- food_apply_return_consumption_v1(p_return_id bigint, p_order_id bigint, p_items jsonb, p_client_tx_id text)
CREATE OR REPLACE FUNCTION public.food_apply_return_consumption_v1(p_return_id bigint, p_order_id bigint, p_items jsonb, p_client_tx_id text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_branch bigint;
  v record;
  v_stock public.ingredient_stock%rowtype;
  v_restore numeric(18,6);
  v_new numeric(18,6);
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  if p_return_id is null then raise exception 'تعذر تحديد المرتجع لتطبيق Recipe'; end if;

  select branch_id into v_branch from public.orders where id=p_order_id;
  if v_branch is null then raise exception 'الفاتورة غير موجودة'; end if;
  if not public.has_branch_access(v_branch) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;

  perform pg_advisory_xact_lock(hashtextextended('food-return:'||v_key,0));
  if exists(
    select 1 from public.food_return_consumption_postings
    where client_tx_id=v_key or return_id=p_return_id
  ) then return p_return_id; end if;

  for v in
    select oi.id order_item_id,oi.quantity original_qty,s.ingredient_id,
      sum(s.base_quantity) sold_base_quantity,
      case when sum(s.base_quantity)>0 then sum(s.base_quantity*s.unit_cost_snapshot)/sum(s.base_quantity) else 0 end unit_cost,
      coalesce((x->>'quantity')::numeric,0) return_qty,
      exists(
        select 1 from public.stock_movements sm
        where sm.reference_type='order_item' and sm.reference_id=oi.id
          and sm.ingredient_id=s.ingredient_id and sm.movement_type='sale' and sm.quantity<0
      ) as restore_inventory
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
    join public.order_items oi on oi.id=nullif(x->>'order_item_id','')::bigint and oi.order_id=p_order_id
    join public.food_order_item_consumption_snapshots s on s.order_item_id=oi.id
    group by oi.id,oi.quantity,s.ingredient_id,x->>'quantity'
    order by s.ingredient_id,oi.id
  loop
    if v.return_qty<=0 or v.original_qty<=0 then continue; end if;
    v_restore:=round(v.sold_base_quantity*least(v.return_qty,v.original_qty)/v.original_qty,6);
    if v_restore<=0 then continue; end if;

    if v.restore_inventory then
      insert into public.ingredient_stock(branch_id,ingredient_id,quantity)
      values(v_branch,v.ingredient_id,0) on conflict(business_id,branch_id,ingredient_id) do nothing;
      select * into v_stock from public.ingredient_stock
      where branch_id=v_branch and ingredient_id=v.ingredient_id for update;
      v_new:=round(v_stock.quantity+v_restore,6);
      update public.ingredient_stock set quantity=v_new,updated_at=clock_timestamp() where id=v_stock.id;
      insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes)
      values(v_branch,v.ingredient_id,'return',v_restore,'return',p_return_id,'Recipe return snapshot restore');
    end if;

    insert into public.food_return_consumption_snapshots(
      return_id,order_item_id,ingredient_id,restored_base_quantity,unit_cost_snapshot
    ) values(p_return_id,v.order_item_id,v.ingredient_id,v_restore,round(v.unit_cost,6))
    on conflict(business_id,return_id,order_item_id,ingredient_id) do nothing;
  end loop;

  insert into public.food_return_consumption_postings(return_id,order_id,client_tx_id)
  values(p_return_id,p_order_id,v_key) on conflict do nothing;
  return p_return_id;
end;
$function$


-- food_execute_order_consumption_from_evidence_v1(p_client_tx_id text, p_result jsonb)
CREATE OR REPLACE FUNCTION public.food_execute_order_consumption_from_evidence_v1(p_client_tx_id text, p_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_evidence jsonb; v_line jsonb; v_effect jsonb; v_stock public.ingredient_stock%rowtype;
  v_order_item bigint; v_recipe bigint; v_qty numeric; v_need numeric; v_unit numeric; v_new numeric;
  v_base_cost numeric; v_mod_cost numeric; v_total numeric; v_branch bigint;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  v_evidence:=public.food_recover_operation_frozen_evidence_v1(p_client_tx_id);
  if v_evidence is null then raise exception 'Frozen Evidence مطلوبة للتنفيذ'; end if;
  v_branch:=(v_evidence->>'branch_id')::bigint;
  perform pg_advisory_xact_lock(hashtextextended('food-consume-order:'||(v_evidence->>'order_id'),0));

  for v_line in select value from jsonb_array_elements(v_evidence->'lines')
  loop
    v_order_item:=(v_line->>'order_item_id')::bigint;
    if exists(select 1 from public.food_order_item_cost_snapshots where order_item_id=v_order_item) then continue; end if;
    v_recipe:=nullif(v_line->>'recipe_version_id','')::bigint;
    v_qty:=coalesce((v_line#>>'{execution_evidence,quantity}')::numeric,0);
    if v_recipe is null or v_qty<=0 then continue; end if;
    v_base_cost:=0; v_mod_cost:=0;
    for v_effect in select value from jsonb_array_elements(coalesce(v_line#>'{execution_evidence,effects}','[]'::jsonb))
    loop
      v_need:=coalesce((v_effect->>'base_quantity')::numeric,0);
      if v_need<=0 then continue; end if;
      v_unit:=coalesce((v_effect->>'unit_cost')::numeric,0);
      if coalesce((v_effect->>'track_inventory')::boolean,true) then
        insert into public.ingredient_stock(branch_id,ingredient_id,quantity)
        values(v_branch,(v_effect->>'ingredient_id')::bigint,0) on conflict(business_id,branch_id,ingredient_id) do nothing;
        select * into v_stock from public.ingredient_stock
        where branch_id=v_branch and ingredient_id=(v_effect->>'ingredient_id')::bigint for update;
        v_unit:=coalesce(nullif(v_stock.average_unit_cost,0),v_unit,0);
        if v_stock.quantity<v_need then raise exception 'مخزون الخامة غير كافٍ للخامة %',(v_effect->>'ingredient_id'); end if;
        v_new:=round(v_stock.quantity-v_need,6);
        update public.ingredient_stock set quantity=v_new,updated_at=now() where id=v_stock.id;
        insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes)
        values(v_branch,(v_effect->>'ingredient_id')::bigint,'sale',-v_need,'order_item',v_order_item,'Frozen Evidence V1');
      end if;
      insert into public.food_order_item_consumption_snapshots(
        order_item_id,recipe_version_id,ingredient_id,source_kind,modifier_id,base_quantity,unit_cost_snapshot
      ) values(
        v_order_item,v_recipe,(v_effect->>'ingredient_id')::bigint,v_effect->>'source_kind',
        nullif(v_effect->>'modifier_id','')::bigint,v_need,v_unit
      );
      if v_effect->>'source_kind'='modifier' then v_mod_cost:=v_mod_cost+(v_need*v_unit);
      else v_base_cost:=v_base_cost+(v_need*v_unit); end if;
    end loop;
    v_total:=round(v_base_cost+v_mod_cost,6);
    insert into public.food_order_item_cost_snapshots(order_item_id,recipe_version_id,base_recipe_cost,modifier_cost,total_food_cost)
    values(v_order_item,v_recipe,round(v_base_cost,6),round(v_mod_cost,6),v_total)
    on conflict(business_id,order_item_id) do nothing;
    update public.order_items set cost=round(v_total/greatest(v_qty,0.000001),6) where id=v_order_item;
  end loop;
  return p_result;
end;
$function$


-- food_ingredient_conversion_save_v1(p_ingredient_id bigint, p_from_unit_code text, p_to_unit_code text, p_factor numeric, p_active boolean)
CREATE OR REPLACE FUNCTION public.food_ingredient_conversion_save_v1(p_ingredient_id bigint, p_from_unit_code text, p_to_unit_code text, p_factor numeric, p_active boolean)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ declare v_id bigint; begin if auth.uid() is null then raise exception 'غير مصرح'; end if; if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية إدارة تحويلات الوحدات'; end if; if not exists(select 1 from public.ingredients where id=p_ingredient_id) then raise exception 'الخامة غير موجودة'; end if; if p_from_unit_code=p_to_unit_code or coalesce(p_factor,0)<=0 then raise exception 'تحويل الوحدة غير صحيح'; end if; if not exists(select 1 from public.inventory_units where code=p_from_unit_code and active=true) or not exists(select 1 from public.inventory_units where code=p_to_unit_code and active=true) then raise exception 'وحدة غير صالحة'; end if; insert into public.ingredient_unit_conversions(ingredient_id,from_unit_code,to_unit_code,factor,active,updated_at) values(p_ingredient_id,p_from_unit_code,p_to_unit_code,round(p_factor,6),coalesce(p_active,true),now()) on conflict(business_id,ingredient_id,from_unit_code,to_unit_code) do update set factor=excluded.factor,active=excluded.active,updated_at=now() returning id into v_id; return v_id; end; $function$


-- food_ingredient_stock_adjust_v1(p_branch_id bigint, p_ingredient_id bigint, p_quantity_delta numeric, p_unit_cost numeric, p_reason text, p_client_tx_id text)
CREATE OR REPLACE FUNCTION public.food_ingredient_stock_adjust_v1(p_branch_id bigint, p_ingredient_id bigint, p_quantity_delta numeric, p_unit_cost numeric, p_reason text, p_client_tx_id text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_id bigint;
  v_emp bigint;
  v_stock public.ingredient_stock%rowtype;
  v_new numeric(18,6);
  v_cost numeric(18,6);
  v_track boolean;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية تعديل مخزون الخامات'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  if coalesce(p_quantity_delta,0)=0 then raise exception 'كمية التعديل لا يمكن أن تكون صفر'; end if;

  select track_inventory into v_track from public.ingredients where id=p_ingredient_id and active is distinct from false;
  if not found then raise exception 'الخامة غير موجودة أو موقوفة'; end if;
  if coalesce(p_unit_cost,0)<0 then raise exception 'التكلفة غير صحيحة'; end if;

  perform pg_advisory_xact_lock(hashtextextended('food-adjust:'||v_key,0));
  select id into v_id from public.food_ingredient_adjustment_events where client_tx_id=v_key;
  if v_id is not null then return v_id; end if;
  if not coalesce(v_track,true) then raise exception 'الخامة غير متتبعة بالمخزون ولا تقبل تعديل رصيد'; end if;

  insert into public.ingredient_stock(branch_id,ingredient_id,quantity)
  values(p_branch_id,p_ingredient_id,0) on conflict(business_id,branch_id,ingredient_id) do nothing;
  select * into v_stock from public.ingredient_stock
  where branch_id=p_branch_id and ingredient_id=p_ingredient_id for update;
  v_new:=round(v_stock.quantity+p_quantity_delta,6);
  if v_new<0 then raise exception 'مخزون الخامة غير كافٍ'; end if;
  v_cost:=round(coalesce(nullif(p_unit_cost,0),nullif(v_stock.average_unit_cost,0),0),6);
  if p_quantity_delta>0 and coalesce(p_unit_cost,0)>0 then
    v_cost:=case when v_new<=0 then round(p_unit_cost,6)
      else round(((v_stock.quantity*v_stock.average_unit_cost)+(p_quantity_delta*p_unit_cost))/v_new,6) end;
  else
    v_cost:=v_stock.average_unit_cost;
  end if;
  update public.ingredient_stock
  set quantity=v_new,average_unit_cost=greatest(0,v_cost),
      last_purchase_cost=case when p_quantity_delta>0 and coalesce(p_unit_cost,0)>0 then round(p_unit_cost,6) else last_purchase_cost end,
      last_costed_at=case when p_quantity_delta>0 and coalesce(p_unit_cost,0)>0 then now() else last_costed_at end,
      updated_at=now()
  where id=v_stock.id;
  v_emp:=public.current_employee_id();
  insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes)
  values(p_branch_id,p_ingredient_id,'adjustment',round(p_quantity_delta,6),'food_adjustment',null,nullif(trim(coalesce(p_reason,'')),''));
  insert into public.food_ingredient_adjustment_events(
    branch_id,ingredient_id,quantity_delta,balance_after,unit_cost,reason,client_tx_id,employee_id
  ) values(
    p_branch_id,p_ingredient_id,round(p_quantity_delta,6),v_new,coalesce(p_unit_cost,0),
    nullif(trim(coalesce(p_reason,'')),''),v_key,v_emp
  ) returning id into v_id;
  return v_id;
end;
$function$


-- food_persist_operation_frozen_evidence_v1(p_context jsonb, p_order_id bigint, p_saved_items jsonb, p_guards_complete boolean)
CREATE OR REPLACE FUNCTION public.food_persist_operation_frozen_evidence_v1(p_context jsonb, p_order_id bigint, p_saved_items jsonb, p_guards_complete boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_tx text:=nullif(trim(coalesce(p_context->>'client_tx_id','')),'');
  v_branch bigint:=nullif(p_context->>'branch_id','')::bigint;
  v_at timestamptz:=nullif(p_context->>'resolution_instant','')::timestamptz;
  v_digest text:=md5(coalesce(p_context::text,''));
  v_pair record; v_line_uid uuid; v_order_item_id bigint; v_recipe bigint; v_count integer:=0;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if p_guards_complete is distinct from true then raise exception 'Frozen Evidence persistence requires completed ownership guards'; end if;
  if v_tx is null or v_branch is null or v_at is null or p_order_id is null then raise exception 'Frozen Evidence identity غير مكتملة'; end if;
  if not exists(select 1 from public.orders where id=p_order_id and client_tx_id=v_tx and branch_id=v_branch)
    then raise exception 'Frozen Evidence order identity mismatch'; end if;

  insert into public.food_operation_frozen_evidence(
    client_tx_id,contract_version,order_id,branch_id,resolution_instant,context_digest,context_json
  ) values(
    v_tx,'sharawla.point4.food-frozen-evidence.v1',p_order_id,v_branch,v_at,v_digest,p_context
  ) on conflict(business_id,client_tx_id) do nothing;

  for v_pair in
    select c.value context_line,s.value saved_item,c.ord::integer line_ordinal
    from jsonb_array_elements(coalesce(p_context->'lines','[]'::jsonb)) with ordinality c(value,ord)
    join jsonb_array_elements(coalesce(p_saved_items,'[]'::jsonb)) with ordinality s(value,ord) using(ord)
  loop
    v_line_uid:=nullif(v_pair.context_line->>'line_uid','')::uuid;
    v_order_item_id:=nullif(v_pair.saved_item->>'id','')::bigint;
    v_recipe:=nullif(v_pair.context_line->>'recipe_version_id','')::bigint;
    if v_line_uid is null or v_order_item_id is null then raise exception 'Frozen Evidence line binding غير مكتمل'; end if;
    if not exists(select 1 from public.order_items where id=v_order_item_id and order_id=p_order_id)
      then raise exception 'Frozen Evidence order item mismatch'; end if;
    insert into public.food_operation_frozen_evidence_lines(
      client_tx_id,line_uid,order_item_id,order_id,branch_id,line_ordinal,recipe_version_id,execution_evidence,evidence_digest
    ) values(
      v_tx,v_line_uid,v_order_item_id,p_order_id,v_branch,v_pair.line_ordinal,v_recipe,
      v_pair.context_line,md5(v_pair.context_line::text)
    ) on conflict(business_id,client_tx_id,line_uid) do nothing;
    v_count:=v_count+1;
  end loop;
  if v_count<>jsonb_array_length(coalesce(p_context->'lines','[]'::jsonb))
     or v_count<>jsonb_array_length(coalesce(p_saved_items,'[]'::jsonb))
    then raise exception 'Frozen Evidence line cardinality mismatch'; end if;
  return public.food_recover_operation_frozen_evidence_v1(v_tx);
end;
$function$


-- food_production_batch_complete_v1(p_production_batch_id bigint, p_actual_output_quantity numeric, p_consumptions jsonb, p_client_tx_id text, p_notes text)
CREATE OR REPLACE FUNCTION public.food_production_batch_complete_v1(p_production_batch_id bigint, p_actual_output_quantity numeric, p_consumptions jsonb, p_client_tx_id text, p_notes text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_batch public.food_production_batches%rowtype;
  v_prep public.food_prep_items%rowtype;
  v record;
  v_stock public.ingredient_stock%rowtype;
  v_actual numeric(18,6);
  v_new numeric(18,6);
  v_unit_cost numeric(18,6);
  v_total_cost numeric(18,6):=0;
  v_output_cost numeric(18,6);
  v_emp bigint;
  v_output_stock public.ingredient_stock%rowtype;
  v_output_track boolean;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية إكمال الإنتاج'; end if;
  if v_key is null then raise exception 'معرف حركة الإكمال مطلوب'; end if;
  if coalesce(p_actual_output_quantity,0)<=0 then raise exception 'الناتج الفعلي يجب أن يكون أكبر من صفر'; end if;

  perform pg_advisory_xact_lock(hashtextextended('food-production-complete:'||v_key,0));
  select * into v_batch from public.food_production_batches where id=p_production_batch_id for update;
  if not found then raise exception 'Batch غير موجود'; end if;
  if not public.has_branch_access(v_batch.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_batch.status='completed' then
    if v_batch.completion_client_tx_id=v_key then return v_batch.id; end if;
    raise exception 'Batch مكتمل بالفعل';
  end if;
  if v_batch.status<>'in_progress' then raise exception 'Batch غير جاهز للإكمال'; end if;

  select * into v_prep from public.food_prep_items where id=v_batch.prep_item_id;
  if not found then raise exception 'Prep Item غير موجود'; end if;
  select coalesce(track_inventory,true) into v_output_track from public.ingredients where id=v_prep.output_ingredient_id;
  if not found then raise exception 'خامة ناتج التحضير غير موجودة'; end if;

  v_emp:=public.current_employee_id();
  update public.food_production_consumptions pc
  set actual_base_quantity=coalesce((
    select round((x->>'actual_base_quantity')::numeric,6)
    from jsonb_array_elements(coalesce(p_consumptions,'[]'::jsonb)) x
    where nullif(x->>'ingredient_id','')::bigint=pc.ingredient_id limit 1
  ),pc.planned_base_quantity)
  where pc.production_batch_id=v_batch.id;

  for v in
    select pc.*,i.track_inventory,
      coalesce(nullif(s.average_unit_cost,0),coalesce(i.cost_per_unit,0))::numeric(18,6) fallback_cost
    from public.food_production_consumptions pc
    join public.ingredients i on i.id=pc.ingredient_id and i.active is distinct from false
    left join public.ingredient_stock s on s.branch_id=v_batch.branch_id and s.ingredient_id=i.id
    where pc.production_batch_id=v_batch.id
    order by pc.ingredient_id
  loop
    v_actual:=round(coalesce(v.actual_base_quantity,0),6);
    if v_actual<0 then raise exception 'استهلاك فعلي غير صحيح'; end if;
    if v_actual=0 then continue; end if;
    v_unit_cost:=coalesce(v.fallback_cost,0);

    if coalesce(v.track_inventory,true) then
      insert into public.ingredient_stock(branch_id,ingredient_id,quantity)
      values(v_batch.branch_id,v.ingredient_id,0)
      on conflict(business_id,branch_id,ingredient_id) do nothing;
      select * into v_stock from public.ingredient_stock
      where branch_id=v_batch.branch_id and ingredient_id=v.ingredient_id for update;
      v_unit_cost:=coalesce(nullif(v_stock.average_unit_cost,0),v.fallback_cost,0);
      if v_stock.quantity<v_actual then raise exception 'مخزون الخامة % غير كافٍ للإنتاج',v.ingredient_id; end if;
      v_new:=round(v_stock.quantity-v_actual,6);
      update public.ingredient_stock set quantity=v_new,updated_at=now() where id=v_stock.id;
      insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes)
      values(v_batch.branch_id,v.ingredient_id,'production_consume',-v_actual,'production_batch',v_batch.id,'Production input');
    end if;

    update public.food_production_consumptions set unit_cost_snapshot=v_unit_cost where id=v.id;
    v_total_cost:=v_total_cost+(v_actual*v_unit_cost);
  end loop;

  v_output_cost:=round(v_total_cost/greatest(p_actual_output_quantity,0.000001),6);
  if v_output_track then
    insert into public.ingredient_stock(branch_id,ingredient_id,quantity)
    values(v_batch.branch_id,v_prep.output_ingredient_id,0)
    on conflict(business_id,branch_id,ingredient_id) do nothing;
    select * into v_output_stock from public.ingredient_stock
    where branch_id=v_batch.branch_id and ingredient_id=v_prep.output_ingredient_id for update;
    v_new:=round(v_output_stock.quantity+p_actual_output_quantity,6);
    update public.ingredient_stock
    set quantity=v_new,
        average_unit_cost=case when v_new<=0 then v_output_cost else round(((v_output_stock.quantity*v_output_stock.average_unit_cost)+(p_actual_output_quantity*v_output_cost))/v_new,6) end,
        last_purchase_cost=v_output_cost,last_costed_at=now(),updated_at=now()
    where id=v_output_stock.id;
    insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes)
    values(v_batch.branch_id,v_prep.output_ingredient_id,'production_output',round(p_actual_output_quantity,6),'production_batch',v_batch.id,'Prep output');
  else
    update public.ingredients set cost_per_unit=v_output_cost,updated_at=now() where id=v_prep.output_ingredient_id;
  end if;

  update public.food_production_batches
  set status='completed',actual_output_quantity=round(p_actual_output_quantity,6),completed_by_employee_id=v_emp,
      completed_at=now(),completion_client_tx_id=v_key,
      notes=coalesce(nullif(trim(coalesce(p_notes,'')),''),notes),updated_at=now()
  where id=v_batch.id;
  return v_batch.id;
end;
$function$


-- food_stock_count_post_v1(p_branch_id bigint, p_notes text, p_items jsonb, p_client_tx_id text)
CREATE OR REPLACE FUNCTION public.food_stock_count_post_v1(p_branch_id bigint, p_notes text, p_items jsonb, p_client_tx_id text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_id bigint;v_emp bigint;v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v record;v_stock public.ingredient_stock%rowtype;v_count numeric(18,6);v_var numeric(18,6);
begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;if not public.has_action_permission_v2('food.stock_count.post') then raise exception 'ليس لديك صلاحية ترحيل جرد الخامات';end if;if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;if v_key is null then raise exception 'معرف الحركة مطلوب';end if;if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'لا توجد خامات للجرد';end if;perform pg_advisory_xact_lock(hashtextextended('food-count:'||v_key,0));select id into v_id from public.food_stock_counts where client_tx_id=v_key;if v_id is not null then return v_id;end if;
 v_emp:=public.current_employee_id();insert into public.food_stock_counts(branch_id,notes,client_tx_id,created_by_employee_id) values(p_branch_id,nullif(trim(coalesce(p_notes,'')),''),v_key,v_emp) returning id into v_id;
 for v in select * from jsonb_to_recordset(p_items) as x(ingredient_id bigint,counted_quantity numeric) loop
  if not exists(select 1 from public.ingredients where id=v.ingredient_id and active is distinct from false and track_inventory=true) then raise exception 'الخامة غير موجودة أو غير متتبعة %',v.ingredient_id;end if;insert into public.ingredient_stock(branch_id,ingredient_id,quantity) values(p_branch_id,v.ingredient_id,0) on conflict(business_id,branch_id,ingredient_id) do nothing;select * into v_stock from public.ingredient_stock where branch_id=p_branch_id and ingredient_id=v.ingredient_id for update;v_count:=round(coalesce(v.counted_quantity,-1)::numeric,6);if v_count<0 then raise exception 'كمية الجرد لا يمكن أن تكون سالبة';end if;v_var:=round(v_count-v_stock.quantity,6);if v_var<>0 then perform public.food_apply_ingredient_delta_internal_v1(p_branch_id,v.ingredient_id,v_var,null,'stock_count','food_stock_count',v_id,'تسوية جرد خامات');end if;insert into public.food_stock_count_items(stock_count_id,ingredient_id,system_quantity,counted_quantity,variance,unit_cost_snapshot) values(v_id,v.ingredient_id,v_stock.quantity,v_count,v_var,v_stock.average_unit_cost);
 end loop;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(v_emp,p_branch_id,'food.stock_count.post','food_stock_count',v_id,jsonb_build_object('client_tx_id',v_key));return v_id;
end;$function$


-- food_waste_post_v1(p_branch_id bigint, p_ingredient_id bigint, p_prep_item_id bigint, p_shift_id bigint, p_reason_code text, p_quantity numeric, p_unit_code text, p_notes text, p_client_tx_id text)
CREATE OR REPLACE FUNCTION public.food_waste_post_v1(p_branch_id bigint, p_ingredient_id bigint, p_prep_item_id bigint, p_shift_id bigint, p_reason_code text, p_quantity numeric, p_unit_code text, p_notes text, p_client_tx_id text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_id bigint;
  v_factor numeric;
  v_base numeric(18,6);
  v_stock public.ingredient_stock%rowtype;
  v_new numeric(18,6);
  v_cost numeric(18,6);
  v_emp bigint;
  v_track boolean;
  v_base_unit text;
  v_fallback_cost numeric(18,6);
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية تسجيل الهالك'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  if coalesce(p_quantity,0)<=0 then raise exception 'كمية الهالك غير صحيحة'; end if;
  if not exists(select 1 from public.food_waste_reasons where code=p_reason_code and active=true) then raise exception 'سبب الهالك غير صالح'; end if;

  select i.base_unit_code,i.track_inventory,coalesce(nullif(s.average_unit_cost,0),i.cost_per_unit,0)
  into v_base_unit,v_track,v_fallback_cost
  from public.ingredients i
  left join public.ingredient_stock s on s.branch_id=p_branch_id and s.ingredient_id=i.id
  where i.id=p_ingredient_id and i.active is distinct from false;
  if v_base_unit is null then raise exception 'الخامة غير مجهزة بوحدة أساسية'; end if;

  v_factor:=public.ingredient_unit_factor_v1(p_ingredient_id,p_unit_code,v_base_unit);
  if v_factor is null or v_factor<=0 then raise exception 'لا يوجد تحويل وحدة صالح للهالك'; end if;
  v_base:=round(p_quantity*v_factor,6);
  if p_prep_item_id is not null and not exists(
    select 1 from public.food_prep_items where id=p_prep_item_id and output_ingredient_id=p_ingredient_id
  ) then raise exception 'Prep Item لا يطابق خامة الناتج'; end if;

  perform pg_advisory_xact_lock(hashtextextended('food-waste:'||v_key,0));
  select id into v_id from public.food_waste_events where client_tx_id=v_key;
  if v_id is not null then return v_id; end if;

  v_cost:=coalesce(v_fallback_cost,0);
  if coalesce(v_track,true) then
    insert into public.ingredient_stock(branch_id,ingredient_id,quantity)
    values(p_branch_id,p_ingredient_id,0)
    on conflict(business_id,branch_id,ingredient_id) do nothing;
    select * into v_stock from public.ingredient_stock
    where branch_id=p_branch_id and ingredient_id=p_ingredient_id for update;
    if v_stock.quantity<v_base then raise exception 'مخزون الخامة غير كافٍ للهالك'; end if;
    v_cost:=coalesce(nullif(v_stock.average_unit_cost,0),v_fallback_cost,0);
    v_new:=round(v_stock.quantity-v_base,6);
    update public.ingredient_stock set quantity=v_new,updated_at=now() where id=v_stock.id;
  end if;

  v_emp:=public.current_employee_id();
  insert into public.food_waste_events(
    branch_id,ingredient_id,prep_item_id,shift_id,reason_code,quantity,unit_code,conversion_factor_to_base,
    unit_cost_snapshot,status,client_tx_id,notes,employee_id
  ) values(
    p_branch_id,p_ingredient_id,p_prep_item_id,p_shift_id,p_reason_code,round(p_quantity,6),p_unit_code,round(v_factor,6),
    round(v_cost,6),'posted',v_key,nullif(trim(coalesce(p_notes,'')),''),v_emp
  ) returning id into v_id;

  if coalesce(v_track,true) then
    insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes)
    values(p_branch_id,p_ingredient_id,'waste',-v_base,'waste',v_id,p_reason_code||coalesce(' — '||nullif(trim(coalesce(p_notes,'')),''),''));
  end if;
  return v_id;
end;
$function$


-- healthcare_patient_profile_set_v1(p_customer_id bigint, p_blood_type text, p_allergies text, p_chronic_conditions text, p_medical_notes text, p_emergency_name text, p_emergency_phone text)
CREATE OR REPLACE FUNCTION public.healthcare_patient_profile_set_v1(p_customer_id bigint, p_blood_type text, p_allergies text, p_chronic_conditions text, p_medical_notes text, p_emergency_name text, p_emergency_phone text)
 RETURNS healthcare_patient_profiles_v1
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$declare r public.healthcare_patient_profiles_v1%rowtype;begin if auth.uid() is null then raise exception 'غير مصرح';end if;insert into public.healthcare_patient_profiles_v1(customer_id,blood_type,allergies,chronic_conditions,medical_notes,emergency_contact_name,emergency_contact_phone) values(p_customer_id,nullif(trim(coalesce(p_blood_type,'')),''),nullif(trim(coalesce(p_allergies,'')),''),nullif(trim(coalesce(p_chronic_conditions,'')),''),nullif(trim(coalesce(p_medical_notes,'')),''),nullif(trim(coalesce(p_emergency_name,'')),''),nullif(trim(coalesce(p_emergency_phone,'')),'')) on conflict(business_id,customer_id) do update set blood_type=excluded.blood_type,allergies=excluded.allergies,chronic_conditions=excluded.chronic_conditions,medical_notes=excluded.medical_notes,emergency_contact_name=excluded.emergency_contact_name,emergency_contact_phone=excluded.emergency_contact_phone,updated_at=now() returning * into r;return r;end;$function$


-- hr_apply_attendance_rules_v1(p_employee_id bigint, p_work_date date)
CREATE OR REPLACE FUNCTION public.hr_apply_attendance_rules_v1(p_employee_id bigint, p_work_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare s public.hr_attendance_daily_summary%rowtype;h public.hr_employees%rowtype;r record;amountv numeric;typev text;reasonv text;keyv text;createdv int:=0;e bigint;countv integer;bucketv text;begin
 if auth.uid() is null or not public.has_permission('hr.deduction_rules.manage') then raise exception 'ليس لديك صلاحية تطبيق قواعد الحضور';end if;select * into s from public.hr_attendance_daily_summary where employee_id=p_employee_id and work_date=p_work_date and verification_status='approved';if not found then raise exception 'ملخص الحضور غير معتمد';end if;select * into h from public.hr_employees where id=p_employee_id;if not public.has_branch_access(s.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;e:=public.current_employee_id();
 for r in select distinct dr.* from public.hr_deduction_rules dr left join public.hr_deduction_rule_assignments ra on ra.rule_id=dr.id and ra.active=true where dr.active=true and p_work_date between dr.effective_from and coalesce(dr.effective_to,p_work_date) and ((dr.scope='all') or (dr.scope='branch' and (dr.branch_id=s.branch_id or ra.branch_id=s.branch_id)) or (dr.scope='employee' and ra.employee_id=p_employee_id)) loop
  amountv:=0;typev:='deduction';reasonv:=r.name;
  bucketv:=case r.frequency when 'weekly' then to_char(p_work_date,'IYYY-IW') when 'monthly' then to_char(p_work_date,'YYYY-MM') when 'one_time' then 'once' else p_work_date::text end;
  if r.rule_type in ('late_fixed','late_minutes') and s.late_minutes>=coalesce(r.threshold,1) then amountv:=case when r.rule_type='late_minutes' then floor(s.late_minutes/greatest(coalesce((r.formula->>'minutes_per_unit')::numeric,r.threshold,1),1))*coalesce((r.formula->>'amount_per_unit')::numeric,r.amount,0) else coalesce(r.amount,0) end;reasonv:='تأخير '||s.late_minutes||' دقيقة - '||p_work_date;
  elsif r.rule_type='late_count' then select count(*) into countv from public.hr_attendance_daily_summary ds where ds.employee_id=p_employee_id and ds.verification_status='approved' and ds.late_minutes>0 and ds.work_date between date_trunc('month',p_work_date)::date and p_work_date;if countv>=greatest(coalesce(r.threshold,1),1) then amountv:=coalesce(r.amount,0);reasonv:='تكرار التأخير '||countv||' مرات حتى '||p_work_date;bucketv:=to_char(p_work_date,'YYYY-MM')||':cycle:'||floor(countv/greatest(coalesce(r.threshold,1),1));end if;
  elsif r.rule_type='absence_day' and s.absent then amountv:=coalesce(r.amount,0);reasonv:='غياب يوم - '||p_work_date;
  elsif r.rule_type='early_leave' and s.early_leave_minutes>=coalesce(r.threshold,1) then amountv:=coalesce(r.amount,0);reasonv:='خروج مبكر '||s.early_leave_minutes||' دقيقة - '||p_work_date;
  elsif r.rule_type='overtime_bonus' and s.overtime_minutes>=coalesce(r.threshold,1) then amountv:=floor(s.overtime_minutes/greatest(coalesce((r.formula->>'minutes_per_unit')::numeric,r.threshold,1),1))*coalesce((r.formula->>'amount_per_unit')::numeric,r.amount,0);typev:='overtime';reasonv:='إضافي '||s.overtime_minutes||' دقيقة - '||p_work_date;
  elsif r.rule_type='attendance_bonus' and not s.absent and s.late_minutes=0 and not s.incomplete then amountv:=coalesce(r.amount,0);typev:='bonus';reasonv:='مكافأة انتظام - '||p_work_date;
  elsif r.rule_type='fixed_deduction' then amountv:=coalesce(r.amount,0);reasonv:=r.name||' - '||p_work_date;
  elsif r.rule_type='fixed_bonus' then amountv:=coalesce(r.amount,0);typev:='bonus';reasonv:=r.name||' - '||p_work_date;end if;
  if amountv>0 then keyv:='attendance-rule:'||r.id||':employee:'||p_employee_id||':'||bucketv;
   insert into public.hr_employee_adjustments(employee_id,branch_id,adjustment_type,amount,effective_date,reason,client_tx_id,created_by_employee_id,rule_id,source_daily_summary_id,source_identity,source_detail)
   values(p_employee_id,s.branch_id,typev,round(amountv,2),p_work_date,reasonv,keyv,e,r.id,s.id,keyv,jsonb_build_object('late_minutes',s.late_minutes,'absence',s.absent,'early_leave_minutes',s.early_leave_minutes,'overtime_minutes',s.overtime_minutes,'approval_status','approved')) on conflict(business_id,source_identity) where source_identity is not null do nothing;
   if found then createdv:=createdv+1;end if;
  end if;
 end loop;return createdv;
end;$function$


-- hr_attendance_recalculate_day_v1(p_employee_id bigint, p_work_date date)
CREATE OR REPLACE FUNCTION public.hr_attendance_recalculate_day_v1(p_employee_id bigint, p_work_date date)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare h public.hr_employees%rowtype;s record;tz text;startv timestamptz;endv timestamptz;inv timestamptz;outv timestamptz;
 worked int:=0;latev int:=0;earlyv int:=0;otv int:=0;leavev boolean:=false;absentv boolean:=false;incompletev boolean:=false;missingv boolean:=false;
 digestv bytea;old_digest bytea;old_status text;sid bigint;adj jsonb;begin
 select * into h from public.hr_employees where id=p_employee_id;if not found then raise exception 'الموظف غير موجود';end if;
 select ws.*,a.id assignment_id into s from public.hr_employee_schedule_assignments a join public.hr_work_schedules ws on ws.id=a.schedule_id
 where a.employee_id=p_employee_id and a.active=true and ws.active=true and a.effective_from<=p_work_date and (a.effective_to is null or a.effective_to>=p_work_date)
 and ws.effective_from<=p_work_date and (ws.effective_to is null or ws.effective_to>=p_work_date) order by a.effective_from desc,a.id desc limit 1;
 if found and not (extract(dow from p_work_date)::smallint=any(s.work_days)) then s.id:=null;end if;
 tz:=coalesce(nullif(s.timezone,''),(select timezone from public.hr_settings where branch_id=h.home_branch_id),'Africa/Cairo');
 if s.id is not null then
  startv:=(p_work_date+s.scheduled_start) at time zone tz;
  endv:=((p_work_date+case when s.overnight then 1 else 0 end)+s.scheduled_end) at time zone tz;
 end if;
 select min(captured_at_device) filter(where event_type='check_in'),max(captured_at_device) filter(where event_type='check_out') into inv,outv
 from public.hr_attendance_events where employee_id=p_employee_id and verification_status in ('verified','verified_after_sync')
 and captured_at_device>=coalesce(startv,p_work_date::timestamp at time zone tz)-interval '6 hours'
 and captured_at_device<=coalesce(endv,(p_work_date+1)::timestamp at time zone tz)+interval '6 hours';
 select a.after_value into adj from public.hr_attendance_adjustments a left join public.hr_attendance_daily_summary ds on ds.id=a.summary_id
 where a.employee_id=p_employee_id and a.status='approved' and (ds.work_date=p_work_date or (a.after_value->>'work_date')::date=p_work_date)
 order by a.approved_at desc nulls last,a.adjusted_at desc limit 1;
 if adj ? 'actual_check_in_at' then inv:=nullif(adj->>'actual_check_in_at','')::timestamptz;end if;
 if adj ? 'actual_check_out_at' then outv:=nullif(adj->>'actual_check_out_at','')::timestamptz;end if;
 select exists(select 1 from public.hr_leave_requests l where l.employee_id=p_employee_id and l.status='approved' and l.starts_at<(p_work_date+1)::timestamp at time zone tz and l.ends_at>p_work_date::timestamp at time zone tz) into leavev;
 if s.id is not null then
  absentv:=inv is null and not leavev;
  missingv:=inv is not null and outv is null;
  incompletev:=missingv or (inv is null and outv is not null);
  if inv is not null then latev:=greatest(0,floor(extract(epoch from(inv-startv))/60)::int-s.grace_minutes);end if;
  if outv is not null then earlyv:=greatest(0,floor(extract(epoch from(endv-outv))/60)::int-s.early_leave_grace_minutes);otv:=greatest(0,floor(extract(epoch from(outv-endv))/60)::int-s.overtime_after_minutes);end if;
  if inv is not null and outv is not null and outv>inv then worked:=greatest(0,floor(extract(epoch from(outv-inv))/60)::int-s.break_minutes);end if;
 end if;
 if adj ? 'late_minutes' then latev:=greatest(0,(adj->>'late_minutes')::int);end if;
 if adj ? 'early_leave_minutes' then earlyv:=greatest(0,(adj->>'early_leave_minutes')::int);end if;
 if adj ? 'overtime_minutes' then otv:=greatest(0,(adj->>'overtime_minutes')::int);end if;
 if adj ? 'worked_minutes' then worked:=greatest(0,(adj->>'worked_minutes')::int);end if;
 digestv:=extensions.digest(convert_to(jsonb_build_object('schedule',s.id,'in',inv,'out',outv,'leave',leavev,'adjustment',adj)::text,'UTF8'),'sha256');
 select input_digest,verification_status into old_digest,old_status from public.hr_attendance_daily_summary where employee_id=p_employee_id and work_date=p_work_date;
 insert into public.hr_attendance_daily_summary(employee_id,branch_id,schedule_id,work_date,scheduled_start_at,scheduled_end_at,actual_check_in_at,actual_check_out_at,worked_minutes,break_minutes,late_minutes,early_leave_minutes,overtime_minutes,absent,incomplete,missing_check_out,approved_leave,verification_status,input_digest,calculated_at,updated_at)
 values(p_employee_id,h.home_branch_id,s.id,p_work_date,startv,endv,inv,outv,worked,coalesce(s.break_minutes,0),latev,earlyv,otv,absentv,incompletev,missingv,leavev,case when old_digest=digestv and old_status='approved' then 'approved' else 'draft' end,digestv,now(),now())
 on conflict(business_id,employee_id,work_date) do update set branch_id=excluded.branch_id,schedule_id=excluded.schedule_id,scheduled_start_at=excluded.scheduled_start_at,scheduled_end_at=excluded.scheduled_end_at,actual_check_in_at=excluded.actual_check_in_at,actual_check_out_at=excluded.actual_check_out_at,worked_minutes=excluded.worked_minutes,break_minutes=excluded.break_minutes,late_minutes=excluded.late_minutes,early_leave_minutes=excluded.early_leave_minutes,overtime_minutes=excluded.overtime_minutes,absent=excluded.absent,incomplete=excluded.incomplete,missing_check_out=excluded.missing_check_out,approved_leave=excluded.approved_leave,verification_status=excluded.verification_status,input_digest=excluded.input_digest,calculated_at=now(),updated_at=now()
 returning id into sid;
 return sid;
end;$function$


-- hr_employee_compensation_set_v1(p_employee_id bigint, p_salary_basis text, p_base_salary numeric, p_effective_from date)
CREATE OR REPLACE FUNCTION public.hr_employee_compensation_set_v1(p_employee_id bigint, p_salary_basis text, p_base_salary numeric, p_effective_from date DEFAULT CURRENT_DATE)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare h public.hr_employees%rowtype;e bigint;begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not public.has_permission('hr.salary.manage') then raise exception 'ليس لديك صلاحية تعديل الرواتب';end if;
 select * into h from public.hr_employees where id=p_employee_id and active=true;if not found then raise exception 'الموظف غير موجود';end if;
 if not public.has_branch_access(h.home_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 if p_salary_basis not in ('monthly','daily','hourly') or coalesce(p_base_salary,-1)<0 then raise exception 'بيانات الراتب غير صحيحة';end if;
 e:=public.current_employee_id();
 insert into public.hr_employee_compensation(employee_id,salary_basis,base_salary,effective_from,updated_by_employee_id,updated_at)
 values(p_employee_id,p_salary_basis,round(p_base_salary,2),coalesce(p_effective_from,current_date),e,now())
 on conflict(business_id,employee_id) do update set salary_basis=excluded.salary_basis,base_salary=excluded.base_salary,effective_from=excluded.effective_from,updated_by_employee_id=e,updated_at=now();
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,h.home_branch_id,'hr_salary_update','hr_employee',p_employee_id,jsonb_build_object('salary_basis',p_salary_basis,'base_salary',round(p_base_salary,2),'effective_from',coalesce(p_effective_from,current_date)));
 return true;
end;$function$


-- hr_geofence_set_v1(p_branch_id bigint, p_latitude double precision, p_longitude double precision, p_allowed_radius_m numeric, p_minimum_accuracy_m numeric, p_active boolean)
CREATE OR REPLACE FUNCTION public.hr_geofence_set_v1(p_branch_id bigint, p_latitude double precision, p_longitude double precision, p_allowed_radius_m numeric, p_minimum_accuracy_m numeric, p_active boolean DEFAULT true)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare idv bigint;e bigint;beforev jsonb;begin
 if auth.uid() is null or not public.has_permission('hr.geofence.manage') then raise exception 'ليس لديك صلاحية إدارة نطاق الفرع';end if;if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 select to_jsonb(g) into beforev from public.hr_branch_geofences g where branch_id=p_branch_id;e:=public.current_employee_id();
 insert into public.hr_branch_geofences(branch_id,latitude,longitude,allowed_radius_m,minimum_accuracy_m,active,created_by_employee_id) values(p_branch_id,p_latitude,p_longitude,p_allowed_radius_m,p_minimum_accuracy_m,p_active,e)
 on conflict(business_id,branch_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,allowed_radius_m=excluded.allowed_radius_m,minimum_accuracy_m=excluded.minimum_accuracy_m,active=excluded.active,updated_at=now() returning id into idv;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,p_branch_id,'hr_geofence_set','hr_branch_geofence',idv,jsonb_build_object('before',beforev,'after',jsonb_build_object('latitude',p_latitude,'longitude',p_longitude,'allowed_radius_m',p_allowed_radius_m,'minimum_accuracy_m',p_minimum_accuracy_m,'active',p_active)));return idv;
end;$function$


-- hr_payroll_pay_attendance_v1(p_payroll_period_id bigint, p_method text, p_reference text, p_shift_id bigint, p_client_tx_id text)
CREATE OR REPLACE FUNCTION public.hr_payroll_pay_attendance_v1(p_payroll_period_id bigint, p_method text, p_reference text, p_shift_id bigint, p_client_tx_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare p public.hr_payroll_periods%rowtype;i record;a record;e bigint;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');remain numeric;takev numeric;begin
 if auth.uid() is null or not public.has_permission('hr.payroll.pay') or not public.has_permission('treasury.post') then raise exception 'ليس لديك صلاحية صرف المرتبات';end if;
 select * into p from public.hr_payroll_periods where id=p_payroll_period_id for update;if not found then raise exception 'مسير المرتبات غير موجود';end if;if p.branch_id is not null and not public.has_branch_access(p.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;if p.status='paid' then return true;end if;if p.status<>'approved' then raise exception 'يجب اعتماد مسير المرتبات قبل الصرف';end if;if k is null then raise exception 'معرف الحركة مطلوب';end if;e:=public.current_employee_id();
 for i in select * from public.hr_payroll_items where payroll_period_id=p.id order by id loop
  if i.net_amount>0 then insert into public.treasury_movements(branch_id,shift_id,direction,movement_type,amount,method,entity_type,entity_id,reference,notes,client_tx_id,employee_id) values(p.branch_id,p_shift_id,'out','payroll',i.net_amount,coalesce(nullif(trim(coalesce(p_method,'')),''),'cash'),'hr_payroll_item',i.id,nullif(trim(coalesce(p_reference,'')),''),'صرف مرتب موظف',k||':employee:'||i.employee_id,e) on conflict(business_id,client_tx_id) do nothing;end if;
  remain:=i.advance_deduction;if remain>0 then for a in select id,outstanding_amount from public.hr_employee_advances where employee_id=i.employee_id and status='active' and outstanding_amount>0 order by requested_on,id for update loop exit when remain<=0;takev:=least(a.outstanding_amount,remain);update public.hr_employee_advances set outstanding_amount=round(outstanding_amount-takev,2),status=case when outstanding_amount-takev<=0.009 then 'settled' else 'active' end,updated_at=now() where id=a.id;remain:=round(remain-takev,2);end loop;end if;
  update public.hr_employee_adjustments set status='applied',payroll_period_id=p.id where employee_id=i.employee_id and status='pending' and approval_status='approved' and effective_date between p.period_start and p.period_end;
 end loop;
 update public.hr_payroll_periods set status='paid',paid_by_employee_id=e,paid_at=now() where id=p.id;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,p.branch_id,'hr_payroll_pay_attendance','hr_payroll_period',p.id,jsonb_build_object('method',p_method,'reference',p_reference));return true;
end;$function$


-- hr_payroll_pay_v1(p_payroll_period_id bigint, p_method text, p_reference text, p_shift_id bigint, p_client_tx_id text)
CREATE OR REPLACE FUNCTION public.hr_payroll_pay_v1(p_payroll_period_id bigint, p_method text, p_reference text, p_shift_id bigint, p_client_tx_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare p public.hr_payroll_periods%rowtype;i record;a record;e bigint;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');remain numeric;takev numeric;begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not public.has_permission('hr.payroll.pay') or not public.has_permission('treasury.post') then raise exception 'ليس لديك صلاحية صرف المرتبات';end if;
 select * into p from public.hr_payroll_periods where id=p_payroll_period_id for update;if not found then raise exception 'مسير المرتبات غير موجود';end if;
 if p.branch_id is not null and not public.has_branch_access(p.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 if p.status='paid' then return true;end if;
 if p.status<>'approved' then raise exception 'يجب اعتماد مسير المرتبات قبل الصرف';end if;
 if k is null then raise exception 'معرف الحركة مطلوب';end if;
 e:=public.current_employee_id();
 for i in select * from public.hr_payroll_items where payroll_period_id=p.id order by id loop
   if i.net_amount>0 then
     insert into public.treasury_movements(branch_id,shift_id,direction,movement_type,amount,method,entity_type,entity_id,reference,notes,client_tx_id,employee_id)
     values(p.branch_id,p_shift_id,'out','payroll',i.net_amount,coalesce(nullif(trim(coalesce(p_method,'')),''),'cash'),'hr_payroll_item',i.id,nullif(trim(coalesce(p_reference,'')),''),'صرف مرتب موظف',k||':employee:'||i.employee_id,e)
     on conflict(business_id,client_tx_id) do nothing;
   end if;
   remain:=i.advance_deduction;
   if remain>0 then
     for a in select id,outstanding_amount from public.hr_employee_advances where employee_id=i.employee_id and status='active' and outstanding_amount>0 order by requested_on,id for update loop
       exit when remain<=0;
       takev:=least(a.outstanding_amount,remain);
       update public.hr_employee_advances set outstanding_amount=round(outstanding_amount-takev,2),status=case when outstanding_amount-takev<=0.009 then 'settled' else 'active' end,updated_at=now() where id=a.id;
       remain:=round(remain-takev,2);
     end loop;
   end if;
   update public.hr_employee_adjustments set status='applied',payroll_period_id=p.id where employee_id=i.employee_id and status='pending' and effective_date between p.period_start and p.period_end;
 end loop;
 update public.hr_payroll_periods set status='paid',paid_by_employee_id=e,paid_at=now() where id=p.id;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(e,p.branch_id,'hr_payroll_pay','hr_payroll_period',p.id,jsonb_build_object('method',p_method,'reference',p_reference));
 return true;
end;$function$


-- hr_recurring_adjustments_generate_v1(p_branch_id bigint, p_effective_date date)
CREATE OR REPLACE FUNCTION public.hr_recurring_adjustments_generate_v1(p_branch_id bigint, p_effective_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare r record;keyv text;createdv int:=0;e bigint;periodv text;begin
 if auth.uid() is null or not public.has_permission('hr.deduction_rules.manage') then raise exception 'ليس لديك صلاحية توليد الخصومات الدورية';end if;if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;e:=public.current_employee_id();
 for r in select * from public.hr_recurring_adjustments where branch_id=p_branch_id and status='active' and start_date<=p_effective_date and (end_date is null or end_date>=p_effective_date) and (occurrences_limit is null or occurrences_applied<occurrences_limit) for update loop
  periodv:=case r.frequency when 'weekly' then to_char(p_effective_date,'IYYY-IW') when 'monthly' then to_char(p_effective_date,'YYYY-MM') else p_effective_date::text end;keyv:='recurring:'||r.id||':'||periodv;
  insert into public.hr_employee_adjustments(employee_id,branch_id,adjustment_type,amount,effective_date,reason,client_tx_id,created_by_employee_id,source_identity,source_detail) values(r.employee_id,r.branch_id,r.adjustment_type,r.amount,p_effective_date,r.reason,keyv,e,keyv,jsonb_build_object('recurring_adjustment_id',r.id,'period',periodv)) on conflict(business_id,source_identity) where source_identity is not null do nothing;
  if found then createdv:=createdv+1;update public.hr_recurring_adjustments set occurrences_applied=occurrences_applied+1,status=case when occurrences_limit is not null and occurrences_applied+1>=occurrences_limit then 'completed' else status end,updated_at=now() where id=r.id;end if;
 end loop;return createdv;
end;$function$


-- hr_settings_set_v1(p_branch_id bigint, p_timezone text, p_outside_policy text, p_poor_accuracy_policy text, p_require_selfie boolean, p_selfie_retention_days integer)
CREATE OR REPLACE FUNCTION public.hr_settings_set_v1(p_branch_id bigint, p_timezone text, p_outside_policy text, p_poor_accuracy_policy text, p_require_selfie boolean, p_selfie_retention_days integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare e bigint;beforev jsonb;begin
 if auth.uid() is null or not public.has_permission('hr.settings.manage') then raise exception 'ليس لديك صلاحية إدارة إعدادات HR';end if;if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 if p_outside_policy not in ('reject','pending_review') or p_poor_accuracy_policy not in ('reject','pending_review') or p_selfie_retention_days not between 1 and 3650 then raise exception 'إعدادات HR غير صحيحة';end if;
 select to_jsonb(s) into beforev from public.hr_settings s where branch_id=p_branch_id;e:=public.current_employee_id();
 insert into public.hr_settings(branch_id,timezone,outside_geofence_policy,poor_accuracy_policy,require_selfie,selfie_retention_days,updated_by_employee_id,updated_at)
 values(p_branch_id,coalesce(nullif(trim(p_timezone),''),'Africa/Cairo'),p_outside_policy,p_poor_accuracy_policy,coalesce(p_require_selfie,true),p_selfie_retention_days,e,now())
 on conflict(business_id,branch_id) do update set timezone=excluded.timezone,outside_geofence_policy=excluded.outside_geofence_policy,poor_accuracy_policy=excluded.poor_accuracy_policy,require_selfie=excluded.require_selfie,selfie_retention_days=excluded.selfie_retention_days,updated_by_employee_id=e,updated_at=now();
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,p_branch_id,'hr_settings_set','hr_settings',p_branch_id,jsonb_build_object('before',beforev,'after',jsonb_build_object('timezone',p_timezone,'outside_policy',p_outside_policy,'poor_accuracy_policy',p_poor_accuracy_policy,'require_selfie',p_require_selfie,'selfie_retention_days',p_selfie_retention_days)));return true;
end;$function$


-- hr_staff_account_create_or_reset_v1(p_employee_id bigint, p_reset_existing boolean)
CREATE OR REPLACE FUNCTION public.hr_staff_account_create_or_reset_v1(p_employee_id bigint, p_reset_existing boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare h public.hr_employees%rowtype;a public.hr_staff_accounts%rowtype;e bigint;pin text;begin
 if auth.uid() is null or not public.has_permission('hr.staff_accounts.manage') then raise exception 'ليس لديك صلاحية إدارة حسابات الموظفين';end if;
 select * into h from public.hr_employees where id=p_employee_id for update;if not found or not h.active then raise exception 'الموظف غير موجود أو موقوف';end if;
 if not public.has_branch_access(h.home_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;
 select * into a from public.hr_staff_accounts where employee_id=p_employee_id for update;
 if found and not p_reset_existing then raise exception 'حساب الموظف موجود بالفعل';end if;
 pin:=lpad(((get_byte(extensions.gen_random_bytes(4),0)::integer*256*256+get_byte(extensions.gen_random_bytes(4),1)::integer*256+get_byte(extensions.gen_random_bytes(4),2)::integer)%1000000)::text,6,'0');e:=public.current_employee_id();
 insert into public.hr_staff_accounts(employee_id,pin_hash,must_change_pin,active,token_version,created_by_employee_id,updated_at)
 values(p_employee_id,extensions.crypt(pin,extensions.gen_salt('bf',10)),true,true,1,e,now())
 on conflict(business_id,employee_id) do update set pin_hash=excluded.pin_hash,must_change_pin=true,active=true,failed_attempts=0,locked_until=null,token_version=hr_staff_accounts.token_version+1,disabled_at=null,disabled_by_employee_id=null,updated_at=now()
 returning * into a;
 update public.hr_staff_sessions set revoked_at=now() where staff_account_id=a.id and revoked_at is null;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(e,h.home_branch_id,case when p_reset_existing then 'hr_staff_pin_reset' else 'hr_staff_account_create' end,'hr_staff_account',a.id,jsonb_build_object('hr_employee_id',p_employee_id));
 return jsonb_build_object('staff_account_id',a.id,'temporary_pin',pin,'must_change_pin',true);
end;$function$


-- hr_staff_login_v1(p_identity text, p_pin text, p_device_uid text, p_device_name text, p_device_model text, p_platform text, p_user_agent text)
CREATE OR REPLACE FUNCTION public.hr_staff_login_v1(p_identity text, p_pin text, p_device_uid text, p_device_name text, p_device_model text, p_platform text, p_user_agent text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare a public.hr_staff_accounts%rowtype;h public.hr_employees%rowtype;dv bigint;raw_token text;sid uuid;nowv timestamptz:=now();matches integer;begin
 if nullif(trim(coalesce(p_identity,'')),'') is null or p_pin !~ '^[0-9]{6}$' or nullif(trim(coalesce(p_device_uid,'')),'') is null then return jsonb_build_object('ok',false,'code','INVALID_CREDENTIALS');end if;
 select count(*) into matches from public.hr_staff_accounts sa join public.hr_employees he on he.id=sa.employee_id
 where sa.active=true and he.active=true and he.employment_status<>'terminated' and (lower(coalesce(he.employee_code,''))=lower(trim(p_identity)) or regexp_replace(coalesce(he.phone,''),'[^0-9]','','g')=regexp_replace(trim(p_identity),'[^0-9]','','g'));
 if matches<>1 then return jsonb_build_object('ok',false,'code','INVALID_CREDENTIALS');end if;
 select sa.* into a from public.hr_staff_accounts sa join public.hr_employees he on he.id=sa.employee_id
 where sa.active=true and he.active=true and he.employment_status<>'terminated'
   and (lower(coalesce(he.employee_code,''))=lower(trim(p_identity)) or regexp_replace(coalesce(he.phone,''),'[^0-9]','','g')=regexp_replace(trim(p_identity),'[^0-9]','','g'))
 order by sa.id limit 1 for update of sa;
 if not found or (a.locked_until is not null and a.locked_until>nowv) or extensions.crypt(p_pin,a.pin_hash)<>a.pin_hash then
   if found then update public.hr_staff_accounts set failed_attempts=failed_attempts+1,locked_until=case when failed_attempts+1>=5 then nowv+interval '15 minutes' else locked_until end,updated_at=nowv where id=a.id;end if;
   return jsonb_build_object('ok',false,'code','INVALID_CREDENTIALS');
 end if;
 select * into h from public.hr_employees where id=a.employee_id;
 insert into public.hr_attendance_devices(staff_account_id,employee_id,device_uid,device_name,device_model,platform,user_agent,last_seen_at)
 values(a.id,a.employee_id,trim(p_device_uid),nullif(trim(coalesce(p_device_name,'')),''),nullif(trim(coalesce(p_device_model,'')),''),nullif(trim(coalesce(p_platform,'')),''),nullif(trim(coalesce(p_user_agent,'')),''),nowv)
 on conflict(business_id,staff_account_id,device_uid) do update set device_name=excluded.device_name,device_model=excluded.device_model,platform=excluded.platform,user_agent=excluded.user_agent,last_seen_at=nowv
 returning id into dv;
 if exists(select 1 from public.hr_attendance_devices where id=dv and (active=false or revoked_at is not null)) then raise exception 'هذا الجهاز موقوف';end if;
 raw_token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.hr_staff_sessions(staff_account_id,device_id,token_digest,token_version,expires_at)
 values(a.id,dv,extensions.digest(convert_to(raw_token,'UTF8'),'sha256'),a.token_version,nowv+interval '30 days') returning id into sid;
 update public.hr_staff_accounts set failed_attempts=0,locked_until=null,last_login_at=nowv,updated_at=nowv where id=a.id;
 return jsonb_build_object('ok',true,'session_token',raw_token,'session_id',sid,'expires_at',nowv+interval '30 days','must_change_pin',a.must_change_pin,'employee',jsonb_build_object('id',h.id,'name',h.name,'employee_code',h.employee_code,'branch_id',h.home_branch_id),'device_id',dv);
end;$function$


-- inventory_stock_apply_movement_v2(p_client_tx_id text, p_line_key text, p_location_id bigint, p_item_kind text, p_item_id bigint, p_movement_type text, p_quantity numeric, p_reserved_quantity numeric, p_unit_cost numeric, p_stocktake_target_quantity numeric, p_source_document_type text, p_source_document_id text, p_counterparty_location_id bigint, p_reversal_of_movement_id bigint, p_occurred_at timestamp with time zone, p_expected_balance_version bigint, p_employee_id bigint, p_device_id text, p_metadata jsonb)
CREATE OR REPLACE FUNCTION public.inventory_stock_apply_movement_v2(p_client_tx_id text, p_line_key text, p_location_id bigint, p_item_kind text, p_item_id bigint, p_movement_type text, p_quantity numeric DEFAULT NULL::numeric, p_reserved_quantity numeric DEFAULT NULL::numeric, p_unit_cost numeric DEFAULT NULL::numeric, p_stocktake_target_quantity numeric DEFAULT NULL::numeric, p_source_document_type text DEFAULT NULL::text, p_source_document_id text DEFAULT NULL::text, p_counterparty_location_id bigint DEFAULT NULL::bigint, p_reversal_of_movement_id bigint DEFAULT NULL::bigint, p_occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_expected_balance_version bigint DEFAULT NULL::bigint, p_employee_id bigint DEFAULT NULL::bigint, p_device_id text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_client_tx_id text:=trim(coalesce(p_client_tx_id,''));
  v_line_key text:=trim(coalesce(p_line_key,''));
  v_location_id bigint:=p_location_id;
  v_item_kind text:=lower(trim(coalesce(p_item_kind,'')));
  v_item_id bigint:=p_item_id;
  v_counterparty_location_id bigint:=p_counterparty_location_id;
  v_movement_type text:=lower(trim(coalesce(p_movement_type,'')));
  v_source_document_type text:=trim(coalesce(p_source_document_type,''));
  v_source_document_id text:=trim(coalesce(p_source_document_id,''));
  v_quantity_input numeric(18,3);
  v_reserved_input numeric(18,3);
  v_unit_cost_input numeric(18,4);
  v_stocktake_target numeric(18,3);
  v_digest_payload jsonb;
  v_operation_digest text;
  v_idempotency record;
  v_existing public.inventory_stock_movements_v2%rowtype;
  v_original public.inventory_stock_movements_v2%rowtype;
  v_balance public.inventory_stock_balances_v2%rowtype;
  v_movement public.inventory_stock_movements_v2%rowtype;
  v_balance_created boolean:=false;
  v_parent_product_id bigint;
  v_allow_negative boolean;
  v_policy_code text;
  v_policy_version integer;
  v_policy_source text;
  v_quantity_delta numeric(18,3):=0;
  v_reserved_delta numeric(18,3):=0;
  v_quantity_after numeric(18,3);
  v_reserved_after numeric(18,3);
  v_unit_cost numeric(18,4);
  v_value_delta numeric(18,4);
  v_average_after numeric(18,4);
  v_last_after numeric(18,4);
  v_version_after bigint;
  v_occurred_at timestamptz:=coalesce(p_occurred_at,now());
  v_metadata jsonb:=coalesce(p_metadata,'{}'::jsonb);
begin
  if v_client_tx_id='' or v_line_key='' then
    raise exception 'INVENTORY_STOCK_V2_IDEMPOTENCY_KEY_REQUIRED';
  end if;
  if v_movement_type not in (
    'opening','adjustment','waste','damage','stocktake',
    'reservation','reservation_release','sale','sale_return',
    'purchase_receive','purchase_return','transfer_out','transfer_in','reversal'
  ) then
    raise exception 'INVENTORY_STOCK_V2_INVALID_MOVEMENT_TYPE';
  end if;
  if v_source_document_type='' or v_source_document_id='' then
    raise exception 'INVENTORY_STOCK_V2_SOURCE_DOCUMENT_REQUIRED';
  end if;

  -- Reversal authority is the original movement id. Caller-provided stock and
  -- cost inputs are deliberately canonicalized to NULL for reversal intents.
  if v_movement_type='reversal' then
    if p_reversal_of_movement_id is null then
      raise exception 'INVENTORY_STOCK_V2_REVERSAL_SOURCE_REQUIRED';
    end if;
    v_location_id:=null;
    v_item_kind:='';
    v_item_id:=null;
    v_counterparty_location_id:=null;
    v_quantity_input:=null;
    v_reserved_input:=null;
    v_unit_cost_input:=null;
    v_stocktake_target:=null;
  else
    if v_location_id is null or v_item_kind not in ('product','variant','ingredient') or coalesce(v_item_id,0)<=0 then
      raise exception 'INVENTORY_STOCK_V2_ITEM_REQUIRED';
    end if;
    v_quantity_input:=case when p_quantity is null then null else round(p_quantity,3)::numeric(18,3) end;
    v_reserved_input:=round(coalesce(p_reserved_quantity,0),3)::numeric(18,3);
    v_unit_cost_input:=case when p_unit_cost is null then null else round(p_unit_cost,4)::numeric(18,4) end;
    v_stocktake_target:=case when p_stocktake_target_quantity is null then null else round(p_stocktake_target_quantity,3)::numeric(18,3) end;
  end if;

  -- Stable intent only: retry-time timestamps, expected version, metadata,
  -- employee/device provenance, policies, derived values and result snapshots
  -- are intentionally excluded.
  v_digest_payload:=jsonb_build_object(
    'digest_schema_version',1,
    'client_tx_id',v_client_tx_id,
    'line_key',v_line_key,
    'location_id',v_location_id,
    'item_kind',nullif(v_item_kind,''),
    'item_id',v_item_id,
    'movement_type',v_movement_type,
    'source_document_type',v_source_document_type,
    'source_document_id',v_source_document_id,
    'counterparty_location_id',v_counterparty_location_id,
    'reversal_of_movement_id',p_reversal_of_movement_id,
    'canonical_quantity_input',v_quantity_input,
    'canonical_reserved_quantity_input',v_reserved_input,
    'canonical_unit_cost_input',v_unit_cost_input,
    'stocktake_target_quantity',v_stocktake_target
  );
  v_operation_digest:=pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_digest_payload::text,'UTF8'),'sha256'),
    'hex'
  );

  -- This obtains the transaction advisory lock before any current balance,
  -- version, policy or tracking-state validation.
  select * into v_idempotency
  from public.inventory_stock_resolve_idempotency_v2(
    v_client_tx_id,v_line_key,v_operation_digest
  );
  if v_idempotency.reuse_existing then
    select * into strict v_existing
    from public.inventory_stock_movements_v2 m
    where m.id=v_idempotency.movement_id;
    return jsonb_build_object(
      'reused',true,
      'movement',to_jsonb(v_existing),
      'balance',jsonb_build_object(
        'location_id',v_existing.location_id,
        'item_kind',v_existing.item_kind,
        'item_id',v_existing.item_id,
        'quantity_on_hand',v_existing.quantity_on_hand_after,
        'quantity_reserved',v_existing.quantity_reserved_after,
        'quantity_available',v_existing.quantity_available_after,
        'average_unit_cost',v_existing.average_unit_cost_after,
        'last_unit_cost',v_existing.last_unit_cost_after,
        'balance_version',v_existing.balance_version_after
      )
    );
  end if;

  if jsonb_typeof(v_metadata)<>'object' then
    raise exception 'INVENTORY_STOCK_V2_METADATA_OBJECT_REQUIRED';
  end if;
  if p_employee_id is not null and not exists(select 1 from public.employees e where e.id=p_employee_id) then
    raise exception 'INVENTORY_STOCK_V2_EMPLOYEE_NOT_FOUND';
  end if;
  if v_counterparty_location_id is not null and not exists(
    select 1 from public.branches b
    where b.id=v_counterparty_location_id
      and b.active=true
      and b.location_type in ('branch','central_warehouse')
  ) then
    raise exception 'INVENTORY_STOCK_V2_COUNTERPARTY_LOCATION_INVALID';
  end if;

  if v_movement_type='reversal' then
    select * into v_original
    from public.inventory_stock_movements_v2 m
    where m.id=p_reversal_of_movement_id
    for update;
    if not found then
      raise exception 'INVENTORY_STOCK_V2_REVERSAL_SOURCE_NOT_FOUND';
    end if;
    if v_original.movement_type='reversal' or v_original.reversal_of_movement_id is not null then
      raise exception 'INVENTORY_STOCK_V2_REVERSAL_OF_REVERSAL';
    end if;
    v_location_id:=v_original.location_id;
    v_item_kind:=v_original.item_kind;
    v_item_id:=v_original.item_id;
    v_counterparty_location_id:=v_original.counterparty_location_id;
  end if;

  if not exists(
    select 1 from public.branches b
    where b.id=v_location_id
      and b.active=true
      and b.location_type in ('branch','central_warehouse')
  ) then
    raise exception 'INVENTORY_STOCK_V2_LOCATION_INVALID';
  end if;

  -- Validate polymorphic stock ownership before attempting balance creation;
  -- the existing table triggers remain the final database-level guard.
  if v_item_kind='product' then
    if not exists(select 1 from public.products p where p.id=v_item_id) then
      raise exception 'INVENTORY_STOCK_V2_ITEM_NOT_FOUND';
    end if;
    if exists(select 1 from public.product_variants pv where pv.product_id=v_item_id and pv.is_stock_unit=true) then
      raise exception 'INVENTORY_STOCK_V2_PRODUCT_HAS_STOCK_VARIANTS';
    end if;
  elsif v_item_kind='variant' then
    select pv.product_id into v_parent_product_id
    from public.product_variants pv
    join public.products p on p.id=pv.product_id
    where pv.id=v_item_id and pv.is_stock_unit=true;
    if not found then
      raise exception 'INVENTORY_STOCK_V2_VARIANT_NOT_STOCK_UNIT';
    end if;
    if exists(
      select 1 from public.inventory_stock_balances_v2 b
      where b.location_id=v_location_id and b.item_kind='product' and b.item_id=v_parent_product_id
    ) or exists(
      select 1 from public.inventory_stock_movements_v2 m
      where m.location_id=v_location_id and m.item_kind='product' and m.item_id=v_parent_product_id
    ) then
      raise exception 'INVENTORY_STOCK_V2_COMPETING_PRODUCT_OWNERSHIP';
    end if;
  elsif v_item_kind='ingredient' then
    if not exists(select 1 from public.ingredients i where i.id=v_item_id) then
      raise exception 'INVENTORY_STOCK_V2_ITEM_NOT_FOUND';
    end if;
  else
    raise exception 'INVENTORY_STOCK_V2_INVALID_ITEM_KIND';
  end if;

  insert into public.inventory_stock_balances_v2(location_id,item_kind,item_id)
  values(v_location_id,v_item_kind,v_item_id)
  on conflict(business_id,location_id,item_kind,item_id) do nothing
  returning true into v_balance_created;
  v_balance_created:=coalesce(v_balance_created,false);

  select * into strict v_balance
  from public.inventory_stock_balances_v2 b
  where b.location_id=v_location_id and b.item_kind=v_item_kind and b.item_id=v_item_id
  for update;

  if p_expected_balance_version is not null then
    if (v_balance_created and p_expected_balance_version<>0)
      or (not v_balance_created and p_expected_balance_version<>v_balance.balance_version) then
      raise exception 'INVENTORY_STOCK_V2_BALANCE_VERSION_CONFLICT';
    end if;
  end if;
  if v_balance.tracking_state='untracked' then
    raise exception 'INVENTORY_STOCK_V2_TRACKING_DISABLED';
  elsif v_balance.tracking_state='blocked' then
    raise exception 'INVENTORY_STOCK_V2_TRACKING_BLOCKED';
  elsif v_balance.tracking_state<>'tracked' then
    raise exception 'INVENTORY_STOCK_V2_INVALID_TRACKING_STATE';
  end if;

  select p.allow_negative_stock,p.policy_code,p.policy_version,p.policy_source
  into strict v_allow_negative,v_policy_code,v_policy_version,v_policy_source
  from public.inventory_stock_resolve_policy_v2(v_location_id,v_item_kind,v_item_id) p;

  v_quantity_delta:=coalesce(v_quantity_input,0);
  v_reserved_delta:=coalesce(v_reserved_input,0);
  v_average_after:=v_balance.average_unit_cost;
  v_last_after:=v_balance.last_unit_cost;

  if v_movement_type='opening' then
    if not v_balance_created or exists(
      select 1 from public.inventory_stock_movements_v2 m
      where m.location_id=v_location_id and m.item_kind=v_item_kind and m.item_id=v_item_id
    ) then
      raise exception 'INVENTORY_STOCK_V2_OPENING_REQUIRES_NEW_IDENTITY';
    end if;
    if v_quantity_input is null or v_quantity_delta<=0 or v_reserved_delta<>0
      or v_unit_cost_input is null or v_unit_cost_input<0 then
      raise exception 'INVENTORY_STOCK_V2_INVALID_OPENING';
    end if;
    v_unit_cost:=v_unit_cost_input;
    v_value_delta:=round(v_quantity_delta*v_unit_cost,4);
    v_average_after:=v_unit_cost;
    v_last_after:=v_unit_cost;
  elsif v_movement_type='adjustment' then
    raise exception 'INVENTORY_STOCK_V2_ADJUSTMENT_COST_RULE_REQUIRED';
  elsif v_movement_type in ('waste','damage','purchase_return') then
    if v_quantity_input is null or v_quantity_delta>=0 or v_reserved_delta<>0 or v_unit_cost_input is not null then
      raise exception 'INVENTORY_STOCK_V2_INVALID_OUTBOUND_MOVEMENT';
    end if;
    v_unit_cost:=v_balance.average_unit_cost;
    v_value_delta:=round(v_quantity_delta*v_unit_cost,4);
  elsif v_movement_type in ('sale','transfer_out') then
    if v_quantity_input is null or v_quantity_delta>=0 or v_reserved_delta>0
      or v_reserved_delta<v_quantity_delta or v_unit_cost_input is not null then
      raise exception 'INVENTORY_STOCK_V2_INVALID_OUTBOUND_MOVEMENT';
    end if;
    v_unit_cost:=v_balance.average_unit_cost;
    v_value_delta:=round(v_quantity_delta*v_unit_cost,4);
  elsif v_movement_type in ('purchase_receive','transfer_in','sale_return') then
    if v_quantity_input is null or v_quantity_delta<=0 or v_reserved_delta<>0
      or v_unit_cost_input is null or v_unit_cost_input<0 then
      raise exception 'INVENTORY_STOCK_V2_INVALID_INBOUND_MOVEMENT';
    end if;
    if v_balance.quantity_on_hand<0 then
      raise exception 'INVENTORY_STOCK_V2_NEGATIVE_COST_BASIS_REQUIRED';
    end if;
    v_unit_cost:=v_unit_cost_input;
    v_value_delta:=round(v_quantity_delta*v_unit_cost,4);
    v_average_after:=round(
      ((v_balance.quantity_on_hand*v_balance.average_unit_cost)+v_value_delta)
      / nullif(v_balance.quantity_on_hand+v_quantity_delta,0),4
    );
    if v_movement_type in ('purchase_receive','transfer_in') then
      v_last_after:=v_unit_cost;
    end if;
  elsif v_movement_type='reservation' then
    if coalesce(v_quantity_input,0)<>0 or v_reserved_delta<=0 or v_unit_cost_input is not null then
      raise exception 'INVENTORY_STOCK_V2_INVALID_RESERVATION';
    end if;
    v_quantity_delta:=0;
    v_unit_cost:=null;
    v_value_delta:=null;
  elsif v_movement_type='reservation_release' then
    if coalesce(v_quantity_input,0)<>0 or v_reserved_delta>=0 or v_unit_cost_input is not null then
      raise exception 'INVENTORY_STOCK_V2_INVALID_RESERVATION_RELEASE';
    end if;
    v_quantity_delta:=0;
    v_unit_cost:=null;
    v_value_delta:=null;
  elsif v_movement_type='stocktake' then
    if v_stocktake_target is null or v_stocktake_target<0
      or coalesce(v_quantity_input,0)<>0 or v_reserved_delta<>0 or v_unit_cost_input is not null then
      raise exception 'INVENTORY_STOCK_V2_INVALID_STOCKTAKE';
    end if;
    v_quantity_delta:=round(v_stocktake_target-v_balance.quantity_on_hand,3);
    if v_quantity_delta=0 then
      raise exception 'INVENTORY_STOCK_V2_NO_EFFECT';
    elsif v_quantity_delta>0 then
      raise exception 'INVENTORY_STOCK_V2_STOCKTAKE_COST_RULE_REQUIRED';
    end if;
    v_unit_cost:=v_balance.average_unit_cost;
    v_value_delta:=round(v_quantity_delta*v_unit_cost,4);
  elsif v_movement_type='reversal' then
    v_quantity_delta:=-v_original.quantity_delta;
    v_reserved_delta:=-v_original.reserved_quantity_delta;
    v_unit_cost:=v_original.unit_cost;
    v_value_delta:=case when v_original.value_delta is null then null else -v_original.value_delta end;
  end if;

  v_quantity_after:=round(v_balance.quantity_on_hand+v_quantity_delta,3);
  v_reserved_after:=round(v_balance.quantity_reserved+v_reserved_delta,3);
  if v_reserved_after<0 then
    raise exception 'INVENTORY_STOCK_V2_RESERVATION_UNDERFLOW';
  end if;
  if not v_allow_negative and v_quantity_after-v_reserved_after<0 then
    raise exception 'INVENTORY_STOCK_V2_INSUFFICIENT_AVAILABLE';
  end if;

  if v_movement_type='reversal' and v_value_delta is not null and v_quantity_after>0 then
    v_average_after:=round(
      ((v_balance.quantity_on_hand*v_balance.average_unit_cost)+v_value_delta)
      / v_quantity_after,4
    );
    if v_average_after<0 then
      raise exception 'INVENTORY_STOCK_V2_INVALID_REVERSAL_COST';
    end if;
  end if;
  -- Preserve average cost when on-hand reaches zero (and for negative stock).
  if v_quantity_after<=0 then
    v_average_after:=v_balance.average_unit_cost;
  end if;
  v_version_after:=v_balance.balance_version+1;

  insert into public.inventory_stock_movements_v2(
    client_tx_id,line_key,operation_digest,
    location_id,item_kind,item_id,movement_type,
    quantity_delta,reserved_quantity_delta,unit_cost,value_delta,
    quantity_on_hand_after,quantity_reserved_after,
    average_unit_cost_after,last_unit_cost_after,balance_version_after,
    allow_negative_stock_applied,policy_code,policy_version,
    source_document_type,source_document_id,counterparty_location_id,
    employee_id,device_id,occurred_at,reversal_of_movement_id,metadata
  ) values(
    v_client_tx_id,v_line_key,v_operation_digest,
    v_location_id,v_item_kind,v_item_id,v_movement_type,
    v_quantity_delta,v_reserved_delta,v_unit_cost,v_value_delta,
    v_quantity_after,v_reserved_after,
    v_average_after,v_last_after,v_version_after,
    v_allow_negative,v_policy_code,v_policy_version,
    v_source_document_type,v_source_document_id,v_counterparty_location_id,
    p_employee_id,nullif(trim(coalesce(p_device_id,'')),''),v_occurred_at,
    p_reversal_of_movement_id,v_metadata
  ) returning * into v_movement;

  update public.inventory_stock_balances_v2
  set quantity_on_hand=v_quantity_after,
      quantity_reserved=v_reserved_after,
      average_unit_cost=v_average_after,
      last_unit_cost=v_last_after,
      balance_version=v_version_after,
      updated_at=now()
  where location_id=v_location_id and item_kind=v_item_kind and item_id=v_item_id;

  return jsonb_build_object(
    'reused',false,
    'movement',to_jsonb(v_movement),
    'balance',jsonb_build_object(
      'location_id',v_location_id,
      'item_kind',v_item_kind,
      'item_id',v_item_id,
      'quantity_on_hand',v_quantity_after,
      'quantity_reserved',v_reserved_after,
      'quantity_available',v_quantity_after-v_reserved_after,
      'average_unit_cost',v_average_after,
      'last_unit_cost',v_last_after,
      'balance_version',v_version_after
    )
  );
end;
$function$


-- inventory_stock_declare_cutover_hooks_v2(p_plan_digest text)
CREATE OR REPLACE FUNCTION public.inventory_stock_declare_cutover_hooks_v2(p_plan_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_plan public.inventory_stock_cutover_plans_v2%rowtype;
  v_writer jsonb;
  v_barrier jsonb;
  v_kind text;
  v_roots jsonb;
  v_contract_digest text;
  v_direct integer:=0;
  v_transitive integer:=0;
  v_documents integer:=0;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('point4-stock-hooks-v2:'||p_plan_digest,0)
  );
  select * into strict v_plan
  from public.inventory_stock_cutover_plans_v2 p
  where p.plan_digest=p_plan_digest for update;
  if v_plan.source_digest<>'44d29b548400ca80870d1418968945a2ef3154cc5e8ae688dbabd3ee018567fc'
    or v_plan.auditor_candidate_plan_digest<>'d54c6e5cbd75a79e6b2fcb9ddc862b68dc1330fb8eee4f2263987f31a048196d'
    or v_plan.legacy_writer_inventory_digest<>'ef4460f8ac8631427f448be86f4316619a1ab7bc170d5888a0a656bbc10284f6'
    or jsonb_array_length(v_plan.approved_auditor_evidence->'legacy_writer_inventory')<>55
    or jsonb_array_length(v_plan.approved_auditor_evidence->'document_workflow_mutators')<>6
  then raise exception 'INVENTORY_STOCK_HOOKS_APPROVED_INVENTORY_REQUIRED'; end if;

  for v_writer in
    select value from jsonb_array_elements(
      v_plan.approved_auditor_evidence->'legacy_writer_inventory'
    ) order by value->>'signature'
  loop
    v_kind:=case when coalesce((v_writer->>'is_direct_stock_mutator')::boolean,false)
      then 'DIRECT_PHYSICAL_WRITER' else 'TRANSITIVE_STOCK_CALLER' end;
    v_roots:=coalesce(v_writer->'reaches_direct_writers','[]'::jsonb);
    if v_kind='DIRECT_PHYSICAL_WRITER' then
      v_direct:=v_direct+1;
      if not (v_roots ? (v_writer->>'signature')) then
        raise exception 'INVENTORY_STOCK_HOOKS_DIRECT_ROOT_INVALID';
      end if;
    else
      v_transitive:=v_transitive+1;
      if jsonb_array_length(v_roots)=0 then
        raise exception 'INVENTORY_STOCK_HOOKS_TRANSITIVE_ROOT_REQUIRED';
      end if;
    end if;
    v_contract_digest:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      jsonb_build_object(
        'schema_version',1,'plan_digest',p_plan_digest,
        'function_signature',v_writer->>'signature','contract_kind',v_kind,
        'original_definition_digest',v_writer->>'definition_digest',
        'direct_root_signatures',v_roots,
        'required_guard','inventory_stock_assert_legacy_write_allowed_v2'
      )::text,'UTF8'),'sha256'),'hex');
    insert into public.inventory_stock_cutover_hook_contracts_v2(
      plan_digest,function_signature,contract_kind,original_definition_digest,
      direct_root_signatures,required_guard,contract_digest
    ) values(
      p_plan_digest,v_writer->>'signature',v_kind,v_writer->>'definition_digest',
      v_roots,'inventory_stock_assert_legacy_write_allowed_v2',v_contract_digest
    ) on conflict(business_id,plan_digest,function_signature) do update set
      contract_kind=excluded.contract_kind,
      original_definition_digest=excluded.original_definition_digest,
      direct_root_signatures=excluded.direct_root_signatures,
      required_guard=excluded.required_guard,
      contract_digest=excluded.contract_digest
    where inventory_stock_cutover_hook_contracts_v2.installation_state='DECLARED_NOT_INSTALLED';
  end loop;

  for v_barrier in
    select value from jsonb_array_elements(
      v_plan.approved_auditor_evidence->'document_workflow_mutators'
    ) order by value->>'signature'
  loop
    v_documents:=v_documents+1;
    v_contract_digest:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      jsonb_build_object(
        'schema_version',1,'plan_digest',p_plan_digest,
        'function_signature',v_barrier->>'signature',
        'contract_kind','DOCUMENT_WORKFLOW_BARRIER',
        'original_definition_digest',v_barrier->>'definition_digest',
        'direct_root_signatures','[]'::jsonb,
        'required_guard','inventory_stock_assert_document_workflow_allowed_v2'
      )::text,'UTF8'),'sha256'),'hex');
    insert into public.inventory_stock_cutover_hook_contracts_v2(
      plan_digest,function_signature,contract_kind,original_definition_digest,
      direct_root_signatures,required_guard,contract_digest
    ) values(
      p_plan_digest,v_barrier->>'signature','DOCUMENT_WORKFLOW_BARRIER',
      v_barrier->>'definition_digest','[]'::jsonb,
      'inventory_stock_assert_document_workflow_allowed_v2',v_contract_digest
    ) on conflict(business_id,plan_digest,function_signature) do update set
      contract_kind=excluded.contract_kind,
      original_definition_digest=excluded.original_definition_digest,
      direct_root_signatures=excluded.direct_root_signatures,
      required_guard=excluded.required_guard,
      contract_digest=excluded.contract_digest
    where inventory_stock_cutover_hook_contracts_v2.installation_state='DECLARED_NOT_INSTALLED';
  end loop;

  if v_direct<>40 or v_transitive<>15 or v_documents<>6 then
    raise exception 'INVENTORY_STOCK_HOOKS_INVENTORY_COUNT_MISMATCH';
  end if;
  return jsonb_build_object(
    'plan_digest',p_plan_digest,'direct_physical_writers',v_direct,
    'transitive_stock_callers',v_transitive,'document_workflow_barriers',v_documents,
    'activated',false,'concurrency_closed',public.inventory_stock_point4b2_concurrency_closed_v2()
  );
end;
$function$


-- inventory_stock_mark_forward_recovery_v2(p_plan_digest text, p_reason text)
CREATE OR REPLACE FUNCTION public.inventory_stock_mark_forward_recovery_v2(p_plan_digest text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if trim(coalesce(p_reason,''))='' then
    raise exception 'INVENTORY_STOCK_CUTOVER_RECOVERY_REASON_REQUIRED';
  end if;
  update public.inventory_stock_cutover_plans_v2
  set status='FORWARD_RECOVERY_REQUIRED',recovery_reason=trim(p_reason)
  where plan_digest=p_plan_digest and status='CANONICAL_COMMITTED';
  if not found then raise exception 'INVENTORY_STOCK_CUTOVER_RECOVERY_STATE_INVALID'; end if;
  update public.inventory_stock_ownership_v2
  set ownership_state='FORWARD_RECOVERY_REQUIRED',ownership_version=ownership_version+1
  where plan_digest=p_plan_digest;
  update public.inventory_stock_cutover_boundaries_v2
  set state='FORWARD_RECOVERY_REQUIRED' where plan_digest=p_plan_digest;
  insert into public.inventory_stock_ownership_events_v2(
    ownership_id,plan_digest,candidate_digest,event_type,evidence
  ) select ownership_id,plan_digest,candidate_digest,'FORWARD_RECOVERY_REQUIRED',
    jsonb_build_object('reason',trim(p_reason))
  from public.inventory_stock_ownership_v2 where plan_digest=p_plan_digest
  on conflict(business_id,ownership_id,event_type) do nothing;
end;
$function$


-- inventory_supply_request_receive_v1(p_request_id bigint, p_items jsonb, p_final boolean, p_note text, p_client_tx_id text)
CREATE OR REPLACE FUNCTION public.inventory_supply_request_receive_v1(p_request_id bigint, p_items jsonb, p_final boolean, p_note text, p_client_tx_id text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_q public.inventory_supply_requests%rowtype;
  v_emp bigint;
  v_receipt_id bigint;
  v_req record;
  v_i public.inventory_supply_request_items%rowtype;
  v_good numeric(14,3);v_damaged numeric(14,3);v_short numeric(14,3);v_total numeric(14,3);v_remaining numeric(14,3);
  v_old_qty numeric(14,3);v_old_cost numeric(14,4);v_new_qty numeric(14,3);v_new_cost numeric(14,4);
  v_count integer:=0;
  v_frozen_items jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'غير مصرح';end if;
  if not public.has_action_permission_v2('inventory.supply.request.receive') then raise exception 'ليس لديك صلاحية استلام طلبات التوريد';end if;
  if trim(coalesce(p_client_tx_id,''))='' then raise exception 'معرف العملية مطلوب';end if;
  perform pg_advisory_xact_lock(hashtextextended('inventory-supply-receive:'||p_client_tx_id,0));
  select r.request_id into v_receipt_id from public.inventory_supply_receipts r where r.client_tx_id=p_client_tx_id;
  if v_receipt_id is not null then return v_receipt_id;end if;
  select * into v_q from public.inventory_supply_requests where id=p_request_id for update;
  if not found then raise exception 'طلب التوريد غير موجود';end if;
  if not public.has_branch_access(v_q.destination_branch_id) then raise exception 'ليس لديك صلاحية الفرع المستلم';end if;
  if v_q.status='received' then return v_q.id;end if;
  if v_q.status not in ('in_transit','partially_received') then raise exception 'الطلب غير قابل للاستلام في حالته الحالية';end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'حدد بنود الاستلام';end if;
  v_emp:=public.current_employee_id();

  -- Point4 FT-1: validate and freeze every receipt line and its destination stock identity before the receipt header.
  select coalesce(jsonb_agg(jsonb_build_object(
    'request_item_id',z.id,'item_type',z.item_type,'product_id',z.product_id,'ingredient_id',z.ingredient_id,
    'good',z.good,'damaged',z.damaged,'shortage',z.shortage,'unit_cost',z.unit_cost,'notes',z.notes
  ) order by z.item_type,coalesce(z.product_id,z.ingredient_id),z.id),'[]'::jsonb)
  into v_frozen_items
  from (
    select i.id,i.item_type,i.product_id,i.ingredient_id,i.unit_cost,
      round(greatest(coalesce(x.quantity_received,0),0),3) good,
      round(greatest(coalesce(x.quantity_damaged,0),0),3) damaged,
      round(greatest(coalesce(x.quantity_shortage,0),0),3) shortage,x.notes,
      round(i.quantity_dispatched-i.quantity_received-i.quantity_damaged-i.quantity_shortage,3) remaining
    from jsonb_to_recordset(p_items) as x(item_id bigint,quantity_received numeric,quantity_damaged numeric,quantity_shortage numeric,notes text)
    join public.inventory_supply_request_items i on i.id=x.item_id and i.request_id=v_q.id
  ) z
  where z.good+z.damaged+z.shortage>0
    and z.good+z.damaged+z.shortage<=z.remaining;

  if jsonb_array_length(v_frozen_items)=0 then raise exception 'لم يتم إدخال أي كمية استلام';end if;
  if exists(
    select 1 from jsonb_to_recordset(p_items) as x(item_id bigint,quantity_received numeric,quantity_damaged numeric,quantity_shortage numeric,notes text)
    left join public.inventory_supply_request_items i on i.id=x.item_id and i.request_id=v_q.id
    where i.id is null or round(greatest(coalesce(x.quantity_received,0),0)+greatest(coalesce(x.quantity_damaged,0),0)+greatest(coalesce(x.quantity_shortage,0),0),3)
      > round(i.quantity_dispatched-i.quantity_received-i.quantity_damaged-i.quantity_shortage,3)
  ) then raise exception 'بيانات الاستلام غير صحيحة أو أكبر من المتبقي';end if;

  for v_req in select * from jsonb_to_recordset(v_frozen_items) as x(request_item_id bigint,item_type text,product_id bigint,ingredient_id bigint,good numeric,damaged numeric,shortage numeric,unit_cost numeric,notes text)
               where good>0 order by item_type,coalesce(product_id,ingredient_id),request_item_id
  loop
    perform public.inventory_stock_assert_legacy_write_allowed_v2(
      v_q.destination_branch_id,v_req.item_type,case when v_req.item_type='product' then v_req.product_id else v_req.ingredient_id end);
  end loop;

  insert into public.inventory_supply_receipts(request_id,client_tx_id,is_final,notes,received_by_employee_id)
  values(v_q.id,p_client_tx_id,coalesce(p_final,false),nullif(trim(coalesce(p_note,'')),''),v_emp)
  returning id into v_receipt_id;

  for v_req in select * from jsonb_to_recordset(v_frozen_items) as x(request_item_id bigint,item_type text,product_id bigint,ingredient_id bigint,good numeric,damaged numeric,shortage numeric,unit_cost numeric,notes text)
  loop
    select * into v_i from public.inventory_supply_request_items where id=v_req.request_item_id and request_id=v_q.id for update;
    v_good:=v_req.good;v_damaged:=v_req.damaged;v_short:=v_req.shortage;v_total:=v_good+v_damaged+v_short;

    insert into public.inventory_supply_receipt_items(receipt_id,request_item_id,quantity_received,quantity_damaged,quantity_shortage,notes)
    values(v_receipt_id,v_i.id,v_good,v_damaged,v_short,nullif(trim(coalesce(v_req.notes,'')),''));

    if v_good>0 and v_i.item_type='product' then
      insert into public.retail_inventory_balances(branch_id,product_id,quantity,average_unit_cost,last_purchase_cost,track_inventory)
      values(v_q.destination_branch_id,v_i.product_id,0,v_i.unit_cost,v_i.unit_cost,true)
      on conflict(business_id,branch_id,product_id) do nothing;
      select quantity,average_unit_cost into v_old_qty,v_old_cost
      from public.retail_inventory_balances
      where branch_id=v_q.destination_branch_id and product_id=v_i.product_id for update;
      v_new_qty:=round(v_old_qty+v_good,3);
      v_new_cost:=case when v_new_qty>0 then round(((v_old_qty*v_old_cost)+(v_good*v_i.unit_cost))/v_new_qty,4) else v_i.unit_cost end;
      update public.retail_inventory_balances set quantity=v_new_qty,average_unit_cost=v_new_cost,last_purchase_cost=v_i.unit_cost,updated_at=now()
       where branch_id=v_q.destination_branch_id and product_id=v_i.product_id;
      insert into public.retail_inventory_movements(branch_id,product_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,notes,employee_id)
      values(v_q.destination_branch_id,v_i.product_id,'transfer_in',v_good,v_new_qty,v_i.unit_cost,'supply_request',v_q.id::text,p_client_tx_id||':in:'||v_i.id,'استلام توريد داخلي من المخزن',v_emp);
    elsif v_good>0 and v_i.item_type='ingredient' then
      insert into public.ingredient_stock(branch_id,ingredient_id,quantity,average_unit_cost,last_purchase_cost,last_costed_at)
      values(v_q.destination_branch_id,v_i.ingredient_id,0,v_i.unit_cost,v_i.unit_cost,now())
      on conflict(business_id,branch_id,ingredient_id) do nothing;
      select quantity,average_unit_cost into v_old_qty,v_old_cost
      from public.ingredient_stock where branch_id=v_q.destination_branch_id and ingredient_id=v_i.ingredient_id for update;
      v_new_qty:=round(v_old_qty+v_good,3);
      v_new_cost:=case when v_new_qty>0 then round(((v_old_qty*v_old_cost)+(v_good*v_i.unit_cost))/v_new_qty,4) else v_i.unit_cost end;
      update public.ingredient_stock set quantity=v_new_qty,average_unit_cost=v_new_cost,last_purchase_cost=v_i.unit_cost,last_costed_at=now(),updated_at=now()
       where branch_id=v_q.destination_branch_id and ingredient_id=v_i.ingredient_id;
      insert into public.food_ingredient_adjustment_events(branch_id,ingredient_id,quantity_delta,balance_after,unit_cost,reason,client_tx_id,employee_id)
      values(v_q.destination_branch_id,v_i.ingredient_id,v_good,v_new_qty,v_i.unit_cost,'supply_transfer_in',p_client_tx_id||':in:'||v_i.id,v_emp);
    end if;

    update public.inventory_supply_request_items
       set quantity_received=quantity_received+v_good,
           quantity_damaged=quantity_damaged+v_damaged,
           quantity_shortage=quantity_shortage+v_short
     where id=v_i.id;
    v_count:=v_count+1;
  end loop;

  if v_count=0 then raise exception 'لم يتم إدخال أي كمية استلام';end if;
  if coalesce(p_final,false) and exists(
    select 1 from public.inventory_supply_request_items i
    where i.request_id=v_q.id and round(i.quantity_dispatched-i.quantity_received-i.quantity_damaged-i.quantity_shortage,3)<>0
  ) then raise exception 'لا يمكن إنهاء الاستلام قبل تسوية كل الكميات المرسلة';end if;

  update public.inventory_supply_requests
     set status=case when coalesce(p_final,false) then 'received' else 'partially_received' end,
         received_by_employee_id=case when coalesce(p_final,false) then v_emp else received_by_employee_id end,
         received_at=case when coalesce(p_final,false) then now() else received_at end,
         updated_at=now()
   where id=v_q.id;
  insert into public.inventory_supply_request_events(request_id,from_status,to_status,note,employee_id,details)
  values(v_q.id,v_q.status,case when coalesce(p_final,false) then 'received' else 'partially_received' end,nullif(trim(coalesce(p_note,'')),''),v_emp,
    jsonb_build_object('receipt_id',v_receipt_id,'receipt_tx_id',p_client_tx_id,'final',coalesce(p_final,false),'lines',v_count));
  insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
  values(v_emp,v_q.destination_branch_id,'inventory.supply.request.receive','inventory_supply_request',v_q.id,
    jsonb_build_object('receipt_id',v_receipt_id,'final',coalesce(p_final,false),'lines',v_count));
  return v_q.id;
end$function$


-- inventory_supply_route_upsert_v1(p_route_id bigint, p_source_location_id bigint, p_destination_branch_id bigint, p_cutoff_time time without time zone, p_lead_time_days integer, p_allow_emergency boolean, p_notes text, p_active boolean)
CREATE OR REPLACE FUNCTION public.inventory_supply_route_upsert_v1(p_route_id bigint, p_source_location_id bigint, p_destination_branch_id bigint, p_cutoff_time time without time zone, p_lead_time_days integer, p_allow_emergency boolean, p_notes text, p_active boolean)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
   on conflict(business_id,source_location_id,destination_branch_id) do update set cutoff_time=excluded.cutoff_time,lead_time_days=excluded.lead_time_days,allow_emergency=excluded.allow_emergency,notes=excluded.notes,active=excluded.active,updated_at=now()
   returning id into v_id;
 else
   update public.inventory_supply_routes set source_location_id=p_source_location_id,destination_branch_id=p_destination_branch_id,cutoff_time=p_cutoff_time,lead_time_days=greatest(coalesce(p_lead_time_days,0),0),allow_emergency=coalesce(p_allow_emergency,true),notes=nullif(trim(coalesce(p_notes,'')),''),active=coalesce(p_active,true),updated_at=now() where id=p_route_id returning id into v_id;
   if v_id is null then raise exception 'مسار التوريد غير موجود';end if;
 end if;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(v_emp,p_destination_branch_id,'inventory.supply.route.upsert','inventory_supply_route',v_id,jsonb_build_object('source_location_id',p_source_location_id,'destination_branch_id',p_destination_branch_id,'active',coalesce(p_active,true)));
 return v_id;
end$function$


-- logistics_return_create_v1(p_shipment_id bigint, p_reason text, p_return_fee numeric)
CREATE OR REPLACE FUNCTION public.logistics_return_create_v1(p_shipment_id bigint, p_reason text, p_return_fee numeric)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$declare s public.logistics_shipments_v1%rowtype;idv bigint;begin if auth.uid() is null then raise exception 'غير مصرح';end if;select * into s from public.logistics_shipments_v1 where id=p_shipment_id for update;if not found or not public.has_branch_access(s.branch_id) then raise exception 'الشحنة غير موجودة أو غير مصرح';end if;insert into public.logistics_returns_v1(shipment_id,reason,return_fee) values(s.id,nullif(trim(coalesce(p_reason,'')),''),greatest(coalesce(p_return_fee,0),0)) on conflict(business_id,shipment_id) do update set reason=excluded.reason,return_fee=excluded.return_fee returning id into idv;update public.logistics_shipments_v1 set status='returning',updated_at=now() where id=s.id;return idv;end;$function$


-- membership_member_create_v1(p_customer_id bigint, p_notes text)
CREATE OR REPLACE FUNCTION public.membership_member_create_v1(p_customer_id bigint, p_notes text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$declare idv bigint;begin if auth.uid() is null then raise exception 'غير مصرح';end if;insert into public.membership_members_v1(customer_id,notes) values(p_customer_id,nullif(trim(coalesce(p_notes,'')),'')) on conflict(business_id,customer_id) do update set updated_at=now() returning id into idv;update public.membership_members_v1 set member_code=coalesce(member_code,'MEM-'||lpad(idv::text,6,'0')) where id=idv;return idv;end;$function$


-- pharmacy_receive_batch(p_branch_id bigint, p_product_id bigint, p_batch_no text, p_expiry_date date, p_quantity numeric, p_cost numeric, p_sale_price numeric, p_supplier_id bigint, p_notes text)
CREATE OR REPLACE FUNCTION public.pharmacy_receive_batch(p_branch_id bigint, p_product_id bigint, p_batch_no text, p_expiry_date date, p_quantity numeric, p_cost numeric, p_sale_price numeric DEFAULT NULL::numeric, p_supplier_id bigint DEFAULT NULL::bigint, p_notes text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_id bigint; v_qty numeric; v_emp bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية على هذا الفرع'; end if;
 if not (public.is_admin() or public.has_permission('inventory') or public.has_permission('purchasing')) then raise exception 'ليس لديك صلاحية استلام باتش'; end if;
 if coalesce(p_quantity,0)<=0 then raise exception 'الكمية يجب أن تكون أكبر من صفر'; end if;
 if p_expiry_date is null then raise exception 'تاريخ الصلاحية مطلوب'; end if;
 if nullif(trim(coalesce(p_batch_no,'')),'') is null then raise exception 'رقم الباتش مطلوب'; end if;
 v_emp:=public.current_employee_id();
 insert into public.pharmacy_batches(branch_id,product_id,supplier_id,batch_no,expiry_date,quantity,cost,sale_price,updated_at)
 values(p_branch_id,p_product_id,p_supplier_id,trim(p_batch_no),p_expiry_date,p_quantity,coalesce(p_cost,0),p_sale_price,now())
 on conflict(business_id,branch_id,product_id,batch_no,expiry_date) do update set quantity=public.pharmacy_batches.quantity+excluded.quantity,cost=excluded.cost,sale_price=coalesce(excluded.sale_price,public.pharmacy_batches.sale_price),supplier_id=coalesce(excluded.supplier_id,public.pharmacy_batches.supplier_id),active=true,updated_at=now()
 returning id,quantity into v_id,v_qty;
 insert into public.pharmacy_batch_movements(branch_id,product_id,batch_id,movement_type,quantity_delta,balance_after,reference_type,employee_id,notes)
 values(p_branch_id,p_product_id,v_id,'receive',p_quantity,v_qty,'manual_receive',v_emp,p_notes);
 return v_id;
end $function$


-- pharmacy_save_substitute(p_product_id bigint, p_substitute_product_id bigint, p_notes text, p_active boolean)
CREATE OR REPLACE FUNCTION public.pharmacy_save_substitute(p_product_id bigint, p_substitute_product_id bigint, p_notes text, p_active boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not (public.is_admin() or public.has_permission('products') or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية البدائل'; end if;
 if p_product_id=p_substitute_product_id then raise exception 'لا يمكن أن يكون الدواء بديلًا لنفسه'; end if;
 insert into public.pharmacy_substitutes(product_id,substitute_product_id,notes,active)
 values(p_product_id,p_substitute_product_id,p_notes,coalesce(p_active,true))
 on conflict(business_id,product_id,substitute_product_id) do update set notes=excluded.notes,active=excluded.active;
 return true;
end $function$


-- pharmacy_upsert_product_details(p_product_id bigint, p_data jsonb)
CREATE OR REPLACE FUNCTION public.pharmacy_upsert_product_details(p_product_id bigint, p_data jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('products') or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية بيانات الدواء'; end if;
  insert into public.pharmacy_product_details(product_id,scientific_name,active_ingredient,dosage_form,strength,manufacturer,registration_no,prescription_required,controlled_drug,track_batch,storage_notes,temperature_min,temperature_max,pack_size,unit_name,reorder_level,updated_at)
  values(p_product_id,nullif(trim(p_data->>'scientific_name'),''),nullif(trim(p_data->>'active_ingredient'),''),nullif(trim(p_data->>'dosage_form'),''),nullif(trim(p_data->>'strength'),''),nullif(trim(p_data->>'manufacturer'),''),nullif(trim(p_data->>'registration_no'),''),coalesce((p_data->>'prescription_required')::boolean,false),coalesce((p_data->>'controlled_drug')::boolean,false),coalesce((p_data->>'track_batch')::boolean,true),nullif(trim(p_data->>'storage_notes'),''),nullif(p_data->>'temperature_min','')::numeric,nullif(p_data->>'temperature_max','')::numeric,coalesce(nullif(p_data->>'pack_size','')::numeric,1),coalesce(nullif(trim(p_data->>'unit_name'),''),'وحدة'),coalesce(nullif(p_data->>'reorder_level','')::numeric,0),now())
  on conflict(business_id,product_id) do update set scientific_name=excluded.scientific_name,active_ingredient=excluded.active_ingredient,dosage_form=excluded.dosage_form,strength=excluded.strength,manufacturer=excluded.manufacturer,registration_no=excluded.registration_no,prescription_required=excluded.prescription_required,controlled_drug=excluded.controlled_drug,track_batch=excluded.track_batch,storage_notes=excluded.storage_notes,temperature_min=excluded.temperature_min,temperature_max=excluded.temperature_max,pack_size=excluded.pack_size,unit_name=excluded.unit_name,reorder_level=excluded.reorder_level,updated_at=now();
  return p_product_id;
end $function$


-- restaurant_table_session_attach_order_v1(p_session_id bigint, p_order_id bigint)
CREATE OR REPLACE FUNCTION public.restaurant_table_session_attach_order_v1(p_session_id bigint, p_order_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_s public.restaurant_table_sessions%rowtype;v_order record;v_emp bigint;begin if auth.uid() is null then raise exception 'غير مصرح';end if;if not public.has_action_permission_v2('restaurant.tables.use') then raise exception 'ليس لديك صلاحية ربط الطلب بالترابيزة';end if;select * into v_s from public.restaurant_table_sessions where id=p_session_id for update;if not found or v_s.status<>'open' then raise exception 'جلسة الترابيزة غير مفتوحة';end if;if not public.has_branch_access(v_s.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع';end if;select id,branch_id,order_type into v_order from public.orders where id=p_order_id;if not found then raise exception 'الطلب غير موجود';end if;if v_order.branch_id<>v_s.branch_id or v_order.order_type<>'dinein' then raise exception 'يمكن ربط طلب صالة من نفس الفرع فقط';end if;v_emp:=public.current_employee_id();insert into public.restaurant_table_session_orders(session_id,order_id,attached_by_employee_id) values(v_s.id,p_order_id,v_emp) on conflict(business_id,order_id) do nothing;if not exists(select 1 from public.restaurant_table_session_orders where session_id=v_s.id and order_id=p_order_id) then raise exception 'الطلب مرتبط بجلسة أخرى';end if;insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details) values(v_emp,v_s.branch_id,'restaurant.tables.use','restaurant_table_session',v_s.id,jsonb_build_object('order_id',p_order_id,'event','attach_order'));return v_s.id;end;$function$


-- retail_create_website_order_identity_v1(p_identity_envelope jsonb)
CREATE OR REPLACE FUNCTION public.retail_create_website_order_identity_v1(p_identity_envelope jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_client_tx_id text;
  v_document_uid text;
  v_source_document_id text;
  v_branch_id bigint;
  v_customer_name text;
  v_customer_phone text;
  v_customer_address text;
  v_customer_notes text;
  v_order_type text;
  v_delivery_zone_id bigint;
  v_payment_method_code text;
  v_payment_reference text;
  v_lines jsonb;

  v_intent jsonb;
  v_digest text;
  v_existing_document public.retail_reservation_documents_identity_v1%rowtype;
  v_order public.retail_website_orders%rowtype;
  v_document public.retail_reservation_documents_identity_v1%rowtype;

  v_line jsonb;
  v_line_uid text;
  v_product_id bigint;
  v_qty numeric(14,3);
  v_notes text;
  v_effect_line_key text;
  v_line_digest text;

  v_row record;
  v_product public.products%rowtype;
  v_ps public.retail_product_settings%rowtype;
  v_balance public.retail_inventory_balances%rowtype;
  v_bp public.branch_products%rowtype;
  v_price numeric(14,4);
  v_line_total numeric(14,2);
  v_offer numeric(14,2);
  v_available numeric(14,3);
  v_reserved numeric(14,3);
  v_subtotal numeric(14,2):=0;
  v_discount numeric(14,2):=0;
  v_delivery numeric(14,2):=0;
  v_total numeric(14,2):=0;
  v_expiry timestamptz:=now()+interval '15 minutes';
  v_legacy_idempotency_key text;
  v_legacy_reservation_key text;
  v_legacy_items jsonb:='[]'::jsonb;
begin
  if jsonb_typeof(p_identity_envelope) is distinct from 'object' then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_REQUEST_OBJECT_REQUIRED';
  end if;

  perform public.point4_identity_assert_allowed_keys_v1(
    p_identity_envelope,
    array[
      'client_tx_id','document_uid','source_document_id','branch_id',
      'customer_name','customer_phone','customer_address','customer_notes',
      'order_type','delivery_zone_id','payment_method_code',
      'payment_reference','lines'
    ]
  );

  v_client_tx_id:=public.point4_identity_uuid_v4_v1(p_identity_envelope->>'client_tx_id');
  v_document_uid:=public.point4_identity_uuid_v4_v1(p_identity_envelope->>'document_uid');
  v_source_document_id:=public.point4_identity_source_document_id_v1(
    'stock_reservation',
    'uuid:'||v_document_uid,
    true
  );

  if p_identity_envelope->>'source_document_id' is distinct from v_source_document_id then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_SOURCE_DOCUMENT_MISMATCH';
  end if;

  v_branch_id:=public.point4_identity_bigint_v1(p_identity_envelope->'branch_id',false);
  v_customer_name:=nullif(trim(coalesce(p_identity_envelope->>'customer_name','')),'');
  v_customer_phone:=public.retail_website_normalize_phone(p_identity_envelope->>'customer_phone');
  v_customer_address:=nullif(trim(coalesce(p_identity_envelope->>'customer_address','')),'');
  v_customer_notes:=nullif(trim(coalesce(p_identity_envelope->>'customer_notes','')),'');
  v_order_type:=lower(coalesce(nullif(trim(p_identity_envelope->>'order_type'),''),'pickup'));

  if p_identity_envelope ? 'delivery_zone_id' and p_identity_envelope->'delivery_zone_id' <> 'null'::jsonb then
    v_delivery_zone_id:=public.point4_identity_bigint_v1(
      p_identity_envelope->'delivery_zone_id',
      false
    );
  end if;

  v_payment_method_code:=lower(
    coalesce(nullif(trim(p_identity_envelope->>'payment_method_code'),''),'cash')
  );
  v_payment_reference:=nullif(trim(coalesce(p_identity_envelope->>'payment_reference','')),'');
  v_lines:=p_identity_envelope->'lines';

  if v_customer_name is null then
    raise exception 'اسم العميل مطلوب';
  end if;

  if v_customer_phone is null
     or length(v_customer_phone)<10
     or length(v_customer_phone)>15 then
    raise exception 'رقم الهاتف غير صالح';
  end if;

  if v_order_type not in ('pickup','delivery') then
    raise exception 'نوع الطلب غير صالح';
  end if;

  if jsonb_typeof(v_lines) is distinct from 'array'
     or jsonb_array_length(v_lines)=0 then
    raise exception 'السلة فارغة';
  end if;

  if jsonb_array_length(v_lines)>100 then
    raise exception 'عدد الأصناف أكبر من الحد المسموح';
  end if;

  -- Validate every submitted Identity line before any durable write.
  -- Duplicate product_id values are intentionally allowed; duplicate line_uid is not.
  for v_line in
    select value
    from jsonb_array_elements(v_lines)
  loop
    if jsonb_typeof(v_line) is distinct from 'object' then
      raise exception 'RETAIL_RESERVATION_IDENTITY_V1_LINE_OBJECT_REQUIRED';
    end if;

    perform public.point4_identity_assert_allowed_keys_v1(
      v_line,
      array['line_uid','product_id','quantity','notes']
    );

    v_line_uid:=public.point4_identity_uuid_v4_v1(v_line->>'line_uid');
    v_product_id:=public.point4_identity_bigint_v1(v_line->'product_id',false);

    if not (v_line ? 'quantity') or v_line->'quantity'='null'::jsonb then
      raise exception 'RETAIL_RESERVATION_IDENTITY_V1_QUANTITY_REQUIRED';
    end if;

    begin
      v_qty:=(public.point4_identity_decimal_v1(
        (v_line->>'quantity')::numeric,
        3
      ))::numeric(14,3);
    exception
      when others then
        raise exception 'RETAIL_RESERVATION_IDENTITY_V1_QUANTITY_INVALID';
    end;

    if v_qty<=0 then
      raise exception 'كمية صنف غير صحيحة';
    end if;

    v_notes:=nullif(trim(coalesce(v_line->>'notes','')),'');
    v_effect_line_key:=public.point4_identity_effect_line_key_v1(
      'stock',
      'reservation',
      v_line_uid
    );

    if exists(
      select 1
      from jsonb_array_elements(v_lines) other_line
      where other_line<>v_line
        and lower(trim(coalesce(other_line->>'line_uid','')))=v_line_uid
    ) then
      raise exception 'RETAIL_RESERVATION_IDENTITY_V1_DUPLICATE_LINE_UID';
    end if;
  end loop;

  -- Canonical intent contains only client-authoritative accepted fields.
  -- Server-derived prices, costs, offers, totals, expiry and timestamps are excluded.
  v_intent:=jsonb_build_object(
    'customer_name',v_customer_name,
    'customer_phone',v_customer_phone,
    'customer_address',v_customer_address,
    'customer_notes',v_customer_notes,
    'order_type',v_order_type,
    'delivery_zone_id',v_delivery_zone_id,
    'payment_method_code',v_payment_method_code,
    'payment_reference',v_payment_reference
  );

  v_digest:=public.retail_reservation_identity_digest_v1(
    'create',
    v_client_tx_id,
    v_document_uid,
    v_branch_id,
    v_intent,
    v_lines
  );

  if v_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_DIGEST_INVALID';
  end if;

  -- Global creation TX namespace first, then document namespace.
  perform pg_advisory_xact_lock(
    hashtextextended('point4-reservation-client-tx:'||v_client_tx_id,0)
  );

  if exists(
    select 1
    from public.retail_reservation_mutations_identity_v1 m
    where m.client_tx_id=v_client_tx_id::uuid
  ) then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_IDEMPOTENCY_CONFLICT';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('point4-reservation-document:'||v_document_uid,0)
  );

  select *
    into v_existing_document
    from public.retail_reservation_documents_identity_v1
   where creation_client_tx_id=v_client_tx_id::uuid
      or document_uid=v_document_uid::uuid
   order by
     case when creation_client_tx_id=v_client_tx_id::uuid then 0 else 1 end,
     id
   limit 1;

  if found then
    if v_existing_document.creation_client_tx_id<>v_client_tx_id::uuid
       or v_existing_document.document_uid<>v_document_uid::uuid
       or v_existing_document.source_document_id<>v_source_document_id
       or v_existing_document.creation_operation_digest<>v_digest then
      raise exception 'RETAIL_RESERVATION_IDENTITY_V1_IDEMPOTENCY_CONFLICT';
    end if;

    select *
      into v_order
      from public.retail_website_orders
     where id=v_existing_document.retail_website_order_id;

    if not found then
      raise exception 'RETAIL_RESERVATION_IDENTITY_V1_LEGACY_PROJECTION_MISSING';
    end if;

    return jsonb_build_object(
      'ok',true,
      'id',v_order.id,
      'order_code',v_order.public_order_code,
      'status',v_order.status,
      'subtotal',v_order.subtotal,
      'offer_discount',v_order.offer_discount,
      'delivery_fee',v_order.delivery_fee,
      'total',v_order.total,
      'reservation_expires_at',v_order.reservation_expires_at,
      'document_uid',v_document_uid,
      'source_document_id',v_source_document_id,
      'client_tx_id',v_client_tx_id,
      'operation_digest',v_digest,
      'idempotent',true
    );
  end if;

  -- Legacy-compatible business validation remains before durable writes.
  if not public.retail_website_branch_open(v_branch_id) then
    raise exception 'الفرع غير متاح لاستقبال الطلبات الآن';
  end if;

  if (
    select count(*)
    from public.retail_website_orders w
    where w.branch_id=v_branch_id
      and w.customer_phone=v_customer_phone
      and w.status='pending'
      and w.reservation_expires_at>now()
      and w.created_at>now()-interval '10 minutes'
  ) >= 3 then
    raise exception 'يوجد عدة طلبات معلقة لهذا الرقم. حاول بعد قليل';
  end if;

  if exists(select 1 from public.payment_methods) then
    if not exists(
      select 1
      from public.payment_methods pm
      join public.branch_payment_methods bpm
        on bpm.payment_method_id=pm.id
      where pm.code=v_payment_method_code
        and pm.active=true
        and bpm.branch_id=v_branch_id
        and bpm.active=true
        and coalesce(bpm.website_enabled,false)=true
    ) then
      raise exception 'طريقة الدفع غير متاحة على الموقع لهذا الفرع';
    end if;
  end if;

  if v_order_type='delivery' then
    if v_delivery_zone_id is null then
      raise exception 'منطقة التوصيل مطلوبة';
    end if;

    select round(greatest(coalesce(z.delivery_fee,0),0),2)
      into v_delivery
      from public.delivery_zones z
     where z.id=v_delivery_zone_id
       and z.branch_id=v_branch_id
       and z.active=true;

    if not found then
      raise exception 'منطقة التوصيل غير متاحة لهذا الفرع';
    end if;

    if v_customer_address is null then
      raise exception 'عنوان التوصيل مطلوب';
    end if;
  end if;


  -- Phase 4: validate aggregate products and lock existing inventory balances
  -- in deterministic product order. This phase is intentionally DML-free.
  for v_row in
    select
      (x->>'product_id')::bigint as product_id,
      round(sum((x->>'quantity')::numeric),3)::numeric(14,3) as quantity,
      max(nullif(trim(coalesce(x->>'notes','')),'')) as notes
    from jsonb_array_elements(v_lines) x
    group by (x->>'product_id')::bigint
    order by (x->>'product_id')::bigint
  loop
    v_qty:=v_row.quantity;
    if v_qty<=0 then
      raise exception 'كمية صنف غير صحيحة';
    end if;

    select *
      into v_product
      from public.products
     where id=v_row.product_id
       and active=true;

    if not found then
      raise exception 'أحد الأصناف غير متاح';
    end if;

    select *
      into v_ps
      from public.retail_product_settings
     where product_id=v_product.id;

    if not found then
      v_ps.product_id:=v_product.id;
      v_ps.unit_type:='piece';
      v_ps.allow_decimal:=false;
      v_ps.qty_step:=1;
      v_ps.min_qty:=1;
      v_ps.online_enabled:=true;
    end if;

    if coalesce(v_ps.online_enabled,true) is not true then
      raise exception 'الصنف % غير متاح أونلاين',v_product.name;
    end if;

    if v_qty<coalesce(v_ps.min_qty,1) then
      raise exception 'الكمية أقل من الحد الأدنى للصنف %',v_product.name;
    end if;

    if not coalesce(v_ps.allow_decimal,false) and v_qty<>trunc(v_qty) then
      raise exception 'الصنف % لا يسمح بكمية عشرية',v_product.name;
    end if;

    if abs(
      (v_qty/coalesce(v_ps.qty_step,1))
      - round(v_qty/coalesce(v_ps.qty_step,1))
    )>0.0001 then
      raise exception 'كمية الصنف % لا تطابق خطوة البيع',v_product.name;
    end if;

    select *
      into v_bp
      from public.branch_products
     where branch_id=v_branch_id
       and product_id=v_product.id;

    if found and v_bp.active is false then
      raise exception 'الصنف % غير متاح في هذا الفرع',v_product.name;
    end if;

    if found
       and v_bp.website_paused_until is not null
       and v_bp.website_paused_until>now() then
      raise exception 'الصنف % موقوف مؤقتًا على الموقع',v_product.name;
    end if;

    v_price:=coalesce(v_bp.price_override,v_product.price,0);
    if v_price<0 then
      raise exception 'سعر الصنف غير صالح';
    end if;

    select *
      into v_balance
      from public.retail_inventory_balances
     where branch_id=v_branch_id
       and product_id=v_product.id
     for update;

    if not found then
      -- Legacy would create a tracked zero balance here. Identity V1 cannot
      -- perform that DML before website-order + sidecar atomic durability,
      -- so the equivalent positive-quantity outcome is insufficient stock.
      raise exception 'المخزون غير كافٍ للصنف % — المتاح %',v_product.name,0;
    end if;

    select coalesce(sum(r.quantity),0)
      into v_reserved
      from public.retail_stock_reservations r
     where r.branch_id=v_branch_id
       and r.product_id=v_product.id
       and r.status='active'
       and r.expires_at>now();

    v_available:=round(coalesce(v_balance.quantity,0)-v_reserved,3);

    if coalesce(v_balance.track_inventory,true) and v_available<v_qty then
      raise exception 'المخزون غير كافٍ للصنف % — المتاح %',
        v_product.name,v_available;
    end if;
  end loop;

  -- Phase 5: Legacy submission keys are projection-only implementation details.
  -- They are deterministic for this already-resolved canonical create command,
  -- but are not Reservation Identity V1 document, line, or TX identities.
  v_legacy_idempotency_key:='identity-v1-idem:'||v_digest;
  v_legacy_reservation_key:='identity-v1-res:'||v_digest;

  -- Build the deterministic Legacy aggregate projection while the locked
  -- inventory/product state is still current. This remains DML-free.
  v_legacy_items:='[]'::jsonb;
  v_subtotal:=0;
  v_discount:=0;

  for v_row in
    select
      (x->>'product_id')::bigint as product_id,
      round(sum((x->>'quantity')::numeric),3)::numeric(14,3) as quantity,
      max(nullif(trim(coalesce(x->>'notes','')),'')) as notes
    from jsonb_array_elements(v_lines) x
    group by (x->>'product_id')::bigint
    order by (x->>'product_id')::bigint
  loop
    select *
      into v_product
      from public.products
     where id=v_row.product_id
       and active=true;

    if not found then
      raise exception 'الصنف غير موجود أو غير فعال';
    end if;

    select *
      into v_ps
      from public.retail_product_settings
     where product_id=v_product.id;

    if not found then
      v_ps.product_id:=v_product.id;
      v_ps.unit_type:='piece';
      v_ps.allow_decimal:=false;
      v_ps.qty_step:=1;
      v_ps.min_qty:=1;
      v_ps.online_enabled:=true;
    end if;

    select *
      into v_bp
      from public.branch_products
     where branch_id=v_branch_id
       and product_id=v_product.id;

    v_qty:=v_row.quantity;
    v_price:=coalesce(v_bp.price_override,v_product.price,0);
    v_line_total:=round(v_price*v_qty,2);
    v_offer:=public.retail_website_offer_discount(
      v_branch_id,v_product.id,v_qty,v_price
    );

    v_subtotal:=v_subtotal+v_line_total;
    v_discount:=v_discount+least(v_line_total,v_offer);

    v_legacy_items:=v_legacy_items||jsonb_build_array(jsonb_build_object(
      'product_id',v_product.id,
      'product_name',v_product.name,
      'unit_type',coalesce(v_ps.unit_type,'piece'),
      'quantity',v_qty,
      'unit_price',v_price,
      'unit_cost_snapshot',coalesce(v_product.cost,0),
      'line_subtotal',v_line_total,
      'offer_discount',least(v_line_total,v_offer),
      'line_total',round(greatest(0,v_line_total-least(v_line_total,v_offer)),2),
      'notes',v_row.notes
    ));
  end loop;

  if jsonb_array_length(v_legacy_items)=0 then
    raise exception 'السلة لا تحتوي أصنافًا صالحة';
  end if;

  v_discount:=round(least(v_subtotal,greatest(0,v_discount)),2);
  v_total:=round(greatest(0,v_subtotal-v_discount+v_delivery),2);
  v_expiry:=now()+interval '15 minutes';
  -- Step 5A: create the Legacy website-order projection.
  insert into public.retail_website_orders(
    branch_id,idempotency_key,reservation_key,
    customer_name,customer_phone,
    customer_address,customer_notes,
    order_type,delivery_zone_id,
    payment_method_code,payment_status,payment_reference,
    subtotal,offer_discount,delivery_fee,total,
    status,reservation_expires_at
  ) values(
    v_branch_id,v_legacy_idempotency_key,v_legacy_reservation_key,
    v_customer_name,v_customer_phone,
    v_customer_address,v_customer_notes,
    v_order_type,v_delivery_zone_id,
    v_payment_method_code,
    case when v_payment_reference is null
      then 'unpaid' else 'proof_submitted' end,
    v_payment_reference,
    v_subtotal,v_discount,v_delivery,v_total,
    'pending',v_expiry
  )
  returning * into v_order;
  -- The Legacy order and this sidecar must commit or roll back together.
  insert into public.retail_reservation_documents_identity_v1(
    retail_website_order_id,
    document_uid,
    creation_client_tx_id,
    creation_operation_digest
  ) values(
    v_order.id,
    v_document_uid::uuid,
    v_client_tx_id::uuid,
    v_digest
  )
  returning * into v_document;
  for v_line in
    select value
    from jsonb_array_elements(v_lines)
  loop
    v_line_uid:=public.point4_identity_uuid_v4_v1(v_line->>'line_uid');
    v_product_id:=public.point4_identity_bigint_v1(v_line->'product_id',false);
    v_qty:=(public.point4_identity_decimal_v1(
      (v_line->>'quantity')::numeric,
      3
    ))::numeric(14,3);
    v_notes:=nullif(trim(coalesce(v_line->>'notes','')),'');
    v_effect_line_key:=public.point4_identity_effect_line_key_v1(
      'stock',
      'reservation',
      v_line_uid
    );

    v_line_digest:=pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          jsonb_build_object(
            'line_key',v_effect_line_key,
            'line_uid',v_line_uid,
            'product_id',v_product_id::text,
            'quantity',v_qty::text,
            'notes',v_notes
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

    insert into public.retail_reservation_lines_identity_v1(
      reservation_document_id,
      line_uid,
      product_id,
      quantity,
      normalized_notes,
      reservation_effect_line_key,
      canonical_line_digest
    ) values(
      v_document.id,
      v_line_uid::uuid,
      v_product_id,
      v_qty,
      v_notes,
      v_effect_line_key,
      v_line_digest
    );
  end loop;
  update public.retail_website_orders
     set public_order_code='RW-'||lpad(v_order.id::text,8,'0')
   where id=v_order.id
  returning * into v_order;
  insert into public.retail_website_order_items(
    retail_website_order_id,
    product_id,
    product_name,
    unit_type,
    quantity,
    unit_price,
    unit_cost_snapshot,
    line_subtotal,
    offer_discount,
    line_total,
    notes
  )
  select
    v_order.id,
    x.product_id,
    x.product_name,
    x.unit_type,
    x.quantity,
    x.unit_price,
    x.unit_cost_snapshot,
    x.line_subtotal,
    x.offer_discount,
    x.line_total,
    x.notes
  from jsonb_to_recordset(v_legacy_items) as x(
    product_id bigint,
    product_name text,
    unit_type text,
    quantity numeric,
    unit_price numeric,
    unit_cost_snapshot numeric,
    line_subtotal numeric,
    offer_discount numeric,
    line_total numeric,
    notes text
  );
  update public.retail_stock_reservations r
     set status='expired'
   where r.branch_id=v_branch_id
     and r.status='active'
     and r.expires_at<=now()
     and exists(
       select 1
       from jsonb_to_recordset(v_legacy_items) as x(
         product_id bigint,
         quantity numeric
       )
       where x.product_id=r.product_id
     );
  insert into public.retail_stock_reservations(
    branch_id,
    product_id,
    quantity,
    reservation_key,
    status,
    expires_at,
    website_order_id
  )
  select
    v_branch_id,
    x.product_id,
    x.quantity,
    v_legacy_reservation_key,
    'active',
    v_expiry,
    v_order.id
  from jsonb_to_recordset(v_legacy_items) as x(
    product_id bigint,
    quantity numeric
  )
  on conflict(business_id,reservation_key,product_id) do update
    set quantity=excluded.quantity,
        status='active',
        expires_at=excluded.expires_at,
        website_order_id=excluded.website_order_id;
  perform public.retail_reservation_identity_assert_projection_v1(v_document.id);

  return jsonb_build_object(
    'ok',true,
    'id',v_order.id,
    'order_code',v_order.public_order_code,
    'status',v_order.status,
    'subtotal',v_order.subtotal,
    'offer_discount',v_order.offer_discount,
    'delivery_fee',v_order.delivery_fee,
    'total',v_order.total,
    'reservation_expires_at',v_order.reservation_expires_at,
    'document_uid',v_document_uid,
    'source_document_id',v_source_document_id,
    'client_tx_id',v_client_tx_id,
    'operation_digest',v_digest,
    'idempotent',false
  );
end;
$function$


-- retail_inventory_adjust(p_branch_id bigint, p_product_id bigint, p_quantity_delta numeric, p_movement_type text, p_notes text, p_client_tx_id text)
CREATE OR REPLACE FUNCTION public.retail_inventory_adjust(p_branch_id bigint, p_product_id bigint, p_quantity_delta numeric, p_movement_type text, p_notes text, p_client_tx_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_emp bigint;
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_type text:=lower(trim(coalesce(p_movement_type,'')));
  v_delta numeric(14,3):=round(coalesce(p_quantity_delta,0)::numeric,3);
  v_balance public.retail_inventory_balances%rowtype;
  v_existing public.retail_inventory_movements%rowtype;
begin
  if auth.uid() is null then
    raise exception 'غير مصرح';
  end if;

  if not (
    public.is_admin()
    or public.has_permission('inventory')
  ) then
    raise exception 'ليس لديك صلاحية إدارة المخزون';
  end if;

  if not public.has_branch_access(p_branch_id) then
    raise exception 'ليس لديك صلاحية لهذا الفرع';
  end if;

  if v_key is null then
    raise exception 'معرف الحركة مطلوب';
  end if;

  if v_type not in ('opening','adjustment','waste') then
    raise exception 'نوع حركة المخزون غير مسموح';
  end if;

  if v_delta=0 then
    raise exception 'كمية الحركة لا يمكن أن تكون صفر';
  end if;

  if v_type='waste' and v_delta>0 then
    v_delta:=-v_delta;
  end if;

  if not exists(
    select 1
    from public.products
    where id=p_product_id
      and active is distinct from false
  ) then
    raise exception 'الصنف غير موجود أو غير نشط';
  end if;

  v_emp:=public.current_employee_id();

  perform pg_advisory_xact_lock(
    hashtextextended(v_key,0)
  );

  select *
  into v_existing
  from public.retail_inventory_movements
  where client_tx_id=v_key
    and product_id=p_product_id
    and movement_type=v_type
  limit 1;

  if found then
    return to_jsonb(v_existing);
  end if;

  insert into public.retail_inventory_balances(
    branch_id,
    product_id,
    quantity
  )
  values(
    p_branch_id,
    p_product_id,
    0
  )
  on conflict(business_id,branch_id,product_id)
  do nothing;

  select *
  into v_balance
  from public.retail_inventory_balances
  where branch_id=p_branch_id
    and product_id=p_product_id
  for update;

  update public.retail_inventory_balances
  set
    quantity=round(quantity+v_delta,3),
    updated_at=now()
  where branch_id=p_branch_id
    and product_id=p_product_id
  returning *
  into v_balance;

  insert into public.retail_inventory_movements(
    branch_id,
    product_id,
    movement_type,
    quantity_delta,
    balance_after,
    reference_type,
    reference_id,
    client_tx_id,
    notes,
    employee_id
  )
  values(
    p_branch_id,
    p_product_id,
    v_type,
    v_delta,
    v_balance.quantity,
    'manual',
    v_key,
    v_key,
    nullif(trim(coalesce(p_notes,'')),''),
    v_emp
  )
  returning *
  into v_existing;

  return to_jsonb(v_existing);
end;
$function$


-- retail_inventory_set_item_policy(p_branch_id bigint, p_product_id bigint, p_track_inventory boolean, p_low_stock_threshold numeric)
CREATE OR REPLACE FUNCTION public.retail_inventory_set_item_policy(p_branch_id bigint, p_product_id bigint, p_track_inventory boolean, p_low_stock_threshold numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_row public.retail_inventory_balances%rowtype;
begin
  if auth.uid() is null then
    raise exception 'غير مصرح';
  end if;

  if not (
    public.is_admin()
    or public.has_permission('inventory')
  ) then
    raise exception 'ليس لديك صلاحية إدارة المخزون';
  end if;

  if not public.has_branch_access(p_branch_id) then
    raise exception 'ليس لديك صلاحية لهذا الفرع';
  end if;

  insert into public.retail_inventory_balances(
    branch_id,
    product_id,
    quantity,
    track_inventory,
    low_stock_threshold
  )
  values(
    p_branch_id,
    p_product_id,
    0,
    coalesce(p_track_inventory,true),
    case
      when p_low_stock_threshold is null then null
      else greatest(
        0,
        round(p_low_stock_threshold::numeric,3)
      )
    end
  )
  on conflict(business_id,branch_id,product_id)
  do update set
    track_inventory=excluded.track_inventory,
    low_stock_threshold=excluded.low_stock_threshold,
    updated_at=now()
  returning *
  into v_row;

  return to_jsonb(v_row);
end;
$function$


-- retail_inventory_set_policy(p_branch_id bigint, p_allow_negative_stock boolean, p_default_low_stock_threshold numeric)
CREATE OR REPLACE FUNCTION public.retail_inventory_set_policy(p_branch_id bigint, p_allow_negative_stock boolean, p_default_low_stock_threshold numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_emp bigint;
  v_row public.retail_inventory_settings%rowtype;
begin
  if auth.uid() is null then
    raise exception 'غير مصرح';
  end if;

  if not public.is_admin() then
    raise exception 'إعدادات المخزون للمدير فقط';
  end if;

  if not public.has_branch_access(p_branch_id) then
    raise exception 'ليس لديك صلاحية لهذا الفرع';
  end if;

  v_emp:=public.current_employee_id();

  insert into public.retail_inventory_settings(
    branch_id,
    allow_negative_stock,
    default_low_stock_threshold,
    updated_at,
    updated_by_employee_id
  )
  values(
    p_branch_id,
    coalesce(p_allow_negative_stock,false),
    greatest(
      0,
      round(
        coalesce(
          p_default_low_stock_threshold,
          0
        )::numeric,
        3
      )
    ),
    now(),
    v_emp
  )
  on conflict(business_id,branch_id)
  do update set
    allow_negative_stock=excluded.allow_negative_stock,
    default_low_stock_threshold=excluded.default_low_stock_threshold,
    updated_at=now(),
    updated_by_employee_id=v_emp
  returning *
  into v_row;

  return to_jsonb(v_row);
end;
$function$


-- retail_landed_cost_post_v1(p_landed_cost_id bigint)
CREATE OR REPLACE FUNCTION public.retail_landed_cost_post_v1(p_landed_cost_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$declare lc public.retail_landed_costs%rowtype;g public.retail_goods_receipts%rowtype;r record;bal public.retail_inventory_balances%rowtype;vbal public.retail_variant_inventory_balances%rowtype;oldavg numeric;newavg numeric;q numeric;emp bigint;posted integer:=0;begin if auth.uid() is null then raise exception 'غير مصرح';end if;if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية ترحيل تكلفة الشحن';end if;select * into lc from public.retail_landed_costs where id=p_landed_cost_id for update;if not found then raise exception 'Landed Cost غير موجود';end if;select * into g from public.retail_goods_receipts where id=lc.goods_receipt_id;if not found or not public.has_branch_access(g.branch_id) then raise exception 'GRN غير موجود أو غير مصرح';end if;if lc.status='posted' then return jsonb_build_object('ok',true,'already_posted',true,'posted_lines',(select count(*) from public.retail_inventory_value_adjustments_v1 where landed_cost_id=lc.id));end if;if lc.status<>'allocated' then raise exception 'يجب توزيع Landed Cost أولًا';end if;if not exists(select 1 from public.retail_landed_cost_allocations where landed_cost_id=lc.id and allocated_amount>0) then raise exception 'لا توجد توزيعات للترحيل';end if;emp:=public.current_employee_id();for r in select a.goods_receipt_item_id,a.allocated_amount,gi.product_id,gi.variant_id from public.retail_landed_cost_allocations a join public.retail_goods_receipt_items gi on gi.id=a.goods_receipt_item_id where a.landed_cost_id=lc.id and a.allocated_amount>0 order by a.id loop if r.variant_id is not null then if exists(select 1 from public.retail_variant_inventory_movements m where m.branch_id=g.branch_id and m.variant_id=r.variant_id and m.created_at>=g.received_at and (m.movement_type in('sale','supplier_return','transfer_out','waste','adjustment') or m.quantity_delta<0)) then raise exception 'لا يمكن ترحيل Landed Cost: توجد حركة خروج/تسوية بعد الاستلام للـVariant %',r.variant_id;end if;select * into vbal from public.retail_variant_inventory_balances where branch_id=g.branch_id and variant_id=r.variant_id for update;if not found or vbal.quantity<=0 then raise exception 'لا يوجد رصيد صالح للـVariant %',r.variant_id;end if;q:=vbal.quantity;oldavg:=coalesce(vbal.average_unit_cost,0);newavg:=round(oldavg+(r.allocated_amount/q),6);update public.retail_variant_inventory_balances set average_unit_cost=newavg,updated_at=now() where branch_id=g.branch_id and variant_id=r.variant_id;else if exists(select 1 from public.retail_inventory_movements m where m.branch_id=g.branch_id and m.product_id=r.product_id and m.created_at>=g.received_at and (m.movement_type in('sale','supplier_return','transfer_out','waste','adjustment') or m.quantity_delta<0)) then raise exception 'لا يمكن ترحيل Landed Cost: توجد حركة خروج/تسوية بعد الاستلام للصنف %',r.product_id;end if;select * into bal from public.retail_inventory_balances where branch_id=g.branch_id and product_id=r.product_id for update;if not found or bal.quantity<=0 then raise exception 'لا يوجد رصيد صالح للصنف %',r.product_id;end if;q:=bal.quantity;oldavg:=coalesce(bal.average_unit_cost,0);newavg:=round(oldavg+(r.allocated_amount/q),6);update public.retail_inventory_balances set average_unit_cost=newavg,updated_at=now() where branch_id=g.branch_id and product_id=r.product_id;end if;insert into public.retail_inventory_value_adjustments_v1(branch_id,product_id,variant_id,landed_cost_id,goods_receipt_item_id,amount,quantity_at_post,old_average_unit_cost,new_average_unit_cost,employee_id) values(g.branch_id,r.product_id,r.variant_id,lc.id,r.goods_receipt_item_id,r.allocated_amount,q,oldavg,newavg,emp) on conflict(business_id,landed_cost_id,goods_receipt_item_id) do nothing;posted:=posted+1;end loop;update public.retail_landed_costs set status='posted',updated_at=now() where id=lc.id;insert into public.retail_purchase_workflow_events(entity_type,entity_id,from_status,to_status,note,employee_id) values('landed_cost',lc.id,'allocated','posted','Safe inventory value adjustment posted',emp);return jsonb_build_object('ok',true,'already_posted',false,'posted_lines',posted,'landed_cost_id',lc.id);end;$function$


-- retail_post_stock_count(p_branch_id bigint, p_notes text, p_items jsonb)
CREATE OR REPLACE FUNCTION public.retail_post_stock_count(p_branch_id bigint, p_notes text, p_items jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
 v_id bigint;
 v_emp bigint;
 v record;
 v_bal public.retail_inventory_balances%rowtype;
 v_counted numeric(14,3);
 v_var numeric(14,3);
begin
 if auth.uid() is null then
   raise exception 'غير مصرح';
 end if;

 if not (public.is_admin() or public.has_permission('inventory')) then
   raise exception 'ليس لديك صلاحية الجرد';
 end if;

 if not public.has_branch_access(p_branch_id) then
   raise exception 'ليس لديك صلاحية لهذا الفرع';
 end if;

 v_emp:=public.current_employee_id();

 insert into public.retail_stock_counts(
   branch_id,status,notes,
   created_by_employee_id,
   posted_by_employee_id,
   posted_at
 )
 values(
   p_branch_id,
   'posted',
   nullif(trim(coalesce(p_notes,'')),''),
   v_emp,
   v_emp,
   now()
 )
 returning id into v_id;

 for v in
   select *
   from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb))
   as x(product_id bigint,counted_qty numeric)
 loop

   insert into public.retail_inventory_balances(
     branch_id,product_id,quantity
   )
   values(
     p_branch_id,v.product_id,0
   )
   on conflict(business_id,branch_id,product_id) do nothing;

   select *
   into v_bal
   from public.retail_inventory_balances
   where branch_id=p_branch_id
   and product_id=v.product_id
   for update;

   v_counted:=round(coalesce(v.counted_qty,0),3);

   if v_counted<0 then
     raise exception 'كمية الجرد لا يمكن أن تكون سالبة';
   end if;

   v_var:=round(v_counted-v_bal.quantity,3);

   insert into public.retail_stock_count_items(
     stock_count_id,
     product_id,
     system_qty,
     counted_qty,
     variance
   )
   values(
     v_id,
     v.product_id,
     v_bal.quantity,
     v_counted,
     v_var
   );

   if v_bal.track_inventory and v_var<>0 then

     update public.retail_inventory_balances
     set
       quantity=v_counted,
       updated_at=now()
     where branch_id=p_branch_id
     and product_id=v.product_id;

     insert into public.retail_inventory_movements(
       branch_id,
       product_id,
       movement_type,
       quantity_delta,
       balance_after,
       unit_cost,
       reference_type,
       reference_id,
       client_tx_id,
       employee_id,
       notes
     )
     values(
       p_branch_id,
       v.product_id,
       'adjustment',
       v_var,
       v_counted,
       v_bal.average_unit_cost,
       'stock_count',
       v_id::text,
       'stock-count:'||v_id||':'||v.product_id,
       v_emp,
       'جرد مخزون'
     );

   end if;
 end loop;

 return v_id;
end
$function$


-- retail_purchase_receive(p_purchase_order_id bigint, p_items jsonb, p_client_tx_id text)
CREATE OR REPLACE FUNCTION public.retail_purchase_receive(p_purchase_order_id bigint, p_items jsonb, p_client_tx_id text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
 v_po public.retail_purchase_orders%rowtype;
 v_grn bigint;
 v_emp bigint;
 v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
 v record;
 v_line public.retail_purchase_order_items%rowtype;
 v_bal public.retail_inventory_balances%rowtype;
 v_qty numeric(14,3);
 v_new numeric(14,3);
 v_avg numeric(14,4);
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;

 if not (public.is_admin() or public.has_permission('inventory')) then
  raise exception 'ليس لديك صلاحية الاستلام';
 end if;

 if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;

 perform pg_advisory_xact_lock(hashtextextended('retail-grn:'||v_key,0));

 select id into v_grn
 from public.retail_goods_receipts
 where client_tx_id=v_key;

 if v_grn is not null then return v_grn; end if;

 select *
 into v_po
 from public.retail_purchase_orders
 where id=p_purchase_order_id
 for update;

 if not found then raise exception 'أمر الشراء غير موجود'; end if;

 if not public.has_branch_access(v_po.branch_id) then
  raise exception 'ليس لديك صلاحية لهذا الفرع';
 end if;

 if v_po.status not in('approved','partially_received') then
  raise exception 'أمر الشراء غير جاهز للاستلام';
 end if;

 if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then
  raise exception 'لا توجد كميات للاستلام';
 end if;

 v_emp:=public.current_employee_id();

 insert into public.retail_goods_receipts(
  purchase_order_id,branch_id,supplier_id,client_tx_id,created_by_employee_id
 )
 values(
  v_po.id,v_po.branch_id,v_po.supplier_id,v_key,v_emp
 )
 returning id into v_grn;

 for v in
  select *
  from jsonb_to_recordset(p_items)
  as x(purchase_order_item_id bigint,quantity numeric)
 loop
  select *
  into v_line
  from public.retail_purchase_order_items
  where id=v.purchase_order_item_id
  and purchase_order_id=v_po.id
  for update;

  if not found then
   raise exception 'صنف الاستلام غير موجود في أمر الشراء';
  end if;

  v_qty:=round(coalesce(v.quantity,0)::numeric,3);

  if v_qty<=0 then
   raise exception 'كمية الاستلام يجب أن تكون أكبر من صفر';
  end if;

  if v_line.quantity_received+v_qty>v_line.quantity_ordered then
   raise exception 'كمية الاستلام تتجاوز المتبقي للصنف %',v_line.product_id;
  end if;

  insert into public.retail_inventory_balances(
   branch_id,product_id,quantity
  )
  values(v_po.branch_id,v_line.product_id,0)
  on conflict(business_id,branch_id,product_id) do nothing;

  select *
  into v_bal
  from public.retail_inventory_balances
  where branch_id=v_po.branch_id
  and product_id=v_line.product_id
  for update;

  v_new:=round(v_bal.quantity+v_qty,3);

  v_avg:=case
   when v_new<=0 then round(v_line.unit_cost,4)
   else round(
    ((v_bal.quantity*v_bal.average_unit_cost)+(v_qty*v_line.unit_cost))/v_new,
    4
   )
  end;

  update public.retail_inventory_balances
  set
   quantity=v_new,
   average_unit_cost=v_avg,
   last_purchase_cost=round(v_line.unit_cost,4),
   updated_at=now()
  where branch_id=v_po.branch_id
  and product_id=v_line.product_id;

  update public.retail_purchase_order_items
  set quantity_received=round(quantity_received+v_qty,3)
  where id=v_line.id;

  insert into public.retail_goods_receipt_items(
   goods_receipt_id,purchase_order_item_id,product_id,quantity,unit_cost
  )
  values(v_grn,v_line.id,v_line.product_id,v_qty,v_line.unit_cost);

  insert into public.retail_inventory_movements(
   branch_id,product_id,movement_type,quantity_delta,balance_after,
   unit_cost,reference_type,reference_id,client_tx_id,employee_id
  )
  values(
   v_po.branch_id,v_line.product_id,'purchase',v_qty,v_new,
   v_line.unit_cost,'grn',v_grn::text,v_key||':'||v_line.id,v_emp
  );
 end loop;

 update public.retail_purchase_orders po
 set
  status=case
   when not exists(
    select 1
    from public.retail_purchase_order_items i
    where i.purchase_order_id=po.id
    and i.quantity_received<i.quantity_ordered
   )
   then 'received'
   else 'partially_received'
  end,
  updated_at=now()
 where id=v_po.id;

 return v_grn;
end;
$function$


-- retail_purchase_receive_v2(p_purchase_order_id bigint, p_items jsonb, p_client_tx_id text)
CREATE OR REPLACE FUNCTION public.retail_purchase_receive_v2(p_purchase_order_id bigint, p_items jsonb, p_client_tx_id text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_po public.retail_purchase_orders%rowtype; v_grn bigint; v_emp bigint; v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),''); v record; v_line public.retail_purchase_order_items%rowtype; v_bal public.retail_inventory_balances%rowtype; v_vbal public.retail_variant_inventory_balances%rowtype; v_qty numeric(14,3); v_new numeric(14,3); v_avg numeric(14,4); v_old_status text;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية الاستلام'; end if;
 if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
 perform pg_advisory_xact_lock(hashtextextended('retail-grn-v2:'||v_key,0));
 select id into v_grn from public.retail_goods_receipts where client_tx_id=v_key;
 if v_grn is not null then return v_grn; end if;
 select * into v_po from public.retail_purchase_orders where id=p_purchase_order_id for update;
 if not found then raise exception 'أمر الشراء غير موجود'; end if;
 if not public.has_branch_access(v_po.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 if v_po.status not in('approved','partially_received') then raise exception 'أمر الشراء غير جاهز للاستلام'; end if;
 if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'لا توجد كميات للاستلام'; end if;
 v_emp:=public.current_employee_id(); v_old_status:=v_po.status;
 insert into public.retail_goods_receipts(purchase_order_id,branch_id,supplier_id,client_tx_id,created_by_employee_id) values(v_po.id,v_po.branch_id,v_po.supplier_id,v_key,v_emp) returning id into v_grn;
 for v in select * from jsonb_to_recordset(p_items) as x(purchase_order_item_id bigint,quantity numeric) loop
   select * into v_line from public.retail_purchase_order_items where id=v.purchase_order_item_id and purchase_order_id=v_po.id for update;
   if not found then raise exception 'صنف الاستلام غير موجود في أمر الشراء'; end if;
   v_qty:=round(coalesce(v.quantity,0)::numeric,3);
   if v_qty<=0 then raise exception 'كمية الاستلام يجب أن تكون أكبر من صفر'; end if;
   if v_line.quantity_received+v_qty>v_line.quantity_ordered then raise exception 'كمية الاستلام تتجاوز المتبقي للصنف %',v_line.product_id; end if;
   if v_line.variant_id is not null then
     insert into public.retail_variant_inventory_balances(branch_id,variant_id,quantity) values(v_po.branch_id,v_line.variant_id,0) on conflict(business_id,branch_id,variant_id) do nothing;
     select * into v_vbal from public.retail_variant_inventory_balances where branch_id=v_po.branch_id and variant_id=v_line.variant_id for update;
     v_new:=round(v_vbal.quantity+v_qty,3);
     v_avg:=case when v_new<=0 then round(v_line.unit_cost,4) else round(((v_vbal.quantity*v_vbal.average_unit_cost)+(v_qty*v_line.unit_cost))/v_new,4) end;
     update public.retail_variant_inventory_balances set quantity=v_new,average_unit_cost=v_avg,last_purchase_cost=round(v_line.unit_cost,4),updated_at=now() where branch_id=v_po.branch_id and variant_id=v_line.variant_id;
     insert into public.retail_variant_inventory_movements(branch_id,variant_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,employee_id) values(v_po.branch_id,v_line.variant_id,'purchase',v_qty,v_new,v_line.unit_cost,'grn',v_grn::text,v_key||':'||v_line.id,v_emp);
   else
     insert into public.retail_inventory_balances(branch_id,product_id,quantity) values(v_po.branch_id,v_line.product_id,0) on conflict(business_id,branch_id,product_id) do nothing;
     select * into v_bal from public.retail_inventory_balances where branch_id=v_po.branch_id and product_id=v_line.product_id for update;
     v_new:=round(v_bal.quantity+v_qty,3);
     v_avg:=case when v_new<=0 then round(v_line.unit_cost,4) else round(((v_bal.quantity*v_bal.average_unit_cost)+(v_qty*v_line.unit_cost))/v_new,4) end;
     update public.retail_inventory_balances set quantity=v_new,average_unit_cost=v_avg,last_purchase_cost=round(v_line.unit_cost,4),updated_at=now() where branch_id=v_po.branch_id and product_id=v_line.product_id;
     insert into public.retail_inventory_movements(branch_id,product_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,employee_id) values(v_po.branch_id,v_line.product_id,'purchase',v_qty,v_new,v_line.unit_cost,'grn',v_grn::text,v_key||':'||v_line.id,v_emp);
   end if;
   update public.retail_purchase_order_items set quantity_received=round(quantity_received+v_qty,3) where id=v_line.id;
   insert into public.retail_goods_receipt_items(goods_receipt_id,purchase_order_item_id,product_id,variant_id,quantity,unit_cost) values(v_grn,v_line.id,v_line.product_id,v_line.variant_id,v_qty,v_line.unit_cost);
 end loop;
 update public.retail_purchase_orders po set status=case when not exists(select 1 from public.retail_purchase_order_items i where i.purchase_order_id=po.id and i.quantity_received<i.quantity_ordered) then 'received' else 'partially_received' end,updated_at=now() where id=v_po.id;
 insert into public.retail_purchase_workflow_events(entity_type,entity_id,from_status,to_status,note,employee_id) values('goods_receipt',v_grn,null,'posted','Variant-aware GRN posted',v_emp);
 insert into public.retail_purchase_workflow_events(entity_type,entity_id,from_status,to_status,note,employee_id) select 'purchase_order',v_po.id,v_old_status,status,'GRN '||v_grn,v_emp from public.retail_purchase_orders where id=v_po.id;
 return v_grn;
end;$function$


-- retail_reorder_rule_upsert_v1(p_branch_id bigint, p_product_id bigint, p_supplier_id bigint, p_min_stock numeric, p_target_stock numeric, p_reorder_quantity numeric, p_lead_time_days integer, p_active boolean)
CREATE OR REPLACE FUNCTION public.retail_reorder_rule_upsert_v1(p_branch_id bigint, p_product_id bigint, p_supplier_id bigint, p_min_stock numeric, p_target_stock numeric, p_reorder_quantity numeric, p_lead_time_days integer, p_active boolean)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_id bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية إعادة الطلب'; end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 if coalesce(p_min_stock,0)<0 or coalesce(p_target_stock,0)<coalesce(p_min_stock,0) or coalesce(p_reorder_quantity,0)<0 or coalesce(p_lead_time_days,0)<0 then raise exception 'قيم إعادة الطلب غير صحيحة'; end if;
 insert into public.retail_reorder_rules(branch_id,product_id,preferred_supplier_id,min_stock,target_stock,reorder_quantity,lead_time_days,active,updated_at) values(p_branch_id,p_product_id,p_supplier_id,round(p_min_stock,3),round(p_target_stock,3),round(p_reorder_quantity,3),p_lead_time_days,coalesce(p_active,true),now()) on conflict(business_id,branch_id,product_id) do update set preferred_supplier_id=excluded.preferred_supplier_id,min_stock=excluded.min_stock,target_stock=excluded.target_stock,reorder_quantity=excluded.reorder_quantity,lead_time_days=excluded.lead_time_days,active=excluded.active,updated_at=now() returning id into v_id; return v_id;
end;$function$


-- retail_reserve_stock(p_branch_id bigint, p_reservation_key text, p_items jsonb, p_minutes integer)
CREATE OR REPLACE FUNCTION public.retail_reserve_stock(p_branch_id bigint, p_reservation_key text, p_items jsonb, p_minutes integer DEFAULT 10)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
 v record;
 v_bal numeric;
 v_reserved numeric;
 v_qty numeric(14,3);
begin

 if nullif(trim(coalesce(p_reservation_key,'')),'') is null then
   raise exception 'reservation key required';
 end if;

 update public.retail_stock_reservations
 set status='expired'
 where status='active'
 and expires_at<=now();

 for v in
   select *
   from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb))
   as x(product_id bigint,quantity numeric)
 loop

   v_qty:=round(coalesce(v.quantity,0),3);

   if v_qty<=0 then
     raise exception 'كمية غير صحيحة';
   end if;

   select quantity
   into v_bal
   from public.retail_inventory_balances
   where branch_id=p_branch_id
   and product_id=v.product_id
   for update;

   select coalesce(sum(quantity),0)
   into v_reserved
   from public.retail_stock_reservations
   where branch_id=p_branch_id
   and product_id=v.product_id
   and status='active'
   and expires_at>now()
   and reservation_key<>p_reservation_key;

   if coalesce(v_bal,0)-v_reserved<v_qty then
     raise exception 'المخزون غير كافٍ للصنف %',v.product_id;
   end if;

   insert into public.retail_stock_reservations(
     branch_id,
     product_id,
     quantity,
     reservation_key,
     status,
     expires_at
   )
   values(
     p_branch_id,
     v.product_id,
     v_qty,
     p_reservation_key,
     'active',
     now()+make_interval(
       mins=>greatest(
         1,
         least(coalesce(p_minutes,10),60)
       )
     )
   )
   on conflict(business_id,reservation_key,product_id)
   do update set
     quantity=excluded.quantity,
     status='active',
     expires_at=excluded.expires_at;

 end loop;

 return true;
end
$function$


-- retail_set_product_settings(p_product_id bigint, p_unit_type text, p_allow_decimal boolean, p_qty_step numeric, p_min_qty numeric, p_barcode_mode text, p_weight_prefix text, p_plu_code text, p_embedded_divisor numeric, p_online_enabled boolean)
CREATE OR REPLACE FUNCTION public.retail_set_product_settings(p_product_id bigint, p_unit_type text, p_allow_decimal boolean, p_qty_step numeric, p_min_qty numeric, p_barcode_mode text, p_weight_prefix text, p_plu_code text, p_embedded_divisor numeric, p_online_enabled boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية إعداد أصناف Retail'; end if;
 if p_unit_type not in('piece','kg','g','liter','ml') then raise exception 'وحدة غير صالحة'; end if;
 if p_barcode_mode not in('normal','weight','price') then raise exception 'نوع باركود غير صالح'; end if;

 insert into public.retail_product_settings(
   product_id,unit_type,allow_decimal,qty_step,min_qty,barcode_mode,
   weight_prefix,plu_code,embedded_divisor,online_enabled,updated_at
 )
 values(
   p_product_id,p_unit_type,coalesce(p_allow_decimal,false),
   greatest(round(coalesce(p_qty_step,1),3),0.001),
   greatest(round(coalesce(p_min_qty,1),3),0.001),
   p_barcode_mode,
   nullif(trim(coalesce(p_weight_prefix,'')),''),
   nullif(trim(coalesce(p_plu_code,'')),''),
   greatest(coalesce(p_embedded_divisor,1000),0.001),
   coalesce(p_online_enabled,true),now()
 )
 on conflict(business_id,product_id) do update set
   unit_type=excluded.unit_type,
   allow_decimal=excluded.allow_decimal,
   qty_step=excluded.qty_step,
   min_qty=excluded.min_qty,
   barcode_mode=excluded.barcode_mode,
   weight_prefix=excluded.weight_prefix,
   plu_code=excluded.plu_code,
   embedded_divisor=excluded.embedded_divisor,
   online_enabled=excluded.online_enabled,
   updated_at=now();

 return true;
end $function$


-- retail_transfer_receive(p_transfer_id bigint)
CREATE OR REPLACE FUNCTION public.retail_transfer_receive(p_transfer_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
 v_t public.retail_transfers%rowtype;
 v_emp bigint;
 v record;
 v_bal public.retail_inventory_balances%rowtype;
 v_new numeric(14,3);
begin

 if auth.uid() is null then
   raise exception 'غير مصرح';
 end if;

 select *
 into v_t
 from public.retail_transfers
 where id=p_transfer_id
 for update;

 if not found then
   raise exception 'التحويل غير موجود';
 end if;

 if not public.has_branch_access(v_t.to_branch_id) then
   raise exception 'ليس لديك صلاحية الفرع المستلم';
 end if;

 if v_t.status='received' then
   return v_t.id;
 end if;

 if v_t.status<>'sent' then
   raise exception 'التحويل غير قابل للاستلام';
 end if;

 v_emp:=public.current_employee_id();

 for v in
   select *
   from public.retail_transfer_items
   where transfer_id=v_t.id
   order by product_id
 loop

   insert into public.retail_inventory_balances(
     branch_id,
     product_id,
     quantity,
     average_unit_cost,
     last_purchase_cost
   )
   values(
     v_t.to_branch_id,
     v.product_id,
     0,
     v.unit_cost,
     v.unit_cost
   )
   on conflict(business_id,branch_id,product_id) do nothing;

   select *
   into v_bal
   from public.retail_inventory_balances
   where branch_id=v_t.to_branch_id
   and product_id=v.product_id
   for update;

   v_new:=round(v_bal.quantity+v.quantity,3);

   update public.retail_inventory_balances
   set
     quantity=v_new,
     average_unit_cost=
       case
         when v_new>0 then
           round(
             (
               (v_bal.quantity*v_bal.average_unit_cost)
               +(v.quantity*v.unit_cost)
             )/v_new,
             4
           )
         else v.unit_cost
       end,
     updated_at=now()
   where branch_id=v_t.to_branch_id
   and product_id=v.product_id;

   insert into public.retail_inventory_movements(
     branch_id,
     product_id,
     movement_type,
     quantity_delta,
     balance_after,
     unit_cost,
     reference_type,
     reference_id,
     client_tx_id,
     employee_id
   )
   values(
     v_t.to_branch_id,
     v.product_id,
     'transfer_in',
     v.quantity,
     v_new,
     v.unit_cost,
     'transfer',
     v_t.id::text,
     v_t.client_tx_id||':in:'||v.product_id,
     v_emp
   );

 end loop;

 update public.retail_transfers
 set
   status='received',
   received_by_employee_id=v_emp,
   received_at=now()
 where id=v_t.id;

 return v_t.id;
end
$function$


-- retail_variant_inventory_adjust_v1(p_branch_id bigint, p_variant_id bigint, p_quantity_delta numeric, p_movement_type text, p_notes text, p_client_tx_id text)
CREATE OR REPLACE FUNCTION public.retail_variant_inventory_adjust_v1(p_branch_id bigint, p_variant_id bigint, p_quantity_delta numeric, p_movement_type text, p_notes text, p_client_tx_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_emp bigint;
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_type text:=lower(trim(coalesce(p_movement_type,'')));
  v_delta numeric(14,3):=round(coalesce(p_quantity_delta,0)::numeric,3);
  v_balance public.retail_variant_inventory_balances%rowtype;
  v_existing public.retail_variant_inventory_movements%rowtype;
  v_stock_unit boolean;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية إدارة المخزون'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  if v_type not in ('opening','adjustment','waste') then raise exception 'نوع حركة المخزون غير مسموح'; end if;
  if v_delta=0 then raise exception 'كمية الحركة لا يمكن أن تكون صفر'; end if;
  if v_type='waste' and v_delta>0 then v_delta:=-v_delta; end if;
  select coalesce(is_stock_unit,false) into v_stock_unit from public.product_variants where id=p_variant_id and active=true;
  if not found then raise exception 'الـ Variant غير موجود أو غير نشط'; end if;
  if not v_stock_unit then raise exception 'هذا الاختيار Legacy وليس Stock Unit مستقل'; end if;
  v_emp:=public.current_employee_id();
  perform pg_advisory_xact_lock(hashtextextended('variant-stock:'||v_key,0));
  select * into v_existing from public.retail_variant_inventory_movements
  where client_tx_id=v_key and variant_id=p_variant_id and movement_type=v_type limit 1;
  if found then return to_jsonb(v_existing); end if;
  insert into public.retail_variant_inventory_balances(branch_id,variant_id,quantity)
  values(p_branch_id,p_variant_id,0) on conflict(business_id,branch_id,variant_id) do nothing;
  select * into v_balance from public.retail_variant_inventory_balances
  where branch_id=p_branch_id and variant_id=p_variant_id for update;
  update public.retail_variant_inventory_balances set quantity=round(quantity+v_delta,3),updated_at=now()
  where branch_id=p_branch_id and variant_id=p_variant_id returning * into v_balance;
  insert into public.retail_variant_inventory_movements(
    branch_id,variant_id,movement_type,quantity_delta,balance_after,reference_type,reference_id,client_tx_id,notes,employee_id
  ) values(
    p_branch_id,p_variant_id,v_type,v_delta,v_balance.quantity,'manual',v_key,v_key,nullif(trim(coalesce(p_notes,'')),''),v_emp
  ) returning * into v_existing;
  return to_jsonb(v_existing);
end;
$function$


-- service_installation_set_v1(p_job_id bigint, p_scheduled_at timestamp with time zone, p_installer_employee_id bigint, p_address text, p_status text, p_notes text)
CREATE OR REPLACE FUNCTION public.service_installation_set_v1(p_job_id bigint, p_scheduled_at timestamp with time zone, p_installer_employee_id bigint, p_address text, p_status text, p_notes text)
 RETURNS service_installations_v1
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ declare r public.service_installations_v1%rowtype;j public.service_jobs_v1%rowtype;begin if auth.uid() is null then raise exception 'غير مصرح';end if;select * into j from public.service_jobs_v1 where id=p_job_id;if not found or not public.has_branch_access(j.branch_id) then raise exception 'أمر الخدمة غير موجود أو غير مصرح';end if;insert into public.service_installations_v1(job_id,scheduled_at,installer_employee_id,address,status,completed_at,notes) values(p_job_id,p_scheduled_at,p_installer_employee_id,nullif(trim(coalesce(p_address,'')),''),coalesce(p_status,'scheduled'),case when p_status='completed' then now() else null end,nullif(trim(coalesce(p_notes,'')),'')) on conflict(business_id,job_id) do update set scheduled_at=excluded.scheduled_at,installer_employee_id=excluded.installer_employee_id,address=excluded.address,status=excluded.status,completed_at=case when excluded.status='completed' then coalesce(public.service_installations_v1.completed_at,now()) else public.service_installations_v1.completed_at end,notes=excluded.notes,updated_at=now() returning * into r;return r;end;$function$


-- sharawla_beta55_supply_acceptance_fixture_v1(p_run_id text)
CREATE OR REPLACE FUNCTION public.sharawla_beta55_supply_acceptance_fixture_v1(p_run_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_key text:=substr(md5(coalesce(p_run_id,'')),1,12); v_wh bigint;v_br bigint;v_product bigint;v_route bigint;v_catalog bigint; v_clean jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Beta55 acceptance fixture للمدير فقط';end if;
  if coalesce(p_run_id,'') !~ '^ACC-' then raise exception 'Acceptance run id غير صالح';end if;
  v_clean:=public.sharawla_beta55_supply_acceptance_cleanup_v1(p_run_id);
  if coalesce((v_clean->>'residue')::bigint,0)<>0 then raise exception 'تعذر تنظيف Fixture سابق';end if;
  v_wh:=nextval('public.branches_id_seq'); v_br:=nextval('public.branches_id_seq'); v_product:=nextval('public.products_id_seq');
  perform public.inventory_stock_assert_legacy_write_allowed_v2(v_wh,'product',v_product);
  perform public.inventory_stock_assert_legacy_write_allowed_v2(v_br,'product',v_product);
  insert into public.branches(id,name,active,website_visible,website_orders_enabled,location_type,location_code) values(v_wh,'ACC55 Warehouse '||v_key,true,false,false,'central_warehouse','ACC55-WH-'||v_key);
  insert into public.branches(id,name,active,website_visible,website_orders_enabled,location_type,location_code) values(v_br,'ACC55 Branch '||v_key,true,false,false,'branch','ACC55-BR-'||v_key);
  insert into public.products(id,name,price,cost,barcode,active,website_visible) values(v_product,'ACC55 Supply Product '||v_key,25,10,'ACC55-'||v_key,true,false);
  insert into public.retail_inventory_balances(branch_id,product_id,quantity,track_inventory,average_unit_cost,last_purchase_cost) values(v_wh,v_product,10,true,10,10),(v_br,v_product,2,true,10,10) on conflict(business_id,branch_id,product_id) do update set quantity=excluded.quantity,track_inventory=true,average_unit_cost=excluded.average_unit_cost,last_purchase_cost=excluded.last_purchase_cost,updated_at=now();
  insert into public.inventory_supply_routes(source_location_id,destination_branch_id,active,lead_time_days,allow_emergency,notes,created_by_employee_id) values(v_wh,v_br,true,1,true,'SHARAWLA_ACCEPTANCE:'||p_run_id,public.current_employee_id()) returning id into v_route;
  insert into public.inventory_supply_catalog(route_id,item_type,product_id,request_unit_code,min_request_qty,max_request_qty,request_multiple,suggested_target_qty,reorder_min_qty,target_stock_qty,active,sort_order,notes) values(v_route,'product',v_product,null,0,null,0,10,4,10,true,0,'SHARAWLA_ACCEPTANCE:'||p_run_id) returning id into v_catalog;
  return jsonb_build_object('ok',true,'run_id',p_run_id,'warehouse_id',v_wh,'branch_id',v_br,'product_id',v_product,'route_id',v_route,'catalog_item_id',v_catalog,'warehouse_qty',10,'branch_qty',2,'reorder_min',4,'target_stock',10);
end$function$


commit;
