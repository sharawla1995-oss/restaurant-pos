(function(global){
'use strict';
const DB_NAME='sharawla-staff-v1',DB_VERSION=1,QUEUE='attendance_queue';
let dbPromise=null;
function open(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,DB_VERSION);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(QUEUE)){const store=db.createObjectStore(QUEUE,{keyPath:'clientTxId'});store.createIndex('state','state')}};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
 return dbPromise;
}
async function transaction(mode,fn){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(QUEUE,mode),store=tx.objectStore(QUEUE);let result;try{result=fn(store)}catch(e){reject(e);return}tx.oncomplete=()=>resolve(result?.result??result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('INDEXEDDB_ABORTED'))})}
const queueStore={
 list:()=>transaction('readonly',s=>s.getAll()),
 put:row=>transaction('readwrite',s=>s.put(row)),
 remove:key=>transaction('readwrite',s=>s.delete(key)),
};
function randomId(){if(crypto.randomUUID)return crypto.randomUUID();const b=new Uint8Array(16);crypto.getRandomValues(b);return [...b].map(v=>v.toString(16).padStart(2,'0')).join('')}
function deviceId(){let id=localStorage.getItem('sharawlaStaffDeviceIdV1');if(!id){id=randomId();localStorage.setItem('sharawlaStaffDeviceIdV1',id)}return id}
function config(){try{return JSON.parse(localStorage.getItem('sharawlaStaffConfigV1')||'null')}catch{return null}}
function saveConfig(value){localStorage.setItem('sharawlaStaffConfigV1',JSON.stringify(value))}
function session(){try{return JSON.parse(localStorage.getItem('sharawlaStaffSessionV1')||'null')}catch{return null}}
function saveSession(value){if(value)localStorage.setItem('sharawlaStaffSessionV1',JSON.stringify(value));else localStorage.removeItem('sharawlaStaffSessionV1')}
global.SharawlaStaffStore=Object.freeze({queueStore,deviceId,config,saveConfig,session,saveSession,randomId});
})(globalThis);
