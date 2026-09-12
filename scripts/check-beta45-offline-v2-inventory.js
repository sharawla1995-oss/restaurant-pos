'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const read=p=>fs.readFileSync(p,'utf8');
const runtime=read('beta45-offline-v2-inventory-runtime.js');
const store=read('beta45-offline-v2-inventory-store.js');
const preload=read('preload.js');
const main=read('main-beta44.js');
const pkg=JSON.parse(read('package.json'));
const need=(src,t,msg=t)=>{if(!src.includes(t))throw new Error(`Beta45 Phase 6 gate missing: ${msg}`)};
const forbid=(src,t,msg=t)=>{if(src.includes(t))throw new Error(`Beta45 Phase 6 gate forbidden: ${msg}`)};

new Function(runtime);new Function(store);new Function(preload);
for(const t of [
 'legacy_behavior','allow_offline_oversell','warn_only','strict_cloud_stock','device_reservation_pool',
 'inventory_ledger','SALE','RETURN','quantity_delta','item_kind','item_id','projectable','server_derived',
 'OFFLINE_V2_STRICT_CLOUD_STOCK_REQUIRED','OFFLINE_V2_DEVICE_RESERVATION_POOL_NOT_IMPLEMENTED',
 'registerOperation(type,wrapAdapter(type,adapter))','commit.records=[...'
])need(runtime,t);
for(const t of [
 "r.record_type='inventory_ledger'",'offline_v2_outbox','device_sequence','audit_delta_total','pending_delta',
 "ipcMain.handle('offline-v2:inventory-ledger'","ipcMain.handle('offline-v2:inventory-projection'","ipcMain.handle('offline-v2:inventory-stats'"
])need(store,t);
for(const t of ['inventoryLedger:x=>ipcRenderer.invoke','inventoryProjection:x=>ipcRenderer.invoke','inventoryStats:x=>ipcRenderer.invoke','beta45-offline-v2-inventory-runtime.js','data-offline-v2-phase6-inventory'])need(preload,t);
need(main,"require('./beta45-offline-v2-inventory-store.js').installOfflineV2InventoryStore()");
if(!(preload.indexOf('beta45-offline-v2-runtime-takeover.js')<preload.indexOf('beta45-offline-v2-inventory-runtime.js')&&preload.indexOf('beta45-offline-v2-inventory-runtime.js')<preload.indexOf('beta45-offline-v2-transport-runtime.js')))throw new Error('Phase 6 inventory wrapper must load after takeover and before transport adapters');
forbid(runtime,'restaurant','inventory core must stay profile-generic');
forbid(runtime,'pharmacy','inventory core must stay profile-generic');
forbid(store,'DELETE FROM offline_v2_records','inventory audit ledger must never be pruned');
forbid(store,'delete from offline_v2_records','inventory audit ledger must never be pruned');

// Runtime behavior with a fake takeover registry. This proves the wrapper mutates
// the same adapter object the Phase 5 transport keeps in adaptersByType.
const mem=new Map();
const localStorage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};
const captured=[];
const window={
 SharawlaOfflineV2Takeover:Object.freeze({registerOperation:(type,a)=>{captured.push({type,a});return a},registerRpc:()=>true,operationTypes:()=>[]}),
 localStorage,
 state:{business:{id:'biz'},settings:{},activeBranchId:1},
 sharawlaRuntimeConfig:{business_id:'biz'},
 currentBranchId:()=>1
};
window.window=window;
const document={readyState:'complete',addEventListener:()=>{}};
const sandbox={window,document,localStorage,navigator:{onLine:false},state:window.state,sharawlaRuntimeConfig:window.sharawlaRuntimeConfig,currentBranchId:window.currentBranchId,setTimeout:()=>0,console,crypto:{randomUUID:()=> 'uuid'}};
vm.createContext(sandbox);vm.runInContext(runtime,sandbox);
const inv=window.SharawlaOfflineV2Inventory;assert(inv,'Phase 6 inventory API not installed');
assert.equal(inv.policy(),'legacy_behavior');
assert.equal(inv.setLocalPolicy('warn_only'),'warn_only');assert.equal(inv.policy(),'warn_only');
let d=inv.policyDecision('warn_only',[{quantity_delta:-1}]);assert.equal(d.allowed,true);assert.equal(d.warning,'OFFLINE_V2_STOCK_NOT_CLOUD_VERIFIED');
d=inv.policyDecision('strict_cloud_stock',[{quantity_delta:-1}]);assert.equal(d.allowed,false);assert.equal(d.code,'OFFLINE_V2_STRICT_CLOUD_STOCK_REQUIRED');
d=inv.policyDecision('allow_offline_oversell',[{quantity_delta:-1}]);assert.equal(d.allowed,true);
d=inv.policyDecision('device_reservation_pool',[{quantity_delta:-1}]);assert.equal(d.allowed,false);

// Direct sale becomes a durable, projectable ledger movement inside the same
// records array that Native Store writes before the outbox COMMIT.
inv.setLocalPolicy('allow_offline_oversell');
const adapter={buildCommit:ctx=>({client_tx_id:ctx.clientTx,device_id:'dev',business_id:'biz',branch_id:1,employee_id:2,entity_type:'order',local_entity_id:`offline-${ctx.clientTx}`,created_local_at:'2026-01-01T00:00:00Z',payload:{rpc_name:'create_retail_pos_order_atomic',rpc_payload:{p_items:ctx.payload.p_items}},records:[]})};
window.SharawlaOfflineV2Takeover.registerOperation('sale',adapter);
const c=adapter.buildCommit({clientTx:'tx1',payload:{p_items:[{product_id:9,quantity:2.5}]},identity:{device_id:'dev',business_id:'biz'}});
const lr=c.records.find(x=>x.record_type==='inventory_ledger');assert(lr);assert.equal(lr.payload.item_kind,'product');assert.equal(lr.payload.item_id,'9');assert.equal(lr.payload.quantity_delta,-2.5);assert.equal(lr.payload.projectable,true);assert.equal(lr.payload.policy_mode,'allow_offline_oversell');

// Food/recipe consumption is not guessed locally. It is preserved as a
// server-derived intent so later Inbox reconciliation can attach real ingredient
// movements without fabricating stock.
const foodAdapter={buildCommit:ctx=>({client_tx_id:ctx.clientTx,device_id:'dev',business_id:'biz',branch_id:1,employee_id:2,entity_type:'order',local_entity_id:`offline-${ctx.clientTx}`,created_local_at:'2026-01-01T00:00:00Z',payload:{rpc_name:'create_food_pos_order_atomic_v1',rpc_payload:{p_items:ctx.payload.p_items}},records:[]})};
window.SharawlaOfflineV2Takeover.registerOperation('sale',foodAdapter);
const fc=foodAdapter.buildCommit({clientTx:'tx2',payload:{p_items:[{product_id:5,quantity:1}]},identity:{device_id:'dev',business_id:'biz'}});
const fl=fc.records.find(x=>x.record_type==='inventory_ledger');assert(fl);assert.equal(fl.payload.projectable,false);assert.equal(fl.payload.server_derived,true);

// Strict policy fails before the native commit, so no fake local stock success is
// acknowledged when the business explicitly requires Cloud stock authority.
inv.setLocalPolicy('strict_cloud_stock');
assert.throws(()=>foodAdapter.buildCommit({clientTx:'tx3',payload:{p_items:[{product_id:5,quantity:1}]},identity:{device_id:'dev',business_id:'biz'}}),e=>e?.code==='OFFLINE_V2_STRICT_CLOUD_STOCK_REQUIRED');

if(!String(pkg.scripts?.check||'').includes('check-beta45-offline-v2-inventory.js'))throw new Error('package check pipeline missing Phase 6 gate');
console.log('Beta45 Offline V2 Phase 6 inventory ledger / stock policy gate PASS');
