-- Sharawla POS 10.5.16 — Food reporting views security invoker hardening
begin;
alter view public.food_active_recipe_lines_v1 set (security_invoker = true);
alter view public.food_recipe_cost_preview_v1 set (security_invoker = true);
alter view public.food_recipe_branch_cost_v1 set (security_invoker = true);
alter view public.food_production_variance_v1 set (security_invoker = true);
alter view public.food_theoretical_consumption_v1 set (security_invoker = true);
alter view public.food_waste_summary_v1 set (security_invoker = true);
alter view public.food_theoretical_consumption_net_v1 set (security_invoker = true);
alter view public.food_menu_costing_v1 set (security_invoker = true);
commit;
