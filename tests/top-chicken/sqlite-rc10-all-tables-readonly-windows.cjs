// Synthetic-only Windows test: exhaustive sqlite read-only postinstall diff.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const initSqlJs=require('sql.js');
if(process.platform!=='win32')throw Error('Disposable Windows ONLY');
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tc-rc10-all-tables-readonly-'));
 try{
  const before=path.join(tmp,'before.sqlite'),after=path.join(tmp,'after.sqlite');
  const SQL=await initSqlJs();
  const db=new SQL.Database();
  db.run('create table kv(k text primary key,v text); create table local_operations(id integer primary key,status text,payload blob); create table orders(id integer primary key,total integer);');
  for(let i=0;i<14;i++)db.run('insert into kv values (?,?)',['setting_'+i,'value_'+i]);
  db.run('insert into local_operations(status,payload) values (?,?)',['pending',new Uint8Array([0,7,255])]);
  db.run('insert into orders(total) values (500)');
  const original=Buffer.from(db.export());db.close();
  fs.writeFileSync(before,original);fs.writeFileSync(after,original);
  const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const initial=hash(before);
  const run=(hBefore,hAfter)=>{
   const v=spawnSync('powershell.exe',[
    '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',
    path.resolve('scripts/top-chicken-rc10-all-tables-readonly-compare.ps1'),
    '-Before',before,'-After',after,'-ExpectedBeforeSHA256',hBefore,
    '-ExpectedAfterSHA256',hAfter
   ],{encoding:'utf8',timeout:40000});
   assert.equal(v.status,0,'comparison script returned error '+v.stderr+' '+v.stdout);
   return v.stdout;
  };
  let output=run(initial,hash(after));
  assert.match(output,/TABLE_COUNTS before=3 after=3/);
  assert.match(output,/TABLES_IDENTICAL=3 TABLES_DIFFERENT=0/);
  assert.match(output,/ALL_TABLES_MATCH_PASS - NO FILES MODIFIED/);
  let altered=new SQL.Database(fs.readFileSync(after));
  altered.run("update kv set v='opened_new_version' where k='setting_0'");
  fs.writeFileSync(after,Buffer.from(altered.export()));altered.close();
  const h1=hash(after);
  output=run(initial,h1);
  assert.match(output,/TABLE_DIFFERENCE=kv before_rows=14 after_rows=14 unchanged_rows=13 missing_or_modified_before=1 added_or_modified_after=1/);
  assert.match(output,/TABLES_IDENTICAL=2 TABLES_DIFFERENT=1/);
  assert.match(output,/TABLE_DIFFS_IDENTIFIED/);
  assert.doesNotMatch(output,/opened_new_version|setting_0/);
  assert.equal(hash(before),initial);assert.equal(hash(after),h1);
  altered=new SQL.Database(fs.readFileSync(after));
  altered.run("update local_operations set payload=? where id=1",[new Uint8Array([0,8,255])]);
  fs.writeFileSync(after,Buffer.from(altered.export()));altered.close();
  const h2=hash(after);
  output=run(initial,h2);
  assert.match(output,/TABLE_DIFFERENCE=kv/);
  assert.match(output,/TABLE_DIFFERENCE=local_operations/);
  assert.match(output,/TABLES_IDENTICAL=1 TABLES_DIFFERENT=2/);
  assert.equal(hash(before),initial);assert.equal(hash(after),h2);
  console.log('PASS TC RC10 ALL-TABLES READONLY: all tables inspected; 1/2 changes detected; keys and values masked; database hashes preserved');
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
