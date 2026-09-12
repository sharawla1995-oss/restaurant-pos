'use strict';

// Sharawla Offline Engine V2 — Phase 2 durable local store + Phase 3 sync state.
// The database remains separate from the legacy sql.js database and remains
// shadow-only until a later takeover gate. No method here drains legacy queue.
const {app,ipcMain}=require('electron');
const path=require('path');
const crypto=require('crypto');
const sqlite3=require('sqlite3');

const STORE_VERSION='2.1';
const PROTOCOL_VERSION=2;
const SCHEMA_VERSION=2;
const VALID_STATUS=new Set(['pending','syncing','retryable','blocked','conflict','dead_letter','synced']);
let db=null;
let readyPromise=null;
let writeChain=Promise.resolve();

function nowIso(){return new Date().toISOString()}
function text(v){return String(v??'').trim()}
function number(v,fallback=0){const n=Number(v);return Number.isFinite(n)?n:fallback}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.keys(value).sort().reduce((o,k)=>(o[k]=canonical(value[k]),o),{});
  return value;
}
function digest(v){return crypto.createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex')}
function dbPath(){return path.join(app.getPath('userData'),'sharawla-offline-v2.sqlite')}
function parseJson(v,fallback=null){try{return v==null?fallback:JSON.parse(v)}catch{return fallback}}
function hydrate(row){
  if(!row)return null;
  const envelope=parseJson(row.envelope_json,{})||{};
  return {...row,envelope:{...envelope,status:row.status,attempts:number(row.attempts),last_attempt_at:row.last_attempt_at||null,next_retry_at:row.next_retry_at||null,last_error_code:row.last_error_code||null,last_error_message:row.last_error_message||null,synced_at:row.synced_at||null,server_ack:parseJson(row.server_ack_json,null)},server_ack:parseJson(row.server_ack_json,null)};
}

function run(sql,params=[]){return new Promise((resolve,reject)=>db.run(sql,params,function(err){if(err)reject(err);else resolve({changes:this.changes,lastID:this.lastID})}))}
function get(sql,params=[]){return new Promise((resolve,reject)=>db.get(sql,params,(err,row)=>err?reject(err):resolve(row)))}
function all(sql,params=[]){return new Promise((resolve,reject)=>db.all(sql,params,(err,rows)=>err?reject(err):resolve(rows||[])))}
function exec(sql){return new Promise((resolve,reject)=>db.exec(sql,err=>err?reject(err):resolve(true)))}
function serializeWrite(fn){const next=writeChain.then(fn,fn);writeChain=next.catch(()=>{});return next}

async function openNativeStore(){
  if(db)return db;
  await app.whenReady();
  db=await new Promise((resolve,reject)=>{
    const d=new sqlite3.Database(dbPath(),sqlite3.OPEN_READWRITE|sqlite3.OPEN_CREATE,err=>err?reject(err):resolve(d));
  });
  await exec(`
PRAGMA journal_mode=WAL;
PRAGMA synchronous=FULL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS offline_v2_meta(
 key TEXT PRIMARY KEY,
 value TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS offline_v2_device_sequences(
 device_id TEXT PRIMARY KEY,
 last_sequence INTEGER NOT NULL DEFAULT 0 CHECK(last_sequence>=0),
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS offline_v2_records(
 record_type TEXT NOT NULL,
 local_id TEXT NOT NULL,
 client_tx_id TEXT NOT NULL,
 parent_local_id TEXT,
 payload_json TEXT NOT NULL,
 created_local_at TEXT NOT NULL,
 PRIMARY KEY(record_type,local_id)
);
CREATE INDEX IF NOT EXISTS offline_v2_records_tx_idx ON offline_v2_records(client_tx_id);
CREATE TABLE IF NOT EXISTS offline_v2_outbox(
 client_tx_id TEXT PRIMARY KEY,
 device_id TEXT NOT NULL,
 device_sequence INTEGER NOT NULL,
 business_id TEXT NOT NULL,
 branch_id INTEGER NOT NULL,
 employee_id INTEGER NOT NULL,
 operation_type TEXT NOT NULL,
 entity_type TEXT NOT NULL,
 local_entity_id TEXT,
 local_shift_id TEXT,
 depends_on_tx_id TEXT,
 created_local_at TEXT NOT NULL,
 protocol_version INTEGER NOT NULL,
 schema_version INTEGER NOT NULL,
 status TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 last_attempt_at TEXT,
 next_retry_at TEXT,
 last_error_code TEXT,
 last_error_message TEXT,
 synced_at TEXT,
 server_ack_json TEXT,
 envelope_json TEXT NOT NULL,
 payload_digest TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(device_id,device_sequence)
);
CREATE INDEX IF NOT EXISTS offline_v2_outbox_status_idx ON offline_v2_outbox(status,created_local_at);
CREATE INDEX IF NOT EXISTS offline_v2_outbox_dependency_idx ON offline_v2_outbox(depends_on_tx_id,status);
CREATE INDEX IF NOT EXISTS offline_v2_outbox_retry_idx ON offline_v2_outbox(status,next_retry_at,device_id,device_sequence);
CREATE TABLE IF NOT EXISTS offline_v2_mappings(
 entity_type TEXT NOT NULL,
 local_id TEXT NOT NULL,
 server_id TEXT,
 client_tx_id TEXT NOT NULL,
 server_version TEXT,
 mapped_at TEXT,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(entity_type,local_id),
 UNIQUE(client_tx_id,entity_type,local_id)
);
CREATE INDEX IF NOT EXISTS offline_v2_mappings_tx_idx ON offline_v2_mappings(client_tx_id);
CREATE TABLE IF NOT EXISTS offline_v2_inbox(
 server_event_id TEXT PRIMARY KEY,
 status TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 protocol_version INTEGER NOT NULL,
 schema_version INTEGER NOT NULL,
 received_at TEXT NOT NULL,
 applied_at TEXT,
 last_error TEXT
);
`);
  await run(`INSERT INTO offline_v2_meta(key,value,updated_at) VALUES('store_version',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,[STORE_VERSION,nowIso()]);
  const integrity=await get('PRAGMA integrity_check');
  if(String(Object.values(integrity||{})[0]||'').toLowerCase()!=='ok')throw new Error('Offline V2 native database integrity check failed');
  return db;
}
function ready(){if(!readyPromise)readyPromise=openNativeStore();return readyPromise}

function validateCommit(input){
  const errors=[];
  const required=['client_tx_id','device_id','business_id','branch_id','employee_id','operation_type','entity_type'];
  for(const k of required)if(input?.[k]===undefined||input?.[k]===null||input?.[k]==='')errors.push(`missing:${k}`);
  if(input?.protocol_version!=null&&number(input.protocol_version)!==PROTOCOL_VERSION)errors.push('invalid:protocol_version');
  if(input?.schema_version!=null&&number(input.schema_version)!==SCHEMA_VERSION)errors.push('invalid:schema_version');
  if(input?.status&&input.status!=='pending')errors.push('new_operation_status_must_be_pending');
  const records=Array.isArray(input?.records)?input.records:[];
  for(const [i,r] of records.entries())if(!text(r?.record_type)||!text(r?.local_id))errors.push(`invalid:record:${i}`);
  if(errors.length){const e=new Error(`Offline V2 atomic commit invalid: ${errors.join(',')}`);e.code='OFFLINE_V2_INVALID_COMMIT';throw e}
}

async function allocateSequence(deviceId){
  const now=nowIso();
  await run(`INSERT INTO offline_v2_device_sequences(device_id,last_sequence,updated_at) VALUES(?,0,?) ON CONFLICT(device_id) DO NOTHING`,[deviceId,now]);
  await run(`UPDATE offline_v2_device_sequences SET last_sequence=last_sequence+1,updated_at=? WHERE device_id=?`,[now,deviceId]);
  const row=await get(`SELECT last_sequence FROM offline_v2_device_sequences WHERE device_id=?`,[deviceId]);
  return number(row?.last_sequence);
}

function envelopeFrom(input,sequence){
  return {
    client_tx_id:text(input.client_tx_id),device_id:text(input.device_id),device_sequence:sequence,
    business_id:text(input.business_id),branch_id:number(input.branch_id),employee_id:number(input.employee_id),
    operation_type:text(input.operation_type),entity_type:text(input.entity_type),
    local_entity_id:text(input.local_entity_id)||null,local_shift_id:text(input.local_shift_id)||null,
    depends_on_tx_id:text(input.depends_on_tx_id)||null,created_local_at:text(input.created_local_at)||nowIso(),
    protocol_version:PROTOCOL_VERSION,schema_version:SCHEMA_VERSION,status:'pending',attempts:0,
    last_attempt_at:null,next_retry_at:null,last_error_code:null,last_error_message:null,synced_at:null,server_ack:null,
    payload:clone(input.payload??null)
  };
}

async function commitOperationUnsafe(input){
  validateCommit(input);
  const tx=text(input.client_tx_id);
  const payloadHash=digest({payload:input.payload??null,records:input.records||[],identity:{device_id:input.device_id,business_id:input.business_id,branch_id:input.branch_id,employee_id:input.employee_id},operation_type:input.operation_type,entity_type:input.entity_type,local_entity_id:input.local_entity_id??null,local_shift_id:input.local_shift_id??null,depends_on_tx_id:input.depends_on_tx_id??null});
  await exec('BEGIN IMMEDIATE TRANSACTION');
  try{
    const existing=await get(`SELECT * FROM offline_v2_outbox WHERE client_tx_id=?`,[tx]);
    if(existing){
      if(existing.payload_digest!==payloadHash){const e=new Error('Same client_tx_id was reused with different payload');e.code='OFFLINE_V2_TX_PAYLOAD_MISMATCH';throw e}
      await exec('COMMIT');
      return {ok:true,duplicate:true,durable:true,event:hydrate(existing).envelope};
    }
    const sequence=await allocateSequence(text(input.device_id));
    const envelope=envelopeFrom(input,sequence);const created=envelope.created_local_at;
    for(const r of (input.records||[])){
      await run(`INSERT INTO offline_v2_records(record_type,local_id,client_tx_id,parent_local_id,payload_json,created_local_at) VALUES(?,?,?,?,?,?)`,[
        text(r.record_type),text(r.local_id),tx,text(r.parent_local_id)||null,JSON.stringify(r.payload??null),text(r.created_local_at)||created
      ]);
    }
    if(envelope.local_entity_id){
      await run(`INSERT INTO offline_v2_mappings(entity_type,local_id,server_id,client_tx_id,server_version,mapped_at,updated_at) VALUES(?,?,NULL,?,NULL,NULL,?) ON CONFLICT(entity_type,local_id) DO NOTHING`,[envelope.entity_type,envelope.local_entity_id,tx,nowIso()]);
    }
    const now=nowIso();
    await run(`INSERT INTO offline_v2_outbox(client_tx_id,device_id,device_sequence,business_id,branch_id,employee_id,operation_type,entity_type,local_entity_id,local_shift_id,depends_on_tx_id,created_local_at,protocol_version,schema_version,status,attempts,envelope_json,payload_digest,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?)`,[
      tx,envelope.device_id,sequence,envelope.business_id,envelope.branch_id,envelope.employee_id,envelope.operation_type,envelope.entity_type,envelope.local_entity_id,envelope.local_shift_id,envelope.depends_on_tx_id,envelope.created_local_at,PROTOCOL_VERSION,SCHEMA_VERSION,'pending',JSON.stringify(envelope),payloadHash,now,now
    ]);
    await exec('COMMIT');
    return {ok:true,duplicate:false,durable:true,event:envelope};
  }catch(e){try{await exec('ROLLBACK')}catch{}throw e}
}
async function commitOperation(input){await ready();return serializeWrite(()=>commitOperationUnsafe(clone(input||{})))}

async function importShadowUnsafe(snapshot){
  const events=Array.isArray(snapshot?.outbox)?snapshot.outbox:[];
  const mappings=Array.isArray(snapshot?.mappings)?snapshot.mappings:[];
  const inbox=Array.isArray(snapshot?.inbox)?snapshot.inbox:[];
  await exec('BEGIN IMMEDIATE TRANSACTION');
  try{
    let imported=0,duplicates=0;
    for(const event of events){
      const tx=text(event?.client_tx_id);if(!tx)throw new Error('Shadow import event missing client_tx_id');
      const old=await get(`SELECT payload_digest FROM offline_v2_outbox WHERE client_tx_id=?`,[tx]);
      if(old){duplicates++;continue}
      const seq=number(event.device_sequence);if(seq<1)throw new Error(`Shadow import invalid sequence: ${tx}`);
      const status=VALID_STATUS.has(event.status)?event.status:'pending';
      const env={...clone(event),protocol_version:PROTOCOL_VERSION,schema_version:SCHEMA_VERSION,status};
      const pHash=digest(event.legacy_payload??event.payload??env);
      const now=nowIso();
      await run(`INSERT INTO offline_v2_device_sequences(device_id,last_sequence,updated_at) VALUES(?,?,?) ON CONFLICT(device_id) DO UPDATE SET last_sequence=MAX(last_sequence,excluded.last_sequence),updated_at=excluded.updated_at`,[text(event.device_id),seq,now]);
      await run(`INSERT INTO offline_v2_outbox(client_tx_id,device_id,device_sequence,business_id,branch_id,employee_id,operation_type,entity_type,local_entity_id,local_shift_id,depends_on_tx_id,created_local_at,protocol_version,schema_version,status,attempts,last_attempt_at,next_retry_at,last_error_code,last_error_message,synced_at,server_ack_json,envelope_json,payload_digest,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[
        tx,text(event.device_id),seq,text(event.business_id),number(event.branch_id),number(event.employee_id),text(event.operation_type),text(event.entity_type),text(event.local_entity_id)||null,text(event.local_shift_id)||null,text(event.depends_on_tx_id)||null,text(event.created_local_at)||now,PROTOCOL_VERSION,SCHEMA_VERSION,status,number(event.attempts),event.last_attempt_at||null,event.next_retry_at||null,event.last_error_code||null,event.last_error_message||null,event.synced_at||null,event.server_ack?JSON.stringify(event.server_ack):null,JSON.stringify(env),pHash,now,now
      ]);imported++;
    }
    for(const m of mappings){
      if(!text(m?.entity_type)||!text(m?.local_id)||!text(m?.client_tx_id))continue;
      await run(`INSERT INTO offline_v2_mappings(entity_type,local_id,server_id,client_tx_id,server_version,mapped_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(entity_type,local_id) DO UPDATE SET server_id=COALESCE(excluded.server_id,server_id),server_version=COALESCE(excluded.server_version,server_version),mapped_at=COALESCE(excluded.mapped_at,mapped_at),updated_at=excluded.updated_at`,[text(m.entity_type),text(m.local_id),m.server_id==null?null:text(m.server_id),text(m.client_tx_id),m.server_version==null?null:text(m.server_version),m.mapped_at||null,nowIso()]);
    }
    for(const i of inbox){
      if(!text(i?.server_event_id))continue;
      await run(`INSERT OR IGNORE INTO offline_v2_inbox(server_event_id,status,payload_json,protocol_version,schema_version,received_at,applied_at,last_error) VALUES(?,?,?,?,?,?,?,?)`,[text(i.server_event_id),text(i.status)||'received',JSON.stringify(i.payload??i),PROTOCOL_VERSION,SCHEMA_VERSION,text(i.received_at)||nowIso(),i.applied_at||null,i.last_error||null]);
    }
    await exec('COMMIT');
    return {ok:true,imported,duplicates,legacy_source_untouched:true};
  }catch(e){try{await exec('ROLLBACK')}catch{}throw e}
}
async function importShadow(snapshot){await ready();return serializeWrite(()=>importShadowUnsafe(clone(snapshot||{})))}

async function listOutbox(status=null){
  await ready();
  const rows=status?await all(`SELECT * FROM offline_v2_outbox WHERE status=? ORDER BY device_id,device_sequence`,[String(status)]):await all(`SELECT * FROM offline_v2_outbox ORDER BY device_id,device_sequence`);
  return rows.map(hydrate);
}
async function getOutbox(clientTx){await ready();return hydrate(await get(`SELECT * FROM offline_v2_outbox WHERE client_tx_id=?`,[text(clientTx)]))}
async function getRecord(recordType,localId){await ready();const r=await get(`SELECT * FROM offline_v2_records WHERE record_type=? AND local_id=?`,[text(recordType),text(localId)]);return r?{...r,payload:parseJson(r.payload_json)}:null}
async function getMappingByTx(clientTx){
  await ready();
  const r=await get(`SELECT entity_type,local_id,server_id,client_tx_id,server_version,mapped_at FROM offline_v2_mappings WHERE client_tx_id=? AND server_id IS NOT NULL ORDER BY mapped_at LIMIT 1`,[text(clientTx)]);
  return r?clone(r):null;
}

async function claimNextDueUnsafe(now){
  await exec('BEGIN IMMEDIATE TRANSACTION');
  try{
    const row=await get(`SELECT o.* FROM offline_v2_outbox o
      WHERE o.status IN ('pending','retryable')
        AND (o.next_retry_at IS NULL OR o.next_retry_at<=?)
        AND (o.depends_on_tx_id IS NULL OR EXISTS(
          SELECT 1 FROM offline_v2_outbox p WHERE p.client_tx_id=o.depends_on_tx_id AND p.status='synced'
        ))
      ORDER BY o.device_id,o.device_sequence LIMIT 1`,[now]);
    if(!row){await exec('COMMIT');return null}
    const changed=await run(`UPDATE offline_v2_outbox SET status='syncing',attempts=attempts+1,last_attempt_at=?,next_retry_at=NULL,updated_at=? WHERE client_tx_id=? AND status IN ('pending','retryable')`,[now,now,row.client_tx_id]);
    if(changed.changes!==1){await exec('ROLLBACK');return null}
    const claimed=await get(`SELECT * FROM offline_v2_outbox WHERE client_tx_id=?`,[row.client_tx_id]);
    await exec('COMMIT');
    return hydrate(claimed);
  }catch(e){try{await exec('ROLLBACK')}catch{}throw e}
}
async function claimNextDue(now=nowIso()){await ready();return serializeWrite(()=>claimNextDueUnsafe(text(now)||nowIso()))}

async function recoverStaleSyncingUnsafe(cutoff,now){
  const r=await run(`UPDATE offline_v2_outbox SET status='retryable',next_retry_at=?,last_error_code='OFFLINE_V2_STALE_IN_FLIGHT',last_error_message='Recovered stale in-flight operation after restart',updated_at=? WHERE status='syncing' AND (last_attempt_at IS NULL OR last_attempt_at<=?)`,[now,now,cutoff]);
  return {ok:true,recovered:r.changes};
}
async function recoverStaleSyncing(cutoff,now=nowIso()){await ready();return serializeWrite(()=>recoverStaleSyncingUnsafe(text(cutoff),text(now)||nowIso()))}

async function markRetryableUnsafe(clientTx,error,nextRetryAt){
  const now=nowIso();
  const r=await run(`UPDATE offline_v2_outbox SET status='retryable',next_retry_at=?,last_error_code=?,last_error_message=?,updated_at=? WHERE client_tx_id=? AND status='syncing'`,[text(nextRetryAt)||now,text(error?.code)||'OFFLINE_V2_RETRYABLE',text(error?.message)||'Retryable sync error',now,text(clientTx)]);
  if(r.changes!==1)throw new Error(`Offline V2 retry transition rejected: ${text(clientTx)}`);
  return getOutbox(clientTx);
}
async function markRetryable(clientTx,error,nextRetryAt){await ready();return serializeWrite(()=>markRetryableUnsafe(clientTx,error,nextRetryAt))}

async function markConflictUnsafe(clientTx,error){
  const now=nowIso();
  const r=await run(`UPDATE offline_v2_outbox SET status='conflict',next_retry_at=NULL,last_error_code=?,last_error_message=?,updated_at=? WHERE client_tx_id=? AND status='syncing'`,[text(error?.code)||'BUSINESS_CONFLICT',text(error?.message)||'Business conflict requires attention',now,text(clientTx)]);
  if(r.changes!==1)throw new Error(`Offline V2 conflict transition rejected: ${text(clientTx)}`);
  return getOutbox(clientTx);
}
async function markConflict(clientTx,error){await ready();return serializeWrite(()=>markConflictUnsafe(clientTx,error))}

function validateAckForStore(row,ack){
  if(!ack||ack.ok!==true)throw new Error('Offline V2 explicit ACK required');
  if(text(ack.client_tx_id)!==text(row.client_tx_id))throw new Error('Offline V2 ACK client_tx_id mismatch');
  if(number(ack.protocol_version)!==PROTOCOL_VERSION)throw new Error('Offline V2 ACK protocol mismatch');
  if(!(ack.acknowledged===true||ack.duplicate===true||ack.idempotent_replay===true))throw new Error('Offline V2 ACK not explicit');
  if(!text(ack.server_event_id))throw new Error('Offline V2 ACK server_event_id missing');
  if(text(ack.payload_digest)!==text(row.payload_digest))throw new Error('Offline V2 ACK payload digest mismatch');
  if(text(row.local_entity_id)&&!(ack.server_entity_id!==undefined&&ack.server_entity_id!==null&&text(ack.server_entity_id)))throw new Error('Offline V2 ACK server entity mapping missing');
}
async function markAckedUnsafe(clientTx,ack){
  const tx=text(clientTx);const now=nowIso();
  await exec('BEGIN IMMEDIATE TRANSACTION');
  try{
    const row=await get(`SELECT * FROM offline_v2_outbox WHERE client_tx_id=?`,[tx]);
    if(!row)throw new Error(`Offline V2 event not found: ${tx}`);
    if(row.status==='synced'){
      const existing=parseJson(row.server_ack_json,{});
      if(text(existing?.client_tx_id)!==tx)throw new Error('Offline V2 persisted ACK mismatch');
      await exec('COMMIT');return hydrate(row);
    }
    if(row.status!=='syncing')throw new Error(`Offline V2 ACK transition rejected from ${row.status}`);
    validateAckForStore(row,ack);
    await run(`INSERT OR IGNORE INTO offline_v2_inbox(server_event_id,status,payload_json,protocol_version,schema_version,received_at,applied_at,last_error) VALUES(?,?,?,?,?,?,?,NULL)`,[text(ack.server_event_id),'acknowledged',JSON.stringify(ack),PROTOCOL_VERSION,SCHEMA_VERSION,now,now]);
    if(text(row.local_entity_id)){
      await run(`INSERT INTO offline_v2_mappings(entity_type,local_id,server_id,client_tx_id,server_version,mapped_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(entity_type,local_id) DO UPDATE SET server_id=excluded.server_id,client_tx_id=excluded.client_tx_id,server_version=excluded.server_version,mapped_at=excluded.mapped_at,updated_at=excluded.updated_at`,[
        row.entity_type,row.local_entity_id,text(ack.server_entity_id),tx,ack.server_version==null?null:text(ack.server_version),now,now
      ]);
    }
    await run(`UPDATE offline_v2_outbox SET status='synced',synced_at=?,server_ack_json=?,next_retry_at=NULL,last_error_code=NULL,last_error_message=NULL,updated_at=? WHERE client_tx_id=?`,[now,JSON.stringify(ack),now,tx]);
    const updated=await get(`SELECT * FROM offline_v2_outbox WHERE client_tx_id=?`,[tx]);
    await exec('COMMIT');return hydrate(updated);
  }catch(e){try{await exec('ROLLBACK')}catch{}throw e}
}
async function markAcked(clientTx,ack){await ready();return serializeWrite(()=>markAckedUnsafe(clientTx,clone(ack)))}

async function syncStats(){
  await ready();
  const rows=await all(`SELECT status,COUNT(*) count FROM offline_v2_outbox GROUP BY status`);
  const counts={};for(const r of rows)counts[r.status]=number(r.count);
  const inbox=await get(`SELECT COUNT(*) count FROM offline_v2_inbox`);
  const mappings=await get(`SELECT COUNT(*) count FROM offline_v2_mappings WHERE server_id IS NOT NULL`);
  return {ok:true,shadow_mode:true,counts,inbox_count:number(inbox?.count),mapped_count:number(mappings?.count)};
}
async function health(){
  await ready();
  const integrity=await get('PRAGMA integrity_check');
  const journal=await get('PRAGMA journal_mode');
  const synchronous=await get('PRAGMA synchronous');
  const foreignKeys=await get('PRAGMA foreign_keys');
  const outbox=await get(`SELECT COUNT(*) c FROM offline_v2_outbox WHERE status<>'synced'`);
  return {ok:String(Object.values(integrity||{})[0]||'').toLowerCase()==='ok',backend:'native-sqlite3',database:dbPath(),store_version:STORE_VERSION,protocol_version:PROTOCOL_VERSION,schema_version:SCHEMA_VERSION,journal_mode:String(Object.values(journal||{})[0]||''),synchronous:number(Object.values(synchronous||{})[0]),foreign_keys:number(Object.values(foreignKeys||{})[0]),unsynced_count:number(outbox?.c),shadow_mode:true};
}

function installOfflineV2NativeStore(){
  // Shadow APIs only. No live transport is installed in Phase 3, therefore the
  // protected Beta43/Beta44 queue cannot be consumed by this protocol engine.
  ipcMain.handle('offline-v2:commit-operation',(_e,input)=>commitOperation(input));
  ipcMain.handle('offline-v2:import-shadow',(_e,snapshot)=>importShadow(snapshot));
  ipcMain.handle('offline-v2:outbox',(_e,status=null)=>listOutbox(status));
  ipcMain.handle('offline-v2:record',(_e,type,id)=>getRecord(type,id));
  ipcMain.handle('offline-v2:health',()=>health());
  ipcMain.handle('offline-v2:sync-stats',()=>syncStats());
  ready().catch(e=>console.error('Offline V2 native store init failed',e));
  return {ready,commitOperation,importShadow,listOutbox,getOutbox,getRecord,getMappingByTx,claimNextDue,recoverStaleSyncing,markRetryable,markConflict,markAcked,syncStats,health};
}

module.exports={installOfflineV2NativeStore,PROTOCOL_VERSION,SCHEMA_VERSION,STORE_VERSION};
