-- Sharawla POS — Beta Multi-Tenant V1 security-invoker view hardening
-- PHASE A ONLY. No PK/FK/unique cutover.
-- These internal costing/inventory/retail views must honor caller RLS.

begin;

do $guard$
begin
  if current_setting('sharawla.multitenant_apply', true) is distinct from 'beta-only-approved' then
    raise exception 'MULTITENANT_V1_SOURCE_ONLY: explicit Beta apply guard is not set';
  end if;
end
$guard$;

alter view public.product_variant_matrix_v1 set (security_invoker = true);
revoke select on public.product_variant_matrix_v1 from anon;
alter view public.retail_reorder_suggestions_v1 set (security_invoker = true);
revoke select on public.retail_reorder_suggestions_v1 from anon;
alter view public.retail_supplier_invoice_match_v1 set (security_invoker = true);
revoke select on public.retail_supplier_invoice_match_v1 from anon;
alter view public.food_active_recipe_lines_v1 set (security_invoker = true);
revoke select on public.food_active_recipe_lines_v1 from anon;
alter view public.food_recipe_cost_preview_v1 set (security_invoker = true);
revoke select on public.food_recipe_cost_preview_v1 from anon;
alter view public.food_theoretical_consumption_v1 set (security_invoker = true);
revoke select on public.food_theoretical_consumption_v1 from anon;
alter view public.food_waste_summary_v1 set (security_invoker = true);
revoke select on public.food_waste_summary_v1 from anon;
alter view public.retail_supplier_invoice_match_v2 set (security_invoker = true);
revoke select on public.retail_supplier_invoice_match_v2 from anon;
alter view public.food_recipe_branch_cost_v1 set (security_invoker = true);
revoke select on public.food_recipe_branch_cost_v1 from anon;
alter view public.food_production_variance_v1 set (security_invoker = true);
revoke select on public.food_production_variance_v1 from anon;
alter view public.food_theoretical_consumption_net_v1 set (security_invoker = true);
revoke select on public.food_theoretical_consumption_net_v1 from anon;
alter view public.food_menu_costing_v1 set (security_invoker = true);
revoke select on public.food_menu_costing_v1 from anon;
alter view public.inventory_supply_catalog_live_v1 set (security_invoker = true);
revoke select on public.inventory_supply_catalog_live_v1 from anon;

do $proof$
declare
  bad text;
begin
  select string_agg(c.relname,', ' order by c.relname)
  into bad
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relkind='v'
    and c.relname = any(array['product_variant_matrix_v1','retail_reorder_suggestions_v1','retail_supplier_invoice_match_v1','food_active_recipe_lines_v1','food_recipe_cost_preview_v1','food_theoretical_consumption_v1','food_waste_summary_v1','retail_supplier_invoice_match_v2','food_recipe_branch_cost_v1','food_production_variance_v1','food_theoretical_consumption_net_v1','food_menu_costing_v1','inventory_supply_catalog_live_v1'])
    and not ('security_invoker=true'=any(coalesce(c.reloptions,array[]::text[])));

  if bad is not null then
    raise exception 'MULTITENANT_V1 security_invoker not enabled: %',bad;
  end if;

  select string_agg(c.relname,', ' order by c.relname)
  into bad
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relkind='v'
    and c.relname = any(array['product_variant_matrix_v1','retail_reorder_suggestions_v1','retail_supplier_invoice_match_v1','food_active_recipe_lines_v1','food_recipe_cost_preview_v1','food_theoretical_consumption_v1','food_waste_summary_v1','retail_supplier_invoice_match_v2','food_recipe_branch_cost_v1','food_production_variance_v1','food_theoretical_consumption_net_v1','food_menu_costing_v1','inventory_supply_catalog_live_v1'])
    and has_table_privilege('anon',c.oid,'SELECT');

  if bad is not null then
    raise exception 'MULTITENANT_V1 internal view still anon-readable: %',bad;
  end if;
end
$proof$;

commit;
