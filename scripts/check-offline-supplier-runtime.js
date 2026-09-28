const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(path.join(__dirname,'..','beta45-offline-v2-transport-runtime.js'),'utf8');
const store=new Map(),events=new Map();
const tx='11111111-2222-4333-8444-555555555555';
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function runtime({online=false}={}){
 const takeover={registerOperation:()=>true,takeoverState:async()=>({active:true,migration_verified:true,transport_ready:true})};
 const offlineV2={
  takeoverState:async()=>({active:true,migration_verified:true,transport_ready:true}),
  event:async id=>clone(events.get(id)||null),
  commitOperation:async commit=>{if(!events.has(commit.client_tx_id))events.set(commit.client_tx_id,{...clone(commit),envelope:{payload:clone(commit.payload)},status:'pending',server_ack:null});return{ok:true}},
  outbox:async()=>[...events.values()].map(clone),
  syncNow:async()=>({ok:true})
 };
 const ctx={console,JSON,Date,Map,Set,Promise,URLSearchParams,CustomEvent:function(t,o){this.type=t;this.detail=o?.detail},navigator:{onLine:online},document:{readyState:'complete'},addEventListener:()=>{},dispatchEvent:()=>true,setInterval:()=>1,setTimeout:()=>1,clearInterval:()=>{},crypto:{randomUUID:()=>tx},uuid:()=>tx,
  SharawlaOfflineV2Takeover:takeover,SharawlaRuntimeConfig:{current:()=>({pos_profile:'restaurant'})},topBurgerDesktop:{offlineV2},
  state:{activeBranchId:1,employee:{id:7}},currentBranchId:()=>1,loadLicenseState:async()=>({device_id:'SH-0007',business_id:'biz-a',device_fingerprint:'fp-a'}),
  odbGet:async k=>clone(store.get(k)||null),odbSet:async(k,v)=>{store.set(k,clone(v));return v},
  rpc:async()=>{throw new Error('canonical rpc must not be called by local commit')},localStorage:{getItem:()=>JSON.stringify({url:'x',key:'k'})},session:{access_token:'t'}};
 ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(source,ctx,{filename:'beta45-offline-v2-transport-runtime.js'});return ctx;
}
(async()=>{
 let r=runtime({online:false});const payload={p_supplier_id:null,p_name:'Offline Supplier',p_phone:'01000000000',p_email:null,p_tax_no:null,p_address:'Giza',p_notes:'cold restart',p_active:true,p_client_tx_id:tx};
 const saved=await r.SharawlaOfflineV2Transport.commitRpcLocal('food_supplier_save_v1',payload);
 assert(saved.durable===true&&saved.synced===false,'supplier must commit durably while offline');
 let rows=store.get('offlineV2Suppliers');assert.strictEqual(rows.length,1);assert.strictEqual(rows[0].id,'offline-supplier-'+tx);assert.strictEqual(rows[0]._offline,true);
 // Cold renderer restart: same durable outbox + projection storage.
 r=runtime({online:false});await r.SharawlaOfflineV2Transport.reconcileCompatibilityProjections();
 rows=store.get('offlineV2Suppliers');assert.strictEqual(rows.length,1,'cold restart resurrected/duplicated supplier');
 // Explicit server ACK / lost-ACK replay result.
 const ev=events.get(tx);ev.status='synced';ev.server_ack={server_entity_id:'77',result:{ok:true,supplier_id:77,client_tx_id:tx,idempotent_replay:true}};events.set(tx,ev);
 r=runtime({online:true});await r.SharawlaOfflineV2Transport.reconcileCompatibilityProjections();await r.SharawlaOfflineV2Transport.reconcileCompatibilityProjections();
 rows=store.get('offlineV2Suppliers');assert.strictEqual(rows.length,1,'ACK reconciliation duplicated supplier');assert.strictEqual(rows[0].id,77,'ACK did not replace local supplier id');assert.strictEqual(rows[0]._offline,false,'ACKed supplier stayed pending');
 const result=await r.SharawlaOfflineV2Transport.commitRpcLocal('food_supplier_save_v1',payload);assert.strictEqual(result.result,77,'synced replay did not unwrap canonical supplier id');assert.strictEqual(events.size,1,'same client_tx_id created duplicate durable event');
 console.log('Offline supplier durable restart/ACK runtime gate PASS');
})().catch(e=>{console.error(e);process.exit(1)});
