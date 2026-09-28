const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(path.join(__dirname,'..','beta45-offline-v2-transport-runtime.js'),'utf8');
const store=new Map(),events=new Map();let seq=0;const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
function tx(){return '60000000-0000-4000-8000-'+String(++seq).padStart(12,'0')}
function runtime(online=false,active=true){
 const takeover={registerOperation:()=>true,takeoverState:async()=>active?({active:true,migration_verified:true,transport_ready:true}):({active:false,migration_verified:false,transport_ready:false})};
 const offlineV2={takeoverState:takeover.takeoverState,event:async id=>clone(events.get(id)||null),commitOperation:async c=>{if(!events.has(c.client_tx_id))events.set(c.client_tx_id,{...clone(c),envelope:{payload:clone(c.payload)},status:'pending',server_ack:null});return{ok:true}},outbox:async()=>[...events.values()].map(clone),syncNow:async()=>({ok:true})};
 const canonical=[];const c={console,JSON,Date,Map,Set,Promise,URLSearchParams,CustomEvent:function(t,o){this.type=t;this.detail=o?.detail},navigator:{onLine:online},document:{readyState:'complete'},addEventListener:()=>{},dispatchEvent:()=>true,setInterval:()=>1,setTimeout:()=>1,clearInterval:()=>{},crypto:{randomUUID:tx},uuid:tx,SharawlaOfflineV2Takeover:takeover,SharawlaRuntimeConfig:{current:()=>({pos_profile:'restaurant'})},topBurgerDesktop:{offlineV2},state:{activeBranchId:1,employee:{id:7}},currentBranchId:()=>1,loadLicenseState:async()=>({device_id:'SH-0007',business_id:'biz-a',device_fingerprint:'fp-a'}),odbGet:async k=>clone(store.get(k)||null),odbSet:async(k,v)=>{store.set(k,clone(v));return v},rpc:async(n,p)=>{canonical.push({n,p:clone(p)});return 901},localStorage:{getItem:()=>JSON.stringify({url:'x',key:'k'})},session:{access_token:'t'}};c.window=c;c.globalThis=c;vm.createContext(c);vm.runInContext(source,c);c.__canonical=canonical;return c;
}
(async()=>{
 let r=runtime(false,true),itx=tx(),ctx=tx();
 const ingredientPayload={p_ingredient_id:null,p_name:'Flour',p_base_unit_code:'g',p_purchase_unit_code:'kg',p_sku:null,p_barcode:null,p_cost_per_base_unit:0.05,p_minimum_quantity:100,p_track_inventory:true,p_usable_yield_percent:100,p_shelf_life_minutes:null,p_active:true,p_client_tx_id:itx};
 let saved=await r.SharawlaOfflineV2Transport.commitRpcLocal('food_ingredient_save_v1',ingredientPayload);
 assert.strictEqual(saved.result,'offline-ingredient-'+itx);assert.strictEqual(store.get('offlineV2Ingredients').length,1);
 r=runtime(false,true);await r.SharawlaOfflineV2Transport.reconcileCompatibilityProjections();assert.strictEqual(store.get('offlineV2Ingredients')[0].id,'offline-ingredient-'+itx);
 const conversionPayload={p_ingredient_id:null,p_ingredient_create_tx:itx,p_from_unit_code:'kg',p_to_unit_code:'g',p_factor:1000,p_active:true,p_client_tx_id:ctx};
 saved=await r.SharawlaOfflineV2Transport.commitRpcLocal('food_ingredient_conversion_save_v1',conversionPayload);
 assert.strictEqual(saved.result,'offline-ingredient-conversion-'+ctx);assert.strictEqual(events.get(ctx).depends_on_tx_id,itx);assert.strictEqual(store.get('offlineV2IngredientConversions').length,1);
 r=runtime(false,true);await r.SharawlaOfflineV2Transport.reconcileCompatibilityProjections();assert.strictEqual(store.get('offlineV2IngredientConversions')[0].ingredient_id,'offline-ingredient-'+itx);
 const bad=tx();await assert.rejects(()=>r.SharawlaOfflineV2Transport.commitRpcLocal('food_ingredient_save_v1',{...ingredientPayload,p_ingredient_id:'offline-ingredient-'+itx,p_client_tx_id:bad}),e=>e&&e.code==='OFFLINE_V2_LOCAL_DEPENDENCY_REQUIRED');assert(!events.has(bad));
 let e=events.get(itx);e.status='synced';e.server_ack={result:{ok:true,ingredient_id:701,client_tx_id:itx,idempotent_replay:false}};events.set(itx,e);
 e=events.get(ctx);e.status='synced';e.server_ack={result:{ok:true,conversion_id:801,ingredient_id:701,client_tx_id:ctx,idempotent_replay:false}};events.set(ctx,e);
 r=runtime(true,true);await r.SharawlaOfflineV2Transport.reconcileCompatibilityProjections();await r.SharawlaOfflineV2Transport.reconcileCompatibilityProjections();
 assert.strictEqual(store.get('offlineV2Ingredients').length,1);assert.strictEqual(store.get('offlineV2Ingredients')[0].id,701);assert.strictEqual(store.get('offlineV2Ingredients')[0]._offline,false);
 assert.strictEqual(store.get('offlineV2IngredientConversions').length,1);assert.strictEqual(store.get('offlineV2IngredientConversions')[0].id,801);assert.strictEqual(store.get('offlineV2IngredientConversions')[0].ingredient_id,701);assert.strictEqual(store.get('offlineV2IngredientConversions')[0]._offline,false);
 r=runtime(false,true);await r.SharawlaOfflineV2Transport.reconcileCompatibilityProjections();assert.strictEqual(store.get('offlineV2Ingredients').length,1);assert.strictEqual(store.get('offlineV2IngredientConversions').length,1);
 const inactiveOnline=runtime(true,false),otx=tx();await inactiveOnline.SharawlaOfflineV2Transport.commitOptionalTxRpc('food_ingredient_conversion_save_v1',{...conversionPayload,p_ingredient_id:701,p_ingredient_create_tx:itx,p_client_tx_id:otx},{stripKeys:['p_ingredient_create_tx']});
 assert.strictEqual(inactiveOnline.__canonical.length,1);assert(!('p_client_tx_id' in inactiveOnline.__canonical[0].p));assert(!('p_ingredient_create_tx' in inactiveOnline.__canonical[0].p));
 const inactiveOffline=runtime(false,false);await assert.rejects(()=>inactiveOffline.SharawlaOfflineV2Transport.commitOptionalTxRpc('food_ingredient_save_v1',{...ingredientPayload,p_client_tx_id:tx()}),e=>e&&e.code==='OFFLINE_OPERATION_NO_SAFE_OWNER');
 const ui=fs.readFileSync(path.join(__dirname,'..','food-recipe-ui-v1.js'),'utf8');assert(ui.includes("offlineV2Ingredients"),'ingredient local-first projection missing');assert(ui.includes("commitOptionalTxRpc"),'ingredient four-state helper missing');assert(ui.includes("['p_ingredient_create_tx']"),'conversion canonical stripKeys missing');
 console.log('Offline ingredient conversion restart ACK no-resurrection four-state runtime gate PASS');
})().catch(e=>{console.error(e);process.exit(1)});