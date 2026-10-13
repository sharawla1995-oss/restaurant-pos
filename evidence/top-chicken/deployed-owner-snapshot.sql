CREATE OR REPLACE FUNCTION public.current_business_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_header uuid;
  v_device uuid;
  v_business uuid;
  v_count integer;
begin
  if auth.uid() is null then return null; end if;

  v_header:=public.header_business_id();
  v_device:=public.header_device_id();

  -- Header business_id is only a selector. Server-owned membership + active employee
  -- must independently prove the caller belongs to the selected canonical Cloud tenant.
  if v_header is not null then
    select m.business_id into v_business
    from public.business_auth_memberships m
    where m.auth_user_id=auth.uid()
      and m.business_id=v_header
      and m.active=true
      and exists(
        select 1 from public.employees e
        where e.auth_user_id=m.auth_user_id
          and e.business_id=m.business_id
          and e.active=true
      )
    limit 1;

    if v_business is null then return null; end if;

    -- New desktop clients send the canonical Cloud device_id. If supplied, it must
    -- match the server-owned device/business binding. A forged device header cannot widen access.
    if v_device is not null and not exists(
      select 1 from public.business_device_bindings d
      where d.device_id=v_device
        and d.business_id=v_business
        and d.active=true
    ) then
      return null;
    end if;

    return v_business;
  end if;

  -- Legacy SH-0007 compatibility: no tenant is guessed unless the authenticated
  -- user has exactly one active server-side membership and matching active employee.
  select count(distinct m.business_id), min(m.business_id::text)::uuid
  into v_count,v_business
  from public.business_auth_memberships m
  where m.auth_user_id=auth.uid()
    and m.active=true
    and exists(
      select 1 from public.employees e
      where e.auth_user_id=m.auth_user_id
        and e.business_id=m.business_id
        and e.active=true
    );

  if v_count=1 then return v_business; end if;
  return null;
end
$function$

CREATE OR REPLACE FUNCTION public.current_employee_id()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select e.id
  from public.employees e
  where e.auth_user_id=auth.uid()
    and e.business_id=public.current_business_id()
    and e.active=true
  limit 1
$function$

CREATE OR REPLACE FUNCTION public.current_employee_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select e.role
  from public.employees e
  where e.auth_user_id=auth.uid()
    and e.business_id=public.current_business_id()
    and e.active=true
  limit 1
$function$

CREATE OR REPLACE FUNCTION public.order_assign_driver_v2(p_order_id bigint, p_driver_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
 v_emp bigint;
 v_order public.orders%rowtype;
 v_driver public.delivery_drivers%rowtype;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if not public.has_action_permission_v2('orders.delivery.assign_driver') then
   raise exception 'ORDER_ASSIGN_DRIVER_DENIED';
 end if;

 select * into v_order from public.orders where id=p_order_id for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if not public.has_branch_access(v_order.branch_id) then raise exception 'BRANCH_ACCESS_DENIED'; end if;
 if lower(coalesce(v_order.order_type,''))<>'delivery' then raise exception 'ORDER_NOT_DELIVERY'; end if;
 if lower(coalesce(v_order.status,''))<>'ready' then raise exception 'ORDER_NOT_READY'; end if;

 select * into v_driver from public.delivery_drivers where id=p_driver_id;
 if not found or v_driver.active is distinct from true then raise exception 'DELIVERY_DRIVER_NOT_ACTIVE'; end if;
 if v_driver.branch_id is distinct from v_order.branch_id then raise exception 'DELIVERY_DRIVER_BRANCH_MISMATCH'; end if;

 update public.orders
 set driver_id=v_driver.id,status='out_for_delivery',assigned_at=now()
 where id=v_order.id
 returning * into v_order;

 v_emp:=public.current_employee_id();
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details,created_at)
 values(v_emp,v_order.branch_id,'orders.delivery.assign_driver','order',v_order.id,
        jsonb_build_object('driver_id',v_driver.id,'to_status','out_for_delivery'),now());

 return jsonb_build_object('ok',true,'order',to_jsonb(v_order));
end;
$function$

CREATE OR REPLACE FUNCTION public.order_fulfillment_transition_v2(p_order_id bigint, p_target_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
 v_emp bigint;
 v_order public.orders%rowtype;
 v_target text:=lower(trim(coalesce(p_target_status,'')));
 v_from text;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if not public.has_action_permission_v2('orders.fulfillment.manage') then
   raise exception 'ORDERS_FULFILLMENT_DENIED';
 end if;

 select * into v_order from public.orders where id=p_order_id for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if not public.has_branch_access(v_order.branch_id) then raise exception 'BRANCH_ACCESS_DENIED'; end if;

 v_from:=lower(coalesce(v_order.status,''));

 if v_target='preparing' then
   if v_from<>'new' then raise exception 'INVALID_ORDER_TRANSITION'; end if;
 elsif v_target='ready' then
   if v_from<>'preparing' then raise exception 'INVALID_ORDER_TRANSITION'; end if;
 elsif v_target='completed' then
   if v_from<>'ready' then raise exception 'INVALID_ORDER_TRANSITION'; end if;
   -- F5A completed is intentionally pickup/non-delivery only.
   -- Delivery completion remains owned by delivery_mark_delivered_v2.
   if lower(coalesce(v_order.order_type,''))='delivery' then
     raise exception 'DELIVERY_COMPLETION_REQUIRES_DELIVERY_OWNER';
   end if;
 else
   raise exception 'FULFILLMENT_TARGET_NOT_ALLOWED';
 end if;

 update public.orders
 set status=v_target,
     delivered_at=case when v_target='completed' then coalesce(delivered_at,now()) else delivered_at end
 where id=v_order.id
 returning * into v_order;

 v_emp:=public.current_employee_id();
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details,created_at)
 values(v_emp,v_order.branch_id,'orders.fulfillment.manage','order',v_order.id,
        jsonb_build_object('from_status',v_from,'to_status',v_target),now());

 return jsonb_build_object('ok',true,'order',to_jsonb(v_order));
end;
$function$

CREATE OR REPLACE FUNCTION public.delivery_mark_delivered_v2(p_order_id bigint, p_payment_method text, p_client_tx_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp bigint;
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_method text:=lower(nullif(trim(coalesce(p_payment_method,'')),''));
  v_old text;
  v_order public.orders%rowtype;
  v_existing public.delivery_payment_events%rowtype;
  v_before numeric(12,2):=0;
  v_after numeric(12,2):=0;
  v_pay_count integer:=0;
  v_distinct_pay integer:=0;
  v_event text;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  v_emp:=public.current_employee_id();
  if v_emp is null then raise exception 'تعذر تحديد الموظف الحالي'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  if v_method is null or v_method='mixed' then raise exception 'حدد طريقة دفع نهائية واحدة عند التسليم'; end if;
  if not public.has_action_permission_v2('delivery.mark_delivered') then raise exception 'ليس لديك صلاحية تأكيد تسليم الدليفري'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_key,0));
  select * into v_existing from public.delivery_payment_events where client_tx_id=v_key limit 1;
  if found then
    if v_existing.order_id<>p_order_id then raise exception 'معرف الحركة مستخدم لطلب آخر'; end if;
    select * into v_order from public.orders where id=p_order_id;
    return jsonb_build_object('ok',true,'idempotent',true,'order',to_jsonb(v_order),'custody_amount',v_existing.custody_after);
  end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'طلب الدليفري غير موجود'; end if;
  if v_order.order_type<>'delivery' then raise exception 'الطلب ليس دليفري'; end if;
  if not public.has_branch_access(v_order.branch_id) then raise exception 'ليس لديك صلاحية على هذا الفرع'; end if;
  if v_order.status not in ('out_for_delivery','delivered','completed') then raise exception 'الطلب غير جاهز لتأكيد التسليم'; end if;
  if v_order.driver_id is null then raise exception 'حدد المندوب قبل تأكيد التسليم'; end if;

  if not exists(
    select 1 from public.payment_methods pm
    where lower(pm.code)=v_method and pm.active=true
      and (
        not exists(select 1 from public.branch_payment_methods bpm0 where bpm0.branch_id=v_order.branch_id)
        or exists(select 1 from public.branch_payment_methods bpm join public.payment_methods pm2 on pm2.id=bpm.payment_method_id
                  where bpm.branch_id=v_order.branch_id and bpm.active=true and lower(pm2.code)=v_method)
      )
  ) then raise exception 'طريقة الدفع غير متاحة لهذا الفرع'; end if;

  v_old:=lower(coalesce(v_order.payment_method,''));
  v_before:=coalesce(v_order.delivery_cash_custody_amount,0);

  if v_old is distinct from v_method then
    if not public.has_action_permission_v2('delivery.payment.change_at_delivery') then raise exception 'ليس لديك صلاحية تغيير طريقة الدفع عند التسليم'; end if;
    if v_order.driver_settled_at is not null
       or exists(select 1 from public.driver_settlement_items dsi where dsi.order_id=v_order.id and dsi.reversed_at is null)
    then raise exception 'لا يمكن تغيير طريقة الدفع بعد تسوية عهدة هذا الطلب'; end if;
  end if;

  select count(*),count(distinct lower(method)) into v_pay_count,v_distinct_pay
  from public.order_payments where order_id=v_order.id;
  if v_order.payment_method='mixed' or v_distinct_pay>1 then
    raise exception 'الدفع المختلط يحتاج تسوية مكونات مستقلة ولا يمكن تغييره من شاشة التسليم الحالية';
  end if;

  delete from public.order_payments where order_id=v_order.id;
  insert into public.order_payments(order_id,method,amount)
  values(v_order.id,v_method,coalesce(v_order.total,0));

  v_after:=case when v_method='cash' then round(coalesce(v_order.total,0),2) else 0 end;
  v_event:=case when v_order.status in ('delivered','completed') then 'payment_changed' else 'delivered' end;

  update public.orders
  set payment_method=v_method,
      payment_status='confirmed',
      status='delivered',
      delivered_at=coalesce(delivered_at,now()),
      delivery_cash_custody_amount=v_after,
      delivery_payment_finalized_at=now(),
      delivery_payment_finalized_by=v_emp,
      driver_settled_at=case when v_after>0 then null else driver_settled_at end
  where id=v_order.id
  returning * into v_order;

  insert into public.delivery_payment_events(
    order_id,branch_id,driver_id,employee_id,client_tx_id,event_type,
    old_method,new_method,custody_before,custody_after
  ) values(
    v_order.id,v_order.branch_id,v_order.driver_id,v_emp,v_key,v_event,
    nullif(v_old,''),v_method,v_before,v_after
  );

  insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
  values(v_emp,v_order.branch_id,
         case when v_event='delivered' then 'delivery_mark_delivered_v2' else 'delivery_payment_change_v2' end,
         'order',v_order.id,
         jsonb_build_object('old_method',v_old,'new_method',v_method,'custody_before',v_before,'custody_after',v_after,'client_tx_id',v_key));

  return jsonb_build_object('ok',true,'idempotent',false,'order',to_jsonb(v_order),'custody_amount',v_after);
end;
$function$

CREATE OR REPLACE FUNCTION public.has_branch_access(p_branch_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select exists(
    select 1
    from public.branches b
    where b.id=p_branch_id
      and b.business_id=public.current_business_id()
      and (
        public.is_admin()
        or exists(
          select 1
          from public.employee_branches eb
          where eb.employee_id=public.current_employee_id()
            and eb.branch_id=b.id
            and eb.business_id=b.business_id
        )
      )
  )
$function$

CREATE OR REPLACE FUNCTION public.header_business_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  h jsonb;
  raw_id text;
  v uuid;
begin
  begin
    h:=coalesce(current_setting('request.headers',true),'{}')::jsonb;
  exception when others then
    h:='{}'::jsonb;
  end;
  raw_id:=nullif(trim(coalesce(h->>'x-sharawla-business','')),'');
  if raw_id is null then return null; end if;

  begin
    v:=raw_id::uuid;
  exception when invalid_text_representation then
    return null;
  end;

  if exists(select 1 from public.businesses b where b.id=v and b.active=true) then
    return v;
  end if;
  return null;
end
$function$

CREATE OR REPLACE FUNCTION public.header_device_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  h jsonb;
  raw_id text;
  v uuid;
begin
  begin
    h:=coalesce(current_setting('request.headers',true),'{}')::jsonb;
  exception when others then
    h:='{}'::jsonb;
  end;
  raw_id:=nullif(trim(coalesce(h->>'x-sharawla-device','')),'');
  if raw_id is null then return null; end if;
  begin
    v:=raw_id::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  return v;
end
$function$

CREATE OR REPLACE FUNCTION public.request_business_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if auth.uid() is not null then
    return public.current_business_id();
  end if;

  -- Anonymous website traffic has no Auth membership; the UUID is only a public
  -- tenant selector and remains constrained to public RPC/RLS surfaces.
  return public.header_business_id();
end
$function$
