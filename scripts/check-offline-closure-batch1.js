'use strict';
// Real SQLite / unchanged native, renderer, worker in VMs. Server peer is mocked.
const h=require('./offline-reference-return-fixture');
const {native,renderer,payload,clone,dbs,crypto,vm,assert,fs,path,root,work}=h;
const {createSyncEngine}=require('../beta45-offline-v2-sync');
const results=[];const mode=process.argv.includes('--baseline');
const {spawnSync}=require('child_process');
function restartProbe(rows){const p=spawnSync(process.execPath,[__filename,'--probe',JSON.stringify(rows.map(r=>[r.client_tx_id,r.status]))],{env:{...process.env,SHARAWLA_FIXTURE_REOPEN:work},encoding:'utf8',timeout:20000});assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout)}
function close(){for(const d of dbs.splice(0))d.close()}
async function test(name,fn){try{await fn();results.push({test:name,status:'PASS'})}catch(e){results.push({test:name,status:'FAIL',error:e.message});if(!mode)throw e}}
function ack(e,result){return {ok:true,acknowledged:true,client_tx_id:e.client_tx_id,protocol_version:2,payload_digest:e.payload_digest,server_event_id:'fixture-'+e.client_tx_id,server_entity_id:String(result.customer_id||result.address_id||result.return_id||result.order?.id),server_version:'fixture',result}}
function peer(){const receipts=new Map(),sent=[];return {receipts,sent,send:async e=>{sent.push(clone(e));const prior=receipts.get(e.client_tx_id);if(prior){assert.equal(prior.payload_digest,e.payload_digest);return {...prior,acknowledged:false,duplicate:true}}let id=100+receipts.size;const p=clone(e.payload.rpc_payload);if(p.p_customer_create_tx){assert(receipts.has(p.p_customer_create_tx));p.p_customer_id=receipts.get(p.p_customer_create_tx).result.customer_id}if(p.p_address_save_tx){assert(receipts.has(p.p_address_save_tx));p.p_address_id=receipts.get(p.p_address_save_tx).result.address_id}let result=e.operation_type==='customer_create'||e.operation_type==='customer_update'?{customer_id:p.p_customer_id||id}:e.operation_type.startsWith('customer_address')?{ok:true,address_id:p.p_address_id||id,customer_id:p.p_customer_id||100}:e.operation_type==='return'?{return_id:id}:{order:{...p.p_order,id,bon_number:p.p_order.bon_reservation?.bon_number||id,client_tx_id:e.client_tx_id},items:p.p_items};const a=ack(e,result);receipts.set(e.client_tx_id,a);return a}}}
function worker(s,p,clock=()=>Date.now()+10000){return createSyncEngine({store:s,transport:p,identityProvider:async()=>({device_fingerprint:'fixture-fp'}),clock,random:()=>.5,config:{retryDelaysMs:[1],jitterRatio:0,maxPerRun:200}})}
function routers(r){for(const f of ['permissions-v2-customers-create-routing.js','permissions-v2-customers-edit-address-routing.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),r.ctx);return {create:r.ctx.__SharawlaPV2CustomerCreate,edit:r.ctx.__SharawlaPV2CustomerEditAddress}}
async function run(){let s=native();await s.ready();let r=renderer(s),p=peer();const a=routers(r);
 const customer=await a.create.createCustomer({name:'Alice',phone:'01000000000'});assert(customer.startsWith('offline-customer-'));const ct=customer.slice('offline-customer-'.length);
 await test('Online customer create durably saves without cloud direct; exact native record and Outbox',async()=>{const row=await s.getOutbox(ct);assert.equal(row.status,'pending');assert(await s.getRecord(row.entity_type,row.local_entity_id));assert.equal(r.cloudDirect(),0)});
 await a.edit.updateCustomer({id:customer,name:'Alice updated',phone:'01000000000'});
 const address=await a.edit.saveAddress({customer_id:customer,label:'Home',address:'A'});
 const updatedAddress=await a.edit.saveAddress({id:address,customer_id:customer,label:'Updated',address:'B'});
 await test('Address update before ACK replaces parent local projection, no duplicate',async()=>{const rows=r.cache.get('customerAddressesCache');assert.equal(rows.length,1);assert.equal(rows[0].address,'B')});
 await a.edit.deleteAddress(updatedAddress);
 await test('Address delete before ACK hides every descendant local edit',async()=>{assert.equal((r.cache.get('customerAddressesCache')||[]).length,0)});
 const before=await s.listOutbox();close();
 await test('Fresh OS process restart BEFORE ACK preserves customer/address parent-child envelopes',async()=>{assert.equal(restartProbe(before).verified,5)});
 s=native();await s.ready();r=renderer(s);await r.transport.reconcileCompatibilityProjections();
 let lost=true;await worker(s,{send:async e=>{const a=await p.send(e);if(lost){lost=false;throw new Error('Failed to fetch fixture ACK loss')}return a}}).syncOnce();
 await test('ACK loss blocks customer descendants until exact parent replay',async()=>{assert.equal((await s.getOutbox(ct)).status,'retryable');assert.equal(p.receipts.size,1)});
 close();restartProbe(await (async()=>{const n=native();await n.ready();const rows=await n.listOutbox();close();return rows})());s=native();await s.ready();r=renderer(s);
 await worker(s,p,()=>Date.now()+3600000).syncOnce();
 await test('Reconnect/replay uses one receipt per TX, parent before child; original envelopes/digests immutable',async()=>{assert.equal(p.receipts.size,5);for(const row of before){const after=await s.getOutbox(row.client_tx_id);assert.equal(after.status,'synced');assert.equal(after.payload_digest,row.payload_digest);assert.deepEqual(clone(after.envelope.payload),clone(row.envelope.payload))}});
 await r.transport.reconcileCompatibilityProjections();
 await test('Customer create→update ACK reconciliation keeps latest data',async()=>{const rows=r.cache.get('customersCache');assert.equal(rows.length,1);assert.equal(rows[0].name,'Alice updated');assert.equal(rows[0]._offline,false)});
 await test('Address create→update→delete after ACK has no resurrection',async()=>{assert.equal((r.cache.get('customerAddressesCache')||[]).length,0)});
 close();s=native();await s.ready();r=renderer(s);await r.transport.reconcileCompatibilityProjections();
 await test('Cold renderer/native restart after ACK: address remains deleted',async()=>{assert.equal((r.cache.get('customerAddressesCache')||[]).length,0);assert.equal((await worker(s,p).syncOnce()).attempted,0)});
 // A server-order Return has no dependency; do not exercise/reopen local-parent rewrite.
 const rt=crypto.randomUUID(),rp=payload(rt);rp.p_order_id=543;rp.p_items=[{order_item_id:654,quantity:1}];await r.transport.commitRpcLocal('create_order_return_idempotent',rp);await worker(s,p).syncOnce();r=renderer(s);await r.transport.reconcileCompatibilityProjections();
 await test('Server-order Return survives cold projection reconciliation after ACK',async()=>{const rows=r.cache.get('cachedReturns:70007')||[];assert.equal(rows.length,1);assert.equal(rows[0].order_id,543);assert.equal(rows[0]._offline,false);assert.equal((await s.getOutbox(rt)).depends_on_tx_id,null)});
 r.cache.set('customersCache',[{id:200,name:'Unselected',phone:'01100000000'},{id:201,name:'Target',phone:'01200000000'}]);const updateTx=crypto.randomUUID();await r.transport.commitRpcLocal('offline_customer_update_v1',{p_customer_id:201,p_name:'Target updated',p_phone:'01200000000',p_client_tx_id:updateTx});
 await test('Server customer update cannot match an unrelated row through empty create-TX',async()=>{assert.equal(r.cache.get('customersCache').find(x=>x.id===200).name,'Unselected');assert.equal(r.cache.get('customersCache').find(x=>x.id===201).name,'Target updated')});
 // Reservation imported as a synthetic server grant. No device/activation service.
 // The shared helper supplies a separate API export extension for native reservation tests.
 if(!s.importBonReservation){results.push({test:'BON reservation tests',status:mode?'NOT RUN':'FAIL',error:'test fixture import hook missing'});if(!mode)throw new Error('fixture import hook missing')}
 else {
 await s.importBonReservation({reservation_uid:crypto.randomUUID(),business_id:'fixture-business',branch_id:70007,numbering_mode:'SHIFT',server_shift_id:42,shift_open_tx_id:'fixture-shift',device_fingerprint:'fixture-fp',start_bon:500,end_bon:530,status:'active'});
 r.cache.set('openShift:7:70007',{id:42,status:'open',client_tx_id:'fixture-shift'});
 const saleTx=crypto.randomUUID(),sp=payload(saleTx);await r.transport.commitRpcLocal('create_pos_order_atomic',sp);
 await r.transport.reconcileCompatibilityProjections();
 await test('Pending reserved BON remains exact after reconciliation (Online-first)',async()=>{const row=await s.getOutbox(saleTx),o=r.cache.get('cachedOrders').find(x=>x.order.client_tx_id===saleTx).order;assert.equal(row.envelope.payload.rpc_payload.p_order.bon_reservation.bon_number,500);assert.equal(o.bon_number,500);assert.equal(o._official_number_pending,false)});
 const sales=await Promise.all(Array.from({length:12},async()=>{const tx=crypto.randomUUID();const out=await r.transport.commitRpcLocal('create_pos_order_atomic',payload(tx));return out}));
 await test('Concurrent Online-first native sale commits consume distinct ascending reserved numbers atomically',async()=>{const rows=(await s.listOutbox()).filter(x=>x.operation_type==='sale');const nums=rows.map(x=>x.envelope.payload.rpc_payload.p_order.bon_reservation.bon_number);assert.deepEqual(nums,Array.from({length:13},(_,i)=>500+i));for(const row of rows){const record=await s.getRecord('order',row.local_entity_id);assert.equal(record.payload.bon_number,row.envelope.payload.rpc_payload.p_order.bon_reservation.bon_number)}});
 const saleRow=await s.getOutbox(saleTx);close();restartProbe([saleRow]);s=native();await s.ready();r=renderer(s);await r.transport.reconcileCompatibilityProjections();
 await test('Restart BEFORE sale ACK preserves reserved displayed identity',async()=>{assert.equal(r.cache.get('cachedOrders').find(x=>x.order.client_tx_id===saleTx).order.bon_number,500)});
 let saleAckLoss=true;await worker(s,{send:async e=>{const out=await p.send(e);if(e.client_tx_id===saleTx&&saleAckLoss){saleAckLoss=false;throw new Error('Failed to fetch ACK loss')}return out}}).syncOnce();
 await worker(s,p,()=>Date.now()+3600000).syncOnce();await r.transport.reconcileCompatibilityProjections();
 await test('BON ACK loss + replay + reconciliation keeps allocated number; no duplicates/OFF resurrection',async()=>{const row=await s.getOutbox(saleTx);assert.equal(row.status,'synced');assert.equal(row.server_ack.result.order.bon_number,500);const orders=r.cache.get('cachedOrders').filter(x=>x.order.client_tx_id===saleTx);assert.equal(orders.length,1);assert.equal(orders[0].order.bon_number,500);assert(!orders[0].order._offline)});
 const missing=ack(saleRow,{order:{id:999}});await test('Negative ACK: sale without canonical BON rejected',async()=>{assert.throws(()=>worker(s,p).validateAck(saleRow,missing),/canonical BON/)});
 const changed=ack(saleRow,{order:{id:999,bon_number:999}});await test('Negative ACK: changing reserved BON rejected',async()=>{assert.throws(()=>worker(s,p).validateAck(saleRow,changed),{code:'OFFLINE_V2_ACK_BON_MISMATCH'})});
 // Fresh renderer with no open-shift provenance receives the accepted OFF fallback.
 r=renderer(s);const unreserved=[];
 for(let i=0;i<3;i++){const tx=crypto.randomUUID();const out=await r.transport.commitRpcLocal('create_pos_order_atomic',payload(tx));assert(out.result.order._official_number_pending);unreserved.push(await s.getOutbox(tx));await worker(s,p).syncOnce()}
 await test('Consecutive Online-first unreserved sales reconcile canonical ACK numbers, no local counter invented',async()=>{const nums=[];for(const row of unreserved){assert(!row.envelope.payload.rpc_payload.p_order.bon_reservation);const after=await s.getOutbox(row.client_tx_id);assert.equal(after.status,'synced');nums.push(after.server_ack.result.order.bon_number)}assert(nums[1]>nums[0]&&nums[2]>nums[1])});
 await test('Negative ACK on actual UNRESERVED sale: missing BON cannot become synced',async()=>{assert.throws(()=>worker(s,p).validateAck(unreserved[0],ack(unreserved[0],{order:{id:999}})),{code:'OFFLINE_V2_ACK_BON_MISSING'})});
 const createRow=before[0],original=clone(createRow.envelope.payload.rpc_payload);
 await test('Customer exact duplicate TX is idempotent; changed payload rejected by actual native digest',async()=>{const one=await r.transport.commitRpcLocal('offline_customer_create_v1',original);assert(one.synced);await assert.rejects(()=>r.transport.commitRpcLocal('offline_customer_create_v1',{...original,p_name:'Tampered'}),{code:'OFFLINE_V2_TX_PAYLOAD_MISMATCH'})});
 await test('Negative native route: customer operation bound to wrong RPC rejected before durable commit',async()=>{const a=r.adapters.get('customer_update'),tx=crypto.randomUUID(),input=a.buildCommit({payload:payload(tx),clientTx:tx,identity:{device_id:'fixture-device',business_id:'fixture-business'},createdAt:new Date().toISOString()});input.payload.rpc_name='offline_customer_address_delete_v1';await assert.rejects(()=>s.commitOperation(input),{code:'OFFLINE_V2_INVALID_COMMIT'});assert.equal(await s.getOutbox(tx),null)});
 // Two independent real SQLite stores, synthetic disjoint server grants.
 const stores=[native(path.join(work,'device-a')),native(path.join(work,'device-b'))];await Promise.all(stores.map(x=>x.ready()));
 const rr=stores.map(renderer);for(let i=0;i<2;i++){await stores[i].importBonReservation({reservation_uid:crypto.randomUUID(),business_id:'fixture-business',branch_id:70007,numbering_mode:'SHIFT',server_shift_id:42,shift_open_tx_id:'fixture-shift',device_fingerprint:'fp-'+i,start_bon:1000+i*20,end_bon:1019+i*20,status:'active'});rr[i].ctx.loadLicenseState=async()=>({device_id:'device-'+i,business_id:'fixture-business',device_fingerprint:'fp-'+i});rr[i].cache.set('openShift:7:70007',{id:42,status:'open',client_tx_id:'fixture-shift'})}
 await Promise.all(rr.flatMap(x=>Array.from({length:10},()=>{const tx=crypto.randomUUID();return x.transport.commitRpcLocal('create_pos_order_atomic',payload(tx))})));
 await test('Two independent native stores consume disjoint grants concurrently without collision',async()=>{const rows=(await Promise.all(stores.map(x=>x.listOutbox()))).flat(),nums=rows.map(x=>x.envelope.payload.rpc_payload.p_order.bon_reservation.bon_number);assert.equal(nums.length,20);assert.equal(new Set(nums).size,20)});
 }
 const result={tests:results,sqlite:'REAL node:sqlite via callback adapter; actual native/worker/renderer source',server:'MOCK protocol peer, not PostgreSQL proof',device:'NOT RUN',fixture:work};fs.writeFileSync(process.env.SHARAWLA_BATCH1_RESULT||path.join(work,'batch1.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));close();
}
if(process.argv[2]==='--probe'){(async()=>{const s=native();await s.ready();const rows=JSON.parse(process.argv[3]);for(const [tx,status]of rows){const row=await s.getOutbox(tx);assert.equal(row.status,status);assert(await s.getRecord(row.entity_type,row.local_entity_id))}console.log(JSON.stringify({verified:rows.length}));close()})().catch(e=>{console.error(e);close();process.exitCode=1})}else run().catch(e=>{console.error(e);close();process.exitCode=1});
