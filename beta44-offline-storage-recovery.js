(function(global){
'use strict';
const VERSION='10.5.4-beta.44';
const DB_NAME='topburger-pos-offline-v98';
const STORE='kv';

function idb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function idbGet(k){const d=await idb();return new Promise((resolve,reject)=>{const t=d.transaction(STORE,'readonly'),r=t.objectStore(STORE).get(k);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function idbSet(k,v){const d=await idb();return new Promise((resolve,reject)=>{const t=d.transaction(STORE,'readwrite'),r=t.objectStore(STORE).put(v,k);r.onsuccess=()=>resolve(true);r.onerror=()=>reject(r.error)})}
async function idbDelete(k){const d=await idb();return new Promise((resolve,reject)=>{const t=d.transaction(STORE,'readwrite'),r=t.objectStore(STORE).delete(k);r.onsuccess=()=>resolve(true);r.onerror=()=>reject(r.error)})}
async function idbKeys(){const d=await idb();return new Promise((resolve,reject)=>{const t=d.transaction(STORE,'readonly'),r=t.objectStore(STORE).getAllKeys();r.onsuccess=()=>resolve(Array.isArray(r.result)?r.result:[]);r.onerror=()=>reject(r.error)})}
async function idbDeleteMatching(input={}){const exact=new Set((Array.isArray(input.exact)?input.exact:[]).map(String)),prefixes=(Array.isArray(input.prefixes)?input.prefixes:[]).map(String),keys=await idbKeys();let deleted=0;for(const raw of keys){const k=String(raw);if(exact.has(k)||prefixes.some(p=>k.startsWith(p))){await idbDelete(raw);deleted++}}return {ok:true,deleted}}

async function odbGet44(k){
  let desktopMissing=false;
  if(global.topBurgerDesktop?.db?.get){
    try{
      const desktop=await global.topBurgerDesktop.db.get(k);
      if(desktop!==undefined&&desktop!==null)return desktop;
      desktopMissing=true;
    }catch(e){desktopMissing=true;console.warn('Beta44 desktop db get fallback',e)}
  }
  const fallback=await idbGet(k);
  // If Desktop SQLite simply has no value but IndexedDB still has one, mirror
  // the recovered value back into Desktop storage immediately. For `queue`
  // this also makes the main-process update guard see the recovered operations.
  if(desktopMissing&&fallback!==undefined&&fallback!==null&&global.topBurgerDesktop?.db?.set){
    try{await global.topBurgerDesktop.db.set(k,fallback)}catch(e){console.warn('Beta44 desktop db recovery mirror',e)}
  }
  return fallback;
}
async function odbSet44(k,v){
  let desktopOk=false;
  if(global.topBurgerDesktop?.db?.set){
    try{await global.topBurgerDesktop.db.set(k,v);desktopOk=true}catch(e){console.warn('Beta44 desktop db set mirror fallback',e)}
  }
  // IndexedDB is always mirrored. This prevents a successful Desktop write from
  // leaving an old fallback queue behind, and preserves data if Desktop SQLite
  // persistence is temporarily unavailable.
  await idbSet(k,v);
  return desktopOk||true;
}

try{odbGet=odbGet44}catch{}
try{odbSet=odbSet44}catch{}
global.odbGet=odbGet44;
global.odbSet=odbSet44;

global.__SharawlaBeta44StorageRecovery=Object.freeze({version:VERSION,idbGet,idbSet,idbDelete,idbDeleteMatching,odbGet:odbGet44,odbSet:odbSet44});
})(window);
