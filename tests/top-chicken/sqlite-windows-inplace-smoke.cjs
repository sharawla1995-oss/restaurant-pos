'use strict';
// Disposable Windows ONLY. GitHub Actions must block Electron networking.
// No credentials, hosted order writes, or access to any real SH-0008 filesystem.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {_electron:electron}=require('playwright');
const initSqlJs=require('sql.js');
if(process.platform!=='win32')throw Error('This regression requires disposable Windows');
if(process.env.TOP_CHICKEN_PRIMARY_CI_NO_NETWORK!=='1')throw Error('Must block outbound Electron networking');
const install=process.env.TC_SQLITE_TEST_INSTALL_DIR;
if(!install||!install.includes('TC-SQLITE-INPLACE-TEST'))throw Error('Unsafe installation directory');
const exe=path.join(install,'Sharawla POS.exe');
const mode=process.argv[2];
const out=path.join('evidence','top-chicken',`sqlite-windows-report-${mode}.json`);
fs.mkdirSync(path.dirname(out),{recursive:true});
const report={status:'FAIL',scope:'Disposable Windows runner; no external device/hosted writes',steps:[]};
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const mark=(step,detail)=>report.steps.push({step,...detail});

async function withApp(label,action,expectedVersion='10.5.19-rc.10'){
  let instance;
  try{
    instance=await electron.launch({
      executablePath:exe,
      args:['--disable-gpu','--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE localhost'],
      env:{...process.env,TOP_CHICKEN_PRIMARY_CI_NO_NETWORK:'1'},
      timeout:60000
    });
    const window=await instance.firstWindow({timeout:60000});
    await window.waitForFunction(()=>Boolean(window.topBurgerDesktop?.isDesktop),{timeout:30000});
    const appInfo=await instance.evaluate(({app})=>({userData:app.getPath('userData'),version:app.getVersion()}));
    assert.equal(appInfo.version,expectedVersion,'expected staged installer version on disposable Windows');
    const p=await window.evaluate(()=>window.topBurgerDesktop.paths());
    assert.equal(p.database,path.join(appInfo.userData,'data','topburger-pos.sqlite'));
    assert.ok(appInfo.userData.toLowerCase().includes('sharawla-pos-windows'),'legacy namespace intentionally unchanged');
    await action({instance,window,appInfo,p});
    mark(label,{version:appInfo.version,data:p.data,userData:appInfo.userData});
    await instance.close();
    instance=null;
    return {appInfo,p};
  }finally{
    if(instance)await instance.close().catch(()=>{});
  }
}
async function sqliteCheck(file){
  const SQL=await initSqlJs();
  const db=new SQL.Database(fs.readFileSync(file));
  try{
    const result=db.exec('PRAGMA integrity_check');
    assert.deepEqual(result[0].values,[['ok']],'healthy SQLite '+path.basename(file));
    return db;
  }catch(err){db.close();throw err}
}
async function seedBefore(){
  const startup=await withApp('original_rc9_first_run',async({window})=>{
    const r=await window.evaluate(()=>window.topBurgerDesktop.paths());
    assert.ok(fs.existsSync(r.database),'legacy local DB created');
  },'10.5.19-rc.9');
  const filepath=startup.p.database;
  const db=await sqliteCheck(filepath);
  try{
    db.run('insert into kv(key,value,updated_at) values(?,?,datetime(\'now\'))',['tc-ci-persistent-key',JSON.stringify({kind:'CI',amount:319})]);
    db.run('insert into local_operations(client_tx_id,type,payload,status) values(?,?,?,?)',[
      'TC-CI-ONLY-ORDER-1','tc-ci-synthetic',{toString(){return JSON.stringify({client_tx_id:'TC-CI-ONLY-ORDER-1',branch_id:22,amount:319,kind:'synthetic'})}}.toString(),'pending'
    ]);
    fs.writeFileSync(filepath,Buffer.from(db.export()));
  }finally{db.close()}
  const verify=await sqliteCheck(filepath);
  assert.equal(verify.exec("select count(*) from local_operations where status='pending'")[0].values[0][0],1);
  verify.close();
  fs.writeFileSync('evidence/top-chicken/sqlite-windows-before.json',JSON.stringify({path:filepath,sha256:sha(filepath),userData:startup.appInfo.userData},null,2));
  mark('synthetic_pending_queue_seeded',{dbSha256:sha(filepath)});
}
async function verifyAfter(){
  const original=JSON.parse(fs.readFileSync('evidence/top-chicken/sqlite-windows-before.json','utf8'));
  let currentDb;
  const after=await withApp('candidate_in_place_launch',async({window,appInfo,p})=>{
    assert.equal(appInfo.userData,original.userData,'exact same userData');
    assert.equal(p.database,original.path,'same SQLite absolute path');
    const val=await window.evaluate(()=>window.topBurgerDesktop.db.get('tc-ci-persistent-key'));
    assert.deepEqual(val,{kind:'CI',amount:319},'existing key must survive upgrade');
    const jobs=await window.evaluate(()=>window.topBurgerDesktop.operations.list('pending'));
    assert.equal(jobs.filter(o=>o.client_tx_id==='TC-CI-ONLY-ORDER-1').length,1,'old pending offline order retained');
    await window.evaluate(()=>window.topBurgerDesktop.db.set('tc-ci-after-upgrade',{written:'candidate-only'}));
    const newVal=await window.evaluate(()=>window.topBurgerDesktop.db.get('tc-ci-after-upgrade'));
    assert.deepEqual(newVal,{written:'candidate-only'});
    currentDb=p.database;
  });
  assert.equal(after.p.database,original.path);
  const check=await sqliteCheck(currentDb);
  try{
    assert.equal(check.exec("select count(*) from local_operations where status='pending'")[0].values[0][0],1,'no implicit queue replay/deletion');
    assert.ok(check.exec("select value from kv where key='tc-ci-after-upgrade'").length>0);
  }finally{check.close()}
  const lastgood=path.join(path.dirname(currentDb),'topburger-pos.lastgood.sqlite');
  const lg=await sqliteCheck(lastgood);lg.close();
  const bytes=fs.readFileSync(currentDb);
  mark('verified_candidate_sqlite',{dbSha256:sha(currentDb),lastgoodSha256:sha(lastgood),bytes:bytes.length});

  // Full process exit then a genuinely fresh process, same disk and queue.
  await withApp('candidate_second_fresh_process',async({window,p})=>{
    assert.equal(p.database,currentDb);
    assert.deepEqual(await window.evaluate(()=>window.topBurgerDesktop.db.get('tc-ci-after-upgrade')),{written:'candidate-only'});
    const q=await window.evaluate(()=>window.topBurgerDesktop.operations.list('pending'));
    assert.equal(q.filter(x=>x.client_tx_id==='TC-CI-ONLY-ORDER-1').length,1);
  });
  // Corrupt a *disposable* copy of main; startup must reject without creating an empty DB.
  const valid=fs.readFileSync(currentDb);
  const oldBackup=fs.readFileSync(lastgood);
  fs.writeFileSync(currentDb,Buffer.from('NOT SQLITE - DISPOSABLE CI FAULT'));
  const damagedHash=sha(currentDb);
  const exitCode=await new Promise((resolve,reject)=>{
    const child=spawn(exe,['--disable-gpu','--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE localhost'],{
      env:{...process.env,TOP_CHICKEN_PRIMARY_CI_NO_NETWORK:'1'},
      stdio:'ignore',windowsHide:true
    });
    const timeout=setTimeout(()=>{child.kill();reject(new Error('Corrupted startup did not fail closed within 30s'))},30000);
    child.on('error',e=>{clearTimeout(timeout);reject(e)});
    child.on('exit',code=>{clearTimeout(timeout);resolve(code)});
  });
  assert.equal(exitCode,40,'corrupted main fails closed with special test exit code');
  assert.equal(sha(currentDb),damagedHash,'corrupt user data retained for recovery, no silent overwrite');
  assert.deepEqual(fs.readFileSync(lastgood),oldBackup,'lastgood never overwritten on corrupt startup');
  mark('corrupt_main_denied',{exitCode,preservedLastgood:true});
  // Reset ONLY the synthetic test data to complete the isolated smoke evidence.
  fs.writeFileSync(currentDb,valid);
  const last=await sqliteCheck(currentDb);last.close();
  report.status='PASS';
}
async function verifyRollback(expectedVersion,label){
  const original=JSON.parse(fs.readFileSync('evidence/top-chicken/sqlite-windows-before.json','utf8'));
  const result=await withApp(label,async({window,appInfo,p})=>{
    assert.equal(p.database,original.path,'rollback and reupgrade must preserve exact SQLite path');
    assert.equal(appInfo.userData,original.userData,'rollback and reupgrade must preserve userData');
    assert.deepEqual(await window.evaluate(()=>window.topBurgerDesktop.db.get('tc-ci-persistent-key')),{kind:'CI',amount:319},'old key must survive rollback');
    assert.deepEqual(await window.evaluate(()=>window.topBurgerDesktop.db.get('tc-ci-after-upgrade')),{written:'candidate-only'},'new key must survive rollback');
    const pending=await window.evaluate(()=>window.topBurgerDesktop.operations.list('pending'));
    assert.equal(pending.filter(item=>item.client_tx_id==='TC-CI-ONLY-ORDER-1').length,1,'rollback keeps exactly one pending synthetic order');
  },expectedVersion);
  const db=await sqliteCheck(result.p.database);
  try{
    const rows=db.exec("select status from local_operations where client_tx_id='TC-CI-ONLY-ORDER-1'");
    assert.deepEqual(rows[0].values,[['pending']],'pending queue must not replay during rollback/reupgrade');
  }finally{db.close()}
  const good=await sqliteCheck(path.join(path.dirname(result.p.database),'topburger-pos.lastgood.sqlite'));
  good.close();
  mark(label,{version:expectedVersion,mainSha256:sha(result.p.database)});
  report.status='PASS';
}
(async()=>{
  try{
    if(!fs.existsSync(exe))throw Error('Installer executable missing at disposable target');
    if(mode==='before')await seedBefore();
    else if(mode==='after')await verifyAfter();
    else if(mode==='rollback')await verifyRollback('10.5.19-rc.9','old_rc9_rollback');
    else if(mode==='reupgrade')await verifyRollback('10.5.19-rc.10','patched_rc10_reupgrade');
    else throw Error('Expected before/after/rollback/reupgrade');
    if(mode==='before')report.status='PASS';
    fs.writeFileSync(out,JSON.stringify(report,null,2));
    console.log('PASS TC SQLITE WINDOWS INPLACE '+mode+' '+JSON.stringify(report));
  }catch(err){
    report.error=String(err&&err.stack||err);
    fs.writeFileSync(out,JSON.stringify(report,null,2));
    console.error(report.error);process.exitCode=1;
  }
})();
