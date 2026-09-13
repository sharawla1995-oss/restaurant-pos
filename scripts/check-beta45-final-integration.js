'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const json=f=>JSON.parse(read(f));
const pkg=json('package.json'),ver=json('version.json');
const version=String(pkg.version||'').trim();
const match=version.match(/^10\.5\.4-beta\.(\d+)$/);
if(!match||Number(match[1])<45)throw new Error(`Offline V2 final integration requires 10.5.4-beta.45+, got ${version}`);
if(ver.version!==version||ver.channel!=='beta')throw new Error('Offline V2 final version.json mismatch');
if(pkg.main!=='main-beta44.js')throw new Error('Offline V2 must preserve the protected Beta44 main wrapper');
if(!String(pkg.description||'').includes('Offline Engine V2'))throw new Error('Release description must identify Offline Engine V2');

const index=read('index.html'),sw=read('sw.js'),preload=read('preload.js'),main44=read('main-beta44.js');
const selfTest=read('beta-self-test.js'),takeover=read('beta45-offline-v2-takeover-manager.js'),transport=read('beta45-offline-v2-transport.js');
const shell=['beta45-offline-v2-foundation.js','beta-self-test.js'];
const dynamic=['beta45-offline-v2-runtime-takeover.js','beta45-offline-v2-inventory-runtime.js','beta45-offline-v2-transport-runtime.js','beta45-offline-v2-inbox-runtime.js','beta45-offline-v2-safety-runtime.js','beta45-offline-v2-diagnostics.js'];
for(const a of shell){
  if(!index.includes(`${a}?v=${version}`))throw new Error(`Offline V2 shell missing/version mismatch: ${a}`);
  if(!sw.includes(`./${a}?v=${version}`))throw new Error(`Offline V2 SW shell missing/version mismatch: ${a}`);
}
for(const a of dynamic){
  if(!preload.includes(`${a}?v=${version}`))throw new Error(`Offline V2 preload dynamic runtime mismatch: ${a}`);
  if(!sw.includes(`./${a}?v=${version}`))throw new Error(`Offline V2 SW dynamic runtime mismatch: ${a}`);
}
if(!sw.includes(`const CACHE='sharawla-pos-v${version}';`))throw new Error('Offline V2 service worker cache is not current-versioned');
if(!selfTest.includes(`const VERSION='${version}'`))throw new Error('Offline V2 Self-Test version marker mismatch');
for(const token of [
  "require('./beta45-offline-v2-native-store.js').installOfflineV2NativeStore()",
  "installOfflineV2Safety(offlineV2Store)",
  "installOfflineV2InventoryStore()",
  "installOfflineV2InboxStore()",
  "installOfflineV2TakeoverManager(offlineV2Store)",
  "installOfflineV2Transport(offlineV2Store)"
])if(!main44.includes(token))throw new Error(`Offline V2 main-process integration missing: ${token}`);
for(const token of ['transport_ready:false','legacy_source_untouched:true','assertApproved(input','migration_verified'])if(!takeover.includes(token))throw new Error(`Offline V2 takeover safety invariant missing: ${token}`);
if(!takeover.includes('NO automatic arm/prepare/activate call here by design.'))throw new Error('Offline V2 takeover must remain explicitly activated');
for(const token of ['sharawla_offline_v2_apply_event','sharawla_offline_v2_transport_info','client_tx_id','transport_ready:true'])if(!transport.includes(token))throw new Error(`Offline V2 transport invariant missing: ${token}`);
for(const src of [index,sw,preload,selfTest])if(src.includes(`${version}-dev`))throw new Error('Current shell still contains a dev cache/version marker');
for(const forbidden of ['SH-0005','SH-0006']){
  for(const f of ['beta45-offline-v2-foundation.js','beta45-offline-v2-runtime-takeover.js','beta45-offline-v2-transport-runtime.js','beta45-offline-v2-safety-runtime.js','beta45-offline-v2-diagnostics.js']){
    if(read(f).includes(forbidden))throw new Error(`Production support code leaked into Offline V2 runtime: ${f}`);
  }
}
if(!(index.indexOf(`beta45-offline-v2-foundation.js?v=${version}`)<index.indexOf(`beta-self-test.js?v=${version}`)))throw new Error('Self-Test must load after Offline V2 foundation');
console.log(`Offline V2 FINAL INTEGRATION gate PASS on ${version} — version/cache/runtime wiring/explicit takeover safety verified`);
