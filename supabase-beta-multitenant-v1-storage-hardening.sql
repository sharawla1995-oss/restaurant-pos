-- Sharawla POS — Beta Multi-Tenant V1 Storage Hardening
-- Beta only: xihcxydjnzemflhedzor
-- Public product/logo assets remain publicly readable by design.
-- Every authenticated write is tenant-owned by the first path segment.
-- Website payment receipts are private; anonymous upload is write-only.

begin;

create or replace function public.mt1_storage_path_business(p_name text)
returns uuid
language plpgsql
immutable
set search_path='pg_catalog','public'
as $function$
declare
  v text:=split_part(coalesce(p_name,''),'/',1);
begin
  if v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return v::uuid;
  end if;
  return null;
exception when others then
  return null;
end
$function$;

create or replace function public.mt1_storage_has_permission(
  p_business_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path='pg_catalog','public'
as $function$
  select coalesce(exists(
    select 1
    from public.business_auth_memberships m
    join public.employees e
      on e.auth_user_id=m.auth_user_id
     and e.business_id=m.business_id
     and e.active=true
    where m.auth_user_id=auth.uid()
      and m.business_id=p_business_id
      and m.active=true
      and (
        e.role='admin'
        or exists(
          select 1
          from public.employee_permissions ep
          where ep.employee_id=e.id
            and ep.business_id=p_business_id
            and ep.permission_key=p_permission
            and ep.allowed=true
        )
      )
  ),false)
$function$;

revoke all on function public.mt1_storage_path_business(text) from public;
grant execute on function public.mt1_storage_path_business(text) to anon,authenticated,service_role;
revoke all on function public.mt1_storage_has_permission(uuid,text) from public,anon;
grant execute on function public.mt1_storage_has_permission(uuid,text) to authenticated,service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
  ('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp','image/gif']),
  ('business-assets','business-assets',true,5242880,array['image/jpeg','image/png','image/webp','image/gif']),
  ('website-payment-receipts','website-payment-receipts',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists product_images_public_read on storage.objects;
drop policy if exists product_images_staff_insert on storage.objects;
drop policy if exists product_images_staff_update on storage.objects;
drop policy if exists product_images_staff_delete on storage.objects;
drop policy if exists mt1_product_images_public_read on storage.objects;
drop policy if exists mt1_product_images_staff_insert on storage.objects;
drop policy if exists mt1_product_images_staff_update on storage.objects;
drop policy if exists mt1_product_images_staff_delete on storage.objects;

create policy mt1_product_images_public_read
on storage.objects for select
to public
using(bucket_id='product-images');

create policy mt1_product_images_staff_insert
on storage.objects for insert
to authenticated
with check(
  bucket_id='product-images'
  and public.mt1_storage_path_business(name) is not null
  and public.mt1_storage_has_permission(public.mt1_storage_path_business(name),'products')
);

create policy mt1_product_images_staff_update
on storage.objects for update
to authenticated
using(
  bucket_id='product-images'
  and public.mt1_storage_path_business(name) is not null
  and public.mt1_storage_has_permission(public.mt1_storage_path_business(name),'products')
)
with check(
  bucket_id='product-images'
  and public.mt1_storage_path_business(name) is not null
  and public.mt1_storage_has_permission(public.mt1_storage_path_business(name),'products')
);

create policy mt1_product_images_staff_delete
on storage.objects for delete
to authenticated
using(
  bucket_id='product-images'
  and public.mt1_storage_path_business(name) is not null
  and public.mt1_storage_has_permission(public.mt1_storage_path_business(name),'products')
);

drop policy if exists business_assets_public_read on storage.objects;
drop policy if exists business_assets_staff_insert on storage.objects;
drop policy if exists business_assets_staff_update on storage.objects;
drop policy if exists business_assets_staff_delete on storage.objects;
drop policy if exists mt1_business_assets_public_read on storage.objects;
drop policy if exists mt1_business_assets_staff_insert on storage.objects;
drop policy if exists mt1_business_assets_staff_update on storage.objects;
drop policy if exists mt1_business_assets_staff_delete on storage.objects;

create policy mt1_business_assets_public_read
on storage.objects for select
to public
using(bucket_id='business-assets');

create policy mt1_business_assets_staff_insert
on storage.objects for insert
to authenticated
with check(
  bucket_id='business-assets'
  and public.mt1_storage_path_business(name) is not null
  and public.mt1_storage_has_permission(public.mt1_storage_path_business(name),'businessSettings')
);

create policy mt1_business_assets_staff_update
on storage.objects for update
to authenticated
using(
  bucket_id='business-assets'
  and public.mt1_storage_path_business(name) is not null
  and public.mt1_storage_has_permission(public.mt1_storage_path_business(name),'businessSettings')
)
with check(
  bucket_id='business-assets'
  and public.mt1_storage_path_business(name) is not null
  and public.mt1_storage_has_permission(public.mt1_storage_path_business(name),'businessSettings')
);

create policy mt1_business_assets_staff_delete
on storage.objects for delete
to authenticated
using(
  bucket_id='business-assets'
  and public.mt1_storage_path_business(name) is not null
  and public.mt1_storage_has_permission(public.mt1_storage_path_business(name),'businessSettings')
);

drop policy if exists website_receipts_anon_insert on storage.objects;
drop policy if exists website_receipts_staff_read on storage.objects;
drop policy if exists mt1_website_receipts_anon_insert on storage.objects;
drop policy if exists mt1_website_receipts_staff_read on storage.objects;

create policy mt1_website_receipts_anon_insert
on storage.objects for insert
to anon
with check(
  bucket_id='website-payment-receipts'
  and public.mt1_storage_path_business(name) is not null
  and exists(
    select 1 from public.businesses b
    where b.id=public.mt1_storage_path_business(name)
      and b.active=true
  )
);

create policy mt1_website_receipts_staff_read
on storage.objects for select
to authenticated
using(
  bucket_id='website-payment-receipts'
  and public.mt1_storage_path_business(name) is not null
  and public.mt1_storage_has_permission(public.mt1_storage_path_business(name),'websitePayments')
);

-- The public website order owner must never bind a receipt uploaded under another tenant.
CREATE OR REPLACE FUNCTION public.create_website_order(p_branch_id bigint, p_customer_name text, p_customer_phone text, p_customer_address text, p_customer_notes text, p_items jsonb, p_payment_method_code text DEFAULT 'cash'::text, p_payment_reference text DEFAULT NULL::text, p_payment_receipt_path text DEFAULT NULL::text, p_order_type text DEFAULT 'delivery'::text, p_promo_code text DEFAULT NULL::text, p_delivery_zone_id bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_business_id uuid;
  v_order_id bigint;
  v_subtotal numeric(12,2):=0;
  v_total numeric(12,2):=0;
  v_delivery_fee numeric(12,2):=0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;
  v_zone public.delivery_zones%rowtype;
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
  v_type text;
  v_calc_items jsonb:='[]'::jsonb;
  v_promo jsonb;
  v_promo_id bigint;
  v_promo_discount numeric(12,2):=0;
begin
  v_business_id:=public.mt1_require_request_business();
  perform public.mt1_require_public_branch(p_branch_id);
  perform public.mt1_assert_restaurant_items(p_items,v_business_id);

  if nullif(trim(coalesce(p_payment_receipt_path,'')),'') is not null
     and split_part(trim(p_payment_receipt_path),'/',1) is distinct from v_business_id::text then
    raise exception 'PAYMENT_RECEIPT_TENANT_MISMATCH' using errcode='42501';
  end if;

  v_type:=lower(coalesce(nullif(trim(p_order_type),''),'delivery'));

  if v_type not in ('delivery','pickup') then
    raise exception 'نوع الاستلام غير صحيح';
  end if;

  if nullif(trim(p_customer_name),'') is null then
    raise exception 'اسم العميل مطلوب';
  end if;

  if nullif(trim(p_customer_phone),'') is null then
    raise exception 'رقم الهاتف مطلوب';
  end if;

  if v_type='delivery'
     and nullif(trim(coalesce(p_customer_address,'')),'') is null then
    raise exception 'عنوان التوصيل مطلوب';
  end if;

  if p_items is null or jsonb_array_length(p_items)=0 then
    raise exception 'السلة فارغة';
  end if;

  if not exists(
    select 1
    from public.branches
    where id=p_branch_id
      and business_id=v_business_id
      and active=true
      and website_visible=true
  ) then
    raise exception 'الفرع غير متاح';
  end if;

  select *
  into v_bs
  from public.branch_website_settings
  where branch_id=p_branch_id
    and business_id=v_business_id;

  if found and (
    v_bs.orders_open=false
    or (
      v_bs.orders_paused_until is not null
      and v_bs.orders_paused_until>now()
    )
  ) then
    raise exception 'الفرع أوقف استقبال الطلبات';
  end if;

  if v_type='delivery' then
    if p_delivery_zone_id is null then
      raise exception 'اختار منطقة التوصيل';
    end if;

    select *
    into v_zone
    from public.delivery_zones
    where id=p_delivery_zone_id
      and branch_id=p_branch_id
      and business_id=v_business_id
      and active=true;

    if not found then
      raise exception 'منطقة التوصيل غير متاحة لهذا الفرع';
    end if;

    v_delivery_fee:=greatest(0,coalesce(v_zone.delivery_fee,0));
  else
    p_delivery_zone_id:=null;
    v_delivery_fee:=0;
  end if;

  select *
  into v_payment
  from public.payment_methods
  where business_id=v_business_id
    and code=coalesce(nullif(trim(p_payment_method_code),''),'cash')
    and active=true;

  if not found then
    raise exception 'طريقة الدفع غير متاحة';
  end if;

  select *
  into v_bpm
  from public.branch_payment_methods
  where business_id=v_business_id
    and branch_id=p_branch_id
    and payment_method_id=v_payment.id
    and active=true
    and website_enabled=true;

  if not found then
    raise exception 'طريقة الدفع غير متاحة على الموقع لهذا الفرع';
  end if;

  for v_item in
    select * from jsonb_array_elements(p_items)
  loop

    select *
    into v_product
    from public.products
    where business_id=v_business_id
      and id=(v_item->>'product_id')::bigint
      and active=true
      and website_visible=true;

    if not found then
      raise exception 'أحد الأصناف غير متاح';
    end if;

    if not exists(
      select 1
      from public.branch_products bp
      where bp.business_id=v_business_id
        and bp.branch_id=p_branch_id
        and bp.product_id=v_product.id
        and bp.active=true
        and (
          bp.website_paused_until is null
          or bp.website_paused_until<=now()
        )
    ) then
      raise exception 'أحد الأصناف غير متاح في الفرع';
    end if;

    v_qty:=greatest(1,coalesce((v_item->>'quantity')::integer,1));

    if nullif(v_item->>'variant_id','') is not null then

      select *
      into v_variant
      from public.product_variants
      where business_id=v_business_id
        and id=(v_item->>'variant_id')::bigint
        and product_id=v_product.id
        and active=true;

      if not found then
        raise exception 'اختيار الحجم غير متاح';
      end if;

      v_unit:=v_variant.price;

    else

      select coalesce(bp.price_override,v_product.price)
      into v_unit
      from public.branch_products bp
      where bp.business_id=v_business_id
        and bp.branch_id=p_branch_id
        and bp.product_id=v_product.id;

    end if;

    v_extras:=0;

    for v_modifier in
      select *
      from jsonb_array_elements(
        coalesce(v_item->'modifiers','[]'::jsonb)
      )
    loop

      select *
      into v_mod
      from public.modifiers
      where business_id=v_business_id
        and id=(v_modifier->>'modifier_id')::bigint
        and active=true;

      if not found
         or not exists(
           select 1
           from public.product_modifiers pm
           where pm.business_id=v_business_id
             and pm.product_id=v_product.id
             and pm.modifier_id=v_mod.id
         )
      then
        raise exception 'إضافة غير متاحة';
      end if;

      v_extras:=v_extras+coalesce(v_mod.price,0);

    end loop;

    v_line:=(v_unit+v_extras)*v_qty;
    v_subtotal:=v_subtotal+v_line;

    v_calc_items:=v_calc_items||
      jsonb_build_array(
        jsonb_build_object(
          'product_id',v_product.id,
          'line_total',v_line
        )
      );

  end loop;

  if nullif(trim(coalesce(p_promo_code,'')),'') is not null then

    v_promo:=public.preview_promo_code(
      p_promo_code,
      p_branch_id,
      'website',
      p_customer_phone,
      v_calc_items,
      v_subtotal
    );

    v_promo_id:=(v_promo->>'promo_id')::bigint;
    v_promo_discount:=coalesce((v_promo->>'discount')::numeric,0);

  end if;

  v_total:=greatest(
    0,
    v_subtotal-v_promo_discount+v_delivery_fee
  );

  insert into public.website_orders(
    branch_id,
    customer_name,
    customer_phone,
    customer_address,
    customer_notes,
    subtotal,
    delivery_fee,
    delivery_zone_id,
    total,
    status,
    payment_method_code,
    payment_method_name,
    payment_reference,
    payment_receipt_path,
    payment_status,
    order_type,
    promo_code_id,
    promo_code,
    promo_discount
  )
  values(
    p_branch_id,
    trim(p_customer_name),
    trim(p_customer_phone),

    case
      when v_type='pickup' then null
      else trim(p_customer_address)
    end,

    nullif(trim(coalesce(p_customer_notes,'')),''),

    v_subtotal,
    v_delivery_fee,
    p_delivery_zone_id,
    v_total,
    'pending',

    v_payment.code,
    v_payment.name,

    nullif(trim(coalesce(p_payment_reference,'')),''),

    nullif(
      trim(coalesce(p_payment_receipt_path,'')),
      ''
    ),

    case
      when v_payment.code='cash'
        then 'unpaid'
      else
        case
          when p_payment_receipt_path is not null
            or nullif(
              trim(coalesce(p_payment_reference,'')),
              ''
            ) is not null
          then 'proof_submitted'
          else 'unpaid'
        end
    end,

    v_type,
    v_promo_id,

    case
      when v_promo_id is null
        then null
      else upper(trim(p_promo_code))
    end,

    v_promo_discount

  )
  returning id into v_order_id;

  for v_item in
    select * from jsonb_array_elements(p_items)
  loop

    select *
    into v_product
    from public.products
    where business_id=v_business_id
      and id=(v_item->>'product_id')::bigint;

    v_qty:=greatest(
      1,
      coalesce((v_item->>'quantity')::integer,1)
    );

    if nullif(v_item->>'variant_id','') is not null then

      select *
      into v_variant
      from public.product_variants
      where business_id=v_business_id
        and id=(v_item->>'variant_id')::bigint;

      v_unit:=v_variant.price;

    else

      select coalesce(bp.price_override,v_product.price)
      into v_unit
      from public.branch_products bp
      where bp.business_id=v_business_id
        and bp.branch_id=p_branch_id
        and bp.product_id=v_product.id;

      v_variant.id:=null;
      v_variant.name:=null;

    end if;

    v_extras:=0;

    for v_modifier in
      select *
      from jsonb_array_elements(
        coalesce(v_item->'modifiers','[]'::jsonb)
      )
    loop

      select *
      into v_mod
      from public.modifiers
      where business_id=v_business_id
        and id=(v_modifier->>'modifier_id')::bigint;

      v_extras:=v_extras+coalesce(v_mod.price,0);

    end loop;

    v_line:=(v_unit+v_extras)*v_qty;

    insert into public.website_order_items(
      website_order_id,
      product_id,
      product_name,
      variant_id,
      variant_name,
      quantity,
      unit_price,
      extras_total,
      line_total,
      notes
    )
    values(
      v_order_id,
      v_product.id,
      v_product.name,
      v_variant.id,
      v_variant.name,
      v_qty,
      v_unit,
      v_extras,
      v_line,
      nullif(
        trim(coalesce(v_item->>'notes','')),
        ''
      )
    )
    returning id into v_wi;

    for v_modifier in
      select *
      from jsonb_array_elements(
        coalesce(v_item->'modifiers','[]'::jsonb)
      )
    loop

      select *
      into v_mod
      from public.modifiers
      where business_id=v_business_id
        and id=(v_modifier->>'modifier_id')::bigint;

      insert into public.website_order_item_modifiers(
        website_order_item_id,
        modifier_id,
        modifier_name,
        price
      )
      values(
        v_wi,
        v_mod.id,
        v_mod.name,
        v_mod.price
      );

    end loop;

  end loop;

  if v_promo_id is not null then

    perform public.redeem_promo_code(
      v_promo_id,
      upper(trim(p_promo_code)),
      p_branch_id,
      'website',
      p_customer_phone,
      v_promo_discount,
      null,
      v_order_id
    );

  end if;

  return v_order_id;
end;
$function$;


commit;
