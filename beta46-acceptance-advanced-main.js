'use strict';
const {app,ipcMain}=require('electron');
const fs=require('fs'),path=require('path'),sqlite3=require('sqlite3');
const VERSION='10.5.4-beta.46-advanced-main-v1';
const BETA_BUSINESS_ID='91826502-590e-4afa-8826-2c0f4b99c490',BETA_SUPPORT='SH-0007';
let installed=false;
const text=v=>String(v??'').trim();
function userPath(name){return path.join(app.getPath('userData'),name)}
function licensePath(){return userPath(path.join('data','sharawla-license-state.json'))}
function dbPath(){return userPath('sharawla-offline-v2.sqlite')}
function markerPath(){return userPath('acceptance-crash-marker.json')}
function lock(){try{const st=JSON.parse(fs.readFileSync(licensePath(),'utf8'));const reasons=[];if(text(st.support_code)!==BETA_SUPPORT)reasons.push('support_not_SH-0007');if(text(st.business_id)!==BETA_BUSINESS_ID)reasons.push('business_not_sandbox');return {ok:!reasons.length,reasons,support_code:text(st.support_code),business_id:text(st.business_id)}}catch(e){return {ok:false,reasons:['license_unavailable'],error:text(e?.message||e)}}}
function assertLock(){const g=lock();if(!g.ok)throw Object.assign(new Error(`Acceptance sandbox lock failed: ${g.reasons.join(',')}`),{code:'ACCEPTANCE_SANDBOX_LOCK'});return g}
function open(file,mode=sqlite3.OPEN_READWRITE){return new Promise((resolve,reject)=>{const db=new sqlite3.Database(file,mode,e=>e?reject(e):resolve(db))})}
function all(db,sql,p=[]){return new Promise((resolve,reject)=>db.all(sql,p,(e,r)=>e?reject(e):resolve(r||[])))}
function get(db,sql,p=[]){return new Promise((resolve,reject)=>db.get(sql,p,(e,r)=>e?reject(e):resolve(r||null)))}
function run(db,sql,p=[]){return new Promise((resolve,reject)=>db.run(sql,p,function(e){e?reject(e):resolve({changes:this.changes,lastID:this.lastID})}))}
function close(db){return new Promise(resolve=>db.close(()=>resolve()))}
function qpath(p){return String(p).replace(/'/g,"''")}
async function metrics(db){
 const integrity=await get(db,'PRAGMA integrity_check');
 const tables=await all(db,"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'offline_v2_%' ORDER BY name");
 const required=['offline_v2_outbox','offline_v2_records','offline_v2_mappings','offline_v2_inbox','offline_v2_meta'];
 const names=tables.map(x=>x.name),missing=required.filter(x=>!names.includes(x));
 const counts={};for(const t of required.filter(x=>names.includes(x))){const r=await get(db,`SELECT COUNT(*) n FROM ${t}`);counts[t]=Number(r?.n||0)}
 const out=names.includes('offline_v2_outbox')?await get(db,`SELECT COUNT(*) n,COUNT(DISTINCT client_tx_id) tx,COUNT(DISTINCT device_sequence) seq,COALESCE(MAX(device_sequence),0) max_seq FROM offline_v2_outbox`):{};
 const dupTx=names.includes('offline_v2_outbox')?await get(db,`SELECT COUNT(*) n FROM (SELECT client_tx_id FROM offline_v2_outbox GROUP BY client_tx_id HAVING COUNT(*)>1)`):{};
 const dupSeq=names.includes('offline_v2_outbox')?await get(db,`SELECT COUNT(*) n FROM (SELECT device_id,device_sequence FROM offline_v2_outbox GROUP BY device_id,device_sequence HAVING COUNT(*)>1)`):{};
 return {integrity:String(Object.values(integrity||{})[0]||'').toLowerCase(),tables:names,missing,counts,outbox:{rows:Number(out?.n||0),distinct_tx:Number(out?.tx||0),distinct_seq:Number(out?.seq||0),max_sequence:Number(out?.max_seq||0),duplicate_tx:Number(dupTx?.n||0),duplicate_sequence:Number(dupSeq?.n||0)}};
}
async function sqliteCompatibilityProbe(){
 assertLock();const src=dbPath();if(!fs.existsSync(src))throw Object.assign(new Error('Offline V2 database not found'),{code:'ACCEPTANCE_V2_DB_MISSING'});
 const dir=userPath('acceptance-lab');fs.mkdirSync(dir,{recursive:true});const snap=path.join(dir,`compat-${process.pid}-${Date.now()}.sqlite`);let source=null,copy=null;
 try{
  source=await open(src);await run(source,'PRAGMA busy_timeout=5000');const before=await metrics(source);await run(source,`VACUUM INTO '${qpath(snap)}'`);await close(source);source=null;
  copy=await open(snap,sqlite3.OPEN_READONLY);const after=await metrics(copy);await close(copy);copy=null;
  const same=JSON.stringify(before.counts)===JSON.stringify(after.counts)&&before.outbox.rows===after.outbox.rows&&before.outbox.max_sequence===after.outbox.max_sequence;
  const ok=before.integrity==='ok'&&after.integrity==='ok'&&!before.missing.length&&!after.missing.length&&before.outbox.duplicate_tx===0&&before.outbox.duplicate_sequence===0&&same;
  return {ok,version:VERSION,source_integrity:before.integrity,snapshot_integrity:after.integrity,schema_missing:after.missing,counts_preserved:same,before:{counts:before.counts,outbox:before.outbox},after:{counts:after.counts,outbox:after.outbox}};
 }finally{try{if(source)await close(source)}catch{}try{if(copy)await close(copy)}catch{}try{if(fs.existsSync(snap))fs.unlinkSync(snap)}catch{}}
}
function writeMarker(input={}){assertLock();const runId=text(input.run_id),point=text(input.point);if(!/^ACC-[0-9]{8}-[0-9]{6}-[A-Z0-9]{5}$/.test(runId))throw new Error('Acceptance run id invalid');const allowed=new Set(['after_local_commit','during_sync','after_server_commit_before_ack','during_backup']);if(!allowed.has(point))throw new Error(`Unsupported crash point: ${point}`);const m={version:VERSION,run_id:runId,point,created_at:new Date().toISOString(),pid:process.pid};fs.writeFileSync(markerPath(),JSON.stringify(m),'utf8');return m}
function crashMarker(){assertLock();try{return {ok:true,marker:JSON.parse(fs.readFileSync(markerPath(),'utf8'))}}catch{return {ok:true,marker:null}}}
function clearCrashMarker(){assertLock();try{if(fs.existsSync(markerPath()))fs.unlinkSync(markerPath())}catch{}return {ok:true,cleared:true}}
function crashRestart(input={}){const marker=writeMarker(input);const delay=Math.max(150,Math.min(2500,Number(input.delay_ms||450)));setTimeout(()=>{try{app.relaunch()}finally{process.exit(86)}},delay);return {ok:true,restarting:true,abrupt:true,delay_ms:delay,marker}}
function installAcceptanceAdvancedMain(){if(installed)return module.exports.api;installed=true;
 ipcMain.handle('acceptance:sqlite-compatibility',()=>sqliteCompatibilityProbe());
 ipcMain.handle('acceptance:crash-marker',()=>crashMarker());
 ipcMain.handle('acceptance:crash-marker-clear',()=>clearCrashMarker());
 ipcMain.handle('acceptance:crash-restart',(_e,input)=>crashRestart(input||{}));
 return module.exports.api;
}
module.exports.api=Object.freeze({version:VERSION,install:installAcceptanceAdvancedMain,lock,sqliteCompatibilityProbe,crashMarker,clearCrashMarker,crashRestart});
module.exports.installAcceptanceAdvancedMain=installAcceptanceAdvancedMain;
