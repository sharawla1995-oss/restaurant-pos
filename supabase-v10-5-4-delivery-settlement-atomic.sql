-- Sharawla POS 10.5.4 Production Maintenance
-- Atomic/idempotent delivery cash settlement. Additive only; existing rows remain valid.
begin;

alter table public.driver_settlements
  add column if not exists client_tx_id text,
  add column if not exists request_digest text,
  add column if not exists order_ids bigint[];

create unique index if not exists driver_settlements_client_tx_uidx
  on public.driver_settlements(client_tx_id)
  where client_tx_id is not null;

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
  if not public.is_admin() then
    raise exception 'التسوية متاحة للمدير فقط';
  end if;

  v_employee_id := public.current_employee_id();
  if v_employee_id is null then
    raise exception 'المستخدم غير مربوط بموظف';
  end if;

  if p_branch_id is null or p_driver_id is null then
    raise exception 'الفرع والمندوب مطلوبان';
  end if;

  if not public.has_branch_access(p_branch_id) then
    raise exception 'ليس لديك صلاحية لهذا الفرع';
  end if;

  if nullif(btrim(coalesce(p_client_tx_id,'')),'') is null then
    raise exception 'client_tx_id مطلوب';
  end if;

  -- Serialize identical client transactions before checking the durable receipt.
  -- This makes concurrent exact replays return the same settlement instead of
  -- racing into the already-settled order guard.
  perform pg_advisory_xact_lock(
    hashtextextended('settle_driver_orders_v1:' || btrim(p_client_tx_id), 0)
  );

  select coalesce(array_agg(x order by x),'{}'::bigint[])
    into v_order_ids
  from (
    select distinct unnest(coalesce(p_order_ids,'{}'::bigint[])) as x
  ) q;

  if coalesce(cardinality(v_order_ids),0)=0 then
    raise exception 'لا توجد طلبات للتسوية';
  end if;

  v_digest := md5(
    jsonb_build_object(
      'branch_id',p_branch_id,
      'driver_id',p_driver_id,
      'order_ids',to_jsonb(v_order_ids)
    )::text
  );

  select *
    into v_existing
  from public.driver_settlements
  where client_tx_id=p_client_tx_id
  limit 1;

  if found then
    if coalesce(v_existing.request_digest,'')<>v_digest then
      raise exception 'client_tx_id مستخدم ببيانات مختلفة';
    end if;
    return v_existing.id;
  end if;

  -- Serialize the selected orders before validation and mutation.
  perform 1
  from public.orders
  where id=any(v_order_ids)
  order by id
  for update;

  select count(*),coalesce(sum(total),0)
    into v_count,v_amount
  from public.orders
  where id=any(v_order_ids);

  if v_count<>cardinality(v_order_ids) then
    raise exception 'بعض الطلبات غير موجودة';
  end if;

  if exists(
    select 1
    from public.orders o
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
    select 1
    from public.orders o
    where o.id=any(v_order_ids)
      and o.driver_settled_at is not null
  ) then
    raise exception 'يوجد طلب تمت تسويته بالفعل';
  end if;

  insert into public.driver_settlements(
    driver_id,branch_id,employee_id,orders_count,amount,created_at,
    client_tx_id,request_digest,order_ids
  )
  values(
    p_driver_id,p_branch_id,v_employee_id,cardinality(v_order_ids),v_amount,v_now,
    p_client_tx_id,v_digest,v_order_ids
  )
  returning id into v_settlement_id;

  update public.orders
  set driver_settled_at=v_now
  where id=any(v_order_ids)
    and driver_settled_at is null;

  if not found then
    raise exception 'تعذر إتمام التسوية';
  end if;

  return v_settlement_id;
exception
  when unique_violation then
    select * into v_existing
    from public.driver_settlements
    where client_tx_id=p_client_tx_id
    limit 1;
    if found and coalesce(v_existing.request_digest,'')=v_digest then
      return v_existing.id;
    end if;
    raise;
end;
$$;

revoke all on function public.settle_driver_orders_v1(bigint,bigint,bigint[],text) from public;
revoke all on function public.settle_driver_orders_v1(bigint,bigint,bigint[],text) from anon;
grant execute on function public.settle_driver_orders_v1(bigint,bigint,bigint[],text) to authenticated;

notify pgrst, 'reload schema';
commit;
