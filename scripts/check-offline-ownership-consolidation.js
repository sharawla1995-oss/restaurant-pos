'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const source=read('beta36-offline-v2.js'),app=read('app.js'),ownership=read('beta47-performance-sync-hotfix.js'),safety=read('beta49-takeover-activation-safety.js'),recovery=read('beta55-4-runtime-recovery.js');
const RPCS=[
 'commerce_order_document_create_v2','commerce_order_document_record_payment_v2',
 'service_appointment_create_v1','service_job_create_v1','service_package_purchase_v1','service_package_use_v1',
 'membership_subscribe_v1','membership_renew_v1','membership_checkin_v1','membership_book_class_v1',
 'logistics_shipment_create_v1','logistics_pickup_request_create_v1','logistics_cod_collect_v1','logistics_settlement_create_v1'
];
function runtime({active=true,mappings={},online=false,queue=[]}={}){
 const data=new Map([['sharawlaOfflineActionsV2',JSON.stringify(queue)]]),calls=[],puts=[];
 const ctx={console,navigator:{onLine:online},crypto:{randomUUID:()=>`tx-${calls.length+1}`},CustomEvent:function(type,init){this.type=type;this.detail=init?.detail},setTimeout:()=>0,setInterval:()=>0,clearTimeout:()=>{},localStorage:{getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v))},dispatchEvent:()=>{},addEventListener:()=>{},rpc:async(name,payload)=>{calls.push({name,payload});return {ok:true}},topBurgerDesktop:{offlineV2:{takeoverState:async()=>active?{active:true,migration_verified:true,transport_ready:true}:{active:false}},operations:{put:x=>puts.push(x),status:()=>{}}},SharawlaOfflineV2Takeover:{rpcMappings:()=>mappings}};
 ctx.window=ctx;vm.runInNewContext(source,ctx,{filename:'beta36-offline-v2.js'});return {ctx,data,calls,puts,api:ctx.SharawlaOfflineV2};
}
(async()=>{
 const canonical=v=>Array.isArray(v)?v.map(canonical):(v&&typeof v==='object'?Object.keys(v).sort().reduce((o,k)=>(o[k]=canonical(v[k]),o),{}):v);
 assert.strictEqual(JSON.stringify(canonical({b:2,a:{d:4,c:3}})),JSON.stringify(canonical({a:{c:3,d:4},b:2})),'legacy payload verification must ignore object property order');
 const blocked=runtime();
 for(const name of RPCS)await assert.rejects(()=>blocked.api.call(name,{p_client_tx_id:`tx-${name}`}),e=>e?.code==='OFFLINE_V2_OPERATION_ADAPTER_REQUIRED');
 assert.deepStrictEqual(JSON.parse(blocked.data.get('sharawlaOfflineActionsV2')),[]);assert.strictEqual(blocked.calls.length,0);assert.strictEqual(blocked.puts.length,0);

 const missingTx=runtime();
 for(const name of RPCS)await assert.rejects(()=>missingTx.api.call(name,{}),e=>e?.code==='OFFLINE_V2_OPERATION_ADAPTER_REQUIRED');
 assert.deepStrictEqual(JSON.parse(missingTx.data.get('sharawlaOfflineActionsV2')),[]);assert.strictEqual(missingTx.calls.length,0);assert.strictEqual(missingTx.puts.length,0);

 const mapped=runtime({mappings:{[RPCS[0]]:'approved_existing_adapter'}});await mapped.api.call(RPCS[0],{p_client_tx_id:'mapped-tx'});assert.strictEqual(mapped.calls.length,1);assert.strictEqual(mapped.puts.length,0);assert.deepStrictEqual(JSON.parse(mapped.data.get('sharawlaOfflineActionsV2')),[]);

 const pending={type:'engine_action_v2',rpc:RPCS[1],payload:{p_client_tx_id:'pending-tx'},client_tx_id:'pending-tx'};
 const frozen=runtime({online:true,queue:[pending]});const sync=await frozen.api.sync();assert.strictEqual(sync.blocked,1);assert.strictEqual(frozen.calls.length,0);assert.deepStrictEqual(JSON.parse(frozen.data.get('sharawlaOfflineActionsV2')),[pending]);

 const inactive=runtime({active:false,online:false});const queued=await inactive.api.call(RPCS[0],{p_client_tx_id:'legacy-tx'});assert.strictEqual(queued.queued,true);assert.strictEqual(JSON.parse(inactive.data.get('sharawlaOfflineActionsV2')).length,1);assert.strictEqual(inactive.puts.length,1);

 const inactiveMissingTx=runtime({active:false,online:false});const fallback=await inactiveMissingTx.api.call(RPCS[0],{});assert.strictEqual(fallback.ok,true);assert.strictEqual(inactiveMissingTx.calls.length,1);assert.deepStrictEqual(JSON.parse(inactiveMissingTx.data.get('sharawlaOfflineActionsV2')),[]);assert.strictEqual(inactiveMissingTx.puts.length,0);

 for(const token of ["types=new Set(['sale','return','expense','shift_open','shift_close'])","legacyTx.has(tx)","env.migration_source==='legacy_queue_v1'","env.legacy_authority===true","same(env.legacy_payload,job)","Object.keys(v).sort()","if(!stateKnown)q=[]"])assert(app.includes(token),`app recovery ownership gate missing: ${token}`);
 assert(!app.includes("types=new Set(['sale','return','expense','shift_open','shift_close','engine_action_v2'])"),'engine_action_v2 must not enter Legacy POS recovery');
 for(const token of ['VERIFIED_DURABLE_MIGRATION_SNAPSHOT','LEGACY_MIGRATION_EVIDENCE_UNVERIFIED','function legacyMayRead47','function legacyMayOperate47(owner){return owner===OWN.LEGACY_FALLBACK}',"if(own.owner===OWN.LEGACY_HISTORICAL){legacyFrozen++;continue}","same47(env.legacy_payload,job)"])assert(ownership.includes(token),`Beta47 ownership freeze missing: ${token}`);
 for(const token of ["skipped:'takeover_active_legacy_frozen'","skipped:'takeover_ownership_state_unavailable'"])assert(safety.includes(token),`Beta49 classifier freeze missing: ${token}`);
 for(const token of ['function legacyMayRead55','if(legacyMayRead55(own.owner))eligible.push','if(!legacyMayRead55(own.owner))','if(legacyMayOperate55(own.owner))redundant.push'])assert(recovery.includes(token),`Beta55.4 read/mutate boundary missing: ${token}`);
 console.log('Offline Ownership Consolidation gate PASS — Native V2 sole ACTIVE owner / legacy historical evidence frozen / recovery filtered');
})().catch(e=>{console.error(e);process.exitCode=1});
