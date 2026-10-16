'use strict';
// Disposable local SQLite regression only. No Cloud, no SH-0008 access, no deploy.
const assert=require('node:assert/strict');
const initSqlJs=require('sql.js');
const {resetTopChickenTestQueue}=require('../../top-chicken-test-queue-reset');
const {TC_BUSINESS,TC_DEVICE}=require('../../top-chicken-update-channel');
const fingerprint='a'.repeat(64);
const license={business_id:TC_BUSINESS,device_id:TC_DEVICE,
  device_fingerprint:fingerprint,support_code:'SH-0008'};
const allow={license,fingerprintCandidates:[fingerprint],branchId:22};
const createSchema=db=>{
 db.run("CREATE TABLE kv (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT)");
 db.run("CREATE TABLE local_operations (id INTEGER PRIMARY KEY,client_tx_id TEXT UNIQUE,type TEXT,status TEXT,last_error TEXT,updated_at TEXT)");
 db.run("INSERT INTO kv(key,value) VALUES('queue',?)",[
   JSON.stringify([{client_tx_id:'test-a',type:'sale'},{client_tx_id:'test-b',type:'expense'}])]);
 db.run("INSERT INTO local_operations(client_tx_id,type,status) VALUES('test-a','sale','pending'),('test-b','expense','failed'),('synced-c','sale','synced'),('old-d','sale','discarded')");
};
const scalar=(db,sql)=>{const stmt=db.prepare(sql);try{return stmt.step()?stmt.getAsObject():null}finally{stmt.free()}};
const snapshot=db=>new Uint8Array(db.export());
const run=async()=>{
 const SQL=await initSqlJs();
 const db=new SQL.Database();createSchema(db);
 let backups=0,persisted=0,lastBackup;
 const args={db,one:q=>scalar(db,q),
   persistDb:()=>{persisted++},
   createBackup:()=>{backups++;lastBackup=snapshot(db);return 'disposable-pre-reset.sqlite';},...allow};
 const initial=snapshot(db);
 for(const [label,changes] of [
  ['wrong business',{license:{...license,business_id:'91826502-590e-4afa-8826-2c0f4b99c490'}}],
  ['wrong device',{license:{...license,device_id:'00000000-0000-0000-0000-000000000001'}}],
  ['wrong fingerprint',{fingerprintCandidates:['b'.repeat(64)]}],
  ['wrong branch',{branchId:1}],
  ['wrong support code',{license:{...license,support_code:'SH-0007'}}]
 ]){
   assert.throws(()=>resetTopChickenTestQueue({...args,...changes}),/SH-0008/,'must reject '+label);
 }
 assert.equal(backups,0,'rejected callers cannot write backups');
 const denyBackup={...args,createBackup:()=>{throw new Error('backup failed')}};
 assert.throws(()=>resetTopChickenTestQueue(denyBackup),/backup failed/);
 assert.equal(scalar(db,"SELECT count(*) AS n FROM local_operations WHERE status='pending'").n,1,
   'backup error preserves queue');
 const result=resetTopChickenTestQueue(args);
 assert.equal(result.ok,true);
 assert.equal(result.cleared_legacy,2);
 assert.equal(result.discarded_operations,2);
 assert.equal(backups,1);assert.equal(persisted,1);
 assert.equal(scalar(db,"SELECT value FROM kv WHERE key='queue'").value,'[]');
 assert.equal(scalar(db,"SELECT count(*) AS n FROM local_operations WHERE status='discarded'").n,3);
 assert.equal(scalar(db,"SELECT count(*) AS n FROM local_operations WHERE status='synced'").n,1);
 assert.equal(scalar(db,"SELECT count(*) AS n FROM local_operations WHERE status='pending'").n,0);
 const recover=new SQL.Database(lastBackup);
 assert.equal(scalar(recover,"SELECT count(*) AS n FROM local_operations WHERE status='pending'").n,1,'backup must restore pending');
 assert.equal(JSON.parse(scalar(recover,"SELECT value FROM kv WHERE key='queue'").value).length,2);
 recover.close();
 const replay=resetTopChickenTestQueue(args);
 assert.equal(replay.cleared_legacy,0);
 assert.equal(replay.discarded_operations,0);
 assert.equal(backups,1,'no extra backup on replay');
 assert.equal(persisted,1,'no additional local write on replay');
 db.close();

 const corrupt=new SQL.Database();createSchema(corrupt);
 corrupt.run("UPDATE kv SET value='{broken' WHERE key='queue'");
 assert.throws(()=>resetTopChickenTestQueue({...args,db:corrupt,one:q=>scalar(corrupt,q)}),/غير قابل للقراءة/);
 corrupt.close();

 const crash=new SQL.Database();createSchema(crash);
 const originalRun=crash.run.bind(crash);
 crash.run=(sql,parameters)=>{
   if(sql.startsWith("INSERT INTO kv(key,value,updated_at)"))throw Error('simulated-write-failure');
   return originalRun(sql,parameters);
 };
 assert.throws(()=>resetTopChickenTestQueue({...args,db:crash,one:q=>scalar(crash,q),
   createBackup:()=>new Uint8Array([1]),persistDb:()=>{throw Error('unexpected persist')}}),/simulated-write-failure/);
 assert.equal(scalar(crash,"SELECT count(*) AS n FROM local_operations WHERE status='pending'").n,1,
   'transaction must roll back when local clear fails');
 crash.close();
 assert.ok(initial.length>0);
 console.log('PASS: real disposable SQLite scoped reset, cross-tenant/device denial, backup restore, rollback, no-op replay, synced preservation');
};
run().catch(e=>{console.error(e);process.exitCode=1});
