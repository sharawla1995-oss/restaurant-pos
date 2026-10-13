-- CANDIDATE ONLY: preserve canonical owners; guarded Top Chicken ID allocation.
BEGIN;

DO $tc_preflight$ BEGIN IF NOT EXISTS(SELECT 1 FROM sharawla_internal.operational_business_identity_v1 WHERE cloud_business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid AND profile_code='restaurant') THEN RAISE EXCEPTION 'TOP_CHICKEN_OPERATIONAL_PROFILE_BINDING_REQUIRED'; END IF; END $tc_preflight$;

DO $guard$ BEGIN IF md5(pg_get_functiondef('public.order_assign_driver_v2(bigint,bigint)'::regprocedure)) <> 'f3588c1c79e05d64fcd12f2b41c89a7d' THEN RAISE EXCEPTION 'OWNER_DEFINITION_DRIFT: order_assign_driver_v2'; END IF; END $guard$;

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
 insert into public.audit_logs(id,business_id,employee_id,branch_id,action,entity_type,entity_id,details,created_at)
 values(case when v_order.business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid then nextval('public.audit_logs_id_seq'::regclass) else null end,v_order.business_id,v_emp,v_order.branch_id,'orders.delivery.assign_driver','order',v_order.id,
        jsonb_build_object('driver_id',v_driver.id,'to_status','out_for_delivery'),now());

 return jsonb_build_object('ok',true,'order',to_jsonb(v_order));
end;
$function$;

DO $guard$ BEGIN IF md5(pg_get_functiondef('public.order_fulfillment_transition_v2(bigint,text)'::regprocedure)) <> 'a06ed91b4df1a5129b49205c009abc83' THEN RAISE EXCEPTION 'OWNER_DEFINITION_DRIFT: order_fulfillment_transition_v2'; END IF; END $guard$;

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
 insert into public.audit_logs(id,business_id,employee_id,branch_id,action,entity_type,entity_id,details,created_at)
 values(case when v_order.business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid then nextval('public.audit_logs_id_seq'::regclass) else null end,v_order.business_id,v_emp,v_order.branch_id,'orders.fulfillment.manage','order',v_order.id,
        jsonb_build_object('from_status',v_from,'to_status',v_target),now());

 return jsonb_build_object('ok',true,'order',to_jsonb(v_order));
end;
$function$;

DO $guard$ BEGIN IF md5(pg_get_functiondef('public.delivery_mark_delivered_v2(bigint,text,text)'::regprocedure)) <> '381e1c779c70a54d074ef6cbe45e93d3' THEN RAISE EXCEPTION 'OWNER_DEFINITION_DRIFT: delivery_mark_delivered_v2'; END IF; END $guard$;

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
  insert into public.order_payments(id,business_id,order_id,method,amount)
  values(case when v_order.business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid then nextval('public.order_payments_id_seq'::regclass) else null end,v_order.business_id,v_order.id,v_method,coalesce(v_order.total,0));

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
    id,business_id,order_id,branch_id,driver_id,employee_id,client_tx_id,event_type,
    old_method,new_method,custody_before,custody_after
  ) values(
    case when v_order.business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid then nextval('public.delivery_payment_events_id_seq'::regclass) else null end,v_order.business_id,v_order.id,v_order.branch_id,v_order.driver_id,v_emp,v_key,v_event,
    nullif(v_old,''),v_method,v_before,v_after
  );

  insert into public.audit_logs(id,business_id,employee_id,branch_id,action,entity_type,entity_id,details)
  values(case when v_order.business_id='5358328c-9724-49aa-affc-1bce8be90f92'::uuid then nextval('public.audit_logs_id_seq'::regclass) else null end,v_order.business_id,v_emp,v_order.branch_id,
         case when v_event='delivered' then 'delivery_mark_delivered_v2' else 'delivery_payment_change_v2' end,
         'order',v_order.id,
         jsonb_build_object('old_method',v_old,'new_method',v_method,'custody_before',v_before,'custody_after',v_after,'client_tx_id',v_key));

  return jsonb_build_object('ok',true,'idempotent',false,'order',to_jsonb(v_order),'custody_amount',v_after);
end;
$function$;

COMMIT;
