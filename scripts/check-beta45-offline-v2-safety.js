'use strict';
const fs=require('fs');
const read=p=>fs.readFileSync(p,'utf8');
const need=(src,t,msg=t)=>{if(!src.includes(t))throw new Error(`Beta45 Phase 8 gate missing: ${msg}`)};
const forbid=(src,t,msg=t)=>{if(src.toLowerCase().includes(t.toLowerCase()))throw new Error(`Beta45 Phase 8 gate forbidden: ${msg}`)};

const main=read('beta45-offline-v2-safety.js');
const runtime=read('beta45-offline-v2-safety-runtime.js');
const wrapper=read('main-beta44.js');
const preload=read('preload.js');
const pkg=JSON.parse(read('package.json'));

new Function(main);new Function(runtime);new Function(wrapper);new Function(preload);

for(const t of [
  "const UNRESOLVED_STATUSES=['pending','syncing','retryable','blocked','conflict','dead_letter']",
  "algorithm:'AES-256-GCM'",'PBKDF2_ITERATIONS=210000','device_fingerprint','sameIdentity(payload.identity,identity)',
  'licenseExpiry','OFFLINE_V2_AUTH_GRACE_EXPIRED','bootstrap_digest','timingSafeEqual',
  "ipcMain.handle('offline-v2:guard-state'","ipcMain.handle('offline-v2:guard-assert'",
  "ipcMain.handle('offline-v2:auth-enroll'","ipcMain.handle('offline-v2:auth-verify'",
  "ipcMain.handle('offline-v2:backup-create'","ipcMain.handle('offline-v2:recovery-state'",
  "ipcMain.handle('offline-v2:local-report'",'recoverStaleSyncing','VACUUM INTO','integrity_check',
  'sharawla-offline-v2.lastgood.sqlite','startup-last-good','source:\'local-device\'','consolidated:false'
])need(main,t);

for(const t of [
  'a.authVerify({identity,email,password','offline_authorized:true','a.authEnroll({identity,license,bootstrap:boot',
  'loadOfflineBootstrap=async function','requireSafe(\'تغيير الترخيص/النشاط\'','requireSafe(\'إعادة ضبط البيانات\'','requireSafe(\'استعادة Backup\'',
  'pre-license-change','pre-reset','pre-restore','Report','localReport({branch_id','Cloud Consolidated Report',
  'هذا تقرير تشغيلي محلي للجهاز الحالي فقط','سجّل الدخول أونلاين لتجديد جلسة Cloud'
])need(runtime,t);

for(const t of [
  'offline-v2-guard-state.json','guard-missing','guard-stale','integrity-failed','unresolved-work',
  'OFFLINE_V2_UPDATE_GUARD_BLOCKED',"args.some(x=>String(x).toUpperCase()==='/S')",
  "require('./beta45-offline-v2-safety.js').installOfflineV2Safety(offlineV2Store)"
])need(wrapper,t);
const requireMain=wrapper.indexOf("require('./main-beta23.js')");
const patchSpawn=wrapper.indexOf('childProcess.spawn=function');
if(!(patchSpawn>=0&&patchSpawn<requireMain))throw new Error('Beta45 Phase 8 installer spawn guard must be installed before main.js captures spawn');

for(const t of [
  'guardState:()=>ipcRenderer.invoke','guardAssert:x=>ipcRenderer.invoke','authEnroll:x=>ipcRenderer.invoke','authVerify:x=>ipcRenderer.invoke',
  'backupCreate:x=>ipcRenderer.invoke','recoveryState:()=>ipcRenderer.invoke','localReport:x=>ipcRenderer.invoke',
  'beta45-offline-v2-safety-runtime.js','data-offline-v2-phase8-safety','offlineV2'
])need(preload,t);
const inboxAt=preload.indexOf('beta45-offline-v2-inbox-runtime.js');
const safetyAt=preload.indexOf('beta45-offline-v2-safety-runtime.js');
const diagAt=preload.indexOf('beta45-offline-v2-diagnostics.js');
if(!(inboxAt>=0&&safetyAt>inboxAt&&diagAt>safetyAt))throw new Error('Phase 8 safety runtime must load after Inbox and before diagnostics');

forbid(main,'MachineGuid','Canonical identity must never fall back to MachineGuid');
forbid(runtime,'MachineGuid','Renderer authorization must never fall back to MachineGuid');
forbid(main,'kzokretuuigjhxjzdlmk','Production backend must not be embedded in Phase 8');
forbid(runtime,'kzokretuuigjhxjzdlmk','Production backend must not be embedded in Phase 8');

if(!String(pkg.scripts?.check||'').includes('check-beta45-offline-v2-safety.js'))throw new Error('package check pipeline missing Phase 8 gate');
console.log('Beta45 Offline V2 Phase 8 Offline Auth / Guards / Recovery / Reports gate PASS');
