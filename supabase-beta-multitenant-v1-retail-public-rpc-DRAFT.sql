-- Sharawla POS — Beta Multi-Tenant V1 Retail public RPC hardening
-- SOURCE PREPARATION ONLY. Live Beta bodies are pinned below and tenant-bound.

begin;

do $guard$
begin
  if current_setting('sharawla.multitenant_apply', true) is distinct from 'beta-only-approved' then
    raise exception 'MULTITENANT_V1_SOURCE_ONLY: explicit Beta apply guard is not set';
  end if;
end
$guard$;

create or replace function public.mt1_assert_retail_items(p_items jsonb,p_business_id uuid)
returns void
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $$
declare x jsonb; pid bigint;
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
  end loop;
end
$$;

revoke all on function public.mt1_assert_retail_items(jsonb,uuid) from public;
grant execute on function public.mt1_assert_retail_items(jsonb,uuid) to anon,authenticated;

CREATE OR REPLACE FUNCTION public.retail_website_bootstrap()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_business_id uuid;
  v_site jsonb;
  v_branches jsonb;
  v_payments jsonb;
  v_zones jsonb;
begin
  v_business_id:=public.mt1_require_request_business();

  select coalesce(to_jsonb(w),'{}'::jsonb)
  into v_site
  from public.website_settings w
  where w.business_id=v_business_id
  order by w.id
  limit 1;

  if v_site is null then
    v_site := '{}'::jsonb;
  end if;


  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', b.id,
        'name', b.name,
        'phone', b.phone,
        'address', b.address,
        'location_url', b.location_url,
        'whatsapp', b.whatsapp,
        'sort_order', b.sort_order,
        'orders_open',
          public.is_branch_website_open(b.id,now()),
        'prep_min',
          coalesce(s.prep_min,30),
        'prep_max',
          coalesce(s.prep_max,45)
      )
      order by coalesce(b.sort_order,b.id),b.id
    ),
    '[]'::jsonb
  )
  into v_branches

  from public.branches b

  left join public.branch_website_settings s
    on s.branch_id=b.id
   and s.business_id=v_business_id

  where b.business_id=v_business_id
    and b.active=true
    and coalesce(b.website_visible,true)=true;


  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'branch_id', bpm.branch_id,
        'code', pm.code,
        'name', pm.name,
        'kind', pm.kind,
        'payment_account', bpm.payment_account,
        'payment_instructions', bpm.payment_instructions,
        'allow_reference',
          coalesce(bpm.allow_reference,true),
        'allow_receipt_upload',
          coalesce(bpm.allow_receipt_upload,false)
      )
      order by bpm.branch_id,pm.sort_order,pm.id
    ),
    '[]'::jsonb
  )
  into v_payments

  from public.branch_payment_methods bpm

  join public.payment_methods pm
    on pm.id=bpm.payment_method_id
   and pm.business_id=v_business_id

  join public.branches b
    on b.id=bpm.branch_id
   and b.business_id=v_business_id

  where bpm.business_id=v_business_id
    and b.active=true
    and coalesce(b.website_visible,true)=true
    and pm.active=true
    and bpm.active=true
    and coalesce(bpm.website_enabled,false)=true;


  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', z.id,
        'branch_id', z.branch_id,
        'name', z.name,
        'delivery_fee', z.delivery_fee
      )
      order by z.branch_id,z.name,z.id
    ),
    '[]'::jsonb
  )
  into v_zones

  from public.delivery_zones z

  join public.branches b
    on b.id=z.branch_id
   and b.business_id=v_business_id

  where z.business_id=v_business_id
    and z.active=true
    and b.active=true
    and coalesce(b.website_visible,true)=true;


  return jsonb_build_object(
    'ok', true,
    'site', v_site,
    'branches', v_branches,
    'payment_methods', v_payments,
    'delivery_zones', v_zones,
    'server_time', now()
  );

end;
$function$;


CREATE OR REPLACE FUNCTION public.retail_website_branch_open(p_branch_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_business_id uuid;
  v_branch_active boolean;
  v_visible boolean;
begin
  v_business_id:=public.mt1_require_request_business();

  select
    active,
    coalesce(website_visible,true)
  into
    v_branch_active,
    v_visible
  from public.branches
  where id = p_branch_id
    and business_id=v_business_id;

  if not found then
    return false;
  end if;

  if v_branch_active is not true then
    return false;
  end if;

  if v_visible is not true then
    return false;
  end if;

  return public.is_branch_website_open(
    p_branch_id,
    now()
  );

end;
$function$;


CREATE OR REPLACE FUNCTION public.retail_website_catalog(p_branch_id bigint)
 RETURNS TABLE(product_id bigint, name text, barcode text, price numeric, category_id bigint, category_name text, image_url text, unit_type text, allow_decimal boolean, qty_step numeric, min_qty numeric, available_qty numeric, online_enabled boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$

  select
    p.id,
    p.name,
    p.barcode,

    coalesce(
      bp.price_override,
      p.price
    )::numeric,

    p.category_id,
    c.name,

    p.image_url,

    coalesce(
      ps.unit_type,
      'piece'
    ),

    coalesce(
      ps.allow_decimal,
      false
    ),

    coalesce(
      ps.qty_step,
      1
    )::numeric,

    coalesce(
      ps.min_qty,
      1
    )::numeric,

    greatest(
      0,

      coalesce(
        b.quantity,
        0
      )

      -

      coalesce(
        (
          select sum(r.quantity)

          from public.retail_stock_reservations r

          where r.business_id=public.request_business_id()
            and r.branch_id=p_branch_id
            and r.product_id=p.id
            and r.status='active'
            and r.expires_at>now()
        ),
        0
      )
    )::numeric,

    coalesce(
      ps.online_enabled,
      true
    )

  from public.products p

  left join public.categories c
    on c.id=p.category_id
   and c.business_id=public.request_business_id()

  join public.branch_products bp
    on bp.product_id=p.id
    and bp.branch_id=p_branch_id
    and bp.business_id=public.request_business_id()

  left join public.retail_product_settings ps
    on ps.product_id=p.id
   and ps.business_id=public.request_business_id()

  left join public.retail_inventory_balances b
    on b.product_id=p.id
    and b.branch_id=p_branch_id
    and b.business_id=public.request_business_id()

  where p.business_id=public.request_business_id()
    and exists(select 1 from public.branches br where br.id=p_branch_id and br.business_id=public.request_business_id() and br.active is distinct from false and br.website_visible=true)
    and p.active=true
    and bp.active=true

    and coalesce(
      p.website_visible,
      true
    )=true

    and coalesce(
      bp.website_paused_until,
      '-infinity'::timestamptz
    )<=now()

    and coalesce(
      ps.online_enabled,
      true
    )=true

    and (
      c.id is null
      or (
        c.active=true
        and coalesce(
          c.website_visible,
          true
        )=true
      )
    )

  order by
    coalesce(
      c.website_sort_order,
      999999
    ),

    coalesce(
      p.website_sort_order,
      999999
    ),

    p.name,
    p.id;

$function$;


CREATE OR REPLACE FUNCTION public.retail_website_offer_discount(p_branch_id bigint, p_product_id bigint, p_quantity numeric, p_unit_price numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_business_id uuid;
  v_offer public.retail_offers%rowtype;

  v_qty numeric(14,3);
  v_price numeric(14,4);

  v_discount numeric(14,4) := 0;
  v_sets numeric := 0;

begin
  v_business_id:=public.mt1_require_request_business();
  perform public.mt1_require_public_branch(p_branch_id);
  if not exists(select 1 from public.products p where p.id=p_product_id and p.business_id=v_business_id) then
    raise exception 'ITEM_NOT_AVAILABLE';
  end if;

  v_qty := round(
    greatest(
      coalesce(p_quantity,0),
      0
    ),
    3
  );

  v_price := greatest(
    coalesce(p_unit_price,0),
    0
  );


  select o.*
  into v_offer
  from public.retail_offers o

  where o.business_id=v_business_id
    and o.active = true
    and coalesce(o.website_enabled,false) = true

    and (
      o.branch_id is null
      or o.branch_id = p_branch_id
    )

    and (
      o.starts_at is null
      or o.starts_at <= now()
    )

    and (
      o.ends_at is null
      or o.ends_at >= now()
    )

    and (
      not exists (
        select 1
        from public.retail_offer_products op0
        where op0.business_id=v_business_id and op0.offer_id = o.id
      )

      or exists (
        select 1
        from public.retail_offer_products op
        where op.business_id=v_business_id and op.offer_id = o.id
          and op.product_id = p_product_id
      )
    )

  order by
    o.priority asc,
    o.id asc

  limit 1;


  if not found then
    return 0;
  end if;


  if v_offer.rule_type = 'percent' then

    v_discount :=
      v_price
      * v_qty
      * greatest(
          0,
          least(
            100,
            coalesce(v_offer.value,0)
          )
        )
      / 100;


  elsif v_offer.rule_type = 'fixed' then

    v_discount :=
      least(
        v_price * v_qty,
        greatest(
          0,
          coalesce(v_offer.value,0)
        ) * v_qty
      );


  elsif v_offer.rule_type = 'second_half' then

    v_discount :=
      floor(v_qty / 2)
      * v_price
      * 0.5;


  elsif v_offer.rule_type = 'buy_x_get_y' then

    if coalesce(v_offer.buy_qty,0) > 0
       and coalesce(v_offer.get_qty,0) > 0
    then

      v_sets :=
        floor(
          v_qty /
          (
            v_offer.buy_qty
            +
            v_offer.get_qty
          )
        );

      v_discount :=
        v_sets
        * v_offer.get_qty
        * v_price;

    end if;

  end if;


  return round(
    greatest(
      0,
      least(
        v_discount,
        v_price * v_qty
      )
    ),
    2
  );

end;
$function$;


CREATE OR REPLACE FUNCTION public.retail_website_quote(p_branch_id bigint, p_order_type text, p_delivery_zone_id bigint, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_business_id uuid;
  v_type text :=
    lower(coalesce(nullif(trim(p_order_type),''),'pickup'));

  v_row record;
  v_product public.products%rowtype;
  v_ps public.retail_product_settings%rowtype;
  v_bp public.branch_products%rowtype;

  v_bal numeric(14,3);
  v_reserved numeric(14,3);
  v_available numeric(14,3);

  v_qty numeric(14,3);
  v_price numeric(14,4);
  v_line numeric(14,2);
  v_offer numeric(14,2);

  v_subtotal numeric(14,2) := 0;
  v_discount numeric(14,2) := 0;
  v_delivery numeric(14,2) := 0;

  v_items jsonb := '[]'::jsonb;

begin
  v_business_id:=public.mt1_require_request_business();
  perform public.mt1_require_public_branch(p_branch_id);
  perform public.mt1_assert_retail_items(p_items,v_business_id);


  if v_type not in ('pickup','delivery') then
    raise exception 'نوع الطلب غير صالح';
  end if;


  if jsonb_typeof(
    coalesce(p_items,'[]'::jsonb)
  ) <> 'array'
  or jsonb_array_length(
    coalesce(p_items,'[]'::jsonb)
  ) = 0
  then
    raise exception 'السلة فارغة';
  end if;


  if jsonb_array_length(p_items) > 100 then
    raise exception 'عدد الأصناف أكبر من الحد المسموح';
  end if;


  if not public.retail_website_branch_open(
    p_branch_id
  )
  then
    raise exception 'الفرع غير متاح لاستقبال الطلبات الآن';
  end if;


  if v_type = 'delivery' then

    if p_delivery_zone_id is null then
      raise exception 'منطقة التوصيل مطلوبة';
    end if;


    select
      round(
        greatest(
          coalesce(z.delivery_fee,0),
          0
        ),
        2
      )

    into v_delivery

    from public.delivery_zones z

    where z.business_id=v_business_id

      and z.id = p_delivery_zone_id
      and z.branch_id = p_branch_id
      and z.active = true;


    if not found then
      raise exception 'منطقة التوصيل غير متاحة لهذا الفرع';
    end if;

  end if;


  for v_row in

    select
      x.product_id,
      sum(x.quantity)::numeric as quantity

    from jsonb_to_recordset(p_items)
      as x(
        product_id bigint,
        quantity numeric
      )

    group by x.product_id
    order by x.product_id

  loop

    select *
    into v_product

    from public.products

    where id = v_row.product_id
      and active = true
      and coalesce(website_visible,true) = true;


    if not found then
      raise exception 'أحد الأصناف غير متاح على الموقع';
    end if;


    select *
    into v_bp

    from public.branch_products

    where branch_id = p_branch_id
      and product_id = v_product.id
      and active = true

      and coalesce(
        website_paused_until,
        '-infinity'::timestamptz
      ) <= now();


    if not found then
      raise exception
        'الصنف % غير متاح في هذا الفرع',
        v_product.name;
    end if;


    select *
    into v_ps

    from public.retail_product_settings

    where business_id=v_business_id

      and product_id = v_product.id;


    if found
       and coalesce(
         v_ps.online_enabled,
         true
       ) = false
    then
      raise exception
        'الصنف % غير متاح أونلاين',
        v_product.name;
    end if;


    v_qty :=
      round(
        coalesce(v_row.quantity,0),
        3
      );


    if v_qty <= 0 then
      raise exception
        'كمية غير صالحة للصنف %',
        v_product.name;
    end if;


    if v_qty <
       coalesce(
         v_ps.min_qty,
         1
       )
    then
      raise exception
        'الكمية أقل من الحد الأدنى للصنف %',
        v_product.name;
    end if;


    if coalesce(
      v_ps.allow_decimal,
      false
    ) = false
    and v_qty <> trunc(v_qty)
    then
      raise exception
        'الصنف % لا يقبل كمية عشرية',
        v_product.name;
    end if;


    if coalesce(v_ps.qty_step,1) > 0
       and abs(
         (
           v_qty /
           coalesce(v_ps.qty_step,1)
         )
         -
         round(
           v_qty /
           coalesce(v_ps.qty_step,1)
         )
       ) > 0.0001
    then
      raise exception
        'كمية الصنف % لا تطابق خطوة البيع',
        v_product.name;
    end if;


    select coalesce(quantity,0)
    into v_bal

    from public.retail_inventory_balances

    where business_id=v_business_id

      and branch_id = p_branch_id
      and product_id = v_product.id;


    select coalesce(sum(quantity),0)
    into v_reserved

    from public.retail_stock_reservations

    where business_id=v_business_id

      and branch_id = p_branch_id
      and product_id = v_product.id
      and status = 'active'
      and expires_at > now();


    v_available :=
      greatest(
        0,
        coalesce(v_bal,0)
        -
        coalesce(v_reserved,0)
      );


    if v_qty > v_available then
      raise exception
        'الكمية المطلوبة من % أكبر من المتاح',
        v_product.name;
    end if;


    v_price :=
      coalesce(
        v_bp.price_override,
        v_product.price,
        0
      );


    v_line :=
      round(
        v_price * v_qty,
        2
      );


    v_offer :=
      public.retail_website_offer_discount(
        p_branch_id,
        v_product.id,
        v_qty,
        v_price
      );


    v_subtotal :=
      v_subtotal + v_line;


    v_discount :=
      v_discount + v_offer;


    v_items :=
      v_items
      ||
      jsonb_build_array(
        jsonb_build_object(
          'product_id',
            v_product.id,

          'product_name',
            v_product.name,

          'quantity',
            v_qty,

          'unit_price',
            v_price,

          'line_subtotal',
            v_line,

          'offer_discount',
            v_offer,

          'line_total',
            round(
              greatest(
                0,
                v_line - v_offer
              ),
              2
            ),

          'available_qty',
            v_available
        )
      );

  end loop;


  v_discount :=
    round(
      least(
        v_subtotal,
        greatest(
          0,
          v_discount
        )
      ),
      2
    );


  return jsonb_build_object(
    'ok', true,

    'items',
      v_items,

    'subtotal',
      round(v_subtotal,2),

    'offer_discount',
      v_discount,

    'delivery_fee',
      v_delivery,

    'total',
      round(
        greatest(
          0,
          v_subtotal
          -
          v_discount
          +
          v_delivery
        ),
        2
      )
  );

end;
$function$;


CREATE OR REPLACE FUNCTION public.retail_create_website_order_legacy_mt1_v1(p_branch_id bigint, p_idempotency_key text, p_reservation_key text, p_customer_name text, p_customer_phone text, p_order_type text, p_delivery_zone_id bigint, p_customer_address text, p_customer_notes text, p_payment_method_code text, p_payment_reference text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare

  v_idem text;
  v_res_key text;
  v_phone text;
  v_type text;
  v_pay text;

  v_existing public.retail_website_orders%rowtype;
  v_order public.retail_website_orders%rowtype;

  v_row record;

  v_product public.products%rowtype;
  v_ps public.retail_product_settings%rowtype;
  v_bp public.branch_products%rowtype;
  v_balance public.retail_inventory_balances%rowtype;

  v_qty numeric(14,3);
  v_price numeric(14,4);
  v_line numeric(14,2);
  v_offer numeric(14,2);

  v_reserved numeric(14,3);
  v_available numeric(14,3);

  v_subtotal numeric(14,2) := 0;
  v_discount numeric(14,2) := 0;
  v_delivery numeric(14,2) := 0;
  v_total numeric(14,2) := 0;

  v_expiry timestamptz :=
    now() + interval '15 minutes';

  v_items jsonb := '[]'::jsonb;

begin

  v_idem :=
    nullif(
      trim(coalesce(p_idempotency_key,'')),
      ''
    );

  v_res_key :=
    nullif(
      trim(coalesce(p_reservation_key,'')),
      ''
    );

  v_phone :=
    public.retail_website_normalize_phone(
      p_customer_phone
    );

  v_type :=
    lower(
      coalesce(
        nullif(trim(p_order_type),''),
        'pickup'
      )
    );

  v_pay :=
    lower(
      coalesce(
        nullif(
          trim(p_payment_method_code),
          ''
        ),
        'cash'
      )
    );


  if v_idem is null
     or length(v_idem) < 8
     or length(v_idem) > 160
  then
    raise exception 'معرف الطلب غير صالح';
  end if;


  if v_res_key is null
     or length(v_res_key) < 8
     or length(v_res_key) > 160
  then
    raise exception 'معرف الحجز غير صالح';
  end if;


  if nullif(
    trim(coalesce(p_customer_name,'')),
    ''
  ) is null
  then
    raise exception 'اسم العميل مطلوب';
  end if;


  if length(v_phone) < 10
     or length(v_phone) > 15
  then
    raise exception 'رقم الهاتف غير صالح';
  end if;


  if v_type not in ('pickup','delivery') then
    raise exception 'نوع الطلب غير صالح';
  end if;


  if jsonb_typeof(
    coalesce(p_items,'[]'::jsonb)
  ) <> 'array'
  then
    raise exception 'صيغة السلة غير صالحة';
  end if;


  if jsonb_array_length(
    coalesce(p_items,'[]'::jsonb)
  ) = 0
  then
    raise exception 'السلة فارغة';
  end if;


  if jsonb_array_length(p_items) > 100 then
    raise exception 'عدد الأصناف أكبر من الحد المسموح';
  end if;


  if not public.retail_website_branch_open(
    p_branch_id
  )
  then
    raise exception 'الفرع غير متاح لاستقبال الطلبات الآن';
  end if;


  perform pg_advisory_xact_lock(
    hashtextextended(
      'retail-web-idem:' || v_idem,
      0
    )
  );


  perform pg_advisory_xact_lock(
    hashtextextended(
      'retail-web-res:' || v_res_key,
      0
    )
  );


  select *
  into v_existing
  from public.retail_website_orders
  where idempotency_key = v_idem;


  if found then

    return jsonb_build_object(
      'ok', true,
      'id', v_existing.id,
      'order_code', v_existing.public_order_code,
      'status', v_existing.status,
      'subtotal', v_existing.subtotal,
      'offer_discount', v_existing.offer_discount,
      'delivery_fee', v_existing.delivery_fee,
      'total', v_existing.total,
      'reservation_expires_at',
        v_existing.reservation_expires_at,
      'idempotent', true
    );

  end if;


  if exists (
    select 1
    from public.retail_website_orders
    where reservation_key = v_res_key
  )
  then
    raise exception 'معرف الحجز مستخدم من قبل';
  end if;


  if (
    select count(*)
    from public.retail_website_orders w

    where w.branch_id = p_branch_id
      and w.customer_phone = v_phone
      and w.status = 'pending'
      and w.reservation_expires_at > now()
      and w.created_at >
        now() - interval '10 minutes'
  ) >= 3
  then
    raise exception 'يوجد عدة طلبات معلقة لهذا الرقم. حاول بعد قليل';
  end if;


  -- ----------------------------------------------------------
  -- Payment method
  -- ----------------------------------------------------------

  if not exists (

    select 1

    from public.payment_methods pm

    join public.branch_payment_methods bpm
      on bpm.payment_method_id = pm.id

    where pm.code = v_pay
      and pm.active = true

      and bpm.branch_id = p_branch_id
      and bpm.active = true
      and coalesce(
        bpm.website_enabled,
        false
      ) = true

  )
  then
    raise exception 'طريقة الدفع غير متاحة على الموقع لهذا الفرع';
  end if;


  -- ----------------------------------------------------------
  -- Delivery
  -- ----------------------------------------------------------

  if v_type = 'delivery' then

    if p_delivery_zone_id is null then
      raise exception 'منطقة التوصيل مطلوبة';
    end if;


    select
      round(
        greatest(
          coalesce(z.delivery_fee,0),
          0
        ),
        2
      )

    into v_delivery

    from public.delivery_zones z

    where z.id = p_delivery_zone_id
      and z.branch_id = p_branch_id
      and z.active = true;


    if not found then
      raise exception 'منطقة التوصيل غير متاحة لهذا الفرع';
    end if;


    if nullif(
      trim(coalesce(p_customer_address,'')),
      ''
    ) is null
    then
      raise exception 'عنوان التوصيل مطلوب';
    end if;


  else

    v_delivery := 0;

  end if;


  -- ----------------------------------------------------------
  -- Items
  -- ----------------------------------------------------------

  for v_row in

    select

      nullif(
        x->>'product_id',
        ''
      )::bigint as product_id,

      round(
        sum(
          coalesce(
            (x->>'quantity')::numeric,
            0
          )
        ),
        3
      ) as quantity,

      max(
        nullif(
          trim(
            coalesce(
              x->>'notes',
              ''
            )
          ),
          ''
        )
      ) as notes

    from jsonb_array_elements(p_items) x

    where nullif(
      x->>'product_id',
      ''
    ) is not null

    group by
      nullif(
        x->>'product_id',
        ''
      )::bigint

    order by
      nullif(
        x->>'product_id',
        ''
      )::bigint

  loop

    v_qty := v_row.quantity;


    if v_qty <= 0 then
      raise exception 'كمية صنف غير صحيحة';
    end if;


    select *
    into v_product
    from public.products

    where id = v_row.product_id
      and active = true
      and coalesce(
        website_visible,
        true
      ) = true;


    if not found then
      raise exception 'أحد الأصناف غير متاح';
    end if;


    select *
    into v_ps
    from public.retail_product_settings
    where product_id = v_product.id;


    if found then

      if coalesce(
        v_ps.online_enabled,
        true
      ) is not true
      then
        raise exception
          'الصنف % غير متاح أونلاين',
          v_product.name;
      end if;


      if v_qty <
         coalesce(
           v_ps.min_qty,
           1
         )
      then
        raise exception
          'الكمية أقل من الحد الأدنى للصنف %',
          v_product.name;
      end if;


      if not coalesce(
        v_ps.allow_decimal,
        false
      )
      and v_qty <> trunc(v_qty)
      then
        raise exception
          'الصنف % لا يسمح بكمية عشرية',
          v_product.name;
      end if;


      if coalesce(v_ps.qty_step,1) <= 0 then
        raise exception
          'خطوة البيع غير صالحة للصنف %',
          v_product.name;
      end if;


      if abs(
        (
          v_qty /
          coalesce(v_ps.qty_step,1)
        )
        -
        round(
          v_qty /
          coalesce(v_ps.qty_step,1)
        )
      ) > 0.0001
      then
        raise exception
          'كمية الصنف % لا تطابق خطوة البيع',
          v_product.name;
      end if;

    end if;


    select *
    into v_bp
    from public.branch_products

    where branch_id = p_branch_id
      and product_id = v_product.id;


    if found
       and v_bp.active is false
    then
      raise exception
        'الصنف % غير متاح في هذا الفرع',
        v_product.name;
    end if;


    if found
       and v_bp.website_unavailable_until is not null
       and v_bp.website_unavailable_until > now()
    then
      raise exception
        'الصنف % غير متاح مؤقتًا',
        v_product.name;
    end if;


    if found
       and v_bp.website_paused_until is not null
       and v_bp.website_paused_until > now()
    then
      raise exception
        'الصنف % موقوف مؤقتًا على الموقع',
        v_product.name;
    end if;


    v_price :=
      coalesce(
        v_bp.price_override,
        v_product.price,
        0
      );


    if v_price < 0 then
      raise exception 'سعر الصنف غير صالح';
    end if;


    insert into public.retail_inventory_balances (
      branch_id,
      product_id,
      quantity
    )
    values (
      p_branch_id,
      v_product.id,
      0
    )
    on conflict (
      business_id,
      branch_id,
      product_id
    )
    do nothing;


    select *
    into v_balance
    from public.retail_inventory_balances

    where branch_id = p_branch_id
      and product_id = v_product.id

    for update;


    update public.retail_stock_reservations

    set status = 'expired'

    where branch_id = p_branch_id
      and product_id = v_product.id
      and status = 'active'
      and expires_at <= now();


    select
      coalesce(
        sum(r.quantity),
        0
      )

    into v_reserved

    from public.retail_stock_reservations r

    where r.branch_id = p_branch_id
      and r.product_id = v_product.id
      and r.status = 'active'
      and r.expires_at > now();


    v_available :=
      round(
        coalesce(v_balance.quantity,0)
        -
        v_reserved,
        3
      );


    if coalesce(
      v_balance.track_inventory,
      true
    )
    and v_available < v_qty
    then
      raise exception
        'المخزون غير كافٍ للصنف % — المتاح %',
        v_product.name,
        v_available;
    end if;


    v_line :=
      round(
        v_price * v_qty,
        2
      );


    v_offer :=
      public.retail_website_offer_discount(
        p_branch_id,
        v_product.id,
        v_qty,
        v_price
      );


    v_subtotal :=
      v_subtotal
      +
      v_line;


    v_discount :=
      v_discount
      +
      least(
        v_line,
        v_offer
      );


    v_items :=
      v_items
      ||
      jsonb_build_array(
        jsonb_build_object(

          'product_id',
          v_product.id,

          'product_name',
          v_product.name,

          'unit_type',
          coalesce(
            v_ps.unit_type,
            'piece'
          ),

          'quantity',
          v_qty,

          'unit_price',
          v_price,

          'unit_cost_snapshot',
          coalesce(v_product.cost,0),

          'line_subtotal',
          v_line,

          'offer_discount',
          least(
            v_line,
            v_offer
          ),

          'line_total',
          round(
            greatest(
              0,
              v_line
              -
              least(
                v_line,
                v_offer
              )
            ),
            2
          ),

          'notes',
          v_row.notes
        )
      );

  end loop;


  if jsonb_array_length(v_items) = 0 then
    raise exception 'السلة لا تحتوي أصنافًا صالحة';
  end if;


  v_discount :=
    round(
      least(
        v_subtotal,
        greatest(
          0,
          v_discount
        )
      ),
      2
    );


  v_total :=
    round(
      greatest(
        0,
        v_subtotal
        -
        v_discount
        +
        v_delivery
      ),
      2
    );


  insert into public.retail_website_orders (

    branch_id,
    idempotency_key,
    reservation_key,

    customer_name,
    customer_phone,

    customer_address,
    customer_notes,

    order_type,
    delivery_zone_id,

    payment_method_code,
    payment_status,
    payment_reference,

    subtotal,
    offer_discount,
    delivery_fee,
    total,

    status,
    reservation_expires_at

  )
  values (

    p_branch_id,
    v_idem,
    v_res_key,

    trim(p_customer_name),
    v_phone,

    nullif(
      trim(coalesce(p_customer_address,'')),
      ''
    ),

    nullif(
      trim(coalesce(p_customer_notes,'')),
      ''
    ),

    v_type,

    case
      when v_type = 'delivery'
        then p_delivery_zone_id
      else null
    end,

    v_pay,

    case
      when nullif(
        trim(
          coalesce(
            p_payment_reference,
            ''
          )
        ),
        ''
      ) is null
        then 'unpaid'
      else 'proof_submitted'
    end,

    nullif(
      trim(
        coalesce(
          p_payment_reference,
          ''
        )
      ),
      ''
    ),

    v_subtotal,
    v_discount,
    v_delivery,
    v_total,

    'pending',
    v_expiry
  )

  returning *
  into v_order;


  update public.retail_website_orders

  set public_order_code =
    'RW-'
    ||
    lpad(
      v_order.id::text,
      8,
      '0'
    )

  where id = v_order.id

  returning *
  into v_order;


  insert into public.retail_website_order_items (

    retail_website_order_id,

    product_id,
    product_name,
    unit_type,

    quantity,
    unit_price,
    unit_cost_snapshot,

    line_subtotal,
    offer_discount,
    line_total,

    notes

  )

  select

    v_order.id,

    x.product_id,
    x.product_name,
    x.unit_type,

    x.quantity,
    x.unit_price,
    x.unit_cost_snapshot,

    x.line_subtotal,
    x.offer_discount,
    x.line_total,

    x.notes

  from jsonb_to_recordset(v_items)
  as x (

    product_id bigint,
    product_name text,
    unit_type text,

    quantity numeric,
    unit_price numeric,
    unit_cost_snapshot numeric,

    line_subtotal numeric,
    offer_discount numeric,
    line_total numeric,

    notes text
  );


  insert into public.retail_stock_reservations (

    branch_id,
    product_id,
    quantity,

    reservation_key,

    status,
    expires_at,
    website_order_id
  )

  select

    p_branch_id,
    x.product_id,
    x.quantity,

    v_res_key,

    'active',
    v_expiry,
    v_order.id

  from jsonb_to_recordset(v_items)
  as x (
    product_id bigint,
    quantity numeric
  );


  return jsonb_build_object(

    'ok', true,

    'id',
    v_order.id,

    'order_code',
    v_order.public_order_code,

    'status',
    v_order.status,

    'subtotal',
    v_order.subtotal,

    'offer_discount',
    v_order.offer_discount,

    'delivery_fee',
    v_order.delivery_fee,

    'total',
    v_order.total,

    'reservation_expires_at',
    v_order.reservation_expires_at,

    'idempotent',
    false
  );

end;
$function$;


CREATE OR REPLACE FUNCTION public.retail_create_website_order(
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
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_business_id uuid;
  v_idem text;
  v_res text;
begin
  v_business_id:=public.mt1_require_request_business();
  perform public.mt1_require_public_branch(p_branch_id);
  perform public.mt1_assert_retail_items(p_items,v_business_id);

  if p_delivery_zone_id is not null and not exists(
    select 1 from public.delivery_zones z
    where z.id=p_delivery_zone_id and z.branch_id=p_branch_id and z.business_id=v_business_id
  ) then
    raise exception 'DELIVERY_ZONE_NOT_AVAILABLE';
  end if;

  v_idem:=v_business_id::text||':'||coalesce(p_idempotency_key,'');
  v_res:=v_business_id::text||':'||coalesce(p_reservation_key,'');

  return public.retail_create_website_order_legacy_mt1_v1(
    p_branch_id,v_idem,v_res,p_customer_name,p_customer_phone,p_order_type,
    p_delivery_zone_id,p_customer_address,p_customer_notes,p_payment_method_code,
    p_payment_reference,p_items
  );
end
$$;

CREATE OR REPLACE FUNCTION public.track_retail_website_order(p_order_code text, p_customer_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_business_id uuid;

  v_phone text;
  v_web public.retail_website_orders%rowtype;
  v_pos public.orders%rowtype;
  v_status text;

begin
  v_business_id:=public.mt1_require_request_business();

  v_phone :=
    public.retail_website_normalize_phone(
      p_customer_phone
    );


  select *
  into v_web
  from public.retail_website_orders

  where business_id=v_business_id
    and public_order_code =
    upper(
      trim(
        coalesce(
          p_order_code,
          ''
        )
      )
    )

    and customer_phone = v_phone;


  if not found then
    raise exception 'الطلب غير موجود';
  end if;


  if v_web.status = 'pending'
     and v_web.reservation_expires_at <= now()
  then

    v_status := 'expired';


  elsif v_web.accepted_order_id is not null then

    select *
    into v_pos
    from public.orders
    where id = v_web.accepted_order_id
      and business_id=v_business_id;


    v_status :=
      coalesce(
        v_pos.status,
        v_web.status
      );


  else

    v_status := v_web.status;

  end if;


  return jsonb_build_object(

    'ok', true,

    'order_code',
    v_web.public_order_code,

    'status',
    v_status,

    'order_type',
    v_web.order_type,

    'subtotal',
    v_web.subtotal,

    'offer_discount',
    v_web.offer_discount,

    'delivery_fee',
    v_web.delivery_fee,

    'total',
    v_web.total,

    'payment_status',
    v_web.payment_status,

    'created_at',
    v_web.created_at,

    'accepted_at',
    v_web.accepted_at
  );

end;
$function$;


CREATE OR REPLACE FUNCTION public.cancel_retail_website_order_customer(p_order_code text, p_customer_phone text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_business_id uuid;

  v_phone text;
  v_web public.retail_website_orders%rowtype;

begin
  v_business_id:=public.mt1_require_request_business();

  v_phone :=
    public.retail_website_normalize_phone(
      p_customer_phone
    );


  select *
  into v_web
  from public.retail_website_orders

  where business_id=v_business_id
    and public_order_code =
    upper(
      trim(
        coalesce(
          p_order_code,
          ''
        )
      )
    )

    and customer_phone = v_phone

  for update;


  if not found then
    raise exception 'الطلب غير موجود';
  end if;


  if v_web.status <> 'pending' then
    raise exception 'لا يمكن إلغاء الطلب في حالته الحالية';
  end if;


  update public.retail_website_orders

  set
    status = 'cancelled',
    cancelled_at = now(),
    updated_at = now()

  where id = v_web.id
    and business_id=v_business_id;


  update public.retail_stock_reservations

  set status = 'released'

  where business_id=v_business_id
    and website_order_id = v_web.id
    and reservation_key = v_web.reservation_key
    and status = 'active';


  return true;

end;
$function$;

revoke all on function public.retail_create_website_order_legacy_mt1_v1(bigint,text,text,text,text,text,bigint,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.retail_create_website_order(bigint,text,text,text,text,text,bigint,text,text,text,text,jsonb) to anon;

-- Identity V1 public entry stays blocked until its envelope receives the same tenant binding.
revoke execute on function public.retail_create_website_order_identity_v1(jsonb) from anon;
revoke execute on function public.cancel_retail_website_order_customer_identity_v1(text,text,text) from anon;

commit;
