'use strict';

const {app,ipcMain}=require('electron');
const fs=require('fs');
const path=require('path');
const https=require('https');
const crypto=require('crypto');
const consumer=require('./beta56-runtime-snapshot-consumer.js');

const VERSION='10.5.4-beta.56-runtime-snapshot-main-v2-routing';
const CLOUD_HOST='ikppryeavoabnugcijeq.supabase.co';
const SNAPSHOT_PATH_V1='/functions/v1/runtime-access-snapshot-v1';
const SNAPSHOT_PATH_V2='/functions/v1/runtime-access-snapshot-v2';
const CLOUD_PUBLISHABLE_KEY='sb_publishable_Lv-eHHXQnWGy-g0rrc2x3w_daXKN2LI';
const BETA_SUPPORT='SH-0007';
const BETA_BUSINESS_ID='91826502-590e-4afa-8826-2c0f4b99c490';
const OFFLINE_ELIGIBLE_CODES=new Set(['SNAPSHOT_TIMEOUT','ETIMEDOUT','ECONNRESET','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','EHOSTUNREACH','ENETUNREACH','ENETDOWN']);
let installed=false;

function licensePath(){return path.join(app.getPath('userData'),'data','sharawla-license-state.json')}
function text(v){return String(v??'').trim()}
function readLicense(){try{return JSON.parse(fs.readFileSync(licensePath(),'utf8'))}catch{return null}}
function sandbox(){
  const st=readLicense();
  const reasons=[];
  if(!st)reasons.push('license_unavailable');
  if(st&&text(st.support_code)!==BETA_SUPPORT)reasons.push('support_not_SH-0007');
  if(st&&text(st.business_id)!==BETA_BUSINESS_ID)reasons.push('business_not_sandbox');
  if(st&&!text(st.device_id))reasons.push('device_id_missing');
  if(st&&!text(st.device_fingerprint))reasons.push('device_fingerprint_missing');
  return {ok:reasons.length===0,reasons,support_code:text(st?.support_code),business_id:text(st?.business_id),device_id:text(st?.device_id),license:st};
}
function store(){return consumer.createRuntimeSnapshotStore(path.join(app.getPath('userData'),'runtime-snapshot-v1'))}
function expectedFrom(gate){return {device_id:text(gate.license.device_id),business_id:text(gate.license.business_id),device_fingerprint:text(gate.license.device_fingerprint),runtime_environment:'beta'}}
function offlineEligible(error){const code=text(error?.code).toUpperCase();const status=Number(error?.status||0);return OFFLINE_ELIGIBLE_CODES.has(code)||status>=500}
function snapshotPath(gate){return gate.ok&&gate.support_code===BETA_SUPPORT&&gate.business_id===BETA_BUSINESS_ID?SNAPSHOT_PATH_V2:SNAPSHOT_PATH_V1}

function requestSnapshot(gate,timeoutMs=12000){
  return new Promise((resolve,reject)=>{
    const body=JSON.stringify({device_id:text(gate.license.device_id),device_fingerprint:text(gate.license.device_fingerprint),snapshot_version_supported:1});
    const req=https.request({hostname:CLOUD_HOST,path:snapshotPath(gate),method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'apikey':CLOUD_PUBLISHABLE_KEY}},res=>{
      let raw='';res.setEncoding('utf8');res.on('data',c=>raw+=c);res.on('end',()=>{
        let parsed;try{parsed=JSON.parse(raw)}catch{const e=new Error('Runtime snapshot endpoint returned invalid JSON');e.code='SNAPSHOT_RESPONSE_INVALID';e.status=res.statusCode;e.body=raw.slice(0,500);return reject(e)}
        if((res.statusCode||0)<200||(res.statusCode||0)>=300||parsed?.ok!==true||!parsed?.snapshot){const e=new Error(`Runtime snapshot endpoint rejected request: ${parsed?.reason_code||res.statusCode||'unknown'}`);e.code=text(parsed?.reason_code)||'SNAPSHOT_ENDPOINT_REJECTED';e.status=res.statusCode;return reject(e)}
        resolve(parsed.snapshot);
      });
    });
    req.setTimeout(Math.max(1000,Number(timeoutMs)||12000),()=>req.destroy(Object.assign(new Error('Runtime snapshot request timed out'),{code:'SNAPSHOT_TIMEOUT'})));
    req.on('error',reject);req.write(body);req.end();
  });
}
function decisionFrom(snapshot,featureCode){const code=text(featureCode);if(!code)return {allowed:false,reason_code:'FEATURE_CODE_REQUIRED'};const d=snapshot?.decisions?.[code];if(!d||typeof d!=='object')return {allowed:false,reason_code:'FEATURE_UNKNOWN'};return {allowed:d.allowed===true,reason_code:text(d.reason_code)||'DENIED',feature_code:code,readiness_status:d.readiness_status||null,blocked_by:d.blocked_by||null,dependency_reason:d.dependency_reason||null}}
async function refresh(options={}){
  const gate=sandbox();if(!gate.ok){const e=new Error(`Runtime snapshot sandbox lock failed: ${gate.reasons.join(',')}`);e.code='RUNTIME_SNAPSHOT_SANDBOX_LOCK';throw e}
  const s=store(),expected=expectedFrom(gate);let snap;
  try{snap=await requestSnapshot(gate,options.timeout_ms)}catch(error){if(!offlineEligible(error))return {ok:false,version:VERSION,mode:'fail-closed',reason_code:String(error?.code||'SNAPSHOT_ONLINE_REJECTED'),error:String(error?.message||error)};try{const cached=s.loadOffline(expected);return {ok:true,version:VERSION,mode:'offline-cache',sequence:cached.sequence,snapshot_id:text(cached.snapshot.snapshot_id),expires_at:cached.snapshot.expires_at,baseline_version:cached.snapshot.baseline_version,policy_version:cached.snapshot.policy_version,runtime_environment:cached.snapshot.runtime_environment,composition_version:cached.snapshot.composition_version,network_error:String(error?.code||error?.message||error)}}catch(cacheError){return {ok:false,version:VERSION,mode:'fail-closed',reason_code:String(cacheError?.code||error?.code||'SNAPSHOT_UNAVAILABLE'),error:String(cacheError?.message||error?.message||cacheError||error),network_error:String(error?.code||error?.message||error)}}}
  try{const accepted=s.acceptOnline(snap,expected);return {ok:true,version:VERSION,mode:'online',sequence:accepted.sequence,snapshot_id:text(snap.snapshot_id),expires_at:snap.expires_at,baseline_version:snap.baseline_version,policy_version:snap.policy_version,runtime_environment:snap.runtime_environment,composition_version:snap.composition_version,decision_count:Object.keys(snap.decisions||{}).length}}catch(error){return {ok:false,version:VERSION,mode:'fail-closed',reason_code:String(error?.code||'SNAPSHOT_VERIFICATION_FAILED'),error:String(error?.message||error)}}
}
function state(){const gate=sandbox(),s=store();if(!gate.ok)return {ok:false,version:VERSION,mode:'disabled',sandbox:{ok:false,reasons:gate.reasons},high_water:s.highWater()};try{const cached=s.loadOffline(expectedFrom(gate));return {ok:true,version:VERSION,mode:'safe-cache',sequence:cached.sequence,high_water:s.highWater(),snapshot_id:text(cached.snapshot.snapshot_id),expires_at:cached.snapshot.expires_at,baseline_version:cached.snapshot.baseline_version,policy_version:cached.snapshot.policy_version,runtime_environment:cached.snapshot.runtime_environment,composition_version:cached.snapshot.composition_version,decision_count:Object.keys(cached.snapshot.decisions||{}).length,sandbox:{ok:true,support_code:BETA_SUPPORT,business_id:BETA_BUSINESS_ID}}}catch(e){return {ok:false,version:VERSION,mode:'fail-closed',reason_code:String(e.code||'SAFE_SNAPSHOT_MISSING'),high_water:s.highWater(),sandbox:{ok:true,support_code:BETA_SUPPORT,business_id:BETA_BUSINESS_ID}}}}
function feature(featureCode){const gate=sandbox();if(!gate.ok)return {allowed:false,reason_code:'RUNTIME_SNAPSHOT_SANDBOX_LOCK'};try{const cached=store().loadOffline(expectedFrom(gate));return decisionFrom(cached.snapshot,featureCode)}catch(e){return {allowed:false,reason_code:String(e.code||'SNAPSHOT_UNAVAILABLE'),feature_code:text(featureCode)}}}
function signAcceptanceSnapshot(payload,privateKey,keyId){
  const canonical=consumer.canonicalize(payload);
  return {...payload,payload_hash:crypto.createHash('sha256').update(Buffer.from(canonical,'utf8')).digest('hex'),signature:crypto.sign(null,Buffer.from(canonical,'utf8'),privateKey).toString('base64'),signing_key_id:keyId};
}
function acceptanceAntiRollbackProbe(){
  const gate=sandbox();if(!gate.ok){const e=new Error(`Runtime snapshot acceptance sandbox lock failed: ${gate.reasons.join(',')}`);e.code='RUNTIME_SNAPSHOT_SANDBOX_LOCK';throw e}
  const tempRoot=fs.mkdtempSync(path.join(app.getPath('temp'),'sharawla-snapshot-antirollback-'));
  try{
    const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519'),keyId='sharawla-acceptance-ephemeral';
    const keyRing={[keyId]:publicKey.export({format:'der',type:'spki'}).toString('base64')};
    const expected=expectedFrom(gate),now=Date.now();
    const base={profile:'restaurant',decisions:{'core.offline':{allowed:true,reason_code:'ALLOWED'}},device_id:expected.device_id,issued_at:new Date(now-1000).toISOString(),business_id:expected.business_id,verified_at:new Date(now-1000).toISOString(),policy_version:1,baseline_version:'acceptance-isolated',signature_scheme:'ed25519-v1',snapshot_version:1,composition_version:1,runtime_environment:'beta',device_fingerprint_hash:consumer.fingerprintHash(expected.device_fingerprint),canonicalization_version:1,expires_at:new Date(now+10*60*1000).toISOString()};
    const newer=signAcceptanceSnapshot({...base,snapshot_id:crypto.randomUUID(),snapshot_sequence:2},privateKey,keyId);
    const older=signAcceptanceSnapshot({...base,snapshot_id:crypto.randomUUID(),snapshot_sequence:1},privateKey,keyId);
    const isolatedStore=consumer.createRuntimeSnapshotStore(tempRoot);
    const accepted=isolatedStore.acceptOnline(newer,expected,{keyRing,nowMs:now});
    const lkgBefore=isolatedStore.loadOffline(expected,{keyRing,nowMs:now});
    let rejectCode=null;try{isolatedStore.acceptOnline(older,expected,{keyRing,nowMs:now})}catch(e){rejectCode=text(e?.code)}
    if(rejectCode!=='SNAPSHOT_ROLLBACK'){const e=new Error(`Runtime snapshot rollback was not rejected: ${rejectCode||'accepted'}`);e.code='ANTI_ROLLBACK_ACCEPTANCE_FAILED';throw e}
    const lkgAfter=isolatedStore.loadOffline(expected,{keyRing,nowMs:now});
    const lkgUnchanged=lkgBefore.sequence===accepted.sequence&&lkgAfter.sequence===accepted.sequence&&text(lkgBefore.snapshot?.snapshot_id)===text(newer.snapshot_id)&&text(lkgAfter.snapshot?.snapshot_id)===text(newer.snapshot_id)&&isolatedStore.highWater()===accepted.sequence;
    if(!lkgUnchanged){const e=new Error('Runtime snapshot LKG changed after rollback rejection');e.code='ANTI_ROLLBACK_LKG_CHANGED';throw e}
    return {ok:true,isolated:true,temp_store:true,accepted_sequence:accepted.sequence,rejected_sequence:older.snapshot_sequence,reject_code:rejectCode,lkg_sequence:lkgAfter.sequence,high_water:isolatedStore.highWater(),lkg_unchanged:true,live_store_touched:false};
  }finally{try{fs.rmSync(tempRoot,{recursive:true,force:true})}catch{}}
}
function installRuntimeSnapshotMain(){if(installed)return module.exports.api;installed=true;ipcMain.handle('runtime-snapshot:refresh',(_e,input)=>refresh(input||{}));ipcMain.handle('runtime-snapshot:state',()=>state());ipcMain.handle('runtime-snapshot:feature',(_e,code)=>feature(code));ipcMain.handle('runtime-snapshot:acceptance-anti-rollback',()=>acceptanceAntiRollbackProbe());return module.exports.api}
module.exports.api=Object.freeze({version:VERSION,installRuntimeSnapshotMain,sandbox,refresh,state,feature,requestSnapshot,offlineEligible,snapshotPath,acceptanceAntiRollbackProbe});
module.exports.installRuntimeSnapshotMain=installRuntimeSnapshotMain;
