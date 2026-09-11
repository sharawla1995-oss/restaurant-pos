-- Sharawla POS V10.5.4-beta.17 — Retail / Supermarket Core Completion
-- Apply ONLY to the isolated Beta operational backend first.
-- Additive design: Restaurant RPCs and tables are not replaced.

create table if not exists public.retail_product_settings(
  product_id bigint primary key references public.products(id) on delete cascade,
  unit_type text not null default 'piece' check(unit_type in('piece','kg','g','liter','ml')),
  allow_decimal boolean not null default false,
  qty_step numeric(14,3) not null default 1 check(qty_step>0),
  min_qty numeric(14,3) not null default 1 check(min_qty>0),
  barcode_mode text not null default 'normal' check(barcode_mode in('normal','weight','price')),
  weight_prefix text null,
  plu_code text null,
  embedded_divisor numeric(14,3) not null default 1000 check(embedded_divisor>0),
  online_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.retail_offers(
  id bigserial primary key,
  name text not null,
  rule_type text not null check(rule_type in('percent','fixed','buy_x_get_y','second_half')),
  value numeric(14,4) not null default 0,
  buy_qty numeric(14,3) null,
  get_qty numeric(14,3) null,
  priority integer not null default 100,
  starts_at timestamptz null,
  ends_at timestamptz null,
  branch_id bigint null references public.branches(id) on delete cascade,
  active boolean not null default true,
  website_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.retail_offer_products(
  offer_id bigint not null references public.retail_offers(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade,
  primary key(offer_id,product_id)
);

create table if not exists public.retail_suspended_sales(
  id bigserial primary key,
  branch_id bigint not null references public.branches(id) on delete cascade,
  employee_id bigint null references public.employees(id) on delete set null,
  label text null,
  cart jsonb not null,
  customer jsonb not null default '{}'::jsonb,
  financial jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.retail_stock_counts(
  id bigserial primary key,
  branch_id bigint not null references public.branches(id) on delete restrict,
  status text not null default 'draft' check(status in('draft','posted','cancelled')),
  notes text null,
  created_by_employee_id bigint null references public.employees(id),
  posted_by_employee_id bigint null references public.employees(id),
  created_at timestamptz not null default now(),
  posted_at timestamptz null
);

create table if not exists public.retail_stock_count_items(
  stock_count_id bigint not null references public.retail_stock_counts(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete restrict,
  system_qty numeric(14,3) not null,
  counted_qty numeric(14,3) not null,
  variance numeric(14,3) not null,
  primary key(stock_count_id,product_id)
);

create table if not exists public.retail_transfers(
  id bigserial primary key,
  from_branch_id bigint not null references public.branches(id) on delete restrict,
  to_branch_id bigint not null references public.branches(id) on delete restrict,
  status text not null default 'sent' check(status in('sent','received','cancelled')),
  notes text null,
  client_tx_id text not null unique,
  created_by_employee_id bigint null references public.employees(id),
  received_by_employee_id bigint null references public.employees(id),
  created_at timestamptz not null default now(),
  received_at timestamptz null,
  check(from_branch_id<>to_branch_id)
);

create table if not exists public.retail_transfer_items(
  transfer_id bigint not null references public.retail_transfers(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete restrict,
  quantity numeric(14,3) not null check(quantity>0),
  unit_cost numeric(14,4) not null default 0,
  primary key(transfer_id,product_id)
);

create table if not exists public.retail_stock_reservations(
  id bigserial primary key,
  branch_id bigint not null references public.branches(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade,
  quantity numeric(14,3) not null check(quantity>0),
  reservation_key text not null,
  status text not null default 'active' check(status in('active','consumed','released','expired')),
  expires_at timestamptz not null,
  website_order_id bigint null,
  created_at timestamptz not null default now(),
  unique(reservation_key,product_id)
);

create index if not exists retail_offer_active_idx on public.retail_offers(active,branch_id,priority);
create index if not exists retail_hold_branch_idx on public.retail_suspended_sales(branch_id,created_at desc);
create index if not exists retail_count_branch_idx on public.retail_stock_counts(branch_id,created_at desc);
create index if not exists retail_transfer_from_idx on public.retail_transfers(from_branch_id,created_at desc);
create index if not exists retail_transfer_to_idx on public.retail_transfers(to_branch_id,created_at desc);
create index if not exists retail_reservation_lookup_idx on public.retail_stock_reservations(branch_id,product_id,status,expires_at);

alter table public.retail_product_settings enable row level security;
alter table public.retail_offers enable row level security;
alter table public.retail_offer_products enable row level security;
alter table public.retail_suspended_sales enable row level security;
alter table public.retail_stock_counts enable row level security;
alter table public.retail_stock_count_items enable row level security;
alter table public.retail_transfers enable row level security;
alter table public.retail_transfer_items enable row level security;
alter table public.retail_stock_reservations enable row level security;

-- Read policies. Writes stay behind SECURITY DEFINER RPCs.
drop policy if exists retail_product_settings_select on public.retail_product_settings;
create policy retail_product_settings_select on public.retail_product_settings for select to authenticated using(true);
drop policy if exists retail_offers_select on public.retail_offers;
create policy retail_offers_select on public.retail_offers for select to authenticated using(true);
drop policy if exists retail_offer_products_select on public.retail_offer_products;
create policy retail_offer_products_select on public.retail_offer_products for select to authenticated using(true);
drop policy if exists retail_suspended_sales_select on public.retail_suspended_sales;
create policy retail_suspended_sales_select on public.retail_suspended_sales for select to authenticated using(public.has_branch_access(branch_id));
drop policy if exists retail_stock_counts_select on public.retail_stock_counts;
create policy retail_stock_counts_select on public.retail_stock_counts for select to authenticated using(public.has_branch_access(branch_id));
drop policy if exists retail_stock_count_items_select on public.retail_stock_count_items;
create policy retail_stock_count_items_select on public.retail_stock_count_items for select to authenticated using(exists(select 1 from public.retail_stock_counts c where c.id=stock_count_id and public.has_branch_access(c.branch_id)));
drop policy if exists retail_transfers_select on public.retail_transfers;
create policy retail_transfers_select on public.retail_transfers for select to authenticated using(public.has_branch_access(from_branch_id) or public.has_branch_access(to_branch_id));
drop policy if exists retail_transfer_items_select on public.retail_transfer_items;
create policy retail_transfer_items_select on public.retail_transfer_items for select to authenticated using(exists(select 1 from public.retail_transfers t where t.id=transfer_id and (public.has_branch_access(t.from_branch_id) or public.has_branch_access(t.to_branch_id))));

-- Public website stock catalog is exposed only through RPC, not direct table reads.
grant select on public.retail_product_settings,public.retail_offers,public.retail_offer_products,public.retail_suspended_sales,public.retail_stock_counts,public.retail_stock_count_items,public.retail_transfers,public.retail_transfer_items to authenticated;
revoke insert,update,delete on public.retail_product_settings,public.retail_offers,public.retail_offer_products,public.retail_suspended_sales,public.retail_stock_counts,public.retail_stock_count_items,public.retail_transfers,public.retail_transfer_items,public.retail_stock_reservations from authenticated;

create or replace function public.retail_set_product_settings(
 p_product_id bigint,p_unit_type text,p_allow_decimal boolean,p_qty_step numeric,p_min_qty numeric,
 p_barcode_mode text,p_weight_prefix text,p_plu_code text,p_embedded_divisor numeric,p_online_enabled boolean
) returns boolean language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية إعداد أصناف Retail'; end if;
 if p_unit_type not in('piece','kg','g','liter','ml') then raise exception 'وحدة غير صالحة'; end if;
 if p_barcode_mode not in('normal','weight','price') then raise exception 'نوع باركود غير صالح'; end if;
 insert into public.retail_product_settings(product_id,unit_type,allow_decimal,qty_step,min_qty,barcode_mode,weight_prefix,plu_code,embedded_divisor,online_enabled,updated_at)
 values(p_product_id,p_unit_type,coalesce(p_allow_decimal,false),greatest(round(coalesce(p_qty_step,1),3),0.001),greatest(round(coalesce(p_min_qty,1),3),0.001),p_barcode_mode,nullif(trim(coalesce(p_weight_prefix,'')),''),nullif(trim(coalesce(p_plu_code,'')),''),greatest(coalesce(p_embedded_divisor,1000),0.001),coalesce(p_online_enabled,true),now())
 on conflict(product_id) do update set unit_type=excluded.unit_type,allow_decimal=excluded.allow_decimal,qty_step=excluded.qty_step,min_qty=excluded.min_qty,barcode_mode=excluded.barcode_mode,weight_prefix=excluded.weight_prefix,plu_code=excluded.plu_code,embedded_divisor=excluded.embedded_divisor,online_enabled=excluded.online_enabled,updated_at=now();
 return true;
end $$;
revoke all on function public.retail_set_product_settings(bigint,text,boolean,numeric,numeric,text,text,text,numeric,boolean) from public;
grant execute on function public.retail_set_product_settings(bigint,text,boolean,numeric,numeric,text,text,text,numeric,boolean) to authenticated;

create or replace function public.retail_offer_save(
 p_id bigint,p_name text,p_rule_type text,p_value numeric,p_buy_qty numeric,p_get_qty numeric,p_priority integer,
 p_starts_at timestamptz,p_ends_at timestamptz,p_branch_id bigint,p_website_enabled boolean,p_product_ids bigint[]
) returns bigint language plpgsql security definer set search_path=public as $$
declare v_id bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية العروض'; end if;
 if p_branch_id is not null and not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 if p_rule_type not in('percent','fixed','buy_x_get_y','second_half') then raise exception 'نوع عرض غير صالح'; end if;
 if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'اسم العرض مطلوب'; end if;
 if p_id is null then
  insert into public.retail_offers(name,rule_type,value,buy_qty,get_qty,priority,starts_at,ends_at,branch_id,website_enabled)
  values(trim(p_name),p_rule_type,coalesce(p_value,0),p_buy_qty,p_get_qty,coalesce(p_priority,100),p_starts_at,p_ends_at,p_branch_id,coalesce(p_website_enabled,true)) returning id into v_id;
 else
  update public.retail_offers set name=trim(p_name),rule_type=p_rule_type,value=coalesce(p_value,0),buy_qty=p_buy_qty,get_qty=p_get_qty,priority=coalesce(p_priority,100),starts_at=p_starts_at,ends_at=p_ends_at,branch_id=p_branch_id,website_enabled=coalesce(p_website_enabled,true) where id=p_id returning id into v_id;
  if v_id is null then raise exception 'العرض غير موجود'; end if;
  delete from public.retail_offer_products where offer_id=v_id;
 end if;
 if coalesce(array_length(p_product_ids,1),0)>0 then insert into public.retail_offer_products(offer_id,product_id) select v_id,unnest(p_product_ids) on conflict do nothing; end if;
 return v_id;
end $$;
revoke all on function public.retail_offer_save(bigint,text,text,numeric,numeric,numeric,integer,timestamptz,timestamptz,bigint,boolean,bigint[]) from public;
grant execute on function public.retail_offer_save(bigint,text,text,numeric,numeric,numeric,integer,timestamptz,timestamptz,bigint,boolean,bigint[]) to authenticated;

create or replace function public.retail_suspend_sale(p_branch_id bigint,p_label text,p_cart jsonb,p_customer jsonb,p_financial jsonb)
returns bigint language plpgsql security definer set search_path=public as $$
declare v_id bigint;
begin
 if auth.uid() is null or not public.has_branch_access(p_branch_id) then raise exception 'غير مصرح'; end if;
 insert into public.retail_suspended_sales(branch_id,employee_id,label,cart,customer,financial)
 values(p_branch_id,public.current_employee_id(),nullif(trim(coalesce(p_label,'')),''),coalesce(p_cart,'[]'::jsonb),coalesce(p_customer,'{}'::jsonb),coalesce(p_financial,'{}'::jsonb)) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.retail_suspend_sale(bigint,text,jsonb,jsonb,jsonb) from public;
grant execute on function public.retail_suspend_sale(bigint,text,jsonb,jsonb,jsonb) to authenticated;

create or replace function public.retail_delete_suspended_sale(p_id bigint) returns boolean language plpgsql security definer set search_path=public as $$
declare v_branch bigint;
begin
 select branch_id into v_branch from public.retail_suspended_sales where id=p_id;
 if v_branch is null or not public.has_branch_access(v_branch) then raise exception 'غير مصرح'; end if;
 delete from public.retail_suspended_sales where id=p_id; return true;
end $$;
revoke all on function public.retail_delete_suspended_sale(bigint) from public;
grant execute on function public.retail_delete_suspended_sale(bigint) to authenticated;

create or replace function public.retail_post_stock_count(p_branch_id bigint,p_notes text,p_items jsonb)
returns bigint language plpgsql security definer set search_path=public as $$
declare v_id bigint; v_emp bigint; v record; v_bal public.retail_inventory_balances%rowtype; v_counted numeric(14,3); v_var numeric(14,3);
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية الجرد'; end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 v_emp:=public.current_employee_id();
 insert into public.retail_stock_counts(branch_id,status,notes,created_by_employee_id,posted_by_employee_id,posted_at) values(p_branch_id,'posted',nullif(trim(coalesce(p_notes,'')),''),v_emp,v_emp,now()) returning id into v_id;
 for v in select * from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) as x(product_id bigint,counted_qty numeric) loop
  insert into public.retail_inventory_balances(branch_id,product_id,quantity) values(p_branch_id,v.product_id,0) on conflict(branch_id,product_id) do nothing;
  select * into v_bal from public.retail_inventory_balances where branch_id=p_branch_id and product_id=v.product_id for update;
  v_counted:=round(coalesce(v.counted_qty,0),3); if v_counted<0 then raise exception 'كمية الجرد لا يمكن أن تكون سالبة'; end if;
  v_var:=round(v_counted-v_bal.quantity,3);
  insert into public.retail_stock_count_items(stock_count_id,product_id,system_qty,counted_qty,variance) values(v_id,v.product_id,v_bal.quantity,v_counted,v_var);
  if v_bal.track_inventory and v_var<>0 then
    update public.retail_inventory_balances set quantity=v_counted,updated_at=now() where branch_id=p_branch_id and product_id=v.product_id;
    insert into public.retail_inventory_movements(branch_id,product_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,employee_id,notes)
    values(p_branch_id,v.product_id,'adjustment',v_var,v_counted,v_bal.average_unit_cost,'stock_count',v_id::text,'stock-count:'||v_id||':'||v.product_id,v_emp,'جرد مخزون');
  end if;
 end loop; return v_id;
end $$;
revoke all on function public.retail_post_stock_count(bigint,text,jsonb) from public;
grant execute on function public.retail_post_stock_count(bigint,text,jsonb) to authenticated;

create or replace function public.retail_transfer_create(p_from_branch_id bigint,p_to_branch_id bigint,p_items jsonb,p_notes text,p_client_tx_id text)
returns bigint language plpgsql security definer set search_path=public as $$
declare v_id bigint; v_emp bigint; v record; v_bal public.retail_inventory_balances%rowtype; v_qty numeric(14,3); v_new numeric(14,3);
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية التحويلات'; end if;
 if p_from_branch_id=p_to_branch_id then raise exception 'اختر فرعين مختلفين'; end if;
 if not public.has_branch_access(p_from_branch_id) then raise exception 'ليس لديك صلاحية الفرع المصدر'; end if;
 perform pg_advisory_xact_lock(hashtextextended('retail-transfer:'||p_client_tx_id,0));
 select id into v_id from public.retail_transfers where client_tx_id=p_client_tx_id; if v_id is not null then return v_id; end if;
 v_emp:=public.current_employee_id();
 insert into public.retail_transfers(from_branch_id,to_branch_id,notes,client_tx_id,created_by_employee_id) values(p_from_branch_id,p_to_branch_id,nullif(trim(coalesce(p_notes,'')),''),p_client_tx_id,v_emp) returning id into v_id;
 for v in select * from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) as x(product_id bigint,quantity numeric) loop
  v_qty:=round(coalesce(v.quantity,0),3); if v_qty<=0 then raise exception 'كمية التحويل غير صحيحة'; end if;
  select * into v_bal from public.retail_inventory_balances where branch_id=p_from_branch_id and product_id=v.product_id for update;
  if not found or (v_bal.track_inventory and v_bal.quantity<v_qty) then raise exception 'المخزون غير كافٍ للصنف %',v.product_id; end if;
  v_new:=round(v_bal.quantity-v_qty,3);
  update public.retail_inventory_balances set quantity=v_new,updated_at=now() where branch_id=p_from_branch_id and product_id=v.product_id;
  insert into public.retail_transfer_items(transfer_id,product_id,quantity,unit_cost) values(v_id,v.product_id,v_qty,v_bal.average_unit_cost);
  insert into public.retail_inventory_movements(branch_id,product_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,employee_id)
  values(p_from_branch_id,v.product_id,'transfer_out',-v_qty,v_new,v_bal.average_unit_cost,'transfer',v_id::text,p_client_tx_id||':out:'||v.product_id,v_emp);
 end loop; return v_id;
end $$;
revoke all on function public.retail_transfer_create(bigint,bigint,jsonb,text,text) from public;
grant execute on function public.retail_transfer_create(bigint,bigint,jsonb,text,text) to authenticated;

create or replace function public.retail_transfer_receive(p_transfer_id bigint) returns bigint language plpgsql security definer set search_path=public as $$
declare v_t public.retail_transfers%rowtype; v_emp bigint; v record; v_bal public.retail_inventory_balances%rowtype; v_new numeric(14,3);
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 select * into v_t from public.retail_transfers where id=p_transfer_id for update;
 if not found then raise exception 'التحويل غير موجود'; end if;
 if not public.has_branch_access(v_t.to_branch_id) then raise exception 'ليس لديك صلاحية الفرع المستلم'; end if;
 if v_t.status='received' then return v_t.id; end if;
 if v_t.status<>'sent' then raise exception 'التحويل غير قابل للاستلام'; end if;
 v_emp:=public.current_employee_id();
 for v in select * from public.retail_transfer_items where transfer_id=v_t.id order by product_id loop
  insert into public.retail_inventory_balances(branch_id,product_id,quantity,average_unit_cost,last_purchase_cost) values(v_t.to_branch_id,v.product_id,0,v.unit_cost,v.unit_cost) on conflict(branch_id,product_id) do nothing;
  select * into v_bal from public.retail_inventory_balances where branch_id=v_t.to_branch_id and product_id=v.product_id for update;
  v_new:=round(v_bal.quantity+v.quantity,3);
  update public.retail_inventory_balances set quantity=v_new,average_unit_cost=case when v_new>0 then round(((v_bal.quantity*v_bal.average_unit_cost)+(v.quantity*v.unit_cost))/v_new,4) else v.unit_cost end,updated_at=now() where branch_id=v_t.to_branch_id and product_id=v.product_id;
  insert into public.retail_inventory_movements(branch_id,product_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,client_tx_id,employee_id)
  values(v_t.to_branch_id,v.product_id,'transfer_in',v.quantity,v_new,v.unit_cost,'transfer',v_t.id::text,v_t.client_tx_id||':in:'||v.product_id,v_emp);
 end loop;
 update public.retail_transfers set status='received',received_by_employee_id=v_emp,received_at=now() where id=v_t.id; return v_t.id;
end $$;
revoke all on function public.retail_transfer_receive(bigint) from public;
grant execute on function public.retail_transfer_receive(bigint) to authenticated;

create or replace function public.retail_catalog(p_branch_id bigint)
returns table(product_id bigint,name text,barcode text,price numeric,unit_type text,allow_decimal boolean,qty_step numeric,available_qty numeric,online_enabled boolean)
language sql security definer set search_path=public stable as $$
 select p.id,p.name,p.barcode,coalesce(bp.price_override,p.price)::numeric,
        coalesce(ps.unit_type,'piece'),coalesce(ps.allow_decimal,false),coalesce(ps.qty_step,1),
        greatest(0,coalesce(b.quantity,0)-coalesce((select sum(r.quantity) from public.retail_stock_reservations r where r.branch_id=p_branch_id and r.product_id=p.id and r.status='active' and r.expires_at>now()),0))::numeric,
        coalesce(ps.online_enabled,true)
 from public.products p
 join public.branch_products bp on bp.product_id=p.id and bp.branch_id=p_branch_id and bp.active=true
 left join public.retail_product_settings ps on ps.product_id=p.id
 left join public.retail_inventory_balances b on b.product_id=p.id and b.branch_id=p_branch_id
 where p.active=true and coalesce(p.website_visible,true)=true and coalesce(ps.online_enabled,true)=true
 order by p.name;
$$;
revoke all on function public.retail_catalog(bigint) from public;
grant execute on function public.retail_catalog(bigint) to anon,authenticated;

create or replace function public.retail_reserve_stock(p_branch_id bigint,p_reservation_key text,p_items jsonb,p_minutes integer default 10)
returns boolean language plpgsql security definer set search_path=public as $$
declare v record; v_bal numeric; v_reserved numeric; v_qty numeric(14,3);
begin
 if nullif(trim(coalesce(p_reservation_key,'')),'') is null then raise exception 'reservation key required'; end if;
 update public.retail_stock_reservations set status='expired' where status='active' and expires_at<=now();
 for v in select * from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) as x(product_id bigint,quantity numeric) loop
  v_qty:=round(coalesce(v.quantity,0),3); if v_qty<=0 then raise exception 'كمية غير صحيحة'; end if;
  select quantity into v_bal from public.retail_inventory_balances where branch_id=p_branch_id and product_id=v.product_id for update;
  select coalesce(sum(quantity),0) into v_reserved from public.retail_stock_reservations where branch_id=p_branch_id and product_id=v.product_id and status='active' and expires_at>now() and reservation_key<>p_reservation_key;
  if coalesce(v_bal,0)-v_reserved<v_qty then raise exception 'المخزون غير كافٍ للصنف %',v.product_id; end if;
  insert into public.retail_stock_reservations(branch_id,product_id,quantity,reservation_key,status,expires_at) values(p_branch_id,v.product_id,v_qty,p_reservation_key,'active',now()+make_interval(mins=>greatest(1,least(coalesce(p_minutes,10),60)))) on conflict(reservation_key,product_id) do update set quantity=excluded.quantity,status='active',expires_at=excluded.expires_at;
 end loop; return true;
end $$;
revoke all on function public.retail_reserve_stock(bigint,text,jsonb,integer) from public;
grant execute on function public.retail_reserve_stock(bigint,text,jsonb,integer) to anon,authenticated;

notify pgrst,'reload schema';
