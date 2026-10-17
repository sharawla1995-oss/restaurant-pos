'use strict';
// Disposable Windows preinstall preflight: synthetic SQL.js files ONLY.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const initSqlJs=require('sql.js');
if(process.platform!=='win32')throw Error('Windows runner only');
const script=path.resolve('scripts/top-chicken-sqlite-preinstall-readonly.ps1');
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tc-readonly-preflight-'));
 try{
  const data=path.join(temp,'data'),rescue=path.join(temp,'rescue'),rescueData=path.join(rescue,'data');
  fs.mkdirSync(data,{recursive:true});fs.mkdirSync(rescueData,{recursive:true});
  const SQL=await initSqlJs(),db=new SQL.Database();
  db.run("create table local_operations(id integer primary key,client_tx_id text,status text not null);insert into local_operations(client_tx_id,status) values('CI-TC-001','pending');insert into local_operations(client_tx_id,status) values('CI-TC-002','done');");
  const bytes=Buffer.from(db.export());db.close();
  const paths=[
   path.join(data,'topburger-pos.sqlite'),
   path.join(data,'topburger-pos.lastgood.sqlite'),
   path.join(rescueData,'topburger-pos.sqlite.tmp-6612-1792195243919-6d90fd5a')
  ];
  for(const p of paths)fs.writeFileSync(p,bytes);
  const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,
   '-DataDirectory',data,'-RescueDirectory',rescue];
  const out=spawnSync('powershell.exe',args,{encoding:'utf8',timeout:30000});
  assert.equal(out.status,0,'read-only script exit success: '+String(out.stderr||out.stdout).slice(0,2000));
  assert.match(out.stdout,/PREINSTALL_READ_ONLY_COMPLETE/);
  assert.match(out.stdout,/local_operations=2 \| pending=1/);
  for(const p of paths)assert.deepEqual(fs.readFileSync(p),bytes,'preflight must not modify SQLite');
  console.log('PASS TC READONLY PREFLIGHT: 3 healthy test SQLite files, one pending, no file mutation');
 }finally{fs.rmSync(temp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
