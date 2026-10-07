-- V10.5.16 — Return Approval lifetime = 2 hours
-- Applies to NEW approval requests only. Existing rows keep their original expires_at.
begin;
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
  v_expires timestamptz:=now()+interval '2 hours';
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
commit;
