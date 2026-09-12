'use strict';

// Sharawla Offline Engine V2 — Phase 4 controlled migration/takeover manager.
// IMPORTANT: takeover is DISABLED by default and can only be armed/activated
// through explicit approved IPC calls. Legacy queue data is never mutated here.
const {app,ipcMain}=require('electron');
const path=require('path');
const crypto=require('crypto');
const sqlite3=require('sqlite3');

const STATE_KEY='takeover_state_v1';
const TAKEOVER_VERSION='4.0';
let metaDb=null;
let metaReadyPromise=null;
let installed=false;

function nowIso(){return new Date().toISOString()}
function text(v){return String(v??'').trim()}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.keys(value).sort().reduce((o,k)=>(o[k]=canonical(value[k]),o),{});
  return value;
}
function digest(v){return crypto.createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex')}
function dbPath(){return path.join(app.getPath('userData'),'sharawla-offline-v2.sqlite')}
function defaultState(){return {
  version:TAKEOVER_VERSION,
  mode:'disabled',
  armed:false,
  active:false,
  migration_verified:false,
  legacy_retired:false,
  identity:null,
  legacy_count:0,
  legacy_tx_ids:[],
  snapshot_digest:null,
  armed_at:null,
  prepared_at:null,
  verified_at:null,
  activated_at:null,
  deactivated_at:null,
  legacy_source_untouched:true
}}
function assertApproved(input,action){if(input?.approved!==true){const e=new Error(`Offline V2 ${action} requires explicit approval`);e.code='OFFLINE_V2_APPROVAL_REQUIRED';throw e}}
function normalizedIdentity(raw){return {device_id:text(raw?.device_id),business_id:text(raw?.business_id),device_fingerprint:text(raw?.device_fingerprint)}}
function assertIdentity(raw){
  const i=normalizedIdentity(raw);
  if(!i.device_id||!i.business_id||!i.device_fingerprint){const e=new Error('Offline V2 takeover requires persisted device_id, business_id and canonical device_fingerprint');e.code='OFFLINE_V2_CANONICAL_IDENTITY_REQUIRED';throw e}
  return i;
}
function sameIdentity(a,b){a=normalizedIdentity(a);b=normalizedIdentity(b);return a.device_id===b.device_id&&a.business_id===b.business_id&&a.device_fingerprint===b.device_fingerprint}

function dbRun(sql,params=[]){return new Promise((resolve,reject)=>metaDb.run(sql,params,function(err){if(err)reject(err);else resolve({changes:this.changes,lastID:this.lastID})}))}
function dbGet(sql,params=[]){return new Promise((resolve,reject)=>metaDb.get(sql,params,(err,row)=>err?reject(err):resolve(row)))}
function dbExec(sql){return new Promise((resolve,reject)=>metaDb.exec(sql,err=>err?reject(err):resolve(true)))}
async function openMeta(){
  if(metaDb)return metaDb;
  await app.whenReady();
  metaDb=await new Promise((resolve,reject)=>{const d=new sqlite3.Database(dbPath(),sqlite3.OPEN_READWRITE|sqlite3.OPEN_CREATE,err=>err?reject(err):resolve(d))});
  await dbExec('PRAGMA busy_timeout=5000;');
  return metaDb;
}
function metaReady(){if(!metaReadyPromise)metaReadyPromise=openMeta();return metaReadyPromise}
async function readState(){
  await metaReady();
  const row=await dbGet(`SELECT value FROM offline_v2_meta WHERE key=?`,[STATE_KEY]);
  if(!row?.value)return defaultState();
  try{return {...defaultState(),...JSON.parse(row.value)}}catch{return defaultState()}
}
async function writeState(state){
  await metaReady();
  const next={...defaultState(),...clone(state),version:TAKEOVER_VERSION,legacy_source_untouched:true};
  await dbRun(`INSERT INTO offline_v2_meta(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,[STATE_KEY,JSON.stringify(next),nowIso()]);
  return next;
}

function uniqueLegacySnapshot(snapshot){
  if(!Array.isArray(snapshot)){const e=new Error('Legacy queue snapshot must be an array');e.code='OFFLINE_V2_LEGACY_SNAPSHOT_INVALID';throw e}
  const seen=new Set();
  for(const job of snapshot){
    const tx=text(job?.client_tx_id);
    if(!tx){const e=new Error('Legacy queue job missing client_tx_id');e.code='OFFLINE_V2_LEGACY_TX_MISSING';throw e}
    if(seen.has(tx)){const e=new Error(`Duplicate legacy client_tx_id: ${tx}`);e.code='OFFLINE_V2_LEGACY_TX_DUPLICATE';throw e}
    seen.add(tx);
  }
  return [...seen];
}
function protectLegacyEvents(events,legacyTxIds){
  if(!Array.isArray(events)){const e=new Error('Offline V2 migration events must be an array');e.code='OFFLINE_V2_MIGRATION_EVENTS_INVALID';throw e}
  const byTx=new Map(events.map(e=>[text(e?.client_tx_id),e]));
  return legacyTxIds.map(tx=>{
    const event=byTx.get(tx);
    if(!event){const e=new Error(`Missing normalized V2 migration event: ${tx}`);e.code='OFFLINE_V2_MIGRATION_EVENT_MISSING';throw e}
    return {
      ...clone(event),
      status:'blocked',
      next_retry_at:null,
      last_error_code:'OFFLINE_V2_LEGACY_PRESERVED',
      last_error_message:'Legacy authority preserved until explicit retirement',
      migration_source:'legacy_queue_v1',
      legacy_authority:true
    };
  });
}
async function forceLegacyCopiesBlocked(txIds){
  if(!txIds.length)return;
  await metaReady();
  await dbExec('BEGIN IMMEDIATE TRANSACTION');
  try{
    const now=nowIso();
    for(const tx of txIds){
      await dbRun(`UPDATE offline_v2_outbox SET status='blocked',next_retry_at=NULL,last_error_code='OFFLINE_V2_LEGACY_PRESERVED',last_error_message='Legacy authority preserved until explicit retirement',updated_at=? WHERE client_tx_id=?`,[now,tx]);
    }
    await dbExec('COMMIT');
  }catch(e){try{await dbExec('ROLLBACK')}catch{}throw e}
}

async function arm(input={}){
  assertApproved(input,'arm');
  const identity=assertIdentity(input.identity);
  const current=await readState();
  if(current.active){const e=new Error('Offline V2 takeover is already active');e.code='OFFLINE_V2_ALREADY_ACTIVE';throw e}
  if(current.armed&&current.identity&&!sameIdentity(current.identity,identity)){const e=new Error('Offline V2 takeover identity mismatch');e.code='OFFLINE_V2_IDENTITY_MISMATCH';throw e}
  return writeState({...current,mode:'armed',armed:true,active:false,identity,armed_at:current.armed_at||nowIso()});
}

function installOfflineV2TakeoverManager(store){
  if(installed)return;
  if(!store||typeof store.importShadow!=='function'||typeof store.listOutbox!=='function')throw new Error('Offline V2 takeover manager requires native store adapter');
  installed=true;

  async function prepare(input={}){
    assertApproved(input,'prepare');
    const identity=assertIdentity(input.identity);
    const current=await readState();
    if(!current.armed){const e=new Error('Offline V2 takeover must be armed before migration');e.code='OFFLINE_V2_NOT_ARMED';throw e}
    if(!sameIdentity(current.identity,identity)){const e=new Error('Offline V2 migration identity mismatch');e.code='OFFLINE_V2_IDENTITY_MISMATCH';throw e}

    const legacySnapshot=clone(input.legacy_snapshot||[]);
    const legacyTxIds=uniqueLegacySnapshot(legacySnapshot);
    const protectedEvents=protectLegacyEvents(clone(input.events||[]),legacyTxIds);

    // Copy only. Never mutate/delete the legacy queue. Existing shadow duplicates
    // are explicitly blocked too, preventing double-send after takeover.
    await store.importShadow({outbox:protectedEvents,mappings:clone(input.mappings||[]),inbox:[]});
    await forceLegacyCopiesBlocked(legacyTxIds);

    // Re-read from durable SQLite and verify every exact legacy payload before
    // writing the migration marker. Marker creation is intentionally last.
    const durable=await store.listOutbox();
    const byTx=new Map(durable.map(row=>[text(row?.client_tx_id),row]));
    const errors=[];
    for(const job of legacySnapshot){
      const tx=text(job.client_tx_id),row=byTx.get(tx);
      if(!row){errors.push(`missing:${tx}`);continue}
      if(row.status!=='blocked')errors.push(`not_blocked:${tx}`);
      if(JSON.stringify(row.envelope?.legacy_payload)!==JSON.stringify(job))errors.push(`payload_mismatch:${tx}`);
    }
    if(errors.length){const e=new Error(`Offline V2 migration verification failed: ${errors.join(';')}`);e.code='OFFLINE_V2_MIGRATION_VERIFY_FAILED';throw e}

    const verifiedAt=nowIso();
    return writeState({
      ...current,
      mode:'prepared',armed:true,active:false,migration_verified:true,legacy_retired:false,
      identity,legacy_count:legacySnapshot.length,legacy_tx_ids:legacyTxIds,
      snapshot_digest:digest(legacySnapshot),prepared_at:verifiedAt,verified_at:verifiedAt,
      legacy_source_untouched:true
    });
  }

  async function activate(input={}){
    assertApproved(input,'activate');
    const identity=assertIdentity(input.identity);
    const current=await readState();
    if(!current.armed||!current.migration_verified){const e=new Error('Offline V2 migration must be verified before activation');e.code='OFFLINE_V2_MIGRATION_NOT_VERIFIED';throw e}
    if(!sameIdentity(current.identity,identity)){const e=new Error('Offline V2 activation identity mismatch');e.code='OFFLINE_V2_IDENTITY_MISMATCH';throw e}
    return writeState({...current,mode:'active',armed:true,active:true,activated_at:nowIso(),legacy_source_untouched:true,legacy_retired:false});
  }

  async function deactivate(input={}){
    assertApproved(input,'deactivate');
    const identity=assertIdentity(input.identity);
    const current=await readState();
    if(current.identity&&!sameIdentity(current.identity,identity)){const e=new Error('Offline V2 deactivation identity mismatch');e.code='OFFLINE_V2_IDENTITY_MISMATCH';throw e}
    return writeState({...current,mode:'prepared',active:false,deactivated_at:nowIso(),legacy_source_untouched:true,legacy_retired:false});
  }

  ipcMain.handle('offline-v2:takeover-state',()=>readState());
  ipcMain.handle('offline-v2:takeover-arm',(_e,input)=>arm(input));
  ipcMain.handle('offline-v2:takeover-prepare',(_e,input)=>prepare(input));
  ipcMain.handle('offline-v2:takeover-activate',(_e,input)=>activate(input));
  ipcMain.handle('offline-v2:takeover-deactivate',(_e,input)=>deactivate(input));

  // NO automatic arm/prepare/activate call here by design.
  metaReady().catch(e=>console.error('Offline V2 takeover metadata init failed',e));
  return {state:readState,arm,prepare,activate,deactivate};
}

module.exports={installOfflineV2TakeoverManager,defaultState,assertIdentity,STATE_KEY,TAKEOVER_VERSION};
