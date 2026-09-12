'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const json=f=>JSON.parse(read(f));
const version='10.5.4-beta.45';
const pkg=json('package.json'),ver=json('version.json');
if(pkg.version!==version)throw new Error(`Beta45 final package version mismatch: ${pkg.version}`);
if(ver.version!==version||ver.channel!=='beta')throw new Error('Beta45 final version.json mismatch');
if(pkg.main!=='main-beta44.js')throw new Error('Beta45 must preserve the protected Beta44 main wrapper');
if(!String(pkg.description||'').includes('Offline Engine V2'))throw new Error('Beta45 release description must identify Offline Engine V2');

const index=read('index.html'),sw=read('sw.js'),preload=read('preload.js'),main44=read('main-beta44.js');
const selfTest=read('beta-self-test.js'),takeover=read('beta45-offline-v2-takeover-manager.js'),transport=read('beta45-offline-v2-transport.js');
const shell=['beta45-offline-v2-foundation.js','beta-self-test.js'];
const dynamic=['beta45-offline-v2-runtime-takeover.js','beta45-offline-v2-inventory-runtime.js','beta45-offline-v2-transport-runtime.js','beta45-offline-v2-inbox-runtime.js','beta45-offline-v2-safety-runtime.js','beta45-offline-v2-diagnostics.js'];
for(const a of shell){
  if(!index.includes(`${a}?v=${version}`))throw new Error(`Beta45 final shell missing/version mismatch: ${a}`);
  if(!sw.includes(`./${a}?v=${version}`))throw new Error(`Beta45 final SW shell missing/version mismatch: ${a}`);
}
for(const a of dynamic){
  if(!preload.includes(`${a}?v=${version}`))throw new Error(`Beta45 preload dynamic runtime mismatch: ${a}`);
  if(!sw.includes(`./${a}?v=${version}`))throw new Error(`Beta45 SW dynamic runtime mismatch: ${a}`);
}
if(!sw.includes(`const CACHE='sharawla-pos-v${version}';`))throw new Error('Beta45 service worker cache is not final-versioned');
if(!selfTest.includes(`const VERSION='${version}'`))throw new Error('Beta45 Self-Test final version marker mismatch');
for(const token of [
  "require('./beta45-offline-v2-native-store.js').installOfflineV2NativeStore()",
  "installOfflineV2Safety(offlineV2Store)",
  "installOfflineV2InventoryStore()",
  "installOfflineV2InboxStore()",
  "installOfflineV2TakeoverManager(offlineV2Store)",
  "installOfflineV2Transport(offlineV2Store)"
])if(!main44.includes(token))throw new Error(`Beta45 main-process integration missing: ${token}`);
for(const token of ['transport_ready:false','legacy_source_untouched:true','assertApproved(input','migration_verified'])if(!takeover.includes(token))throw new Error(`Beta45 takeover safety invariant missing: ${token}`);
if(!takeover.includes('NO automatic arm/prepare/activate call here by design.'))throw new Error('Beta45 takeover must remain explicitly activated');
for(const token of ['sharawla_offline_v2_apply_event','sharawla_offline_v2_transport_info','client_tx_id','transport_ready:true'])if(!transport.includes(token))throw new Error(`Beta45 transport invariant missing: ${token}`);
for(const src of [index,sw,preload,selfTest])if(src.includes('10.5.4-beta.45-dev'))throw new Error('Beta45 final shell still contains a beta45-dev cache/version marker');
for(const forbidden of ['SH-0005','SH-0006']){
  for(const f of ['beta45-offline-v2-foundation.js','beta45-offline-v2-runtime-takeover.js','beta45-offline-v2-transport-runtime.js','beta45-offline-v2-safety-runtime.js','beta45-offline-v2-diagnostics.js']){
    if(read(f).includes(forbidden))throw new Error(`Production support code leaked into Beta45 runtime: ${f}`);
  }
}
if(!(index.indexOf(`beta45-offline-v2-foundation.js?v=${version}`)<index.indexOf(`beta-self-test.js?v=${version}`)))throw new Error('Beta45 Self-Test must load after Offline V2 foundation');
console.log('Beta45 FINAL INTEGRATION gate PASS — version/cache/runtime wiring/explicit takeover safety verified');
