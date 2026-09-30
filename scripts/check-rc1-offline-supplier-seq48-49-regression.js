'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const transport=fs.readFileSync(path.join(root,'beta45-offline-v2-transport-runtime.js'),'utf8');
const finalSql=fs.readFileSync(path.join(root,'supabase-rc1-offline-v2-runtime-alignment-final-dispatcher.sql'),'utf8');
const ownerSql=fs.readFileSync(path.join(root,'supabase-offline-v2-restaurant-reference-owners-v1.sql'),'utf8');

assert(transport.includes("if(type==='supplier_save')return {rpc_name:'offline_food_supplier_save_v1'"),'supplier mapper must target authoritative offline owner');
assert(transport.includes("registerOne('supplier_save',adapter('supplier_save','supplier',['food_supplier_save_v1'])"),'caller-facing supplier RPC must remain intercepted');
assert(finalSql.includes("'supplier_save'"),'final dispatcher must route supplier_save');
assert(finalSql.includes("v_operation='supplier_save' and v_rpc<>'offline_food_supplier_save_v1'"),'final dispatcher helper must bind supplier_save to offline owner');
assert(finalSql.includes("when 'offline_food_supplier_save_v1' then"),'final dispatcher helper must execute supplier offline owner');
assert(ownerSql.includes('create or replace function public.offline_food_supplier_save_v1('),'supplier offline owner source missing');
assert(ownerSql.indexOf('select * into r from public.offline_restaurant_reference_receipts_v1')<ownerSql.indexOf('v_id:=public.food_supplier_save_v1'),'supplier owner must replay-check before first authoritative write');

const store=new Map(),events=new Map();
const txs=[
 '48000000-0000-4000-8000-000000000048',
 '49000000-0000-4000-8000-000000000049'
];
let txIndex=0;
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
function runtime(online=false){
 const takeover={registerOperation:()=>true,takeoverState:async()=>({active:true,migration_verified:true,transport_ready:true})};
 const offlineV2={
  takeoverState:takeover.takeoverState,
  event:async id=>clone(events.get(id)||null),
  commitOperation:async commit=>{
   if(!events.has(commit.client_tx_id))events.set(commit.client_tx_id,{...clone(commit),device_sequence:commit.client_tx_id===txs[0]?48:49,envelope:{payload:clone(commit.payload)},status:'pending',server_ack:null});
   return {ok:true};
  },
  outbox:async()=>[...events.values()].map(clone),
  syncNow:async()=>({ok:true})
 };
 const ctx={console,JSON,Date,Map,Set,Promise,URLSearchParams,CustomEvent:function(){},navigator:{onLine:online},document:{readyState:'complete'},addEventListener:()=>{},dispatchEvent:()=>true,setInterval:()=>1,setTimeout:()=>1,clearInterval:()=>{},
  crypto:{randomUUID:()=>txs[Math.min(txIndex++,txs.length-1)]},uuid:()=>txs[Math.min(txIndex++,txs.length-1)],
  SharawlaOfflineV2Takeover:takeover,SharawlaRuntimeConfig:{current:()=>({pos_profile:'restaurant'})},topBurgerDesktop:{offlineV2},
  state:{activeBranchId:1,employee:{id:7}},currentBranchId:()=>1,loadLicenseState:async()=>({device_id:'SH-0007',business_id:'biz-a',device_fingerprint:'fp-a'}),
  odbGet:async k=>clone(store.get(k)||null),odbSet:async(k,v)=>{store.set(k,clone(v));return v},
  rpc:async()=>{throw new Error('canonical RPC must not bypass Offline V2')},localStorage:{getItem:()=>JSON.stringify({url:'x',key:'k'})},session:{access_token:'token'}};
 ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(transport,ctx,{filename:'beta45-offline-v2-transport-runtime.js'});return ctx;
}
(async()=>{
 const r=runtime(false);
 for(let i=0;i<2;i++){
  const tx=txs[i];
  const out=await r.SharawlaOfflineV2Transport.commitRpcLocal('food_supplier_save_v1',{
   p_supplier_id:null,p_name:'Seq '+(48+i)+' Supplier',p_phone:'0100000000'+i,p_email:null,p_tax_no:null,p_address:'TEST',p_notes:'runtime regression',p_active:true,p_client_tx_id:tx
  });
  assert(out.durable&&!out.synced,'supplier '+(48+i)+' must be durable local before ACK');
  const ev=events.get(tx);
  assert(ev,'supplier event missing for '+tx);
  assert.strictEqual(ev.operation_type,'supplier_save');
  assert.strictEqual(ev.envelope.payload.rpc_name,'offline_food_supplier_save_v1');
  assert.strictEqual(ev.envelope.payload.rpc_payload.p_client_tx_id,tx);
  assert.strictEqual(ev.device_sequence,48+i);
 }
 let rows=store.get('offlineV2Suppliers');assert.strictEqual(rows.length,2,'two practical supplier events must remain two local rows');
 for(let i=0;i<2;i++){
  const tx=txs[i],ev=events.get(tx);ev.status='synced';ev.server_ack={server_entity_id:String(4800+i),result:{ok:true,supplier_id:4800+i,client_tx_id:tx,idempotent_replay:false}};events.set(tx,ev);
 }
 const online=runtime(true);await online.SharawlaOfflineV2Transport.reconcileCompatibilityProjections();await online.SharawlaOfflineV2Transport.reconcileCompatibilityProjections();
 rows=store.get('offlineV2Suppliers');assert.strictEqual(rows.length,2,'ACK reconciliation must not duplicate Seq48/49 suppliers');
 assert.deepStrictEqual(rows.map(x=>Number(x.id)).sort((a,b)=>a-b),[4800,4801]);
 assert(rows.every(x=>x._offline===false),'ACKed suppliers must leave pending local state');
 assert.strictEqual(events.size,2,'reconciliation must not create extra durable events');
 console.log('RC1 supplier Seq48/49 regression PASS — local durable -> offline owner binding -> ACK -> one canonical row per TX');
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
