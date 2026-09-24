(function(global){
'use strict';
const VERSION='10.5.4-beta.55';
const R=()=>global.__SharawlaAcceptanceRegistry;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const eq=(a,b,eps=.005)=>Math.abs(Number(a||0)-Number(b||0))<=eps;
const tx=(run,s)=>`${run}-B55R-${s}`;
const marker=run=>`SHARAWLA_ACCEPTANCE:${run}:B55R`;
const POINT4_IDENTITY_V1='sharawla.point4.identity.v1';
const point4Uuid=()=>{const v=String(global.crypto?.randomUUID?.()||'').trim().toLowerCase();if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v))throw new Error('Acceptance Point4 UUIDv4 unavailable');return v};
const point4Effect=(effect,lineUid)=>`v1:stock:${effect}:${lineUid}`;
const cfg=()=>{try{return JSON.parse(localStorage.getItem('sharawlaRuntimeConfigV1')||'{}')||{}}catch{return {}}};
const branch=()=>Number(global.currentBranchId?.()||0);
async function cleanup(run){const out=await global.rpc('sharawla_beta55_restaurant_acceptance_cleanup_v1',{p_run_id:run});if(out?.ok!==true||Number(out?.residue||0)!==0)throw new Error(`Restaurant cleanup failed: ${JSON.stringify(out)}`);return out}
async function offlineUnresolved(){try{const h=await global.topBurgerDesktop?.offlineV2?.health?.();return Number(h?.conflicts?.unresolved??h?.unresolved_conflicts??h?.unresolved??NaN)}catch{return NaN}}
async function stock(b,i){const r=await global.rest('ingredient_stock',`select=quantity,average_unit_cost&branch_id=eq.${Number(b)}&ingredient_id=eq.${Number(i)}&limit=1`);return r?.[0]||{quantity:0,average_unit_cost:0}}
async function countRows(t,q){const r=await global.rest(t,`select=id&${q}`);return Array.isArray(r)?r.length:0}

async function runtimeContract(){
 const c=cfg(),profile=String(c.pos_profile||'').toLowerCase();
 if(profile!=='restaurant')throw new Error(`Restaurant profile required, current=${profile||'none'}`);
 const enabled=new Set((c.enabled_features||[]).map(x=>String(x||'').toLowerCase()));
 const requiredFeatures=['food.ingredients','food.recipes','food.prep','food.production','food.waste','food.costing'];
 const missingFeatures=requiredFeatures.filter(x=>!enabled.has(x));
 if(missingFeatures.length)throw new Error(`Restaurant features missing: ${missingFeatures.join(', ')}`);
 if(!global.__SharawlaFoodRecipeRuntimeV1?.operational?.())throw new Error('Food Recipe runtime bridge is not operational');
 if(typeof global.rpc!=='function'||typeof global.rest!=='function')throw new Error('RPC/REST runtime unavailable');
 const requiredPages=['foodIngredients','foodRecipes','foodOperations','stockCount','transfers','suppliers','purchasing','tables'];
 const pages=new Set(global.runtimeAllPages?.()||[]),missingPages=requiredPages.filter(x=>!pages.has(x));
 if(missingPages.length)throw new Error(`Restaurant pages missing from engine: ${missingPages.join(', ')}`);
 try{global.dispatchEvent(new CustomEvent('sharawla-beta55-integrations-ready'))}catch{}
 await sleep(100);
 const missingNav=requiredPages.filter(x=>!document.querySelector(`#nav button[data-page="${x}"]`));
 if(missingNav.length)throw new Error(`Restaurant navigation missing: ${missingNav.join(', ')}`);
 return {status:'PASS',detail:'Restaurant profile + six food capabilities + eight closure pages + Food Recipe bridge are operational',evidence:{profile,features:requiredFeatures,pages:requiredPages}};
}

async function restaurantRoundtrip(ctx){
 const run=ctx.run_id,b1=branch();
 if(!b1)throw new Error('Active branch missing');
 const beforeUnresolved=await offlineUnresolved();
 let original=null,clean=null,evidence={};
 await cleanup(run);
 try{
   const f=await global.rpc('sharawla_beta55_restaurant_acceptance_fixture_v1',{p_run_id:run,p_branch_id:b1});
   if(f?.ok!==true)throw new Error(`Fixture failed: ${JSON.stringify(f)}`);
   const b2=Number(f.other_branch_id),product=Number(f.product_id),shift=Number(f.shift_id),employee=Number(f.employee_id);
   if(!b2||b2===b1||!product||!shift||!employee)throw new Error(`Fixture incomplete: ${JSON.stringify(f)}`);

   const saveIngredient=(suffix,name,base='g',purchase='kg',cost=.01)=>global.rpc('food_ingredient_save_action_v2',{
     p_ingredient_id:null,p_name:`${name} ${run}`,p_base_unit_code:base,p_purchase_unit_code:purchase,
     p_sku:`B55R-${run}-${suffix}`,p_barcode:null,p_cost_per_base_unit:cost,p_minimum_quantity:0,
     p_track_inventory:true,p_usable_yield_percent:100,p_shelf_life_minutes:null,p_active:true
   });
   const main=Number(await saveIngredient('MAIN','Acceptance Main'));
   const prepInput=Number(await saveIngredient('PREPIN','Acceptance Prep Input','g','g',.02));
   const prepOutput=Number(await saveIngredient('PREPOUT','Acceptance Prep Output','g','g',0));
   if(!main||!prepInput||!prepOutput)throw new Error('Ingredient creation failed');

   const conv=Number(await global.rpc('food_ingredient_conversion_save_action_v2',{p_ingredient_id:main,p_from_unit_code:'kg',p_to_unit_code:'g',p_factor:1000,p_active:true}));
   const convRows=await global.rest('ingredient_unit_conversions',`select=id,factor,active&ingredient_id=eq.${main}&from_unit_code=eq.kg&to_unit_code=eq.g&limit=1`);
   if(!conv||!eq(convRows?.[0]?.factor,1000)||convRows?.[0]?.active!==true)throw new Error(`Positive UOM conversion failed: ${JSON.stringify(convRows?.[0])}`);

   const adj1=Number(await global.rpc('food_ingredient_stock_adjust_action_v2',{p_branch_id:b1,p_ingredient_id:main,p_quantity_delta:5000,p_unit_cost:.01,p_reason:marker(run),p_client_tx_id:tx(run,'ADJ-MAIN')}));
   const adj1b=Number(await global.rpc('food_ingredient_stock_adjust_action_v2',{p_branch_id:b1,p_ingredient_id:main,p_quantity_delta:5000,p_unit_cost:.01,p_reason:marker(run),p_client_tx_id:tx(run,'ADJ-MAIN')}));
   await global.rpc('food_ingredient_stock_adjust_action_v2',{p_branch_id:b2,p_ingredient_id:main,p_quantity_delta:1000,p_unit_cost:.01,p_reason:marker(run),p_client_tx_id:tx(run,'ADJ-MAIN-B2')});
   await global.rpc('food_ingredient_stock_adjust_action_v2',{p_branch_id:b1,p_ingredient_id:prepInput,p_quantity_delta:1000,p_unit_cost:.02,p_reason:marker(run),p_client_tx_id:tx(run,'ADJ-PREP')});
   if(adj1!==adj1b||!eq((await stock(b1,main)).quantity,5000))throw new Error('Ingredient adjustment idempotency failed');

   const supplier=Number(await global.rpc('food_supplier_save_v1',{p_supplier_id:null,p_name:`Acceptance Supplier ${run}`,p_phone:null,p_email:null,p_tax_no:null,p_address:'TEST',p_notes:marker(run),p_active:true}));
   if(!supplier)throw new Error('Supplier creation failed');

   const poPayload={p_branch_id:b1,p_supplier_id:supplier,p_invoice_number:`B55R-${run}`,p_notes:marker(run),p_items:[{ingredient_id:main,quantity:2,unit_code:'kg',unit_cost:50}],p_client_tx_id:tx(run,'PO')};
   const po=Number(await global.rpc('food_purchase_order_create_v1',poPayload));
   const po2=Number(await global.rpc('food_purchase_order_create_v1',poPayload));
   if(!po||po!==po2)throw new Error('Restaurant PO idempotency failed');
   await global.rpc('food_purchase_order_approve_v1',{p_purchase_id:po});
   let lines=await global.rest('purchase_items',`select=*&purchase_id=eq.${po}&order=id`);
   if(lines?.length!==1||!eq(lines[0].conversion_factor_to_base,1000)||!eq(lines[0].base_quantity_ordered,2000))throw new Error(`PO UOM persistence mismatch: ${JSON.stringify(lines)}`);
   const receivePayload={p_purchase_id:po,p_items:[{purchase_item_id:Number(lines[0].id),quantity:2}],p_client_tx_id:tx(run,'RECEIVE')};
   const receipt=Number(await global.rpc('food_purchase_receive_v1',receivePayload));
   const receipt2=Number(await global.rpc('food_purchase_receive_v1',receivePayload));
   if(!receipt||receipt!==receipt2||!eq((await stock(b1,main)).quantity,7000))throw new Error('PO receive/UOM/idempotency failed');

   const sretPayload={p_branch_id:b1,p_supplier_id:supplier,p_notes:marker(run),p_items:[{ingredient_id:main,quantity:.5,unit_code:'kg'}],p_client_tx_id:tx(run,'SRET')};
   const sret=Number(await global.rpc('food_supplier_return_create_v1',sretPayload));
   const sret2=Number(await global.rpc('food_supplier_return_create_v1',sretPayload));
   if(!sret||sret!==sret2||!eq((await stock(b1,main)).quantity,6500))throw new Error('Supplier return roundtrip failed');

   const countPayload={p_branch_id:b1,p_notes:marker(run),p_items:[{ingredient_id:main,counted_quantity:6400}],p_client_tx_id:tx(run,'COUNT')};
   const sc=Number(await global.rpc('food_stock_count_post_v1',countPayload));
   const sc2=Number(await global.rpc('food_stock_count_post_v1',countPayload));
   if(!sc||sc!==sc2||!eq((await stock(b1,main)).quantity,6400))throw new Error('Raw-material stock count idempotency failed');

   const transferPayload={p_from_branch_id:b1,p_to_branch_id:b2,p_items:[{ingredient_id:main,quantity:600}],p_notes:marker(run),p_client_tx_id:tx(run,'TRANSFER')};
   const tr=Number(await global.rpc('food_stock_transfer_create_v1',transferPayload));
   const tr2=Number(await global.rpc('food_stock_transfer_create_v1',transferPayload));
   let trRows=await global.rest('stock_transfers',`select=id,status&id=eq.${tr}`);
   if(!tr||tr!==tr2||trRows?.[0]?.status!=='sent'||!eq((await stock(b1,main)).quantity,5800)||!eq((await stock(b2,main)).quantity,1000))throw new Error(`Transfer dispatch/in-transit failed: ${JSON.stringify(trRows?.[0])}`);
   await global.rpc('food_stock_transfer_receive_v1',{p_transfer_id:tr});
   await global.rpc('food_stock_transfer_receive_v1',{p_transfer_id:tr});
   trRows=await global.rest('stock_transfers',`select=id,status&id=eq.${tr}`);
   if(trRows?.[0]?.status!=='received'||!eq((await stock(b2,main)).quantity,1600))throw new Error('Transfer receive/idempotency failed');

   const wastePayload={p_branch_id:b1,p_ingredient_id:main,p_prep_item_id:null,p_shift_id:null,p_reason_code:'spoilage',p_quantity:100,p_unit_code:'g',p_notes:marker(run),p_client_tx_id:tx(run,'WASTE')};
   const waste=Number(await global.rpc('food_waste_post_action_v2',wastePayload));
   const waste2=Number(await global.rpc('food_waste_post_action_v2',wastePayload));
   if(!waste||waste!==waste2||!eq((await stock(b1,main)).quantity,5700))throw new Error('Waste posting/idempotency failed');

   const recipe=Number(await global.rpc('food_recipe_save_draft_action_v2',{p_product_id:product,p_variant_id:null,p_name:`Acceptance Recipe ${run}`,p_output_quantity:1,p_output_unit_code:'pc',p_lines:[{ingredient_id:main,quantity:200,unit_code:'g',sort_order:1,notes:marker(run)}],p_modifier_impacts:[],p_removal_mappings:[],p_notes:marker(run)}));
   if(!recipe)throw new Error('Sale recipe draft failed');
   await global.rpc('food_recipe_activate_version_action_v2',{p_recipe_version_id:recipe});
   const costs=await global.rest('food_menu_costing_v1',`select=branch_id,product_id,recipe_version_id,recipe_cost,food_cost_percent&branch_id=eq.${b1}&product_id=eq.${product}&limit=1`);
   if(!costs?.[0]||Number(costs[0].recipe_cost)<=0)throw new Error(`Food cost read model failed: ${JSON.stringify(costs)}`);

   const prep=Number(await global.rpc('food_prep_item_save_action_v2',{p_prep_item_id:null,p_name:`Acceptance Prep ${run}`,p_output_ingredient_id:prepOutput,p_base_unit_code:'g',p_default_batch_quantity:100,p_shelf_life_minutes:1440,p_notes:marker(run),p_active:true}));
   if(!prep)throw new Error('Prep item create failed');
   const prepRecipe=Number(await global.rpc('food_prep_recipe_save_draft_action_v2',{p_prep_item_id:prep,p_output_quantity:100,p_output_unit_code:'g',p_lines:[{ingredient_id:prepInput,quantity:100,unit_code:'g',sort_order:1,notes:marker(run)}],p_notes:marker(run)}));
   if(!prepRecipe)throw new Error('Prep recipe draft failed');
   await global.rpc('food_recipe_activate_version_action_v2',{p_recipe_version_id:prepRecipe});
   const batch=Number(await global.rpc('food_production_batch_start_action_v2',{p_branch_id:b1,p_prep_item_id:prep,p_planned_output_quantity:100,p_batch_number:`B55R-${run}`,p_notes:marker(run),p_client_tx_id:tx(run,'PROD-START')}));
   const batch2=Number(await global.rpc('food_production_batch_start_action_v2',{p_branch_id:b1,p_prep_item_id:prep,p_planned_output_quantity:100,p_batch_number:`B55R-${run}`,p_notes:marker(run),p_client_tx_id:tx(run,'PROD-START')}));
   if(!batch||batch!==batch2)throw new Error('Production start idempotency failed');
   const complete=Number(await global.rpc('food_production_batch_complete_action_v2',{p_production_batch_id:batch,p_actual_output_quantity:100,p_consumptions:[],p_client_tx_id:tx(run,'PROD-COMPLETE'),p_notes:marker(run)}));
   const complete2=Number(await global.rpc('food_production_batch_complete_action_v2',{p_production_batch_id:batch,p_actual_output_quantity:100,p_consumptions:[],p_client_tx_id:tx(run,'PROD-COMPLETE'),p_notes:marker(run)}));
   if(complete!==batch||complete2!==batch||!eq((await stock(b1,prepInput)).quantity,900)||!eq((await stock(b1,prepOutput)).quantity,100))throw new Error('Prep production stock/cost roundtrip failed');
   const variance=await global.rest('food_production_variance_v1',`select=*&production_batch_id=eq.${batch}&limit=1`);
   if(!variance?.[0]||!eq(variance[0].planned_output_quantity,100)||!eq(variance[0].actual_output_quantity,100))throw new Error(`Production variance read model failed: ${JSON.stringify(variance)}`);

   const floor=Number(await global.rpc('restaurant_floor_save_v1',{p_floor_id:null,p_branch_id:b1,p_name:marker(run),p_sort_order:1,p_active:true}));
   const table=Number(await global.rpc('restaurant_table_save_v1',{p_table_id:null,p_branch_id:b1,p_floor_id:floor,p_name:`Acceptance Table ${run}`,p_code:`${run}-B55R-T1`,p_capacity:4,p_active:true}));
   const sessionPayload={p_table_id:table,p_guest_count:2,p_notes:marker(run),p_client_tx_id:tx(run,'TABLE')};
   const tableSession=Number(await global.rpc('restaurant_table_session_open_v1',sessionPayload));
   const tableSession2=Number(await global.rpc('restaurant_table_session_open_v1',sessionPayload));
   if(!tableSession||tableSession!==tableSession2)throw new Error('Table session idempotency failed');

   // Point4 Identity V1 must match the real POS boundary: generate once, then reuse
   // the exact payload for the idempotent retry.
   const saleTx=tx(run,'SALE'),saleDocumentUid=point4Uuid(),saleSourceDocumentId=`uuid:${saleDocumentUid}`,saleLineUid=point4Uuid();
   const salePayload={
     p_order:{branch_id:b1,employee_id:employee,shift_id:shift,order_type:'dinein',payment_method:'cash',subtotal:100,discount:0,discount_value:0,tax_amount:0,service_amount:0,delivery_fee:0,total:100,status:'completed',source:'pos',client_tx_id:saleTx,document_uid:saleDocumentUid,source_document_id:saleSourceDocumentId,point4_identity_contract:POINT4_IDENTITY_V1,notes:marker(run)},
     p_items:[{product_id:product,product_name:`B55 Restaurant ${run}`,quantity:1,unit_price:100,cost:0,total:100,notes:null,modifiers:[],removed:[],line_uid:saleLineUid,effect_line_key:point4Effect('sale',saleLineUid)}],
     p_payments:[{method:'cash',amount:100}]
   };
   const sale=await global.rpc('create_pos_order_atomic',salePayload);
   const sale2=await global.rpc('create_pos_order_atomic',salePayload);
   const orderId=Number(sale?.order?.id),orderId2=Number(sale2?.order?.id),orderItem=Number(sale?.items?.[0]?.id||sale2?.items?.[0]?.id);
   if(!orderId||orderId!==orderId2||!orderItem||!eq((await stock(b1,main)).quantity,5500))throw new Error(`Recipe sale/idempotency failed: ${JSON.stringify({orderId,orderId2,orderItem})}`);
   await global.rpc('restaurant_table_session_attach_order_v1',{p_session_id:tableSession,p_order_id:orderId});
   const theo=await global.rest('food_theoretical_consumption_v1',`select=theoretical_base_quantity,theoretical_cost&branch_id=eq.${b1}&ingredient_id=eq.${main}&order=business_date.desc&limit=1`);
   if(!theo?.[0]||Number(theo[0].theoretical_base_quantity)<199.999)throw new Error(`Theoretical consumption missing: ${JSON.stringify(theo)}`);

   const returnTx=tx(run,'RETURN'),returnDocumentUid=point4Uuid(),returnSourceDocumentId=`uuid:${returnDocumentUid}`,returnLineUid=point4Uuid();
   const retPayload={p_order_id:orderId,p_reason:'acceptance',p_notes:marker(run),p_items:[{order_item_id:orderItem,quantity:1,line_uid:returnLineUid,effect_line_key:point4Effect('sale_return',returnLineUid),source_document_id:returnSourceDocumentId,original_source_document_id:saleSourceDocumentId}],p_payments:[{method:'cash',amount:100}],p_client_tx_id:returnTx};
   const ret=Number(await global.rpc('create_order_return_idempotent',retPayload));
   const ret2=Number(await global.rpc('create_order_return_idempotent',retPayload));
   if(!ret||ret!==ret2||!eq((await stock(b1,main)).quantity,5700))throw new Error('Recipe return restore/idempotency failed');
   const net=await global.rest('food_theoretical_consumption_net_v1',`select=theoretical_base_quantity,theoretical_cost&branch_id=eq.${b1}&ingredient_id=eq.${main}&order=business_date.desc&limit=1`);
   if(net?.[0]&&!eq(net[0].theoretical_base_quantity,0))throw new Error(`Net theoretical consumption did not reverse: ${JSON.stringify(net)}`);
   const consumptionSnapshots=await countRows('food_order_item_consumption_snapshots',`order_item_id=eq.${orderItem}`);
   const returnSnapshots=await countRows('food_return_consumption_snapshots',`return_id=eq.${ret}`);
   if(consumptionSnapshots<1||returnSnapshots<1)throw new Error('Recipe sale/return snapshots missing');

   await global.rpc('restaurant_table_session_close_v1',{p_session_id:tableSession,p_notes:marker(run)});
   const tableRows=await global.rest('restaurant_tables',`select=status&id=eq.${table}&limit=1`);
   const sessionRows=await global.rest('restaurant_table_sessions',`select=status&id=eq.${tableSession}&limit=1`);
   if(tableRows?.[0]?.status!=='available'||sessionRows?.[0]?.status!=='closed')throw new Error('Table close/state reset failed');

   evidence={branch:b1,other_branch:b2,product,ingredients:[main,prepInput,prepOutput],supplier,po,receipt,supplier_return:sret,stock_count:sc,transfer:tr,waste,recipe_version:recipe,food_cost:Number(costs[0].recipe_cost),prep_item:prep,prep_recipe_version:prepRecipe,production_batch:batch,production_variance:variance[0],floor,table,table_session:tableSession,order:orderId,return_id:ret,uom_kg_to_g:Number(convRows[0].factor),main_stock_final:Number((await stock(b1,main)).quantity),other_branch_stock_final:Number((await stock(b2,main)).quantity),recipe_consumption_snapshots:consumptionSnapshots,recipe_return_snapshots:returnSnapshots};
 }catch(e){original=e}
 try{clean=await cleanup(run)}catch(e){if(!original)original=e}
 const afterUnresolved=await offlineUnresolved();
 if(Number.isFinite(beforeUnresolved)&&Number.isFinite(afterUnresolved)&&beforeUnresolved!==afterUnresolved&&!original)original=new Error(`Offline unresolved changed ${beforeUnresolved}->${afterUnresolved}`);
 if(original)throw original;
 return {status:'PASS',detail:'UOM + purchase/receive/return + count + transfer + waste + recipe/food-cost + prep/production variance + sale/return theoretical consumption + tables all PASS; cleanup=zero',evidence:{...evidence,cleanup_zero:Number(clean?.residue||0)===0,offline_unresolved_before:beforeUnresolved,offline_unresolved_after:afterUnresolved}};
}

function register(){const reg=R();if(!reg||global.__SharawlaBeta55RestaurantAcceptanceRegistered)return false;global.__SharawlaBeta55RestaurantAcceptanceRegistered=true;reg.registerMany([
 {id:'beta55.restaurant-runtime-contract',name:'Restaurant closure runtime / features / navigation contract',pack:'beta55-restaurant',profile:'restaurant',level:'quick',mode:'readonly',critical:true,features:['food.ingredients','food.recipes','food.prep','food.production','food.waste','food.costing'],run:runtimeContract},
 {id:'beta55.restaurant-full-roundtrip',name:'Restaurant raw materials → Recipe/Food Cost → Production → Sale/Return → Tables → cleanup',pack:'beta55-restaurant',profile:'restaurant',level:'full',mode:'write',critical:true,features:['food.ingredients','food.recipes','food.prep','food.production','food.waste','food.costing'],dependsOn:['beta55.restaurant-runtime-contract'],run:restaurantRoundtrip}
 ]);return true}
if(!register())global.addEventListener('sharawla-acceptance-registry-ready',register,{once:true});
global.__SharawlaBeta55RestaurantAcceptanceV55=Object.freeze({version:VERSION,register,cleanup});
})(window);
