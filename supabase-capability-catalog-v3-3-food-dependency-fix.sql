-- Capability Catalog V3.3 — Food dependency correction
-- Correct hierarchy: Inventory Stock -> Ingredients -> Recipes -> Prep/Production/Costing.

begin;

-- Remove the inverted legacy edge: Ingredients must not depend on Recipes.
delete from public.feature_dependencies fd
using public.features f, public.features d
where fd.feature_id=f.id and fd.depends_on_feature_id=d.id
  and f.code='food.ingredients' and d.code='food.recipes';

-- Ingredients requires stock infrastructure.
insert into public.feature_dependencies(feature_id,depends_on_feature_id)
select f.id,d.id from public.features f cross join public.features d
where f.code='food.ingredients' and d.code='inventory.stock'
on conflict do nothing;

-- Recipes requires Ingredients.
insert into public.feature_dependencies(feature_id,depends_on_feature_id)
select f.id,d.id from public.features f cross join public.features d
where f.code='food.recipes' and d.code='food.ingredients'
on conflict do nothing;

-- Fail closed: inverted edge must be gone and correct edges must exist.
do $$
begin
  if exists(
    select 1 from public.feature_dependencies fd
    join public.features f on f.id=fd.feature_id
    join public.features d on d.id=fd.depends_on_feature_id
    where f.code='food.ingredients' and d.code='food.recipes'
  ) then raise exception 'Inverted food dependency still exists'; end if;

  if not exists(
    select 1 from public.feature_dependencies fd
    join public.features f on f.id=fd.feature_id
    join public.features d on d.id=fd.depends_on_feature_id
    where f.code='food.recipes' and d.code='food.ingredients'
  ) then raise exception 'food.recipes -> food.ingredients dependency missing'; end if;
end $$;

commit;
