-- Sharawla POS 10.5.13 Candidate — Return Recipe Owner Compatibility
-- Follow-up for already-upgraded Beta databases.
-- Stable runtime uses return_items recipe trigger; advanced Beta/Point-4 runtime
-- uses food_apply_return_consumption_v1. The functions below select one owner only.

begin;

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
$$;

revoke all on function public.create_approved_order_return_v1(bigint,text,text,jsonb,jsonb,bigint,bigint,bigint,bigint) from public,anon,authenticated;

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

  if not exists(
       select 1 from pg_trigger
       where tgrelid='public.return_items'::regclass
         and tgname='trg_recipe_return_item_fail_open_v1'
         and not tgisinternal
     )
     and to_regprocedure('public.food_apply_return_consumption_v1(bigint,bigint,jsonb,text)') is not null then
    execute 'select public.food_apply_return_consumption_v1($1,$2,$3,$4)'
      using v_id,p_order_id,p_items,'direct-return-food:'||v_key;
  end if;

  update public.returns set client_tx_id=v_key,request_digest=v_digest where id=v_id;
  return v_id;
end;
$$;

revoke all on function public.create_order_return(bigint,text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.create_order_return_idempotent(bigint,text,text,jsonb,jsonb,text) from public,anon;
grant execute on function public.create_order_return_idempotent(bigint,text,text,jsonb,jsonb,text) to authenticated;

notify pgrst,'reload schema';
commit;
