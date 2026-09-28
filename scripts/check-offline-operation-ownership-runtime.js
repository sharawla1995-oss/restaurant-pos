'use strict';
const fs=require('fs'),vm=require('vm');
const assert=(v,m)=>{if(!v)throw new Error(m)};
const source=fs.readFileSync('beta45-offline-v2-runtime-takeover.js','utf8');
async function boot(state){
  const calls={commits:0,legacySales:0,legacyExpenses:0};
  const window={topBurgerDesktop:{offlineV2:{takeoverState:async()=>({...state}),commitOperation:async c=>{calls.commits++;return {ok:true,client_tx_id:c.client_tx_id}},takeoverArm:async()=>({}),takeoverPrepare:async()=>({}),takeoverActivate:async()=>({}),takeoverDeactivate:async()=>({})}},sharawlaRuntimeConfig:{business_id:'biz-1'}};
  const ctx={window,document:{readyState:'complete'},console,crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000001'},loadLicenseState:async()=>({device_id:'dev-1',business_id:'biz-1',device_fingerprint:'fp-1'}),state:{activeBranchId:7,employee:{id:11}},currentBranchId:()=>7,rpc:async()=>({ok:true}),saveOfflineSale:async()=>{calls.legacySales++;return {owner:'legacy'}},saveOfflineExpense:async()=>{calls.legacyExpenses++;return {owner:'legacy'}},saveOfflineShiftOpen:async()=>({owner:'legacy'}),saveOfflineReturn:async()=>({owner:'legacy'}),saveOfflineShiftClose:async()=>({owner:'legacy'}),syncOfflineQueue:async()=>({ok:true}),odbGet:async()=>[],odbSet:async()=>{},setTimeout,clearTimeout};
  Object.assign(window,ctx);vm.runInNewContext(source,ctx,{filename:'beta45-offline-v2-runtime-takeover.js'});return {api:window.SharawlaOfflineV2Takeover,calls,ctx};
}
(async()=>{
  const a=await boot({active:false,migration_verified:false,transport_ready:false});
  const saleOwner=await a.api.resolveOperationOwner('sale');
  assert(saleOwner.owner==='legacy'&&saleOwner.exclusive===true,'inactive sale must have exactly one legacy owner');
  const sale=await a.ctx.saveOfflineSale({branch_id:7},[],[],'sale-tx-1');
  assert(sale.owner==='legacy'&&a.calls.legacySales===1&&a.calls.commits===0,'inactive sale must legacy-write only');
  const statusOwner=await a.api.resolveOperationOwner('order_status');
  assert(statusOwner.owner===null&&statusOwner.reason==='NO_SAFE_OWNER','inactive order_status must fail closed');
  let err=null;try{await a.api.saveOrderStatus(55,'preparing','status-tx-1')}catch(e){err=e}
  assert(err?.code==='OFFLINE_OPERATION_NO_SAFE_OWNER','order_status must expose fail-closed owner error');
  assert(a.calls.commits===0,'fail-closed order_status must perform zero durable writes');
  const deliveryOwner=await a.api.resolveOperationOwner('delivery_assign_driver');
  assert(deliveryOwner.owner===null&&deliveryOwner.reason==='NO_SAFE_OWNER','inactive delivery assignment must fail closed with no invented legacy owner');
  const b=await boot({active:true,migration_verified:true,transport_ready:true});
  const v2Sale=await b.api.resolveOperationOwner('sale'),v2Status=await b.api.resolveOperationOwner('order_status'),v2Delivery=await b.api.resolveOperationOwner('delivery_assign_driver');
  assert(v2Sale.owner==='v2'&&v2Sale.legacy_ready===true&&v2Sale.exclusive===true,'ready sale must select V2 exclusively even when legacy exists');
  assert(v2Status.owner==='v2'&&v2Status.legacy_ready===false&&v2Status.exclusive===true,'ready order_status must select V2 exclusively');
  assert(v2Delivery.owner==='v2'&&v2Delivery.legacy_ready===false&&v2Delivery.exclusive===true,'ready delivery assignment must select V2 exclusively');
  await b.ctx.saveOfflineSale({branch_id:7},[],[],'sale-tx-2');
  assert(b.calls.commits===1&&b.calls.legacySales===0,'ready sale must V2-write only, never dual-write');
  await b.api.saveOrderStatus(55,'ready','status-tx-2');
  assert(b.calls.commits===2,'ready order_status must create one durable V2 commit');
  assert(b.calls.legacySales===0&&b.calls.legacyExpenses===0,'V2 ownership must not invoke legacy mutation owners');
  console.log('Universal Offline operation ownership runtime acceptance PASS — legacy/v2/fail-closed + zero-write + no-dual-write');
})().catch(e=>{console.error(e);process.exit(1)});
