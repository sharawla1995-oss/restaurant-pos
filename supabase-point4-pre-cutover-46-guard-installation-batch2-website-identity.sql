-- Sharawla Point 4 — Pre-Cutover 46 Guard Installation
-- Batch 2: Website identity lifecycle restructuring (#1, #3, #9, #19)
-- SOURCE ONLY. No deployment is performed by this commit.
-- Frozen set provenance: distinct retail_website_order_items.product_id @ v_web.branch_id.
-- Replay/early-return behavior remains before guard evaluation; guards precede mutation commitment.

-- accept_retail_website_order_identity_v1(text,text)
CREATE OR REPLACE FUNCTION public.accept_retail_website_order_identity_v1(p_document_uid text, p_client_tx_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_document_uid text;
  v_client_tx_id text;
  v_digest text;
  v_existing_mutation_id bigint;
  v_document public.retail_reservation_documents_identity_v1%rowtype;
  v_mutation public.retail_reservation_mutations_identity_v1%rowtype;
  v_web public.retail_website_orders%rowtype;
  v_emp bigint;
  v_shift bigint;
  v_result jsonb;
  v_guard_product_id bigint;
  v_frozen_items jsonb;
  v_order_id bigint;
  v_items jsonb;
  v_order jsonb;
  v_payments jsonb;
begin
  v_document_uid:=public.point4_identity_uuid_v4_v1(p_document_uid);
  v_client_tx_id:=public.point4_identity_uuid_v4_v1(p_client_tx_id);

  if trim(coalesce(p_document_uid,''))<>v_document_uid
     or trim(coalesce(p_client_tx_id,''))<>v_client_tx_id then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_INPUT_NOT_CANONICAL';
  end if;

  if auth.uid() is null then
    raise exception 'غير مصرح';
  end if;

  v_emp:=public.current_employee_id();
  if v_emp is null then
    raise exception 'تعذر تحديد الموظف الحالي';
  end if;

  select *
    into v_document
    from public.retail_reservation_documents_identity_v1
   where document_uid=v_document_uid::uuid;

  if not found then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_DOCUMENT_NOT_FOUND';
  end if;

  select *
    into v_web
    from public.retail_website_orders
   where id=v_document.retail_website_order_id;

  if not found then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_LEGACY_PROJECTION_MISSING';
  end if;

  v_digest:=public.retail_reservation_identity_digest_v1(
    'accept',
    v_client_tx_id,
    v_document_uid,
    v_web.branch_id,
    '{}'::jsonb,
    '[]'::jsonb
  );

  perform pg_advisory_xact_lock(
    hashtextextended(
      'point4-reservation-client-tx:'||v_client_tx_id,
      0
    )
  );

  v_existing_mutation_id:=
    public.retail_reservation_identity_resolve_mutation_v1(
      v_client_tx_id,
      'accept',
      v_digest
    );

  if v_existing_mutation_id is not null then
    select *
      into v_mutation
      from public.retail_reservation_mutations_identity_v1
     where id=v_existing_mutation_id;

    if v_mutation.reservation_document_id<>v_document.id then
      raise exception 'RETAIL_RESERVATION_IDENTITY_V1_IDEMPOTENCY_CONFLICT';
    end if;

    if v_mutation.applied_at is null
       or v_mutation.result_status is null
       or v_mutation.result_payload is null then
      raise exception 'RETAIL_RESERVATION_IDENTITY_V1_MUTATION_INCOMPLETE';
    end if;

    return v_mutation.result_payload || jsonb_build_object(
      'idempotent',true
    );
  end if;

  select *
    into v_document
    from public.retail_reservation_documents_identity_v1
   where id=v_document.id
   for update;

  select *
    into v_web
    from public.retail_website_orders
   where id=v_document.retail_website_order_id
   for update;

  if not found then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_LEGACY_PROJECTION_MISSING';
  end if;

  if not public.has_branch_access(v_web.branch_id) then
    raise exception 'ليس لديك صلاحية لهذا الفرع';
  end if;

  if v_web.status<>'pending' then
    raise exception 'طلب الموقع لم يعد معلقًا';
  end if;

  if v_web.reservation_expires_at<=now() then
    raise exception 'انتهت مدة حجز المخزون لهذا الطلب';
  end if;

  select id
    into v_shift
    from public.shifts
   where branch_id=v_web.branch_id
     and employee_id=v_emp
     and status='open'
     and closed_at is null
   order by opened_at desc
   limit 1;

  if v_shift is null then
    raise exception 'افتح وردية أولًا قبل استلام طلب الموقع';
  end if;

  -- Point4: materialize the complete affected item evidence once, then guard ALL
  -- product identities from that immutable in-transaction value.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',wi.id,'product_id',wi.product_id,'product_name',wi.product_name,
    'quantity',wi.quantity,'unit_price',wi.unit_price,
    'unit_cost_snapshot',wi.unit_cost_snapshot,'line_subtotal',wi.line_subtotal,
    'notes',wi.notes) order by wi.id),'[]'::jsonb)
    into v_frozen_items
    from public.retail_website_order_items wi
   where wi.retail_website_order_id=v_web.id;

  for v_guard_product_id in
    select distinct (x->>'product_id')::bigint
      from jsonb_array_elements(v_frozen_items) x
     where nullif(x->>'product_id','') is not null
     order by 1
  loop
    perform public.inventory_stock_assert_legacy_write_allowed_v2(
      v_web.branch_id,'product',v_guard_product_id
    );
  end loop;

  insert into public.retail_reservation_mutations_identity_v1(
    reservation_document_id,
    client_tx_id,
    mutation_type,
    operation_digest,
    requested_status,
    actor_kind,
    actor_employee_id
  ) values(
    v_document.id,
    v_client_tx_id::uuid,
    'accept',
    v_digest,
    'accepted',
    'staff',
    v_emp
  )
  returning * into v_mutation;

  perform 1
    from public.retail_inventory_balances b
    join (select distinct (x->>'product_id')::bigint product_id from jsonb_array_elements(v_frozen_items) x) wi
      on wi.product_id=b.product_id
   where b.branch_id=v_web.branch_id
   order by b.product_id
   for update of b;

  if exists(
    select 1
      from jsonb_to_recordset(v_frozen_items) as wi(product_id bigint,quantity numeric)
      left join public.retail_stock_reservations r
        on r.website_order_id=v_web.id
       and r.reservation_key=v_web.reservation_key
       and r.product_id=wi.product_id
       and r.status='active'
       and r.expires_at>now()
     where r.id is null or r.quantity<wi.quantity
  ) then
    raise exception 'حجز المخزون غير صالح أو انتهى';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product_id',wi.product_id,
        'product_name',wi.product_name,
        'quantity',wi.quantity,
        'unit_price',wi.unit_price,
        'cost',wi.unit_cost_snapshot,
        'total',wi.line_subtotal,
        'notes',wi.notes,
        'modifiers','[]'::jsonb
      )
      order by wi.id
    ),
    '[]'::jsonb
  )
  into v_items
  from jsonb_to_recordset(v_frozen_items) as wi(
    id bigint,product_id bigint,product_name text,quantity numeric,
    unit_price numeric,unit_cost_snapshot numeric,line_subtotal numeric,notes text
  );

  v_order:=jsonb_build_object(
    'branch_id',v_web.branch_id,
    'employee_id',v_emp,
    'shift_id',v_shift,
    'order_type',v_web.order_type,
    'payment_method',v_web.payment_method_code,
    'subtotal',v_web.subtotal,
    'discount',v_web.offer_discount,
    'discount_type','amount',
    'discount_value',v_web.offer_discount,
    'tax_amount',0,
    'service_amount',0,
    'delivery_fee',v_web.delivery_fee,
    'total',v_web.total,
    'promo_discount',0,
    'status','new',
    'source','website',
    'customer_phone',v_web.customer_phone,
    'customer_name',v_web.customer_name,
    'delivery_address',
      case
        when v_web.order_type='delivery' then v_web.customer_address
        else null
      end,
    'delivery_zone_id',
      case
        when v_web.order_type='delivery' then v_web.delivery_zone_id
        else null
      end,
    'notes',
      nullif(
        concat_ws(
          ' | ',
          v_web.customer_notes,
          case
            when v_web.offer_discount>0
              then 'Retail Website Offers: '||v_web.offer_discount::text
            else null
          end
        ),
        ''
      ),
    'client_tx_id','retail-web:'||v_web.id::text
  );

  v_payments:=jsonb_build_array(
    jsonb_build_object(
      'method',v_web.payment_method_code,
      'amount',v_web.total
    )
  );

  v_result:=public.create_retail_pos_order_atomic(
    v_order,
    v_items,
    v_payments
  );

  v_order_id:=nullif(v_result->'order'->>'id','')::bigint;

  if v_order_id is null then
    raise exception 'تعذر إنشاء فاتورة Retail من طلب الموقع';
  end if;

  update public.orders
     set website_order_id=v_web.id,
         payment_status=
           case
             when v_web.payment_status='confirmed' then 'confirmed'
             else v_web.payment_status
           end,
         payment_reference=v_web.payment_reference
   where id=v_order_id;

  update public.retail_stock_reservations
     set status='consumed'
   where website_order_id=v_web.id
     and reservation_key=v_web.reservation_key
     and status='active'
     and product_id in (
       select distinct (x->>'product_id')::bigint
         from jsonb_array_elements(v_frozen_items) x
        where nullif(x->>'product_id','') is not null
     );

  update public.retail_website_orders
     set status='accepted',
         accepted_order_id=v_order_id,
         accepted_by_employee_id=v_emp,
         accepted_at=now(),
         updated_at=now()
   where id=v_web.id;

  v_result:=jsonb_build_object(
    'ok',true,
    'document_uid',v_document_uid,
    'website_order_id',v_web.id,
    'pos_order_id',v_order_id,
    'status','accepted',
    'client_tx_id',v_client_tx_id,
    'operation_digest',v_digest,
    'idempotent',false
  );

  update public.retail_reservation_mutations_identity_v1
     set result_status='accepted',
         result_payload=v_result,
         applied_at=now()
   where id=v_mutation.id;

  return v_result;
end;
$function$

-- cancel_retail_website_order_customer_identity_v1(text,text,text)
CREATE OR REPLACE FUNCTION public.cancel_retail_website_order_customer_identity_v1(p_document_uid text, p_client_tx_id text, p_customer_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_document_uid text;
  v_client_tx_id text;
  v_customer_phone text;
  v_digest text;
  v_existing_mutation_id bigint;
  v_document public.retail_reservation_documents_identity_v1%rowtype;
  v_mutation public.retail_reservation_mutations_identity_v1%rowtype;
  v_web public.retail_website_orders%rowtype;
  v_result jsonb;
  v_guard_product_id bigint;
  v_frozen_items jsonb;
begin
  v_document_uid:=public.point4_identity_uuid_v4_v1(p_document_uid);
  v_client_tx_id:=public.point4_identity_uuid_v4_v1(p_client_tx_id);
  v_customer_phone:=public.retail_website_normalize_phone(p_customer_phone);

  if btrim(coalesce(p_document_uid,''))<>v_document_uid
     or btrim(coalesce(p_client_tx_id,''))<>v_client_tx_id then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_INPUT_NOT_CANONICAL';
  end if;

  if v_customer_phone is null
     or v_customer_phone='' then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_INVALID_CUSTOMER_PHONE';
  end if;

  select *
    into v_document
    from public.retail_reservation_documents_identity_v1
   where document_uid=v_document_uid::uuid;

  if not found then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_DOCUMENT_NOT_FOUND';
  end if;

  select *
    into v_web
    from public.retail_website_orders
   where id=v_document.retail_website_order_id;

  if not found then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_LEGACY_PROJECTION_MISSING';
  end if;
  v_digest:=public.retail_reservation_identity_digest_v1(
    'cancel',
    v_client_tx_id,
    v_document_uid,
    v_web.branch_id,
    jsonb_build_object('customer_phone',v_customer_phone),
    '[]'::jsonb
  );

  perform pg_advisory_xact_lock(
    hashtextextended(
      'point4-reservation-client-tx:'||v_client_tx_id,
      0
    )
  );
  v_existing_mutation_id:=
    public.retail_reservation_identity_resolve_mutation_v1(
      v_client_tx_id,
      'cancel',
      v_digest
    );

  if v_existing_mutation_id is not null then
    select *
      into v_mutation
      from public.retail_reservation_mutations_identity_v1
     where id=v_existing_mutation_id;

    if v_mutation.reservation_document_id<>v_document.id then
      raise exception 'RETAIL_RESERVATION_IDENTITY_V1_IDEMPOTENCY_CONFLICT';
    end if;

    if v_mutation.result_status is null
       or v_mutation.result_payload is null
       or v_mutation.applied_at is null then
      raise exception 'RETAIL_RESERVATION_IDENTITY_V1_MUTATION_INCOMPLETE';
    end if;

    return v_mutation.result_payload
      || jsonb_build_object('idempotent',true);
  end if;
  select *
    into v_document
    from public.retail_reservation_documents_identity_v1
   where id=v_document.id
   for update;

  select *
    into v_web
    from public.retail_website_orders
   where id=v_document.retail_website_order_id
   for update;

  if not found then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_LEGACY_PROJECTION_MISSING';
  end if;

  if v_web.customer_phone<>v_customer_phone then
    raise exception 'الطلب غير موجود';
  end if;

  if v_web.status<>'pending' then
    raise exception 'لا يمكن إلغاء الطلب في حالته الحالية';
  end if;
  -- Point4: materialize the complete affected item evidence once, then guard ALL
  -- product identities from that immutable in-transaction value.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',wi.id,'product_id',wi.product_id,'product_name',wi.product_name,
    'quantity',wi.quantity,'unit_price',wi.unit_price,
    'unit_cost_snapshot',wi.unit_cost_snapshot,'line_subtotal',wi.line_subtotal,
    'notes',wi.notes) order by wi.id),'[]'::jsonb)
    into v_frozen_items
    from public.retail_website_order_items wi
   where wi.retail_website_order_id=v_web.id;

  for v_guard_product_id in
    select distinct (x->>'product_id')::bigint
      from jsonb_array_elements(v_frozen_items) x
     where nullif(x->>'product_id','') is not null
     order by 1
  loop
    perform public.inventory_stock_assert_legacy_write_allowed_v2(
      v_web.branch_id,'product',v_guard_product_id
    );
  end loop;

  insert into public.retail_reservation_mutations_identity_v1(
    reservation_document_id,
    client_tx_id,
    mutation_type,
    operation_digest,
    requested_status,
    actor_kind,
    actor_employee_id
  )
  values(
    v_document.id,
    v_client_tx_id::uuid,
    'cancel',
    v_digest,
    'cancelled',
    'customer',
    null
  )
  returning * into v_mutation;
  update public.retail_website_orders
     set status='cancelled',
         cancelled_at=now(),
         updated_at=now()
   where id=v_web.id;

  update public.retail_stock_reservations
     set status='released'
   where website_order_id=v_web.id
     and reservation_key=v_web.reservation_key
     and status='active'
     and product_id in (
       select distinct (x->>'product_id')::bigint
         from jsonb_array_elements(v_frozen_items) x
        where nullif(x->>'product_id','') is not null
     );
  v_result:=jsonb_build_object(
    'ok',true,
    'document_uid',v_document_uid,
    'website_order_id',v_web.id,
    'status','cancelled',
    'client_tx_id',v_client_tx_id,
    'operation_digest',v_digest,
    'idempotent',false
  );

  update public.retail_reservation_mutations_identity_v1
     set result_status='cancelled',
         result_payload=v_result,
         applied_at=now()
   where id=v_mutation.id;

  return v_result;
end;
$function$

-- expire_retail_website_order_identity_v1(text)
CREATE OR REPLACE FUNCTION public.expire_retail_website_order_identity_v1(p_document_uid text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_document_uid text;
  v_client_tx_id text;
  v_digest text;
  v_document public.retail_reservation_documents_identity_v1%rowtype;
  v_mutation public.retail_reservation_mutations_identity_v1%rowtype;
  v_web public.retail_website_orders%rowtype;
  v_result jsonb;
  v_guard_product_id bigint;
  v_frozen_items jsonb;
begin
  v_document_uid:=public.point4_identity_uuid_v4_v1(p_document_uid);

  if btrim(coalesce(p_document_uid,''))<>v_document_uid then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_INPUT_NOT_CANONICAL';
  end if;

  select *
    into v_document
    from public.retail_reservation_documents_identity_v1
   where document_uid=v_document_uid::uuid
   for update;

  if not found then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_DOCUMENT_NOT_FOUND';
  end if;

  select *
    into v_web
    from public.retail_website_orders
   where id=v_document.retail_website_order_id
   for update;

  if not found then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_LEGACY_PROJECTION_MISSING';
  end if;

  select *
    into v_mutation
    from public.retail_reservation_mutations_identity_v1
   where reservation_document_id=v_document.id
     and mutation_type='expire';

  if found then
    if v_mutation.result_status is null
       or v_mutation.result_payload is null
       or v_mutation.applied_at is null then
      raise exception 'RETAIL_RESERVATION_IDENTITY_V1_MUTATION_INCOMPLETE';
    end if;

    return v_mutation.result_payload
      || jsonb_build_object('idempotent',true);
  end if;

  if v_web.status<>'pending' then
    raise exception 'لا يمكن إنهاء حجز الطلب في حالته الحالية';
  end if;

  if v_web.reservation_expires_at is null
     or v_web.reservation_expires_at>now() then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_NOT_EXPIRED';
  end if;

  v_client_tx_id:=extensions.gen_random_uuid()::text;

  v_digest:=public.retail_reservation_identity_digest_v1(
    'expire',
    v_client_tx_id,
    v_document_uid,
    v_web.branch_id,
    jsonb_build_object(
      'reservation_expires_at',
      v_web.reservation_expires_at
    ),
    '[]'::jsonb
  );

  perform pg_advisory_xact_lock(
    hashtextextended(
      'point4-reservation-client-tx:'||v_client_tx_id,
      0
    )
  );

  if public.retail_reservation_identity_resolve_mutation_v1(
       v_client_tx_id,
       'expire',
       v_digest
     ) is not null then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_IDEMPOTENCY_CONFLICT';
  end if;

  -- Point4: materialize the complete affected item evidence once, then guard ALL
  -- product identities from that immutable in-transaction value.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',wi.id,'product_id',wi.product_id,'product_name',wi.product_name,
    'quantity',wi.quantity,'unit_price',wi.unit_price,
    'unit_cost_snapshot',wi.unit_cost_snapshot,'line_subtotal',wi.line_subtotal,
    'notes',wi.notes) order by wi.id),'[]'::jsonb)
    into v_frozen_items
    from public.retail_website_order_items wi
   where wi.retail_website_order_id=v_web.id;

  for v_guard_product_id in
    select distinct (x->>'product_id')::bigint
      from jsonb_array_elements(v_frozen_items) x
     where nullif(x->>'product_id','') is not null
     order by 1
  loop
    perform public.inventory_stock_assert_legacy_write_allowed_v2(
      v_web.branch_id,'product',v_guard_product_id
    );
  end loop;

  insert into public.retail_reservation_mutations_identity_v1(
    reservation_document_id,
    client_tx_id,
    mutation_type,
    operation_digest,
    requested_status,
    actor_kind,
    actor_employee_id
  )
  values(
    v_document.id,
    v_client_tx_id::uuid,
    'expire',
    v_digest,
    'expired',
    'system',
    null
  )
  returning * into v_mutation;

  update public.retail_website_orders
     set status='expired',
         updated_at=now()
   where id=v_web.id;

  update public.retail_stock_reservations
     set status='expired'
   where website_order_id=v_web.id
     and reservation_key=v_web.reservation_key
     and status='active'
     and product_id in (
       select distinct (x->>'product_id')::bigint
         from jsonb_array_elements(v_frozen_items) x
        where nullif(x->>'product_id','') is not null
     );

  v_result:=jsonb_build_object(
    'ok',true,
    'document_uid',v_document_uid,
    'website_order_id',v_web.id,
    'status','expired',
    'client_tx_id',v_client_tx_id,
    'operation_digest',v_digest,
    'idempotent',false
  );

  update public.retail_reservation_mutations_identity_v1
     set result_status='expired',
         result_payload=v_result,
         applied_at=now()
   where id=v_mutation.id;

  return v_result;
end;
$function$

-- reject_retail_website_order_identity_v1(text,text,text)
CREATE OR REPLACE FUNCTION public.reject_retail_website_order_identity_v1(p_document_uid text, p_client_tx_id text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_document_uid text;
  v_client_tx_id text;
  v_reason text;
  v_digest text;
  v_existing_mutation_id bigint;
  v_document public.retail_reservation_documents_identity_v1%rowtype;
  v_mutation public.retail_reservation_mutations_identity_v1%rowtype;
  v_web public.retail_website_orders%rowtype;
  v_emp bigint;
  v_result jsonb;
  v_guard_product_id bigint;
  v_frozen_items jsonb;
begin
  v_document_uid:=public.point4_identity_uuid_v4_v1(p_document_uid);
  v_client_tx_id:=public.point4_identity_uuid_v4_v1(p_client_tx_id);
  v_reason:=nullif(btrim(p_reason),'');

  if btrim(coalesce(p_document_uid,''))<>v_document_uid
     or btrim(coalesce(p_client_tx_id,''))<>v_client_tx_id then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_INPUT_NOT_CANONICAL';
  end if;

  if auth.uid() is null then
    raise exception 'غير مصرح';
  end if;

  v_emp:=public.current_employee_id();

  if v_emp is null then
    raise exception 'تعذر تحديد الموظف الحالي';
  end if;

  select *
    into v_document
    from public.retail_reservation_documents_identity_v1
   where document_uid=v_document_uid::uuid;

  if not found then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_DOCUMENT_NOT_FOUND';
  end if;

  select *
    into v_web
    from public.retail_website_orders
   where id=v_document.retail_website_order_id;

  if not found then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_LEGACY_PROJECTION_MISSING';
  end if;
  v_digest:=public.retail_reservation_identity_digest_v1(
    'reject',
    v_client_tx_id,
    v_document_uid,
    v_web.branch_id,
    jsonb_build_object('reason',v_reason),
    '[]'::jsonb
  );

  perform pg_advisory_xact_lock(
    hashtextextended(
      'point4-reservation-client-tx:'||v_client_tx_id,
      0
    )
  );

  v_existing_mutation_id:=
    public.retail_reservation_identity_resolve_mutation_v1(
      v_client_tx_id,
      'reject',
      v_digest
    );

  if v_existing_mutation_id is not null then
    select *
      into v_mutation
      from public.retail_reservation_mutations_identity_v1
     where id=v_existing_mutation_id;

    if v_mutation.reservation_document_id<>v_document.id then
      raise exception 'RETAIL_RESERVATION_IDENTITY_V1_IDEMPOTENCY_CONFLICT';
    end if;

    if v_mutation.result_status is null
       or v_mutation.result_payload is null
       or v_mutation.applied_at is null then
      raise exception 'RETAIL_RESERVATION_IDENTITY_V1_MUTATION_INCOMPLETE';
    end if;

    return v_mutation.result_payload
      || jsonb_build_object('idempotent',true);
  end if;

  select *
    into v_document
    from public.retail_reservation_documents_identity_v1
   where id=v_document.id
   for update;

  select *
    into v_web
    from public.retail_website_orders
   where id=v_document.retail_website_order_id
   for update;

  if not found then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_LEGACY_PROJECTION_MISSING';
  end if;

  if not public.has_branch_access(v_web.branch_id) then
    raise exception 'غير مصرح لهذا الفرع';
  end if;

  if v_web.status<>'pending' then
    raise exception 'لا يمكن رفض الطلب في حالته الحالية';
  end if;

  -- Point4: materialize the complete affected item evidence once, then guard ALL
  -- product identities from that immutable in-transaction value.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',wi.id,'product_id',wi.product_id,'product_name',wi.product_name,
    'quantity',wi.quantity,'unit_price',wi.unit_price,
    'unit_cost_snapshot',wi.unit_cost_snapshot,'line_subtotal',wi.line_subtotal,
    'notes',wi.notes) order by wi.id),'[]'::jsonb)
    into v_frozen_items
    from public.retail_website_order_items wi
   where wi.retail_website_order_id=v_web.id;

  for v_guard_product_id in
    select distinct (x->>'product_id')::bigint
      from jsonb_array_elements(v_frozen_items) x
     where nullif(x->>'product_id','') is not null
     order by 1
  loop
    perform public.inventory_stock_assert_legacy_write_allowed_v2(
      v_web.branch_id,'product',v_guard_product_id
    );
  end loop;

  insert into public.retail_reservation_mutations_identity_v1(
    reservation_document_id,
    client_tx_id,
    mutation_type,
    operation_digest,
    requested_status,
    actor_kind,
    actor_employee_id
  )
  values(
    v_document.id,
    v_client_tx_id::uuid,
    'reject',
    v_digest,
    'rejected',
    'staff',
    v_emp
  )
  returning * into v_mutation;
  update public.retail_website_orders
     set status='rejected',
         rejected_at=now(),
         updated_at=now(),
         customer_notes=concat_ws(
           E'\n',
           nullif(customer_notes,''),
           'رفض الفرع: '||coalesce(v_reason,'')
         )
   where id=v_web.id;

  update public.retail_stock_reservations
     set status='released'
   where website_order_id=v_web.id
     and reservation_key=v_web.reservation_key
     and status='active'
     and product_id in (
       select distinct (x->>'product_id')::bigint
         from jsonb_array_elements(v_frozen_items) x
        where nullif(x->>'product_id','') is not null
     );
  v_result:=jsonb_build_object(
    'ok',true,
    'document_uid',v_document_uid,
    'website_order_id',v_web.id,
    'status','rejected',
    'client_tx_id',v_client_tx_id,
    'operation_digest',v_digest,
    'idempotent',false
  );

  update public.retail_reservation_mutations_identity_v1
     set result_status='rejected',
         result_payload=v_result,
         applied_at=now()
   where id=v_mutation.id;

  return v_result;
end;
$function$
