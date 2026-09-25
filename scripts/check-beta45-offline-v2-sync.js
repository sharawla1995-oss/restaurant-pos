'use strict';
const fs=require('fs');
const assert=require('assert');
const {createSyncEngine}=require('../beta45-offline-v2-sync.js');

const read=p=>fs.readFileSync(p,'utf8');
const syncSource=read('beta45-offline-v2-sync.js');
const storeSource=read('beta45-offline-v2-native-store.js');
const need=(src,t,msg=t)=>{if(!src.includes(t))throw new Error(`Beta45 Phase 3 gate missing: ${msg}`)};

for(const token of [
  'OFFLINE_V2_ACK_TX_MISMATCH','OFFLINE_V2_ACK_PAYLOAD_MISMATCH','OFFLINE_V2_ACK_NOT_EXPLICIT',
  'device_fingerprint','dependency_mapping','recoverStale','markConflict','markRetryable','markAcked',
  'retryDelayMs','idempotent_replay'
])need(syncSource,token);
for(const token of [
  'claimNextDue','recoverStaleSyncing','getMappingByTx','markAckedUnsafe','markRetryableUnsafe','markConflictUnsafe',
  "status='syncing'","status='retryable'","status='conflict'","status='synced'",'server_ack_json',
  'offline_v2_inbox','server_entity_id','payload digest mismatch','offline-v2:sync-stats'
])need(storeSource,token);
if(syncSource.includes('supabase.')||syncSource.includes('fetch('))throw new Error('Phase 3 sync protocol must stay transport-injected/shadow-only');
for(const forbidden of ["odbSet('queue',[])",'removeQueuedOperation(','DELETE FROM local_operations','DROP TABLE local_operations']){
  if(storeSource.toLowerCase().includes(forbidden.toLowerCase()))throw new Error(`Phase 3 touched legacy source: ${forbidden}`);
}

const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
class MemoryStore{
  constructor(rows=[]){this.rows=rows.map(clone);this.mappings=[];this.inbox=[]}
  byTx(tx){return this.rows.find(r=>r.client_tx_id===tx)}
  async recoverStaleSyncing(cutoff,now){let recovered=0;for(const r of this.rows){if(r.status==='syncing'&&(!r.last_attempt_at||r.last_attempt_at<=cutoff)){r.status='retryable';r.next_retry_at=now;r.last_error_code='OFFLINE_V2_STALE_IN_FLIGHT';recovered++}}return{ok:true,recovered}}
  async claimNextDue(now){
    const rows=this.rows.filter(r=>['pending','retryable'].includes(r.status)&&(!r.next_retry_at||r.next_retry_at<=now)&&(!r.depends_on_tx_id||this.byTx(r.depends_on_tx_id)?.status==='synced')).sort((a,b)=>a.device_sequence-b.device_sequence);
    const r=rows[0];if(!r)return null;r.status='syncing';r.attempts=(r.attempts||0)+1;r.last_attempt_at=now;r.next_retry_at=null;return clone(r);
  }
  async getMappingByTx(tx){return clone(this.mappings.find(m=>m.client_tx_id===tx)||null)}
  async markRetryable(tx,e,next){const r=this.byTx(tx);assert.equal(r.status,'syncing');r.status='retryable';r.last_error_code=e.code;r.last_error_message=e.message;r.next_retry_at=next;return clone(r)}
  async markConflict(tx,e){const r=this.byTx(tx);assert.equal(r.status,'syncing');r.status='conflict';r.last_error_code=e.code;r.last_error_message=e.message;r.next_retry_at=null;return clone(r)}
  async markAcked(tx,ack){const r=this.byTx(tx);assert.equal(r.status,'syncing');r.status='synced';r.server_ack=clone(ack);r.synced_at='SERVER-ACKED';if(!this.inbox.some(x=>x.server_event_id===ack.server_event_id))this.inbox.push(clone(ack));if(r.local_entity_id)this.mappings.push({entity_type:r.entity_type,local_id:r.local_entity_id,server_id:String(ack.server_entity_id),client_tx_id:tx,server_version:ack.server_version||null});return clone(r)}
}
function event(tx,seq,extra={}){
  const base={client_tx_id:tx,device_id:'dev-7',device_sequence:seq,business_id:'biz-test',branch_id:1,employee_id:3,operation_type:'sale',entity_type:'order',local_entity_id:`local-${tx}`,local_shift_id:null,depends_on_tx_id:null,created_local_at:'2026-09-12T17:00:00.000Z',protocol_version:2,schema_version:2,status:'pending',attempts:0,last_attempt_at:null,next_retry_at:null,payload_digest:`digest-${tx}`,payload:{total:100}};
  const row={...base,...extra};row.envelope={...base,...extra};return row;
}
function ackFor(outbound,extra={}){return {ok:true,acknowledged:true,duplicate:false,client_tx_id:outbound.client_tx_id,protocol_version:2,payload_digest:outbound.payload_digest,server_event_id:`ack-${outbound.client_tx_id}`,server_entity_id:`server-${outbound.client_tx_id}`,server_version:'v1',...extra}}
function engine(store,transport,clockRef,random=()=>0.5,identity=async()=>({device_fingerprint:'canonical-fp-0007'})){
  return createSyncEngine({store,transport,clock:()=>clockRef.now,random,identityProvider:identity,retry:{baseRetryMs:1000,maxRetryMs:8000,jitterRatio:0,staleInFlightMs:5000}});
}

(async()=>{
  // 1. Happy path: HTTP is irrelevant; only an exact structured ACK may sync.
  {
    const clock={now:100000};const store=new MemoryStore([event('tx-happy',1)]);let sent;
    const e=engine(store,{send:async x=>(sent=clone(x),ackFor(x))},clock);
    const r=await e.syncOnce();
    assert.equal(r.acked,1);assert.equal(store.byTx('tx-happy').status,'synced');assert.equal(sent.device_fingerprint,'canonical-fp-0007');assert.equal(store.inbox.length,1);assert.equal(store.mappings[0].server_id,'server-tx-happy');
  }

  // 2. Mismatched/malformed ACK is never treated as synced.
  {
    const clock={now:200000};const store=new MemoryStore([event('tx-bad-ack',1)]);
    const e=engine(store,{send:async x=>ackFor(x,{client_tx_id:'wrong-tx'})},clock);
    const r=await e.syncOnce();const row=store.byTx('tx-bad-ack');
    assert.equal(r.protocol_errors,1);assert.equal(row.status,'retryable');assert.equal(row.last_error_code,'OFFLINE_V2_ACK_TX_MISMATCH');assert.equal(row.server_ack,undefined);
  }

  // 3. Server commits, reply is lost, retry uses the same client_tx_id and the
  // server can return a duplicate/idempotent ACK without a second mutation.
  {
    const clock={now:300000};const store=new MemoryStore([event('tx-lost-reply',1)]);const committed=new Set();let calls=0;
    const transport={send:async x=>{calls++;if(!committed.has(x.client_tx_id)){committed.add(x.client_tx_id);const er=new Error('reply lost after commit');er.code='ECONNRESET';throw er}return ackFor(x,{acknowledged:false,duplicate:true,idempotent_replay:true})}};
    const e=engine(store,transport,clock);
    let r=await e.syncOnce();assert.equal(r.retried,1);assert.equal(store.byTx('tx-lost-reply').status,'retryable');assert.equal(committed.size,1);
    clock.now+=1001;r=await e.syncOnce();assert.equal(r.acked,1);assert.equal(store.byTx('tx-lost-reply').status,'synced');assert.equal(calls,2);assert.equal(committed.size,1);
  }

  // 4. Permanent stock/business conflict stops automatic retries but does not
  // head-of-line block an unrelated operation.
  {
    const clock={now:400000};const a=event('tx-stock',1);const b=event('tx-independent',2);const store=new MemoryStore([a,b]);let stockCalls=0;
    const e=engine(store,{send:async x=>{if(x.client_tx_id==='tx-stock'){stockCalls++;const er=new Error('المخزون غير كافٍ للصنف');er.code='INSUFFICIENT_STOCK';er.kind='business_conflict';throw er}return ackFor(x)}},clock);
    const r=await e.syncOnce();assert.equal(r.conflicts,1);assert.equal(r.acked,1);assert.equal(store.byTx('tx-stock').status,'conflict');assert.equal(store.byTx('tx-independent').status,'synced');
    await e.syncOnce();assert.equal(stockCalls,1);
  }

  // 5. Transient error is backoff scheduled and cannot hammer in a tight loop.
  {
    const clock={now:500000};const store=new MemoryStore([event('tx-timeout',1)]);let calls=0;
    const e=engine(store,{send:async()=>{calls++;const er=new Error('timeout');er.code='ETIMEDOUT';throw er}},clock);
    let r=await e.syncOnce();assert.equal(r.retried,1);assert.equal(calls,1);const due=Date.parse(store.byTx('tx-timeout').next_retry_at);assert(due>clock.now);
    r=await e.syncOnce();assert.equal(r.attempted,0);assert.equal(calls,1);
  }

  // 6. Child stays blocked until parent ACK creates local->server mapping, then
  // dependency mapping is injected into the child outbound envelope.
  {
    const clock={now:600000};const parent=event('tx-parent',1,{operation_type:'shift_open',entity_type:'shift',local_entity_id:'offline-shift-1'});const child=event('tx-child',2,{depends_on_tx_id:'tx-parent',local_shift_id:'offline-shift-1'});const store=new MemoryStore([parent,child]);const sent=[];
    const e=engine(store,{send:async x=>{sent.push(clone(x));return ackFor(x,{server_entity_id:x.client_tx_id==='tx-parent'?'77':'88'})}},clock);
    const r=await e.syncOnce();assert.equal(r.acked,2);assert.equal(sent[0].client_tx_id,'tx-parent');assert.equal(sent[1].client_tx_id,'tx-child');assert.equal(sent[1].dependency_mapping.server_id,'77');
  }

  // 7. App/restart stale in-flight work is recovered and safely retried.
  {
    const clock={now:700000};const stale=event('tx-stale',1,{status:'syncing',attempts:1,last_attempt_at:new Date(clock.now-10000).toISOString()});const store=new MemoryStore([stale]);
    const e=engine(store,{send:async x=>ackFor(x)},clock);const r=await e.syncOnce();assert.equal(r.acked,1);assert.equal(store.byTx('tx-stale').attempts,2);assert.equal(store.byTx('tx-stale').status,'synced');
  }

  // 8. Canonical fingerprint is fail-closed. No fallback identity is invented.
  {
    const clock={now:800000};const store=new MemoryStore([event('tx-no-fp',1)]);const e=engine(store,{send:async x=>ackFor(x)},clock,()=>0.5,async()=>({device_fingerprint:''}));
    await assert.rejects(()=>e.syncOnce(),x=>x&&x.code==='OFFLINE_V2_CANONICAL_FINGERPRINT_REQUIRED');assert.equal(store.byTx('tx-no-fp').status,'pending');
  }

  console.log('Beta45 Offline V2 Phase 3 explicit ACK / idempotent sync gate PASS');
})().catch(e=>{console.error(e);process.exit(1)});
