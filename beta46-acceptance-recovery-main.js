'use strict';
const {app,ipcMain}=require('electron');
const fs=require('fs'),path=require('path'),crypto=require('crypto'),sqlite3=require('sqlite3');
const VERSION='10.5.4-beta.46-recovery-main-v1';
const BETA_BUSINESS_ID='91826502-590e-4afa-8826-2c0f4b99c490',BETA_SUPPORT='SH-0007';
let installed=false;
const text=v=>String(v??'').trim();
function userPath(name){return path.join(app.getPath('userData'),name)}
function licensePath(){return userPath(path.join('data','sharawla-license-state.json'))}
function dbPath(){return userPath('sharawla-offline-v2.sqlite')}
function lastGoodPath(){return userPath('sharawla-offline-v2.lastgood.sqlite')}
function labDir(){const d=userPath('acceptance-lab');fs.mkdirSync(d,{recursive:true});return d}
function lock(){try{const st=JSON.parse(fs.readFileSync(licensePath(),'utf8'));const reasons=[];if(text(st.support_code)!==BETA_SUPPORT)reasons.push('support_not_SH-0007');if(text(st.business_id)!==BETA_BUSINESS_ID)reasons.push('business_not_sandbox');return {ok:!reasons.length,reasons,support_code:text(st.support_code),business_id:text(st.business_id)}}catch(e){return {ok:false,reasons:['license_unavailable'],error:text(e?.message||e)}}}
function assertLock(){const g=lock();if(!g.ok)throw Object.assign(new Error(`Acceptance recovery sandbox lock failed: ${g.reasons.join(',')}`),{code:'ACCEPTANCE_SANDBOX_LOCK'});return g}
function open(file,mode=sqlite3.OPEN_READWRITE){return new Promise((resolve,reject)=>{const db=new sqlite3.Database(file,mode,e=>e?reject(e):resolve(db))})}
function all(db,sql,p=[]){return new Promise((resolve,reject)=>db.all(sql,p,(e,r)=>e?reject(e):resolve(r||[])))}
function get(db,sql,p=[]){return new Promise((resolve,reject)=>db.get(sql,p,(e,r)=>e?reject(e):resolve(r||null)))}
function run(db,sql,p=[]){return new Promise((resolve,reject)=>db.run(sql,p,function(e){e?reject(e):resolve({changes:this.changes,lastID:this.lastID})}))}
function close(db){return new Promise(resolve=>db.close(()=>resolve()))}
function qpath(p){return String(p).replace(/'/g,"''")}
function sha256File(p){const h=crypto.createHash('sha256');h.update(fs.readFileSync(p));return h.digest('hex')}
function safeUnlink(p){try{if(p&&fs.existsSync(p))fs.unlinkSync(p)}catch{}}
async function integrity(file){let db=null;try{db=await open(file,sqlite3.OPEN_READONLY);const r=await get(db,'PRAGMA integrity_check');return {ok:String(Object.values(r||{})[0]||'').toLowerCase()==='ok',result:String(Object.values(r||{})[0]||'')}}catch(e){return {ok:false,result:text(e?.message||e),code:e?.code||null}}finally{try{if(db)await close(db)}catch{}}}
async function snapshot(target){const src=dbPath();if(!fs.existsSync(src))throw Object.assign(new Error('Offline V2 database not found'),{code:'ACCEPTANCE_V2_DB_MISSING'});let db=null;try{db=await open(src);await run(db,'PRAGMA busy_timeout=5000');await run(db,`VACUUM INTO '${qpath(target)}'`)}finally{if(db)await close(db)}}
async function counts(file){let db=null;try{db=await open(file,sqlite3.OPEN_READONLY);const names=(await all(db,"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'offline_v2_%' ORDER BY name")).map(x=>x.name);const out={};for(const t of ['offline_v2_outbox','offline_v2_records','offline_v2_mappings','offline_v2_inbox','offline_v2_meta']){if(names.includes(t)){const r=await get(db,`SELECT COUNT(*) n FROM ${t}`);out[t]=Number(r?.n||0)}}return out}finally{if(db)await close(db)}}
async function backupRestoreProbe(){
 assertLock();const live=dbPath(),good=lastGoodPath();if(!fs.existsSync(live))throw new Error('Offline V2 live database missing');if(!fs.existsSync(good))throw Object.assign(new Error('Last Good Copy missing; create an Offline V2 backup first'),{code:'ACCEPTANCE_LASTGOOD_MISSING'});
 const manifestPath=`${good}.manifest.json`;if(!fs.existsSync(manifestPath))throw Object.assign(new Error('Last Good Copy manifest missing'),{code:'ACCEPTANCE_LASTGOOD_MANIFEST_MISSING'});
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));const digest=sha256File(good),hashOk=text(manifest.sha256)===digest;
 const goodIntegrity=await integrity(good);const liveIntegrityBefore=await integrity(live);const restored=path.join(labDir(),`restore-probe-${process.pid}-${Date.now()}.sqlite`);
 try{fs.copyFileSync(good,restored);const restoredIntegrity=await integrity(restored),liveCounts=await counts(live),restoredCounts=await counts(restored);const countsMatch=JSON.stringify(liveCounts)===JSON.stringify(restoredCounts);const liveIntegrityAfter=await integrity(live);const ok=hashOk&&goodIntegrity.ok&&restoredIntegrity.ok&&liveIntegrityBefore.ok&&liveIntegrityAfter.ok&&countsMatch;return {ok,version:VERSION,manifest_hash_match:hashOk,last_good_integrity:goodIntegrity.result,restored_copy_integrity:restoredIntegrity.result,live_integrity_before:liveIntegrityBefore.result,live_integrity_after:liveIntegrityAfter.result,counts_match:countsMatch,counts:restoredCounts,manifest:{version:manifest.version||null,reason:manifest.reason||null,size:manifest.size||null,integrity:manifest.integrity||null}}}finally{safeUnlink(restored)}
}
async function corruptionProbe(){
 assertLock();const live=dbPath(),base=path.join(labDir(),`corruption-base-${process.pid}-${Date.now()}.sqlite`),bad=`${base}.corrupt`;let before=null,after=null;
 try{before=await integrity(live);if(!before.ok)throw new Error(`Live database is not healthy before corruption probe: ${before.result}`);await snapshot(base);fs.copyFileSync(base,bad);const size=fs.statSync(bad).size;if(size<1024)throw new Error('Snapshot too small for safe corruption probe');fs.truncateSync(bad,Math.max(128,Math.floor(size/5)));const corrupted=await integrity(bad);after=await integrity(live);return {ok:before.ok&&!corrupted.ok&&after.ok,version:VERSION,corruption_detected:!corrupted.ok,corrupt_result:corrupted.result,live_integrity_before:before.result,live_integrity_after:after.result,live_untouched:after.ok}}
 finally{safeUnlink(base);safeUnlink(bad)}
}
async function clockSequenceProbe(){
 assertLock();const probe=path.join(labDir(),`clock-probe-${process.pid}-${Date.now()}.sqlite`);let db=null;
 try{await snapshot(probe);db=await open(probe);const cols=await all(db,"PRAGMA table_info('offline_v2_outbox')");const names=cols.map(x=>x.name),hasSequence=names.includes('device_sequence'),hasCreated=names.includes('created_local_at');if(!hasSequence||!hasCreated)return {ok:false,version:VERSION,reason:'outbox_sequence_or_timestamp_column_missing',columns:names};
  await run(db,'CREATE TEMP TABLE acceptance_clock_probe(device_sequence INTEGER PRIMARY KEY,created_local_at TEXT NOT NULL)');await run(db,"INSERT INTO acceptance_clock_probe(device_sequence,created_local_at) VALUES(1,'2099-12-31T23:59:59.000Z'),(2,'2000-01-01T00:00:00.000Z'),(3,'2050-06-01T12:00:00.000Z')");const bySeq=await all(db,'SELECT device_sequence FROM acceptance_clock_probe ORDER BY device_sequence');const byClock=await all(db,'SELECT device_sequence FROM acceptance_clock_probe ORDER BY created_local_at');const seq=bySeq.map(x=>Number(x.device_sequence)),clock=byClock.map(x=>Number(x.device_sequence));const sequenceStable=JSON.stringify(seq)==='[1,2,3]'&&JSON.stringify(clock)!==JSON.stringify(seq);const liveRows=await get(db,'SELECT COUNT(*) n,COUNT(DISTINCT device_sequence) d FROM offline_v2_outbox');return {ok:sequenceStable&&Number(liveRows?.n||0)===Number(liveRows?.d||0),version:VERSION,system_clock_changed:false,device_sequence_available:true,simulated_created_time_order:clock,authoritative_device_sequence_order:seq,outbox_sequence_unique:Number(liveRows?.n||0)===Number(liveRows?.d||0),outbox_rows:Number(liveRows?.n||0)}
 }finally{try{if(db)await close(db)}catch{}safeUnlink(probe)}
}
async function tempRestoreCycle(){
 assertLock();const live=dbPath(),tmp=path.join(labDir(),`restore-cycle-${process.pid}-${Date.now()}.sqlite`);try{await snapshot(tmp);const before=await counts(live),copy=await counts(tmp),i=await integrity(tmp);return {ok:i.ok&&JSON.stringify(before)===JSON.stringify(copy),version:VERSION,restored_into_live:false,temp_copy_only:true,integrity:i.result,counts_match:JSON.stringify(before)===JSON.stringify(copy),counts:copy}}finally{safeUnlink(tmp)}
}
function installAcceptanceRecoveryMain(){if(installed)return module.exports.api;installed=true;ipcMain.handle('acceptance:backup-restore-probe',()=>backupRestoreProbe());ipcMain.handle('acceptance:corruption-probe',()=>corruptionProbe());ipcMain.handle('acceptance:clock-sequence-probe',()=>clockSequenceProbe());ipcMain.handle('acceptance:temp-restore-cycle',()=>tempRestoreCycle());return module.exports.api}
module.exports.api=Object.freeze({version:VERSION,install:installAcceptanceRecoveryMain,lock,backupRestoreProbe,corruptionProbe,clockSequenceProbe,tempRestoreCycle});
module.exports.installAcceptanceRecoveryMain=installAcceptanceRecoveryMain;
