'use strict';
const fs=require('fs');
const read=p=>fs.readFileSync(p,'utf8');
const need=(src,t,msg=t)=>{if(!src.includes(t))throw new Error(`Beta45 takeover gate missing: ${msg}`)};
const forbid=(src,t,msg=t)=>{if(src.includes(t))throw new Error(`Beta45 takeover gate forbidden: ${msg}`)};

const manager=read('beta45-offline-v2-takeover-manager.js');
const runtime=read('beta45-offline-v2-runtime-takeover.js');
const main=read('main-beta44.js');
const preload=read('preload.js');
const pkg=JSON.parse(read('package.json'));

// Syntax only; do not execute Electron/browser modules here.
new Function(manager);
new Function(runtime);
new Function(preload);

// Takeover is fail-safe and disabled until explicitly approved.
for(const token of [
  "mode:'disabled'","armed:false","active:false","migration_verified:false","legacy_retired:false",
  "input?.approved!==true","OFFLINE_V2_APPROVAL_REQUIRED",
  "device_id:text(raw?.device_id)","business_id:text(raw?.business_id)","device_fingerprint:text(raw?.device_fingerprint)",
  "OFFLINE_V2_CANONICAL_IDENTITY_REQUIRED","OFFLINE_V2_IDENTITY_MISMATCH",
  "ipcMain.handle('offline-v2:takeover-state'","ipcMain.handle('offline-v2:takeover-arm'",
  "ipcMain.handle('offline-v2:takeover-prepare'","ipcMain.handle('offline-v2:takeover-activate'"
])need(manager,token);

// Controlled migration is copy -> block V2 duplicate -> re-read -> exact verify
// -> marker last. The legacy source may never be cleared or rewritten.
for(const token of [
  'uniqueLegacySnapshot','protectLegacyEvents',"status:'blocked'","legacy_authority:true",
  "migration_source:'legacy_queue_v1'","OFFLINE_V2_LEGACY_PRESERVED",
  'await store.importShadow','await forceLegacyCopiesBlocked','const durable=await store.listOutbox()',
  "JSON.stringify(row.envelope?.legacy_payload)!==JSON.stringify(job)",
  'OFFLINE_V2_MIGRATION_VERIFY_FAILED','snapshot_digest:digest(legacySnapshot)',
  'legacy_source_untouched:true'
])need(manager,token);
const importAt=manager.indexOf('await store.importShadow');
const rereadAt=manager.indexOf('const durable=await store.listOutbox()',importAt);
const verifyAt=manager.indexOf('if(errors.length)',rereadAt);
const markerAt=manager.indexOf("mode:'prepared'",verifyAt);
if(!(importAt>=0&&rereadAt>importAt&&verifyAt>rereadAt&&markerAt>verifyAt))throw new Error('Migration marker ordering is not copy -> reread -> verify -> mark');
for(const bad of ["setOfflineQueue(","removeQueuedOperation(","odbSet('queue'","DELETE FROM local_operations","DROP TABLE local_operations"]){forbid(manager,bad);forbid(runtime,bad)}

// One generic core for every activity. Business profiles register operation
// handlers/RPC aliases; the offline state machine itself must not inspect profile.
for(const op of ['sale','return','expense','shift_open','shift_close','customer_create','inventory_movement','order_status'])need(runtime,`registerOperation('${op}'`);
for(const token of ['function registerOperation','function registerRpc','rpcToOperation','operationTypes:()=>[...registry.keys()]'])need(runtime,token);
forbid(runtime,'isRetailProfile(');
forbid(runtime,'.pos_profile');
forbid(runtime,"=== 'restaurant'");
forbid(runtime,"=== 'retail'");

// When takeover is active, durable V2 COMMIT must complete before the original
// operational RPC is allowed to touch the network/server.
const rpcFn=runtime.indexOf('async function rpcTakeover');
const commitAt=runtime.indexOf("const entry=await ensureCommitted(type,payload,tx)",rpcFn);
const networkAt=runtime.indexOf('try{return await base.rpc(name,payload)}',commitAt);
if(!(rpcFn>=0&&commitAt>rpcFn&&networkAt>commitAt))throw new Error('Active takeover is not local-commit-before-network');
need(runtime,'OFFLINE_V2_CLIENT_TX_REQUIRED');
need(runtime,'committedThisSession');

// Migration lock snapshots legacy queue while operational RPCs are paused.
const prep=runtime.indexOf('async function prepareLegacyMigration');
const lock=runtime.indexOf('migrationLock=true',prep);
const snap=runtime.indexOf('const legacy=clone(await offlineQueue())',lock);
const shadow=runtime.indexOf('await foundation.migrateLegacyQueue()',snap);
const nativePrepare=runtime.indexOf('takeoverPrepare',shadow);
const unlock=runtime.indexOf('migrationLock=false',nativePrepare);
if(!(prep>=0&&lock>prep&&snap>lock&&shadow>snap&&nativePrepare>shadow&&unlock>nativePrepare))throw new Error('Controlled migration lock/snapshot/verify ordering invalid');
need(runtime,"OFFLINE_V2_MIGRATION_LOCK");
need(runtime,"return base.syncOfflineQueue?.(...args)");

// Explicit bridge only. Runtime script loads after legacy DOMContentLoaded
// installers and does not automatically arm/prepare/activate takeover.
for(const token of [
  'takeoverState:()=>ipcRenderer.invoke', 'takeoverArm:x=>ipcRenderer.invoke',
  'takeoverPrepare:x=>ipcRenderer.invoke','takeoverActivate:x=>ipcRenderer.invoke',
  'beta45-offline-v2-runtime-takeover.js?v=10.5.4-beta.45-dev',
  "setTimeout(()=>{"
])need(preload,token);
for(const token of [
  "require('./beta45-offline-v2-native-store.js').installOfflineV2NativeStore()",
  "require('./beta45-offline-v2-takeover-manager.js').installOfflineV2TakeoverManager(offlineV2Store)"
])need(main,token);
if(main.indexOf("installOfflineV2NativeStore()")>main.indexOf('installOfflineV2TakeoverManager'))throw new Error('Takeover manager must install after native store');
need(manager,'// NO automatic arm/prepare/activate call here by design.');
need(runtime,'Nothing below arms');

if(!String(pkg.scripts?.check||'').includes('check-beta45-offline-v2-takeover.js')){
  throw new Error('package check pipeline missing Phase 4 takeover gate');
}
console.log('Beta45 Offline V2 controlled migration + generic runtime takeover gate PASS');
