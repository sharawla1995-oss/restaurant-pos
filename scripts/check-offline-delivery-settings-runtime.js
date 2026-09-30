const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(path.join(__dirname,'..','beta45-offline-v2-transport-runtime.js'),'utf8');
const store=new Map(),events=new Map();let seq=0;
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function makeTx(){seq++;return '10000000-0000-4000-8000-'+String(seq).padStart(12,'0')}
function runtime(branch=1,online=false){
 const takeover={registerOperation:()=>true,takeoverState:async()=>({active:true,migration_verified:true,transport_ready:true})};
 const offlineV2={takeoverState:takeover.takeoverState,event:async id=>clone(events.get(id)||null),commitOperation:async c=>{if(!events.has(c.client_tx_id))events.set(c.client_tx_id,{...clone(c),envelope:{payload:clone(c.payload)},status:'pending',server_ack:null});return{ok:true}},outbox:async()=>[...events.values()].map(clone),syncNow:async()=>({ok:true})};
 const ctx={console,JSON,Date,Map,Set,Promise,URLSearchParams,CustomEvent:function(t,o){this.type=t;this.detail=o?.detail},navigator:{onLine:online},document:{readyState:'complete'},addEventListener:()=>{},dispatchEvent:()=>true,setInterval:()=>1,setTimeout:()=>1,clearInterval:()=>{},crypto:{randomUUID:makeTx},uuid:makeTx,
 SharawlaOfflineV2Takeover:takeover,SharawlaRuntimeConfig:{current:()=>({pos_profile:'restaurant'})},topBurgerDesktop:{offlineV2},state:{activeBranchId:branch,employee:{id:7}},currentBranchId:()=>branch,loadLicenseState:async()=>({device_id:'SH-0007',business_id:'biz-a',device_fingerprint:'fp-a'}),odbGet:async k=>clone(store.get(k)||null),odbSet:async(k,v)=>{store.set(k,clone(v));return v},rpc:async()=>{throw new Error('canonical rpc called offline')},localStorage:{getItem:()=>JSON.stringify({url:'x',key:'k'})},session:{access_token:'t'}};ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);return ctx;
}
(async()=>{
 let r=runtime(1,false);
 const dtx=makeTx(),ztx=makeTx();
 await r.SharawlaOfflineV2Transport.commitRpcLocal('delivery_driver_save_v2',{p_driver_id:null,p_branch_id:1,p_name:'Driver Offline',p_phone:'0101',p_active:true,p_client_tx_id:dtx});
 await r.SharawlaOfflineV2Transport.commitRpcLocal('delivery_zone_save_v2',{p_zone_id:null,p_branch_id:1,p_name:'Zone Offline',p_delivery_fee:25,p_active:true,p_client_tx_id:ztx});
 assert.strictEqual(store.get('offlineV2Drivers').length,1);assert.strictEqual(store.get('offlineV2Zones').length,1);
 // cold restart keeps durable projections
 r=runtime(1,false);await r.SharawlaOfflineV2Transport.reconcileCompatibilityProjections();
 assert.strictEqual(store.get('offlineV2Drivers')[0].branch_id,1);assert.strictEqual(store.get('offlineV2Zones')[0].branch_id,1);
 // renderer contract must branch-filter local projections
 const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
 assert(app.includes("const scopedLocal=local.filter(x=>Number(x.branch_id)===branchId)"),'delivery local projection is not branch isolated');
 assert(app.includes("deliverySettingsRowsLocalFirst('delivery_drivers','offlineV2Drivers')"),'Delivery Settings screen bypasses local-first driver projection');
 assert(app.includes("deliverySettingsRowsLocalFirst('delivery_zones','offlineV2Zones')"),'Delivery Settings screen bypasses local-first zone projection');
 // ACK both, then reconcile twice = canonical IDs, no duplicate
 let e=events.get(dtx);e.status='synced';e.server_ack={result:{ok:true,driver_id:91,client_tx_id:dtx,idempotent_replay:true}};events.set(dtx,e);
 e=events.get(ztx);e.status='synced';e.server_ack={result:{ok:true,zone_id:92,client_tx_id:ztx,idempotent_replay:true}};events.set(ztx,e);
 r=runtime(1,true);await r.SharawlaOfflineV2Transport.reconcileCompatibilityProjections();await r.SharawlaOfflineV2Transport.reconcileCompatibilityProjections();
 const ds=store.get('offlineV2Drivers'),zs=store.get('offlineV2Zones');assert.strictEqual(ds.length,1);assert.strictEqual(zs.length,1);assert.strictEqual(ds[0].id,91);assert.strictEqual(zs[0].id,92);assert.strictEqual(ds[0]._offline,false);assert.strictEqual(zs[0]._offline,false);
 // same tx replay resolves canonical id and cannot create a second event
 const dr=await r.SharawlaOfflineV2Transport.commitRpcLocal('delivery_driver_save_v2',{p_driver_id:null,p_branch_id:1,p_name:'Driver Offline',p_phone:'0101',p_active:true,p_client_tx_id:dtx});assert.strictEqual(dr.result,91);assert.strictEqual(events.size,2);
 console.log('Offline delivery settings restart/ACK/branch isolation runtime gate PASS');
})().catch(e=>{console.error(e);process.exit(1)});
