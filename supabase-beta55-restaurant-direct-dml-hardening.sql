-- Sharawla POS 10.5.4-beta.55 — Restaurant Closure direct-DML hardening
-- Apply after supabase-beta55-restaurant-permissions-runtime.sql and
-- supabase-beta55-restaurant-operations.sql on the isolated SH-0007 backend only.
--
-- Sensitive Restaurant raw-material writes must pass through the protected RPC
-- surface. Direct PostgREST DML by authenticated users is deliberately revoked.

begin;

-- Keep reads available; all writes are routed through SECURITY DEFINER RPCs.
grant select on public.ingredients,public.ingredient_stock,public.suppliers,
 public.purchases,public.purchase_items,public.stock_transfers,public.stock_transfer_items
 to authenticated;

revoke insert,update,delete,truncate on
 public.ingredients,public.ingredient_stock,public.suppliers,
 public.purchases,public.purchase_items,public.stock_transfers,public.stock_transfer_items
 from authenticated;

-- Ingredient master can be read only by users who can reach a Restaurant food page.
drop policy if exists beta55_food_ingredients_select on public.ingredients;
create policy beta55_food_ingredients_select on public.ingredients for select to authenticated
using(
 public.is_admin()
 or public.has_permission('foodIngredients')
 or public.has_permission('foodRecipes')
 or public.has_permission('foodOperations')
 or public.has_permission('stockCount')
 or public.has_permission('transfers')
 or public.has_permission('purchasing')
);

-- Ingredient stock is additionally branch-scoped.
drop policy if exists beta55_food_ingredient_stock_select on public.ingredient_stock;
create policy beta55_food_ingredient_stock_select on public.ingredient_stock for select to authenticated
using(
 public.has_branch_access(branch_id)
 and (
   public.is_admin()
   or public.has_permission('foodIngredients')
   or public.has_permission('foodRecipes')
   or public.has_permission('foodOperations')
   or public.has_permission('stockCount')
   or public.has_permission('transfers')
   or public.has_permission('purchasing')
 )
);

-- The legacy admin_all policies may remain for backwards compatibility, but
-- table privileges above still prevent authenticated direct writes. Security
-- definer RPCs owned by the database owner remain able to perform their work.

commit;
