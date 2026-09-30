'use strict';
const fs=require('fs'),assert=require('assert');
const manifest=JSON.parse(fs.readFileSync('docs/SHARAWLA-RC1-RUNTIME-ALIGNMENT-BETA-DEPLOYMENT-MANIFEST.json','utf8'));
assert.strictEqual(manifest.authorized,false,'deployment manifest must remain non-authorizing source metadata');
assert.deepStrictEqual(manifest.production_forbidden,['SH-0005','SH-0006']);
const files=manifest.offline_alignment;
assert(files.length>=2,'offline alignment manifest is empty');
assert.strictEqual(files.at(-1),'supabase-rc1-offline-v2-runtime-alignment-final-dispatcher.sql','runtime-alignment dispatcher must be final SQL definition');
for(const forbidden of manifest.forbidden_as_final_dispatcher)assert(!files.includes(forbidden),'historical/colliding dispatcher must not be in deployment sequence: '+forbidden);
for(const file of [...files,...manifest.hr_alignment])assert(fs.existsSync(file),'deployment manifest file missing: '+file);

const combined=files.map(f=>fs.readFileSync(f,'utf8')).join('\n');
const expectedMissingLive=[
 'offline_delivery_driver_save_v1','offline_delivery_driver_settle_v1','offline_delivery_zone_save_v1',
 'offline_food_ingredient_conversion_save_action_v2','offline_food_ingredient_conversion_save_v1',
 'offline_food_ingredient_save_action_v2','offline_food_ingredient_save_v1','offline_food_ingredient_stock_adjust_action_v2',
 'offline_food_prep_item_save_action_v2','offline_food_prep_item_save_v1','offline_food_prep_recipe_save_draft_action_v2','offline_food_prep_recipe_save_draft_v1',
 'offline_food_production_batch_complete_action_v2','offline_food_production_batch_start_action_v2',
 'offline_food_purchase_order_approve_v1','offline_food_purchase_order_cancel_v1','offline_food_purchase_order_create_v1','offline_food_purchase_receive_v1',
 'offline_food_recipe_activate_version_action_v2','offline_food_recipe_activate_version_v1',
 'offline_food_recipe_save_draft_action_v2','offline_food_recipe_save_draft_v1',
 'offline_food_stock_count_post_v1','offline_food_stock_transfer_cancel_v1','offline_food_stock_transfer_create_v1','offline_food_stock_transfer_receive_v1',
 'offline_food_supplier_return_create_v1','offline_food_supplier_save_v1','offline_food_waste_post_action_v2',
 'offline_inventory_supply_request_decide_v1','offline_inventory_supply_request_dispatch_v1','offline_inventory_supply_request_prepare_v1',
 'offline_inventory_supply_request_receive_v1','offline_inventory_supply_request_submit_v1',
 'offline_restaurant_floor_save_v1','offline_restaurant_table_save_v1','offline_restaurant_table_session_attach_v1','offline_restaurant_table_session_close_v1',
 'offline_retail_purchase_order_approve_v1','offline_retail_supplier_create_v1',
 'offline_retail_suspend_sale_v1','offline_retail_resume_sale_v1'
];
for(const name of expectedMissingLive)assert(combined.includes(name),'deployment source coverage missing live gap '+name);
assert(combined.includes('sharawla_offline_v2_apply_event_retail_suspend_event_v1')||combined.includes('sharawla_offline_v2_apply_retail_suspend_event_v1'),'retail suspend event owner missing');
assert(combined.includes('sharawla_offline_v2_apply_retail_resume_event_v1'),'retail resume event owner missing');
assert(fs.readFileSync(files.at(-1),'utf8').includes('grant execute on function public.sharawla_offline_v2_apply_event(jsonb) to authenticated'),'final public dispatcher grant missing');

console.log('RC1 Beta deployment manifest gate PASS — offline files='+files.length+'; HR files='+manifest.hr_alignment.length+'; missing-live wrappers covered='+expectedMissingLive.length+'; final-dispatcher=LAST');
