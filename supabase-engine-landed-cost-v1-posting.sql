-- Advanced Purchasing — Landed Cost safe valuation posting
-- Posting is allowed only if no outbound/adjustment movement occurred for each received stock unit after its GRN.
begin;

create table if not exists public.retail_inventory_value_adjustments_v1(
  id bigserial primary key,
  branch_id bigint not null references public.branches(id) on delete restrict,
  product_id bigint not null references public.products(id) on delete restrict,
  variant_id bigint references public.product_variants(id) on delete restrict,
  landed_cost_id bigint not null references public.retail_landed_costs(id) on delete restrict,
  goods_receipt_item_id bigint not null references public.retail_goods_receipt_items(id) on delete restrict,
  amount numeric(14,2) not null check(amount>0),
  quantity_at_post numeric(14,3) not null check(quantity_at_post>0),
  old_average_unit_cost numeric(18,6) not null check(old_average_unit_cost>=0),
  new_average_unit_cost numeric(18,6) not null check(new_average_unit_cost>=0),
  employee_id bigint references public.employees(id),
  created_at timestamptz not null default now(),
  unique(landed_cost_id,goods_receipt_item_id)
);

alter table public.retail_inventory_value_adjustments_v1 enable row level security;
drop policy if exists retail_inventory_value_adjustments_v1_read on public.retail_inventory_value_adjustments_v1;
create policy retail_inventory_value_adjustments_v1_read on public.retail_inventory_value_adjustments_v1 for select to authenticated using(public.has_branch_access(branch_id));
grant select on public.retail_inventory_value_adjustments_v1 to authenticated;

create or replace function public.retail_landed_cost_post_v1(p_landed_cost_id bigint)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare lc public.retail_landed_costs%rowtype;g public.retail_goods_receipts%rowtype;r record;bal public.retail_inventory_balances%rowtype;vbal public.retail_variant_inventory_balances%rowtype;oldavg numeric;newavg numeric;q numeric;emp bigint;posted integer:=0;begin
 if auth.uid() is null then raise exception 'غير مصرح';end if;
 if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية ترحيل تكلفة الشحن';end if;
 select * into lc from public.retail_landed_costs where id=p_landed_cost_id for update;if not found then raise exception 'Landed Cost غير موجود';end if;
 select * into g from public.retail_goods_receipts where id=lc.goods_receipt_id;if not found or not public.has_branch_access(g.branch_id) then raise exception 'GRN غير موجود أو غير مصرح';end if;
 if lc.status='posted' then return jsonb_build_object('ok',true,'already_posted',true,'posted_lines',(select count(*) from public.retail_inventory_value_adjustments_v1 where landed_cost_id=lc.id));end if;
 if lc.status<>'allocated' then raise exception 'يجب توزيع Landed Cost أولًا';end if;
 if not exists(select 1 from public.retail_landed_cost_allocations where landed_cost_id=lc.id and allocated_amount>0) then raise exception 'لا توجد توزيعات للترحيل';end if;
 emp:=public.current_employee_id();
 for r in select a.goods_receipt_item_id,a.allocated_amount,gi.product_id,gi.variant_id from public.retail_landed_cost_allocations a join public.retail_goods_receipt_items gi on gi.id=a.goods_receipt_item_id where a.landed_cost_id=lc.id and a.allocated_amount>0 order by a.id loop
   if r.variant_id is not null then
     if exists(select 1 from public.retail_variant_inventory_movements m where m.branch_id=g.branch_id and m.variant_id=r.variant_id and m.created_at>=g.received_at and (m.movement_type in('sale','supplier_return','transfer_out','waste','adjustment') or m.quantity_delta<0)) then raise exception 'لا يمكن ترحيل Landed Cost: توجد حركة خروج/تسوية بعد الاستلام للـVariant %',r.variant_id;end if;
     select * into vbal from public.retail_variant_inventory_balances where branch_id=g.branch_id and variant_id=r.variant_id for update;if not found or vbal.quantity<=0 then raise exception 'لا يوجد رصيد صالح للـVariant %',r.variant_id;end if;
     q:=vbal.quantity;oldavg:=coalesce(vbal.average_unit_cost,0);newavg:=round(oldavg+(r.allocated_amount/q),6);
     update public.retail_variant_inventory_balances set average_unit_cost=newavg,updated_at=now() where branch_id=g.branch_id and variant_id=r.variant_id;
   else
     if exists(select 1 from public.retail_inventory_movements m where m.branch_id=g.branch_id and m.product_id=r.product_id and m.created_at>=g.received_at and (m.movement_type in('sale','supplier_return','transfer_out','waste','adjustment') or m.quantity_delta<0)) then raise exception 'لا يمكن ترحيل Landed Cost: توجد حركة خروج/تسوية بعد الاستلام للصنف %',r.product_id;end if;
     select * into bal from public.retail_inventory_balances where branch_id=g.branch_id and product_id=r.product_id for update;if not found or bal.quantity<=0 then raise exception 'لا يوجد رصيد صالح للصنف %',r.product_id;end if;
     q:=bal.quantity;oldavg:=coalesce(bal.average_unit_cost,0);newavg:=round(oldavg+(r.allocated_amount/q),6);
     update public.retail_inventory_balances set average_unit_cost=newavg,updated_at=now() where branch_id=g.branch_id and product_id=r.product_id;
   end if;
   insert into public.retail_inventory_value_adjustments_v1(branch_id,product_id,variant_id,landed_cost_id,goods_receipt_item_id,amount,quantity_at_post,old_average_unit_cost,new_average_unit_cost,employee_id) values(g.branch_id,r.product_id,r.variant_id,lc.id,r.goods_receipt_item_id,r.allocated_amount,q,oldavg,newavg,emp) on conflict(landed_cost_id,goods_receipt_item_id) do nothing;
   posted:=posted+1;
 end loop;
 update public.retail_landed_costs set status='posted',updated_at=now() where id=lc.id;
 insert into public.retail_purchase_workflow_events(entity_type,entity_id,from_status,to_status,note,employee_id) values('landed_cost',lc.id,'allocated','posted','Safe inventory value adjustment posted',emp);
 return jsonb_build_object('ok',true,'already_posted',false,'posted_lines',posted,'landed_cost_id',lc.id);
end;$$;

revoke all on function public.retail_landed_cost_post_v1(bigint) from public;
grant execute on function public.retail_landed_cost_post_v1(bigint) to authenticated;
commit;
