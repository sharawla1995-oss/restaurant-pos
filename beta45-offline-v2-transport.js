'use strict';

// Sharawla Offline Engine V2 — Phase 5 authenticated transport.
// Runs in Electron main process, keeps the native SQLite outbox authoritative,
// and only marks work synced after the backend returns the explicit ACK contract.
const {app,ipcMain}=require('electron');
const path=require('path');
const https=require('https');
const sqlite3=require('sqlite3');
const {createSyncEngine}=require('./beta45-offline-v2-sync.js');

const TRANSPORT_VERSION='1.0';
const STATE_KEY='takeover_state_v1';
const APPLY_RPC='sharawla_offline_v2_apply_event';
const INFO_RPC='sharawla_offline_v2_transport_info';
let db=null,readyPromise=null,writeChain=Promise.resolve(),installed=false;

function text(v){return String(v??'').trim()}
function num(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function nowIso(){return new Date().toISOString()}
function dbPath(){return path.join(app.getPath('userData'),'sharawla-offline-v2.sqlite')}
function parseJson(v,f=null){try{return v==null?f:JSON.parse(v)}catch{return f}}
function fail(code,message,kind='permanent',status=0){const e=new Error(message);e.code=code;e.kind=kind;e.http_status=status;return e}
function sameIdentity(a,b){return text(a?.device_id)===text(b?.device_id)&&text(a?.business_id)===text(b?.business_id)&&text(a?.device_fingerprint)===text(b?.device_fingerprint)}
function hydrate(row){if(!row)return null;const envelope=parseJson(row.envelope_json,{})||{};return {...row,envelope:{...envelope,status:row.status,attempts:num(row.attempts),last_attempt_at:row.last_attempt_at||null,next_retry_at:row.next_retry_at||null,last_error_code:row.last_error_code||null,last_error_message:row.last_error_message||null,synced_at:row.synced_at||null,server_ack:parseJson(row.server_ack_json,null)},server_ack:parseJson(row.server_ack_json,null)}}

function run(sql,params=[]){return new Promise((resolve,reject)=>db.run(sql,params,function(err){if(err)reject(err);else resolve({changes:this.changes,lastID:this.lastID})}))}
function get(sql,params=[]){return new Promise((resolve,reject)=>db.get(sql,params,(err,row)=>err?reject(err):resolve(row)))}
function exec(sql){return new Promise((resolve,reject)=>db.exec(sql,err=>err?reject(err):resolve(true)))}
function serial(fn){const next=writeChain.then(fn,fn);writeChain=next.catch(()=>{});return next}
async function openDb(){
  if(db)return db;await app.whenReady();
  db=await new Promise((resolve,reject)=>{const d=new sqlite3.Database(dbPath(),sqlite3.OPEN_READWRITE|sqlite3.OPEN_CREATE,err=>err?reject(err):resolve(d))});
  await exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');return db;
}
function ready(){if(!readyPromise)readyPromise=openDb();return readyPromise}
async function readTakeoverState(){await ready();const r=await get('SELECT value FROM offline_v2_meta WHERE key=?',[STATE_KEY]);return parseJson(r?.value,{})||{}}
async function writeTakeoverState(state){await ready();const now=nowIso();await run(`INSERT INTO offline_v2_meta(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,[STATE_KEY,JSON.stringify(state),now]);return state}

function validateContext(input,requireToken=true){
  const url=text(input?.url).replace(/\/$/,'');
  let u;try{u=new URL(url)}catch{throw fail('OFFLINE_V2_BACKEND_URL_INVALID','Offline V2 backend URL is invalid')}
  if(u.protocol!=='https:'||!/^[a-z0-9-]+\.supabase\.co$/i.test(u.hostname)||u.pathname!=='')throw fail('OFFLINE_V2_BACKEND_URL_INVALID','Offline V2 backend URL must be a Supabase HTTPS project URL');
  const key=text(input?.key),accessToken=text(input?.access_token),identity={device_id:text(input?.device_id),business_id:text(input?.business_id),device_fingerprint:text(input?.device_fingerprint)};
  if(!key)throw fail('OFFLINE_V2_BACKEND_KEY_REQUIRED','Offline V2 backend publishable key is required');
  if(requireToken&&!accessToken)throw fail('OFFLINE_V2_SESSION_REQUIRED','Offline V2 requires an authenticated employee session','auth',401);
  if(!identity.device_id||!identity.business_id||!identity.device_fingerprint)throw fail('OFFLINE_V2_CANONICAL_IDENTITY_REQUIRED','Offline V2 canonical device identity is required');
  const employeeId=num(input?.employee_id);if(employeeId<=0)throw fail('OFFLINE_V2_EMPLOYEE_REQUIRED','Offline V2 current employee is required','auth',401);
  return {url,key,access_token:accessToken,identity,employee_id:employeeId,timeout_ms:Math.max(3000,Math.min(30000,num(input?.timeout_ms,15000)))};
}

function postRpc(ctx,name,payload){
  return new Promise((resolve,reject)=>{
    const endpoint=new URL(`/rest/v1/rpc/${name}`,ctx.url);
    const body=JSON.stringify(payload||{});
    const req=https.request({protocol:endpoint.protocol,hostname:endpoint.hostname,port:endpoint.port||443,path:endpoint.pathname,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'apikey':ctx.key,'Authorization':`Bearer ${ctx.access_token}`,'X-Client-Info':'Sharawla-POS-Offline-V2/1'}},res=>{
      let raw='';res.setEncoding('utf8');res.on('data',c=>{raw+=c});res.on('end',()=>{
        let parsed=null;try{parsed=raw?JSON.parse(raw):null}catch{}
        if((res.statusCode||0)<200||(res.statusCode||0)>=300){
          const message=text(parsed?.message||parsed?.details||parsed?.hint||raw)||`Backend HTTP ${res.statusCode}`;
          const e=fail(text(parsed?.code)||`HTTP_${res.statusCode}`,message,(res.statusCode===401||res.statusCode===403)?'auth':'http',num(res.statusCode));
          e.details=parsed?.details||null;e.hint=parsed?.hint||null;return reject(e);
        }
        resolve(Array.isArray(parsed)?parsed[0]:parsed);
      });
    });
    req.setTimeout(ctx.timeout_ms,()=>req.destroy(fail('ETIMEDOUT','Offline V2 backend request timed out','network',0)));
    req.on('error',e=>{if(!e.kind)e.kind='network';if(!e.code)e.code='OFFLINE_V2_NETWORK_ERROR';reject(e)});
    req.end(body);
  });
}

async function claimNextDueScopedUnsafe(now,ctx){
  await exec('BEGIN IMMEDIATE TRANSACTION');
  try{
    const row=await get(`SELECT o.* FROM offline_v2_outbox o
      WHERE o.device_id=? AND o.business_id=? AND o.employee_id=?
        AND o.status IN ('pending','retryable')
        AND (o.next_retry_at IS NULL OR o.next_retry_at<=?)
        AND (o.depends_on_tx_id IS NULL OR EXISTS(
          SELECT 1 FROM offline_v2_outbox p
          WHERE p.client_tx_id=o.depends_on_tx_id AND p.status='synced'
        ))
      ORDER BY o.device_sequence LIMIT 1`,[ctx.identity.device_id,ctx.identity.business_id,ctx.employee_id,now]);
    if(!row){await exec('COMMIT');return null}
    const changed=await run(`UPDATE offline_v2_outbox SET status='syncing',attempts=attempts+1,last_attempt_at=?,next_retry_at=NULL,updated_at=? WHERE client_tx_id=? AND status IN ('pending','retryable')`,[now,now,row.client_tx_id]);
    if(changed.changes!==1){await exec('ROLLBACK');return null}
    const claimed=await get('SELECT * FROM offline_v2_outbox WHERE client_tx_id=?',[row.client_tx_id]);
    await exec('COMMIT');return hydrate(claimed);
  }catch(e){try{await exec('ROLLBACK')}catch{}throw e}
}
async function claimNextDueScoped(now,ctx){await ready();return serial(()=>claimNextDueScopedUnsafe(now,ctx))}

async function refreshBlockedDependenciesUnsafe(ctx){
  const now=nowIso();
  // Children that cannot yet resolve their parent are explicitly blocked for
  // diagnostics instead of silently spinning or disappearing from the queue.
  await run(`UPDATE offline_v2_outbox SET status='blocked',next_retry_at=NULL,last_error_code='OFFLINE_V2_DEPENDENCY_PENDING',last_error_message='Waiting for acknowledged parent mapping',updated_at=?
    WHERE device_id=? AND business_id=? AND employee_id=? AND status IN ('pending','retryable') AND depends_on_tx_id IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM offline_v2_outbox p JOIN offline_v2_mappings m ON m.client_tx_id=p.client_tx_id AND m.server_id IS NOT NULL WHERE p.client_tx_id=offline_v2_outbox.depends_on_tx_id AND p.status='synced')`,[now,ctx.identity.device_id,ctx.identity.business_id,ctx.employee_id]);
  const r=await run(`UPDATE offline_v2_outbox SET status='pending',next_retry_at=NULL,last_error_code=NULL,last_error_message=NULL,updated_at=?
    WHERE device_id=? AND business_id=? AND employee_id=? AND status='blocked' AND last_error_code IN ('OFFLINE_V2_DEPENDENCY_PENDING','OFFLINE_V2_DEPENDENCY_MAPPING_MISSING')
      AND EXISTS(SELECT 1 FROM offline_v2_outbox p JOIN offline_v2_mappings m ON m.client_tx_id=p.client_tx_id AND m.server_id IS NOT NULL WHERE p.client_tx_id=offline_v2_outbox.depends_on_tx_id AND p.status='synced')`,[now,ctx.identity.device_id,ctx.identity.business_id,ctx.employee_id]);
  return {ok:true,resumed:r.changes};
}
async function refreshBlockedDependencies(ctx){await ready();return serial(()=>refreshBlockedDependenciesUnsafe(ctx))}
async function transition(clientTx,fromStatus,toStatus,error){
  await ready();return serial(async()=>{const now=nowIso();const r=await run(`UPDATE offline_v2_outbox SET status=?,next_retry_at=NULL,last_error_code=?,last_error_message=?,updated_at=? WHERE client_tx_id=? AND status=?`,[toStatus,text(error?.code)||`OFFLINE_V2_${toStatus.toUpperCase()}`,text(error?.message)||toStatus,now,text(clientTx),fromStatus]);if(r.changes!==1)throw fail('OFFLINE_V2_STATE_TRANSITION_REJECTED',`Offline V2 ${toStatus} transition rejected: ${text(clientTx)}`);return hydrate(await get('SELECT * FROM offline_v2_outbox WHERE client_tx_id=?',[text(clientTx)]))})
}
function markBlocked(tx,error){return transition(tx,'syncing','blocked',error)}
function markDeadLetter(tx,error){return transition(tx,'syncing','dead_letter',error)}

async function manualRetry(input={}){
  const tx=text(input.client_tx_id);if(!tx)throw fail('OFFLINE_V2_CLIENT_TX_REQUIRED','client_tx_id is required');
  const identity={device_id:text(input?.device_id),business_id:text(input?.business_id),device_fingerprint:text(input?.device_fingerprint)};
  await ready();return serial(async()=>{
    const state=await readTakeoverState();if(!sameIdentity(state.identity,identity))throw fail('OFFLINE_V2_IDENTITY_MISMATCH','Offline V2 manual retry identity mismatch');
    const row=await get('SELECT * FROM offline_v2_outbox WHERE client_tx_id=?',[tx]);if(!row)throw fail('OFFLINE_V2_EVENT_NOT_FOUND','Offline V2 event not found');
    if(row.device_id!==identity.device_id||row.business_id!==identity.business_id)throw fail('OFFLINE_V2_EVENT_SCOPE_MISMATCH','Offline V2 event belongs to another scope');
    if(row.status==='synced')return {ok:true,already_synced:true,event:hydrate(row)};
    if(row.status==='syncing')throw fail('OFFLINE_V2_EVENT_IN_FLIGHT','Offline V2 event is currently syncing');
    if(row.last_error_code==='OFFLINE_V2_LEGACY_PRESERVED')throw fail('OFFLINE_V2_LEGACY_AUTHORITY_ACTIVE','Legacy-authoritative event cannot be manually retried from V2');
    const now=nowIso();await run(`UPDATE offline_v2_outbox SET status='pending',next_retry_at=NULL,last_error_code='OFFLINE_V2_MANUAL_RETRY',last_error_message='Manual safe retry requested',updated_at=? WHERE client_tx_id=?`,[now,tx]);
    return {ok:true,event:hydrate(await get('SELECT * FROM offline_v2_outbox WHERE client_tx_id=?',[tx]))};
  });
}

async function assertRuntimeState(ctx,{active=false}={}){
  const state=await readTakeoverState();
  if(!sameIdentity(state.identity,ctx.identity))throw fail('OFFLINE_V2_IDENTITY_MISMATCH','Offline V2 transport identity mismatch');
  if(state.migration_verified!==true)throw fail('OFFLINE_V2_MIGRATION_NOT_VERIFIED','Offline V2 migration is not verified');
  if(state.transport_ready!==true)throw fail('OFFLINE_V2_TRANSPORT_NOT_READY','Offline V2 transport is not attested');
  if(active&&state.active!==true)throw fail('OFFLINE_V2_TAKEOVER_NOT_ACTIVE','Offline V2 takeover is not active');
  return state;
}

async function syncNow(input={}){
  const ctx=validateContext(input,true);await assertRuntimeState(ctx,{active:true});
  const scoped={
    ...input.store,
  };
  // Use the native store for atomic ACK/mapping writes, but scope claiming to
  // the current canonical device/business/employee session.
  const baseStore=installOfflineV2Transport._store;
  const adapter={
    ...baseStore,
    claimNextDue:now=>claimNextDueScoped(now,ctx),
    refreshBlockedDependencies:()=>refreshBlockedDependencies(ctx),
    markBlocked,markDeadLetter
  };
  const engine=createSyncEngine({
    store:adapter,
    transport:{send:event=>postRpc(ctx,APPLY_RPC,{p_event:event})},
    identityProvider:async()=>({device_fingerprint:ctx.identity.device_fingerprint})
  });
  const result=await engine.syncOnce(Math.max(1,Math.min(250,num(input.max_per_run,100))));
  return {...result,transport_version:TRANSPORT_VERSION,stats:await baseStore.syncStats()};
}

async function attestTransport(input={}){
  if(input?.approved!==true)throw fail('OFFLINE_V2_APPROVAL_REQUIRED','Offline V2 transport attestation requires explicit approval');
  const ctx=validateContext(input,true),state=await readTakeoverState();
  if(!state.armed||!state.migration_verified)throw fail('OFFLINE_V2_MIGRATION_NOT_VERIFIED','Arm and verify migration before transport attestation');
  if(!sameIdentity(state.identity,ctx.identity))throw fail('OFFLINE_V2_IDENTITY_MISMATCH','Offline V2 transport attestation identity mismatch');
  const info=await postRpc(ctx,INFO_RPC,{});
  if(info?.ok!==true||num(info?.protocol_version)!==2||text(info?.transport_version)!=='1')throw fail('OFFLINE_V2_TRANSPORT_ATTEST_FAILED','Backend Offline V2 transport contract did not attest protocol v2');
  const next={...state,transport_ready:true,transport_version:TRANSPORT_VERSION,transport_protocol_version:2,transport_backend_host:new URL(ctx.url).hostname,transport_attested_at:nowIso()};
  await writeTakeoverState(next);return clone(next);
}

function installOfflineV2Transport(store){
  if(installed)return {syncNow,manualRetry,attestTransport};
  if(!store||typeof store.markAcked!=='function'||typeof store.markRetryable!=='function'||typeof store.markConflict!=='function'||typeof store.syncStats!=='function')throw new Error('Offline V2 transport requires native store adapter');
  installOfflineV2Transport._store=store;installed=true;
  ipcMain.handle('offline-v2:sync-now',(_e,input)=>syncNow(input));
  ipcMain.handle('offline-v2:manual-retry',(_e,input)=>manualRetry(input));
  ipcMain.handle('offline-v2:transport-attest',(_e,input)=>attestTransport(input));
  ready().catch(e=>console.error('Offline V2 transport init failed',e));
  return {syncNow,manualRetry,attestTransport};
}

module.exports={installOfflineV2Transport,TRANSPORT_VERSION,APPLY_RPC,INFO_RPC};
