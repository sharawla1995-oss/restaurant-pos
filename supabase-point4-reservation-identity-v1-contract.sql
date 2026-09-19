-- Sharawla POS — Point 4 Reservation Identity V1
-- Source implementation only.
-- Additive/versioned contract: existing Retail Website RPCs remain unchanged.
-- No Canonical Stock writer/routing activation, Offline V2 ownership change,
-- backfill, deployment, or Production mutation is introduced by this source.

begin;

-- ============================================================================
-- 1. Durable Reservation Identity V1 sidecars
-- ============================================================================

create table public.retail_reservation_documents_identity_v1 (
  id bigint generated always as identity not null,
  retail_website_order_id bigint not null,
  document_uid uuid not null,
  source_document_id text generated always as ('uuid:' || document_uid::text) stored not null,
  creation_client_tx_id uuid not null,
  creation_operation_digest text not null,
  identity_contract_version text not null default 'sharawla.point4.identity.v1',
  created_at timestamptz not null default now(),

  constraint retail_reservation_documents_identity_v1_pkey
    primary key (id),
  constraint retail_reservation_documents_identity_v1_website_order_fkey
    foreign key (retail_website_order_id)
    references public.retail_website_orders(id) on delete restrict,
  constraint retail_reservation_documents_identity_v1_website_order_key
    unique (retail_website_order_id),
  constraint retail_reservation_documents_identity_v1_document_uid_key
    unique (document_uid),
  constraint retail_reservation_documents_identity_v1_source_document_key
    unique (source_document_id),
  constraint retail_reservation_documents_identity_v1_creation_tx_key
    unique (creation_client_tx_id),
  constraint retail_reservation_documents_identity_v1_digest_check
    check (creation_operation_digest ~ '^[0-9a-f]{64}$'),
  constraint retail_reservation_documents_identity_v1_version_check
    check (identity_contract_version = 'sharawla.point4.identity.v1')
);

create index retail_reservation_documents_identity_v1_created_idx
  on public.retail_reservation_documents_identity_v1 (created_at, id);


create table public.retail_reservation_lines_identity_v1 (
  id bigint generated always as identity not null,
  reservation_document_id bigint not null,
  line_uid uuid not null,
  product_id bigint not null,
  quantity numeric(14,3) not null,
  normalized_notes text null,
  reservation_effect_line_key text not null,
  canonical_line_digest text not null,
  created_at timestamptz not null default now(),

  constraint retail_reservation_lines_identity_v1_pkey
    primary key (id),
  constraint retail_reservation_lines_identity_v1_document_fkey
    foreign key (reservation_document_id)
    references public.retail_reservation_documents_identity_v1(id) on delete restrict,
  constraint retail_reservation_lines_identity_v1_product_fkey
    foreign key (product_id)
    references public.products(id) on delete restrict,
  constraint retail_reservation_lines_identity_v1_line_uid_key
    unique (line_uid),
  constraint retail_reservation_lines_identity_v1_effect_key
    unique (reservation_effect_line_key),
  constraint retail_reservation_lines_identity_v1_quantity_check
    check (quantity > 0),
  constraint retail_reservation_lines_identity_v1_effect_format_check
    check (
      reservation_effect_line_key ~
      '^v1:stock:reservation:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ),
  constraint retail_reservation_lines_identity_v1_digest_check
    check (canonical_line_digest ~ '^[0-9a-f]{64}$')
);

create index retail_reservation_lines_identity_v1_document_product_idx
  on public.retail_reservation_lines_identity_v1
  (reservation_document_id, product_id, id);


create table public.retail_reservation_mutations_identity_v1 (
  id bigint generated always as identity not null,
  reservation_document_id bigint not null,
  client_tx_id uuid not null,
  mutation_type text not null,
  operation_digest text not null,
  requested_status text not null,
  result_status text null,
  result_payload jsonb null,
  actor_kind text not null,
  actor_employee_id bigint null,
  recorded_at timestamptz not null default now(),
  applied_at timestamptz null,

  constraint retail_reservation_mutations_identity_v1_pkey
    primary key (id),
  constraint retail_reservation_mutations_identity_v1_document_fkey
    foreign key (reservation_document_id)
    references public.retail_reservation_documents_identity_v1(id) on delete restrict,
  constraint retail_reservation_mutations_identity_v1_employee_fkey
    foreign key (actor_employee_id)
    references public.employees(id) on delete restrict,
  constraint retail_reservation_mutations_identity_v1_client_tx_key
    unique (client_tx_id),
  constraint retail_reservation_mutations_identity_v1_digest_check
    check (operation_digest ~ '^[0-9a-f]{64}$'),
  constraint retail_reservation_mutations_identity_v1_type_status_check
    check (
      (mutation_type, requested_status) in (
        ('accept','accepted'),
        ('reject','rejected'),
        ('cancel','cancelled'),
        ('expire','expired')
      )
    ),
  constraint retail_reservation_mutations_identity_v1_actor_check
    check (
      (mutation_type in ('accept','reject')
        and actor_kind = 'staff'
        and actor_employee_id is not null)
      or
      (mutation_type = 'cancel'
        and actor_kind = 'customer'
        and actor_employee_id is null)
      or
      (mutation_type = 'expire'
        and actor_kind = 'system'
        and actor_employee_id is null)
    ),
  constraint retail_reservation_mutations_identity_v1_result_check
    check (
      (applied_at is null and result_status is null and result_payload is null)
      or
      (applied_at is not null and result_status is not null and result_payload is not null)
    ),
  constraint retail_reservation_mutations_identity_v1_result_status_check
    check (
      result_status is null
      or result_status in ('accepted','rejected','cancelled','expired')
    )
);

create index retail_reservation_mutations_identity_v1_document_recorded_idx
  on public.retail_reservation_mutations_identity_v1
  (reservation_document_id, recorded_at, id);

create unique index retail_reservation_mutations_identity_v1_one_expiry_idx
  on public.retail_reservation_mutations_identity_v1 (reservation_document_id)
  where mutation_type = 'expire';


-- ============================================================================
-- 2. Immutability / mutation guards
-- ============================================================================

create or replace function public.retail_reservation_identity_immutable_v1()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  raise exception 'RETAIL_RESERVATION_IDENTITY_V1_IMMUTABLE';
end;
$$;

create or replace function public.retail_reservation_mutation_guard_v1()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_MUTATION_IMMUTABLE';
  end if;

  if new.id is distinct from old.id
     or new.reservation_document_id is distinct from old.reservation_document_id
     or new.client_tx_id is distinct from old.client_tx_id
     or new.mutation_type is distinct from old.mutation_type
     or new.operation_digest is distinct from old.operation_digest
     or new.requested_status is distinct from old.requested_status
     or new.actor_kind is distinct from old.actor_kind
     or new.actor_employee_id is distinct from old.actor_employee_id
     or new.recorded_at is distinct from old.recorded_at then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_MUTATION_IDENTITY_IMMUTABLE';
  end if;

  if old.applied_at is not null
     or old.result_status is not null
     or old.result_payload is not null then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_MUTATION_RESULT_IMMUTABLE';
  end if;

  if new.applied_at is null
     or new.result_status is null
     or new.result_payload is null then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_MUTATION_RESULT_ATOMIC_REQUIRED';
  end if;

  return new;
end;
$$;


create trigger retail_reservation_documents_identity_v1_immutable
before update or delete
on public.retail_reservation_documents_identity_v1
for each row
execute function public.retail_reservation_identity_immutable_v1();

create trigger retail_reservation_lines_identity_v1_immutable
before update or delete
on public.retail_reservation_lines_identity_v1
for each row
execute function public.retail_reservation_identity_immutable_v1();

create trigger retail_reservation_mutations_identity_v1_guard
before update or delete
on public.retail_reservation_mutations_identity_v1
for each row
execute function public.retail_reservation_mutation_guard_v1();


-- ============================================================================
-- 3. Reservation Identity V1 canonical digest
-- ============================================================================

create or replace function public.retail_reservation_identity_digest_v1(
  p_operation_type text,
  p_client_tx_id text,
  p_document_uid text,
  p_branch_id bigint,
  p_intent jsonb,
  p_lines jsonb
) returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  v_operation text:=lower(trim(coalesce(p_operation_type,'')));
  v_tx text:=public.point4_identity_uuid_v4_v1(p_client_tx_id);
  v_document_uid text:=public.point4_identity_uuid_v4_v1(p_document_uid);
  v_intent jsonb:='{}'::jsonb;
  v_lines jsonb:='[]'::jsonb;
  v_line jsonb;
  v_line_uid text;
  v_line_key text;
  v_product_id text;
  v_quantity text;
  v_notes text;
  v_envelope jsonb;
begin
  if v_operation not in ('create','accept','reject','cancel','expire') then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_OPERATION_INVALID';
  end if;

  if trim(coalesce(p_client_tx_id,''))<>v_tx then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_CLIENT_TX_NOT_CANONICAL';
  end if;

  if trim(coalesce(p_document_uid,''))<>v_document_uid then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_DOCUMENT_UID_NOT_CANONICAL';
  end if;

  if p_branch_id is not null and p_branch_id<=0 then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_BRANCH_INVALID';
  end if;

  if p_intent is null or jsonb_typeof(p_intent)<>'object' then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_INTENT_OBJECT_REQUIRED';
  end if;

  if v_operation='create' then
    perform public.point4_identity_assert_allowed_keys_v1(
      p_intent,
      array[
        'customer_name','customer_phone','customer_address','customer_notes',
        'order_type','delivery_zone_id','payment_method_code','payment_reference'
      ]
    );

    v_intent:=jsonb_build_object(
      'customer_name',trim(coalesce(p_intent->>'customer_name','')),
      'customer_phone',trim(coalesce(p_intent->>'customer_phone','')),
      'customer_address',nullif(trim(coalesce(p_intent->>'customer_address','')),''),
      'customer_notes',nullif(trim(coalesce(p_intent->>'customer_notes','')),''),
      'order_type',lower(trim(coalesce(p_intent->>'order_type',''))),
      'delivery_zone_id',
        case
          when p_intent->'delivery_zone_id' is null
            or p_intent->'delivery_zone_id'='null'::jsonb then null
          else public.point4_identity_bigint_v1(p_intent->'delivery_zone_id',true)
        end,
      'payment_method_code',lower(trim(coalesce(p_intent->>'payment_method_code',''))),
      'payment_reference',nullif(trim(coalesce(p_intent->>'payment_reference','')),'')
    );

    if p_lines is null or jsonb_typeof(p_lines)<>'array'
       or jsonb_array_length(p_lines)=0 then
      raise exception 'RETAIL_RESERVATION_IDENTITY_V1_LINES_REQUIRED';
    end if;

    for v_line in
      select value
      from jsonb_array_elements(p_lines)
    loop
      perform public.point4_identity_assert_allowed_keys_v1(
        v_line,array['line_uid','product_id','quantity','notes']
      );

      v_line_uid:=public.point4_identity_uuid_v4_v1(v_line->>'line_uid');
      v_line_key:=public.point4_identity_effect_line_key_v1(
        'stock','reservation',v_line_uid
      );
      v_product_id:=public.point4_identity_bigint_v1(v_line->'product_id',true);
      v_quantity:=public.point4_identity_decimal_v1(
        (v_line->>'quantity')::numeric,3
      );
      v_notes:=nullif(trim(coalesce(v_line->>'notes','')),'');

      v_lines:=v_lines||jsonb_build_array(
        jsonb_build_object(
          'line_key',v_line_key,
          'line_uid',v_line_uid,
          'product_id',v_product_id,
          'quantity',v_quantity,
          'notes',v_notes
        )
      );
    end loop;

    v_lines:=public.point4_identity_canonical_lines_v1(v_lines);

  elsif v_operation='accept' then
    perform public.point4_identity_assert_allowed_keys_v1(p_intent,array[]::text[]);
    if p_lines is not null and p_lines<>'[]'::jsonb then
      raise exception 'RETAIL_RESERVATION_IDENTITY_V1_MUTATION_LINES_FORBIDDEN';
    end if;

  elsif v_operation='reject' then
    perform public.point4_identity_assert_allowed_keys_v1(p_intent,array['reason']);
    v_intent:=jsonb_build_object(
      'reason',nullif(trim(coalesce(p_intent->>'reason','')),'')
    );
    if p_lines is not null and p_lines<>'[]'::jsonb then
      raise exception 'RETAIL_RESERVATION_IDENTITY_V1_MUTATION_LINES_FORBIDDEN';
    end if;

  elsif v_operation='cancel' then
    perform public.point4_identity_assert_allowed_keys_v1(
      p_intent,array['customer_phone']
    );
    v_intent:=jsonb_build_object(
      'customer_phone',trim(coalesce(p_intent->>'customer_phone',''))
    );
    if p_lines is not null and p_lines<>'[]'::jsonb then
      raise exception 'RETAIL_RESERVATION_IDENTITY_V1_MUTATION_LINES_FORBIDDEN';
    end if;

  elsif v_operation='expire' then
    perform public.point4_identity_assert_allowed_keys_v1(
      p_intent,array['reservation_expires_at']
    );
    v_intent:=jsonb_build_object(
      'reservation_expires_at',p_intent->'reservation_expires_at'
    );
    if p_lines is not null and p_lines<>'[]'::jsonb then
      raise exception 'RETAIL_RESERVATION_IDENTITY_V1_MUTATION_LINES_FORBIDDEN';
    end if;
  end if;

  v_envelope:=jsonb_build_object(
    'contract','sharawla.point4.identity.v1',
    'operation_type',v_operation,
    'client_tx_id',v_tx,
    'document_uid',v_document_uid,
    'source_document_id','uuid:'||v_document_uid,
    'branch_id',
      case when p_branch_id is null then null else p_branch_id::text end,
    'intent',v_intent,
    'lines',v_lines
  );

  return pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_envelope::text,'UTF8'),'sha256'),
    'hex'
  );
end;
$$;


-- ============================================================================
-- 4. Global Reservation Identity V1 client-tx resolver
-- ============================================================================

create or replace function public.retail_reservation_identity_resolve_mutation_v1(
  p_client_tx_id text,
  p_operation_type text,
  p_operation_digest text
) returns bigint
language plpgsql
stable
set search_path=''
as $$
declare
  v_tx text:=public.point4_identity_uuid_v4_v1(p_client_tx_id);
  v_operation text:=lower(trim(coalesce(p_operation_type,'')));
  v_digest text:=lower(trim(coalesce(p_operation_digest,'')));
  v_creation public.retail_reservation_documents_identity_v1%rowtype;
  v_mutation public.retail_reservation_mutations_identity_v1%rowtype;
begin
  if v_operation not in ('accept','reject','cancel','expire') then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_MUTATION_TYPE_INVALID';
  end if;

  if v_digest!~'^[0-9a-f]{64}$' then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_DIGEST_INVALID';
  end if;

  select *
    into v_creation
    from public.retail_reservation_documents_identity_v1
   where creation_client_tx_id=v_tx::uuid;

  if found then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_IDEMPOTENCY_CONFLICT';
  end if;

  select *
    into v_mutation
    from public.retail_reservation_mutations_identity_v1
   where client_tx_id=v_tx::uuid;

  if not found then
    return null;
  end if;

  if v_mutation.mutation_type<>v_operation
     or v_mutation.operation_digest<>v_digest then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_IDEMPOTENCY_CONFLICT';
  end if;

  return v_mutation.id;
end;
$$;


-- ============================================================================
-- 5. Identity V1 -> Legacy projection assertion
-- ============================================================================

create or replace function public.retail_reservation_identity_assert_projection_v1(
  p_reservation_document_id bigint
) returns void
language plpgsql
stable
set search_path=''
as $$
declare
  v_document public.retail_reservation_documents_identity_v1%rowtype;
begin
  select *
    into v_document
    from public.retail_reservation_documents_identity_v1
   where id=p_reservation_document_id;

  if not found then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_DOCUMENT_NOT_FOUND';
  end if;

  if not exists(
    select 1
      from public.retail_reservation_lines_identity_v1 l
     where l.reservation_document_id=v_document.id
  ) then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_LINES_REQUIRED';
  end if;

  if exists(
    with canonical as (
      select
        l.product_id,
        round(sum(l.quantity),3)::numeric(14,3) as quantity,
        max(l.normalized_notes) as notes
      from public.retail_reservation_lines_identity_v1 l
      where l.reservation_document_id=v_document.id
      group by l.product_id
    ),
    legacy as (
      select
        i.product_id,
        round(sum(i.quantity),3)::numeric(14,3) as quantity,
        max(i.notes) as notes
      from public.retail_website_order_items i
      where i.retail_website_order_id=v_document.retail_website_order_id
      group by i.product_id
    )
    select 1
    from canonical c
    full join legacy l using(product_id)
    where c.product_id is null
       or l.product_id is null
       or c.quantity is distinct from l.quantity
       or c.notes is distinct from l.notes
  ) then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_PROJECTION_MISMATCH';
  end if;
end;
$$;


-- ============================================================================
-- 6. Versioned Reservation Identity V1 creation entrypoint
-- ============================================================================
-- Source contract only. This entrypoint preserves the Legacy Retail website
-- projection while making Reservation Identity V1 authoritative for versioned
-- callers. Canonical Stock remains inactive.

create or replace function public.retail_create_website_order_identity_v1(
  p_identity_envelope jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_client_tx_id text;
  v_document_uid text;
  v_source_document_id text;
  v_branch_id bigint;
  v_customer_name text;
  v_customer_phone text;
  v_customer_address text;
  v_customer_notes text;
  v_order_type text;
  v_delivery_zone_id bigint;
  v_payment_method_code text;
  v_payment_reference text;
  v_lines jsonb;

  v_intent jsonb;
  v_digest text;
  v_existing_document public.retail_reservation_documents_identity_v1%rowtype;
  v_order public.retail_website_orders%rowtype;
  v_document public.retail_reservation_documents_identity_v1%rowtype;

  v_line jsonb;
  v_line_uid text;
  v_product_id bigint;
  v_qty numeric(14,3);
  v_notes text;
  v_effect_line_key text;
  v_line_digest text;

  v_row record;
  v_product public.products%rowtype;
  v_ps public.retail_product_settings%rowtype;
  v_balance public.retail_inventory_balances%rowtype;
  v_bp public.branch_products%rowtype;
  v_price numeric(14,4);
  v_line_total numeric(14,2);
  v_offer numeric(14,2);
  v_available numeric(14,3);
  v_reserved numeric(14,3);
  v_subtotal numeric(14,2):=0;
  v_discount numeric(14,2):=0;
  v_delivery numeric(14,2):=0;
  v_total numeric(14,2):=0;
  v_expiry timestamptz:=now()+interval '15 minutes';
  v_legacy_idempotency_key text;
  v_legacy_reservation_key text;
  v_legacy_items jsonb:='[]'::jsonb;
begin
  if jsonb_typeof(p_identity_envelope) is distinct from 'object' then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_REQUEST_OBJECT_REQUIRED';
  end if;

  perform public.point4_identity_assert_allowed_keys_v1(
    p_identity_envelope,
    array[
      'client_tx_id','document_uid','source_document_id','branch_id',
      'customer_name','customer_phone','customer_address','customer_notes',
      'order_type','delivery_zone_id','payment_method_code',
      'payment_reference','lines'
    ]
  );

  v_client_tx_id:=public.point4_identity_uuid_v4_v1(p_identity_envelope->>'client_tx_id');
  v_document_uid:=public.point4_identity_uuid_v4_v1(p_identity_envelope->>'document_uid');
  v_source_document_id:=public.point4_identity_source_document_id_v1(
    'stock_reservation',
    v_document_uid,
    true
  );

  if p_identity_envelope->>'source_document_id' is distinct from v_source_document_id then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_SOURCE_DOCUMENT_MISMATCH';
  end if;

  v_branch_id:=public.point4_identity_bigint_v1(p_identity_envelope->'branch_id',false);
  v_customer_name:=nullif(trim(coalesce(p_identity_envelope->>'customer_name','')),'');
  v_customer_phone:=public.retail_website_normalize_phone(p_identity_envelope->>'customer_phone');
  v_customer_address:=nullif(trim(coalesce(p_identity_envelope->>'customer_address','')),'');
  v_customer_notes:=nullif(trim(coalesce(p_identity_envelope->>'customer_notes','')),'');
  v_order_type:=lower(coalesce(nullif(trim(p_identity_envelope->>'order_type'),''),'pickup'));

  if p_identity_envelope ? 'delivery_zone_id' and p_identity_envelope->'delivery_zone_id' <> 'null'::jsonb then
    v_delivery_zone_id:=public.point4_identity_bigint_v1(
      p_identity_envelope->'delivery_zone_id',
      false
    );
  end if;

  v_payment_method_code:=lower(
    coalesce(nullif(trim(p_identity_envelope->>'payment_method_code'),''),'cash')
  );
  v_payment_reference:=nullif(trim(coalesce(p_identity_envelope->>'payment_reference','')),'');
  v_lines:=p_identity_envelope->'lines';

  if v_customer_name is null then
    raise exception 'اسم العميل مطلوب';
  end if;

  if v_customer_phone is null
     or length(v_customer_phone)<10
     or length(v_customer_phone)>15 then
    raise exception 'رقم الهاتف غير صالح';
  end if;

  if v_order_type not in ('pickup','delivery') then
    raise exception 'نوع الطلب غير صالح';
  end if;

  if jsonb_typeof(v_lines) is distinct from 'array'
     or jsonb_array_length(v_lines)=0 then
    raise exception 'السلة فارغة';
  end if;

  if jsonb_array_length(v_lines)>100 then
    raise exception 'عدد الأصناف أكبر من الحد المسموح';
  end if;

  -- Validate every submitted Identity line before any durable write.
  -- Duplicate product_id values are intentionally allowed; duplicate line_uid is not.
  for v_line in
    select value
    from jsonb_array_elements(v_lines)
  loop
    if jsonb_typeof(v_line) is distinct from 'object' then
      raise exception 'RETAIL_RESERVATION_IDENTITY_V1_LINE_OBJECT_REQUIRED';
    end if;

    perform public.point4_identity_assert_allowed_keys_v1(
      v_line,
      array['line_uid','product_id','quantity','notes']
    );

    v_line_uid:=public.point4_identity_uuid_v4_v1(v_line->>'line_uid');
    v_product_id:=public.point4_identity_bigint_v1(v_line->'product_id',false);

    if not (v_line ? 'quantity') or v_line->'quantity'='null'::jsonb then
      raise exception 'RETAIL_RESERVATION_IDENTITY_V1_QUANTITY_REQUIRED';
    end if;

    begin
      v_qty:=(public.point4_identity_decimal_v1(
        (v_line->>'quantity')::numeric,
        3
      ))::numeric(14,3);
    exception
      when others then
        raise exception 'RETAIL_RESERVATION_IDENTITY_V1_QUANTITY_INVALID';
    end;

    if v_qty<=0 then
      raise exception 'كمية صنف غير صحيحة';
    end if;

    v_notes:=nullif(trim(coalesce(v_line->>'notes','')),'');
    v_effect_line_key:=public.point4_identity_effect_line_key_v1(
      'stock',
      'reservation',
      v_line_uid
    );

    if exists(
      select 1
      from jsonb_array_elements(v_lines) other_line
      where other_line<>v_line
        and lower(trim(coalesce(other_line->>'line_uid','')))=v_line_uid
    ) then
      raise exception 'RETAIL_RESERVATION_IDENTITY_V1_DUPLICATE_LINE_UID';
    end if;
  end loop;

  -- Canonical intent contains only client-authoritative accepted fields.
  -- Server-derived prices, costs, offers, totals, expiry and timestamps are excluded.
  v_intent:=jsonb_build_object(
    'customer_name',v_customer_name,
    'customer_phone',v_customer_phone,
    'customer_address',v_customer_address,
    'customer_notes',v_customer_notes,
    'order_type',v_order_type,
    'delivery_zone_id',v_delivery_zone_id,
    'payment_method_code',v_payment_method_code,
    'payment_reference',v_payment_reference
  );

  v_digest:=public.retail_reservation_identity_digest_v1(
    'create',
    v_client_tx_id,
    v_document_uid,
    v_branch_id,
    v_intent,
    v_lines
  );

  if v_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_DIGEST_INVALID';
  end if;

  -- Global creation TX namespace first, then document namespace.
  perform pg_advisory_xact_lock(
    hashtextextended('point4-reservation-client-tx:'||v_client_tx_id,0)
  );

  if exists(
    select 1
    from public.retail_reservation_mutations_identity_v1 m
    where m.client_tx_id=v_client_tx_id::uuid
  ) then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_IDEMPOTENCY_CONFLICT';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('point4-reservation-document:'||v_document_uid,0)
  );

  select *
    into v_existing_document
    from public.retail_reservation_documents_identity_v1
   where creation_client_tx_id=v_client_tx_id::uuid
      or document_uid=v_document_uid::uuid
   order by
     case when creation_client_tx_id=v_client_tx_id::uuid then 0 else 1 end,
     id
   limit 1;

  if found then
    if v_existing_document.creation_client_tx_id<>v_client_tx_id::uuid
       or v_existing_document.document_uid<>v_document_uid::uuid
       or v_existing_document.source_document_id<>v_source_document_id
       or v_existing_document.creation_operation_digest<>v_digest then
      raise exception 'RETAIL_RESERVATION_IDENTITY_V1_IDEMPOTENCY_CONFLICT';
    end if;

    select *
      into v_order
      from public.retail_website_orders
     where id=v_existing_document.retail_website_order_id;

    if not found then
      raise exception 'RETAIL_RESERVATION_IDENTITY_V1_LEGACY_PROJECTION_MISSING';
    end if;

    return jsonb_build_object(
      'ok',true,
      'id',v_order.id,
      'order_code',v_order.public_order_code,
      'status',v_order.status,
      'subtotal',v_order.subtotal,
      'offer_discount',v_order.offer_discount,
      'delivery_fee',v_order.delivery_fee,
      'total',v_order.total,
      'reservation_expires_at',v_order.reservation_expires_at,
      'document_uid',v_document_uid,
      'source_document_id',v_source_document_id,
      'client_tx_id',v_client_tx_id,
      'operation_digest',v_digest,
      'idempotent',true
    );
  end if;

  -- Legacy-compatible business validation remains before durable writes.
  if not public.retail_website_branch_open(v_branch_id) then
    raise exception 'الفرع غير متاح لاستقبال الطلبات الآن';
  end if;

  if (
    select count(*)
    from public.retail_website_orders w
    where w.branch_id=v_branch_id
      and w.customer_phone=v_customer_phone
      and w.status='pending'
      and w.reservation_expires_at>now()
      and w.created_at>now()-interval '10 minutes'
  ) >= 3 then
    raise exception 'يوجد عدة طلبات معلقة لهذا الرقم. حاول بعد قليل';
  end if;

  if exists(select 1 from public.payment_methods) then
    if not exists(
      select 1
      from public.payment_methods pm
      join public.branch_payment_methods bpm
        on bpm.payment_method_id=pm.id
      where pm.code=v_payment_method_code
        and pm.active=true
        and bpm.branch_id=v_branch_id
        and bpm.active=true
        and coalesce(bpm.website_enabled,false)=true
    ) then
      raise exception 'طريقة الدفع غير متاحة على الموقع لهذا الفرع';
    end if;
  end if;

  if v_order_type='delivery' then
    if v_delivery_zone_id is null then
      raise exception 'منطقة التوصيل مطلوبة';
    end if;

    select round(greatest(coalesce(z.delivery_fee,0),0),2)
      into v_delivery
      from public.delivery_zones z
     where z.id=v_delivery_zone_id
       and z.branch_id=v_branch_id
       and z.active=true;

    if not found then
      raise exception 'منطقة التوصيل غير متاحة لهذا الفرع';
    end if;

    if v_customer_address is null then
      raise exception 'عنوان التوصيل مطلوب';
    end if;
  end if;


  -- Phase 4: validate aggregate products and lock existing inventory balances
  -- in deterministic product order. This phase is intentionally DML-free.
  for v_row in
    select
      (x->>'product_id')::bigint as product_id,
      round(sum((x->>'quantity')::numeric),3)::numeric(14,3) as quantity,
      max(nullif(trim(coalesce(x->>'notes','')),'')) as notes
    from jsonb_array_elements(v_lines) x
    group by (x->>'product_id')::bigint
    order by (x->>'product_id')::bigint
  loop
    v_qty:=v_row.quantity;
    if v_qty<=0 then
      raise exception 'كمية صنف غير صحيحة';
    end if;

    select *
      into v_product
      from public.products
     where id=v_row.product_id
       and active=true;

    if not found then
      raise exception 'أحد الأصناف غير متاح';
    end if;

    select *
      into v_ps
      from public.retail_product_settings
     where product_id=v_product.id;

    if not found then
      v_ps.product_id:=v_product.id;
      v_ps.unit_type:='piece';
      v_ps.allow_decimal:=false;
      v_ps.qty_step:=1;
      v_ps.min_qty:=1;
      v_ps.online_enabled:=true;
    end if;

    if coalesce(v_ps.online_enabled,true) is not true then
      raise exception 'الصنف % غير متاح أونلاين',v_product.name;
    end if;

    if v_qty<coalesce(v_ps.min_qty,1) then
      raise exception 'الكمية أقل من الحد الأدنى للصنف %',v_product.name;
    end if;

    if not coalesce(v_ps.allow_decimal,false) and v_qty<>trunc(v_qty) then
      raise exception 'الصنف % لا يسمح بكمية عشرية',v_product.name;
    end if;

    if abs(
      (v_qty/coalesce(v_ps.qty_step,1))
      - round(v_qty/coalesce(v_ps.qty_step,1))
    )>0.0001 then
      raise exception 'كمية الصنف % لا تطابق خطوة البيع',v_product.name;
    end if;

    select *
      into v_bp
      from public.branch_products
     where branch_id=v_branch_id
       and product_id=v_product.id;

    if found and v_bp.active is false then
      raise exception 'الصنف % غير متاح في هذا الفرع',v_product.name;
    end if;

    if found
       and v_bp.website_paused_until is not null
       and v_bp.website_paused_until>now() then
      raise exception 'الصنف % موقوف مؤقتًا على الموقع',v_product.name;
    end if;

    v_price:=coalesce(v_bp.price_override,v_product.price,0);
    if v_price<0 then
      raise exception 'سعر الصنف غير صالح';
    end if;

    select *
      into v_balance
      from public.retail_inventory_balances
     where branch_id=v_branch_id
       and product_id=v_product.id
     for update;

    if not found then
      -- Legacy would create a tracked zero balance here. Identity V1 cannot
      -- perform that DML before website-order + sidecar atomic durability,
      -- so the equivalent positive-quantity outcome is insufficient stock.
      raise exception 'المخزون غير كافٍ للصنف % — المتاح %',v_product.name,0;
    end if;

    select coalesce(sum(r.quantity),0)
      into v_reserved
      from public.retail_stock_reservations r
     where r.branch_id=v_branch_id
       and r.product_id=v_product.id
       and r.status='active'
       and r.expires_at>now();

    v_available:=round(coalesce(v_balance.quantity,0)-v_reserved,3);

    if coalesce(v_balance.track_inventory,true) and v_available<v_qty then
      raise exception 'المخزون غير كافٍ للصنف % — المتاح %',
        v_product.name,v_available;
    end if;
  end loop;

  -- Phase 5: Legacy submission keys are projection-only implementation details.
  -- They are deterministic for this already-resolved canonical create command,
  -- but are not Reservation Identity V1 document, line, or TX identities.
  v_legacy_idempotency_key:='identity-v1-idem:'||v_digest;
  v_legacy_reservation_key:='identity-v1-res:'||v_digest;

  -- Build the deterministic Legacy aggregate projection while the locked
  -- inventory/product state is still current. This remains DML-free.
  v_legacy_items:='[]'::jsonb;
  v_subtotal:=0;
  v_discount:=0;

  for v_row in
    select
      (x->>'product_id')::bigint as product_id,
      round(sum((x->>'quantity')::numeric),3)::numeric(14,3) as quantity,
      max(nullif(trim(coalesce(x->>'notes','')),'')) as notes
    from jsonb_array_elements(v_lines) x
    group by (x->>'product_id')::bigint
    order by (x->>'product_id')::bigint
  loop
    select *
      into v_product
      from public.products
     where id=v_row.product_id
       and active=true;

    if not found then
      raise exception 'الصنف غير موجود أو غير فعال';
    end if;

    select *
      into v_ps
      from public.retail_product_settings
     where product_id=v_product.id;

    if not found then
      v_ps.product_id:=v_product.id;
      v_ps.unit_type:='piece';
      v_ps.allow_decimal:=false;
      v_ps.qty_step:=1;
      v_ps.min_qty:=1;
      v_ps.online_enabled:=true;
    end if;

    select *
      into v_bp
      from public.branch_products
     where branch_id=v_branch_id
       and product_id=v_product.id;

    v_qty:=v_row.quantity;
    v_price:=coalesce(v_bp.price_override,v_product.price,0);
    v_line_total:=round(v_price*v_qty,2);
    v_offer:=public.retail_website_offer_discount(
      v_branch_id,v_product.id,v_qty,v_price
    );

    v_subtotal:=v_subtotal+v_line_total;
    v_discount:=v_discount+least(v_line_total,v_offer);

    v_legacy_items:=v_legacy_items||jsonb_build_array(jsonb_build_object(
      'product_id',v_product.id,
      'product_name',v_product.name,
      'unit_type',coalesce(v_ps.unit_type,'piece'),
      'quantity',v_qty,
      'unit_price',v_price,
      'unit_cost_snapshot',coalesce(v_product.cost,0),
      'line_subtotal',v_line_total,
      'offer_discount',least(v_line_total,v_offer),
      'line_total',round(greatest(0,v_line_total-least(v_line_total,v_offer)),2),
      'notes',v_row.notes
    ));
  end loop;

  if jsonb_array_length(v_legacy_items)=0 then
    raise exception 'السلة لا تحتوي أصنافًا صالحة';
  end if;

  v_discount:=round(least(v_subtotal,greatest(0,v_discount)),2);
  v_total:=round(greatest(0,v_subtotal-v_discount+v_delivery),2);
  v_expiry:=now()+interval '15 minutes';
  -- Step 5A: create the Legacy website-order projection.
  insert into public.retail_website_orders(
    branch_id,idempotency_key,reservation_key,
    customer_name,customer_phone,
    customer_address,customer_notes,
    order_type,delivery_zone_id,
    payment_method_code,payment_status,payment_reference,
    subtotal,offer_discount,delivery_fee,total,
    status,reservation_expires_at
  ) values(
    v_branch_id,v_legacy_idempotency_key,v_legacy_reservation_key,
    v_customer_name,v_customer_phone,
    v_customer_address,v_customer_notes,
    v_order_type,v_delivery_zone_id,
    v_payment_method_code,
    case when v_payment_reference is null
      then 'unpaid' else 'proof_submitted' end,
    v_payment_reference,
    v_subtotal,v_discount,v_delivery,v_total,
    'pending',v_expiry
  )
  returning * into v_order;[B[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[D[D[D[D[D[D[D[D[D[D[D[D[D[D[D[D[D[D[D[D[D[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C[C
  -- The Legacy order and this sidecar must commit or roll back together.
  insert into public.retail_reservation_documents_identity_v1(
    retail_website_order_id,
    document_uid,
    creation_client_tx_id,
    creation_operation_digest
  ) values(
    v_order.id,
    v_document_uid::uuid,
    v_client_tx_id::uuid,
    v_digest
  )
  returning * into v_document;
  for v_line in
    select value
    from jsonb_array_elements(v_lines)
  loop
    v_line_uid:=public.point4_identity_uuid_v4_v1(v_line->>'line_uid');
    v_product_id:=public.point4_identity_bigint_v1(v_line->'product_id',false);
    v_qty:=(public.point4_identity_decimal_v1(
      (v_line->>'quantity')::numeric,
      3
    ))::numeric(14,3);
    v_notes:=nullif(trim(coalesce(v_line->>'notes','')),'');
    v_effect_line_key:=public.point4_identity_effect_line_key_v1(
      'stock',
      'reservation',
      v_line_uid
    );

    v_line_digest:=pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          jsonb_build_object(
            'line_key',v_effect_line_key,
            'line_uid',v_line_uid,
            'product_id',v_product_id::text,
            'quantity',v_qty::text,
            'notes',v_notes
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

    insert into public.retail_reservation_lines_identity_v1(
      reservation_document_id,
      line_uid,
      product_id,
      quantity,
      normalized_notes,
      reservation_effect_line_key,
      canonical_line_digest
    ) values(
      v_document.id,
      v_line_uid::uuid,
      v_product_id,
      v_qty,
      v_notes,
      v_effect_line_key,
      v_line_digest
    );
  end loop;
  update public.retail_website_orders
     set public_order_code='RW-'||lpad(v_order.id::text,8,'0')
   where id=v_order.id
  returning * into v_order;
  insert into public.retail_website_order_items(
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
  from jsonb_to_recordset(v_legacy_items) as x(
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
  update public.retail_stock_reservations r
     set status='expired'
   where r.branch_id=v_branch_id
     and r.status='active'
     and r.expires_at<=now()
     and exists(
       select 1
       from jsonb_to_recordset(v_legacy_items) as x(
         product_id bigint,
         quantity numeric
       )
       where x.product_id=r.product_id
     );
  insert into public.retail_stock_reservations(
    branch_id,
    product_id,
    quantity,
    reservation_key,
    status,
    expires_at,
    website_order_id
  )
  select
    v_branch_id,
    x.product_id,
    x.quantity,
    v_legacy_reservation_key,
    'active',
    v_expiry,
    v_order.id
  from jsonb_to_recordset(v_legacy_items) as x(
    product_id bigint,
    quantity numeric
  )
  on conflict(reservation_key,product_id) do update
    set quantity=excluded.quantity,
        status='active',
        expires_at=excluded.expires_at,
        website_order_id=excluded.website_order_id;
  perform public.retail_reservation_identity_assert_projection_v1(v_document.id);

  return jsonb_build_object(
    'ok',true,
    'id',v_order.id,
    'order_code',v_order.public_order_code,
    'status',v_order.status,
    'subtotal',v_order.subtotal,
    'offer_discount',v_order.offer_discount,
    'delivery_fee',v_order.delivery_fee,
    'total',v_order.total,
    'reservation_expires_at',v_order.reservation_expires_at,
    'document_uid',v_document_uid,
    'source_document_id',v_source_document_id,
    'client_tx_id',v_client_tx_id,
    'operation_digest',v_digest,
    'idempotent',false
  );
end;
$$;
-- ============================================================================
-- 7. Versioned Reservation Identity V1 mutation entrypoints
-- ============================================================================

create or replace function public.accept_retail_website_order_identity_v1(
  p_document_uid text,
  p_client_tx_id text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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
    join public.retail_website_order_items wi
      on wi.product_id=b.product_id
     and wi.retail_website_order_id=v_web.id
   where b.branch_id=v_web.branch_id
   order by b.product_id
   for update of b;

  if exists(
    select 1
      from public.retail_website_order_items wi
      left join public.retail_stock_reservations r
        on r.website_order_id=v_web.id
       and r.reservation_key=v_web.reservation_key
       and r.product_id=wi.product_id
       and r.status='active'
       and r.expires_at>now()
     where wi.retail_website_order_id=v_web.id
       and (r.id is null or r.quantity<wi.quantity)
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
  from public.retail_website_order_items wi
  where wi.retail_website_order_id=v_web.id;

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
     and status='active';

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
$$;
-- === Point 4 / Batch 4C-1: Reject Identity V1 ===

create or replace function public.reject_retail_website_order_identity_v1(
  p_document_uid text,
  p_client_tx_id text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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
     and status='active';
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
$$;
-- === Point 4 / Batch 4C-1: Cancel Identity V1 ===

create or replace function public.cancel_retail_website_order_customer_identity_v1(
  p_document_uid text,
  p_client_tx_id text,
  p_customer_phone text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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
     and status='active';
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
$$;
-- === Point 4 / Batch 4C-1: Expire Identity V1 ===

create or replace function public.expire_retail_website_order_identity_v1(
  p_document_uid text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_document_uid text;
  v_client_tx_id text;
  v_digest text;
  v_document public.retail_reservation_documents_identity_v1%rowtype;
  v_mutation public.retail_reservation_mutations_identity_v1%rowtype;
  v_web public.retail_website_orders%rowtype;
  v_result jsonb;
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
     and status='active';

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
$$;
-- ============================================================================
-- 11. Reservation Identity V1 security boundary
-- ============================================================================

alter table public.retail_reservation_documents_identity_v1
  enable row level security;

alter table public.retail_reservation_lines_identity_v1
  enable row level security;

alter table public.retail_reservation_mutations_identity_v1
  enable row level security;


create policy retail_reservation_documents_identity_v1_staff_select
on public.retail_reservation_documents_identity_v1
for select
to authenticated
using (
  exists (
    select 1
    from public.retail_website_orders w
    where w.id = retail_reservation_documents_identity_v1.retail_website_order_id
      and public.has_branch_access(w.branch_id)
  )
);


create policy retail_reservation_lines_identity_v1_staff_select
on public.retail_reservation_lines_identity_v1
for select
to authenticated
using (
  exists (
    select 1
    from public.retail_reservation_documents_identity_v1 d
    join public.retail_website_orders w
      on w.id = d.retail_website_order_id
    where d.id = retail_reservation_lines_identity_v1.reservation_document_id
      and public.has_branch_access(w.branch_id)
  )
);


create policy retail_reservation_mutations_identity_v1_staff_select
on public.retail_reservation_mutations_identity_v1
for select
to authenticated
using (
  exists (
    select 1
    from public.retail_reservation_documents_identity_v1 d
    join public.retail_website_orders w
      on w.id = d.retail_website_order_id
    where d.id = retail_reservation_mutations_identity_v1.reservation_document_id
      and public.has_branch_access(w.branch_id)
  )
);


revoke insert, update, delete
on public.retail_reservation_documents_identity_v1
from public, anon, authenticated;

revoke insert, update, delete
on public.retail_reservation_lines_identity_v1
from public, anon, authenticated;

revoke insert, update, delete
on public.retail_reservation_mutations_identity_v1
from public, anon, authenticated;


revoke execute
on function public.retail_reservation_identity_immutable_v1()
from public, anon, authenticated;

revoke execute
on function public.retail_reservation_mutation_guard_v1()
from public, anon, authenticated;

revoke execute
on function public.retail_reservation_identity_digest_v1(
  text,text,text,bigint,jsonb,jsonb
)
from public, anon, authenticated;

revoke execute
on function public.retail_reservation_identity_resolve_mutation_v1(
  text,text,text
)
from public, anon, authenticated;

revoke execute
on function public.retail_reservation_identity_assert_projection_v1(
  bigint
)
from public, anon, authenticated;


revoke execute
on function public.retail_create_website_order_identity_v1(jsonb)
from public, anon, authenticated;

revoke execute
on function public.accept_retail_website_order_identity_v1(text,text)
from public, anon, authenticated;

revoke execute
on function public.reject_retail_website_order_identity_v1(text,text,text)
from public, anon, authenticated;

revoke execute
on function public.cancel_retail_website_order_customer_identity_v1(
  text,text,text
)
from public, anon, authenticated;

revoke execute
on function public.expire_retail_website_order_identity_v1(text)
from public, anon, authenticated;


grant execute
on function public.retail_create_website_order_identity_v1(jsonb)
to anon, authenticated;

grant execute
on function public.accept_retail_website_order_identity_v1(text,text)
to authenticated;

grant execute
on function public.reject_retail_website_order_identity_v1(text,text,text)
to authenticated;

grant execute
on function public.cancel_retail_website_order_customer_identity_v1(
  text,text,text
)
to anon, authenticated;


notify pgrst, 'reload schema';

commit;