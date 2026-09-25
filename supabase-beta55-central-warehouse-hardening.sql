-- Sharawla POS — Beta55 Central Warehouse hardening
-- 1) The catalog read model deliberately uses owner access to read source stock,
--    but applies caller permission + route branch scope in the view predicate.
--    This lets a branch see stock availability for its assigned warehouse without
--    granting direct read access to the warehouse balance tables.
-- 2) Fix receive idempotency to return the request_id, never receipt_id.

begin;

drop view if exists public.inventory_supply_catalog_live_v1;
create view public.inventory_supply_catalog_live_v1
with (security_barrier=true) as
select
  c.id as catalog_item_id,
  c.route_id,
  r.source_location_id,
  r.destination_branch_id,
  r.cutoff_time,
  r.lead_time_days,
  r.allow_emergency,
  c.item_type,
  c.product_id,
  c.ingredient_id,
  case when c.item_type='product' then p.name else i.name end as item_name,
  coalesce(c.request_unit_code,case when c.item_type='ingredient' then i.base_unit_code else null end) as request_unit_code,
  c.min_request_qty,
  c.max_request_qty,
  c.request_multiple,
  c.suggested_target_qty,
  case when c.item_type='product' then coalesce(srcp.quantity,0) else coalesce(srci.quantity,0) end::numeric(14,3) as source_quantity,
  case when c.item_type='product' then coalesce(dstp.quantity,0) else coalesce(dsti.quantity,0) end::numeric(14,3) as destination_quantity,
  c.sort_order,
  c.notes
from public.inventory_supply_catalog c
join public.inventory_supply_routes r on r.id=c.route_id and r.active=true
left join public.products p on p.id=c.product_id
left join public.ingredients i on i.id=c.ingredient_id
left join public.retail_inventory_balances srcp
  on c.item_type='product' and srcp.branch_id=r.source_location_id and srcp.product_id=c.product_id
left join public.retail_inventory_balances dstp
  on c.item_type='product' and dstp.branch_id=r.destination_branch_id and dstp.product_id=c.product_id
left join public.ingredient_stock srci
  on c.item_type='ingredient' and srci.branch_id=r.source_location_id and srci.ingredient_id=c.ingredient_id
left join public.ingredient_stock dsti
  on c.item_type='ingredient' and dsti.branch_id=r.destination_branch_id and dsti.ingredient_id=c.ingredient_id
where c.active=true
  and public.has_action_permission_v2('inventory.supply.view')
  and (
    public.has_branch_access(r.source_location_id)
    or public.has_branch_access(r.destination_branch_id)
  );

grant select on public.inventory_supply_catalog_live_v1 to authenticated;

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
  v_existing_request_id bigint;
  v_req record;
  v_i public.inventory_supply_request_items%rowtype;
  v_good numeric(14,3);v_damaged numeric(14,3);v_short numeric(14,3);v_total numeric(14,3);v_remaining numeric(14,3);
  v_old_qty numeric(14,3);v_old_cost numeric(14,4);v_new_qty numeric(14,3);v_new_cost numeric(14,4);
  v_count integer:=0;
begin
  if auth.uid() is null then raise exception 'غير مصرح';end if;
  if not public.has_action_permission_v2('inventory.supply.request.receive') then raise exception 'ليس لديك صلاحية استلام طلبات التوريد';end if;
  if trim(coalesce(p_client_tx_id,''))='' then raise exception 'معرف العملية مطلوب';end if;
  perform pg_advisory_xact_lock(hashtextextended('inventory-supply-receive:'||p_client_tx_id,0));
  select r.request_id into v_existing_request_id from public.inventory_supply_receipts r where r.client_tx_id=p_client_tx_id;
  if v_existing_request_id is not null then return v_existing_request_id;end if;
  select * into v_q from public.inventory_supply_requests where id=p_request_id for update;
  if not found then raise exception 'طلب التوريد غير موجود';end if;
  if not public.has_branch_access(v_q.destination_branch_id) then raise exception 'ليس لديك صلاحية الفرع المستلم';end if;
  if v_q.status='received' then return v_q.id;end if;
  if v_q.status not in ('in_transit','partially_received') then raise exception 'الطلب غير قابل للاستلام في حالته الحالية';end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'حدد بنود الاستلام';end if;
  v_emp:=public.current_employee_id();
  insert into public.inventory_supply_receipts(request_id,client_tx_id,is_final,notes,received_by_employee_id)
  values(v_q.id,p_client_tx_id,coalesce(p_final,false),nullif(trim(coalesce(p_note,'')),''),v_emp)
  returning id into v_receipt_id;

  for v_req in select * from jsonb_to_recordset(p_items) as x(item_id bigint,quantity_received numeric,quantity_damaged numeric,quantity_shortage numeric,notes text)
  loop
    select * into v_i from public.inventory_supply_request_items where id=v_req.item_id and request_id=v_q.id for update;
    if not found then raise exception 'بند الاستلام % غير موجود',v_req.item_id;end if;
    v_good:=round(greatest(coalesce(v_req.quantity_received,0),0),3);
    v_damaged:=round(greatest(coalesce(v_req.quantity_damaged,0),0),3);
    v_short:=round(greatest(coalesce(v_req.quantity_shortage,0),0),3);
    v_total:=v_good+v_damaged+v_short;
    if v_total<=0 then continue;end if;
    v_remaining:=round(v_i.quantity_dispatched-v_i.quantity_received-v_i.quantity_damaged-v_i.quantity_shortage,3);
    if v_total>v_remaining then raise exception 'الكمية المستلمة أكبر من المتبقي للبند %',v_i.id;end if;

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
      update public.retail_inventory_balances
         set quantity=v_new_qty,average_unit_cost=v_new_cost,last_purchase_cost=v_i.unit_cost,updated_at=now()
       where branch_id=v_q.destination_branch_id and product_id=v_i.product_id;
      insert into public.retail_inventory_movements(branch_id,product_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,notes,employee_id)
      values(v_q.destination_branch_id,v_i.product_id,'transfer_in',v_good,v_new_qty,v_i.unit_cost,'supply_request',v_q.id::text,p_client_tx_id||':in:'||v_i.id,'استلام توريد داخلي من المخزن',v_emp);
    elsif v_good>0 and v_i.item_type='ingredient' then
      insert into public.ingredient_stock(branch_id,ingredient_id,quantity,average_unit_cost,last_purchase_cost,last_costed_at)
      values(v_q.destination_branch_id,v_i.ingredient_id,0,v_i.unit_cost,v_i.unit_cost,now())
      on conflict(branch_id,ingredient_id) do nothing;
      select quantity,average_unit_cost into v_old_qty,v_old_cost
      from public.ingredient_stock
      where branch_id=v_q.destination_branch_id and ingredient_id=v_i.ingredient_id for update;
      v_new_qty:=round(v_old_qty+v_good,3);
      v_new_cost:=case when v_new_qty>0 then round(((v_old_qty*v_old_cost)+(v_good*v_i.unit_cost))/v_new_qty,4) else v_i.unit_cost end;
      update public.ingredient_stock
         set quantity=v_new_qty,average_unit_cost=v_new_cost,last_purchase_cost=v_i.unit_cost,last_costed_at=now(),updated_at=now()
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
    where i.request_id=v_q.id
      and round(i.quantity_dispatched-i.quantity_received-i.quantity_damaged-i.quantity_shortage,3)<>0
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

grant execute on function public.inventory_supply_request_receive_v1(bigint,jsonb,boolean,text,text) to authenticated;

commit;
