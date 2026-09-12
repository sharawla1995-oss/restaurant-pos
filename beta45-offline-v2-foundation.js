(function(global){
'use strict';

// Sharawla Offline Engine V2 — Phase 1 foundation.
// This layer is intentionally shadow-only: it defines the durable contract and
// a copy+verify legacy migration, but it does NOT replace Beta43 sync yet.
const VERSION='10.5.4-beta.45-dev';
const PROTOCOL_VERSION=2;
const SCHEMA_VERSION=2;
const FOUNDATION_MODE='shadow-foundation';

const STATUS=Object.freeze({
  PENDING:'pending',
  SYNCING:'syncing',
  RETRYABLE:'retryable',
  BLOCKED:'blocked',
  CONFLICT:'conflict',
  DEAD_LETTER:'dead_letter',
  SYNCED:'synced'
});
const STATUS_SET=new Set(Object.values(STATUS));

const KEYS=Object.freeze({
  META:'offlineV2:meta',
  OUTBOX:'offlineV2:outbox',
  INBOX:'offlineV2:inbox',
  MAPPINGS:'offlineV2:mappings',
  MIGRATION:'offlineV2:migration:legacyQueue:v1',
  SEQUENCE_PREFIX:'offlineV2:sequence:'
});

function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function asText(v){return String(v??'').trim()}
function asNumber(v,fallback=0){const n=Number(v);return Number.isFinite(n)?n:fallback}
function nowIso(){return new Date().toISOString()}
function localRecord(job){return job?.local_order||job?.local_shift||job?.local_return||job?.local_expense||job?.local_customer||job?.local_inventory_movement||{}}
function operationEntity(type){
  return ({sale:'order',return:'return',expense:'expense',shift_open:'shift',shift_close:'shift',customer_create:'customer',inventory_movement:'inventory_movement',order_status:'order_event'}[type]||type||'operation');
}
function localEntityId(job){
  const local=localRecord(job);
  return asText(local?.id||job?.local_shift_id||job?.local_order_id||job?.local_id||'');
}
function legacyStatus(job){
  const s=asText(job?._sync?.status).toLowerCase();
  if(s==='blocked')return STATUS.BLOCKED;
  if(s==='failed')return STATUS.RETRYABLE;
  if(s==='synced')return STATUS.SYNCED;
  return STATUS.PENDING;
}
function referencedShiftId(job){
  return asText(job?.type==='sale'?job?.p_order?.shift_id:(job?.p_shift_id||localRecord(job)?.shift_id));
}
function dependencyTxForLegacy(job,legacyQueue){
  const shiftId=referencedShiftId(job);
  if(!shiftId||!shiftId.startsWith('offline-shift-'))return null;
  const parent=(legacyQueue||[]).find(x=>x?.type==='shift_open'&&asText(x?.local_shift_id||x?.local_shift?.id)===shiftId);
  return parent?.client_tx_id?asText(parent.client_tx_id):null;
}
async function licenseIdentity(){
  try{
    if(typeof loadLicenseState==='function'){
      const st=await loadLicenseState();
      return {device_id:asText(st?.device_id),business_id:asText(st?.business_id)};
    }
  }catch{}
  return {device_id:'',business_id:''};
}
function runtimeScope(job,identity){
  const local=localRecord(job);
  let runtimeBusiness='';let runtimeEmployee=0;let runtimeBranch=0;
  try{runtimeBusiness=asText(typeof state!=='undefined'&&state?.business?.id)}catch{}
  try{runtimeEmployee=asNumber(typeof state!=='undefined'&&state?.employee?.id)}catch{}
  try{runtimeBranch=asNumber(typeof currentBranchId==='function'?currentBranchId():0)}catch{}
  return {
    device_id:asText(identity?.device_id),
    business_id:asText(job?._scope?.business_id||identity?.business_id||runtimeBusiness),
    branch_id:asNumber(job?._scope?.branch_id||job?.p_branch_id||job?.p_order?.branch_id||local?.branch_id||runtimeBranch),
    employee_id:asNumber(job?._scope?.employee_id||job?.p_order?.employee_id||local?.employee_id||runtimeEmployee)
  };
}
function sequenceKey(deviceId){return `${KEYS.SEQUENCE_PREFIX}${asText(deviceId)||'unknown'}`}
async function getArray(key){const v=await global.odbGet(key);return Array.isArray(v)?v:[]}
async function setArray(key,v){if(!Array.isArray(v))throw new Error(`${key} must be an array`);await global.odbSet(key,v);return v}
async function nextDeviceSequence(deviceId){
  const key=sequenceKey(deviceId);const current=asNumber(await global.odbGet(key),0);const next=current+1;
  await global.odbSet(key,next);return next;
}
async function ensureSequenceAtLeast(deviceId,n){
  const key=sequenceKey(deviceId);const current=asNumber(await global.odbGet(key),0);const target=Math.max(current,asNumber(n,0));
  if(target!==current)await global.odbSet(key,target);return target;
}

function requiredEnvelopeFields(){return ['client_tx_id','device_id','business_id','branch_id','employee_id','operation_type','entity_type','created_local_at','protocol_version','schema_version','status','device_sequence']}
function validateEvent(event){
  const errors=[];
  for(const k of requiredEnvelopeFields()){
    if(event?.[k]===undefined||event?.[k]===null||event?.[k]==='')errors.push(`missing:${k}`);
  }
  if(!STATUS_SET.has(event?.status))errors.push('invalid:status');
  if(asNumber(event?.device_sequence,0)<1)errors.push('invalid:device_sequence');
  if(asNumber(event?.protocol_version)!==PROTOCOL_VERSION)errors.push('invalid:protocol_version');
  if(asNumber(event?.schema_version)!==SCHEMA_VERSION)errors.push('invalid:schema_version');
  return {ok:errors.length===0,errors};
}

async function buildLegacyEvent(job,legacyQueue,identity,deviceSequence){
  const scope=runtimeScope(job,identity);const clientTx=asText(job?.client_tx_id);
  if(!clientTx)throw new Error('Legacy offline job missing client_tx_id');
  const created=asText(job?.created_at||localRecord(job)?.created_at)||nowIso();
  const event={
    client_tx_id:clientTx,
    device_id:scope.device_id,
    device_sequence:asNumber(deviceSequence),
    business_id:scope.business_id,
    branch_id:scope.branch_id,
    employee_id:scope.employee_id,
    operation_type:asText(job?.type)||'unknown',
    entity_type:operationEntity(job?.type),
    local_entity_id:localEntityId(job)||null,
    local_shift_id:referencedShiftId(job)||null,
    depends_on_tx_id:dependencyTxForLegacy(job,legacyQueue),
    created_local_at:created,
    protocol_version:PROTOCOL_VERSION,
    schema_version:SCHEMA_VERSION,
    status:legacyStatus(job),
    attempts:asNumber(job?._sync?.attempts,0),
    last_attempt_at:asText(job?._sync?.last_attempt_at)||null,
    next_retry_at:null,
    last_error_code:null,
    last_error_message:asText(job?._sync?.last_error)||null,
    synced_at:null,
    server_ack:null,
    migration_source:'legacy_queue_v1',
    legacy_payload:clone(job)
  };
  const check=validateEvent(event);if(!check.ok)throw new Error(`Invalid V2 event ${clientTx}: ${check.errors.join(',')}`);
  return event;
}

function legacyQueueDigest(queue){
  return (queue||[]).map(j=>`${asText(j?.client_tx_id)}:${asText(j?.type)}:${asText(j?.created_at)}`).join('|');
}
function verifyMigrationCopy(legacyQueue,outbox){
  const byTx=new Map((outbox||[]).map(e=>[asText(e?.client_tx_id),e]));
  const errors=[];
  for(const job of legacyQueue||[]){
    const tx=asText(job?.client_tx_id);const copied=byTx.get(tx);
    if(!tx){errors.push('legacy job without client_tx_id');continue}
    if(!copied){errors.push(`missing outbox copy:${tx}`);continue}
    if(JSON.stringify(copied.legacy_payload)!==JSON.stringify(job))errors.push(`payload mismatch:${tx}`);
    const check=validateEvent(copied);if(!check.ok)errors.push(`${tx}:${check.errors.join(',')}`);
  }
  return {ok:errors.length===0,errors,source_count:(legacyQueue||[]).length,verified_count:(legacyQueue||[]).length-errors.length};
}

async function prepareLegacyMigration(){
  const legacy=await getArray('queue');
  const outbox=await getArray(KEYS.OUTBOX);
  const existing=new Set(outbox.map(x=>asText(x?.client_tx_id)).filter(Boolean));
  return {
    migration_mode:'copy-verify',
    destructive:false,
    legacy_count:legacy.length,
    existing_outbox_count:outbox.length,
    to_copy:legacy.filter(j=>!existing.has(asText(j?.client_tx_id))).length,
    source_digest:legacyQueueDigest(legacy)
  };
}

async function migrateLegacyQueue(){
  const legacy=await getArray('queue');
  const identity=await licenseIdentity();
  if(legacy.length&&(!identity.device_id||!identity.business_id))throw new Error('Offline V2 migration requires persisted device_id and business_id');
  let outbox=await getArray(KEYS.OUTBOX);
  const byTx=new Map(outbox.map(e=>[asText(e?.client_tx_id),e]));
  let maxSequence=outbox.reduce((m,e)=>Math.max(m,asNumber(e?.device_sequence,0)),0);
  await ensureSequenceAtLeast(identity.device_id,maxSequence);
  let copied=0;
  const sorted=[...legacy].sort((a,b)=>asText(a?.created_at).localeCompare(asText(b?.created_at))||asText(a?.client_tx_id).localeCompare(asText(b?.client_tx_id)));
  for(const job of sorted){
    const tx=asText(job?.client_tx_id);if(!tx)throw new Error('Legacy offline job missing client_tx_id');
    if(byTx.has(tx))continue;
    const seq=await nextDeviceSequence(identity.device_id);maxSequence=Math.max(maxSequence,seq);
    const event=await buildLegacyEvent(job,legacy,identity,seq);
    outbox.push(event);byTx.set(tx,event);copied++;
  }
  await setArray(KEYS.OUTBOX,outbox);
  const reread=await getArray(KEYS.OUTBOX);
  const verification=verifyMigrationCopy(legacy,reread);
  if(!verification.ok)throw new Error(`Offline V2 migration verification failed: ${verification.errors.join('; ')}`);
  const marker={
    migration_mode:'copy-verify',destructive:false,verified:true,
    source_key:'queue',destination_key:KEYS.OUTBOX,
    source_count:legacy.length,copied_count:copied,outbox_count:reread.length,
    source_digest:legacyQueueDigest(legacy),completed_at:nowIso(),
    protocol_version:PROTOCOL_VERSION,schema_version:SCHEMA_VERSION
  };
  // Marker is written only AFTER re-read + byte-equivalent legacy_payload verification.
  await global.odbSet(KEYS.MIGRATION,marker);
  return {marker,verification};
}

const TRANSITIONS=Object.freeze({
  pending:new Set(['syncing','blocked','conflict','dead_letter']),
  syncing:new Set(['synced','retryable','blocked','conflict','dead_letter']),
  retryable:new Set(['syncing','blocked','conflict','dead_letter']),
  blocked:new Set(['pending','syncing','conflict','dead_letter']),
  conflict:new Set(['pending','dead_letter']),
  dead_letter:new Set(['pending']),
  synced:new Set([])
});
function canTransition(from,to){return from===to||TRANSITIONS[from]?.has(to)===true}
async function transitionOutbox(clientTx,nextStatus,patch={}){
  if(!STATUS_SET.has(nextStatus))throw new Error(`Unknown Offline V2 status: ${nextStatus}`);
  const tx=asText(clientTx);const outbox=await getArray(KEYS.OUTBOX);const i=outbox.findIndex(e=>asText(e?.client_tx_id)===tx);
  if(i<0)throw new Error(`Offline V2 event not found: ${tx}`);
  if(!canTransition(outbox[i].status,nextStatus))throw new Error(`Invalid Offline V2 transition ${outbox[i].status} -> ${nextStatus}`);
  outbox[i]={...outbox[i],...clone(patch),status:nextStatus};
  if(nextStatus===STATUS.SYNCED&&!outbox[i].server_ack)throw new Error('Offline V2 cannot mark synced without explicit server_ack');
  if(nextStatus===STATUS.SYNCED&&!outbox[i].synced_at)outbox[i].synced_at=nowIso();
  const check=validateEvent(outbox[i]);if(!check.ok)throw new Error(check.errors.join(','));
  await setArray(KEYS.OUTBOX,outbox);return clone(outbox[i]);
}

async function upsertMapping(mapping){
  const row={entity_type:asText(mapping?.entity_type),local_id:asText(mapping?.local_id),server_id:mapping?.server_id??null,client_tx_id:asText(mapping?.client_tx_id),mapped_at:asText(mapping?.mapped_at)||nowIso(),server_version:mapping?.server_version??null};
  if(!row.entity_type||!row.local_id||row.server_id===null||!row.client_tx_id)throw new Error('Invalid Offline V2 entity mapping');
  const all=await getArray(KEYS.MAPPINGS);const i=all.findIndex(x=>x.entity_type===row.entity_type&&asText(x.local_id)===row.local_id);
  if(i>=0)all[i]={...all[i],...row};else all.push(row);
  await setArray(KEYS.MAPPINGS,all);return clone(row);
}

async function appendInbox(serverEvent){
  const id=asText(serverEvent?.server_event_id);if(!id)throw new Error('Inbox event requires server_event_id');
  const all=await getArray(KEYS.INBOX);const existing=all.find(x=>asText(x?.server_event_id)===id);if(existing)return {duplicate:true,event:clone(existing)};
  const row={server_event_id:id,status:'received',received_at:nowIso(),protocol_version:PROTOCOL_VERSION,schema_version:SCHEMA_VERSION,payload:clone(serverEvent)};
  all.push(row);await setArray(KEYS.INBOX,all);return {duplicate:false,event:clone(row)};
}

async function validateFoundation(){
  const outbox=await getArray(KEYS.OUTBOX);const errors=[];const txs=new Set();const seqByDevice=new Map();
  for(const e of outbox){
    const c=validateEvent(e);if(!c.ok)errors.push(`${asText(e?.client_tx_id)||'?'}:${c.errors.join(',')}`);
    const tx=asText(e?.client_tx_id);if(txs.has(tx))errors.push(`duplicate client_tx_id:${tx}`);txs.add(tx);
    const dev=asText(e?.device_id),seq=asNumber(e?.device_sequence,0);const key=`${dev}:${seq}`;
    if(seqByDevice.has(key))errors.push(`duplicate device_sequence:${key}`);seqByDevice.set(key,true);
  }
  return {ok:errors.length===0,errors,outbox_count:outbox.length,protocol_version:PROTOCOL_VERSION,schema_version:SCHEMA_VERSION,mode:FOUNDATION_MODE};
}

async function ensureFoundationStores(){
  if(!global.odbGet||!global.odbSet)throw new Error('Offline V2 requires Beta44 storage layer');
  for(const key of [KEYS.OUTBOX,KEYS.INBOX,KEYS.MAPPINGS]){const v=await global.odbGet(key);if(v==null)await global.odbSet(key,[]);else if(!Array.isArray(v))throw new Error(`Offline V2 store corrupt: ${key}`)}
  const meta={version:VERSION,mode:FOUNDATION_MODE,protocol_version:PROTOCOL_VERSION,schema_version:SCHEMA_VERSION,migration_mode:'copy-verify',legacy_queue_preserved:true,updated_at:nowIso()};
  await global.odbSet(KEYS.META,meta);return meta;
}

const api=Object.freeze({
  version:VERSION,mode:FOUNDATION_MODE,protocolVersion:PROTOCOL_VERSION,schemaVersion:SCHEMA_VERSION,
  status:STATUS,keys:KEYS,
  ensureFoundationStores,prepareLegacyMigration,migrateLegacyQueue,verifyMigrationCopy,
  validateEvent,validateFoundation,nextDeviceSequence,transitionOutbox,upsertMapping,appendInbox,
  getOutbox:()=>getArray(KEYS.OUTBOX),getInbox:()=>getArray(KEYS.INBOX),getMappings:()=>getArray(KEYS.MAPPINGS)
});
global.SharawlaOfflineV2=api;

// Initialize only the empty V2 stores. Legacy queue migration is deliberately NOT
// auto-started in Phase 1; takeover will run it under a controlled sync pause in a
// later gate so the legacy queue cannot drain between copy and verification.
Promise.resolve().then(()=>ensureFoundationStores()).catch(e=>console.error('Offline V2 foundation init failed',e));
})(window);
