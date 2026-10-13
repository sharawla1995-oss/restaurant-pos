const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const source=fs.readFileSync('app.js','utf8');
const helpers=source.slice(source.indexOf('async function topChickenOrderOperation('),source.indexOf('// ===== V9.8 Offline Core'));
const storage=new Map(),results=[];
function context(actor='fixture-actor',business='5358328c-9724-49aa-affc-1bce8be90f92',url='https://xihcxydjnzemflhedzor.supabase.co',rpc=async()=>({ok:true})){
 const c=vm.createContext({state:{employee:{business_id:business}},cfg:{url},session:{user:{id:actor}},currentBranchId:()=>22,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto,rpc});vm.runInContext(helpers,c);return c;
}
async function test(name,fn){await fn();results.push({name,result:'PASS'});}
(async()=>{
 let ids=[];
 await test('lost status response retains identity through full JS context restart',async()=>{
  const first=context('fixture-actor',undefined,undefined,async(_name,p)=>{ids.push(p.p_request_id);throw Error('lost response');});
  await assert.rejects(()=>first.transitionTopChickenOrderStatus(1,'new','preparing'));
  assert.equal(storage.size,1);
  const second=context('fixture-actor',undefined,undefined,async(_name,p)=>{ids.push(p.p_request_id);return {ok:true};});
  await second.transitionTopChickenOrderStatus(1,'new','preparing');assert.equal(ids[0],ids[1]);assert.equal(storage.size,0);
 });
 await test('driver retry preserves identity after transport failure',async()=>{
  ids=[];const payload={p_order_id:2,p_driver_id:1};
  const first=context('fixture-actor',undefined,undefined,async(_name,p)=>{ids.push(p.p_request_id);throw Error('lost response');});
  await assert.rejects(()=>first.topChickenOrderOperation('top_chicken_assign_order_driver',payload));
  const second=context('fixture-actor',undefined,undefined,async(name,p)=>{assert.equal(name,'top_chicken_assign_order_driver');ids.push(p.p_request_id);return {ok:true};});
  await second.topChickenOrderOperation('top_chicken_assign_order_driver',payload);assert.equal(ids[0],ids[1]);
 });
 await test('actor identity separates durable requests',async()=>{
  ids=[];for(const actor of ['fixture-a','fixture-b']){const c=context(actor,undefined,undefined,async(_n,p)=>{ids.push(p.p_request_id);throw Error('transport');});await assert.rejects(()=>c.transitionTopChickenOrderStatus(3,'new','preparing'));}assert.notEqual(ids[0],ids[1]);
 });
 await test('wrong tenant fails before RPC',async()=>{const c=context('fixture-a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',undefined,()=>{throw Error('RPC must not run');});await assert.rejects(()=>c.transitionTopChickenOrderStatus(1,'new','preparing'),/بيتا/);});
 await test('lookalike Beta hostname rejected',async()=>{const c=context('fixture-a',undefined,'https://xihcxydjnzemflhedzor.supabase.co.attacker.invalid');await assert.rejects(()=>c.transitionTopChickenOrderStatus(1,'new','preparing'),/بيتا/);});
 await test('unconfirmed RPC result retains retry identity',async()=>{storage.clear();const c=context('fixture-a',undefined,undefined,async()=>({ok:false}));await assert.rejects(()=>c.transitionTopChickenOrderStatus(1,'new','preparing'));assert.equal(storage.size,1);});
 await test('storage write failure prevents network mutation',async()=>{storage.clear();let called=false;const c=context('fixture-a',undefined,undefined,async()=>{called=true;return {ok:true}});c.localStorage.setItem=()=>{};await assert.rejects(()=>c.transitionTopChickenOrderStatus(1,'new','preparing'),/حفظ/);assert.equal(called,false);});
 const picker=source.slice(source.indexOf('function openDriverPicker('),source.indexOf('function paymentStatusLabel('));
 await test('driver picker has RPC and no direct orders PATCH',async()=>{assert.ok(picker.includes("topChickenOrderOperation('top_chicken_assign_order_driver'"));assert.ok(!picker.includes("rest('orders'"));});
 fs.writeFileSync('evidence/top-chicken/client-retry-results.json',JSON.stringify({results,scope:'actual app helper source in Node VM; no browser, Auth, Electron or external API'},null,2));console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exit(1)});
