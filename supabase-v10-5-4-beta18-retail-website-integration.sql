-- Sharawla POS V10.5.4-beta.18 candidate — Retail Website Integration Foundation
-- BETA ONLY. Apply only to the isolated Retail beta operational backend first.
-- Additive / isolated from Restaurant website staging.
-- Design goals:
--   * Public website never writes orders/inventory tables directly.
--   * Prices, offers, delivery fee and stock are revalidated server-side.
--   * Pending website order reserves stock for a short TTL.
--   * Authenticated POS acceptance converts the staged order through
--     create_retail_pos_order_atomic(), preserving the proven Retail ledger.
--   * Idempotency prevents duplicate website submissions and duplicate acceptance.
--   * Restaurant website_orders / accept_website_order are not changed.

begin;

-- ============================================================================
-- Retail-specific website staging
-- ============================================================================
create table if not exists public.retail_website_orders(
  id bigserial primary key,
  public_order_code text unique,
  branch_id bigint not null references public.branches(id) on delete restrict,
  idempotency_key text not null unique,
  reservation_key text not null unique,
  customer_name text not null,
  customer_phone text not null,
  customer_address text null,
  customer_notes text null,
  order_type text not null default 'pickup' check(order_type in ('pickup','delivery')),
  delivery_zone_id bigint null references public.delivery_zones(id) on delete set null,
  payment_method_code text not null default 'cash',
  payment_status text not null default 'unpaid' check(payment_status in ('unpaid','proof_submitted','confirmed','rejected')),
  payment_reference text null,
  subtotal numeric(14,2) not null default 0,
  offer_discount numeric(14,2) not null default 0,
  delivery_fee numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  status text not null default 'pending' check(status in ('pending','accepted','rejected','cancelled','expired')),
  reservation_expires_at timestamptz not null,
  accepted_order_id bigint null references public.orders(id) on delete set null,
  accepted_by_employee_id bigint null references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz null,
  rejected_at timestamptz null,
  cancelled_at timestamptz null,
  updated_at timestamptz not null default now()
);

create table if not exists public.retail_website_order_items(
  id bigserial primary key,
  retail_website_order_id bigint not null references public.retail_website_orders(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete restrict,
  product_name text not null,
  unit_type text not null default 'piece',
  quantity numeric(14,3) not null check(quantity > 0),
  unit_price numeric(14,4) not null check(unit_price >= 0),
  unit_cost_snapshot numeric(14,4) not null default 0,
  line_subtotal numeric(14,2) not null check(line_subtotal >= 0),
  offer_discount numeric(14,2) not null default 0 check(offer_discount >= 0),
  line_total numeric(14,2) not null check(line_total >= 0),
  notes text null,
  created_at timestamptz not null default now(),
  unique(retail_website_order_id,product_id)
);

create index if not exists retail_web_orders_branch_status_idx
  on public.retail_website_orders(branch_id,status,created_at desc);
create index if not exists retail_web_orders_phone_idx
  on public.retail_website_orders(branch_id,customer_phone,created_at desc);
create index if not exists retail_web_orders_accept_idx
  on public.retail_website_orders(accepted_order_id) where accepted_order_id is not null;
create index if not exists retail_web_items_order_idx
  on public.retail_website_order_items(retail_website_order_id,id);

alter table public.retail_website_orders enable row level security;
alter table public.retail_website_order_items enable row level security;

-- Staff can read staged Retail web orders for branches they are allowed to operate.
-- Public/anon gets no table policy; public access is RPC-only.
drop policy if exists retail_website_orders_staff_select on public.retail_website_orders;
create policy retail_website_orders_staff_select
on public.retail_website_orders for select to authenticated
using(public.has_branch_access(branch_id));

drop policy if exists retail_website_order_items_staff_select on public.retail_website_order_items;
create policy retail_website_order_items_staff_select
on public.retail_website_order_items for select to authenticated
using(exists(
  select 1 from public.retail_website_orders w
  where w.id=retail_website_order_id and public.has_branch_access(w.branch_id)
));

grant select on public.retail_website_orders,public.retail_website_order_items to authenticated;
revoke insert,update,delete on public.retail_website_orders,public.retail_website_order_items from anon,authenticated;

-- ============================================================================
-- Helpers: normalization, schedule and website offer pricing
-- ============================================================================
create or replace function public.retail_website_normalize_phone(p_phone text)
returns text
language sql immutable
as $$
  select regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')
$$;
revoke all on function public.retail_website_normalize_phone(text) from public;

create or replace function public.retail_website_branch_open(p_branch_id bigint)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_branch public.branches%rowtype;
  v_settings public.branch_website_settings%rowtype;
  v_tz text := 'Africa/Cairo';
  v_local timestamp;
  v_dow integer;
  v_now_time time;
  v_today public.branch_website_hours%rowtype;
  v_prev public.branch_website_hours%rowtype;
begin
  select * into v_branch from public.branches where id=p_branch_id;
  if not found or v_branch.active is not true or coalesce(v_branch.website_visible,true) is not true then
    return false;
  end if;

  select * into v_settings from public.branch_website_settings where branch_id=p_branch_id;
  if found then
    if v_settings.orders_open is false then return false; end if;
    if v_settings.orders_paused_until is not null and v_settings.orders_paused_until>now() then return false; end if;
    if coalesce(v_settings.schedule_enabled,false) is false then return true; end if;
    v_tz:=coalesce(nullif(v_settings.schedule_timezone,''),'Africa/Cairo');
  else
    return true;
  end if;

  v_local:=now() at time zone v_tz;
  v_dow:=extract(dow from v_local)::integer;
  v_now_time:=v_local::time;

  select * into v_today from public.branch_website_hours
   where branch_id=p_branch_id and day_of_week=v_dow;
  select * into v_prev from public.branch_website_hours
   where branch_id=p_branch_id and day_of_week=((v_dow+6)%7);

  if found and v_today.enabled then
    -- equal open/close means 24 hours, matching the POS weekly-hours behavior.
    if v_today.open_time=v_today.close_time then return true; end if;
    if v_today.open_time<v_today.close_time and v_now_time>=v_today.open_time and v_now_time<v_today.close_time then return true; end if;
    if v_today.open_time>v_today.close_time and v_now_time>=v_today.open_time then return true; end if;
  end if;

  -- Overnight carry from previous day.
  if v_prev.enabled and v_prev.open_time>v_prev.close_time and v_now_time<v_prev.close_time then
    return true;
  end if;
  return false;
exception when undefined_table then
  -- Older Retail beta backends may not have weekly-hours tables yet.
  -- Branch active/visible remains the safe compatibility rule.
  return true;
end $$;
revoke all on function public.retail_website_branch_open(bigint) from public;
grant execute on function public.retail_website_branch_open(bigint) to anon,authenticated;

create or replace function public.retail_website_offer_discount(
  p_branch_id bigint,
  p_product_id bigint,
  p_quantity numeric,
  p_unit_price numeric
) returns numeric
language plpgsql
security definer
set search_path=public
as $$
declare
  v_offer public.retail_offers%rowtype;
  v_qty numeric(14,3):=round(greatest(coalesce(p_quantity,0),0),3);
  v_price numeric(14,4):=greatest(coalesce(p_unit_price,0),0);
  v_discount numeric(14,4):=0;
  v_sets numeric;
begin
  select o.* into v_offer
  from public.retail_offers o
  where o.active=true
    and o.website_enabled=true
    and (o.branch_id is null or o.branch_id=p_branch_id)
    and (o.starts_at is null or o.starts_at<=now())
    and (o.ends_at is null or o.ends_at>=now())
    and (
      not exists(select 1 from public.retail_offer_products op0 where op0.offer_id=o.id)
      or exists(select 1 from public.retail_offer_products op where op.offer_id=o.id and op.product_id=p_product_id)
    )
  order by o.priority asc,o.id asc
  limit 1;

  if not found then return 0; end if;

  if v_offer.rule_type='percent' then
    v_discount:=v_price*v_qty*greatest(0,least(100,coalesce(v_offer.value,0)))/100;
  elsif v_offer.rule_type='fixed' then
    v_discount:=least(v_price*v_qty,greatest(0,coalesce(v_offer.value,0))*v_qty);
  elsif v_offer.rule_type='second_half' then
    v_discount:=floor(v_qty/2)*v_price*0.5;
  elsif v_offer.rule_type='buy_x_get_y' then
    if coalesce(v_offer.buy_qty,0)>0 and coalesce(v_offer.get_qty,0)>0 then
      v_sets:=floor(v_qty/(v_offer.buy_qty+v_offer.get_qty));
      v_discount:=v_sets*v_offer.get_qty*v_price;
    end if;
  end if;

  return round(greatest(0,least(v_discount,v_price*v_qty)),2);
end $$;
revoke all on function public.retail_website_offer_discount(bigint,bigint,numeric,numeric) from public;

-- ============================================================================
-- Public catalog: keep the existing beta.17 RPC as the only public catalog
-- surface. No direct table grants are added here.
-- ============================================================================

-- The old beta.17 reservation endpoint exposed reservation creation directly.
-- For the production-shaped flow, reservation is now created only as part of an
-- idempotent website order. This reduces anonymous stock-hoarding surface.
revoke execute on function public.retail_reserve_stock(bigint,text,jsonb,integer) from anon;

-- ============================================================================
-- Public website order creation
-- ============================================================================
create or replace function public.retail_create_website_order(
  p_branch_id bigint,
  p_idempotency_key text,
  p_reservation_key text,
  p_customer_name text,
  p_customer_phone text,
  p_order_type text,
  p_delivery_zone_id bigint,
  p_customer_address text,
  p_customer_notes text,
  p_payment_method_code text,
  p_payment_reference text,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_idem text:=nullif(trim(coalesce(p_idempotency_key,'')),'');
  v_res_key text:=nullif(trim(coalesce(p_reservation_key,'')),'');
  v_phone text:=public.retail_website_normalize_phone(p_customer_phone);
  v_type text:=lower(coalesce(nullif(trim(p_order_type),''),'pickup'));
  v_pay text:=lower(coalesce(nullif(trim(p_payment_method_code),''),'cash'));
  v_existing public.retail_website_orders%rowtype;
  v_order public.retail_website_orders%rowtype;
  v_row record;
  v_product public.products%rowtype;
  v_ps public.retail_product_settings%rowtype;
  v_balance public.retail_inventory_balances%rowtype;
  v_bp public.branch_products%rowtype;
  v_qty numeric(14,3);
  v_price numeric(14,4);
  v_line numeric(14,2);
  v_offer numeric(14,2);
  v_available numeric(14,3);
  v_reserved numeric(14,3);
  v_subtotal numeric(14,2):=0;
  v_discount numeric(14,2):=0;
  v_delivery numeric(14,2):=0;
  v_total numeric(14,2):=0;
  v_expiry timestamptz:=now()+interval '15 minutes';
  v_items jsonb:='[]'::jsonb;
begin
  if v_idem is null or length(v_idem)<8 or length(v_idem)>160 then raise exception 'معرف الطلب غير صالح'; end if;
  if v_res_key is null or length(v_res_key)<8 or length(v_res_key)>160 then raise exception 'معرف الحجز غير صالح'; end if;
  if nullif(trim(coalesce(p_customer_name,'')),'') is null then raise exception 'اسم العميل مطلوب'; end if;
  if length(v_phone)<10 or length(v_phone)>15 then raise exception 'رقم الهاتف غير صالح'; end if;
  if v_type not in('pickup','delivery') then raise exception 'نوع الطلب غير صالح'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'السلة فارغة'; end if;
  if jsonb_array_length(p_items)>100 then raise exception 'عدد الأصناف أكبر من الحد المسموح'; end if;
  if not public.retail_website_branch_open(p_branch_id) then raise exception 'الفرع غير متاح لاستقبال الطلبات الآن'; end if;

  perform pg_advisory_xact_lock(hashtextextended('retail-web-idem:'||v_idem,0));
  select * into v_existing from public.retail_website_orders where idempotency_key=v_idem;
  if found then
    return jsonb_build_object(
      'ok',true,'id',v_existing.id,'order_code',v_existing.public_order_code,
      'status',v_existing.status,'total',v_existing.total,
      'reservation_expires_at',v_existing.reservation_expires_at,'idempotent',true
    );
  end if;

  -- Coarse anonymous anti-hoarding guard. Stronger WAF/CAPTCHA/rate limiting can
  -- be layered at an Edge/API gateway later without changing this RPC contract.
  if (select count(*) from public.retail_website_orders w
      where w.branch_id=p_branch_id and w.customer_phone=v_phone
        and w.status='pending' and w.reservation_expires_at>now()
        and w.created_at>now()-interval '10 minutes') >= 3 then
    raise exception 'يوجد عدة طلبات معلقة لهذا الرقم. حاول بعد قليل';
  end if;

  -- Validate website payment method if website payment configuration exists.
  if exists(select 1 from public.payment_methods) then
    if not exists(
      select 1 from public.payment_methods pm
      join public.branch_payment_methods bpm on bpm.payment_method_id=pm.id
      where pm.code=v_pay and pm.active=true and bpm.branch_id=p_branch_id
        and bpm.active=true and coalesce(bpm.website_enabled,false)=true
    ) then raise exception 'طريقة الدفع غير متاحة على الموقع لهذا الفرع'; end if;
  end if;

  if v_type='delivery' then
    if p_delivery_zone_id is null then raise exception 'منطقة التوصيل مطلوبة'; end if;
    select round(greatest(coalesce(z.delivery_fee,0),0),2) into v_delivery
      from public.delivery_zones z
      where z.id=p_delivery_zone_id and z.branch_id=p_branch_id and z.active=true;
    if not found then raise exception 'منطقة التوصيل غير متاحة لهذا الفرع'; end if;
    if nullif(trim(coalesce(p_customer_address,'')),'') is null then raise exception 'عنوان التوصيل مطلوب'; end if;
  else
    v_delivery:=0;
  end if;

  -- One logical line per product. Deterministic product order + FOR UPDATE makes
  -- concurrent checkout reservations serialize on the same inventory balances.
  for v_row in
    select nullif(x->>'product_id','')::bigint as product_id,
           round(sum(coalesce((x->>'quantity')::numeric,0)),3) as quantity,
           max(nullif(trim(coalesce(x->>'notes','')),'')) as notes
    from jsonb_array_elements(p_items) x
    where nullif(x->>'product_id','') is not null
    group by nullif(x->>'product_id','')::bigint
    order by nullif(x->>'product_id','')::bigint
  loop
    v_qty:=v_row.quantity;
    if v_qty<=0 then raise exception 'كمية صنف غير صحيحة'; end if;

    select * into v_product from public.products where id=v_row.product_id and active=true;
    if not found then raise exception 'أحد الأصناف غير متاح'; end if;

    select * into v_ps from public.retail_product_settings where product_id=v_product.id;
    if not found then
      v_ps.product_id:=v_product.id; v_ps.unit_type:='piece'; v_ps.allow_decimal:=false;
      v_ps.qty_step:=1; v_ps.min_qty:=1; v_ps.online_enabled:=true;
    end if;
    if coalesce(v_ps.online_enabled,true) is not true then raise exception 'الصنف % غير متاح أونلاين',v_product.name; end if;
    if v_qty<coalesce(v_ps.min_qty,1) then raise exception 'الكمية أقل من الحد الأدنى للصنف %',v_product.name; end if;
    if not coalesce(v_ps.allow_decimal,false) and v_qty<>trunc(v_qty) then raise exception 'الصنف % لا يسمح بكمية عشرية',v_product.name; end if;
    if abs((v_qty/coalesce(v_ps.qty_step,1))-round(v_qty/coalesce(v_ps.qty_step,1)))>0.0001 then raise exception 'كمية الصنف % لا تطابق خطوة البيع',v_product.name; end if;

    select * into v_bp from public.branch_products where branch_id=p_branch_id and product_id=v_product.id;
    if found and v_bp.active is false then raise exception 'الصنف % غير متاح في هذا الفرع',v_product.name; end if;
    if found and v_bp.website_paused_until is not null and v_bp.website_paused_until>now() then raise exception 'الصنف % موقوف مؤقتًا على الموقع',v_product.name; end if;
    v_price:=coalesce(v_bp.price_override,v_product.price,0);
    if v_price<0 then raise exception 'سعر الصنف غير صالح'; end if;

    insert into public.retail_inventory_balances(branch_id,product_id,quantity)
      values(p_branch_id,v_product.id,0) on conflict(branch_id,product_id) do nothing;
    select * into v_balance from public.retail_inventory_balances
      where branch_id=p_branch_id and product_id=v_product.id for update;

    update public.retail_stock_reservations
       set status='expired'
     where branch_id=p_branch_id and product_id=v_product.id and status='active' and expires_at<=now();

    select coalesce(sum(r.quantity),0) into v_reserved
      from public.retail_stock_reservations r
      where r.branch_id=p_branch_id and r.product_id=v_product.id
        and r.status='active' and r.expires_at>now();
    v_available:=round(coalesce(v_balance.quantity,0)-v_reserved,3);
    if coalesce(v_balance.track_inventory,true) and v_available<v_qty then
      raise exception 'المخزون غير كافٍ للصنف % — المتاح %',v_product.name,v_available;
    end if;

    v_line:=round(v_price*v_qty,2);
    v_offer:=public.retail_website_offer_discount(p_branch_id,v_product.id,v_qty,v_price);
    v_subtotal:=v_subtotal+v_line;
    v_discount:=v_discount+least(v_line,v_offer);
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'product_id',v_product.id,'product_name',v_product.name,'unit_type',coalesce(v_ps.unit_type,'piece'),
      'quantity',v_qty,'unit_price',v_price,'unit_cost_snapshot',coalesce(v_product.cost,0),
      'line_subtotal',v_line,'offer_discount',least(v_line,v_offer),
      'line_total',round(greatest(0,v_line-least(v_line,v_offer)),2),'notes',v_row.notes
    ));
  end loop;

  if jsonb_array_length(v_items)=0 then raise exception 'السلة لا تحتوي أصنافًا صالحة'; end if;
  v_discount:=round(least(v_subtotal,greatest(0,v_discount)),2);
  v_total:=round(greatest(0,v_subtotal-v_discount+v_delivery),2);

  insert into public.retail_website_orders(
    branch_id,idempotency_key,reservation_key,customer_name,customer_phone,
    customer_address,customer_notes,order_type,delivery_zone_id,payment_method_code,
    payment_status,payment_reference,subtotal,offer_discount,delivery_fee,total,
    status,reservation_expires_at
  ) values(
    p_branch_id,v_idem,v_res_key,trim(p_customer_name),v_phone,
    nullif(trim(coalesce(p_customer_address,'')),''),nullif(trim(coalesce(p_customer_notes,'')),''),
    v_type,case when v_type='delivery' then p_delivery_zone_id else null end,v_pay,
    case when nullif(trim(coalesce(p_payment_reference,'')),'') is null then 'unpaid' else 'proof_submitted' end,
    nullif(trim(coalesce(p_payment_reference,'')),''),v_subtotal,v_discount,v_delivery,v_total,
    'pending',v_expiry
  ) returning * into v_order;

  update public.retail_website_orders set public_order_code='RW-'||lpad(v_order.id::text,8,'0') where id=v_order.id
    returning * into v_order;

  insert into public.retail_website_order_items(
    retail_website_order_id,product_id,product_name,unit_type,quantity,unit_price,
    unit_cost_snapshot,line_subtotal,offer_discount,line_total,notes
  )
  select v_order.id,x.product_id,x.product_name,x.unit_type,x.quantity,x.unit_price,
         x.unit_cost_snapshot,x.line_subtotal,x.offer_discount,x.line_total,x.notes
  from jsonb_to_recordset(v_items) as x(
    product_id bigint,product_name text,unit_type text,quantity numeric,unit_price numeric,
    unit_cost_snapshot numeric,line_subtotal numeric,offer_discount numeric,line_total numeric,notes text
  );

  insert into public.retail_stock_reservations(
    branch_id,product_id,quantity,reservation_key,status,expires_at,website_order_id
  )
  select p_branch_id,x.product_id,x.quantity,v_res_key,'active',v_expiry,v_order.id
  from jsonb_to_recordset(v_items) as x(product_id bigint,quantity numeric)
  on conflict(reservation_key,product_id) do update
    set quantity=excluded.quantity,status='active',expires_at=excluded.expires_at,website_order_id=excluded.website_order_id;

  return jsonb_build_object(
    'ok',true,'id',v_order.id,'order_code',v_order.public_order_code,'status',v_order.status,
    'subtotal',v_order.subtotal,'offer_discount',v_order.offer_discount,
    'delivery_fee',v_order.delivery_fee,'total',v_order.total,
    'reservation_expires_at',v_order.reservation_expires_at,'idempotent',false
  );
end $$;
revoke all on function public.retail_create_website_order(bigint,text,text,text,text,text,bigint,text,text,text,text,jsonb) from public;
grant execute on function public.retail_create_website_order(bigint,text,text,text,text,text,bigint,text,text,text,text,jsonb) to anon,authenticated;

-- ============================================================================
-- Customer tracking / cancellation (no direct table reads)
-- ============================================================================
create or replace function public.track_retail_website_order(p_order_code text,p_customer_phone text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_phone text:=public.retail_website_normalize_phone(p_customer_phone);
  v_web public.retail_website_orders%rowtype;
  v_pos public.orders%rowtype;
  v_status text;
begin
  select * into v_web from public.retail_website_orders
   where public_order_code=upper(trim(coalesce(p_order_code,''))) and customer_phone=v_phone;
  if not found then raise exception 'الطلب غير موجود'; end if;

  if v_web.status='pending' and v_web.reservation_expires_at<=now() then v_status:='expired';
  elsif v_web.accepted_order_id is not null then
    select * into v_pos from public.orders where id=v_web.accepted_order_id;
    v_status:=coalesce(v_pos.status,v_web.status);
  else v_status:=v_web.status; end if;

  return jsonb_build_object(
    'ok',true,'order_code',v_web.public_order_code,'status',v_status,
    'order_type',v_web.order_type,'subtotal',v_web.subtotal,'offer_discount',v_web.offer_discount,
    'delivery_fee',v_web.delivery_fee,'total',v_web.total,'payment_status',v_web.payment_status,
    'created_at',v_web.created_at,'accepted_at',v_web.accepted_at
  );
end $$;
revoke all on function public.track_retail_website_order(text,text) from public;
grant execute on function public.track_retail_website_order(text,text) to anon,authenticated;

create or replace function public.cancel_retail_website_order_customer(p_order_code text,p_customer_phone text)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_phone text:=public.retail_website_normalize_phone(p_customer_phone);
  v_web public.retail_website_orders%rowtype;
begin
  select * into v_web from public.retail_website_orders
   where public_order_code=upper(trim(coalesce(p_order_code,''))) and customer_phone=v_phone for update;
  if not found then raise exception 'الطلب غير موجود'; end if;
  if v_web.status<>'pending' then raise exception 'لا يمكن إلغاء الطلب بعد استلامه داخل الفرع'; end if;
  update public.retail_website_orders set status='cancelled',cancelled_at=now(),updated_at=now() where id=v_web.id;
  update public.retail_stock_reservations set status='released'
    where website_order_id=v_web.id and reservation_key=v_web.reservation_key and status='active';
  return true;
end $$;
revoke all on function public.cancel_retail_website_order_customer(text,text) from public;
grant execute on function public.cancel_retail_website_order_customer(text,text) to anon,authenticated;

-- ============================================================================
-- Authenticated POS acceptance/rejection
-- ============================================================================
create or replace function public.accept_retail_website_order(p_retail_website_order_id bigint)
returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare
  v_web public.retail_website_orders%rowtype;
  v_emp bigint;
  v_shift bigint;
  v_result jsonb;
  v_order_id bigint;
  v_items jsonb;
  v_order jsonb;
  v_payments jsonb;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  v_emp:=public.current_employee_id();
  if v_emp is null then raise exception 'تعذر تحديد الموظف الحالي'; end if;

  perform pg_advisory_xact_lock(hashtextextended('retail-web-accept:'||p_retail_website_order_id::text,0));
  select * into v_web from public.retail_website_orders where id=p_retail_website_order_id for update;
  if not found then raise exception 'طلب الموقع غير موجود'; end if;
  if not public.has_branch_access(v_web.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_web.status='accepted' and v_web.accepted_order_id is not null then return v_web.accepted_order_id; end if;
  if v_web.status<>'pending' then raise exception 'طلب الموقع لم يعد معلقًا'; end if;
  if v_web.reservation_expires_at<=now() then
    update public.retail_website_orders set status='expired',updated_at=now() where id=v_web.id;
    update public.retail_stock_reservations set status='expired' where website_order_id=v_web.id and status='active';
    raise exception 'انتهت مدة حجز المخزون لهذا الطلب';
  end if;

  select id into v_shift from public.shifts
   where branch_id=v_web.branch_id and employee_id=v_emp and status='open' and closed_at is null
   order by opened_at desc limit 1;
  if v_shift is null then raise exception 'افتح وردية أولًا قبل استلام طلب الموقع'; end if;

  -- Lock every reserved product and ensure the exact staged reservation still exists.
  perform 1
  from public.retail_inventory_balances b
  join public.retail_website_order_items wi on wi.product_id=b.product_id and wi.retail_website_order_id=v_web.id
  where b.branch_id=v_web.branch_id
  order by b.product_id
  for update of b;

  if exists(
    select 1 from public.retail_website_order_items wi
    left join public.retail_stock_reservations r
      on r.website_order_id=v_web.id and r.reservation_key=v_web.reservation_key
     and r.product_id=wi.product_id and r.status='active' and r.expires_at>now()
    where wi.retail_website_order_id=v_web.id
      and (r.id is null or r.quantity<wi.quantity)
  ) then raise exception 'حجز المخزون غير صالح أو انتهى'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',wi.product_id,'product_name',wi.product_name,'quantity',wi.quantity,
    'unit_price',wi.unit_price,'cost',wi.unit_cost_snapshot,'total',wi.line_subtotal,
    'notes',wi.notes,'modifiers','[]'::jsonb
  ) order by wi.id),'[]'::jsonb) into v_items
  from public.retail_website_order_items wi where wi.retail_website_order_id=v_web.id;

  v_order:=jsonb_build_object(
    'branch_id',v_web.branch_id,'employee_id',v_emp,'shift_id',v_shift,
    'order_type',v_web.order_type,'payment_method',v_web.payment_method_code,
    'subtotal',v_web.subtotal,'discount',v_web.offer_discount,'discount_type','amount',
    'discount_value',v_web.offer_discount,'tax_amount',0,'service_amount',0,
    'delivery_fee',v_web.delivery_fee,'total',v_web.total,
    'promo_discount',0,'status','new','source','website',
    'customer_phone',v_web.customer_phone,'customer_name',v_web.customer_name,
    'delivery_address',case when v_web.order_type='delivery' then v_web.customer_address else null end,
    'delivery_zone_id',case when v_web.order_type='delivery' then v_web.delivery_zone_id else null end,
    'notes',nullif(concat_ws(' | ',v_web.customer_notes,
      case when v_web.offer_discount>0 then 'Retail Website Offers: '||v_web.offer_discount::text else null end),''),
    'client_tx_id','retail-web:'||v_web.id::text
  );
  v_payments:=jsonb_build_array(jsonb_build_object('method',v_web.payment_method_code,'amount',v_web.total));

  v_result:=public.create_retail_pos_order_atomic(v_order,v_items,v_payments);
  v_order_id:=nullif(v_result->'order'->>'id','')::bigint;
  if v_order_id is null then raise exception 'تعذر إنشاء فاتورة Retail من طلب الموقع'; end if;

  update public.orders
     set website_order_id=v_web.id,
         payment_status=case when v_web.payment_status='confirmed' then 'confirmed' else v_web.payment_status end,
         payment_reference=v_web.payment_reference
   where id=v_order_id;

  update public.retail_stock_reservations set status='consumed'
    where website_order_id=v_web.id and reservation_key=v_web.reservation_key and status='active';
  update public.retail_website_orders
     set status='accepted',accepted_order_id=v_order_id,accepted_by_employee_id=v_emp,
         accepted_at=now(),updated_at=now()
   where id=v_web.id;

  return v_order_id;
end $$;
revoke all on function public.accept_retail_website_order(bigint) from public;
grant execute on function public.accept_retail_website_order(bigint) to authenticated;

create or replace function public.reject_retail_website_order(p_retail_website_order_id bigint,p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare v_web public.retail_website_orders%rowtype;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  select * into v_web from public.retail_website_orders where id=p_retail_website_order_id for update;
  if not found then raise exception 'طلب الموقع غير موجود'; end if;
  if not public.has_branch_access(v_web.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_web.status='rejected' then return true; end if;
  if v_web.status<>'pending' then raise exception 'لا يمكن رفض الطلب في حالته الحالية'; end if;
  update public.retail_website_orders
     set status='rejected',rejected_at=now(),updated_at=now(),
         customer_notes=concat_ws(' | ',customer_notes,nullif('رفض الفرع: '||trim(coalesce(p_reason,'')),'رفض الفرع: '))
   where id=v_web.id;
  update public.retail_stock_reservations set status='released'
    where website_order_id=v_web.id and reservation_key=v_web.reservation_key and status='active';
  return true;
end $$;
revoke all on function public.reject_retail_website_order(bigint,text) from public;
grant execute on function public.reject_retail_website_order(bigint,text) to authenticated;

-- A small staff-only helper lets POS load details without broad write access.
create or replace function public.retail_website_order_details(p_retail_website_order_id bigint)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_web public.retail_website_orders%rowtype; v_items jsonb;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  select * into v_web from public.retail_website_orders where id=p_retail_website_order_id;
  if not found or not public.has_branch_access(v_web.branch_id) then raise exception 'غير مصرح'; end if;
  select coalesce(jsonb_agg(to_jsonb(i)-'unit_cost_snapshot' order by i.id),'[]'::jsonb)
    into v_items from public.retail_website_order_items i where i.retail_website_order_id=v_web.id;
  return jsonb_build_object('order',to_jsonb(v_web),'items',v_items);
end $$;
revoke all on function public.retail_website_order_details(bigint) from public;
grant execute on function public.retail_website_order_details(bigint) to authenticated;

notify pgrst,'reload schema';
commit;
