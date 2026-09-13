'use strict';

// Beta44 compatibility wrapper for the legacy fixed SQLite temp path used by
// main.js persistDb(). Only the exact topburger-pos.sqlite.tmp path is remapped
// to a unique temp file; all other fs behavior is untouched.
const fs=require('fs');
const crypto=require('crypto');
const path=require('path');
const {app}=require('electron');
const childProcess=require('child_process');

const original={
  writeFileSync:fs.writeFileSync.bind(fs),
  openSync:fs.openSync.bind(fs),
  copyFileSync:fs.copyFileSync.bind(fs),
  unlinkSync:fs.unlinkSync.bind(fs),
  existsSync:fs.existsSync.bind(fs)
};
const active=new Map();
function isLegacyDbTmp(p){return typeof p==='string'&&/[\\/]topburger-pos\.sqlite\.tmp$/i.test(p)}
function mapped(p){return isLegacyDbTmp(p)?(active.get(p)||p):p}

fs.writeFileSync=function(file,data,options){
  if(!isLegacyDbTmp(file))return original.writeFileSync(file,data,options);
  const previous=active.get(file);
  if(previous){try{if(original.existsSync(previous))original.unlinkSync(previous)}catch{}}
  const unique=`${file}-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  active.set(file,unique);
  try{return original.writeFileSync(unique,data,options)}
  catch(e){active.delete(file);throw e}
};
fs.openSync=function(file,...args){return original.openSync(mapped(file),...args)};
fs.copyFileSync=function(src,dst,...args){return original.copyFileSync(mapped(src),dst,...args)};
fs.existsSync=function(file){return original.existsSync(mapped(file))};
fs.unlinkSync=function(file,...args){
  const target=mapped(file);
  try{return original.unlinkSync(target,...args)}
  finally{if(isLegacyDbTmp(file))active.delete(file)}
};

// Beta45 Phase 8 final updater/rollback guard. main.js captures child_process.spawn
// after this wrapper loads, so every silent installer launch is fail-closed when
// Offline V2 has unresolved work, a failed integrity state, or a stale/missing
// guard mirror. This is independent from the older legacy Queue Gate A/B/C.
const originalSpawn=childProcess.spawn.bind(childProcess);
function readOfflineV2InstallerGuard(){
  try{
    const root=app.getPath('userData');
    const db=path.join(root,'sharawla-offline-v2.sqlite');
    const wal=`${db}-wal`;
    const guard=path.join(root,'offline-v2-guard-state.json');
    if(!fs.existsSync(db))return {ok:true,clear:true,reason:'v2-db-not-created'};
    if(!fs.existsSync(guard))return {ok:false,clear:false,reason:'guard-missing'};
    const state=JSON.parse(fs.readFileSync(guard,'utf8'));
    const guardStat=fs.statSync(guard);
    let sourceMtime=fs.statSync(db).mtimeMs;
    if(fs.existsSync(wal))sourceMtime=Math.max(sourceMtime,fs.statSync(wal).mtimeMs);
    if(sourceMtime>guardStat.mtimeMs+2)return {...state,ok:false,clear:false,reason:'guard-stale'};
    if(state.integrity_ok!==true||state.clear!==true)return {...state,ok:false,clear:false,reason:state.integrity_ok===false?'integrity-failed':'unresolved-work'};
    return {...state,ok:true,clear:true};
  }catch(e){return {ok:false,clear:false,reason:'guard-read-failed',error:String(e&&e.message||e)}}
}
childProcess.spawn=function(command,args,...rest){
  const silentExe=/\.exe$/i.test(String(command||''))&&Array.isArray(args)&&args.some(x=>String(x).toUpperCase()==='/S');
  if(silentExe){
    const guard=readOfflineV2InstallerGuard();
    if(!guard.clear){const e=new Error(`Offline V2 blocked installer launch: ${guard.reason||'unsafe local state'}`);e.code='OFFLINE_V2_UPDATE_GUARD_BLOCKED';e.guard=guard;throw e}
  }
  return originalSpawn(command,args,...rest);
};

require('./main-beta23.js');

// Beta45 Offline V2 services remain inert until explicit controlled takeover.
// Installing store/manager/transport exposes durable APIs only; it never arms,
// migrates, attests or activates the V2 runtime automatically.
const offlineV2Store=require('./beta45-offline-v2-native-store.js').installOfflineV2NativeStore();
require('./beta45-offline-v2-safety.js').installOfflineV2Safety(offlineV2Store);
require('./beta45-offline-v2-inventory-store.js').installOfflineV2InventoryStore();
require('./beta45-offline-v2-inbox-store.js').installOfflineV2InboxStore();
require('./beta45-offline-v2-takeover-manager.js').installOfflineV2TakeoverManager(offlineV2Store);
require('./beta45-offline-v2-transport.js').installOfflineV2Transport(offlineV2Store);

// Beta46 Acceptance Labs are fail-closed to SH-0007 + the experimental business.
// They can simulate backend faults and abrupt process restart without cutting Windows/AnyDesk connectivity.
require('./beta46-acceptance-network-main.js').installAcceptanceNetworkMain();
require('./beta46-acceptance-advanced-main.js').installAcceptanceAdvancedMain();
