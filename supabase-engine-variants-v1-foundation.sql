-- Sharawla POS — Variants Engine V1 Foundation
-- Additive operational-backend migration.
-- Safe compatibility contract:
--   * Existing public.product_variants remains the legacy/simple option table used by Restaurant sizes.
--   * Existing rows are never rewritten.
--   * Existing orders/order_items and retail product-level inventory are untouched.
--   * New retail matrix variants opt in with product_variants.is_stock_unit = true.
--   * commerce.variants must remain Planned until POS checkout/UI consumption is implemented and accepted.

begin;

-- -----------------------------------------------------------------------------
-- 1) Extend the existing legacy product_variants row without changing old behavior.
-- -----------------------------------------------------------------------------
alter table public.product_variants
  add column if not exists sku text,
  add column if not exists barcode text,
  add column if not exists cost numeric(14,4),
  add column if not exists is_stock_unit boolean not null default false,
  add column if not exists image_url text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Existing Restaurant variants keep is_stock_unit=false by default.
-- Unique identifiers apply only when supplied.
create unique index if not exists product_variants_sku_uidx
  on public.product_variants ((lower(trim(sku))))
  where sku is not null and trim(sku) <> '';

create unique index if not exists product_variants_barcode_uidx
  on public.product_variants (barcode)
  where barcode is not null and trim(barcode) <> '';

-- -----------------------------------------------------------------------------
-- 2) Product-scoped matrix axes: Size / Color / Shade / Capacity / etc.
--    Product-scoped by design so industries can define their own vocabulary.
-- -----------------------------------------------------------------------------
create table if not exists public.product_variant_axes (
  id bigserial primary key,
  product_id bigint not null references public.products(id) on delete cascade,
  code text not null,
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variant_axes_code_not_blank check (trim(code) <> ''),
  constraint product_variant_axes_name_not_blank check (trim(name) <> '')
);

create unique index if not exists product_variant_axes_product_code_uidx
  on public.product_variant_axes(product_id, lower(trim(code)));

create table if not exists public.product_variant_axis_values (
  id bigserial primary key,
  axis_id bigint not null references public.product_variant_axes(id) on delete cascade,
  code text not null,
  value text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variant_axis_values_code_not_blank check (trim(code) <> ''),
  constraint product_variant_axis_values_value_not_blank check (trim(value) <> ''),
  unique(axis_id,id)
);

create unique index if not exists product_variant_axis_values_axis_code_uidx
  on public.product_variant_axis_values(axis_id, lower(trim(code)));
create unique index if not exists product_variant_axis_values_axis_value_uidx
  on public.product_variant_axis_values(axis_id, lower(trim(value)));

-- One selected value per axis per variant.
create table if not exists public.product_variant_selections (
  variant_id bigint not null references public.product_variants(id) on delete cascade,
  axis_id bigint not null references public.product_variant_axes(id) on delete cascade,
  axis_value_id bigint not null,
  created_at timestamptz not null default now(),
  primary key(variant_id,axis_id),
  foreign key(axis_id,axis_value_id)
    references public.product_variant_axis_values(axis_id,id)
    on delete cascade
);

create index if not exists product_variant_selections_value_idx
  on public.product_variant_selections(axis_value_id);

-- Enforce that a variant and its selected axis belong to the same parent product.
create or replace function public.enforce_product_variant_selection_scope_v1()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_variant_product bigint;
  v_axis_product bigint;
begin
  select product_id into v_variant_product
  from public.product_variants
  where id=new.variant_id;

  select product_id into v_axis_product
  from public.product_variant_axes
  where id=new.axis_id;

  if v_variant_product is null or v_axis_product is null or v_variant_product <> v_axis_product then
    raise exception 'Variant axis must belong to the same product';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_product_variant_selection_scope_v1 on public.product_variant_selections;
create trigger trg_product_variant_selection_scope_v1
before insert or update on public.product_variant_selections
for each row execute function public.enforce_product_variant_selection_scope_v1();

-- -----------------------------------------------------------------------------
-- 3) Independent branch stock for true stock-unit variants.
--    Existing public.retail_inventory_balances(product_id) is intentionally untouched.
-- -----------------------------------------------------------------------------
create table if not exists public.retail_variant_inventory_balances (
  branch_id bigint not null references public.branches(id) on delete cascade,
  variant_id bigint not null references public.product_variants(id) on delete cascade,
  quantity numeric(14,3) not null default 0,
  low_stock_threshold numeric(14,3),
  track_inventory boolean not null default true,
  average_unit_cost numeric(14,4) not null default 0,
  last_purchase_cost numeric(14,4) not null default 0,
  updated_at timestamptz not null default now(),
  primary key(branch_id,variant_id),
  constraint retail_variant_inventory_quantity_finite check (quantity > -100000000000::numeric and quantity < 100000000000::numeric),
  constraint retail_variant_inventory_low_stock_nonnegative check (low_stock_threshold is null or low_stock_threshold >= 0),
  constraint retail_variant_inventory_avg_cost_nonnegative check (average_unit_cost >= 0),
  constraint retail_variant_inventory_last_cost_nonnegative check (last_purchase_cost >= 0)
);

create table if not exists public.retail_variant_inventory_movements (
  id bigserial primary key,
  branch_id bigint not null references public.branches(id) on delete restrict,
  variant_id bigint not null references public.product_variants(id) on delete restrict,
  movement_type text not null check (movement_type in ('opening','sale','return','adjustment','waste','purchase','supplier_return','transfer_out','transfer_in')),
  quantity_delta numeric(14,3) not null check (quantity_delta <> 0),
  balance_after numeric(14,3) not null,
  unit_cost numeric(14,4),
  reference_type text,
  reference_id text,
  client_tx_id text,
  notes text,
  employee_id bigint references public.employees(id),
  created_at timestamptz not null default now()
);

create index if not exists retail_variant_inventory_movements_branch_created_idx
  on public.retail_variant_inventory_movements(branch_id,created_at desc);
create index if not exists retail_variant_inventory_movements_variant_created_idx
  on public.retail_variant_inventory_movements(variant_id,created_at desc);
create unique index if not exists retail_variant_inventory_movements_idempotency_uidx
  on public.retail_variant_inventory_movements(client_tx_id,variant_id,movement_type)
  where client_tx_id is not null;

-- -----------------------------------------------------------------------------
-- 4) RLS. Catalog reads are authenticated; writes for the new matrix are routed
--    through future secured RPC/UI work. Variant stock writes use the RPC below.
-- -----------------------------------------------------------------------------
alter table public.product_variant_axes enable row level security;
alter table public.product_variant_axis_values enable row level security;
alter table public.product_variant_selections enable row level security;
alter table public.retail_variant_inventory_balances enable row level security;
alter table public.retail_variant_inventory_movements enable row level security;

drop policy if exists product_variant_axes_select_v1 on public.product_variant_axes;
create policy product_variant_axes_select_v1 on public.product_variant_axes
for select to authenticated using (true);

drop policy if exists product_variant_axis_values_select_v1 on public.product_variant_axis_values;
create policy product_variant_axis_values_select_v1 on public.product_variant_axis_values
for select to authenticated using (true);

drop policy if exists product_variant_selections_select_v1 on public.product_variant_selections;
create policy product_variant_selections_select_v1 on public.product_variant_selections
for select to authenticated using (true);

drop policy if exists retail_variant_inventory_balances_select_v1 on public.retail_variant_inventory_balances;
create policy retail_variant_inventory_balances_select_v1 on public.retail_variant_inventory_balances
for select to authenticated using (public.has_branch_access(branch_id));

drop policy if exists retail_variant_inventory_movements_select_v1 on public.retail_variant_inventory_movements;
create policy retail_variant_inventory_movements_select_v1 on public.retail_variant_inventory_movements
for select to authenticated using (public.has_branch_access(branch_id));

revoke insert,update,delete on public.product_variant_axes from authenticated;
revoke insert,update,delete on public.product_variant_axis_values from authenticated;
revoke insert,update,delete on public.product_variant_selections from authenticated;
revoke insert,update,delete on public.retail_variant_inventory_balances from authenticated;
revoke insert,update,delete on public.retail_variant_inventory_movements from authenticated;

grant select on public.product_variant_axes,public.product_variant_axis_values,public.product_variant_selections,
  public.retail_variant_inventory_balances,public.retail_variant_inventory_movements to authenticated;

-- -----------------------------------------------------------------------------
-- 5) Safe manual variant inventory adjustment RPC.
--    Does not participate in checkout yet; checkout integration is a later gate.
-- -----------------------------------------------------------------------------
create or replace function public.retail_variant_inventory_adjust_v1(
  p_branch_id bigint,
  p_variant_id bigint,
  p_quantity_delta numeric,
  p_movement_type text,
  p_notes text,
  p_client_tx_id text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_emp bigint;
  v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_type text:=lower(trim(coalesce(p_movement_type,'')));
  v_delta numeric(14,3):=round(coalesce(p_quantity_delta,0)::numeric,3);
  v_balance public.retail_variant_inventory_balances%rowtype;
  v_existing public.retail_variant_inventory_movements%rowtype;
  v_stock_unit boolean;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not (public.is_admin() or public.has_permission('inventory')) then raise exception 'ليس لديك صلاحية إدارة المخزون'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  if v_type not in ('opening','adjustment','waste') then raise exception 'نوع حركة المخزون غير مسموح'; end if;
  if v_delta=0 then raise exception 'كمية الحركة لا يمكن أن تكون صفر'; end if;
  if v_type='waste' and v_delta>0 then v_delta:=-v_delta; end if;

  select coalesce(is_stock_unit,false) into v_stock_unit
  from public.product_variants
  where id=p_variant_id and active=true;
  if not found then raise exception 'الـ Variant غير موجود أو غير نشط'; end if;
  if not v_stock_unit then raise exception 'هذا الاختيار Legacy وليس Stock Unit مستقل'; end if;

  v_emp:=public.current_employee_id();
  perform pg_advisory_xact_lock(hashtextextended('variant-stock:'||v_key,0));

  select * into v_existing
  from public.retail_variant_inventory_movements
  where client_tx_id=v_key and variant_id=p_variant_id and movement_type=v_type
  limit 1;
  if found then return to_jsonb(v_existing); end if;

  insert into public.retail_variant_inventory_balances(branch_id,variant_id,quantity)
  values(p_branch_id,p_variant_id,0)
  on conflict(branch_id,variant_id) do nothing;

  select * into v_balance
  from public.retail_variant_inventory_balances
  where branch_id=p_branch_id and variant_id=p_variant_id
  for update;

  update public.retail_variant_inventory_balances
  set quantity=round(quantity+v_delta,3),updated_at=now()
  where branch_id=p_branch_id and variant_id=p_variant_id
  returning * into v_balance;

  insert into public.retail_variant_inventory_movements(
    branch_id,variant_id,movement_type,quantity_delta,balance_after,
    reference_type,reference_id,client_tx_id,notes,employee_id
  ) values(
    p_branch_id,p_variant_id,v_type,v_delta,v_balance.quantity,
    'manual',v_key,v_key,nullif(trim(coalesce(p_notes,'')),''),v_emp
  ) returning * into v_existing;

  return to_jsonb(v_existing);
end;
$$;

revoke all on function public.retail_variant_inventory_adjust_v1(bigint,bigint,numeric,text,text,text) from public;
grant execute on function public.retail_variant_inventory_adjust_v1(bigint,bigint,numeric,text,text,text) to authenticated;

-- -----------------------------------------------------------------------------
-- 6) Read model for future POS/Admin UI.
-- -----------------------------------------------------------------------------
create or replace view public.product_variant_matrix_v1 as
select
  pv.id as variant_id,
  pv.product_id,
  p.name as product_name,
  pv.name as variant_name,
  pv.sku,
  pv.barcode,
  pv.price,
  coalesce(pv.cost,p.cost,0) as effective_cost,
  pv.is_stock_unit,
  pv.active,
  pv.sort_order,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'axis_id',a.id,
        'axis_code',a.code,
        'axis_name',a.name,
        'value_id',av.id,
        'value_code',av.code,
        'value',av.value
      ) order by a.sort_order,a.id
    ) filter (where a.id is not null),
    '[]'::jsonb
  ) as selections
from public.product_variants pv
join public.products p on p.id=pv.product_id
left join public.product_variant_selections s on s.variant_id=pv.id
left join public.product_variant_axes a on a.id=s.axis_id
left join public.product_variant_axis_values av on av.id=s.axis_value_id
group by pv.id,pv.product_id,p.name,pv.name,pv.sku,pv.barcode,pv.price,pv.cost,p.cost,pv.is_stock_unit,pv.active,pv.sort_order;

grant select on public.product_variant_matrix_v1 to authenticated;

comment on table public.product_variant_axes is 'Variants Engine V1 product-scoped dimensions such as Size, Color, Shade or Capacity.';
comment on table public.product_variant_axis_values is 'Allowed values for a product variant axis.';
comment on table public.product_variant_selections is 'One selected axis value per variant; forms a normalized variant matrix.';
comment on table public.retail_variant_inventory_balances is 'Branch-level stock for true stock-unit variants only; legacy product inventory remains untouched.';
comment on column public.product_variants.is_stock_unit is 'False keeps legacy Restaurant option behavior. True opts the variant into independent stock-unit behavior.';

commit;
