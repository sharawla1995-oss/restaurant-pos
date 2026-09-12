'use strict';
const fs=require('fs');
const read=p=>fs.readFileSync(p,'utf8');
const need=(src,t,msg=t)=>{if(!src.includes(t))throw new Error(`Beta45 storage gate missing: ${msg}`)};

const store=read('beta45-offline-v2-native-store.js');
const main44=read('main-beta44.js');
const preload=read('preload.js');
const pkg=JSON.parse(read('package.json'));

// Syntax without executing Electron/native imports.
new Function(store);
new Function(preload);

for(const token of [
  "require('sqlite3')",
  "sharawla-offline-v2.sqlite",
  'PRAGMA journal_mode=WAL',
  'PRAGMA synchronous=FULL',
  'PRAGMA foreign_keys=ON',
  'PRAGMA busy_timeout=5000',
  'offline_v2_device_sequences',
  'offline_v2_records',
  'offline_v2_outbox',
  'offline_v2_mappings',
  'offline_v2_inbox',
  'UNIQUE(device_id,device_sequence)',
  "BEGIN IMMEDIATE TRANSACTION",
  "exec('COMMIT')",
  "exec('ROLLBACK')",
  'allocateSequence',
  'payload_digest',
  'OFFLINE_V2_TX_PAYLOAD_MISMATCH',
  "status:'pending'",
  'legacy_source_untouched:true',
  "ipcMain.handle('offline-v2:commit-operation'",
  "ipcMain.handle('offline-v2:import-shadow'",
  "backend:'native-sqlite3'"
])need(store,token);

// Atomic ordering: begin -> sequence/records/mapping/outbox -> commit. No local
// operation is acknowledged before COMMIT returns.
const fn=store.indexOf('async function commitOperationUnsafe');
const begin=store.indexOf("exec('BEGIN IMMEDIATE TRANSACTION')",fn);
const seq=store.indexOf('allocateSequence(',begin);
const records=store.indexOf('INSERT INTO offline_v2_records',begin);
const mapping=store.indexOf('INSERT INTO offline_v2_mappings',begin);
const outbox=store.indexOf('INSERT INTO offline_v2_outbox',begin);
const commit=store.indexOf("exec('COMMIT')",outbox);
const ok=store.indexOf("return {ok:true,duplicate:false,durable:true",commit);
if(!(fn>=0&&begin>fn&&seq>begin&&records>seq&&mapping>records&&outbox>mapping&&commit>outbox&&ok>commit))throw new Error('Beta45 atomic commit ordering is invalid');
const catchAt=store.indexOf('}catch(e){',commit);
const rollback=store.indexOf("exec('ROLLBACK')",catchAt);
if(!(catchAt>commit&&rollback>catchAt))throw new Error('Beta45 atomic rollback path missing');

// Shadow store must be additive: it may import copies, but cannot clear or
// mutate the legacy queue/local_operations source during Phase 2.
for(const forbidden of ["delete from local_operations","drop table local_operations","odbSet('queue',[])","removeQueuedOperation("]){
  if(store.toLowerCase().includes(forbidden.toLowerCase()))throw new Error(`Phase 2 touched legacy source: ${forbidden}`);
}

need(main44,"require('./main-beta23.js')");
need(main44,"require('./beta45-offline-v2-native-store.js').installOfflineV2NativeStore()");
if(main44.indexOf("require('./beta45-offline-v2-native-store.js')")<main44.indexOf("require('./main-beta23.js')"))throw new Error('Offline V2 store must install after protected legacy runtime chain');
for(const token of ['offlineV2:{',"offline-v2:commit-operation","offline-v2:import-shadow","offline-v2:health"])need(preload,token);
if(String(pkg.dependencies?.sqlite3)!=='5.1.7')throw new Error('sqlite3 5.1.7 native dependency is required');
if(!String(pkg.scripts?.check||'').includes('check-beta45-offline-v2-storage.js'))throw new Error('package check pipeline missing Phase 2 gate');

console.log('Beta45 Offline V2 native storage + atomic transaction gate PASS');
