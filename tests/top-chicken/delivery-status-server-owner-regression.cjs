'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
const start=source.indexOf('async function topChickenOrderOperation(name,payload)');
const end=source.indexOf('\n// ===== V9.8 Offline Core',start);
assert.ok(start>0&&end>start,'Top Chicken gateway found');
const snippet=source.slice(start,end);
assert.ok(!snippet.includes("callFunction('top-chicken-operations'"),'missing Edge must never be called');
assert.ok(snippet.includes("rpc('order_status_apply_offline_v2'"),'existing audited status owner required');
assert.ok(snippet.includes("rpc('offline_delivery_assign_driver_v1'"),'existing audited driver idempotency owner required');
assert.ok(!snippet.includes("rest('orders'"),'no broad PATCH fallback');
assert.ok(source.includes("toast('تعذر تغيير حالة الطلب: '"),'errors must be visible in modal');
const kept=new Map(),calls=[];
let failOnce=false,number=0,branch=22;
const business='5358328c-9724-49aa-affc-1bce8be90f92';
const ctx={
 state:{employee:{business_id:business}},cfg:{url:'https://xihcxydjnzemflhedzor.supabase.co'},
 currentBranchId:()=>branch,session:{user:{id:'test-auth-user'}},
 localStorage:{getItem:k=>kept.get(k)||null,setItem:(k,v)=>kept.set(k,v),removeItem:k=>kept.delete(k)},
 crypto:{randomUUID:()=> '11111111-1111-4111-8111-'+String(++number).padStart(12,'0')},
 rpc:async(n,p)=>{calls.push({n,p});if(failOnce){failOnce=false;throw Error('network dropped')}return {ok:true}},
 callFunction:async()=>{throw Error('MISSING EDGE CALLED')}
};
const i=snippet.indexOf('\nasync function transitionTopChickenOrderStatus');
assert.ok(i>0);
const ops=vm.runInNewContext('('+snippet.slice(0,i).trim()+')',ctx);
ctx.topChickenOrderOperation=ops;
const tr=vm.runInNewContext('('+snippet.slice(i).trim()+')',ctx);
(async()=>{
 for(const [from,to] of [['new','preparing'],['preparing','ready'],['ready','completed'],['out_for_delivery','delivered']]){
  const before=calls.length;
  await tr(887,from,to);
  assert.equal(calls.length,before+1);
  assert.equal(calls.at(-1).n,'order_status_apply_offline_v2');
  assert.equal(calls.at(-1).p.p_order_id,887);
  assert.equal(calls.at(-1).p.p_target_status,to);
  assert.match(calls.at(-1).p.p_client_tx_id,/^[0-9a-f-]{36}$/i);
 }
 const ct=calls.length;
 await assert.rejects(tr(887,'new','ready'),/انتقال الحالة/);
 await assert.rejects(tr(887,'ready','delivered'),/انتقال الحالة/);
 assert.equal(calls.length,ct,'invalid transitions never call server');
 failOnce=true;
 await assert.rejects(tr(887,'new','preparing'),/network dropped/);
 const failed=calls.at(-1).p.p_client_tx_id;
 assert.ok(kept.size>0,'retry ID retained after error');
 await tr(887,'new','preparing');
 assert.equal(calls.at(-1).p.p_client_tx_id,failed,'same transaction after uncertain network outcome');
 assert.equal(kept.size,0,'successful request key removed');
 await ops('top_chicken_assign_order_driver',{p_order_id:887,p_driver_id:19});
 assert.equal(calls.at(-1).n,'offline_delivery_assign_driver_v1');
 assert.equal(calls.at(-1).p.p_driver_id,19);
 assert.equal(calls.at(-1).p.p_order_id,887);
 assert.ok(calls.at(-1).p.p_payload_digest.includes('"order_id":887'));
 await assert.rejects(ops('random_rpc',{p_order_id:887}),/غير مدعومة/);
 const oldCount=calls.length;
 ctx.state.employee.business_id='91826502-590e-4afa-8826-2c0f4b99c490';
 await assert.rejects(tr(887,'new','preparing'),/توب تشيكن بيتا فقط/);
 ctx.state.employee.business_id=business;
 branch=1;
 await assert.rejects(tr(887,'new','preparing'),/توب تشيكن بيتا فقط/);
 assert.equal(calls.length,oldCount,'foreign business/branch may not call server');
 console.log('PASS: preexisting audited RPC owners for all transitions and driver; no missing Edge/direct PATCH; replay and tenant isolation');
})().catch(err=>{console.error(err);process.exitCode=1});
