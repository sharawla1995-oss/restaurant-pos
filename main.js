const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const initSqlJs = require('sql.js');
let db, SQL, mainWindow;
function dataDir(){const d=path.join(app.getPath('userData'),'data');fs.mkdirSync(d,{recursive:true});return d}
function dbPath(){return path.join(dataDir(),'topburger-pos.sqlite')}
function lastGoodDbPath(){return path.join(dataDir(),'topburger-pos.lastgood.sqlite')}
function backupDir(){const d=path.join(app.getPath('documents'),'TopBurgerPOS','Backups');fs.mkdirSync(d,{recursive:true});return d}

function licenseStatePath(){return path.join(dataDir(),'sharawla-license-state.json')}
function readLicenseStateFile(){
  try{const p=licenseStatePath();if(!fs.existsSync(p))return null;const v=JSON.parse(fs.readFileSync(p,'utf8'));return v&&typeof v==='object'?v:null}catch{return null}
}
function writeLicenseStateFile(v){
  const p=licenseStatePath();
  if(v==null){
    try{if(fs.existsSync(p)){try{fs.chmodSync(p,0o600)}catch{}fs.unlinkSync(p)}}catch{}
    // Clean up only stale license temp files; never touch POS database temp files.
    try{for(const n of fs.readdirSync(dataDir()))if(/^sharawla-license-state\.json\.tmp(?:-|$)/.test(n)){try{fs.unlinkSync(path.join(dataDir(),n))}catch{}}}catch{}
    return true;
  }
  const json=JSON.stringify(v);
  // A unique temp name avoids Windows 7 EPERM caused by a stale/locked fixed .tmp file.
  const tmp=`${p}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  let wroteTmp=false;
  try{
    fs.writeFileSync(tmp,json,{encoding:'utf8',flag:'wx'});wroteTmp=true;
    try{const fd=fs.openSync(tmp,'r');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}catch{}
    try{fs.copyFileSync(tmp,p)}catch(copyErr){
      // Fallback for Windows file replacement edge cases. The state is still tied to device fingerprint in Cloud.
      try{if(fs.existsSync(p)){try{fs.chmodSync(p,0o600)}catch{}fs.unlinkSync(p)}}catch{}
      try{fs.renameSync(tmp,p);wroteTmp=false}catch(renameErr){
        try{fs.writeFileSync(p,json,'utf8')}catch{throw copyErr}
      }
    }
    return true;
  }finally{
    if(wroteTmp)try{fs.unlinkSync(tmp)}catch{}
  }
}
function persistDb(){if(!db)return;const bytes=Buffer.from(db.export()),p=dbPath(),tmp=p+'.tmp';try{if(fs.existsSync(p))fs.copyFileSync(p,lastGoodDbPath())}catch{}fs.writeFileSync(tmp,bytes);try{const fd=fs.openSync(tmp,'r');fs.fsyncSync(fd);fs.closeSync(fd)}catch{}fs.copyFileSync(tmp,p);try{fs.unlinkSync(tmp)}catch{}}
async function openDb(){
  SQL=await initSqlJs({locateFile:f=>path.join(__dirname,'node_modules','sql.js','dist',f)});
  const p=dbPath();
  if(fs.existsSync(p)){try{db=new SQL.Database(fs.readFileSync(p))}catch{try{db=new SQL.Database(fs.readFileSync(lastGoodDbPath()))}catch{db=new SQL.Database()}}}
  else if(fs.existsSync(lastGoodDbPath())){try{db=new SQL.Database(fs.readFileSync(lastGoodDbPath()))}catch{db=new SQL.Database()}}
  else db=new SQL.Database();
  db.run(`
create table if not exists kv(key text primary key,value text not null,updated_at text not null default(datetime('now')));
create table if not exists local_operations(id integer primary key autoincrement,client_tx_id text unique not null,type text not null,payload text not null,status text not null default 'pending',attempts integer not null default 0,last_error text,created_at text not null default(datetime('now')),updated_at text not null default(datetime('now')));
create index if not exists local_operations_status_idx on local_operations(status,created_at);
create table if not exists sync_log(id integer primary key autoincrement,client_tx_id text,type text,status text,message text,created_at text not null default(datetime('now')));
`);
  persistDb();
}
function one(sql,params=[]){const s=db.prepare(sql);try{s.bind(params);if(!s.step())return undefined;return s.getAsObject()}finally{s.free()}}
function all(sql,params=[]){const s=db.prepare(sql);const out=[];try{s.bind(params);while(s.step())out.push(s.getAsObject());return out}finally{s.free()}}
function run(sql,params=[]){db.run(sql,params);persistDb();return true}
function stamp(){return new Date().toISOString().replace(/[:.]/g,'-')}
function createBackup(reason='manual'){if(!db)return null;persistDb();const target=path.join(backupDir(),`topburger-pos-${reason}-${stamp()}.sqlite`);fs.copyFileSync(dbPath(),target);return target}
function pruneBackups(max=30){try{const a=fs.readdirSync(backupDir()).filter(x=>x.endsWith('.sqlite')).map(n=>({n,p:path.join(backupDir(),n),t:fs.statSync(path.join(backupDir(),n)).mtimeMs})).sort((a,b)=>b.t-a.t);for(const f of a.slice(max))fs.unlinkSync(f.p)}catch{}}
function saveJsonBackup(json,reason='full'){const target=path.join(backupDir(),`topburger-pos-${reason}-${stamp()}.json`);fs.writeFileSync(target,String(json||''),'utf8');pruneJsonBackups(15);return target}
function pruneJsonBackups(max=15){try{const a=fs.readdirSync(backupDir()).filter(x=>x.endsWith('.json')).map(n=>({p:path.join(backupDir(),n),t:fs.statSync(path.join(backupDir(),n)).mtimeMs})).sort((a,b)=>b.t-a.t);for(const f of a.slice(max))fs.unlinkSync(f.p)}catch{}}

// ===== V10.5.4 Part 3 — Update Safety: Offline Queue Guard + Pre-Update Backup =====
function safeFileToken(value){return String(value||'unknown').replace(/[^0-9A-Za-z._-]/g,'-')}
function readDesktopQueueSnapshot(){
  const result={ok:true,queue:[],error:null};
  try{
    const row=one('select value from kv where key=?',['queue']);
    if(!row)return result;
    const parsed=JSON.parse(row.value);
    if(parsed==null)return result;
    if(!Array.isArray(parsed))throw new Error('Offline queue snapshot is not an array');
    result.queue=parsed;
  }catch(e){result.ok=false;result.error=String(e&&e.message||e)}
  return result;
}
function updateOfflineQueueState(){
  if(!db)return {ok:false,clear:false,pendingCount:null,queueCount:null,operationsCount:null,types:[],error:'Local database is not ready'};
  const snapshot=readDesktopQueueSnapshot();
  let rows=[];
  let operationsError=null;
  try{rows=all(`select client_tx_id,type,status,created_at,updated_at from local_operations where status='pending' order by id`)}
  catch(e){operationsError=String(e&&e.message||e)}
  const ids=new Set(),types=new Set();
  for(let i=0;i<snapshot.queue.length;i++){
    const op=snapshot.queue[i]||{};
    ids.add(String(op.client_tx_id||`queue-${i}`));
    if(op.type)types.add(String(op.type));
  }
  for(const row of rows){
    ids.add(String(row.client_tx_id||`operation-${ids.size}`));
    if(row.type)types.add(String(row.type));
  }
  const error=snapshot.error||operationsError||null;
  const pendingCount=ids.size;
  return {
    ok:!error,
    clear:!error&&pendingCount===0,
    pendingCount,
    queueCount:snapshot.queue.length,
    operationsCount:rows.length,
    types:[...types],
    error
  };
}
function latestPreUpdateBackup(){
  try{
    const rows=fs.readdirSync(backupDir())
      .filter(n=>/^topburger-pos-pre-update-.*\.sqlite$/i.test(n))
      .map(n=>{const p=path.join(backupDir(),n),st=fs.statSync(p);return {name:n,path:p,size:st.size,createdAt:new Date(st.mtimeMs).toISOString(),time:st.mtimeMs}})
      .sort((a,b)=>b.time-a.time);
    if(!rows.length)return null;
    const {time,...latest}=rows[0];
    return latest;
  }catch{return null}
}
function createPreUpdateBackup(remoteVersion){
  if(!db)throw new Error('Local database is not ready');
  const local=safeFileToken(app.getVersion());
  const remote=safeFileToken(remoteVersion);
  const dir=backupDir();
  const target=path.join(dir,`topburger-pos-pre-update-${local}-to-${remote}-${stamp()}.sqlite`);
  const tmp=`${target}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  let tempExists=false;
  let targetCreated=false;
  let success=false;
  try{
    // Export directly from the current in-memory SQLite state using an independent pre-update backup path.
    const bytes=Buffer.from(db.export());
    if(!bytes.length)throw new Error('Pre-update database export is empty');

    // Never overwrite an existing finalized backup, even in the unlikely event of a name collision.
    if(fs.existsSync(target))throw new Error('Pre-update backup target already exists');

    const fd=fs.openSync(tmp,'wx');
    tempExists=true;
    try{
      fs.writeFileSync(fd,bytes);
      fs.fsyncSync(fd);
    }finally{fs.closeSync(fd)}

    const tmpStat=fs.statSync(tmp);
    if(!tmpStat.isFile()||tmpStat.size!==bytes.length||tmpStat.size<=0)throw new Error('Pre-update temporary backup verification failed');

    try{
      fs.renameSync(tmp,target);
      tempExists=false;
      targetCreated=true;
    }catch(renameErr){
      // Fallback for Windows filesystem edge cases. COPYFILE_EXCL guarantees the final target is never overwritten.
      fs.copyFileSync(tmp,target,fs.constants.COPYFILE_EXCL);
      targetCreated=true;
      const copied=fs.statSync(target);
      if(!copied.isFile()||copied.size!==bytes.length||copied.size<=0)throw new Error(`Pre-update copied backup verification failed: ${renameErr.message||renameErr}`);
      fs.unlinkSync(tmp);
      tempExists=false;
    }

    // Flush the finalized backup file too, so both rename and copy-fallback paths are durable before install is allowed.
    const finalFd=fs.openSync(target,'r+');
    try{fs.fsyncSync(finalFd)}finally{fs.closeSync(finalFd)}

    const st=fs.statSync(target);
    if(!st.isFile()||st.size!==bytes.length||st.size<=0)throw new Error('Pre-update backup verification failed');
    pruneBackups(30);
    success=true;
    return {name:path.basename(target),path:target,size:st.size,createdAt:new Date(st.mtimeMs).toISOString()};
  }finally{
    if(tempExists)try{fs.unlinkSync(tmp)}catch{}
    if(targetCreated&&!success)try{fs.unlinkSync(target)}catch{}
  }
}
function updateSafetyInfo(){
  const queue=updateOfflineQueueState();
  const safety=readUpdateSafetyState();
  return {
    queue,
    lastPreUpdateBackup:latestPreUpdateBackup(),
    backupDirectory:backupDir(),
    lastKnownGood:safety.lastKnownGood||null,
    previousLastKnownGood:safety.previousLastKnownGood||null,
    pendingUpdate:safety.pendingUpdate||null,
    lastHealth:safety.lastHealth||null,
    lastIntegrity:safety.lastIntegrity||null,
    rollbackTarget:rollbackTargetForState(safety),
    rollbackAvailable:rollbackAvailability(),
    updateLogPath:updateLogPath()
  };
}
function updateQueueGuardMessage(queue){
  if(!queue||queue.ok===false)return `تعذر التحقق من الحركات المحلية قبل التحديث${queue?.error?`: ${queue.error}`:''}. تم منع التحديث احتياطيًا.`;
  const n=Number(queue.pendingCount||0);
  return n?`يوجد ${n} حركة أوفلاين في انتظار المزامنة. تم منع التحديث لحماية البيانات. وصّل الإنترنت وانتظر اكتمال المزامنة ثم أعد المحاولة.`:'كل الحركات المحلية متزامنة.';
}


// ===== V10.5.4-beta.10 — Update Safety Bundle =====
// Integrity -> health check -> Last Known Good -> rollback preparation -> update log.
function updateSafetyStatePath(){return path.join(app.getPath('userData'),'update-safety-state.json')}
function updateLogPath(){return path.join(app.getPath('userData'),'update-log.jsonl')}
function readUpdateSafetyState(){
  try{
    const raw=JSON.parse(fs.readFileSync(updateSafetyStatePath(),'utf8'));
    return {
      schema:Number(raw?.schema||1),
      lastKnownGood:raw?.lastKnownGood||null,
      previousLastKnownGood:raw?.previousLastKnownGood||null,
      pendingUpdate:raw?.pendingUpdate||null,
      lastHealth:raw?.lastHealth||null,
      lastIntegrity:raw?.lastIntegrity||null,
      lastTransaction:raw?.lastTransaction||null,
      updatedAt:raw?.updatedAt||null
    };
  }catch{return {schema:1,lastKnownGood:null,previousLastKnownGood:null,pendingUpdate:null,lastHealth:null,lastIntegrity:null,lastTransaction:null}}
}
function writeJsonAtomicUnique(target,value){
  fs.mkdirSync(path.dirname(target),{recursive:true});
  const tmp=`${target}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  let made=false;
  try{
    fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{encoding:'utf8',flag:'wx'});made=true;
    try{const fd=fs.openSync(tmp,'r');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}catch{}
    fs.copyFileSync(tmp,target);
    try{const fd=fs.openSync(target,'r+');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}catch{}
    const verify=JSON.parse(fs.readFileSync(target,'utf8'));
    if(!verify||typeof verify!=='object')throw new Error('Update safety state verification failed');
    return value;
  }finally{if(made)try{fs.unlinkSync(tmp)}catch{}}
}
function writeUpdateSafetyState(next){writeJsonAtomicUnique(updateSafetyStatePath(),next);return next}
function updateSafetyStatePatch(patch){
  const current=readUpdateSafetyState();
  const next={...current,...patch,schema:1,updatedAt:new Date().toISOString()};
  return writeUpdateSafetyState(next);
}
function logUpdateEvent(stage,data={}){
  const clean={};
  for(const [k,v] of Object.entries(data||{})){
    if(v===undefined)continue;
    clean[k]=v instanceof Error?String(v.message||v):v;
  }
  const row={at:new Date().toISOString(),stage:String(stage||'unknown'),...clean};
  try{fs.appendFileSync(updateLogPath(),JSON.stringify(row)+'\n','utf8')}catch(e){console.warn('update log',e)}
  return row;
}
function expectedAssetSha256(asset){
  const digest=String(asset&&asset.digest||'').trim().toLowerCase();
  const m=digest.match(/^sha256:([0-9a-f]{64})$/);
  if(!m)throw new Error('GitHub release asset has no valid SHA-256 digest');
  return m[1];
}
function sha256File(file){
  return new Promise((resolve,reject)=>{
    const hash=crypto.createHash('sha256');
    const stream=fs.createReadStream(file);
    stream.on('data',chunk=>hash.update(chunk));
    stream.on('error',reject);
    stream.on('end',()=>resolve(hash.digest('hex')));
  });
}
async function verifyInstallerIntegrity(file,asset){
  const expected=expectedAssetSha256(asset);
  const expectedSize=Number(asset&&asset.size||0);
  if(!Number.isFinite(expectedSize)||expectedSize<=0)throw new Error('GitHub release asset has no valid file size');
  const st=fs.statSync(file);
  if(!st.isFile()||st.size!==expectedSize)throw new Error(`Installer size mismatch: expected ${expectedSize}, got ${st.size}`);
  const actual=await sha256File(file);
  if(actual!==expected)throw new Error(`Installer SHA-256 mismatch: expected ${expected}, got ${actual}`);
  return {ok:true,algorithm:'sha256',expected,actual,sha256:actual,size:st.size,expectedSize,verifiedAt:new Date().toISOString()};
}
function requiredRuntimeFiles(){return ['index.html','app.js','preload.js','main.js','sharawla-runtime-core.js','restaurant-engine.js','version.json','update-ui.js','version-ui.js']}
function licenseIdentitySnapshot(){
  try{
    const st=readLicenseStateFile();
    if(!st||!st.device_id||!st.device_fingerprint)return {deviceId:null,fingerprintHash:null};
    return {deviceId:String(st.device_id),fingerprintHash:crypto.createHash('sha256').update(String(st.device_fingerprint)).digest('hex')};
  }catch{return {deviceId:null,fingerprintHash:null}}
}
function runLocalHealthChecks(expectedVersion=null,pending=null){
  const checks=[];
  const add=(name,ok,detail='')=>checks.push({name,ok:!!ok,detail:String(detail||'')});
  const current=String(app.getVersion()||'');
  add('version',!expectedVersion||current===String(expectedVersion),`current=${current}${expectedVersion?`, expected=${expectedVersion}`:''}`);
  for(const name of requiredRuntimeFiles()){
    try{const st=fs.statSync(path.join(__dirname,name));add(`file:${name}`,st.isFile()&&st.size>0,`${st.size} bytes`)}catch(e){add(`file:${name}`,false,String(e&&e.message||e))}
  }
  if(!db)add('database-ready',false,'Local database is not ready');
  else{
    add('database-ready',true,'open');
    try{const row=one('pragma integrity_check');const val=row?String(Object.values(row)[0]||''):'';add('database-integrity',val.toLowerCase()==='ok',val||'no result')}catch(e){add('database-integrity',false,String(e&&e.message||e))}
    for(const table of ['kv','local_operations']){
      try{one(`select count(*) as c from ${table}`);add(`table:${table}`,true,'readable')}catch(e){add(`table:${table}`,false,String(e&&e.message||e))}
    }
  }
  const id=licenseIdentitySnapshot();
  add('license-state',!!id.deviceId&&!!id.fingerprintHash,id.deviceId?'canonical identity present':'missing canonical identity');
  if(pending?.deviceId||pending?.fingerprintHash)add('license-identity',id.deviceId===pending.deviceId&&id.fingerprintHash===pending.fingerprintHash,'canonical identity unchanged');
  return {ok:checks.every(c=>c.ok),phase:'core',version:current,expectedVersion:expectedVersion||null,checkedAt:new Date().toISOString(),checks};
}
function findCachedInstaller(version,arch=process.arch){
  try{
    const dir=path.join(app.getPath('userData'),'updates');if(!fs.existsSync(dir))return null;
    const token=safeFileToken(version).toLowerCase(),archTokens=arch==='ia32'?['ia32','x86','win32']:['x64','amd64','win64'];
    const rows=fs.readdirSync(dir).filter(n=>/\.exe$/i.test(n)&&n.toLowerCase().includes(token));
    const picked=rows.find(n=>archTokens.some(t=>n.toLowerCase().includes(t)))||rows[0];
    return picked?path.join(dir,picked):null;
  }catch{return null}
}
function prepareRollbackCandidate({local,remote,backup,installerPath,integrity,mode='update',rollbackOf=null}){
  const identity=licenseIdentitySnapshot(),previousInstaller=findCachedInstaller(local,process.arch);
  const candidate={
    id:crypto.randomBytes(8).toString('hex'),mode:String(mode||'update'),
    fromVersion:String(local),toVersion:String(remote),preparedAt:new Date().toISOString(),
    preUpdateBackup:backup||null,previousInstallerPath:previousInstaller,previousInstallerAvailable:!!previousInstaller,
    incomingInstallerPath:installerPath,incomingIntegrity:integrity||null,
    deviceId:identity.deviceId,fingerprintHash:identity.fingerprintHash,rollbackOf:rollbackOf||null,automaticRollbackEnabled:false
  };
  const pendingUpdate={...candidate,status:'install-pending',coreHealth:null,rendererHealth:null};
  updateSafetyStatePatch({pendingUpdate});
  logUpdateEvent('ROLLBACK_PREPARED',{transactionId:candidate.id,mode:candidate.mode,fromVersion:local,toVersion:remote,previousInstallerAvailable:!!previousInstaller,backupName:backup&&backup.name});
  return pendingUpdate;
}
function markCurrentVersionLastKnownGood(health,source='health-check'){
  if(!health||health.ok!==true)throw new Error('Cannot mark Last Known Good before full health check passes');
  const state=readUpdateSafetyState();
  const currentVersion=String(app.getVersion()||'');
  const oldLkg=state.lastKnownGood||null;
  let previous=state.previousLastKnownGood||null;

  // Rotate history only when the newly confirmed healthy version is different.
  // This preserves the immediately previous healthy version for explicit rollback.
  if(oldLkg?.version&&String(oldLkg.version)!==currentVersion)previous=oldLkg;

  const lkg={
    version:currentVersion,
    channel:readDeviceUpdateChannel(readUpdateConfig()),
    arch:process.arch,
    confirmedAt:new Date().toISOString(),
    source,
    health
  };
  updateSafetyStatePatch({lastKnownGood:lkg,previousLastKnownGood:previous,lastHealth:health});
  logUpdateEvent('LKG_CONFIRMED',{
    version:lkg.version,
    previousVersion:previous?.version||null,
    source
  });
  return lkg;
}
function rollbackTargetForState(state=readUpdateSafetyState(),currentVersion=String(app.getVersion()||'')){
  const current=String(currentVersion||'');
  const currentLkg=state?.lastKnownGood||null;
  const previous=state?.previousLastKnownGood||null;

  // If the current build failed health, lastKnownGood is already the correct rollback target.
  if(currentLkg?.version&&String(currentLkg.version)!==current)return currentLkg;

  // If the current build is healthy, rollback means the immediately previous healthy build.
  if(previous?.version&&String(previous.version)!==current)return previous;

  return null;
}
function rollbackAvailability(){
  return !!rollbackTargetForState();
}
function runPostUpdateHealthCheck(){
  const state=readUpdateSafetyState(),pending=state.pendingUpdate||null,expected=pending?.toVersion||null;
  const core=runLocalHealthChecks(expected,pending);
  if(!pending){
    updateSafetyStatePatch({lastHealth:core});
    logUpdateEvent('HEALTH_BASELINE_CORE',{version:core.version,ok:core.ok,failedChecks:core.checks.filter(c=>!c.ok).map(c=>c.name)});
    return core;
  }
  logUpdateEvent('POST_UPDATE_CORE_HEALTH',{transactionId:pending.id,fromVersion:pending.fromVersion,toVersion:pending.toVersion,currentVersion:core.version,ok:core.ok,failedChecks:core.checks.filter(c=>!c.ok).map(c=>c.name)});
  if(core.ok)updateSafetyStatePatch({pendingUpdate:{...pending,status:'awaiting-renderer-health',coreHealth:core},lastHealth:core});
  else{
    updateSafetyStatePatch({pendingUpdate:{...pending,status:'health-failed',coreHealth:core,rollbackRecommended:true,automaticRollbackEnabled:false},lastHealth:core});
    logUpdateEvent('ROLLBACK_RECOMMENDED',{transactionId:pending.id,reason:'core-health-failed',fromVersion:pending.fromVersion,toVersion:pending.toVersion});
  }
  return core;
}
async function applyRendererHealthReport(report={}){
  const state=readUpdateSafetyState(),pending=state.pendingUpdate||null,rendererOk=report?.ok===true;
  const renderer={ok:rendererOk,phase:String(report?.phase||'renderer'),message:String(report?.message||''),checks:report?.checks&&typeof report.checks==='object'?report.checks:{},checkedAt:new Date().toISOString(),version:String(app.getVersion()||'')};
  if(pending){
    const core=pending.coreHealth;
    if(rendererOk&&(!core||core.ok!==true||pending.status==='health-failed')){
      const failed={ok:false,phase:'combined',version:String(app.getVersion()||''),checkedAt:new Date().toISOString(),core:core||null,renderer,reason:'core-health-not-passed'};
      updateSafetyStatePatch({pendingUpdate:{...pending,status:'health-failed',rendererHealth:renderer,rollbackRecommended:true,automaticRollbackEnabled:false},lastHealth:failed});
      logUpdateEvent('RENDERER_HEALTH_REJECTED',{transactionId:pending.id,reason:'core-health-not-passed'});
      return {ok:false,health:failed,rollbackAvailable:rollbackAvailability(),lastKnownGood:state.lastKnownGood||null};
    }
    if(!rendererOk){
      const failed={ok:false,phase:'combined',version:String(app.getVersion()||''),checkedAt:new Date().toISOString(),core:core||null,renderer,reason:'renderer-health-failed'};
      updateSafetyStatePatch({pendingUpdate:{...pending,status:'health-failed',rendererHealth:renderer,rollbackRecommended:true,automaticRollbackEnabled:false},lastHealth:failed});
      logUpdateEvent('POST_UPDATE_RENDERER_HEALTH_FAIL',{transactionId:pending.id,phase:renderer.phase,message:renderer.message});
      logUpdateEvent('ROLLBACK_RECOMMENDED',{transactionId:pending.id,reason:'renderer-health-failed',fromVersion:pending.fromVersion,toVersion:pending.toVersion});
      return {ok:false,health:failed,rollbackAvailable:rollbackAvailability(),lastKnownGood:state.lastKnownGood||null};
    }
    const combined={ok:true,phase:'combined',version:String(app.getVersion()||''),checkedAt:new Date().toISOString(),core,renderer};
    const lkg=markCurrentVersionLastKnownGood(combined,pending.mode==='rollback'?'rollback-health':'post-update-health');
    updateSafetyStatePatch({pendingUpdate:null,lastHealth:combined,lastTransaction:{...pending,status:'healthy',rendererHealth:renderer,finishedAt:combined.checkedAt}});
    logUpdateEvent(pending.mode==='rollback'?'ROLLBACK_SUCCESS':'UPDATE_SUCCESS',{transactionId:pending.id,fromVersion:pending.fromVersion,toVersion:pending.toVersion,lastKnownGood:lkg.version});
    return {ok:true,health:combined,lastKnownGood:lkg,previousLastKnownGood:readUpdateSafetyState().previousLastKnownGood||null,rollbackAvailable:rollbackAvailability()};
  }
  const core=runLocalHealthChecks(null,null);
  if(!rendererOk||!core.ok){
    const failed={ok:false,phase:'combined-baseline',version:String(app.getVersion()||''),checkedAt:new Date().toISOString(),core,renderer};
    updateSafetyStatePatch({lastHealth:failed});
    logUpdateEvent('HEALTH_BASELINE_FAIL',{failedCore:core.checks.filter(c=>!c.ok).map(c=>c.name),rendererOk});
    return {ok:false,health:failed,rollbackAvailable:rollbackAvailability(),lastKnownGood:state.lastKnownGood||null};
  }
  const combined={ok:true,phase:'combined-baseline',version:String(app.getVersion()||''),checkedAt:new Date().toISOString(),core,renderer};
  const lkg=markCurrentVersionLastKnownGood(combined,'baseline-full-health');
  updateSafetyStatePatch({lastHealth:combined});
  logUpdateEvent('HEALTH_BASELINE_PASS',{version:lkg.version});
  return {ok:true,health:combined,lastKnownGood:lkg,previousLastKnownGood:readUpdateSafetyState().previousLastKnownGood||null,rollbackAvailable:rollbackAvailability()};
}
function selectWindowsInstallerAsset(rel,arch=process.arch){
  const assets=Array.isArray(rel?.assets)?rel.assets:[],exeAssets=assets.filter(a=>/\.exe$/i.test(a?.name||'')),wantedArch=arch==='ia32'?'ia32':'x64';
  const archPattern=wantedArch==='ia32'?/(?:^|[._-])(?:ia32|x86|win32)(?:[._-]|$)/i:/(?:^|[._-])(?:x64|amd64|win64)(?:[._-]|$)/i;
  let asset=exeAssets.find(a=>archPattern.test(String(a?.name||'')));
  if(!asset&&wantedArch==='x64')asset=exeAssets.find(a=>/Top[ ._-]*Burger[ ._-]*POS/i.test(a?.name||''))||exeAssets.find(a=>!/ia32|x86|win32/i.test(String(a?.name||'')));
  if(!asset?.browser_download_url)throw new Error(`No Windows ${wantedArch} installer asset found`);
  return asset;
}
async function rollbackToLastKnownGood({confirmFirst=true}={}){
  const state=readUpdateSafetyState(),current=String(app.getVersion()||''),cfg=readUpdateConfig();
  const lkg=rollbackTargetForState(state,current);
  if(!lkg?.version)return {ok:false,error:'لا توجد نسخة سابقة سليمة متاحة للرجوع'};
  const gateA=updateOfflineQueueState();
  if(!gateA.clear){
    const message=updateQueueGuardMessage(gateA);
    if(mainWindow)await dialog.showMessageBox(mainWindow,{type:'warning',title:'تم منع الرجوع لحماية البيانات',message:'لا يمكن الرجوع لنسخة سابقة الآن.',detail:message,buttons:['تمام']});
    return {ok:false,blocked:true,reason:'offline-queue'};
  }
  if(confirmFirst&&mainWindow){
    const c=await dialog.showMessageBox(mainWindow,{type:'warning',title:'الرجوع لآخر نسخة سليمة',message:`الرجوع من V${current} إلى V${lkg.version}?`,detail:'سيتم تنزيل النسخة السابقة والتحقق من الحجم وSHA-256 ثم إنشاء Backup جديد. قاعدة البيانات الحالية لن تُحذف.',buttons:['الرجوع الآن','إلغاء'],defaultId:1,cancelId:1});
    if(c.response!==0)return {ok:false,cancelled:true};
  }
  try{
    logUpdateEvent('ROLLBACK_REQUESTED',{fromVersion:current,toVersion:lkg.version});
    const base=`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
    const rel=await githubJson(`${base}/releases/tags/${encodeURIComponent('v'+lkg.version)}`),asset=selectWindowsInstallerAsset(rel,process.arch);
    const dir=path.join(app.getPath('userData'),'updates','rollback');fs.mkdirSync(dir,{recursive:true});
    const target=path.join(dir,asset.name||`Sharawla-POS-${lkg.version}-${process.arch}.exe`);
    sendUpdateProgress({state:'downloading',local:current,remote:lkg.version,percent:0,message:`جاري تنزيل نسخة الرجوع V${lkg.version}`});
    await downloadFile(asset.browser_download_url,target,p=>sendUpdateProgress({state:'progress',local:current,remote:lkg.version,percent:p.percent,message:p.percent==null?'جاري تنزيل نسخة الرجوع…':`جاري تنزيل نسخة الرجوع — ${p.percent}%`}));
    sendUpdateProgress({state:'verifying-integrity',local:current,remote:lkg.version,percent:100,message:'جاري التحقق من سلامة نسخة الرجوع…'});
    const integrity=await verifyInstallerIntegrity(target,asset);
    logUpdateEvent('ROLLBACK_INTEGRITY_PASS',{fromVersion:current,toVersion:lkg.version,sha256:integrity.actual,size:integrity.size});
    const gateB=updateOfflineQueueState();if(!gateB.clear)throw new Error(updateQueueGuardMessage(gateB));
    const backup=createPreUpdateBackup(lkg.version);
    const gateC=updateOfflineQueueState();if(!gateC.clear)throw new Error(updateQueueGuardMessage(gateC));
    const priorPending=readUpdateSafetyState().pendingUpdate;
    const pending=prepareRollbackCandidate({local:current,remote:lkg.version,backup,installerPath:target,integrity,mode:'rollback',rollbackOf:priorPending?.id||null});
    sendUpdateProgress({state:'installing',local:current,remote:lkg.version,percent:100,backupName:backup.name,message:'جاري بدء الرجوع للنسخة السليمة…'});
    logUpdateEvent('ROLLBACK_SPAWN',{transactionId:pending.id,fromVersion:current,toVersion:lkg.version,backupName:backup.name});
    spawn(target,['/S'],{detached:true,stdio:'ignore'}).unref();
    setTimeout(()=>app.quit(),600);
    return {ok:true,fromVersion:current,toVersion:lkg.version,backup};
  }catch(e){
    logUpdateEvent('ROLLBACK_FAIL',{fromVersion:current,toVersion:lkg.version,error:String(e&&e.message||e)});
    if(mainWindow)await dialog.showMessageBox(mainWindow,{type:'warning',title:'تعذر الرجوع',message:'لم يتم تشغيل نسخة الرجوع.',detail:String(e&&e.message||e),buttons:['تمام']});
    return {ok:false,error:String(e&&e.message||e)};
  }
}


// ===== V10.4.5 GitHub Windows Auto Update =====
const https = require('https');
const { spawn } = require('child_process');
let updateCheckBusy = false;
function readUpdateConfig(){
  try{return JSON.parse(fs.readFileSync(path.join(__dirname,'update-config.json'),'utf8'))}catch{return {enabled:false}}
}
function normalizeUpdateChannel(value){return String(value||'').trim().toLowerCase()==='beta'?'beta':'stable'}
function updateChannelPath(){return path.join(app.getPath('userData'),'update-channel.json')}
function initialUpdateChannel(cfg){
  const version=String(app.getVersion()||'');
  if(/-(?:alpha|beta|rc|preview)(?:[.-]|$)/i.test(version))return 'beta';
  return normalizeUpdateChannel(cfg&&cfg.channel);
}
function readDeviceUpdateChannel(cfg=readUpdateConfig()){
  try{
    const p=updateChannelPath();
    if(fs.existsSync(p)){const row=JSON.parse(fs.readFileSync(p,'utf8'));return normalizeUpdateChannel(row&&row.channel)}
    const channel=initialUpdateChannel(cfg);
    fs.writeFileSync(p,JSON.stringify({channel},null,2),'utf8');
    return channel;
  }catch{return initialUpdateChannel(cfg)}
}
function writeDeviceUpdateChannel(value){
  const channel=normalizeUpdateChannel(value),p=updateChannelPath(),tmp=p+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify({channel},null,2),'utf8');
  fs.copyFileSync(tmp,p);try{fs.unlinkSync(tmp)}catch{}
  return channel;
}
function parseSemver(value){
  const raw=String(value||'').trim().replace(/^v/i,'');
  const m=raw.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if(!m)return null;
  return {raw,major:Number(m[1]),minor:Number(m[2]),patch:Number(m[3]),pre:m[4]?m[4].split('.'):[]};
}
function compareSemver(aValue,bValue){
  const a=parseSemver(aValue),b=parseSemver(bValue);if(!a||!b)return 0;
  for(const k of ['major','minor','patch']){if(a[k]>b[k])return 1;if(a[k]<b[k])return -1}
  if(!a.pre.length&&!b.pre.length)return 0;if(!a.pre.length)return 1;if(!b.pre.length)return -1;
  const n=Math.max(a.pre.length,b.pre.length);
  for(let i=0;i<n;i++){
    if(i>=a.pre.length)return -1;if(i>=b.pre.length)return 1;
    const x=a.pre[i],y=b.pre[i],xn=/^\d+$/.test(x),yn=/^\d+$/.test(y);
    if(xn&&yn){const nx=Number(x),ny=Number(y);if(nx>ny)return 1;if(nx<ny)return -1;continue}
    if(xn&&!yn)return -1;if(!xn&&yn)return 1;if(x>y)return 1;if(x<y)return -1;
  }
  return 0;
}
function isNewerVersion(remote,local){return compareSemver(remote,local)>0}
function releaseVersion(rel){return String(rel&&rel.tag_name||'').trim().replace(/^v/i,'')}
function validRelease(rel){return !!rel&&!rel.draft&&!!parseSemver(releaseVersion(rel))}
async function getReleaseForChannel(cfg,channel){
  const base=`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
  if(channel==='stable'){
    const rel=await githubJson(`${base}/releases/latest`);
    if(!validRelease(rel)||rel.prerelease)throw new Error('No valid stable release found');
    return rel;
  }
  const rows=await githubJson(`${base}/releases?per_page=50`);
  const releases=(Array.isArray(rows)?rows:[])
    .filter(rel=>validRelease(rel)&&rel.prerelease===true)
    .sort((a,b)=>compareSemver(releaseVersion(b),releaseVersion(a)));
  if(!releases.length)throw new Error('No valid beta prerelease found');
  return releases[0];
}
function githubJson(url){
  return new Promise((resolve,reject)=>{
    const req=https.get(url,{headers:{'User-Agent':'Sharawla-POS-Updater','Accept':'application/vnd.github+json'}},res=>{
      if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();return githubJson(res.headers.location).then(resolve,reject)}
      let body='';res.setEncoding('utf8');res.on('data',c=>body+=c);res.on('end',()=>{
        if(res.statusCode!==200)return reject(new Error('GitHub HTTP '+res.statusCode));
        try{resolve(JSON.parse(body))}catch(e){reject(e)}
      })
    });req.on('error',reject);req.setTimeout(15000,()=>req.destroy(new Error('Update check timeout')))
  })
}
function sendUpdateProgress(payload){
  try{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('update:progress',payload)}catch{}
  try{if(mainWindow&&!mainWindow.isDestroyed()&&payload&&payload.state==='progress'&&Number.isFinite(payload.percent))mainWindow.setProgressBar(Math.max(0,Math.min(1,payload.percent/100)))}catch{}
  if(payload&&['done','downloaded','available','up-to-date','error','idle'].includes(payload.state)){try{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.setProgressBar(-1)}catch{}}
}
function downloadFile(url,target,onProgress){
  return new Promise((resolve,reject)=>{
    let finished=false;
    const fail=e=>{if(finished)return;finished=true;reject(e)};
    const go=u=>{
      const req=https.get(u,{headers:{'User-Agent':'Sharawla-POS-Updater','Accept':'application/octet-stream'}},res=>{
        if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();return go(res.headers.location)}
        if(res.statusCode!==200){res.resume();return fail(new Error('Download HTTP '+res.statusCode))}
        const tmp=target+'.part';try{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}catch{}
        const total=Math.max(0,Number(res.headers['content-length']||0));let received=0,lastPercent=-1;
        const file=fs.createWriteStream(tmp);
        res.on('data',chunk=>{received+=chunk.length;const percent=total?Math.min(100,Math.floor((received/total)*100)):null;if(percent!==lastPercent){lastPercent=percent;try{onProgress&&onProgress({received,total,percent})}catch{}}});
        res.pipe(file);
        file.on('finish',()=>file.close(()=>{if(finished)return;try{if(fs.existsSync(target))fs.unlinkSync(target);fs.renameSync(tmp,target);finished=true;resolve(target)}catch(e){fail(e)}}));
        file.on('error',e=>{try{file.close();if(fs.existsSync(tmp))fs.unlinkSync(tmp)}catch{}fail(e)});
        res.on('error',fail);
      });
      req.on('error',fail);req.setTimeout(120000,()=>req.destroy(new Error('Update download timeout')))
    };go(url)
  })
}
async function checkForWindowsUpdate({interactive=false,checkOnly=false}={}){
  const cfg=readUpdateConfig();
  const local=app.getVersion();
  const channel=readDeviceUpdateChannel(cfg);

  if(updateCheckBusy){
    const result={busy:true,local,channel};
    if(interactive)sendUpdateProgress({state:'busy',local,channel,message:'يوجد فحص تحديثات جارٍ بالفعل'});
    return result;
  }
  if(!app.isPackaged){
    const result={error:'Update check is available in the installed Windows app only',local,channel};
    if(interactive)sendUpdateProgress({state:'error',local,channel,message:'فحص التحديثات متاح من نسخة Windows المثبتة فقط'});
    return result;
  }
  if(!cfg.enabled||!cfg.owner||!cfg.repo){
    const result={error:'Updater is disabled or repository is not configured',local,channel};
    if(interactive)sendUpdateProgress({state:'error',local,channel,message:'نظام التحديث غير مفعّل في هذه النسخة'});
    return result;
  }

  const priorSafety=readUpdateSafetyState();
  if(priorSafety.pendingUpdate){
    const result={blocked:true,reason:'post-update-health-pending',local,channel,health:priorSafety.lastHealth||null};
    if(interactive)sendUpdateProgress({state:'health-failed',local,channel,message:'يوجد تحديث سابق لم يُحسم فحصه الصحي بعد'});
    return result;
  }

  updateCheckBusy=true;let userAcceptedUpdate=false;
  try{
    sendUpdateProgress({state:'checking',local,channel,message:'جاري فحص التحديثات…'});
    logUpdateEvent('CHECK',{local,channel,interactive:!!interactive,checkOnly:!!checkOnly});
    const rel=await getReleaseForChannel(cfg,channel);
    const remote=releaseVersion(rel);

    if(!isNewerVersion(remote,local)){
      sendUpdateProgress({state:'up-to-date',local,remote,channel,message:`أنت على أحدث إصدار V${local}`});
      if(interactive&&mainWindow)await dialog.showMessageBox(mainWindow,{type:'info',title:'تحديث Sharawla POS',message:`أنت على أحدث إصدار V${local}.`,buttons:['تمام']});
      return {available:false,local,remote,channel,checkOnly:!!checkOnly};
    }

    sendUpdateProgress({state:'available',local,remote,channel,message:checkOnly?`متاح تحديث V${remote} — فحص فقط`:`متاح تحديث V${remote}`});

    // Manual Check must never download or install. It only reports availability.
    if(checkOnly)return {available:true,checkOnly:true,local,remote,channel};

    const assets=Array.isArray(rel.assets)?rel.assets:[];
    const exeAssets=assets.filter(a=>/\.exe$/i.test(a.name||''));
    const wantedArch=process.arch==='ia32'?'ia32':'x64';
    const archPattern=wantedArch==='ia32'?/(?:^|[._-])(?:ia32|x86|win32)(?:[._-]|$)/i:/(?:^|[._-])(?:x64|amd64|win64)(?:[._-]|$)/i;
    let asset=exeAssets.find(a=>archPattern.test(String(a.name||'')));

    // Backward compatibility for old x64-only releases that used a generic EXE name.
    if(!asset&&wantedArch==='x64')asset=exeAssets.find(a=>/Top[ ._-]*Burger[ ._-]*POS/i.test(a.name||''))||exeAssets.find(a=>!/ia32|x86|win32/i.test(String(a.name||'')));
    if(!asset?.browser_download_url)throw new Error(`No Windows ${wantedArch} installer asset found in selected ${channel} release`);

    const ask=await dialog.showMessageBox(mainWindow,{type:'info',title:'تحديث جديد متاح',message:`متاح تحديث Sharawla POS V${remote}`,detail:'قبل التنزيل والتثبيت سيتأكد Sharawla POS أن كل الحركات الأوفلاين متزامنة. وقبل التثبيت سيتم إنشاء Backup محلي تلقائي.',buttons:['تنزيل وتثبيت','لاحقًا'],defaultId:0,cancelId:1});
    if(ask.response!==0){
      sendUpdateProgress({state:'available',local,remote,channel,skipped:true,message:`التحديث V${remote} متاح — تم التأجيل`});
      return {available:true,skipped:true,local,remote,channel};
    }

    userAcceptedUpdate=true;
    logUpdateEvent('UPDATE_ACCEPTED',{local,remote,channel});

    // Gate A: do not even start the update while any offline operation is pending.
    const beforeDownload=updateOfflineQueueState();
    logUpdateEvent('GATE_A',{local,remote,clear:beforeDownload.clear,pendingCount:beforeDownload.pendingCount,error:beforeDownload.error||null});
    if(!beforeDownload.clear){
      const message=updateQueueGuardMessage(beforeDownload);
      sendUpdateProgress({state:'blocked-offline',local,remote,channel,pendingCount:beforeDownload.pendingCount,message});
      if(mainWindow)await dialog.showMessageBox(mainWindow,{type:'warning',title:'تم منع التحديث لحماية البيانات',message:'لا يمكن تحديث Sharawla POS الآن.',detail:message,buttons:['تمام']});
      return {available:true,blocked:true,reason:'offline-queue',pendingCount:beforeDownload.pendingCount,local,remote,channel};
    }

    const dir=path.join(app.getPath('userData'),'updates');fs.mkdirSync(dir,{recursive:true});
    const target=path.join(dir,asset.name||`Sharawla-POS-${remote}.exe`);

    sendUpdateProgress({state:'downloading',local,remote,channel,version:remote,percent:0,pendingCount:0,message:`جاري تنزيل التحديث V${remote}`});
    await downloadFile(asset.browser_download_url,target,p=>sendUpdateProgress({state:'progress',local,remote,channel,version:remote,percent:p.percent,received:p.received,total:p.total,pendingCount:0,message:p.percent==null?'جاري تنزيل التحديث…':`جاري تنزيل التحديث V${remote} — ${p.percent}%`}));

    logUpdateEvent('DOWNLOAD_COMPLETE',{local,remote,channel,asset:asset.name||path.basename(target)});
    sendUpdateProgress({state:'verifying-integrity',local,remote,channel,version:remote,percent:100,message:'جاري التحقق من SHA-256 لملف التحديث…'});
    let installerIntegrity;
    try{
      installerIntegrity=await verifyInstallerIntegrity(target,asset);
      updateSafetyStatePatch({lastIntegrity:installerIntegrity});
      logUpdateEvent('INTEGRITY_PASS',{local,remote,channel,asset:asset.name||path.basename(target),sha256:installerIntegrity.actual,size:installerIntegrity.size});
    }catch(e){
      updateSafetyStatePatch({lastIntegrity:{ok:false,assetName:asset.name||path.basename(target),error:String(e&&e.message||e),verifiedAt:new Date().toISOString()}});
      logUpdateEvent('INTEGRITY_FAIL',{local,remote,channel,asset:asset.name||path.basename(target),error:String(e&&e.message||e)});
      try{if(fs.existsSync(target))fs.unlinkSync(target)}catch{}
      const message=`فشل التحقق من سلامة ملف التحديث: ${String(e&&e.message||e)}`;
      sendUpdateProgress({state:'integrity-error',local,remote,channel,version:remote,percent:100,message,error:String(e&&e.message||e)});
      if(mainWindow)await dialog.showMessageBox(mainWindow,{type:'warning',title:'تم منع التثبيت لحماية البرنامج',message:'لن يتم تثبيت ملف تحديث لم يجتز فحص SHA-256.',detail:message,buttons:['تمام']});
      return {available:true,downloaded:false,blocked:true,reason:'integrity-failed',local,remote,channel,error:String(e&&e.message||e)};
    }

    sendUpdateProgress({state:'downloaded',local,remote,channel,version:remote,percent:100,message:`تم تنزيل التحديث V${remote} والتحقق من سلامته`});

    // Gate B: queue may have changed while the installer was downloading. Check again.
    const beforeInstall=updateOfflineQueueState();
    logUpdateEvent('GATE_B',{local,remote,clear:beforeInstall.clear,pendingCount:beforeInstall.pendingCount,error:beforeInstall.error||null});
    if(!beforeInstall.clear){
      const message=updateQueueGuardMessage(beforeInstall);
      sendUpdateProgress({state:'blocked-offline',local,remote,channel,version:remote,percent:100,pendingCount:beforeInstall.pendingCount,message});
      if(mainWindow)await dialog.showMessageBox(mainWindow,{type:'warning',title:'تم منع التثبيت لحماية البيانات',message:'تم تنزيل التحديث لكن لن يتم تثبيته الآن.',detail:message,buttons:['تمام']});
      return {available:true,downloaded:true,blocked:true,reason:'offline-queue',pendingCount:beforeInstall.pendingCount,local,remote,channel};
    }

    // Backup is fail-closed: if it cannot be created and verified, installation is blocked.
    sendUpdateProgress({state:'backing-up',local,remote,channel,version:remote,percent:100,pendingCount:0,message:'جاري إنشاء Backup آمن قبل التحديث…'});
    let preUpdateBackup;
    try{preUpdateBackup=createPreUpdateBackup(remote);logUpdateEvent('BACKUP_PASS',{local,remote,backupName:preUpdateBackup.name,size:preUpdateBackup.size})}
    catch(e){
      logUpdateEvent('BACKUP_FAIL',{local,remote,error:String(e&&e.message||e)});
      const message=`تعذر إنشاء Backup قبل التحديث: ${String(e&&e.message||e)}`;
      sendUpdateProgress({state:'backup-error',local,remote,channel,version:remote,percent:100,pendingCount:0,message,error:String(e&&e.message||e)});
      if(mainWindow)await dialog.showMessageBox(mainWindow,{type:'warning',title:'تم منع التثبيت لحماية البيانات',message:'لن يتم تثبيت التحديث لأن النسخة الاحتياطية لم تكتمل.',detail:message,buttons:['تمام']});
      return {available:true,downloaded:true,blocked:true,reason:'backup-failed',local,remote,channel,error:String(e&&e.message||e)};
    }

    sendUpdateProgress({state:'backup-ready',local,remote,channel,version:remote,percent:100,pendingCount:0,backupName:preUpdateBackup.name,message:'تم إنشاء Backup قبل التحديث بنجاح'});

    const ready=await dialog.showMessageBox(mainWindow,{type:'info',title:'التحديث جاهز',message:`تم تنزيل V${remote} وتجهيز Backup آمن`,detail:`Backup: ${preUpdateBackup.name}\n\nاضغط تثبيت الآن. سيغلق البرنامج ويبدأ تثبيت النسخة الجديدة.`,buttons:['تثبيت الآن','لاحقًا'],defaultId:0,cancelId:1});
    if(ready.response===0){
      // Gate C: final instant guard after explicit Install Now and immediately before launching the installer.
      const finalBeforeSpawn=updateOfflineQueueState();
      logUpdateEvent('GATE_C',{local,remote,clear:finalBeforeSpawn.clear,pendingCount:finalBeforeSpawn.pendingCount,error:finalBeforeSpawn.error||null});
      if(!finalBeforeSpawn.clear){
        const message=updateQueueGuardMessage(finalBeforeSpawn);
        sendUpdateProgress({state:'blocked-offline',local,remote,channel,version:remote,percent:100,pendingCount:finalBeforeSpawn.pendingCount,backupName:preUpdateBackup.name,message});
        if(mainWindow)await dialog.showMessageBox(mainWindow,{type:'warning',title:'تم منع التثبيت في آخر فحص أمان',message:'لن يتم تشغيل برنامج التثبيت الآن.',detail:message,buttons:['تمام']});
        return {available:true,downloaded:true,backup:preUpdateBackup,blocked:true,reason:'offline-queue',stage:'final-before-spawn',pendingCount:finalBeforeSpawn.pendingCount,local,remote,channel};
      }

      const pendingUpdate=prepareRollbackCandidate({local,remote,backup:preUpdateBackup,installerPath:target,integrity:installerIntegrity,mode:'update'});
      sendUpdateProgress({state:'installing',local,remote,channel,version:remote,percent:100,pendingCount:0,backupName:preUpdateBackup.name,message:'جاري بدء التثبيت…'});
      logUpdateEvent('INSTALL_SPAWN',{local,remote,channel,backupName:preUpdateBackup.name,previousInstallerAvailable:pendingUpdate.previousInstallerAvailable});
      try{
        spawn(target,['/S'],{detached:true,stdio:'ignore'}).unref();
        setTimeout(()=>{
          sendUpdateProgress({state:'restarting',local,remote,channel,version:remote,percent:100,pendingCount:0,backupName:preUpdateBackup.name,message:'سيتم إغلاق البرنامج لإكمال التثبيت…'});
          app.quit();
        },600);
      }catch(e){throw e}
    }else{
      sendUpdateProgress({state:'available',local,remote,channel,version:remote,skipped:true,pendingCount:0,backupName:preUpdateBackup.name,message:`تم تنزيل V${remote} وإنشاء Backup — التثبيت مؤجل`});
    }

    return {available:true,downloaded:true,backup:preUpdateBackup,local,remote,channel};
  }catch(e){
    console.warn('auto update',e);
    logUpdateEvent('UPDATE_ERROR',{local,channel,error:String(e&&e.message||e)});
    sendUpdateProgress({state:'error',local,channel,message:'فشل تنزيل أو تجهيز أو تثبيت التحديث',error:String(e&&e.message||e)});
    if((interactive||userAcceptedUpdate)&&mainWindow)await dialog.showMessageBox(mainWindow,{type:'warning',title:'تحديث Sharawla POS',message:userAcceptedUpdate?'تعذر تنزيل أو تجهيز أو بدء تثبيت التحديث.':'تعذر فحص التحديث الآن.',detail:String(e&&e.message||e),buttons:['تمام']});
    return {error:String(e&&e.message||e),local,channel};
  }finally{updateCheckBusy=false}
}
function startUpdateWatch(){
  const cfg=readUpdateConfig();if(!cfg.enabled)return;
  setTimeout(()=>checkForWindowsUpdate().catch(()=>{}),15000);
  const h=Math.max(1,Number(cfg.checkEveryHours||6));
  setInterval(()=>checkForWindowsUpdate().catch(()=>{}),h*60*60*1000);
}


function fingerprintHash(seed){return crypto.createHash('sha256').update(String(seed||'')).digest('hex')}
function deviceFingerprintCandidates(){
  const seeds=[];
  if(process.platform==='win32'){
    try{
      const out=execFileSync('reg',['query','HKLM\\SOFTWARE\\Microsoft\\Cryptography','/v','MachineGuid'],{encoding:'utf8',windowsHide:true,timeout:4000});
      const m=String(out||'').match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i);
      if(m&&m[1].trim())seeds.push('win:'+m[1].trim());
    }catch{}
  }
  // Legacy fallback is kept as a migration candidate only. Once a fingerprint is
  // accepted by Sharawla Cloud, app.js pins that exact value in license state.
  try{seeds.push([process.platform,os.hostname(),os.arch(),app.getPath('userData')].join('|'))}
  catch{seeds.push([process.platform,os.hostname(),os.arch()].join('|'))}
  return [...new Set(seeds.map(fingerprintHash).filter(Boolean))];
}
function stableDeviceFingerprint(){return deviceFingerprintCandidates()[0]||fingerprintHash([process.platform,os.hostname(),os.arch()].join('|'))}
function deviceInfo(){const candidates=deviceFingerprintCandidates();return {fingerprint:candidates[0]||stableDeviceFingerprint(),fingerprint_candidates:candidates,name:os.hostname(),os:`${os.type()} ${os.release()} ${os.arch()}`,version:app.getVersion()}}

function registerIpc(){
 ipcMain.handle('db:get',(_e,k)=>{const r=one('select value from kv where key=?',[String(k)]);return r?JSON.parse(r.value):undefined});
 ipcMain.handle('db:set',(_e,k,v)=>run(`insert into kv(key,value,updated_at) values(?,?,datetime('now')) on conflict(key) do update set value=excluded.value,updated_at=datetime('now')`,[String(k),JSON.stringify(v)]));
 ipcMain.handle('license-state:get',()=>readLicenseStateFile());
 ipcMain.handle('license-state:set',(_e,v)=>writeLicenseStateFile(v));
 ipcMain.handle('license-state:clear',()=>writeLicenseStateFile(null));
 ipcMain.handle('ops:put',(_e,op)=>run(`insert into local_operations(client_tx_id,type,payload,status,updated_at) values(?,?,?,'pending',datetime('now')) on conflict(client_tx_id) do update set payload=excluded.payload,updated_at=datetime('now')`,[String(op.client_tx_id),String(op.type),JSON.stringify(op)]));
 ipcMain.handle('ops:list',(_e,status='pending')=>all('select * from local_operations where status=? order by id',[status]).map(r=>({...r,payload:JSON.parse(r.payload)})));
 ipcMain.handle('ops:status',(_e,id,status,error=null)=>run(`update local_operations set status=?,attempts=attempts+1,last_error=?,updated_at=datetime('now') where client_tx_id=?`,[status,error,String(id)]));
 ipcMain.handle('backup:create',(_e,reason='manual')=>createBackup(String(reason||'manual').replace(/[^a-z0-9_-]/gi,'-')));
 ipcMain.handle('backup:saveJson',(_e,json,reason='full')=>saveJsonBackup(json,String(reason||'full').replace(/[^a-z0-9_-]/gi,'-')));
 ipcMain.handle('backup:list',()=>fs.readdirSync(backupDir()).filter(x=>x.endsWith('.sqlite')).sort().reverse());
 ipcMain.handle('desktop:paths',()=>({data:dataDir(),backups:backupDir(),database:dbPath()}));
 ipcMain.handle('device:info',()=>deviceInfo());
 ipcMain.handle('external:open',async(_e,url)=>{const u=String(url||'');if(!/^https:\/\//i.test(u))throw new Error('invalid external URL');await shell.openExternal(u);return true});
 ipcMain.handle('update:check',()=>checkForWindowsUpdate({interactive:true,checkOnly:true}));
 ipcMain.handle('update:info',()=>{const cfg=readUpdateConfig();return {version:app.getVersion(),channel:readDeviceUpdateChannel(cfg),enabled:!!cfg.enabled,arch:process.arch};});
 ipcMain.handle('update:safety',()=>updateSafetyInfo());
 ipcMain.handle('update:health',(_e,report)=>applyRendererHealthReport(report||{}));
 ipcMain.handle('update:rollback',()=>rollbackToLastKnownGood({confirmFirst:true}));
 ipcMain.handle('update:setChannel',(_e,value)=>writeDeviceUpdateChannel(value));
 ipcMain.handle('app:info',()=>{const cfg=readUpdateConfig();return {product:'Sharawla POS',version:app.getVersion(),channel:readDeviceUpdateChannel(cfg),arch:process.arch};});
 ipcMain.handle('print:list',async()=>mainWindow?await mainWindow.webContents.getPrintersAsync():[]);
 ipcMain.handle('print:current',async(_e,opts={})=>new Promise(resolve=>{if(!mainWindow)return resolve({ok:false,error:'window unavailable'});mainWindow.webContents.print({silent:!!opts.silent,deviceName:opts.deviceName||'',printBackground:true},(ok,reason)=>resolve({ok,error:reason||null}))}));
 ipcMain.handle('print:html',async(_e,html,opts={})=>new Promise(async resolve=>{const w=new BrowserWindow({show:false,width:420,height:900,webPreferences:{sandbox:true}});try{let deviceName=String(opts.deviceName||'');if(deviceName){const ps=await w.webContents.getPrintersAsync();const wanted=deviceName.trim().toLowerCase();const hit=ps.find(p=>String(p.name||'').trim().toLowerCase()===wanted||String(p.displayName||'').trim().toLowerCase()===wanted);if(hit)deviceName=hit.name}const data='data:text/html;charset=utf-8,'+encodeURIComponent(String(html||''));await w.loadURL(data);setTimeout(()=>{if(w.isDestroyed())return resolve({ok:false,error:'print window closed'});w.webContents.print({silent:!!opts.silent,deviceName,printBackground:true,margins:{marginType:'none'}},(ok,reason)=>{try{w.close()}catch{}resolve({ok,error:reason||null,deviceName})})},300)}catch(err){try{w.close()}catch{}resolve({ok:false,error:String(err&&err.message||err)})}}));
}
function createWindow(){mainWindow=new BrowserWindow({width:1440,height:900,minWidth:1024,minHeight:700,autoHideMenuBar:true,backgroundColor:'#fff',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:false}});mainWindow.loadFile('index.html')}
app.whenReady().then(async()=>{await openDb();try{runPostUpdateHealthCheck()}catch(e){logUpdateEvent('HEALTH_CHECK_ERROR',{version:app.getVersion(),error:String(e&&e.message||e)})}registerIpc();try{createBackup('startup');pruneBackups(30)}catch{}createWindow();startUpdateWatch();setInterval(()=>{try{createBackup('auto');pruneBackups(30)}catch{}},10*60*1000);app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()})});
app.on('before-quit',()=>{try{createBackup('close');pruneBackups(30)}catch(e){console.error(e)}});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
