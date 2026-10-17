// Disposable Windows fixture: strict read-only classified metadata on changed KV.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const initSqlJs=require('sql.js');
if(process.platform!=='win32')throw Error('Disposable Windows ONLY');
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tc-rc10-kv-meta-'));
 try{
  const before=path.join(tmp,'before.sqlite'),after=path.join(tmp,'after.sqlite');
  const SQL=await initSqlJs();
  const db=new SQL.Database();
  db.run("create table kv(key text primary key,value text not null,updated_at text not null);");
  db.run("insert into kv values('offlineQueueState','{\"private\":\"old\"}','2026-10-17 00:00:00')");
  db.run("insert into kv values('themePreference','\"blue\"','2026-10-17 00:00:00')");
  db.run("insert into kv values('api_secret_non_print','\"sekrit\"','2026-10-17 00:00:00')");
  let contents=Buffer.from(db.export());db.close();
  fs.writeFileSync(before,contents);fs.writeFileSync(after,contents);
  const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const beforeHash=hash(before);
  const run=()=>{
   const s=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass',
     '-File',path.resolve('scripts/top-chicken-rc10-kv-metadata-readonly.ps1'),
     '-Before',before,'-After',after,
     '-ExpectedBeforeSHA256',beforeHash,'-ExpectedAfterSHA256',hash(after)],
     {encoding:'utf8',timeout:40000});
   assert.equal(s.status,0,s.stdout+' '+s.stderr);
   assert.doesNotMatch(s.stdout,/offlineQueueState|themePreference|api_secret_non_print|sekrit|private|blue/);
   return s.stdout;
  };
  let out=run();assert.match(out,/KV_SUMMARY before=3 after=3 unchanged=3/);
  let sqlite=new SQL.Database(fs.readFileSync(after));
  sqlite.run("update kv set value='{\"private\":\"new\"}',updated_at='2026-10-17 01:00:00' where key='offlineQueueState'");
  sqlite.run("update kv set value='\"red\"',updated_at='2026-10-17 01:00:00' where key='themePreference'");
  sqlite.run("update kv set value='\"tok-new\"',updated_at='2026-10-17 01:00:00' where key='api_secret_non_print'");
  fs.writeFileSync(after,Buffer.from(sqlite.export()));sqlite.close();
  const changedHash=hash(after);
  out=run();
  assert.match(out,/category=OFFLINE_QUEUE_OR_SYNC before_kind=OBJECT_LIKE after_kind=OBJECT_LIKE/);
  assert.match(out,/category=RUNTIME_OR_UI_SETTINGS before_kind=STRING_LIKE after_kind=STRING_LIKE/);
  assert.match(out,/category=AUTH_OR_SESSION before_kind=STRING_LIKE after_kind=STRING_LIKE/);
  assert.match(out,/KV_SUMMARY before=3 after=3 unchanged=0 timestamp_only=0 value_changed=3 added=0 removed=0/);
  assert.equal(hash(before),beforeHash);assert.equal(hash(after),changedHash);
  console.log('PASS TC RC10 KV METADATA READONLY: private categories and kinds; keys and values never printed; input bytes preserved');
 }finally{fs.rmSync(tmp,{force:true,recursive:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
