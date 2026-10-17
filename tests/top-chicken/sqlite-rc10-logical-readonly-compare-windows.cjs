// Synthetic-only Windows test for full row multiset comparison.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const initSqlJs=require('sql.js');
if(process.platform!=='win32')throw Error('Disposable Windows ONLY');
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tc-rc10-row-comparison-'));
 try{
  const before=path.join(tmp,'before.sqlite'),after=path.join(tmp,'after.sqlite');
  const SQL=await initSqlJs();
  const db=new SQL.Database();
  db.run('create table kv(k text primary key, v text); create table local_operations(id integer primary key, status text, payload blob);');
  db.run("insert into kv values('only-test','unchanged');");
  db.run('insert into local_operations(status,payload) values (?,?)',['pending',new Uint8Array([0,7,255])]);
  let original=Buffer.from(db.export());db.close();
  fs.writeFileSync(before,original);fs.writeFileSync(after,original);
  const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const run=(beforeHash,afterHash)=>{
    const v=spawnSync('powershell.exe',[
      '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',
      path.resolve('scripts/top-chicken-rc10-logical-data-readonly-compare.ps1'),
      '-Before',before,'-After',after,
      '-ExpectedBeforeSHA256',beforeHash,'-ExpectedAfterSHA256',afterHash
    ],{encoding:'utf8',timeout:40000});
    assert.equal(v.status,0,'comparison script returned error '+v.stderr+' '+v.stdout);
    return v.stdout;
  };
  const baselineHash=hash(before);
  let result=run(baselineHash,hash(after));
  assert.match(result,/ALL_TABLE_ROWS_IDENTICAL tables=2 rows=2/);
  assert.match(result,/LOGICAL_DATA_MATCH_PASS - NO FILES MODIFIED/);
  assert.equal(hash(before),baselineHash);
  assert.equal(hash(after),baselineHash);
  const different=new SQL.Database(fs.readFileSync(after));
  different.run("update local_operations set payload=? where id=1",[new Uint8Array([9,7,255])]);
  fs.writeFileSync(after,Buffer.from(different.export()));different.close();
  const alteredHash=hash(after);
  result=run(baselineHash,alteredHash);
  assert.match(result,/DIFFERENT_TABLE=local_operations before_rows=1 after_rows=1/);
  assert.doesNotMatch(result,/LOGICAL_DATA_MATCH_PASS/);
  assert.equal(hash(before),baselineHash);
  assert.equal(hash(after),alteredHash);
  console.log('PASS TC RC10 LOGICAL READONLY: identical multisets pass; changed same-count payload detected; input bytes unchanged');
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
