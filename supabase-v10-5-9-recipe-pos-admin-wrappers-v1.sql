-- Sharawla POS 10.5.9 — Recipe POS Admin Wrappers V1
-- Additive only. Reuses the existing authoritative recipe_admin_* owners.
-- No new financial/stock writer. No service_role exposure to the client.

create or replace function public.recipe_pos_save_ingredient_v1(
  p_ingredient_id bigint,
  p_name text,
  p_unit text,
  p_cost_per_unit numeric,
  p_minimum_quantity numeric,
  p_active boolean,
  p_client_tx_id text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  return public.recipe_admin_save_ingredient_v1(
    p_ingredient_id,p_name,p_unit,p_cost_per_unit,p_minimum_quantity,p_active,
    auth.uid(),p_client_tx_id
  );
end;
$function$;

create or replace function public.recipe_pos_replace_recipe_v1(
  p_product_id bigint,
  p_items jsonb,
  p_client_tx_id text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  return public.recipe_admin_replace_recipe_v1(
    p_product_id,p_items,auth.uid(),p_client_tx_id
  );
end;
$function$;

revoke all on function public.recipe_pos_save_ingredient_v1(bigint,text,text,numeric,numeric,boolean,text) from public, anon;
revoke all on function public.recipe_pos_replace_recipe_v1(bigint,jsonb,text) from public, anon;
grant execute on function public.recipe_pos_save_ingredient_v1(bigint,text,text,numeric,numeric,boolean,text) to authenticated;
grant execute on function public.recipe_pos_replace_recipe_v1(bigint,jsonb,text) to authenticated;
