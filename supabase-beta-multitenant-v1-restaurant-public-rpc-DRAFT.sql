-- Sharawla POS — Beta Multi-Tenant V1 Restaurant public RPC hardening
-- SOURCE PREPARATION ONLY.
-- Bodies below were generated from the live Beta definitions and then tenant-bound.
-- Do not apply unless Foundation + RLS are already PASS.

begin;

do $guard$
begin
  if current_setting('sharawla.multitenant_apply', true) is distinct from 'beta-only-approved' then
    raise exception 'MULTITENANT_V1_SOURCE_ONLY: explicit Beta apply guard is not set';
  end if;
end
$guard$;

create or replace function public.mt1_require_request_business()
returns uuid
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $$
declare v uuid;
begin
  v:=public.request_business_id();
  if v is null then
    raise exception 'MULTITENANT_CONTEXT_REQUIRED' using errcode='42501';
  end if;
  return v;
end
$$;

revoke all on function public.mt1_require_request_business() from public;
grant execute on function public.mt1_require_request_business() to anon,authenticated;

create or replace function public.mt1_require_public_branch(p_branch_id bigint)
returns uuid
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $$
declare v uuid;
begin
  v:=public.mt1_require_request_business();
  if not exists(
    select 1 from public.branches b
    where b.id=p_branch_id
      and b.business_id=v
      and b.active is distinct from false
      and b.website_visible=true
  ) then
    raise exception 'BRANCH_NOT_AVAILABLE' using errcode='42501';
  end if;
  return v;
end
$$;

revoke all on function public.mt1_require_public_branch(bigint) from public;
grant execute on function public.mt1_require_public_branch(bigint) to anon,authenticated;

create or replace function public.mt1_assert_restaurant_items(p_items jsonb,p_business_id uuid)
returns void
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $$
declare x jsonb; m jsonb; pid bigint; vid bigint; mid bigint;
begin
  if p_business_id is null then
    raise exception 'MULTITENANT_CONTEXT_REQUIRED' using errcode='42501';
  end if;
  for x in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))
  loop
    pid:=nullif(x->>'product_id','')::bigint;
    if pid is null or not exists(
      select 1 from public.products p where p.id=pid and p.business_id=p_business_id
    ) then
      raise exception 'ITEM_NOT_AVAILABLE';
    end if;

    vid:=nullif(x->>'variant_id','')::bigint;
    if vid is not null and not exists(
      select 1 from public.product_variants v
      where v.id=vid and v.product_id=pid and v.business_id=p_business_id
    ) then
      raise exception 'ITEM_NOT_AVAILABLE';
    end if;

    if jsonb_typeof(x->'modifiers')='array' then
      for m in select value from jsonb_array_elements(x->'modifiers')
      loop
        mid:=nullif(m->>'modifier_id','')::bigint;
        if mid is null or not exists(
          select 1
          from public.modifiers mm
          join public.product_modifiers pm
            on pm.modifier_id=mm.id
           and pm.product_id=pid
           and pm.business_id=p_business_id
          where mm.id=mid and mm.business_id=p_business_id
        ) then
          raise exception 'ITEM_NOT_AVAILABLE';
        end if;
      end loop;
    end if;
  end loop;
end
$$;

revoke all on function public.mt1_assert_restaurant_items(jsonb,uuid) from public;
grant execute on function public.mt1_assert_restaurant_items(jsonb,uuid) to anon,authenticated;

CREATE OR REPLACE FUNCTION public.is_branch_website_schedule_open(p_branch_id bigint, p_at timestamp with time zone DEFAULT now())
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_business_id uuid;
  s public.branch_website_settings%rowtype;
  today_hours public.branch_website_hours%rowtype;
  prev_hours public.branch_website_hours%rowtype;
  local_ts timestamp without time zone;
  local_dow integer;
  local_time time without time zone;
  prev_dow integer;
begin
  v_business_id:=public.mt1_require_request_business();
  perform public.mt1_require_public_branch(p_branch_id);
  select * into s
  from public.branch_website_settings
  where branch_id = p_branch_id
    and business_id=v_business_id;

  if not found or not coalesce(s.schedule_enabled, false) then
    return true;
  end if;

  begin
    local_ts := p_at at time zone coalesce(nullif(trim(s.schedule_timezone), ''), 'Africa/Cairo');
  exception when invalid_parameter_value then
    local_ts := p_at at time zone 'Africa/Cairo';
  end;

  local_dow := extract(dow from local_ts)::integer;
  local_time := local_ts::time;
  prev_dow := (local_dow + 6) % 7;

  select * into today_hours
  from public.branch_website_hours
  where branch_id = p_branch_id
    and business_id=v_business_id
    and day_of_week = local_dow;

  if found and coalesce(today_hours.enabled, false) then
    -- Equal open/close means 24 hours for that day.
    if today_hours.open_time = today_hours.close_time then
      return true;
    end if;

    if today_hours.open_time < today_hours.close_time then
      if local_time >= today_hours.open_time
         and local_time < today_hours.close_time then
        return true;
      end if;
    else
      -- Overnight range: today's late-night portion.
      if local_time >= today_hours.open_time then
        return true;
      end if;
    end if;
  end if;

  -- Previous day's overnight range: today's after-midnight portion.
  select * into prev_hours
  from public.branch_website_hours
  where branch_id = p_branch_id
    and business_id=v_business_id
    and day_of_week = prev_dow;

  if found
     and coalesce(prev_hours.enabled, false)
     and prev_hours.open_time > prev_hours.close_time
     and local_time < prev_hours.close_time then
    return true;
  end if;

  return false;
end;
$function$;


CREATE OR REPLACE FUNCTION public.is_branch_website_open(p_branch_id bigint, p_at timestamp with time zone DEFAULT now())
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_business_id uuid;
  s public.branch_website_settings%rowtype;
begin
  v_business_id:=public.mt1_require_request_business();
  perform public.mt1_require_public_branch(p_branch_id);
  select * into s
  from public.branch_website_settings
  where branch_id = p_branch_id
    and business_id=v_business_id;

  if found then
    if not coalesce(s.orders_open, true) then
      return false;
    end if;

    if s.orders_paused_until is not null
       and s.orders_paused_until > p_at then
      return false;
    end if;
  end if;

  return public.is_branch_website_schedule_open(p_branch_id, p_at);
end;
$function$;


CREATE OR REPLACE FUNCTION public.preview_promo_code(p_code text, p_branch_id bigint, p_channel text, p_customer_phone text, p_items jsonb, p_subtotal numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_business_id uuid;
  v public.promo_codes%rowtype;
  v_phone text;
  v_used integer:=0;
  v_phone_used integer:=0;
  v_eligible numeric(12,2):=0;
  v_discount numeric(12,2):=0;
  x jsonb;
  v_product_id bigint;
  v_line numeric(12,2);
begin
  v_business_id:=public.mt1_require_request_business();
  perform public.mt1_require_public_branch(p_branch_id);
  perform public.mt1_assert_restaurant_items(p_items,v_business_id);

  select * into v
  from public.promo_codes
  where business_id=v_business_id
    and upper(trim(code))=upper(trim(coalesce(p_code,'')))
  limit 1;

  if not found or v.active=false then raise exception 'البرومو كود غير صحيح أو غير فعال'; end if;
  if v.starts_at is not null and now()<v.starts_at then raise exception 'البرومو كود لم يبدأ بعد'; end if;
  if v.ends_at is not null and now()>v.ends_at then raise exception 'انتهت صلاحية البرومو كود'; end if;
  if v.channel<>'both' and v.channel<>p_channel then raise exception 'البرومو كود غير متاح على هذه القناة'; end if;
  if coalesce(p_subtotal,0)<coalesce(v.min_order,0) then raise exception 'الحد الأدنى للطلب هو %',v.min_order; end if;

  if exists(select 1 from public.promo_code_branches where business_id=v_business_id and promo_code_id=v.id)
     and not exists(select 1 from public.promo_code_branches where business_id=v_business_id and promo_code_id=v.id and branch_id=p_branch_id) then
    raise exception 'البرومو كود غير متاح لهذا الفرع';
  end if;

  select count(*) into v_used from public.promo_redemptions where business_id=v_business_id and promo_code_id=v.id;
  if v.max_uses is not null and v.max_uses>0 and v_used>=v.max_uses then raise exception 'تم استنفاد عدد استخدامات البرومو كود'; end if;

  v_phone:=regexp_replace(coalesce(p_customer_phone,''),'\D','','g');
  if coalesce(v.max_uses_per_phone,0)>0 then
    if length(v_phone)<8 then raise exception 'رقم الموبايل مطلوب لاستخدام البرومو كود'; end if;
    select count(*) into v_phone_used from public.promo_redemptions
    where business_id=v_business_id and promo_code_id=v.id and regexp_replace(coalesce(customer_phone,''),'\D','','g')=v_phone;
    if v_phone_used>=v.max_uses_per_phone then raise exception 'تم استخدام البرومو كود بالحد الأقصى لهذا الرقم'; end if;
  end if;

  if v.scope='all' then
    v_eligible:=coalesce(p_subtotal,0);
  else
    for x in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
      v_product_id:=nullif(x->>'product_id','')::bigint;
      v_line:=coalesce((x->>'line_total')::numeric,0);
      if v.scope='products' and exists(select 1 from public.promo_code_products pp where pp.business_id=v_business_id and pp.promo_code_id=v.id and pp.product_id=v_product_id) then
        v_eligible:=v_eligible+v_line;
      elsif v.scope='categories' and exists(
        select 1 from public.products p join public.promo_code_categories pc on pc.category_id=p.category_id and pc.business_id=v_business_id
        where p.business_id=v_business_id and p.id=v_product_id and pc.promo_code_id=v.id
      ) then
        v_eligible:=v_eligible+v_line;
      end if;
    end loop;
  end if;

  if v_eligible<=0 then raise exception 'البرومو كود لا ينطبق على الأصناف الموجودة في الطلب'; end if;
  if v.discount_type='percent' then v_discount:=round(v_eligible*v.discount_value/100,2);
  else v_discount:=least(v.discount_value,v_eligible); end if;
  if v.max_discount is not null and v.max_discount>0 then v_discount:=least(v_discount,v.max_discount); end if;
  v_discount:=greatest(0,least(v_discount,coalesce(p_subtotal,0)));

  return jsonb_build_object(
    'valid',true,'promo_id',v.id,'code',v.code,'name',coalesce(v.name,v.code),
    'discount',v_discount,'eligible_subtotal',v_eligible,'discount_type',v.discount_type,'discount_value',v.discount_value
  );
end;
$function$;


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


CREATE OR REPLACE FUNCTION public.track_website_order(p_website_order_id bigint, p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare w public.website_orders%rowtype;
declare o public.orders%rowtype;
declare v_business_id uuid;
begin
  v_business_id:=public.mt1_require_request_business();
  select * into w
  from public.website_orders
  where id=p_website_order_id
    and business_id=v_business_id
    and public.normalize_website_phone(customer_phone)=public.normalize_website_phone(p_phone);

  if not found then
    raise exception 'الطلب غير موجود أو رقم الهاتف غير مطابق';
  end if;

  if w.order_id is not null then
    select * into o from public.orders where id=w.order_id and business_id=v_business_id;
  end if;

  return jsonb_build_object(
    'id',w.id,
    'status',
      case
        when w.status='accepted' and o.id is not null then o.status
        else w.status
      end,
    'payment_status',coalesce(o.payment_status,w.payment_status,'unpaid'),
    'created_at',w.created_at,
    'accepted_at',w.accepted_at,
    'branch_id',w.branch_id,
    'total',w.total,
    'order_type',coalesce(w.order_type,'delivery'),
    'can_cancel',
      case
        when w.status='pending' then true
        when w.status='accepted' and o.id is not null and o.status='new' then true
        else false
      end
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.track_website_orders(p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_phone text;
  v_result jsonb;
  v_business_id uuid;
begin
  v_business_id:=public.mt1_require_request_business();
  v_phone:=public.normalize_website_phone(p_phone);
  if length(v_phone)<10 then raise exception 'رقم الموبايل غير صحيح'; end if;

  select coalesce(jsonb_agg(x.obj order by x.created_at desc),'[]'::jsonb)
  into v_result
  from (
    select
      w.created_at,
      jsonb_build_object(
        'id',w.id,
        'status',
          case
            when w.status='accepted' and o.id is not null then o.status
            else w.status
          end,
        'payment_status',coalesce(o.payment_status,w.payment_status,'unpaid'),
        'created_at',w.created_at,
        'branch_id',w.branch_id,
        'branch_name',coalesce(b.name,''),
        'total',w.total,
        'order_type',coalesce(w.order_type,'delivery'),
        'can_cancel',
          case
            when w.status='pending' then true
            when w.status='accepted' and o.id is not null and o.status='new' then true
            else false
          end
      ) obj
    from public.website_orders w
    left join public.orders o on o.id=w.order_id and o.business_id=v_business_id
    left join public.branches b on b.id=w.branch_id and b.business_id=v_business_id
    where w.business_id=v_business_id
      and public.normalize_website_phone(w.customer_phone)=v_phone
    order by w.created_at desc
    limit 20
  ) x;

  return coalesce(v_result,'[]'::jsonb);
end;
$function$;


CREATE OR REPLACE FUNCTION public.cancel_website_order_customer(p_website_order_id bigint, p_phone text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  w public.website_orders%rowtype;
  o public.orders%rowtype;
  s public.website_settings%rowtype;
  v_business_id uuid;
begin
  v_business_id:=public.mt1_require_request_business();
  select * into s
  from public.website_settings
  where business_id=v_business_id
  limit 1;

  if found and (
    s.allow_customer_cancel=false
    or s.show_cancel_order=false
  ) then
    raise exception 'إلغاء الطلب غير متاح حاليًا';
  end if;

  select * into w
  from public.website_orders
  where id=p_website_order_id
    and business_id=v_business_id
  for update;

  if not found
     or public.normalize_website_phone(w.customer_phone)
        <> public.normalize_website_phone(p_phone) then
    raise exception 'الطلب غير موجود أو رقم الهاتف غير مطابق';
  end if;

  if w.status='pending' then

    delete from public.promo_redemptions
    where business_id=v_business_id
      and website_order_id=w.id;

    update public.website_orders
    set
      status='rejected',
      rejected_at=now(),
      cancelled_by_customer_at=now()
    where id=w.id and business_id=v_business_id;

    return true;
  end if;

  if w.status='accepted' and w.order_id is not null then

    select * into o
    from public.orders
    where id=w.order_id
      and business_id=v_business_id
    for update;

    if not found then
      raise exception 'تعذر العثور على الطلب داخل الفرع';
    end if;

    if o.status<>'new' then
      raise exception 'بدأ تجهيز الطلب ولا يمكن إلغاؤه من الموقع';
    end if;

    update public.orders
    set status='cancelled'
    where id=o.id and business_id=v_business_id;

    delete from public.promo_redemptions
    where business_id=v_business_id
      and website_order_id=w.id;

    update public.website_orders
    set
      status='rejected',
      rejected_at=now(),
      cancelled_by_customer_at=now()
    where id=w.id and business_id=v_business_id;

    return true;
  end if;

  raise exception 'بدأ تجهيز الطلب ولا يمكن إلغاؤه من الموقع';
end;
$function$;

-- Old create_website_order overloads remain present for authenticated legacy use,
-- but anonymous EXECUTE is explicitly revoked. Only the latest 12-argument public
-- contract is retained for the website.
revoke execute on function public.create_website_order(bigint,text,text,text,text,jsonb) from anon;
revoke execute on function public.create_website_order(bigint,text,text,text,text,jsonb,text,text,text) from anon;
grant execute on function public.create_website_order(bigint,text,text,text,text,jsonb,text,text,text,text,text,bigint) to anon;

-- Staff lifecycle RPCs are never public website APIs.
revoke execute on function public.accept_website_order(bigint) from anon;
revoke execute on function public.reject_website_order(bigint) from anon;

commit;
