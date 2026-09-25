'use strict';

// Beta.23 startup compatibility wrapper.
// It never clears an active update transaction blindly. It only retargets a
// stale transaction when the installed app is strictly newer than the stale
// target, then lets the existing Core + Renderer health pipeline decide LKG.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let recoveryAttempted = false;

function parseSemver(value){
  const raw=String(value||'').trim().replace(/^v/i,'');
  const m=raw.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if(!m)return null;
  return {major:Number(m[1]),minor:Number(m[2]),patch:Number(m[3]),pre:m[4]?m[4].split('.'):[]};
}
function compareSemver(aValue,bValue){
  const a=parseSemver(aValue),b=parseSemver(bValue);
  if(!a||!b)return null;
  for(const k of ['major','minor','patch']){if(a[k]>b[k])return 1;if(a[k]<b[k])return -1}
  if(!a.pre.length&&!b.pre.length)return 0;
  if(!a.pre.length)return 1;
  if(!b.pre.length)return -1;
  const n=Math.max(a.pre.length,b.pre.length);
  for(let i=0;i<n;i++){
    if(i>=a.pre.length)return -1;if(i>=b.pre.length)return 1;
    const x=a.pre[i],y=b.pre[i],xn=/^\d+$/.test(x),yn=/^\d+$/.test(y);
    if(xn&&yn){const nx=Number(x),ny=Number(y);if(nx>ny)return 1;if(nx<ny)return -1;continue}
    if(xn&&!yn)return -1;if(!xn&&yn)return 1;
    if(x>y)return 1;if(x<y)return -1;
  }
  return 0;
}
function writeJsonAtomic(target,value){
  fs.mkdirSync(path.dirname(target),{recursive:true});
  const tmp=`${target}.tmp-recovery-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  let made=false;
  try{
    fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{encoding:'utf8',flag:'wx'});made=true;
    try{const fd=fs.openSync(tmp,'r');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}catch{}
    fs.copyFileSync(tmp,target);
    try{const fd=fs.openSync(target,'r+');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}catch{}
    const verify=JSON.parse(fs.readFileSync(target,'utf8'));
    if(!verify||typeof verify!=='object')throw new Error('stale pending recovery verification failed');
  }finally{if(made)try{fs.unlinkSync(tmp)}catch{}}
}
function appendRecoveryLog(userData,row){
  try{fs.appendFileSync(path.join(userData,'update-log.jsonl'),JSON.stringify({at:new Date().toISOString(),...row})+'\n','utf8')}catch{}
}
function recoverStalePending(){
  if(recoveryAttempted)return false;
  let userData;
  try{userData=app.getPath('userData')}catch{return false}
  recoveryAttempted=true;
  try{
    const statePath=path.join(userData,'update-safety-state.json');
    if(!fs.existsSync(statePath))return false;
    const state=JSON.parse(fs.readFileSync(statePath,'utf8'));
    const pending=state&&state.pendingUpdate;
    if(!pending||!pending.toVersion)return false;
    const current=String(app.getVersion()||'');
    const staleTarget=String(pending.toVersion||'');
    const cmp=compareSemver(current,staleTarget);
    if(cmp!==1)return false;

    const recoveredAt=new Date().toISOString();
    const recoveryPending={
      ...pending,
      mode:'recovery',
      fromVersion:String(pending.fromVersion||staleTarget),
      toVersion:current,
      status:'recovery-pending',
      coreHealth:null,
      rendererHealth:null,
      rollbackRecommended:false,
      automaticRollbackEnabled:false,
      recovery:true,
      recoveredAt,
      recoveredFromVersion:staleTarget,
      supersededPending:{...pending}
    };
    const next={...state,pendingUpdate:recoveryPending,updatedAt:recoveredAt};
    writeJsonAtomic(statePath,next);
    appendRecoveryLog(userData,{stage:'STALE_PENDING_RECOVERY_PREPARED',transactionId:pending.id||null,staleTarget,currentVersion:current});
    return true;
  }catch(e){
    appendRecoveryLog(userData,{stage:'STALE_PENDING_RECOVERY_ERROR',error:String(e&&e.message||e)});
    return false;
  }
}

// Try synchronously first so main.js sees the repaired target before its own
// startup health check. If userData is not available yet, retry before ready.
recoverStalePending();
if(!recoveryAttempted)app.once('will-finish-launching',recoverStalePending);

require('./main.js');
