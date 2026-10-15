'use strict';
// Source-only SH-0008 regression; no network, DB, device writes, or business entitlement changes.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync('app.js','utf8');
const begin=source.indexOf('async function topChickenDeliveryReferenceWrite(kind,input)');
const end=source.indexOf('\nasync function renderDelivery(){',begin);
assert.ok(begin>0&&end>begin,'scoped delivery reference writer exists');
const snippet=source.slice(begin,end).trim();
new vm.Script('('+snippet+')');
assert.equal((source.match(/function topChickenDeliveryReferenceWrite\(/g)||[]).length,1,'unique writer');
assert.equal((source.match(/topChickenDeliveryReferenceWrite\('driver'/g)||[]).length,4,'both creates, edit, deactivate');
assert.equal((source.match(/topChickenDeliveryReferenceWrite\('zone'/g)||[]).length,4,'both creates, edit, toggle');
assert.ok(source.includes("):rest('delivery_drivers','',{method:'POST'"),'non-TC driver POST preserved');
assert.ok(source.includes("):rest('delivery_zones','',{method:'POST'"),'non-TC zone POST preserved');
assert.ok(source.includes("):rest('delivery_drivers',\`id=eq.\${d.id}\`,{method:'PATCH'"),'non-TC driver PATCH preserved');
assert.ok(source.includes("):rest('delivery_zones',\`id=eq.\${z.id}\`,{method:'PATCH'"),'non-TC zone PATCH preserved');

const store=new Map(),calls=[];let scope=true,branch=22,failOnce=false,n=0;
const crypto={subtle:webcrypto.subtle,randomUUID:()=>('00000000-0000-4000-8000-'+String(++n).padStart(12,'0'))};
const context={
 isTopChickenSyncDiagnosticsScope:()=>scope,
 session:{user:{id:'mock-actor'}},
 state:{employee:{business_id:'5358328c-9724-49aa-affc-1bce8be90f92'}},
 currentBranchId:()=>branch,
 crypto,globalThis:{crypto},TextEncoder,Uint8Array,
 localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
 rpc:async(name,payload)=>{calls.push({name,payload});if(failOnce){failOnce=false;throw Error('uncertain response')}return {ok:true}}
};
const handler=vm.runInNewContext('('+snippet+')',context);
(async()=>{
 await handler('driver',{id:null,branch_id:22,name:'  Driver One  ',phone:'',active:true});
 assert.equal(calls.at(-1).name,'offline_delivery_driver_save_v1');
 assert.equal(calls.at(-1).payload.p_name,'Driver One');
 assert.match(calls.at(-1).payload.p_payload_digest,/^[a-f0-9]{64}$/);
 assert.equal(store.size,0);
 failOnce=true;
 await assert.rejects(handler('zone',{id:null,branch_id:22,name:'منطقة اختبار',delivery_fee:30,active:true}),/uncertain response/);
 assert.equal(store.size,1,'unknown server outcome must preserve client transaction');
 const oldTx=calls.at(-1).payload.p_client_tx_id;
 await handler('zone',{id:null,branch_id:22,name:'منطقة اختبار',delivery_fee:30,active:true});
 assert.equal(calls.at(-1).payload.p_client_tx_id,oldTx,'retry idempotency');
 assert.equal(store.size,0);
 await handler('zone',{id:17,branch_id:22,name:'Existing',delivery_fee:35,active:false});
 assert.equal(calls.at(-1).payload.p_zone_id,17);
 assert.equal(calls.at(-1).payload.p_active,false);
 await handler('driver',{id:19,branch_id:22,name:'Existing',phone:null,active:false});
 assert.equal(calls.at(-1).payload.p_driver_id,19);
 assert.equal(calls.at(-1).payload.p_active,false);
 let prior=calls.length;
 scope=false;
 await assert.rejects(handler('driver',{branch_id:22,name:'other tenant'}),/بيتا فقط/);
 assert.equal(calls.length,prior);
 scope=true;branch=1;
 await assert.rejects(handler('zone',{branch_id:22,name:'other branch',delivery_fee:1}),/الفرع/);
 assert.equal(calls.length,prior);
 branch=22;
 await assert.rejects(handler('zone',{branch_id:22,name:'invalid fee',delivery_fee:-1}),/رسوم/);
 assert.equal(calls.length,prior);
 await assert.rejects(handler('driver',{id:0,branch_id:22,name:'invalid id'}),/معرف/);
 assert.equal(calls.length,prior);
 console.log('PASS: TC-only delivery driver/zone scoped RPC CRUD, audit owners, digest/retry, foreign tenant/branch and invalid input fail-closed; original REST for other businesses preserved');
})().catch(e=>{console.error(e);process.exitCode=1});
