-- Sharawla POS — Beta55 Central Warehouse Fulfillment / Receiving
-- Sandbox-first additive runtime. Extends the shared supply foundation with
-- atomic source deduction, in-transit state, partial receiving and variance capture.

begin;

alter table public.inventory_supply_request_items
  add column if not exists unit_cost numeric(14,4) not null default 0,
  add column if not exists quantity_backordered numeric(14,3) not null default 0,
  add column if not exists quantity_shortage numeric(14,3) not null default 0;

alter table public.inventory_supply_request_items
  drop constraint if exists inventory_supply_request_items_unit_cost_check,
  add constraint inventory_supply_request_items_unit_cost_check check (unit_cost >= 0),
  drop constraint if exists inventory_supply_request_items_backordered_check,
  add constraint inventory_supply_request_items_backordered_check check (quantity_backordered >= 0),
  drop constraint if exists inventory_supply_request_items_shortage_check,
  add constraint inventory_supply_request_items_shortage_check check (quantity_shortage >= 0);

create table if not exists public.inventory_supply_receipts (
  id bigserial primary key,
  request_id bigint not null references public.inventory_supply_requests(id) on delete restrict,
  client_tx_id text not null unique,
  is_final boolean not null default false,
  notes text,
  received_by_employee_id bigint references public.employees(id),
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_supply_receipt_items (
  id bigserial primary key,
  receipt_id bigint not null references public.inventory_supply_receipts(id) on delete cascade,
  request_item_id bigint not null references public.inventory_supply_request_items(id) on delete restrict,
  quantity_received numeric(14,3) not null default 0 check (quantity_received >= 0),
  quantity_damaged numeric(14,3) not null default 0 check (quantity_damaged >= 0),
  quantity_shortage numeric(14,3) not null default 0 check (quantity_shortage >= 0),
  notes text,
  unique(receipt_id,request_item_id),
  constraint inventory_supply_receipt_item_nonzero check (
    quantity_received > 0 or quantity_damaged > 0 or quantity_shortage > 0
  )
);

create index if not exists inventory_supply_receipts_request_idx
  on public.inventory_supply_receipts(request_id,created_at,id);

alter table public.inventory_supply_receipts enable row level security;
alter table public.inventory_supply_receipt_items enable row level security;

drop policy if exists inventory_supply_receipts_select_v1 on public.inventory_supply_receipts;
create policy inventory_supply_receipts_select_v1 on public.inventory_supply_receipts
for select to authenticated using (
  exists (
    select 1 from public.inventory_supply_requests q
    where q.id=request_id
      and public.has_action_permission_v2('inventory.supply.view')
      and (public.has_branch_access(q.source_location_id) or public.has_branch_access(q.destination_branch_id))
  )
);

drop policy if exists inventory_supply_receipt_items_select_v1 on public.inventory_supply_receipt_items;
create policy inventory_supply_receipt_items_select_v1 on public.inventory_supply_receipt_items
for select to authenticated using (
  exists (
    select 1
    from public.inventory_supply_receipts r
    join public.inventory_supply_requests q on q.id=r.request_id
    where r.id=receipt_id
      and public.has_action_permission_v2('inventory.supply.view')
      and (public.has_branch_access(q.source_location_id) or public.has_branch_access(q.destination_branch_id))
  )
);

grant select on public.inventory_supply_receipts,public.inventory_supply_receipt_items to authenticated;
revoke insert,update,delete on public.inventory_supply_receipts,public.inventory_supply_receipt_items from authenticated;

create or replace function public.inventory_supply_request_prepare_v1(
  p_request_id bigint,
  p_note text
) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_q public.inventory_supply_requests%rowtype;v_emp bigint;
begin
  if auth.uid() is null then raise exception 'غير مصرح';end if;
  if not public.has_action_permission_v2('inventory.supply.request.fulfill') then raise exception 'ليس لديك صلاحية تجهيز طلبات التوريد';end if;
  select * into v_q from public.inventory_supply_requests where id=p_request_id for update;
  if not found then raise exception 'طلب التوريد غير موجود';end if;
  if not public.has_branch_access(v_q.source_location_id) then raise exception 'ليس لديك صلاحية المخزن المصدر';end if;
  if v_q.status='preparing' then return v_q.id;end if;
  if v_q.status<>'approved' then raise exception 'الطلب غير جاهز للتجهيز';end if;
  v_emp:=public.current_employee_id();
  update public.inventory_supply_requests set status='preparing',updated_at=now() where id=v_q.id;
  insert into public.inventory_supply_request_events(request_id,from_status,to_status,note,employee_id)
  values(v_q.id,'approved','preparing',nullif(trim(coalesce(p_note,'')),''),v_emp);
  insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
  values(v_emp,v_q.source_location_id,'inventory.supply.request.prepare','inventory_supply_request',v_q.id,jsonb_build_object('destination_branch_id',v_q.destination_branch_id));
  return v_q.id;
end$$;

create or replace function public.inventory_supply_request_dispatch_v1(
  p_request_id bigint,
  p_items jsonb,
  p_note text,
  p_client_tx_id text
) returns bigint
language plpgsql security definer set search_path=public as $$
declare
  v_q public.inventory_supply_requests%rowtype;
  v_emp bigint;
  v_i public.inventory_supply_request_items%rowtype;
  v_req record;
  v_qty numeric(14,3);
  v_cost numeric(14,4);
  v_new numeric(14,3);
  v_found boolean;
  v_count integer:=0;
  v_payload_empty boolean:=true;
  v_frozen_items jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'غير مصرح';end if;
  if not public.has_action_permission_v2('inventory.supply.request.fulfill') then raise exception 'ليس لديك صلاحية صرف طلبات التوريد';end if;
  if trim(coalesce(p_client_tx_id,''))='' then raise exception 'معرف العملية مطلوب';end if;
  perform pg_advisory_xact_lock(hashtextextended('inventory-supply-dispatch:'||p_client_tx_id,0));
  select * into v_q from public.inventory_supply_requests where id=p_request_id for update;
  if not found then raise exception 'طلب التوريد غير موجود';end if;
  if not public.has_branch_access(v_q.source_location_id) then raise exception 'ليس لديك صلاحية المخزن المصدر';end if;
  if v_q.status in ('in_transit','partially_received','received') then return v_q.id;end if;
  if v_q.status not in ('approved','preparing') then raise exception 'الطلب غير قابل للصرف في حالته الحالية';end if;
  v_payload_empty:=coalesce(jsonb_array_length(case when jsonb_typeof(coalesce(p_items,'[]'::jsonb))='array' then coalesce(p_items,'[]'::jsonb) else '[]'::jsonb end),0)=0;
  v_emp:=public.current_employee_id();

  -- Point4 FT-1: freeze the complete effective mixed stock identity set before any request-item/stock mutation.
  select coalesce(jsonb_agg(jsonb_build_object(
    'request_item_id',z.id,'item_type',z.item_type,'product_id',z.product_id,'ingredient_id',z.ingredient_id,'qty',z.qty
  ) order by z.item_type,coalesce(z.product_id,z.ingredient_id),z.id),'[]'::jsonb)
  into v_frozen_items
  from (
    select i.id,i.item_type,i.product_id,i.ingredient_id,
      case when v_payload_empty then i.quantity_approved
           else coalesce((select round(x.quantity,3) from jsonb_to_recordset(p_items) as x(item_id bigint,quantity numeric) where x.item_id=i.id limit 1),0) end qty
    from public.inventory_supply_request_items i where i.request_id=v_q.id
  ) z
  where z.qty>0;

  if jsonb_array_length(v_frozen_items)=0 then raise exception 'حدد كمية صرف لبند واحد على الأقل';end if;
  for v_req in select * from jsonb_to_recordset(v_frozen_items) as x(request_item_id bigint,item_type text,product_id bigint,ingredient_id bigint,qty numeric)
  loop
    if v_req.qty<0 then raise exception 'كمية الصرف غير صحيحة للبند %',v_req.request_item_id;end if;
    select * into v_i from public.inventory_supply_request_items where id=v_req.request_item_id and request_id=v_q.id;
    if v_req.qty>v_i.quantity_approved then raise exception 'كمية الصرف غير صحيحة للبند %',v_i.id;end if;
  end loop;
  for v_req in select * from jsonb_to_recordset(v_frozen_items) as x(request_item_id bigint,item_type text,product_id bigint,ingredient_id bigint,qty numeric)
               order by item_type,coalesce(product_id,ingredient_id),request_item_id
  loop
    perform public.inventory_stock_assert_legacy_write_allowed_v2(
      v_q.source_location_id,v_req.item_type,case when v_req.item_type='product' then v_req.product_id else v_req.ingredient_id end);
  end loop;

  for v_i in
    select i.* from public.inventory_supply_request_items i where i.request_id=v_q.id order by i.id for update
  loop
    v_found:=false;v_qty:=0;
    select x.qty into v_qty from jsonb_to_recordset(v_frozen_items) as x(request_item_id bigint,item_type text,product_id bigint,ingredient_id bigint,qty numeric) where x.request_item_id=v_i.id;
    v_found:=found;
    if not v_found then v_qty:=0;end if;
    if v_qty<0 or v_qty>v_i.quantity_approved then raise exception 'كمية الصرف غير صحيحة للبند %',v_i.id;end if;
    if v_qty=0 then
      update public.inventory_supply_request_items set quantity_dispatched=0,quantity_backordered=quantity_approved where id=v_i.id;
      continue;
    end if;

    if v_i.item_type='product' then
      select average_unit_cost,quantity into v_cost,v_new
      from public.retail_inventory_balances
      where branch_id=v_q.source_location_id and product_id=v_i.product_id and track_inventory=true
      for update;
      if not found then raise exception 'لا يوجد مخزون متتبع للصنف % في المخزن المصدر',v_i.product_id;end if;
      if v_new<v_qty then raise exception 'المخزون غير كافٍ للصنف %',v_i.product_id;end if;
      v_new:=round(v_new-v_qty,3);
      update public.retail_inventory_balances set quantity=v_new,updated_at=now()
       where branch_id=v_q.source_location_id and product_id=v_i.product_id;
      insert into public.retail_inventory_movements(branch_id,product_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,notes,employee_id)
      values(v_q.source_location_id,v_i.product_id,'transfer_out',-v_qty,v_new,v_cost,'supply_request',v_q.id::text,p_client_tx_id||':out:'||v_i.id,'صرف توريد داخلي للفرع',v_emp);
    else
      if not exists(select 1 from public.ingredients where id=v_i.ingredient_id and track_inventory=true and active is distinct from false) then raise exception 'الخامة % غير مفعلة للمخزون',v_i.ingredient_id;end if;
      select average_unit_cost,quantity into v_cost,v_new
      from public.ingredient_stock
      where branch_id=v_q.source_location_id and ingredient_id=v_i.ingredient_id
      for update;
      if not found then raise exception 'لا يوجد مخزون للخامة % في المخزن المصدر',v_i.ingredient_id;end if;
      if v_new<v_qty then raise exception 'مخزون الخامة % غير كافٍ',v_i.ingredient_id;end if;
      v_new:=round(v_new-v_qty,3);
      update public.ingredient_stock set quantity=v_new,updated_at=now()
       where branch_id=v_q.source_location_id and ingredient_id=v_i.ingredient_id;
      insert into public.food_ingredient_adjustment_events(branch_id,ingredient_id,quantity_delta,balance_after,unit_cost,reason,client_tx_id,employee_id)
      values(v_q.source_location_id,v_i.ingredient_id,-v_qty,v_new,v_cost,'supply_transfer_out',p_client_tx_id||':out:'||v_i.id,v_emp);
    end if;

    update public.inventory_supply_request_items
       set quantity_dispatched=v_qty,
           quantity_backordered=greatest(quantity_approved-v_qty,0),
           unit_cost=coalesce(v_cost,0)
     where id=v_i.id;
    v_count:=v_count+1;
  end loop;

  if v_count=0 then raise exception 'حدد كمية صرف لبند واحد على الأقل';end if;
  update public.inventory_supply_requests
     set status='in_transit',dispatched_by_employee_id=v_emp,dispatched_at=now(),updated_at=now()
   where id=v_q.id;
  insert into public.inventory_supply_request_events(request_id,from_status,to_status,note,employee_id,details)
  values(v_q.id,v_q.status,'in_transit',nullif(trim(coalesce(p_note,'')),''),v_emp,jsonb_build_object('dispatch_tx_id',p_client_tx_id,'lines',v_count));
  insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
  values(v_emp,v_q.source_location_id,'inventory.supply.request.dispatch','inventory_supply_request',v_q.id,jsonb_build_object('destination_branch_id',v_q.destination_branch_id,'dispatch_tx_id',p_client_tx_id,'lines',v_count));
  return v_q.id;
end$$;

create or replace function public.inventory_supply_request_receive_v1(
  p_request_id bigint,
  p_items jsonb,
  p_final boolean,
  p_note text,
  p_client_tx_id text
) returns bigint
language plpgsql security definer set search_path=public as $$
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
      on conflict(branch_id,product_id) do nothing;
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
      on conflict(branch_id,ingredient_id) do nothing;
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
end$$;

grant execute on function public.inventory_supply_request_prepare_v1(bigint,text) to authenticated;
grant execute on function public.inventory_supply_request_dispatch_v1(bigint,jsonb,text,text) to authenticated;
grant execute on function public.inventory_supply_request_receive_v1(bigint,jsonb,boolean,text,text) to authenticated;

commit;
