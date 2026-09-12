-- Sharawla POS — Recipe Advanced V1 Foundation
-- Additive operational-backend migration for isolated Beta first.
-- Builds on Recipe Basic V1. No stock posting is connected to checkout/production yet.

begin;

-- -----------------------------------------------------------------------------
-- 1) Cost/Yield fields on the existing ingredient stock model
-- -----------------------------------------------------------------------------
alter table public.ingredients
  add column if not exists usable_yield_percent numeric(7,4) not null default 100,
  add column if not exists shelf_life_minutes integer;

alter table public.ingredients
  drop constraint if exists ingredients_usable_yield_percent_check,
  add constraint ingredients_usable_yield_percent_check
    check (usable_yield_percent > 0 and usable_yield_percent <= 100),
  drop constraint if exists ingredients_shelf_life_minutes_check,
  add constraint ingredients_shelf_life_minutes_check
    check (shelf_life_minutes is null or shelf_life_minutes >= 0);

alter table public.ingredient_stock
  add column if not exists average_unit_cost numeric(18,6) not null default 0,
  add column if not exists last_purchase_cost numeric(18,6) not null default 0,
  add column if not exists last_costed_at timestamptz;

alter table public.ingredient_stock
  drop constraint if exists ingredient_stock_average_unit_cost_check,
  add constraint ingredient_stock_average_unit_cost_check check (average_unit_cost >= 0),
  drop constraint if exists ingredient_stock_last_purchase_cost_check,
  add constraint ingredient_stock_last_purchase_cost_check check (last_purchase_cost >= 0);

-- -----------------------------------------------------------------------------
-- 2) Prep Items
--    Every Prep Item produces one Ingredient row. The output can therefore be
--    stocked and reused by another recipe without creating a second stock model.
-- -----------------------------------------------------------------------------
create table if not exists public.food_prep_items (
  id bigserial primary key,
  name text not null,
  output_ingredient_id bigint not null unique references public.ingredients(id) on delete restrict,
  base_unit_code text not null references public.inventory_units(code),
  default_batch_quantity numeric(14,6) not null default 1 check (default_batch_quantity > 0),
  shelf_life_minutes integer,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_prep_items_name_not_blank check (trim(name) <> ''),
  constraint food_prep_items_shelf_life_check check (shelf_life_minutes is null or shelf_life_minutes >= 0)
);

create or replace function public.enforce_food_prep_output_unit_v1()
returns trigger
language plpgsql
set search_path=public
as $$
declare v_unit text;
begin
  select base_unit_code into v_unit from public.ingredients where id=new.output_ingredient_id;
  if v_unit is not null and v_unit<>new.base_unit_code then
    raise exception 'Prep Item output unit must match the output ingredient base unit';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_food_prep_output_unit_v1 on public.food_prep_items;
create trigger trg_food_prep_output_unit_v1
before insert or update on public.food_prep_items
for each row execute function public.enforce_food_prep_output_unit_v1();

-- Recipe Basic headers become capable of targeting a Prep Item.
alter table public.food_recipe_headers
  alter column product_id drop not null,
  add column if not exists prep_item_id bigint references public.food_prep_items(id) on delete cascade;

alter table public.food_recipe_headers
  drop constraint if exists food_recipe_headers_target_check,
  add constraint food_recipe_headers_target_check check (
    (recipe_kind='sale' and product_id is not null and prep_item_id is null)
    or
    (recipe_kind='prep' and product_id is null and variant_id is null and prep_item_id is not null)
    or
    (recipe_kind='production' and (
      (product_id is not null and prep_item_id is null)
      or (product_id is null and variant_id is null and prep_item_id is not null)
    ))
  );

create unique index if not exists food_recipe_headers_prep_uidx
  on public.food_recipe_headers(prep_item_id)
  where prep_item_id is not null and recipe_kind='prep' and active=true;

-- -----------------------------------------------------------------------------
-- 3) Production Batches and actual consumption
-- -----------------------------------------------------------------------------
create table if not exists public.food_production_batches (
  id bigserial primary key,
  branch_id bigint not null references public.branches(id) on delete restrict,
  prep_item_id bigint not null references public.food_prep_items(id) on delete restrict,
  recipe_version_id bigint not null references public.food_recipe_versions(id) on delete restrict,
  batch_number text,
  status text not null default 'draft'
    check (status in ('draft','in_progress','completed','cancelled')),
  planned_output_quantity numeric(14,6) not null check (planned_output_quantity > 0),
  actual_output_quantity numeric(14,6) check (actual_output_quantity is null or actual_output_quantity >= 0),
  output_unit_code text not null references public.inventory_units(code),
  client_tx_id text not null unique,
  started_by_employee_id bigint references public.employees(id),
  completed_by_employee_id bigint references public.employees(id),
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists food_production_batches_batch_number_uidx
  on public.food_production_batches(branch_id,lower(trim(batch_number)))
  where batch_number is not null and trim(batch_number)<>'';
create index if not exists food_production_batches_branch_created_idx
  on public.food_production_batches(branch_id,created_at desc);

create or replace function public.enforce_food_production_recipe_scope_v1()
returns trigger
language plpgsql
set search_path=public
as $$
declare v_prep bigint; v_status text;
begin
  select h.prep_item_id,v.status into v_prep,v_status
  from public.food_recipe_versions v
  join public.food_recipe_headers h on h.id=v.recipe_id
  where v.id=new.recipe_version_id;
  if v_prep is null or v_prep<>new.prep_item_id then
    raise exception 'Production batch recipe must belong to the selected Prep Item';
  end if;
  if v_status<>'active' then
    raise exception 'Production batch requires an active recipe version';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_food_production_recipe_scope_v1 on public.food_production_batches;
create trigger trg_food_production_recipe_scope_v1
before insert or update of prep_item_id,recipe_version_id on public.food_production_batches
for each row execute function public.enforce_food_production_recipe_scope_v1();

create table if not exists public.food_production_consumptions (
  id bigserial primary key,
  production_batch_id bigint not null references public.food_production_batches(id) on delete cascade,
  ingredient_id bigint not null references public.ingredients(id) on delete restrict,
  planned_base_quantity numeric(18,6) not null default 0 check (planned_base_quantity >= 0),
  actual_base_quantity numeric(18,6) not null default 0 check (actual_base_quantity >= 0),
  unit_cost_snapshot numeric(18,6) not null default 0 check (unit_cost_snapshot >= 0),
  actual_cost numeric(18,6) generated always as (actual_base_quantity*unit_cost_snapshot) stored,
  created_at timestamptz not null default now(),
  unique(production_batch_id,ingredient_id)
);

-- -----------------------------------------------------------------------------
-- 4) Structured Waste
-- -----------------------------------------------------------------------------
create table if not exists public.food_waste_reasons (
  code text primary key,
  name_ar text not null,
  name_en text not null,
  active boolean not null default true,
  sort_order integer not null default 0
);

insert into public.food_waste_reasons(code,name_ar,name_en,sort_order)
values
  ('spoilage','تلف','Spoilage',10),
  ('expiry','انتهاء صلاحية','Expiry',20),
  ('prep_loss','فاقد تحضير','Preparation Loss',30),
  ('overproduction','إنتاج زائد','Overproduction',40),
  ('damage','تلف تشغيلي','Operational Damage',50)
on conflict(code) do nothing;

create table if not exists public.food_waste_events (
  id bigserial primary key,
  branch_id bigint not null references public.branches(id) on delete restrict,
  ingredient_id bigint not null references public.ingredients(id) on delete restrict,
  prep_item_id bigint references public.food_prep_items(id) on delete set null,
  shift_id bigint references public.shifts(id) on delete set null,
  reason_code text not null references public.food_waste_reasons(code),
  quantity numeric(14,6) not null check (quantity > 0),
  unit_code text not null references public.inventory_units(code),
  conversion_factor_to_base numeric(18,6) not null check (conversion_factor_to_base > 0),
  base_quantity numeric(18,6) generated always as (quantity*conversion_factor_to_base) stored,
  unit_cost_snapshot numeric(18,6) not null default 0 check (unit_cost_snapshot >= 0),
  waste_cost numeric(18,6) generated always as ((quantity*conversion_factor_to_base)*unit_cost_snapshot) stored,
  status text not null default 'draft' check (status in ('draft','posted','cancelled')),
  client_tx_id text not null unique,
  notes text,
  employee_id bigint references public.employees(id),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists food_waste_events_branch_occurred_idx
  on public.food_waste_events(branch_id,occurred_at desc);
create index if not exists food_waste_events_ingredient_idx
  on public.food_waste_events(ingredient_id,occurred_at desc);

-- If waste is explicitly marked as Prep Item waste, ensure its output ingredient matches.
create or replace function public.enforce_food_waste_prep_scope_v1()
returns trigger
language plpgsql
set search_path=public
as $$
declare v_output bigint;
begin
  if new.prep_item_id is null then return new; end if;
  select output_ingredient_id into v_output from public.food_prep_items where id=new.prep_item_id;
  if v_output is null or v_output<>new.ingredient_id then
    raise exception 'Prep waste ingredient must be the Prep Item output ingredient';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_food_waste_prep_scope_v1 on public.food_waste_events;
create trigger trg_food_waste_prep_scope_v1
before insert or update of ingredient_id,prep_item_id on public.food_waste_events
for each row execute function public.enforce_food_waste_prep_scope_v1();

-- -----------------------------------------------------------------------------
-- 5) Historical sale consumption and cost snapshots
--    Filled later by the atomic checkout integration. Empty until that gate.
-- -----------------------------------------------------------------------------
create table if not exists public.food_order_item_consumption_snapshots (
  id bigserial primary key,
  order_item_id bigint not null references public.order_items(id) on delete cascade,
  recipe_version_id bigint not null references public.food_recipe_versions(id) on delete restrict,
  ingredient_id bigint not null references public.ingredients(id) on delete restrict,
  source_kind text not null default 'base' check (source_kind in ('base','modifier')),
  modifier_id bigint references public.modifiers(id) on delete set null,
  base_quantity numeric(18,6) not null check (base_quantity > 0),
  unit_cost_snapshot numeric(18,6) not null default 0 check (unit_cost_snapshot >= 0),
  total_cost numeric(18,6) generated always as (base_quantity*unit_cost_snapshot) stored,
  created_at timestamptz not null default now()
);
create index if not exists food_order_item_consumption_order_idx
  on public.food_order_item_consumption_snapshots(order_item_id);
create index if not exists food_order_item_consumption_ingredient_idx
  on public.food_order_item_consumption_snapshots(ingredient_id,created_at desc);

create table if not exists public.food_order_item_cost_snapshots (
  order_item_id bigint primary key references public.order_items(id) on delete cascade,
  recipe_version_id bigint not null references public.food_recipe_versions(id) on delete restrict,
  base_recipe_cost numeric(18,6) not null default 0 check (base_recipe_cost >= 0),
  modifier_cost numeric(18,6) not null default 0,
  total_food_cost numeric(18,6) not null default 0,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 6) Advanced costing / variance read models
-- -----------------------------------------------------------------------------
create or replace view public.food_recipe_branch_cost_v1 as
select
  b.id branch_id,
  h.id recipe_id,
  h.product_id,
  h.variant_id,
  h.prep_item_id,
  v.id recipe_version_id,
  v.version_no,
  sum(
    l.base_quantity *
    (case when coalesce(s.average_unit_cost,0)>0 then s.average_unit_cost else coalesce(i.cost_per_unit,0) end)
    / greatest(coalesce(i.usable_yield_percent,100)/100.0,0.000001)
  )::numeric(18,4) recipe_cost,
  count(*)::integer ingredient_count
from public.food_recipe_headers h
join public.food_recipe_versions v on v.recipe_id=h.id and v.status='active'
join public.food_recipe_lines l on l.recipe_version_id=v.id
join public.ingredients i on i.id=l.ingredient_id
cross join public.branches b
left join public.ingredient_stock s on s.branch_id=b.id and s.ingredient_id=i.id
where h.active=true
  and (v.effective_from is null or v.effective_from<=now())
  and (v.effective_to is null or v.effective_to>now())
group by b.id,h.id,h.product_id,h.variant_id,h.prep_item_id,v.id,v.version_no;

create or replace view public.food_production_variance_v1 as
select
  pb.id production_batch_id,
  pb.branch_id,
  pb.prep_item_id,
  pb.recipe_version_id,
  pb.status,
  pb.planned_output_quantity,
  pb.actual_output_quantity,
  case when pb.planned_output_quantity>0 and pb.actual_output_quantity is not null
    then round((pb.actual_output_quantity/pb.planned_output_quantity)*100,2)
    else null end as output_yield_percent,
  coalesce(sum(pc.planned_base_quantity*pc.unit_cost_snapshot),0)::numeric(18,4) planned_input_cost,
  coalesce(sum(pc.actual_cost),0)::numeric(18,4) actual_input_cost,
  case when coalesce(pb.actual_output_quantity,0)>0
    then (coalesce(sum(pc.actual_cost),0)/pb.actual_output_quantity)::numeric(18,6)
    else null end as actual_cost_per_output_unit
from public.food_production_batches pb
left join public.food_production_consumptions pc on pc.production_batch_id=pb.id
group by pb.id,pb.branch_id,pb.prep_item_id,pb.recipe_version_id,pb.status,pb.planned_output_quantity,pb.actual_output_quantity;

create or replace view public.food_theoretical_consumption_v1 as
select
  o.branch_id,
  date(o.created_at) business_date,
  s.ingredient_id,
  sum(s.base_quantity)::numeric(18,6) theoretical_base_quantity,
  sum(s.total_cost)::numeric(18,4) theoretical_cost
from public.food_order_item_consumption_snapshots s
join public.order_items oi on oi.id=s.order_item_id
join public.orders o on o.id=oi.order_id
group by o.branch_id,date(o.created_at),s.ingredient_id;

create or replace view public.food_waste_summary_v1 as
select
  branch_id,
  date(occurred_at) business_date,
  ingredient_id,
  reason_code,
  sum(base_quantity)::numeric(18,6) wasted_base_quantity,
  sum(waste_cost)::numeric(18,4) waste_cost
from public.food_waste_events
where status='posted'
group by branch_id,date(occurred_at),ingredient_id,reason_code;

-- -----------------------------------------------------------------------------
-- 7) RLS/read-only foundation. Posting RPCs are intentionally deferred.
-- -----------------------------------------------------------------------------
alter table public.food_prep_items enable row level security;
alter table public.food_production_batches enable row level security;
alter table public.food_production_consumptions enable row level security;
alter table public.food_waste_reasons enable row level security;
alter table public.food_waste_events enable row level security;
alter table public.food_order_item_consumption_snapshots enable row level security;
alter table public.food_order_item_cost_snapshots enable row level security;

drop policy if exists food_prep_items_select_v1 on public.food_prep_items;
create policy food_prep_items_select_v1 on public.food_prep_items for select to authenticated using (true);
drop policy if exists food_production_batches_select_v1 on public.food_production_batches;
create policy food_production_batches_select_v1 on public.food_production_batches for select to authenticated using (public.has_branch_access(branch_id));
drop policy if exists food_production_consumptions_select_v1 on public.food_production_consumptions;
create policy food_production_consumptions_select_v1 on public.food_production_consumptions for select to authenticated
using (exists(select 1 from public.food_production_batches b where b.id=production_batch_id and public.has_branch_access(b.branch_id)));
drop policy if exists food_waste_reasons_select_v1 on public.food_waste_reasons;
create policy food_waste_reasons_select_v1 on public.food_waste_reasons for select to authenticated using (active=true);
drop policy if exists food_waste_events_select_v1 on public.food_waste_events;
create policy food_waste_events_select_v1 on public.food_waste_events for select to authenticated using (public.has_branch_access(branch_id));
drop policy if exists food_order_item_consumption_select_v1 on public.food_order_item_consumption_snapshots;
create policy food_order_item_consumption_select_v1 on public.food_order_item_consumption_snapshots for select to authenticated
using (exists(select 1 from public.order_items oi join public.orders o on o.id=oi.order_id where oi.id=order_item_id and public.has_branch_access(o.branch_id)));
drop policy if exists food_order_item_cost_select_v1 on public.food_order_item_cost_snapshots;
create policy food_order_item_cost_select_v1 on public.food_order_item_cost_snapshots for select to authenticated
using (exists(select 1 from public.order_items oi join public.orders o on o.id=oi.order_id where oi.id=order_item_id and public.has_branch_access(o.branch_id)));

revoke insert,update,delete on public.food_prep_items,public.food_production_batches,public.food_production_consumptions,
  public.food_waste_reasons,public.food_waste_events,public.food_order_item_consumption_snapshots,
  public.food_order_item_cost_snapshots from authenticated;

grant select on public.food_prep_items,public.food_production_batches,public.food_production_consumptions,
  public.food_waste_reasons,public.food_waste_events,public.food_order_item_consumption_snapshots,
  public.food_order_item_cost_snapshots to authenticated;
grant select on public.food_recipe_branch_cost_v1,public.food_production_variance_v1,
  public.food_theoretical_consumption_v1,public.food_waste_summary_v1 to authenticated;

comment on table public.food_prep_items is 'Advanced Recipe semi-finished/prepared item. Output is an Ingredient so it shares one stock model.';
comment on table public.food_production_batches is 'Production execution document; stock posting is intentionally deferred to a secured atomic completion RPC.';
comment on table public.food_waste_events is 'Structured food waste document. Draft rows do not affect stock until a future atomic posting RPC.';
comment on table public.food_order_item_consumption_snapshots is 'Immutable theoretical ingredient consumption captured at sale time after checkout integration.';
comment on table public.food_order_item_cost_snapshots is 'Immutable food-cost snapshot per sold order item for historical profitability.';

commit;
