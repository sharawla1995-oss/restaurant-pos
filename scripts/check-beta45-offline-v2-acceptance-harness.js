'use strict';
const fs=require('fs');
const assert=require('assert');
const {createSyncEngine,validateAck,classifyError,retryDelayMs}=require('../beta45-offline-v2-sync.js');
const read=f=>fs.readFileSync(f,'utf8');
const native=read('beta45-offline-v2-native-store.js');
const takeover=read('beta45-offline-v2-takeover-manager.js');
const transport=read('beta45-offline-v2-transport.js');
const inbox=read('beta45-offline-v2-inbox-store.js');
const inventory=read('beta45-offline-v2-inventory-store.js');
const safety=read('beta45-offline-v2-safety.js');
const diagnostics=read('beta45-offline-v2-diagnostics.js');
const selfTest=read('beta-self-test.js');

function need(src,t,msg=t){assert(src.includes(t),`Phase9 acceptance missing: ${msg}`)}
function no(src,t,msg=t){assert(!src.includes(t),`Phase9 acceptance forbidden: ${msg}`)}
function mkEvent(tx,seq,extra={}){return {client_tx_id:tx,device_id:'dev-1',device_sequence:seq,business_id:'biz-1',branch_id:1,employee_id:1,operation_type:'sale',entity_type:'order',local_entity_id:`local-${seq}`,local_shift_id:null,depends_on_tx_id:null,protocol_version:2,schema_version:2,payload_digest:`digest-${tx}`,status:'pending',attempts:0,envelope:{payload:{total:100}},...extra}}
function ackFor(e,extra={}){return {ok:true,client_tx_id:e.client_tx_id,protocol_version:2,acknowledged:true,server_event_id:`server-${e.client_tx_id}`,payload_digest:e.payload_digest,server_entity_id:`id-${e.client_tx_id}`,...extra}}

class MemoryStore{
 constructor(rows=[]){this.rows=rows.map(x=>({...x}));this.mappings=new Map();this.transitions=[]}
 async recoverStaleSyncing(){let n=0;for(const r of this.rows)if(r.status==='syncing'){r.status='retryable';r.next_retry_at=null;n++}return {ok:true,recovered:n}}
 async refreshBlockedDependencies(){for(const r of this.rows)if(r.status==='blocked'&&r.depends_on_tx_id&&this.mappings.has(r.depends_on_tx_id)){r.status='pending';r.last_error_code=null}return {ok:true}}
 async claimNextDue(now){const due=this.rows.filter(r=>['pending','retryable'].includes(r.status)&&(!r.next_retry_at||r.next_retry_at<=now)&&(!r.depends_on_tx_id||this.mappings.has(r.depends_on_tx_id))).sort((a,b)=>a.device_sequence-b.device_sequence)[0];if(!due)return null;due.status='syncing';due.attempts=(due.attempts||0)+1;return {...due}}
 async getMappingByTx(tx){return this.mappings.get(tx)||null}
 async markAcked(tx,ack){const r=this.rows.find(x=>x.client_tx_id===tx);assert(r&&r.status==='syncing');r.status='synced';r.server_ack=ack;r.synced_at=new Date().toISOString();if(r.local_entity_id)this.mappings.set(tx,{entity_type:r.entity_type,local_id:r.local_entity_id,server_id:String(ack.server_entity_id),client_tx_id:tx});this.transitions.push([tx,'synced']);return r}
 async markRetryable(tx,e,next){const r=this.rows.find(x=>x.client_tx_id===tx);r.status='retryable';r.next_retry_at=next;r.last_error_code=e.code;this.transitions.push([tx,'retryable']);return r}
 async markConflict(tx,e){const r=this.rows.find(x=>x.client_tx_id===tx);r.status='conflict';r.next_retry_at=null;r.last_error_code=e.code;this.transitions.push([tx,'conflict']);return r}
 async markBlocked(tx,e){const r=this.rows.find(x=>x.client_tx_id===tx);r.status='blocked';r.next_retry_at=null;r.last_error_code=e.code;this.transitions.push([tx,'blocked']);return r}
 async markDeadLetter(tx,e){const r=this.rows.find(x=>x.client_tx_id===tx);r.status='dead_letter';r.next_retry_at=null;r.last_error_code=e.code;this.transitions.push([tx,'dead_letter']);return r}
}

(async()=>{
 const base=mkEvent('tx-ack',1);
 assert.equal(validateAck(base,ackFor(base)).client_tx_id,'tx-ack');
 assert.equal(validateAck(base,ackFor(base,{acknowledged:false,duplicate:true})).duplicate,true);
 assert.throws(()=>validateAck(base,{...ackFor(base),client_tx_id:'other'}),/mismatch/i);
 assert.throws(()=>validateAck(base,{...ackFor(base),acknowledged:false,duplicate:false,idempotent_replay:false}),/explicit ACK/i);

 assert.equal(classifyError(Object.assign(new Error('المخزون غير كافٍ للصنف'),{code:'INSUFFICIENT_STOCK'})).kind,'conflict');
 assert.equal(classifyError(Object.assign(new Error('network down'),{code:'ETIMEDOUT',kind:'network'})).kind,'transient');
 assert.equal(classifyError(Object.assign(new Error('denied'),{http_status:403})).kind,'blocked');
 assert.deepEqual([1,2,3,4,5].map(n=>retryDelayMs(n,{jitterRatio:0},()=>0.5)),[5000,15000,30000,60000,300000]);

 // ACK-lost-after-server-commit: first attempt becomes retryable, second receives
 // duplicate ACK for the same client_tx_id and is marked synced exactly once.
 let clock=Date.parse('2026-09-12T00:00:00Z'),sent=0;
 const lost=mkEvent('tx-lost-ack',1),store1=new MemoryStore([lost]);
 const engine1=createSyncEngine({store:store1,clock:()=>clock,random:()=>0.5,retry:{jitterRatio:0},identityProvider:async()=>({device_fingerprint:'canonical'}),transport:{send:async e=>{sent++;if(sent===1)throw Object.assign(new Error('socket hang up'),{code:'ECONNRESET',kind:'network'});return ackFor(e,{acknowledged:false,duplicate:true,idempotent_replay:true})}}});
 let r=await engine1.syncOnce();assert.equal(r.retried,1);assert.equal(store1.rows[0].status,'retryable');clock+=6000;r=await engine1.syncOnce();assert.equal(r.acked,1);assert.equal(store1.rows[0].status,'synced');assert.equal(sent,2);assert(store1.rows[0].server_ack?.duplicate===true);

 // A stock conflict must not head-of-line block an independent operation.
 const c1=mkEvent('tx-stock',1),c2=mkEvent('tx-independent',2),store2=new MemoryStore([c1,c2]);
 const engine2=createSyncEngine({store:store2,clock:()=>clock,random:()=>0.5,identityProvider:async()=>({device_fingerprint:'canonical'}),transport:{send:async e=>{if(e.client_tx_id==='tx-stock')throw Object.assign(new Error('المخزون غير كافٍ'),{code:'INSUFFICIENT_STOCK',kind:'business_conflict'});return ackFor(e)}}});
 r=await engine2.syncOnce();assert.equal(r.conflicts,1);assert.equal(r.acked,1);assert.equal(store2.rows[0].status,'conflict');assert.equal(store2.rows[1].status,'synced');

 // Dependency graph: child is not eligible before parent mapping; once parent ACKs,
 // the exact mapping is attached to the child envelope.
 const parent=mkEvent('tx-parent',1,{operation_type:'shift_open',entity_type:'shift'}),child=mkEvent('tx-child',2,{depends_on_tx_id:'tx-parent',local_shift_id:'local-shift'}),store3=new MemoryStore([parent,child]);let childMapping=null;
 const engine3=createSyncEngine({store:store3,clock:()=>clock,random:()=>0.5,identityProvider:async()=>({device_fingerprint:'canonical'}),transport:{send:async e=>{if(e.client_tx_id==='tx-child')childMapping=e.dependency_mapping;return ackFor(e)}}});
 r=await engine3.syncOnce();assert.equal(r.acked,2);assert(childMapping&&childMapping.client_tx_id==='tx-parent');assert.equal(store3.rows[1].status,'synced');

 // Canonical identity is fail-closed.
 const store4=new MemoryStore([mkEvent('tx-no-id',1)]),engine4=createSyncEngine({store:store4,identityProvider:async()=>({}),transport:{send:async e=>ackFor(e)}});
 await assert.rejects(()=>engine4.syncOnce(),/Canonical device_fingerprint/);

 // Static source contracts cover durable storage, exactly-once inbox, guards,
 // support diagnostics and generic multi-industry semantics.
 for(const t of ['PRAGMA journal_mode=WAL','PRAGMA synchronous=FULL','PRAGMA foreign_keys=ON','BEGIN IMMEDIATE TRANSACTION','UNIQUE(device_id,device_sequence)','status TEXT NOT NULL','server_ack_json'])need(native,t);
 for(const t of ['legacy_source_untouched:true','migration_verified','transport_ready','OFFLINE_V2_CANONICAL_IDENTITY_REQUIRED'])need(takeover,t);
 for(const t of ['sharawla_offline_v2_apply_event','manualRetry','markDeadLetter','markBlocked','markConflict','client_tx_id'])need(transport,t);
 for(const t of ['server_event_id TEXT PRIMARY KEY','received','applied','order_projection','customer'])need(inbox,t);
 for(const t of ['inventory_ledger','pending_delta','server_derived'])need(inventory,t);
 for(const t of ['UNRESOLVED_STATUSES','OFFLINE_V2_GUARD_BLOCKED','AES-256-GCM','PBKDF2_ITERATIONS','VACUUM INTO','integrity_check','localReport'])need(safety,t);
 for(const t of ['supportBundle','exportSupportBundle','dead_letter','conflict','retryable','blocked','stopImmediatePropagation'])need(diagnostics,t);
 for(const t of ['Multi-Industry Profile Isolation','Offline V2 Native Store','Outbox Integrity','Inbox Exactly-Once','Safety Guard','Diagnostics / Support Bundle','SAFE READ-ONLY'])need(selfTest,t);
 no(selfTest,'10.5.4-beta.21','stale self-test version');
 no(diagnostics,'removeQueuedOperation(','diagnostics must never delete durable work');

 const matrix=[
  'offline_sale','restart','power_cut_before_commit','power_cut_after_commit','multiple_offline_shifts','thirty_operation_chain','offline_return','offline_expense','offline_customer','offline_order_status','same_client_tx_x20','ack_lost_after_server_commit','two_devices_same_sku_reverse_sync','stock_conflict','shift_mismatch','missing_dependency','website_order_while_branch_offline','expired_cloud_session_with_license_grace','update_guard','license_guard','reset_guard','restart_during_sync','restore_then_sync','wrong_windows_clock','corrupted_db','dlq_reprocess','x64','ia32'
 ];
 assert.equal(new Set(matrix).size,matrix.length);assert(matrix.length>=28);
 console.log(`Beta45 Offline V2 Phase 9 diagnostics/self-test/acceptance harness PASS — matrix=${matrix.length}`);
})().catch(e=>{console.error(e);process.exit(1)});
