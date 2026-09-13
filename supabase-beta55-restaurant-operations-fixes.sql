-- Sharawla POS 10.5.4-beta.55 — Restaurant Closure operation fixes
-- Apply after supabase-beta55-restaurant-operations.sql.
-- Keeps cancellation independent from purchase approval permission.

begin;

insert into public.permission_actions_v2(code,name_ar,domain,legacy_permission,active,sort_order)
values('food.purchasing.cancel','إلغاء أمر شراء خامات قبل الاستلام','food',null,true,745)
on conflict(code) do update
set name_ar=excluded.name_ar,
    domain=excluded.domain,
    legacy_permission=null,
    active=true,
    sort_order=excluded.sort_order;

create or replace function public.food_purchase_order_cancel_v1(
 p_purchase_id bigint,
 p_reason text
) returns bigint
language plpgsql security definer set search_path=public as $$
declare
 v_po public.purchases%rowtype;
 v_emp bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not public.has_action_permission_v2('food.purchasing.cancel') then raise exception 'ليس لديك صلاحية إلغاء أمر الشراء'; end if;
 select * into v_po from public.purchases where id=p_purchase_id for update;
 if not found then raise exception 'أمر الشراء غير موجود'; end if;
 if not public.has_branch_access(v_po.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 if v_po.status='cancelled' then return v_po.id; end if;
 if exists(select 1 from public.purchase_items where purchase_id=v_po.id and received_quantity>0) then
   raise exception 'لا يمكن إلغاء أمر شراء تم استلام جزء منه';
 end if;
 if v_po.status not in('draft','approved') then raise exception 'أمر الشراء غير قابل للإلغاء'; end if;
 v_emp:=public.current_employee_id();
 update public.purchases
 set status='cancelled',
     notes=concat_ws(E'\n',notes,nullif(trim(coalesce(p_reason,'')),'')),
     updated_at=now()
 where id=v_po.id;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(v_emp,v_po.branch_id,'food.purchasing.cancel','purchase',v_po.id,jsonb_build_object('reason',p_reason));
 return v_po.id;
end;$$;

revoke all on function public.food_purchase_order_cancel_v1(bigint,text) from public;
grant execute on function public.food_purchase_order_cancel_v1(bigint,text) to authenticated;

commit;
