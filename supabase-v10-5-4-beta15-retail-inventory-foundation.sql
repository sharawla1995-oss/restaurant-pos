-- Sharawla POS V10.5.4-beta.15 — Retail Inventory Foundation
-- Beta-only migration. Designed to coexist with the existing Restaurant schema.
-- Does NOT replace create_pos_order_atomic/create_order_return_idempotent.

create table if not exists public.retail_inventory_settings (
  branch_id bigint primary key references public.branches(id) on delete cascade,
  allow_negative_stock boolean not null default false,
  default_low_stock_threshold numeric(14,3) not null default 0,
  updated_at timestamptz not null default now(),
  updated_by_employee_id bigint null references public.employees(id)
);

create table if not exists public.retail_inventory_balances (
  branch_id bigint not null references public.branches(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade,
  quantity numeric(14,3) not null default 0,
  low_stock_threshold numeric(14,3) null,
  track_inventory boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key(branch_id,product_id)
);

create table if not exists public.retail_inventory_movements (
  id bigserial primary key,
  branch_id bigint not null references public.branches(id) on delete restrict,
  product_id bigint not null references public.products(id) on delete restrict,
  movement_type text not null check (movement_type in ('opening','sale','return','adjustment','waste','purchase','supplier_return','transfer_out','transfer_in')),
  quantity_delta numeric(14,3) not null check (quantity_delta <> 0),
  balance_after numeric(14,3) not null,
  unit_cost numeric(14,4) null,
  reference_type text null,
  reference_id text null,
  client_tx_id text null,
  notes text null,
  employee_id bigint null references public.employees(id),
  created_at timestamptz not null default now()
);

create index if not exists retail_inventory_movements_branch_created_idx
  on public.retail_inventory_movements(branch_id,created_at desc);
create index if not exists retail_inventory_movements_product_created_idx
  on public.retail_inventory_movements(product_id,created_at desc);
create unique index if not exists retail_inventory_movements_client_product_type_uidx
  on public.retail_inventory_movements(client_tx_id,product_id,movement_type)
  where client_tx_id is not null;

alter table public.retail_inventory_settings enable row level security;
alter table public.retail_inventory_balances enable row level security;
alter table public.retail_inventory_movements enable row level security;

drop policy if exists retail_inventory_settings_select on public.retail_inventory_settings;
create policy retail_inventory_settings_select on public.retail_inventory_settings for select to authenticated
using (public.has_branch_access(branch_id));

drop policy if exists retail_inventory_balances_select on public.retail_inventory_balances;
create policy retail_inventory_balances_select on public.retail_inventory_balances for select to authenticated
using (public.has_branch_access(branch_id));

drop policy if exists retail_inventory_movements_select on public.retail_inventory_movements;
create policy retail_inventory_movements_select on public.retail_inventory_movements for select to authenticated
using (public.has_branch_access(branch_id));

-- All writes are intentionally routed through SECURITY DEFINER RPCs below.
revoke insert,update,delete on public.retail_inventory_settings from authenticated;
revoke insert,update,delete on public.retail_inventory_balances from authenticated;
revoke insert,update,delete on public.retail_inventory_movements from authenticated;
grant select on public.retail_inventory_settings,public.retail_inventory_balances,public.retail_inventory_movements to authenticated;

create or replace function public.retail_inventory_adjust(
  p_branch_id bigint,
  p_product_id bigint,
  p_quantity_delta numeric,
  p_movement_type text,
  p_notes text,
  p_client_tx_id text
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_emp bigint;
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_type text:=lower(trim(coalesce(p_movement_type,'')));
  v_delta numeric(14,3):=round(coalesce(p_quantity_delta,0)::numeric,3);
  v_balance public.retail_inventory_balances%rowtype;
  v_existing public.retail_inventory_movements%rowtype;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية إدارة المخزون'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  if v_type not in ('opening','adjustment','waste') then raise exception 'نوع حركة المخزون غير مسموح'; end if;
  if v_delta=0 then raise exception 'كمية الحركة لا يمكن أن تكون صفر'; end if;
  if v_type='waste' and v_delta>0 then v_delta:=-v_delta; end if;
  if not exists(select 1 from public.products where id=p_product_id and active is distinct from false) then raise exception 'الصنف غير موجود أو غير نشط'; end if;
  v_emp:=public.current_employee_id();
  perform pg_advisory_xact_lock(hashtextextended(v_key,0));
  select * into v_existing from public.retail_inventory_movements where client_tx_id=v_key and product_id=p_product_id and movement_type=v_type limit 1;
  if found then return to_jsonb(v_existing); end if;
  insert into public.retail_inventory_balances(branch_id,product_id,quantity)
    values(p_branch_id,p_product_id,0) on conflict(branch_id,product_id) do nothing;
  select * into v_balance from public.retail_inventory_balances where branch_id=p_branch_id and product_id=p_product_id for update;
  update public.retail_inventory_balances set quantity=round(quantity+v_delta,3),updated_at=now()
   where branch_id=p_branch_id and product_id=p_product_id returning * into v_balance;
  insert into public.retail_inventory_movements(branch_id,product_id,movement_type,quantity_delta,balance_after,reference_type,reference_id,client_tx_id,notes,employee_id)
   values(p_branch_id,p_product_id,v_type,v_delta,v_balance.quantity,'manual',v_key,v_key,nullif(trim(coalesce(p_notes,'')),''),v_emp)
   returning * into v_existing;
  return to_jsonb(v_existing);
end; $$;
revoke all on function public.retail_inventory_adjust(bigint,bigint,numeric,text,text,text) from public;
grant execute on function public.retail_inventory_adjust(bigint,bigint,numeric,text,text,text) to authenticated;

create or replace function public.retail_inventory_set_policy(
  p_branch_id bigint,
  p_allow_negative_stock boolean,
  p_default_low_stock_threshold numeric
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_emp bigint; v_row public.retail_inventory_settings%rowtype;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not public.is_admin() then raise exception 'إعدادات المخزون للمدير فقط'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  v_emp:=public.current_employee_id();
  insert into public.retail_inventory_settings(branch_id,allow_negative_stock,default_low_stock_threshold,updated_at,updated_by_employee_id)
  values(p_branch_id,coalesce(p_allow_negative_stock,false),greatest(0,round(coalesce(p_default_low_stock_threshold,0)::numeric,3)),now(),v_emp)
  on conflict(branch_id) do update set allow_negative_stock=excluded.allow_negative_stock,default_low_stock_threshold=excluded.default_low_stock_threshold,updated_at=now(),updated_by_employee_id=v_emp
  returning * into v_row;
  return to_jsonb(v_row);
end; $$;
revoke all on function public.retail_inventory_set_policy(bigint,boolean,numeric) from public;
grant execute on function public.retail_inventory_set_policy(bigint,boolean,numeric) to authenticated;

create or replace function public.retail_inventory_set_item_policy(
  p_branch_id bigint,
  p_product_id bigint,
  p_track_inventory boolean,
  p_low_stock_threshold numeric
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_row public.retail_inventory_balances%rowtype;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية إدارة المخزون'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  insert into public.retail_inventory_balances(branch_id,product_id,quantity,track_inventory,low_stock_threshold)
  values(p_branch_id,p_product_id,0,coalesce(p_track_inventory,true),case when p_low_stock_threshold is null then null else greatest(0,round(p_low_stock_threshold::numeric,3)) end)
  on conflict(branch_id,product_id) do update set track_inventory=excluded.track_inventory,low_stock_threshold=excluded.low_stock_threshold,updated_at=now()
  returning * into v_row;
  return to_jsonb(v_row);
end; $$;
revoke all on function public.retail_inventory_set_item_policy(bigint,bigint,boolean,numeric) from public;
grant execute on function public.retail_inventory_set_item_policy(bigint,bigint,boolean,numeric) to authenticated;

create or replace function public.create_retail_pos_order_atomic(
  p_order jsonb,
  p_items jsonb,
  p_payments jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_branch bigint:=nullif(p_order->>'branch_id','')::bigint;
  v_client_tx_id text:=nullif(trim(coalesce(p_order->>'client_tx_id','')),'');
  v_emp bigint;
  v_allow_negative boolean:=false;
  v_result jsonb;
  v_existing_order_id bigint;
  v_row record;
  v_balance public.retail_inventory_balances%rowtype;
  v_new_balance numeric(14,3);
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if v_client_tx_id is null then raise exception 'معرف الحركة مطلوب'; end if;
  if v_branch is null or not public.has_branch_access(v_branch) then raise exception 'ليس لديك صلاحية على هذا الفرع'; end if;
  v_emp:=public.current_employee_id();

  perform pg_advisory_xact_lock(hashtextextended('retail-sale:'||v_client_tx_id,0));
  select id into v_existing_order_id from public.orders where client_tx_id=v_client_tx_id limit 1;
  if v_existing_order_id is not null then
    return public.create_pos_order_atomic(p_order,p_items,p_payments);
  end if;

  select coalesce(allow_negative_stock,false) into v_allow_negative from public.retail_inventory_settings where branch_id=v_branch;
  if not found then v_allow_negative:=false; end if;

  -- Lock and validate every tracked product before creating the invoice.
  for v_row in
    select nullif(x->>'product_id','')::bigint product_id,
           round(sum(coalesce((x->>'quantity')::numeric,0)),3) qty
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
    where nullif(x->>'product_id','') is not null
    group by nullif(x->>'product_id','')::bigint
    order by nullif(x->>'product_id','')::bigint
  loop
    insert into public.retail_inventory_balances(branch_id,product_id,quantity)
      values(v_branch,v_row.product_id,0) on conflict(branch_id,product_id) do nothing;
    select * into v_balance from public.retail_inventory_balances where branch_id=v_branch and product_id=v_row.product_id for update;
    if v_balance.track_inventory and not v_allow_negative and v_balance.quantity < v_row.qty then
      raise exception 'المخزون غير كافٍ للصنف % — المتاح %', v_row.product_id, v_balance.quantity;
    end if;
  end loop;

  -- Existing proven checkout remains the source of truth for invoice/payment creation.
  -- Because this call is inside the same outer transaction, any inventory failure rolls the sale back too.
  v_result:=public.create_pos_order_atomic(p_order,p_items,p_payments);

  for v_row in
    select nullif(x->>'product_id','')::bigint product_id,
           round(sum(coalesce((x->>'quantity')::numeric,0)),3) qty,
           round(sum(coalesce((x->>'cost')::numeric,0)*coalesce((x->>'quantity')::numeric,0))/nullif(sum(coalesce((x->>'quantity')::numeric,0)),0),4) unit_cost
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
    where nullif(x->>'product_id','') is not null
    group by nullif(x->>'product_id','')::bigint
    order by nullif(x->>'product_id','')::bigint
  loop
    select * into v_balance from public.retail_inventory_balances where branch_id=v_branch and product_id=v_row.product_id for update;
    if not v_balance.track_inventory then continue; end if;
    v_new_balance:=round(v_balance.quantity-v_row.qty,3);
    update public.retail_inventory_balances set quantity=v_new_balance,updated_at=now() where branch_id=v_branch and product_id=v_row.product_id;
    insert into public.retail_inventory_movements(branch_id,product_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,employee_id)
      values(v_branch,v_row.product_id,'sale',-v_row.qty,v_new_balance,v_row.unit_cost,'order',v_result->'order'->>'id',v_client_tx_id,v_emp);
  end loop;
  return v_result;
end; $$;
revoke all on function public.create_retail_pos_order_atomic(jsonb,jsonb,jsonb) from public;
grant execute on function public.create_retail_pos_order_atomic(jsonb,jsonb,jsonb) to authenticated;

create or replace function public.create_retail_order_return_idempotent(
  p_order_id bigint,
  p_reason text,
  p_notes text,
  p_items jsonb,
  p_payments jsonb,
  p_client_tx_id text
) returns bigint
language plpgsql security definer set search_path=public as $$
declare
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_existing bigint;
  v_return_id bigint;
  v_branch bigint;
  v_emp bigint;
  v_row record;
  v_balance public.retail_inventory_balances%rowtype;
  v_new_balance numeric(14,3);
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  perform pg_advisory_xact_lock(hashtextextended('retail-return:'||v_key,0));
  select id into v_existing from public.returns where client_tx_id=v_key limit 1;
  if v_existing is not null then return v_existing; end if;

  select branch_id into v_branch from public.orders where id=p_order_id;
  if v_branch is null then raise exception 'الفاتورة غير موجودة'; end if;
  if not public.has_branch_access(v_branch) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  v_emp:=public.current_employee_id();

  v_return_id:=public.create_order_return_idempotent(p_order_id,p_reason,p_notes,p_items,p_payments,v_key);

  for v_row in
    select oi.product_id, round(sum(coalesce((x->>'quantity')::numeric,0)),3) qty,
           round(avg(coalesce(oi.cost,0)),4) unit_cost
      from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
      join public.order_items oi on oi.id=nullif(x->>'order_item_id','')::bigint and oi.order_id=p_order_id
     where oi.product_id is not null
     group by oi.product_id
     order by oi.product_id
  loop
    insert into public.retail_inventory_balances(branch_id,product_id,quantity)
      values(v_branch,v_row.product_id,0) on conflict(branch_id,product_id) do nothing;
    select * into v_balance from public.retail_inventory_balances where branch_id=v_branch and product_id=v_row.product_id for update;
    if not v_balance.track_inventory then continue; end if;
    v_new_balance:=round(v_balance.quantity+v_row.qty,3);
    update public.retail_inventory_balances set quantity=v_new_balance,updated_at=now() where branch_id=v_branch and product_id=v_row.product_id;
    insert into public.retail_inventory_movements(branch_id,product_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,employee_id)
      values(v_branch,v_row.product_id,'return',v_row.qty,v_new_balance,v_row.unit_cost,'return',v_return_id::text,v_key,v_emp);
  end loop;
  return v_return_id;
end; $$;
revoke all on function public.create_retail_order_return_idempotent(bigint,text,text,jsonb,jsonb,text) from public;
grant execute on function public.create_retail_order_return_idempotent(bigint,text,text,jsonb,jsonb,text) to authenticated;

notify pgrst,'reload schema';
