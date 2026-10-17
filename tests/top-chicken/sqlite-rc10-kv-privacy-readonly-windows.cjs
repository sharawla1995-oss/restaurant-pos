// Disposable Windows-only SQLite fixture. Never touches customer files or devices.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const initSqlJs=require('sql.js');
if(process.platform!=='win32')throw Error('WINDOWS_RUNNER_REQUIRED');
(async()=>{
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tc-kv-rc10-privacy-'));
try{
 const SQL=await initSqlJs(),before=path.join(tmp,'before.sqlite'),after=path.join(tmp,'after.sqlite');
 const db=new SQL.Database();
 db.run("create table kv(key text primary key, value text not null, updated_at text not null default(datetime('now')));");
 db.run("create table local_operations(id integer primary key,status text);");
 for(let i=0;i<14;i++)db.run("insert into kv(key,value,updated_at) values(?,?,?)",['config'+i,'secret-token-do-not-print-'+i,'2026-10-17 02:00:00']);
 db.run("insert into local_operations values(1,'pending')");
 fs.writeFileSync(before,Buffer.from(db.export()));
 fs.writeFileSync(after,Buffer.from(db.export()));
 db.close();
 const digest=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
 const original=digest(before);
 function run(){
  const v=spawnSync('powershell.exe',[
   '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',
   path.resolve('scripts/top-chicken-rc10-kv-change-privacy-readonly.ps1'),
   '-Before',before,'-After',after,
   '-ExpectedBeforeSHA256',original,
   '-ExpectedAfterSHA256',digest(after)
  ],{encoding:'utf8',timeout:45000});
  assert.equal(v.status,0,'PowerShell error: '+v.stderr+' '+v.stdout);
  assert.doesNotMatch(v.stdout,/secret-token-do-not-print|config\d/);
  assert.equal(digest(before),original);
  return v.stdout;
 }
 let result=run();
 assert.match(result,/KV_SUMMARY before=14 after=14 unchanged=14 timestamp_only=0 value_changed=0 added=0 removed=0/);
 let d=new SQL.Database(fs.readFileSync(after));
 d.run("update kv set updated_at='2026-10-17 02:50:00' where key='config1'");
 fs.writeFileSync(after,Buffer.from(d.export()));d.close();
 let hashAfter=digest(after);
 result=run();
 assert.match(result,/KV_TIMESTAMP_ONLY key_hash12=/);
 assert.match(result,/KV_SUMMARY before=14 after=14 unchanged=13 timestamp_only=1 value_changed=0 added=0 removed=0/);
 assert.match(result,/KV_VALUES_AND_KEYS_PRESERVED/);
 assert.equal(digest(after),hashAfter);
 d=new SQL.Database(fs.readFileSync(after));
 d.run("update kv set value='secret-token-do-not-print-CHANGED' where key='config1'");
 fs.writeFileSync(after,Buffer.from(d.export()));d.close();
 hashAfter=digest(after);
 result=run();
 assert.match(result,/KV_VALUE_CHANGED key_hash12=/);
 assert.match(result,/KV_SUMMARY before=14 after=14 unchanged=13 timestamp_only=0 value_changed=1 added=0 removed=0/);
 assert.match(result,/STOP: KV CONTENT CHANGED/);
 assert.equal(digest(after),hashAfter);
 d=new SQL.Database(fs.readFileSync(after));
 d.run("delete from kv where key='config1'");
 d.run("insert into kv values('config14','new-private','2026-10-17 02:00:00')");
 fs.writeFileSync(after,Buffer.from(d.export()));d.close();
 result=run();
 assert.match(result,/KV_REMOVED key_hash12=/);
 assert.match(result,/KV_ADDED key_hash12=/);
 assert.match(result,/KV_SUMMARY before=14 after=14 unchanged=13 timestamp_only=0 value_changed=0 added=1 removed=1/);
 console.log('PASS TC RC10 KV REDACTED READONLY: timestamp-only vs content vs missing keys; values private; DB digests stable');
}finally{fs.rmSync(tmp,{force:true,recursive:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
