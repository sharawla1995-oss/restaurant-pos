'use strict';

// Sharawla Offline Engine V2 — Phase 8 safety boundary.
// Provides device-bound offline authorization, destructive-operation guards,
// verified Native SQLite snapshots/last-good recovery candidates, startup
// recovery for stale syncing rows, and local-device report summaries.
const {app,ipcMain}=require('electron');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const sqlite3=require('sqlite3');

const VERSION='8.0';
const AUTH_VERSION=1;
const PBKDF2_ITERATIONS=210000;
const GUARD_FILE='offline-v2-guard-state.json';
const AUTH_FILE='offline-v2-offline-auth.enc.json';
const AUTH_KEY_FILE='offline-v2-auth.key';
const STARTUP_FILE='offline-v2-startup-report.json';
const UNRESOLVED_STATUSES=['pending','syncing','retryable','blocked','conflict','dead_letter'];
let installed=false;
let storeRef=null;
let refreshChain=Promise.resolve();

function nowIso(){return new Date().toISOString()}
function text(v){return String(v??'').trim()}
function num(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function userPath(name){return path.join(app.getPath('userData'),name)}
function dbPath(){return userPath('sharawla-offline-v2.sqlite')}
function guardPath(){return userPath(GUARD_FILE)}
function authPath(){return userPath(AUTH_FILE)}
function authKeyPath(){return userPath(AUTH_KEY_FILE)}
function startupPath(){return userPath(STARTUP_FILE)}
function lastGoodPath(){return userPath('sharawla-offline-v2.lastgood.sqlite')}
function backupDir(){const d=path.join(app.getPath('documents'),'SharawlaPOS','Backups','OfflineV2');fs.mkdirSync(d,{recursive:true});return d}
function safeToken(v){return text(v).replace(/[^0-9A-Za-z._-]/g,'-')||'unknown'}
function stamp(){return new Date().toISOString().replace(/[:.]/g,'-')}
function sha256Buffer(v){return crypto.createHash('sha256').update(v).digest('hex')}
function sha256File(p){const h=crypto.createHash('sha256');h.update(fs.readFileSync(p));return h.digest('hex')}
function timingEqualHex(a,b){try{const x=Buffer.from(String(a),'hex'),y=Buffer.from(String(b),'hex');return x.length===y.length&&x.length>0&&crypto.timingSafeEqual(x,y)}catch{return false}}

function writeJsonAtomic(target,value){
  fs.mkdirSync(path.dirname(target),{recursive:true});
  const tmp=`${target}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  let made=false;
  try{
    fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{encoding:'utf8',flag:'wx'});made=true;
    try{const fd=fs.openSync(tmp,'r');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}catch{}
    fs.copyFileSync(tmp,target);
    try{const fd=fs.openSync(target,'r+');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}catch{}
    return value;
  }finally{if(made)try{fs.unlinkSync(tmp)}catch{}}
}
function copyAtomic(source,target){
  const tmp=`${target}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  let made=false;
  try{
    fs.copyFileSync(source,tmp,fs.constants.COPYFILE_EXCL);made=true;
    try{const fd=fs.openSync(tmp,'r');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}catch{}
    fs.copyFileSync(tmp,target);
    try{const fd=fs.openSync(target,'r+');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}catch{}
    return target;
  }finally{if(made)try{fs.unlinkSync(tmp)}catch{}}
}

function canonicalIdentity(raw){return {device_id:text(raw?.device_id),business_id:text(raw?.business_id),device_fingerprint:text(raw?.device_fingerprint)}}
function requireCanonicalIdentity(raw){
  const x=canonicalIdentity(raw);
  if(!x.device_id||!x.business_id||!x.device_fingerprint){const e=new Error('Offline V2 canonical device identity is required');e.code='OFFLINE_V2_CANONICAL_IDENTITY_REQUIRED';throw e}
  return x;
}
function sameIdentity(a,b){a=canonicalIdentity(a);b=canonicalIdentity(b);return a.device_id===b.device_id&&a.business_id===b.business_id&&a.device_fingerprint===b.device_fingerprint}
function licenseExpiry(license){
  const verified=Date.parse(license?.last_verified_at||'');
  const days=Math.max(0,num(license?.offline_grace_days));
  if(!Number.isFinite(verified))return null;
  return new Date(verified+days*86400000).toISOString();
}
function assertLicenseIdentity(license,identity){
  if(text(license?.device_id)&&text(license.device_id)!==identity.device_id)throw Object.assign(new Error('Offline authorization device mismatch'),{code:'OFFLINE_V2_AUTH_DEVICE_MISMATCH'});
  if(text(license?.business_id)&&text(license.business_id)!==identity.business_id)throw Object.assign(new Error('Offline authorization business mismatch'),{code:'OFFLINE_V2_AUTH_BUSINESS_MISMATCH'});
  if(text(license?.device_fingerprint)&&text(license.device_fingerprint)!==identity.device_fingerprint)throw Object.assign(new Error('Offline authorization canonical fingerprint mismatch'),{code:'OFFLINE_V2_AUTH_FINGERPRINT_MISMATCH'});
}

function ensureAuthKey(){
  const p=authKeyPath();
  if(fs.existsSync(p)){
    const b=fs.readFileSync(p);if(b.length!==32)throw new Error('Offline V2 auth key is invalid');return b;
  }
  const key=crypto.randomBytes(32);fs.writeFileSync(p,key,{flag:'wx',mode:0o600});try{fs.chmodSync(p,0o600)}catch{}return key;
}
function authAad(identity){return Buffer.from(`SharawlaOfflineV2Auth|${AUTH_VERSION}|${identity.device_id}|${identity.business_id}`,'utf8')}
function encryptAuth(payload,identity){
  const key=ensureAuthKey(),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(authAad(identity));
  const body=Buffer.concat([cipher.update(Buffer.from(JSON.stringify(payload),'utf8')),cipher.final()]);
  return {version:AUTH_VERSION,algorithm:'AES-256-GCM',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:body.toString('base64')};
}
function decryptAuth(identity){
  if(!fs.existsSync(authPath()))return null;
  const sealed=JSON.parse(fs.readFileSync(authPath(),'utf8'));
  if(num(sealed?.version)!==AUTH_VERSION||sealed?.algorithm!=='AES-256-GCM')throw new Error('Offline V2 auth envelope is unsupported');
  const key=ensureAuthKey(),dec=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(sealed.iv,'base64'));dec.setAAD(authAad(identity));dec.setAuthTag(Buffer.from(sealed.tag,'base64'));
  return JSON.parse(Buffer.concat([dec.update(Buffer.from(sealed.ciphertext,'base64')),dec.final()]).toString('utf8'));
}
function passwordDigest(password,saltHex){return crypto.pbkdf2Sync(String(password),Buffer.from(saltHex,'hex'),PBKDF2_ITERATIONS,32,'sha256').toString('hex')}

async function authEnroll(input={}){
  const identity=requireCanonicalIdentity(input.identity),license=clone(input.license||{}),bootstrap=clone(input.bootstrap||{}),email=text(input.email).toLowerCase(),password=String(input.password||'');
  assertLicenseIdentity(license,identity);
  if(!email||!password)throw Object.assign(new Error('Offline authorization credentials are required'),{code:'OFFLINE_V2_AUTH_CREDENTIALS_REQUIRED'});
  if(!bootstrap?.employee?.id)throw Object.assign(new Error('Offline authorization requires a cached employee/bootstrap snapshot'),{code:'OFFLINE_V2_AUTH_BOOTSTRAP_REQUIRED'});
  const validUntil=licenseExpiry(license);if(!validUntil||Date.now()>Date.parse(validUntil))throw Object.assign(new Error('Offline license grace is not valid for enrollment'),{code:'OFFLINE_V2_AUTH_GRACE_EXPIRED'});
  const salt=crypto.randomBytes(16).toString('hex');
  const payload={
    version:AUTH_VERSION,identity,email,password_salt:salt,password_hash:passwordDigest(password,salt),
    enrolled_at:nowIso(),valid_until:validUntil,last_verified_at:license.last_verified_at||null,
    offline_grace_days:Math.max(0,num(license.offline_grace_days)),employee_id:num(bootstrap.employee.id),
    role:text(bootstrap.employee.role),bootstrap,
    bootstrap_digest:sha256Buffer(Buffer.from(JSON.stringify(bootstrap),'utf8'))
  };
  writeJsonAtomic(authPath(),encryptAuth(payload,identity));
  return {ok:true,enrolled:true,email,employee_id:payload.employee_id,role:payload.role,valid_until:validUntil,enrolled_at:payload.enrolled_at,identity_bound:true};
}
async function authVerify(input={}){
  const identity=requireCanonicalIdentity(input.identity),email=text(input.email).toLowerCase(),password=String(input.password||'');
  const payload=decryptAuth(identity);if(!payload)throw Object.assign(new Error('لا يوجد تسجيل Offline آمن لهذا المستخدم على الجهاز'),{code:'OFFLINE_V2_AUTH_NOT_ENROLLED'});
  if(!sameIdentity(payload.identity,identity))throw Object.assign(new Error('Offline authorization identity mismatch'),{code:'OFFLINE_V2_AUTH_IDENTITY_MISMATCH'});
  if(text(payload.email).toLowerCase()!==email)throw Object.assign(new Error('بيانات الدخول غير صحيحة أو غير مسجلة للعمل Offline'),{code:'OFFLINE_V2_AUTH_EMAIL_MISMATCH'});
  if(Date.now()>Date.parse(payload.valid_until||0))throw Object.assign(new Error('انتهت مدة السماح للعمل Offline. وصّل الإنترنت للتحقق من الترخيص.'),{code:'OFFLINE_V2_AUTH_GRACE_EXPIRED'});
  if(!timingEqualHex(passwordDigest(password,payload.password_salt),payload.password_hash))throw Object.assign(new Error('بيانات الدخول غير صحيحة'),{code:'OFFLINE_V2_AUTH_PASSWORD_INVALID'});
  if(!payload.bootstrap?.employee?.id||num(payload.bootstrap.employee.id)!==num(payload.employee_id))throw Object.assign(new Error('Offline authorization bootstrap is invalid'),{code:'OFFLINE_V2_AUTH_BOOTSTRAP_INVALID'});
  if(sha256Buffer(Buffer.from(JSON.stringify(payload.bootstrap),'utf8'))!==payload.bootstrap_digest)throw Object.assign(new Error('Offline authorization bootstrap integrity mismatch'),{code:'OFFLINE_V2_AUTH_BOOTSTRAP_TAMPERED'});
  return {ok:true,offline_authorized:true,email:payload.email,employee_id:payload.employee_id,role:payload.role,valid_until:payload.valid_until,bootstrap:clone(payload.bootstrap),identity_bound:true};
}
async function authState(input={}){
  try{
    const identity=requireCanonicalIdentity(input.identity),payload=decryptAuth(identity);if(!payload)return {ok:true,enrolled:false,valid:false};
    const match=sameIdentity(payload.identity,identity),valid=match&&Date.now()<=Date.parse(payload.valid_until||0);
    return {ok:true,enrolled:true,valid,identity_match:match,email:payload.email,employee_id:payload.employee_id,role:payload.role,enrolled_at:payload.enrolled_at,valid_until:payload.valid_until};
  }catch(e){return {ok:false,enrolled:fs.existsSync(authPath()),valid:false,error:e.message,code:e.code||null}}
}
async function authClear(){try{if(fs.existsSync(authPath()))fs.unlinkSync(authPath())}catch{}return {ok:true,cleared:true}}

function unresolvedCount(counts){return UNRESOLVED_STATUSES.reduce((n,k)=>n+num(counts?.[k]),0)}
async function liveGuardState(reason='read'){
  if(!storeRef)throw new Error('Offline V2 safety store is not installed');
  let stats,health;
  try{[stats,health]=await Promise.all([storeRef.syncStats(),storeRef.health()])}
  catch(e){const bad={version:VERSION,ok:false,clear:false,reason,updated_at:nowIso(),unresolved_count:null,critical_count:null,error:text(e?.message||e),integrity_ok:false,counts:{}};writeJsonAtomic(guardPath(),bad);return bad}
  const counts=clone(stats?.counts||{}),unresolved=unresolvedCount(counts),critical=num(counts.blocked)+num(counts.conflict)+num(counts.dead_letter);
  const state={version:VERSION,ok:health?.ok===true,clear:health?.ok===true&&unresolved===0,reason,updated_at:nowIso(),unresolved_count:unresolved,critical_count:critical,counts,integrity_ok:health?.ok===true,database:health?.database||dbPath(),journal_mode:health?.journal_mode||null,synchronous:health?.synchronous??null,foreign_keys:health?.foreign_keys??null,inbox_count:num(stats?.inbox_count),mapped_count:num(stats?.mapped_count)};
  writeJsonAtomic(guardPath(),state);return state;
}
function refreshGuard(reason='mutation'){const next=refreshChain.then(()=>liveGuardState(reason),()=>liveGuardState(reason));refreshChain=next.catch(()=>{});return next}
function assertGuardClear(state,action='destructive operation'){
  if(state?.clear===true)return state;
  const e=new Error(`تم منع ${action}: يوجد عمل محلي غير متزامن أو حالة Offline V2 غير سليمة`);e.code='OFFLINE_V2_GUARD_BLOCKED';e.guard=state;throw e;
}

function openSqlite(file,flags=sqlite3.OPEN_READWRITE){return new Promise((resolve,reject)=>{const d=new sqlite3.Database(file,flags,err=>err?reject(err):resolve(d))})}
function dbGet(db,sql,params=[]){return new Promise((resolve,reject)=>db.get(sql,params,(e,row)=>e?reject(e):resolve(row)))}
function dbRun(db,sql,params=[]){return new Promise((resolve,reject)=>db.run(sql,params,function(e){if(e)reject(e);else resolve({changes:this.changes,lastID:this.lastID})}))}
function dbClose(db){return new Promise(resolve=>db.close(()=>resolve()))}
function sqlQuotePath(p){return String(p).replace(/'/g,"''")}
async function verifySqliteFile(file){const d=await openSqlite(file,sqlite3.OPEN_READONLY);try{const row=await dbGet(d,'PRAGMA integrity_check');return String(Object.values(row||{})[0]||'').toLowerCase()==='ok'}finally{await dbClose(d)}}
async function createSqliteSnapshot(reason='manual'){
  const state=await liveGuardState(`backup:${reason}`);if(!state.integrity_ok)throw Object.assign(new Error('Offline V2 database integrity check failed; backup aborted'),{code:'OFFLINE_V2_BACKUP_SOURCE_INVALID'});
  const dir=backupDir(),target=path.join(dir,`sharawla-offline-v2-${safeToken(reason)}-${stamp()}.sqlite`),tmp=`${target}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const source=await openSqlite(dbPath(),sqlite3.OPEN_READWRITE);
  let tmpMade=false;
  try{
    await dbRun(source,'PRAGMA busy_timeout=5000');
    await dbRun(source,`VACUUM INTO '${sqlQuotePath(tmp)}'`);tmpMade=true;
  }finally{await dbClose(source)}
  try{
    if(!fs.existsSync(tmp)||fs.statSync(tmp).size<=0)throw new Error('Offline V2 snapshot is empty');
    if(!(await verifySqliteFile(tmp)))throw new Error('Offline V2 snapshot integrity verification failed');
    fs.renameSync(tmp,target);tmpMade=false;
    const digest=sha256File(target),manifest={version:VERSION,reason,created_at:nowIso(),database:path.basename(target),size:fs.statSync(target).size,sha256:digest,integrity:'ok',guard:{clear:state.clear,unresolved_count:state.unresolved_count,critical_count:state.critical_count,counts:state.counts}};
    writeJsonAtomic(`${target}.manifest.json`,manifest);copyAtomic(target,lastGoodPath());writeJsonAtomic(`${lastGoodPath()}.manifest.json`,manifest);
    pruneBackups();return {ok:true,path:target,manifest,last_good:lastGoodPath()};
  }finally{if(tmpMade)try{fs.unlinkSync(tmp)}catch{}}
}
function pruneBackups(max=20){try{const files=fs.readdirSync(backupDir()).filter(n=>n.endsWith('.sqlite')).map(n=>({n,p:path.join(backupDir(),n),t:fs.statSync(path.join(backupDir(),n)).mtimeMs})).sort((a,b)=>b.t-a.t);for(const f of files.slice(max)){try{fs.unlinkSync(f.p)}catch{}try{fs.unlinkSync(`${f.p}.manifest.json`)}catch{}}}catch{}}
async function recoveryState(){
  const health=await storeRef.health().catch(e=>({ok:false,error:e.message})),last=lastGoodPath();let lastGood=null;
  if(fs.existsSync(last)){try{lastGood={path:last,size:fs.statSync(last).size,sha256:sha256File(last),integrity:(await verifySqliteFile(last))?'ok':'failed'}}catch(e){lastGood={path:last,integrity:'failed',error:e.message}}}
  return {ok:health?.ok===true,primary:health,last_good:lastGood,recovery_required:health?.ok!==true,recovery_mode:health?.ok===true?'normal':(lastGood?.integrity==='ok'?'manual-restore-available':'blocked-no-valid-snapshot')};
}
async function startupRecovery(){
  const started=nowIso();let recovered=0,error=null,health=null;
  try{
    const cutoff=new Date(Date.now()-60000).toISOString();const r=await storeRef.recoverStaleSyncing(cutoff,nowIso());recovered=num(r?.recovered);health=await storeRef.health();
    if(health?.ok===true){const g=await refreshGuard('startup-recovery');if(g.clear===true)createSqliteSnapshot('startup-last-good').catch(()=>{});}
  }catch(e){error=text(e?.message||e);await refreshGuard('startup-recovery-failed').catch(()=>{})}
  const report={version:VERSION,started_at:started,finished_at:nowIso(),recovered_stale_syncing:recovered,health,error};writeJsonAtomic(startupPath(),report);return report;
}

function operationAmount(row){
  const env=row?.envelope||{},p=env.payload||{},rpc=p.rpc_payload||{},op=text(row?.operation_type||env.operation_type);
  if(op==='sale')return num(rpc?.p_order?.total??p?.p_order?.total??env?.legacy_payload?.p_order?.total);
  if(op==='return')return num((rpc?.p_payments||p?.p_payments||env?.legacy_payload?.p_payments||[]).reduce?.((a,x)=>a+num(x?.amount),0));
  if(op==='expense')return num(rpc?.p_amount??p?.p_amount??env?.legacy_payload?.p_amount);
  return 0;
}
async function localReport(input={}){
  const branch=num(input.branch_id),limit=Math.max(1,Math.min(200,num(input.limit,100))),rows=await storeRef.listOutbox();
  const scoped=rows.filter(r=>!branch||num(r.branch_id)===branch).sort((a,b)=>num(b.device_sequence)-num(a.device_sequence));
  const counts={};let sale_total=0,return_total=0,expense_total=0;
  for(const r of scoped){counts[r.status]=(counts[r.status]||0)+1;const amount=operationAmount(r);if(r.operation_type==='sale')sale_total+=amount;else if(r.operation_type==='return')return_total+=amount;else if(r.operation_type==='expense')expense_total+=amount}
  return {ok:true,source:'local-device',consolidated:false,branch_id:branch||null,generated_at:nowIso(),counts,unsynced_count:unresolvedCount(counts),sale_total,return_total,expense_total,net_operational_total:sale_total-return_total-expense_total,rows:scoped.slice(0,limit).map(r=>({client_tx_id:r.client_tx_id,device_sequence:r.device_sequence,operation_type:r.operation_type,status:r.status,created_local_at:r.created_local_at,amount:operationAmount(r),last_error_code:r.last_error_code||null,last_error_message:r.last_error_message||null}))};
}

function wrapStoreMethod(name){
  const base=storeRef?.[name];if(typeof base!=='function'||base.__offlineV2SafetyWrapped)return;
  const wrapped=async(...args)=>{const out=await base(...args);await refreshGuard(name);return out};wrapped.__offlineV2SafetyWrapped=true;storeRef[name]=wrapped;
}

function installOfflineV2Safety(store){
  if(installed)return {guard:liveGuardState,backup:createSqliteSnapshot,recovery:recoveryState};
  if(!store||typeof store.syncStats!=='function'||typeof store.health!=='function'||typeof store.listOutbox!=='function'||typeof store.recoverStaleSyncing!=='function')throw new Error('Offline V2 Phase 8 safety requires native store adapter');
  installed=true;storeRef=store;
  for(const name of ['commitOperation','importShadow','markRetryable','markConflict','markAcked','recoverStaleSyncing'])wrapStoreMethod(name);

  ipcMain.handle('offline-v2:guard-state',()=>liveGuardState('ipc'));
  ipcMain.handle('offline-v2:guard-assert',async(_e,input={})=>{const s=await liveGuardState(`guard:${text(input.action)||'operation'}`);assertGuardClear(s,text(input.action)||'operation');return {ok:true,allowed:true,guard:s}});
  ipcMain.handle('offline-v2:auth-enroll',(_e,input)=>authEnroll(input));
  ipcMain.handle('offline-v2:auth-verify',(_e,input)=>authVerify(input));
  ipcMain.handle('offline-v2:auth-state',(_e,input)=>authState(input));
  ipcMain.handle('offline-v2:auth-clear',()=>authClear());
  ipcMain.handle('offline-v2:backup-create',(_e,input={})=>createSqliteSnapshot(text(input.reason)||'manual'));
  ipcMain.handle('offline-v2:recovery-state',()=>recoveryState());
  ipcMain.handle('offline-v2:local-report',(_e,input={})=>localReport(input));
  ipcMain.handle('offline-v2:startup-report',()=>{try{return JSON.parse(fs.readFileSync(startupPath(),'utf8'))}catch{return null}});

  app.whenReady().then(()=>startupRecovery()).catch(e=>console.error('Offline V2 Phase 8 startup recovery failed',e));
  return {guard:liveGuardState,backup:createSqliteSnapshot,recovery:recoveryState,startup:startupRecovery};
}

module.exports={installOfflineV2Safety,VERSION,AUTH_VERSION,UNRESOLVED_STATUSES};
