-- V9.5.0 - Website control center + website payments + payment proof + tracking/cancel
-- Run after V9.4.0. Designed to be safe to re-run.

-- =========================
-- Global website settings
-- =========================
create table if not exists public.website_settings (
  id integer primary key default 1 check (id = 1),
  theme_name text not null default 'topburger',
  page_background text not null default '#b51f2b',
  surface_color text not null default '#ffffff',
  text_color text not null default '#171717',
  card_radius integer not null default 22 check(card_radius between 0 and 40),
  show_contact boolean not null default true,
  show_locations boolean not null default true,
  show_track_order boolean not null default true,
  show_cancel_order boolean not null default true,
  allow_customer_cancel boolean not null default true,
  show_whatsapp boolean not null default false,
  whatsapp_url text,
  show_facebook boolean not null default false,
  facebook_url text,
  show_instagram boolean not null default false,
  instagram_url text,
  show_payment_reference boolean not null default true,
  show_payment_receipt_upload boolean not null default true,
  show_payment_status boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.website_settings(id)
values(1)
on conflict(id) do nothing;

alter table public.website_settings enable row level security;
grant select on public.website_settings to anon, authenticated;
grant insert,update on public.website_settings to authenticated;

drop policy if exists website_settings_public_read on public.website_settings;
create policy website_settings_public_read
on public.website_settings for select
to anon, authenticated
using(id=1);

drop policy if exists website_settings_staff_write on public.website_settings;
create policy website_settings_staff_write
on public.website_settings for all
to authenticated
using(public.is_admin() or public.has_permission('websiteAppearance'))
with check(public.is_admin() or public.has_permission('websiteAppearance'));

-- =========================
-- Branch links / map info
-- =========================
alter table public.branches add column if not exists location_url text;
alter table public.branches add column if not exists whatsapp text;

-- =========================
-- Website payment controls per branch
-- =========================
alter table public.branch_payment_methods add column if not exists website_enabled boolean not null default false;
alter table public.branch_payment_methods add column if not exists payment_account text;
alter table public.branch_payment_methods add column if not exists payment_instructions text;
alter table public.branch_payment_methods add column if not exists allow_reference boolean not null default true;
alter table public.branch_payment_methods add column if not exists allow_receipt_upload boolean not null default true;

-- Keep cash available on website by default for existing branches.
update public.branch_payment_methods bpm
set website_enabled=true,
    allow_reference=false,
    allow_receipt_upload=false
from public.payment_methods pm
where pm.id=bpm.payment_method_id
  and pm.code='cash';

-- Public website can only read enabled branch payment rows and payment method names.
grant select on public.payment_methods, public.branch_payment_methods to anon;

drop policy if exists payment_methods_public_read on public.payment_methods;
create policy payment_methods_public_read
on public.payment_methods for select
to anon
using(active=true);

drop policy if exists branch_payment_methods_public_read on public.branch_payment_methods;
create policy branch_payment_methods_public_read
on public.branch_payment_methods for select
to anon
using(website_enabled=true and active=true);

-- =========================
-- Website order payment metadata
-- =========================
alter table public.website_orders add column if not exists payment_method_code text not null default 'cash';
alter table public.website_orders add column if not exists payment_method_name text;
alter table public.website_orders add column if not exists payment_reference text;
alter table public.website_orders add column if not exists payment_receipt_path text;
alter table public.website_orders add column if not exists payment_status text not null default 'unpaid';
alter table public.website_orders add column if not exists payment_reviewed_at timestamptz;
alter table public.website_orders add column if not exists payment_reviewed_by bigint references public.employees(id);
alter table public.website_orders add column if not exists cancelled_by_customer_at timestamptz;

alter table public.orders add column if not exists payment_status text not null default 'unpaid';
alter table public.orders add column if not exists website_order_id bigint;
alter table public.orders add column if not exists payment_reference text;
alter table public.orders add column if not exists payment_receipt_path text;

-- =========================
-- Private receipt bucket: anon may upload, staff may read.
-- =========================
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'website-payment-receipts',
  'website-payment-receipts',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict(id) do update set
  public=false,
  file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists website_receipts_anon_insert on storage.objects;
create policy website_receipts_anon_insert
on storage.objects for insert
to anon
with check(bucket_id='website-payment-receipts');

drop policy if exists website_receipts_staff_read on storage.objects;
create policy website_receipts_staff_read
on storage.objects for select
to authenticated
using(bucket_id='website-payment-receipts');

-- =========================
-- Create website order with payment metadata
-- =========================
create or replace function public.create_website_order(
  p_branch_id bigint,
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_customer_notes text,
  p_items jsonb,
  p_payment_method_code text default 'cash',
  p_payment_reference text default null,
  p_payment_receipt_path text default null
)
returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order_id bigint;
  v_subtotal numeric(12,2):=0;
  v_total numeric(12,2):=0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;
  v_qty integer;
  v_unit numeric(12,2);
  v_extras numeric(12,2);
  v_line numeric(12,2);
  v_wi bigint;
  v_modifier jsonb;
  v_mod public.modifiers%rowtype;
  v_payment public.payment_methods%rowtype;
  v_bpm public.branch_payment_methods%rowtype;
  v_bs public.branch_website_settings%rowtype;
begin
  if nullif(trim(p_customer_name),'') is null then raise exception 'اسم العميل مطلوب'; end if;
  if nullif(trim(p_customer_phone),'') is null then raise exception 'رقم الهاتف مطلوب'; end if;
  if nullif(trim(p_customer_address),'') is null then raise exception 'عنوان التوصيل مطلوب'; end if;
  if p_items is null or jsonb_array_length(p_items)=0 then raise exception 'السلة فارغة'; end if;

  if not exists(select 1 from public.branches where id=p_branch_id and active=true and website_visible=true) then
    raise exception 'الفرع غير متاح';
  end if;

  select * into v_bs from public.branch_website_settings where branch_id=p_branch_id;
  if found then
    if v_bs.orders_open=false then raise exception 'الفرع أوقف استقبال الطلبات'; end if;
    if v_bs.orders_paused_until is not null and v_bs.orders_paused_until>now() then raise exception 'الفرع أوقف استقبال الطلبات مؤقتًا'; end if;
  end if;

  select * into v_payment from public.payment_methods
  where code=coalesce(nullif(trim(p_payment_method_code),''),'cash') and active=true;
  if not found then raise exception 'طريقة الدفع غير متاحة'; end if;

  select * into v_bpm from public.branch_payment_methods
  where branch_id=p_branch_id and payment_method_id=v_payment.id and active=true and website_enabled=true;
  if not found then raise exception 'طريقة الدفع غير متاحة على الموقع لهذا الفرع'; end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from public.products
    where id=(v_item->>'product_id')::bigint and active=true and website_visible=true;
    if not found then raise exception 'أحد الأصناف غير متاح'; end if;

    if not exists(select 1 from public.branch_products bp where bp.branch_id=p_branch_id and bp.product_id=v_product.id and bp.active=true and (bp.website_paused_until is null or bp.website_paused_until<=now())) then
      raise exception 'أحد الأصناف غير متاح في الفرع';
    end if;

    v_qty:=greatest(1,coalesce((v_item->>'quantity')::integer,1));
    if nullif(v_item->>'variant_id','') is not null then
      select * into v_variant from public.product_variants where id=(v_item->>'variant_id')::bigint and product_id=v_product.id and active=true;
      if not found then raise exception 'اختيار الحجم غير متاح'; end if;
      v_unit:=v_variant.price;
    else
      select coalesce(bp.price_override,v_product.price) into v_unit
      from public.branch_products bp where bp.branch_id=p_branch_id and bp.product_id=v_product.id;
    end if;

    v_extras:=0;
    for v_modifier in select * from jsonb_array_elements(coalesce(v_item->'modifiers','[]'::jsonb))
    loop
      select * into v_mod from public.modifiers where id=(v_modifier->>'modifier_id')::bigint and active=true;
      if not found or not exists(select 1 from public.product_modifiers pm where pm.product_id=v_product.id and pm.modifier_id=v_mod.id) then
        raise exception 'إضافة غير متاحة';
      end if;
      v_extras:=v_extras+coalesce(v_mod.price,0);
    end loop;

    v_line:=(v_unit+v_extras)*v_qty;
    v_subtotal:=v_subtotal+v_line;
  end loop;

  v_total:=v_subtotal;

  insert into public.website_orders(
    branch_id,customer_name,customer_phone,customer_address,customer_notes,
    subtotal,delivery_fee,total,status,payment_method_code,payment_method_name,
    payment_reference,payment_receipt_path,payment_status
  ) values(
    p_branch_id,trim(p_customer_name),trim(p_customer_phone),trim(p_customer_address),nullif(trim(coalesce(p_customer_notes,'')),''),
    v_subtotal,0,v_total,'pending',v_payment.code,v_payment.name,
    nullif(trim(coalesce(p_payment_reference,'')),''),nullif(trim(coalesce(p_payment_receipt_path,'')),''),
    case when v_payment.code='cash' then 'unpaid' else case when p_payment_receipt_path is not null or nullif(trim(coalesce(p_payment_reference,'')),'') is not null then 'proof_submitted' else 'unpaid' end end
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from public.products where id=(v_item->>'product_id')::bigint;
    v_qty:=greatest(1,coalesce((v_item->>'quantity')::integer,1));
    if nullif(v_item->>'variant_id','') is not null then
      select * into v_variant from public.product_variants where id=(v_item->>'variant_id')::bigint;
      v_unit:=v_variant.price;
    else
      select coalesce(bp.price_override,v_product.price) into v_unit from public.branch_products bp where bp.branch_id=p_branch_id and bp.product_id=v_product.id;
      v_variant.id:=null; v_variant.name:=null;
    end if;
    v_extras:=0;
    for v_modifier in select * from jsonb_array_elements(coalesce(v_item->'modifiers','[]'::jsonb))
    loop
      select * into v_mod from public.modifiers where id=(v_modifier->>'modifier_id')::bigint;
      v_extras:=v_extras+coalesce(v_mod.price,0);
    end loop;
    v_line:=(v_unit+v_extras)*v_qty;
    insert into public.website_order_items(website_order_id,product_id,product_name,variant_id,variant_name,quantity,unit_price,extras_total,line_total,notes)
    values(v_order_id,v_product.id,v_product.name,v_variant.id,v_variant.name,v_qty,v_unit,v_extras,v_line,nullif(trim(coalesce(v_item->>'notes','')),''))
    returning id into v_wi;
    for v_modifier in select * from jsonb_array_elements(coalesce(v_item->'modifiers','[]'::jsonb))
    loop
      select * into v_mod from public.modifiers where id=(v_modifier->>'modifier_id')::bigint;
      insert into public.website_order_item_modifiers(website_order_item_id,modifier_id,modifier_name,price)
      values(v_wi,v_mod.id,v_mod.name,v_mod.price);
    end loop;
  end loop;

  return v_order_id;
end;
$$;

revoke all on function public.create_website_order(bigint,text,text,text,text,jsonb,text,text,text) from public;
grant execute on function public.create_website_order(bigint,text,text,text,text,jsonb,text,text,text) to anon, authenticated;

-- =========================
-- Accept website order and preserve payment metadata
-- =========================
create or replace function public.accept_website_order(p_website_order_id bigint)
returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare
  w public.website_orders%rowtype;
  wi record;
  wm record;
  v_employee_id bigint;
  v_order_id bigint;
  v_order_item_id bigint;
  v_shift_id bigint;
begin
  v_employee_id:=public.current_employee_id();
  if v_employee_id is null then raise exception 'المستخدم غير مربوط بموظف'; end if;

  select * into w from public.website_orders where id=p_website_order_id for update;
  if not found then raise exception 'طلب الموقع غير موجود'; end if;
  if not public.has_branch_access(w.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if w.status<>'pending' then raise exception 'تم التعامل مع الطلب بالفعل'; end if;

  select id into v_shift_id from public.shifts
  where branch_id=w.branch_id and employee_id=v_employee_id and status='open' and closed_at is null
  order by opened_at desc limit 1;
  if v_shift_id is null then raise exception 'افتح وردية أولًا قبل استلام طلب الموقع'; end if;

  insert into public.orders(
    branch_id,employee_id,customer_id,shift_id,order_type,payment_method,
    subtotal,discount,delivery_fee,total,status,notes,source,
    customer_phone,delivery_address,customer_name,website_order_id,
    payment_status,payment_reference,payment_receipt_path
  ) values(
    w.branch_id,v_employee_id,null,v_shift_id,'delivery',coalesce(w.payment_method_code,'cash'),
    w.subtotal,0,w.delivery_fee,w.total,'new',w.customer_notes,'website',
    w.customer_phone,w.customer_address,w.customer_name,w.id,
    coalesce(w.payment_status,'unpaid'),w.payment_reference,w.payment_receipt_path
  ) returning id into v_order_id;

  for wi in select * from public.website_order_items where website_order_id=w.id order by id loop
    insert into public.order_items(order_id,product_id,product_name,quantity,unit_price,cost,total,notes)
    values(v_order_id,wi.product_id,wi.product_name,wi.quantity,wi.unit_price,coalesce((select cost from public.products where id=wi.product_id),0),wi.line_total,wi.notes)
    returning id into v_order_item_id;
    for wm in select * from public.website_order_item_modifiers where website_order_item_id=wi.id order by id loop
      insert into public.order_item_modifiers(order_item_id,modifier_id,modifier_name,price)
      values(v_order_item_id,wm.modifier_id,wm.modifier_name,wm.price);
    end loop;
  end loop;

  update public.website_orders set status='accepted',accepted_at=now(),order_id=v_order_id where id=w.id;
  return v_order_id;
end;
$$;

revoke all on function public.accept_website_order(bigint) from public;
grant execute on function public.accept_website_order(bigint) to authenticated;

-- =========================
-- Customer tracking / cancel
-- =========================
create or replace function public.track_website_order(p_website_order_id bigint,p_phone text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare w public.website_orders%rowtype;
declare o public.orders%rowtype;
begin
  select * into w from public.website_orders
  where id=p_website_order_id and regexp_replace(customer_phone,'\D','','g')=regexp_replace(p_phone,'\D','','g');
  if not found then raise exception 'الطلب غير موجود أو رقم الهاتف غير مطابق'; end if;
  if w.order_id is not null then select * into o from public.orders where id=w.order_id; end if;
  return jsonb_build_object(
    'id',w.id,
    'status',case when w.status='accepted' and o.id is not null then o.status else w.status end,
    'payment_status',coalesce(o.payment_status,w.payment_status,'unpaid'),
    'created_at',w.created_at,
    'accepted_at',w.accepted_at,
    'branch_id',w.branch_id,
    'total',w.total
  );
end;
$$;
revoke all on function public.track_website_order(bigint,text) from public;
grant execute on function public.track_website_order(bigint,text) to anon, authenticated;

create or replace function public.cancel_website_order_customer(p_website_order_id bigint,p_phone text)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare w public.website_orders%rowtype;
declare s public.website_settings%rowtype;
begin
  select * into s from public.website_settings where id=1;
  if found and (s.allow_customer_cancel=false or s.show_cancel_order=false) then raise exception 'إلغاء الطلب غير متاح حاليًا'; end if;
  select * into w from public.website_orders where id=p_website_order_id for update;
  if not found or regexp_replace(w.customer_phone,'\D','','g')<>regexp_replace(p_phone,'\D','','g') then raise exception 'الطلب غير موجود أو رقم الهاتف غير مطابق'; end if;
  if w.status<>'pending' then raise exception 'بعد استلام الفرع للطلب، تواصل مع الفرع للإلغاء'; end if;
  update public.website_orders set status='rejected',rejected_at=now(),cancelled_by_customer_at=now() where id=w.id;
  return true;
end;
$$;
revoke all on function public.cancel_website_order_customer(bigint,text) from public;
grant execute on function public.cancel_website_order_customer(bigint,text) to anon, authenticated;

-- =========================
-- Staff payment review RPC
-- =========================
create or replace function public.review_order_payment(p_order_id bigint,p_status text)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare o public.orders%rowtype;
declare v_emp bigint;
begin
  if p_status not in ('unpaid','proof_submitted','confirmed','rejected') then raise exception 'حالة دفع غير صحيحة'; end if;
  v_emp:=public.current_employee_id();
  select * into o from public.orders where id=p_order_id for update;
  if not found then raise exception 'الطلب غير موجود'; end if;
  if not public.has_branch_access(o.branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  update public.orders set payment_status=p_status where id=o.id;
  if o.website_order_id is not null then
    update public.website_orders set payment_status=p_status,payment_reviewed_at=now(),payment_reviewed_by=v_emp where id=o.website_order_id;
  end if;
  return true;
end;
$$;
revoke all on function public.review_order_payment(bigint,text) from public;
grant execute on function public.review_order_payment(bigint,text) to authenticated;

notify pgrst,'reload schema';
