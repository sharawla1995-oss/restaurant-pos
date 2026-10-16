'use strict';
// SOURCE-ONLY. Executes extracted tenant-specific POS helper against fake services.
// Never touches Supabase, local device queues, or any live supplier.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const src=fs.readFileSync('app.js','utf8');
const anchor='async function topChickenDurableSupplierSave(payload){';
const start=src.indexOf(anchor),end=src.indexOf('async function rpc(name,payload={}){',start);
assert(start>=0&&end>start,'missing exact supplier entrypoint');
const helper=src.slice(start,end);
const STORAGE=()=>{const map=new Map();return{
 getItem:x=>map.has(x)?map.get(x):null,
 setItem:(x,v)=>map.set(x,String(v)),
 removeItem:x=>map.delete(x),
 entries:()=>[...map.entries()]};
};
const payload={p_supplier_id:null,p_name:' Test Supplier ',p_phone:'01100001111',p_email:null,p_tax_no:null,p_address:null,p_notes:null,p_active:true};
async function fixture({scope=true,actor=true,result=34,throwOnRpc=false}={}){
 const storage=STORAGE(),calls=[],context={
  crypto:webcrypto,TextEncoder,globalThis:{crypto:webcrypto},localStorage:storage,
  isTopChickenSyncDiagnosticsScope:()=>scope,
  session:actor?{user:{id:'c4fabcfd-d311-4d71-82df-0067288820a4'}}:null,
  rpc:async(name,body)=>{calls.push({name,body});if(throwOnRpc)throw Error('NETWORK_UNCERTAIN');
   return {ok:true,supplier_id:result,client_tx_id:body.p_client_tx_id};}
 };
 vm.runInNewContext(helper,context,{timeout:1000});
 return {storage,calls,context};
}
let n=0;
async function pass(name,fn){await fn();n++;console.log('PASS',name)}
(async()=>{
 await pass('Top Chicken only uses existing durable supplier owner',async()=>{
  const f=await fixture();const id=await f.context.topChickenDurableSupplierSave(payload);
  assert.equal(id,34);assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].name,'offline_food_supplier_save_v1');
  assert.match(f.calls[0].body.p_payload_digest,/^[a-f0-9]{64}$/);
  assert.match(f.calls[0].body.p_client_tx_id,/^[a-f0-9-]{36}$/);
  assert.equal(f.storage.entries().length,0);
 });
 await pass('Uncertain save holds durable retry identity, exact retry reuses it',async()=>{
  const f=await fixture({throwOnRpc:true});
  await assert.rejects(()=>f.context.topChickenDurableSupplierSave(payload),/NETWORK_UNCERTAIN/);
  assert.equal(f.storage.entries().length,1);
  const first=f.calls[0].body.p_client_tx_id;
  f.context.rpc=async(name,body)=>{f.calls.push({name,body});return {ok:true,supplier_id:90,client_tx_id:body.p_client_tx_id};};
  const id=await f.context.topChickenDurableSupplierSave(payload);
  assert.equal(id,90);assert.equal(f.calls[1].body.p_client_tx_id,first);
  assert.equal(f.storage.entries().length,0);
 });
 await pass('Keys never contain supplier name or phone',async()=>{
  const f=await fixture({throwOnRpc:true});
  await assert.rejects(()=>f.context.topChickenDurableSupplierSave(payload));
  const key=f.storage.entries()[0][0];
  assert(!key.includes(payload.p_phone)&&!key.includes(payload.p_name)&&key.includes('tc-supplier-v1'));
 });
 await pass('Foreign or unknown tenant cannot call durable owner',async()=>{
  const f=await fixture({scope:false});await assert.rejects(()=>f.context.topChickenDurableSupplierSave(payload),/فرع 22/);assert.equal(f.calls.length,0);
 });
 await pass('No Beta actor cannot call durable owner',async()=>{
  const f=await fixture({actor:false});await assert.rejects(()=>f.context.topChickenDurableSupplierSave(payload),/فرع 22/);assert.equal(f.calls.length,0);
 });
 await pass('Invalid supplier fields rejected before network',async()=>{
  const f=await fixture();
  for(const p of [{...payload,p_name:'  '},{...payload,p_supplier_id:-4},{...payload,other_tenant:'forged'}]){
   await assert.rejects(()=>f.context.topChickenDurableSupplierSave(p));}
  assert.equal(f.calls.length,0);
 });
 await pass('Missing server receipt cannot falsely claim success',async()=>{
  const f=await fixture({result:0});
  await assert.rejects(()=>f.context.topChickenDurableSupplierSave(payload),/لم يؤكد السيرفر/);
  assert.equal(f.storage.entries().length,1);
 });
 await pass('Legacy supplier path stays unmodified outside Top Chicken',async()=>{
  assert.match(src,/if\(name==='food_supplier_save_v1'&&isTopChickenSyncDiagnosticsScope\(\)\)/);
  assert.match(src,/return req\(\x60\/rest\/v1\/rpc\/\$\{name\}\x60/);
  assert.match(src,/offline_food_supplier_save_v1:'inventory\.suppliers'/);
 });
 console.log('PASS '+n+' durable supplier source groups; no live writes.');
})().catch(e=>{console.error(e);process.exitCode=1});
