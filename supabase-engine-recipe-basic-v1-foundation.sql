-- Sharawla POS — Recipe Basic V1 Foundation
-- Additive operational-backend migration for isolated Beta first.
-- Preserves legacy ingredients / recipes / ingredient_stock / stock_movements.
-- Does NOT hook recipe consumption into checkout yet.

begin;

-- -----------------------------------------------------------------------------
-- 1) Shared unit catalog
-- -----------------------------------------------------------------------------
create table if not exists public.inventory_units (
  code text primary key,
  name_ar text not null,
  name_en text not null,
  dimension text not null check (dimension in ('mass','volume','count','custom')),
  factor_to_dimension_base numeric(18,6),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint inventory_units_code_not_blank check (trim(code) <> ''),
  constraint inventory_units_factor_positive check (factor_to_dimension_base is null or factor_to_dimension_base > 0)
);

insert into public.inventory_units(code,name_ar,name_en,dimension,factor_to_dimension_base,sort_order)
values
  ('g','جرام','Gram','mass',1,10),
  ('kg','كيلوجرام','Kilogram','mass',1000,20),
  ('ml','مل','Milliliter','volume',1,30),
  ('l','لتر','Liter','volume',1000,40),
  ('pc','قطعة','Piece','count',1,50),
  ('pack','باكت','Pack','custom',null,60),
  ('box','كرتونة','Box','custom',null,70)
on conflict(code) do nothing;

-- -----------------------------------------------------------------------------
-- 2) Ingredient unit configuration and item-specific conversions
--    Legacy ingredients.unit stays authoritative until an ingredient is opted in.
-- -----------------------------------------------------------------------------
alter table public.ingredients
  add column if not exists base_unit_code text references public.inventory_units(code),
  add column if not exists purchase_unit_code text references public.inventory_units(code),
  add column if not exists sku text,
  add column if not exists barcode text,
  add column if not exists track_inventory boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists ingredients_sku_uidx
  on public.ingredients(lower(trim(sku)))
  where sku is not null and trim(sku) <> '';
create unique index if not exists ingredients_barcode_uidx
  on public.ingredients(barcode)
  where barcode is not null and trim(barcode) <> '';

create table if not exists public.ingredient_unit_conversions (
  id bigserial primary key,
  ingredient_id bigint not null references public.ingredients(id) on delete cascade,
  from_unit_code text not null references public.inventory_units(code),
  to_unit_code text not null references public.inventory_units(code),
  factor numeric(18,6) not null check (factor > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(ingredient_id,from_unit_code,to_unit_code),
  constraint ingredient_unit_conversion_not_same check (from_unit_code <> to_unit_code)
);

-- Generic dimensional conversion helper plus ingredient-specific custom conversion.
create or replace function public.ingredient_unit_factor_v1(
  p_ingredient_id bigint,
  p_from_unit_code text,
  p_to_unit_code text
) returns numeric
language plpgsql
stable
set search_path=public
as $$
declare
  v_from public.inventory_units%rowtype;
  v_to public.inventory_units%rowtype;
  v_factor numeric;
begin
  if p_from_unit_code=p_to_unit_code then return 1; end if;

  select * into v_factor
  from (
    select c.factor
    from public.ingredient_unit_conversions c
    where c.ingredient_id=p_ingredient_id
      and c.from_unit_code=p_from_unit_code
      and c.to_unit_code=p_to_unit_code
      and c.active=true
    limit 1
  ) x;
  if v_factor is not null then return v_factor; end if;

  select * into v_from from public.inventory_units where code=p_from_unit_code and active=true;
  select * into v_to from public.inventory_units where code=p_to_unit_code and active=true;
  if v_from.code is null or v_to.code is null then return null; end if;
  if v_from.dimension<>v_to.dimension then return null; end if;
  if v_from.factor_to_dimension_base is null or v_to.factor_to_dimension_base is null then return null; end if;
  return v_from.factor_to_dimension_base / v_to.factor_to_dimension_base;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) Versioned sale recipes
-- -----------------------------------------------------------------------------
create table if not exists public.food_recipe_headers (
  id bigserial primary key,
  product_id bigint not null references public.products(id) on delete cascade,
  variant_id bigint references public.product_variants(id) on delete cascade,
  name text,
  recipe_kind text not null default 'sale' check (recipe_kind in ('sale','prep','production')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists food_recipe_headers_product_base_uidx
  on public.food_recipe_headers(product_id)
  where variant_id is null and recipe_kind='sale' and active=true;
create unique index if not exists food_recipe_headers_product_variant_uidx
  on public.food_recipe_headers(product_id,variant_id)
  where variant_id is not null and recipe_kind='sale' and active=true;

create or replace function public.enforce_food_recipe_variant_scope_v1()
returns trigger
language plpgsql
set search_path=public
as $$
declare v_product bigint;
begin
  if new.variant_id is null then return new; end if;
  select product_id into v_product from public.product_variants where id=new.variant_id;
  if v_product is null or v_product<>new.product_id then
    raise exception 'Recipe variant must belong to the same product';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_food_recipe_variant_scope_v1 on public.food_recipe_headers;
create trigger trg_food_recipe_variant_scope_v1
before insert or update on public.food_recipe_headers
for each row execute function public.enforce_food_recipe_variant_scope_v1();

create table if not exists public.food_recipe_versions (
  id bigserial primary key,
  recipe_id bigint not null references public.food_recipe_headers(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  status text not null default 'draft' check (status in ('draft','active','retired')),
  effective_from timestamptz,
  effective_to timestamptz,
  output_quantity numeric(14,6) not null default 1 check (output_quantity > 0),
  output_unit_code text not null default 'pc' references public.inventory_units(code),
  notes text,
  created_by_employee_id bigint references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(recipe_id,version_no),
  constraint food_recipe_version_dates_check check (effective_to is null or effective_from is null or effective_to > effective_from)
);

create unique index if not exists food_recipe_versions_one_active_uidx
  on public.food_recipe_versions(recipe_id)
  where status='active';

create table if not exists public.food_recipe_lines (
  id bigserial primary key,
  recipe_version_id bigint not null references public.food_recipe_versions(id) on delete cascade,
  ingredient_id bigint not null references public.ingredients(id) on delete restrict,
  quantity numeric(14,6) not null check (quantity > 0),
  unit_code text not null references public.inventory_units(code),
  conversion_factor_to_base numeric(18,6) not null check (conversion_factor_to_base > 0),
  base_quantity numeric(18,6) generated always as (quantity * conversion_factor_to_base) stored,
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique(recipe_version_id,ingredient_id)
);

create index if not exists food_recipe_lines_ingredient_idx
  on public.food_recipe_lines(ingredient_id);

-- -----------------------------------------------------------------------------
-- 4) Modifier and removable-component consumption contracts
--    These are versioned with the recipe so historical cost/consumption remains stable.
-- -----------------------------------------------------------------------------
create table if not exists public.food_modifier_recipe_impacts (
  id bigserial primary key,
  recipe_version_id bigint not null references public.food_recipe_versions(id) on delete cascade,
  modifier_id bigint not null references public.modifiers(id) on delete cascade,
  ingredient_id bigint not null references public.ingredients(id) on delete restrict,
  quantity_delta numeric(14,6) not null check (quantity_delta <> 0),
  unit_code text not null references public.inventory_units(code),
  conversion_factor_to_base numeric(18,6) not null check (conversion_factor_to_base > 0),
  base_quantity_delta numeric(18,6) generated always as (quantity_delta * conversion_factor_to_base) stored,
  created_at timestamptz not null default now(),
  unique(recipe_version_id,modifier_id,ingredient_id)
);

create table if not exists public.food_recipe_removal_mappings (
  id bigserial primary key,
  recipe_version_id bigint not null references public.food_recipe_versions(id) on delete cascade,
  component_name text not null,
  ingredient_id bigint not null references public.ingredients(id) on delete restrict,
  behavior text not null default 'exclude' check (behavior in ('exclude')),
  created_at timestamptz not null default now(),
  unique(recipe_version_id,component_name,ingredient_id),
  constraint food_recipe_removal_component_not_blank check (trim(component_name) <> '')
);

-- -----------------------------------------------------------------------------
-- 5) Active recipe read model and Basic cost preview
--    Uses ingredients.cost_per_unit as cost per configured base unit.
-- -----------------------------------------------------------------------------
create or replace view public.food_active_recipe_lines_v1 as
select
  h.id recipe_id,
  h.product_id,
  h.variant_id,
  v.id recipe_version_id,
  v.version_no,
  l.id recipe_line_id,
  l.ingredient_id,
  i.name ingredient_name,
  i.base_unit_code,
  l.quantity,
  l.unit_code,
  l.conversion_factor_to_base,
  l.base_quantity,
  coalesce(i.cost_per_unit,0)::numeric(14,6) cost_per_base_unit,
  (l.base_quantity*coalesce(i.cost_per_unit,0))::numeric(18,6) line_cost
from public.food_recipe_headers h
join public.food_recipe_versions v on v.recipe_id=h.id and v.status='active'
join public.food_recipe_lines l on l.recipe_version_id=v.id
join public.ingredients i on i.id=l.ingredient_id
where h.active=true
  and (v.effective_from is null or v.effective_from<=now())
  and (v.effective_to is null or v.effective_to>now())
  and i.active is distinct from false;

create or replace view public.food_recipe_cost_preview_v1 as
select
  recipe_id,
  product_id,
  variant_id,
  recipe_version_id,
  version_no,
  sum(line_cost)::numeric(18,4) recipe_cost,
  count(*)::integer ingredient_count,
  bool_and(base_unit_code is not null) units_fully_configured
from public.food_active_recipe_lines_v1
group by recipe_id,product_id,variant_id,recipe_version_id,version_no;

-- -----------------------------------------------------------------------------
-- 6) RLS/read-only foundation. Mutation UI/RPC is a later acceptance gate.
-- -----------------------------------------------------------------------------
alter table public.inventory_units enable row level security;
alter table public.ingredient_unit_conversions enable row level security;
alter table public.food_recipe_headers enable row level security;
alter table public.food_recipe_versions enable row level security;
alter table public.food_recipe_lines enable row level security;
alter table public.food_modifier_recipe_impacts enable row level security;
alter table public.food_recipe_removal_mappings enable row level security;

drop policy if exists inventory_units_select_v1 on public.inventory_units;
create policy inventory_units_select_v1 on public.inventory_units for select to authenticated using (active=true);
drop policy if exists ingredient_unit_conversions_select_v1 on public.ingredient_unit_conversions;
create policy ingredient_unit_conversions_select_v1 on public.ingredient_unit_conversions for select to authenticated using (active=true);
drop policy if exists food_recipe_headers_select_v1 on public.food_recipe_headers;
create policy food_recipe_headers_select_v1 on public.food_recipe_headers for select to authenticated using (true);
drop policy if exists food_recipe_versions_select_v1 on public.food_recipe_versions;
create policy food_recipe_versions_select_v1 on public.food_recipe_versions for select to authenticated using (true);
drop policy if exists food_recipe_lines_select_v1 on public.food_recipe_lines;
create policy food_recipe_lines_select_v1 on public.food_recipe_lines for select to authenticated using (true);
drop policy if exists food_modifier_recipe_impacts_select_v1 on public.food_modifier_recipe_impacts;
create policy food_modifier_recipe_impacts_select_v1 on public.food_modifier_recipe_impacts for select to authenticated using (true);
drop policy if exists food_recipe_removal_mappings_select_v1 on public.food_recipe_removal_mappings;
create policy food_recipe_removal_mappings_select_v1 on public.food_recipe_removal_mappings for select to authenticated using (true);

revoke insert,update,delete on public.inventory_units,public.ingredient_unit_conversions,
  public.food_recipe_headers,public.food_recipe_versions,public.food_recipe_lines,
  public.food_modifier_recipe_impacts,public.food_recipe_removal_mappings from authenticated;

grant select on public.inventory_units,public.ingredient_unit_conversions,
  public.food_recipe_headers,public.food_recipe_versions,public.food_recipe_lines,
  public.food_modifier_recipe_impacts,public.food_recipe_removal_mappings to authenticated;
grant select on public.food_active_recipe_lines_v1,public.food_recipe_cost_preview_v1 to authenticated;
grant execute on function public.ingredient_unit_factor_v1(bigint,text,text) to authenticated;

comment on table public.inventory_units is 'Shared unit catalog for inventory and Recipe Basic. Custom packaging conversion remains ingredient-specific.';
comment on table public.ingredient_unit_conversions is 'Ingredient-specific unit conversion such as one box = 24 pieces.';
comment on table public.food_recipe_headers is 'Versioned Recipe Basic header. Supports base product and product-variant recipes.';
comment on table public.food_recipe_versions is 'Immutable recipe-version boundary used later for historical consumption and cost snapshots.';
comment on table public.food_modifier_recipe_impacts is 'Extra/modifier ingredient quantity deltas for the selected recipe version.';
comment on table public.food_recipe_removal_mappings is 'Maps removable component names to ingredient lines that should be excluded when removed.';

commit;
