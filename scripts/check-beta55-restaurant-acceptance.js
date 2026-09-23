const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n?/g,'\n');
const currentVersion=String(JSON.parse(read('package.json')).version||'').trim();
const need=(src,token,label)=>{if(!src.includes(token))throw new Error(`Beta55 Restaurant Acceptance gate failed: ${label||token}`)};
const forbid=(src,token,label)=>{if(src.includes(token))throw new Error(`Beta55 Restaurant Acceptance gate failed: forbidden ${label||token}`)};

const pack=read('owner-acceptance-beta55-restaurant-v55.js');
for(const token of [
 "profile:'restaurant'","beta55.restaurant-runtime-contract","beta55.restaurant-full-roundtrip",
 'sharawla_beta55_restaurant_acceptance_fixture_v1','sharawla_beta55_restaurant_acceptance_cleanup_v1',
 "food_ingredient_conversion_save_action_v2","p_factor:1000","food_purchase_order_create_v1","food_purchase_receive_v1",
 'food_supplier_return_create_v1','food_stock_count_post_v1','food_stock_transfer_create_v1','food_stock_transfer_receive_v1',
 'food_waste_post_action_v2','food_recipe_save_draft_action_v2','food_recipe_activate_version_action_v2',
 'food_prep_item_save_action_v2','food_production_batch_start_action_v2','food_production_batch_complete_action_v2',
 "global.rpc('create_pos_order_atomic'","global.rpc('create_order_return_idempotent'",
 'food_theoretical_consumption_v1','food_theoretical_consumption_net_v1','food_production_variance_v1',
 'restaurant_floor_save_v1','restaurant_table_save_v1','restaurant_table_session_open_v1','restaurant_table_session_attach_order_v1','restaurant_table_session_close_v1',
 'offline_unresolved_before','offline_unresolved_after','cleanup_zero'
])need(pack,token,`pack ${token}`);
for(const feature of ['food.ingredients','food.recipes','food.prep','food.production','food.waste','food.costing'])need(pack,feature,`required feature ${feature}`);

const lazy=read('owner-acceptance-lazy-loader-v47.js');
need(lazy,`owner-acceptance-beta55-restaurant-v55.js?v=${currentVersion}`,'Restaurant acceptance lazy load');

const syntax=read('scripts/check-runtime-syntax.js');
need(syntax,"'owner-acceptance-beta55-restaurant-v55.js'",'Restaurant acceptance syntax gate');

const sql=read('supabase-beta55-restaurant-acceptance.sql');
for(const token of [
 'sharawla_beta55_restaurant_acceptance_fixture_v1','sharawla_beta55_restaurant_acceptance_cleanup_v1',
 "^ACC-[0-9]{8}-[0-9]{6}-[A-Z0-9]{5}$",'ACCEPTANCE_ADMIN_REQUIRED',
 "name='B55 Restaurant '","sku like 'B55R-'",'client_tx_id like v_run||\'-B55R-%\'',
 'delete from public.food_order_item_consumption_snapshots','delete from public.food_return_consumption_snapshots',
 'delete from public.food_production_batches','delete from public.food_waste_events','delete from public.stock_movements',
 "grant execute on function public.sharawla_beta55_restaurant_acceptance_fixture_v1(text,bigint) to authenticated"
])need(sql,token,`acceptance SQL ${token}`);

const hardening=read('supabase-beta55-restaurant-acceptance-anon-hardening.sql');
need(hardening,'revoke execute on function public.sharawla_beta55_restaurant_acceptance_fixture_v1(text,bigint) from anon','fixture anon revoke');
need(hardening,'revoke execute on function public.sharawla_beta55_restaurant_acceptance_cleanup_v1(text) from anon','cleanup anon revoke');
need(hardening,'grant execute on function public.sharawla_beta55_restaurant_acceptance_fixture_v1(text,bigint) to authenticated','fixture authenticated grant');
need(hardening,'grant execute on function public.sharawla_beta55_restaurant_acceptance_cleanup_v1(text) to authenticated','cleanup authenticated grant');

for(const src of [pack,sql,hardening]){
 forbid(src,'SH-0005','production device isolation');
 forbid(src,'SH-0006','production device isolation');
}
console.log('Beta55 Restaurant formal acceptance static gate OK');
