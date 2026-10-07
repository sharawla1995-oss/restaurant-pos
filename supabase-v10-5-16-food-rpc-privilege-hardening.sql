-- V10.5.16 Production — Food RPC privilege hardening
-- Action wrappers are staff-only. Trigger functions are not client-callable.
begin;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'food_ingredient_conversion_save_action_v2',
        'food_ingredient_save_action_v2',
        'food_ingredient_stock_adjust_action_v2',
        'food_prep_item_save_action_v2',
        'food_prep_recipe_save_draft_action_v2',
        'food_production_batch_complete_action_v2',
        'food_production_batch_start_action_v2',
        'food_recipe_activate_version_action_v2',
        'food_recipe_save_draft_action_v2',
        'food_waste_post_action_v2'
      )
  loop
    execute format('revoke all on function %s from public, anon',r.sig);
    execute format('grant execute on function %s to authenticated',r.sig);
  end loop;

  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'enforce_food_prep_output_unit_v1',
        'enforce_food_production_recipe_scope_v1',
        'enforce_food_recipe_variant_scope_v1',
        'enforce_food_waste_prep_scope_v1'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated',r.sig);
  end loop;
end
$$;

commit;
