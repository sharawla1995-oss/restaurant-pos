const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const need=(src,token,label)=>{if(!src.includes(token))throw new Error(`Beta55 Restaurant Closure gate failed: ${label||token}`)};
const forbid=(src,token,label)=>{if(src.includes(token))throw new Error(`Beta55 Restaurant Closure gate failed: forbidden ${label||token}`)};

const engine=read('restaurant-engine.js');
for(const p of ['foodIngredients','foodRecipes','foodOperations','stockCount','transfers','suppliers','purchasing','tables'])need(engine,p,`restaurant page ${p}`);
need(engine,"['🍽️ تشغيل المطعم'",'restaurant permission group');

const loader=read('beta36-integration-loader.js');
need(loader,'food-recipe-runtime-bridge.js','Food Recipe runtime load');
need(loader,'beta55-restaurant-closure-ui.js','Restaurant Closure UI load');

const ui=read('beta55-restaurant-closure-ui.js');
for(const rpc of [
 'food_ingredient_save_action_v2','food_ingredient_stock_adjust_action_v2','food_ingredient_conversion_save_action_v2',
 'food_recipe_save_draft_action_v2','food_recipe_activate_version_action_v2','food_prep_item_save_action_v2',
 'food_prep_recipe_save_draft_action_v2','food_production_batch_start_action_v2','food_production_batch_complete_action_v2','food_waste_post_action_v2',
 'food_supplier_save_v1','food_purchase_order_create_v1','food_purchase_order_approve_v1','food_purchase_receive_v1','food_supplier_return_create_v1',
 'food_stock_count_post_v1','food_stock_transfer_create_v1','food_stock_transfer_receive_v1','food_stock_transfer_cancel_v1',
 'restaurant_floor_save_v1','restaurant_table_save_v1','restaurant_table_session_open_v1','restaurant_table_session_attach_order_v1','restaurant_table_session_close_v1'
])need(ui,rpc,`UI RPC ${rpc}`);

const perm=read('supabase-beta55-restaurant-permissions-runtime.sql');
for(const action of [
 'food.ingredients.manage','food.ingredients.conversion.manage','food.ingredients.stock.adjust','food.recipes.manage','food.recipes.activate',
 'food.prep.manage','food.production.start','food.production.complete','food.waste.post','food.suppliers.manage','food.purchasing.create',
 'food.purchasing.approve','food.purchasing.receive','food.purchasing.return','food.stock_count.post','food.transfer.create','food.transfer.receive',
 'food.transfer.cancel','restaurant.tables.manage','restaurant.tables.use'
])need(perm,action,`Action Permission V2 ${action}`);
for(const legacy of ['food_ingredient_save_v1','food_ingredient_stock_adjust_v1','food_recipe_save_draft_v1','food_recipe_activate_version_v1','food_prep_item_save_v1','food_production_batch_start_v1','food_production_batch_complete_v1','food_waste_post_v1'])need(perm,`revoke all on function public.${legacy}`,`legacy direct revoke ${legacy}`);

const ops=read('supabase-beta55-restaurant-operations.sql');
for(const token of [
 'food_purchase_receipts','food_purchase_receipt_items','food_supplier_returns','food_supplier_return_items','food_stock_counts','food_stock_count_items',
 'food_apply_ingredient_delta_internal_v1','food_purchase_order_create_v1','food_purchase_receive_v1','food_supplier_return_create_v1','food_stock_count_post_v1',
 'food_stock_transfer_create_v1','food_stock_transfer_receive_v1','food_stock_transfer_cancel_v1','restaurant_floors','restaurant_tables','restaurant_table_sessions','restaurant_table_session_orders'
])need(ops,token,`operations contract ${token}`);
need(ops,"status='sent'",'transfer in-transit state');
need(ops,"status='received'",'transfer receive state');
need(ops,"if v_new<0 then raise exception 'مخزون الخامة غير كافٍ'",'negative ingredient stock guard');
need(ops,'pg_advisory_xact_lock','idempotency/concurrency lock');
forbid(ops,'SH-0005','production device isolation');
forbid(ops,'SH-0006','production device isolation');
forbid(perm,'SH-0005','production device isolation');
forbid(perm,'SH-0006','production device isolation');

console.log('Beta55 Restaurant Closure source gate OK');
