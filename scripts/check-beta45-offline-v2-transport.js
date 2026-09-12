'use strict';
const fs=require('fs');
const assert=require('assert');
const vm=require('vm');
const {createSyncEngine,retryDelayMs,classifyError}=require('../beta45-offline-v2-sync.js');

const read=p=>fs.readFileSync(p,'utf8');
const syncSource=read('beta45-offline-v2-sync.js');
const transportSource=read('beta45-offline-v2-transport.js');
const runtimeSource=read('beta45-offline-v2-transport-runtime.js');
const preloadSource=read('preload.js');
const mainSource=read('main-beta44.js');
const sqlSource=read('supabase-beta45-offline-v2-transport-v1.sql');
const need=(src,t,msg=t)=>{if(!src.includes(t))throw new Error(`Beta45 Phase 5 gate missing: ${msg}`)};
const forbid=(src,t,msg=t)=>{if(src.includes(t))throw new Error(`Beta45 Phase 5 gate forbidden: ${msg}`)};

// Compile the new Phase 5 sources in CI even though runtime syntax checker is
// intentionally frozen around older production files.
new Function(transportSource);new Function(runtimeSource);

for(const t of ['retryDelaysMs','maxProtocolAttempts','maxTransientAttempts','markBlocked','markDeadLetter','OFFLINE_V2_DEPENDENCY_MAPPING_MISSING'])need(syncSource,t);
for(const t of ['sharawla_offline_v2_apply_event','sharawla_offline_v2_transport_info','offline-v2:event','offline-v2:sync-now','offline-v2:manual-retry','offline-v2:transport-attest','OFFLINE_V2_LEGACY_AUTHORITY_ACTIVE','employee_id=?','device_id=?','business_id=?','recoverStaleScoped','status=\'syncing\''])need(transportSource,t);
for(const t of ['create_food_pos_order_atomic_v1','create_food_retail_pos_order_atomic_v1','create_retail_variant_pos_order_atomic_v1','create_food_order_return_idempotent_v1','create_retail_variant_order_return_idempotent_v1','rpc_name','rpc_payload','depends_on_tx_id','transportAttest','manualRetry','authoritativeRpc','ensureEvent','OFFLINE_V2_LEGACY_AUTHORITY_ACTIVE','networkDeferred','unwrapResult','bridge.rpc(name,payload)','rpc=authoritativeRpc'])need(runtimeSource,t);
for(const t of ['event:tx=>ipcRenderer.invoke','syncNow:x=>ipcRenderer.invoke','manualRetry:x=>ipcRenderer.invoke','transportAttest:x=>ipcRenderer.invoke','data-offline-v2-phase5'])need(preloadSource,t);
need(mainSource,"require('./beta45-offline-v2-transport.js').installOfflineV2Transport(offlineV2Store)");
for(const t of ['offline_v2_server_receipts','enable row level security','security definer','sharawla_offline_v2_apply_event','sharawla_offline_v2_transport_info','authenticated','client_tx_id','payload_digest','server_event_id','idempotent_replay','operation/RPC binding','RPC client_tx_id mismatch','device_sequence is distinct from v_sequence'])need(sqlSource,t);
for(const rpc of [
 'create_pos_order_atomic','create_retail_pos_order_atomic','create_retail_variant_pos_order_atomic_v1','create_food_pos_order_atomic_v1','create_food_retail_pos_order_atomic_v1',
 'create_order_return_idempotent','create_retail_order_return_idempotent','create_retail_variant_order_return_idempotent_v1','create_food_order_return_idempotent_v1','create_food_retail_order_return_idempotent_v1',
 'create_pos_expense_idempotent','open_pos_shift_idempotent','close_pos_shift_idempotent'
])need(sqlSource,rpc,`server whitelist ${rpc}`);
forbid(sqlSource,'execute format(','dynamic SQL must not dispatch Offline V2 events');
forbid(transportSource,'service_role','transport must never carry service-role credentials');
forbid(transportSource,'xihcxydjnzemflhedzor','transport must be tenant-configured, not hardcoded to test backend');
forbid(runtimeSource,'.activate()','renderer transport must never auto-activate takeover');
forbid(runtimeSource,'.attestTransport()','renderer transport must never auto-attest itself');

assert.equal(retryDelayMs(1,{jitterRatio:0}),5000);
assert.equal(retryDelayMs(2,{jitterRatio:0}),15000);
assert.equal(retryDelayMs(3,{jitterRatio:0}),30000);
assert.equal(retryDelayMs(4,{jitterRatio:0}),60000);
assert.equal(retryDelayMs(5,{jitterRatio:0}),300000);
assert.equal(retryDelayMs(99,{jitterRatio:0}),300000);
assert.equal(classifyError(Object.assign(new Error('unauthorized'),{http_status:401})).kind,'blocked');
assert.equal(classifyError(Object.assign(new Error('المخزون غير كافٍ للصنف 2'),{code:'P0001'})).kind,'conflict');
assert.equal(classifyError(Object.assign(new Error('bad event'),{code:'22023',http_status:400})).kind,'permanent');

const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
class MemoryStore{
  constructor(rows=[]){this.rows=rows.map(clone);this.mappings=[]}
  row(tx){return this.rows.find(x=>x.client_tx_id===tx)}
  async recoverStaleSyncing(){return {ok:true,recovered:0}}
  async refreshBlockedDependencies(){return {ok:true,resumed:0}}
  async claimNextDue(now){const r=this.rows.find(x=>['pending','retryable'].includes(x.status)&&(!x.next_retry_at||x.next_retry_at<=now));if(!r)return null;r.status='syncing';r.attempts=(r.attempts||0)+1;return clone(r)}
  async getMappingByTx(tx){return clone(this.mappings.find(x=>x.client_tx_id===tx)||null)}
  async markRetryable(tx,e,next){const r=this.row(tx);r.status='retryable';r.last_error_code=e.code;r.next_retry_at=next;return clone(r)}
  async markConflict(tx,e){const r=this.row(tx);r.status='conflict';r.last_error_code=e.code;return clone(r)}
  async markBlocked(tx,e){const r=this.row(tx);r.status='blocked';r.last_error_code=e.code;return clone(r)}
  async markDeadLetter(tx,e){const r=this.row(tx);r.status='dead_letter';r.last_error_code=e.code;return clone(r)}
  async markAcked(tx,ack){const r=this.row(tx);r.status='synced';r.server_ack=clone(ack);if(r.local_entity_id)this.mappings.push({entity_type:r.entity_type,local_id:r.local_entity_id,server_id:String(ack.server_entity_id),client_tx_id:tx});return clone(r)}
}
function row(tx,attempts=0,extra={}){return {client_tx_id:tx,device_id:'dev7',device_sequence:1,business_id:'biz',branch_id:1,employee_id:3,operation_type:'sale',entity_type:'order',local_entity_id:`offline-${tx}`,protocol_version:2,schema_version:2,status:'pending',attempts,payload_digest:`digest-${tx}`,envelope:{payload:{rpc_name:'create_pos_order_atomic',rpc_payload:{}}},...extra}}
function ack(x){return {ok:true,acknowledged:true,client_tx_id:x.client_tx_id,protocol_version:2,payload_digest:x.payload_digest,server_event_id:`evt-${x.client_tx_id}`,server_entity_id:`srv-${x.client_tx_id}`}}
function engine(store,send){return createSyncEngine({store,transport:{send},identityProvider:async()=>({device_fingerprint:'canonical'}),random:()=>0.5,clock:()=>1000000});}

function rendererHarness(){
  let active=true,legacyCalls=0,syncCalls=0;const rows=new Map();
  const ctx={console,Date,JSON,Number,String,Math,Map,Set,Error,TypeError,Promise,URL,crypto:{randomUUID:()=>`tx-${Date.now()}`},setTimeout:(fn)=>{fn();return 1},setInterval:()=>1,clearInterval:()=>{},navigator:{onLine:true},document:{readyState:'complete',addEventListener:()=>{}},addEventListener:()=>{},localStorage:{getItem:k=>k==='sharawlaBusinessConnectionV1'?JSON.stringify({url:'https://tenant.supabase.co',key:'pub'}):null},session:{access_token:'jwt'},state:{activeBranchId:1,employee:{id:3}},currentBranchId:()=>1,isRetailProfile:()=>false,refreshSessionIfNeeded:async()=>{},loadLicenseState:async()=>({device_id:'dev7',business_id:'biz',device_fingerprint:'fp'}),saveOfflineExpense:async(...args)=>({fallback:'expense',args}),saveOfflineShiftOpen:async(...args)=>({fallback:'shift',args}),saveOfflineReturn:async(...args)=>({fallback:'return',args}),saveOfflineShiftClose:async(...args)=>({fallback:'close',args})};
  ctx.rpc=async(name,payload)=>{legacyCalls++;return {legacy:true,name,payload}};
  ctx.SharawlaOfflineV2Takeover={registerOperation:()=>true};
  ctx.topBurgerDesktop={offlineV2:{
    takeoverState:async()=>({active,migration_verified:true,transport_ready:true}),
    event:async tx=>clone(rows.get(tx)||null),
    commitOperation:async commit=>{rows.set(commit.client_tx_id,{...clone(commit),status:'pending',attempts:0,server_ack:null});return {ok:true,durable:true}},
    syncNow:async()=>{syncCalls++;return {ok:true}},manualRetry:async()=>({ok:true}),transportAttest:async()=>({ok:true})
  }};
  ctx.window=ctx;vm.runInNewContext(runtimeSource,ctx,{filename:'beta45-offline-v2-transport-runtime.js'});
  return {ctx,rows,setActive:v=>{active=v},legacyCalls:()=>legacyCalls,syncCalls:()=>syncCalls};
}

(async()=>{
  {const s=new MemoryStore([row('auth')]);const e=engine(s,async()=>{throw Object.assign(new Error('JWT expired'),{http_status:401,code:'JWT_EXPIRED'})});const r=await e.syncOnce();assert.equal(r.blocked,1);assert.equal(s.row('auth').status,'blocked')}
  {const s=new MemoryStore([row('bad-contract')]);const e=engine(s,async()=>{throw Object.assign(new Error('unsupported rpc'),{http_status:400,code:'22023'})});const r=await e.syncOnce();assert.equal(r.dead_letters,1);assert.equal(s.row('bad-contract').status,'dead_letter')}
  {const s=new MemoryStore([row('bad-ack',4)]);const e=engine(s,async x=>({...ack(x),client_tx_id:'wrong'}));const r=await e.syncOnce();assert.equal(r.protocol_errors,1);assert.equal(r.dead_letters,1);assert.equal(s.row('bad-ack').status,'dead_letter')}
  {const a=row('stock');const b={...row('ok'),device_sequence:2};const s=new MemoryStore([a,b]);const e=engine(s,async x=>{if(x.client_tx_id==='stock')throw Object.assign(new Error('المخزون غير كافٍ للصنف 2'),{code:'P0001',http_status:400});return ack(x)});const r=await e.syncOnce();assert.equal(r.conflicts,1);assert.equal(r.acked,1);assert.equal(s.row('stock').status,'conflict');assert.equal(s.row('ok').status,'synced')}
  {const parent=row('parent',0,{status:'synced',operation_type:'shift_open',entity_type:'shift',local_entity_id:'offline-shift-parent'});const child=row('child',0,{depends_on_tx_id:'parent',local_shift_id:'offline-shift-parent'});const s=new MemoryStore([parent,child]);const e=engine(s,async x=>ack(x));const r=await e.syncOnce();assert.equal(r.blocked,1);assert.equal(s.row('child').status,'blocked');assert.equal(s.row('child').last_error_code,'OFFLINE_V2_DEPENDENCY_MAPPING_MISSING')}

  // When takeover is active, a synced V2 event returns its ACK result and MUST
  // NOT call the captured legacy operational RPC.
  {const h=rendererHarness(),tx='tx-authority';h.rows.set(tx,{client_tx_id:tx,status:'synced',server_ack:{result:{order:{id:77},items:[]}}});const out=await h.ctx.SharawlaOfflineV2Transport.authoritativeRpc('create_pos_order_atomic',{p_order:{client_tx_id:tx,branch_id:1,employee_id:3},p_items:[],p_payments:[]});assert.equal(out.order.id,77);assert.equal(h.legacyCalls(),0)}
  // Inactive mode stays completely backward compatible and delegates once.
  {const h=rendererHarness();h.setActive(false);const out=await h.ctx.SharawlaOfflineV2Transport.authoritativeRpc('create_pos_order_atomic',{p_order:{client_tx_id:'tx-off'}});assert.equal(out.legacy,true);assert.equal(h.legacyCalls(),1)}
  // Active pending work never falls through to the legacy server RPC; it returns
  // the network-shaped signal used by existing local-success branches.
  {const h=rendererHarness(),tx='tx-pending';h.rows.set(tx,{client_tx_id:tx,status:'pending'});let e=null;try{await h.ctx.SharawlaOfflineV2Transport.authoritativeRpc('create_pos_order_atomic',{p_order:{client_tx_id:tx,branch_id:1,employee_id:3}})}catch(x){e=x}assert(e);assert.equal(e.message,'Failed to fetch');assert.equal(h.legacyCalls(),0);assert.equal(h.syncCalls(),1)}
  // Return callers receive the original bigint-shaped contract after explicit ACK.
  {const h=rendererHarness(),tx='tx-return';h.rows.set(tx,{client_tx_id:tx,status:'synced',server_ack:{result:{return_id:91}}});const out=await h.ctx.SharawlaOfflineV2Transport.authoritativeRpc('create_order_return_idempotent',{p_order_id:39,p_client_tx_id:tx});assert.equal(out,91);assert.equal(h.legacyCalls(),0)}
  // Legacy-preserved migration shadows can never be stolen by V2 transport.
  {const h=rendererHarness(),tx='tx-legacy';h.rows.set(tx,{client_tx_id:tx,status:'blocked',last_error_code:'OFFLINE_V2_LEGACY_PRESERVED',last_error_message:'legacy authority'});let e=null;try{await h.ctx.SharawlaOfflineV2Transport.authoritativeRpc('create_pos_order_atomic',{p_order:{client_tx_id:tx,branch_id:1,employee_id:3}})}catch(x){e=x}assert(e);assert.equal(e.code,'OFFLINE_V2_LEGACY_AUTHORITY_ACTIVE');assert.equal(h.legacyCalls(),0);assert.equal(h.syncCalls(),0)}

  console.log('Beta45 Offline V2 Phase 5 authoritative transport / conflict / retry / DLQ gate PASS');
})().catch(e=>{console.error(e);process.exit(1)});
