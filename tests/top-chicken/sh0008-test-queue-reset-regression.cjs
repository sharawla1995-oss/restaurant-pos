'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {resetTopChickenTestQueue}=require('../../top-chicken-test-queue-reset');
const f='a'.repeat(64);
const LICENSE={support_code:'SH-0008',device_id:'44162475-3ca2-4a2b-8bd5-aee1c7bb1c73',
 business_id:'5358328c-9724-49aa-affc-1bce8be90f92',device_fingerprint:f};

function env(override={}){
 const store={queue:[{client_tx_id:'test-A'},{client_tx_id:'test-B'}],operations:[
 {status:'pending'}, {status:'failed'}, {status:'synced'}, {status:'discarded'}]};
 const events=[];
 const db={run(sql){
  events.push(sql);
  if(sql==='BEGIN IMMEDIATE TRANSACTION')this.inTransaction=true;
  if(sql.includes('UPDATE local_operations SET'))store.operations.forEach(o=>{
   if(!['synced','discarded'].includes(o.status))o.status='discarded';
  });
  if(sql.includes("INSERT INTO kv(key,value,updated_at)"))store.queue=[];
  if(sql==='COMMIT')this.inTransaction=false;
  if(sql==='ROLLBACK')this.inTransaction=false;
 }};
 const one=(sql)=>sql.includes('FROM kv')?{value:JSON.stringify(store.queue)}:
 {count:store.operations.filter(o=>!['synced','discarded'].includes(o.status)).length};
 const calls={db,one,persistDb:()=>events.push('persist'),
 createBackup:()=>{events.push('backup');return 'test-backup';},
 license:{...LICENSE},fingerprintCandidates:[f],branchId:22,...override};
 return {calls,events,store};
}
const x=env();
const result=resetTopChickenTestQueue(x.calls);
assert.deepEqual(result,{ok:true,cleared_legacy:2,discarded_operations:2,scope:'SH-0008/TOP-CHICKEN/22'});
assert.equal(x.store.queue.length,0);
assert.deepEqual(x.store.operations.map(o=>o.status),['discarded','discarded','synced','discarded']);
assert.ok(x.events.indexOf('backup')<x.events.indexOf('BEGIN IMMEDIATE TRANSACTION'));
assert.ok(x.events.indexOf('COMMIT')<x.events.indexOf('persist'));
const again=resetTopChickenTestQueue(x.calls);
assert.equal(again.cleared_legacy,0);
assert.equal(again.discarded_operations,0);
assert.equal(x.events.filter(x=>x==='backup').length,1);

for(const [name,override] of Object.entries({
 wrongBusiness:{license:{...LICENSE,business_id:'91826502-590e-4afa-8826-2c0f4b99c490'}},
 wrongDevice:{license:{...LICENSE,device_id:'00000000-0000-4000-8000-000000000005'}},
 wrongSupportCode:{license:{...LICENSE,support_code:'SH-0007'}},
 wrongFingerprint:{fingerprintCandidates:['b'.repeat(64)]},
 wrongBranch:{branchId:1},
 emptyLicense:{license:null},
 })){
  const state=env(override);
  assert.throws(()=>resetTopChickenTestQueue(state.calls),/SH-0008/,'must reject '+name);
  assert.equal(state.events.length,0,'rejected '+name+' has no writes');
}
{
 const z=env({one:(sql)=>sql.includes('FROM kv')?{value:'{not-json'}:{count:2}});
 assert.throws(()=>resetTopChickenTestQueue(z.calls),/غير قابل للقراءة/);
 assert.equal(z.events.length,0);
}
{
 const z=env({createBackup:()=>null});
 assert.throws(()=>resetTopChickenTestQueue(z.calls),/نسخة الجهاز/);
 assert.equal(z.events.some(v=>v.includes('UPDATE')),false);
}
{
 const z=env();const old=z.calls.db.run;
 z.calls.db.run=function(sql){if(sql.includes('UPDATE local_operations'))throw new Error('synthetic transaction failure');return old.call(this,sql)};
 assert.throws(()=>resetTopChickenTestQueue(z.calls),/synthetic transaction failure/);
 assert.ok(z.events.includes('ROLLBACK'));
 assert.ok(!z.events.includes('COMMIT'));
}
const app=fs.readFileSync('app.js','utf8');
const preload=fs.readFileSync('preload.js','utf8');
const main=fs.readFileSync('main.js','utf8');
assert.ok(app.includes('data-tc-sync-reset-test')&&app.includes("await reset({branch_id:22})"));
assert.ok(app.includes("topChickenSyncResumeApprovedThisSession=false"));
assert.ok(main.includes("ipcMain.handle('tc:reset-test-queue'"));
assert.ok(preload.includes("ipcRenderer.invoke('tc:reset-test-queue'"));
assert.ok(!fs.readFileSync('top-chicken-test-queue-reset.js','utf8').includes('DELETE FROM public.'));
console.log('PASS SH-0008-only original Beta-style local test transactions reset: exact device / license / branch, backup-before-write, unsynced-only, synced preservation, rollback and idempotency; no cloud writes.');
