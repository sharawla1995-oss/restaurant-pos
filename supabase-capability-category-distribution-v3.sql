-- Sharawla Capability Category Distribution V3
-- Safe defaults for categories with no current Production business.
-- Explicitly does NOT target restaurants or generic retail categories.
begin;

with map(category_code,feature_code) as (
 values
  ('cafes','food.ingredients'),('cafes','food.recipes'),('cafes','food.prep'),('cafes','food.production'),('cafes','food.waste'),('cafes','food.costing'),
  ('bakery_sweets','food.ingredients'),('bakery_sweets','food.recipes'),('bakery_sweets','food.prep'),('bakery_sweets','food.production'),('bakery_sweets','food.waste'),('bakery_sweets','food.costing'),('bakery_sweets','commerce.custom_orders'),('bakery_sweets','inventory.purchase_orders'),('bakery_sweets','inventory.supplier_returns'),('bakery_sweets','inventory.replenishment'),
  ('juices_beverages','food.ingredients'),('juices_beverages','food.recipes'),('juices_beverages','food.production'),('juices_beverages','food.waste'),('juices_beverages','food.costing'),
  ('supermarkets','inventory.purchase_orders'),('supermarkets','inventory.supplier_returns'),('supermarkets','inventory.replenishment'),
  ('hypermarkets','commerce.variants'),('hypermarkets','inventory.purchase_orders'),('hypermarkets','inventory.supplier_returns'),('hypermarkets','inventory.replenishment'),
  ('grocery','inventory.purchase_orders'),('grocery','inventory.replenishment'),('grocery','finance.credit'),('grocery','finance.receivables'),('grocery','finance.collections'),('grocery','finance.aging'),
  ('clothes','commerce.variants'),
  ('shoes','commerce.variants'),
  ('cosmetics_perfumes','commerce.variants'),
  ('mobiles_accessories','commerce.variants'),
  ('home_supplies','commerce.variants'),
  ('wholesale','commerce.b2b_orders'),('wholesale','commerce.quotations'),('wholesale','commerce.price_tiers'),('wholesale','finance.credit'),('wholesale','finance.receivables'),('wholesale','finance.collections'),('wholesale','finance.aging'),('wholesale','inventory.purchase_orders'),('wholesale','inventory.supplier_returns'),('wholesale','inventory.replenishment'),
  ('bookstores_stationery','commerce.b2b_orders'),('bookstores_stationery','commerce.quotations'),
  ('auto_parts','commerce.b2b_orders'),('auto_parts','commerce.quotations'),('auto_parts','commerce.price_tiers')
), rows_to_add as (
 select c.id category_id,f.id feature_id
 from map m join public.activity_categories c on c.code=m.category_code
 join public.features f on f.code=m.feature_code and f.active=true and f.implemented=true
 where m.category_code not in ('restaurants','retail','companies','other')
)
insert into public.activity_category_features(activity_category_id,feature_id,enabled,required,settings)
select category_id,feature_id,true,false,'{}'::jsonb from rows_to_add
on conflict(activity_category_id,feature_id) do update set enabled=true,required=false,updated_at=now();

-- Safety assertion: this migration must never write restaurant or generic retail category rows.
do $$declare bad integer;begin
 select count(*) into bad from public.activity_category_features acf join public.activity_categories c on c.id=acf.activity_category_id join public.features f on f.id=acf.feature_id
 where c.code in('restaurants','retail') and f.code in ('food.ingredients','food.recipes','food.prep','food.production','food.waste','food.costing','commerce.variants','commerce.b2b_orders','commerce.quotations','commerce.price_tiers','finance.credit','finance.receivables','finance.collections','finance.aging');
 if bad<>0 then raise exception 'Safety violation: restaurant/retail category distribution changed: %',bad;end if;
end$$;
commit;
