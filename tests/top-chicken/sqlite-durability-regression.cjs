'use strict';
// Disposable local SQLite regression. No Supabase, device, network, or test-data reset.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const initSqlJs=require('sql.js');
const {createProtectedSqliteStore,assertSqliteHealthy}=require('../../top-chicken-sqlite-durability');

function digest(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}
function mockFs(name,fn){
  const result=Object.create(fs);
  result[name]=fn;
  return result;
}
function leftovers(folder){return fs.readdirSync(folder).filter(n=>n.includes('.tmp-'))}
function key(db,key){
  const rows=db.exec("select value from kv where key='"+key+"'");
  return rows.length?rows[0].values[0][0]:null;
}
(async()=>{
  const SQL=await initSqlJs();
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'top-chicken-sqlite-safety-'));
  try{
    const main=path.join(root,'topburger-pos.sqlite');
    const lastGood=path.join(root,'topburger-pos.lastgood.sqlite');
    const store=(fileSystem=fs)=>createProtectedSqliteStore({fs:fileSystem,SQL,mainPath:main,lastGoodPath:lastGood});
    let db=store().open();
    db.run('create table kv(key text primary key,value text);create table local_operations(client_tx_id text primary key, payload text);');
    db.run("insert into kv values ('v','1');insert into local_operations values ('TX-ONE','{\"amount\":319}');");
    assert.equal(store().persist(db),true,'fresh instance writes SQLite atomically');
    assert.equal(key(store().open(),'v'),'1');
    assert.equal(key(store().open(),'v'),'1');
    assert.equal(leftovers(root).length,0,'no temp after first save');
    db.close();

    const stable=store();
    db=stable.open();
    db.run("update kv set value='2' where key='v'");
    stable.persist(db);
    assert.ok(fs.existsSync(lastGood),'previous known-good snapshot retained');
    assert.equal(key(store().open(),'v'),'2');
    const beforeMain=digest(main);
    const beforeLast=digest(lastGood);
    assertSqliteHealthy(SQL,fs.readFileSync(lastGood),'lastgood');
    db.close();

    // Crash/locked Windows rename: the existing live DB is not truncated.
    let faulted=false;
    const renameFs=mockFs('renameSync',(src,dst)=>{
      if(dst===main){faulted=true;throw Object.assign(new Error('simulated destination locked'),{code:'EPERM'})}
      return fs.renameSync(src,dst);
    });
    const badStore=store(renameFs);
    db=badStore.open();
    db.run("update kv set value='3' where key='v'");
    assert.throws(()=>badStore.persist(db),/simulated destination locked/);
    assert.equal(faulted,true);
    assert.equal(digest(main),beforeMain,'rename failure never overwrites original main');
    assert.equal(key(store().open(),'v'),'2','restart recovers last committed transaction');
    assert.equal(key(new SQL.Database(fs.readFileSync(lastGood)),'v'),'2','lastgood stays valid');
    assert.equal(leftovers(root).length,0,'failed rename does not leak temp files');
    assert.equal(badStore.isWriteBlocked(),true,'first failure locks writes until restart');
    assert.throws(()=>badStore.persist(db),/SQLITE_WRITES_BLOCKED_AFTER_FAILURE/);
    db.close();

    // ENOSPC on staging or fsync aborts before replacing either live file.
    for(const operation of ['writeFileSync','fsyncSync']){
      const faultFs=mockFs(operation,()=>{throw Object.assign(new Error('simulated '+operation+' disk failure'),{code:'ENOSPC'})});
      const damaged=store(faultFs);
      db=damaged.open();
      db.run("update kv set value='4' where key='v'");
      assert.throws(()=>damaged.persist(db),/simulated/);
      assert.equal(digest(main),beforeMain,'ENOSPC preserves main: '+operation);
      assertSqliteHealthy(SQL,fs.readFileSync(lastGood),'lastgood after '+operation);
      assert.equal(leftovers(root).length,0,'ENOSPC cleans temp: '+operation);
      assert.ok(damaged.isWriteBlocked());
      db.close();
    }

    // Corrupted main cannot silently fall back or wipe the durable pending queue.
    const original=fs.readFileSync(main);
    const fallback=fs.readFileSync(lastGood);
    fs.writeFileSync(main,Buffer.from('broken sqlite contents'));
    assert.throws(()=>store().open(),/SQLITE_INVALID_HEADER/,'corrupt main must stop startup, even when lastgood exists');
    assert.equal(fs.readFileSync(main).toString(),'broken sqlite contents');
    assert.equal(fs.readFileSync(lastGood).compare(fallback),0,'no backup poisoning on failed open');
    fs.writeFileSync(main,original);

    // Corrupted lastgood is repaired only from a successfully verified main.
    fs.writeFileSync(lastGood,'corrupt lastgood');
    const salvage=store();
    db=salvage.open();
    db.run("update kv set value='5' where key='v'");
    salvage.persist(db);
    assertSqliteHealthy(SQL,fs.readFileSync(lastGood),'lastgood reconstructed from valid main');
    assert.equal(key(store().open(),'v'),'5');
    assert.equal(key(store().open(),'v'),'5');
    db.close();

    // Main missing with backup or abandoned temp is never interpreted as new installation.
    const holding=fs.readFileSync(main);
    fs.unlinkSync(main);
    assert.throws(()=>store().open(),/SQLITE_MAIN_MISSING_WITH_LASTGOOD/);
    fs.unlinkSync(lastGood);
    fs.writeFileSync(main+'.tmp-recovery-evidence',holding);
    assert.throws(()=>store().open(),/SQLITE_MAIN_MISSING_WITH_TEMP/);
    fs.unlinkSync(main+'.tmp-recovery-evidence');
    fs.writeFileSync(main,holding);
    const recovered=store().open();
    assert.equal(key(recovered,'v'),'5');
    const txn=recovered.exec("select payload from local_operations where client_tx_id='TX-ONE'");
    assert.equal(JSON.parse(txn[0].values[0][0]).amount,319,'offline operation receipt survives restart');
    recovered.close();

    // No cloud/sync calls and no generic update-feed changes in this source fix.
    const mainSource=fs.readFileSync(path.resolve(__dirname,'../../main.js'),'utf8');
    assert.match(mainSource,/app\.requestSingleInstanceLock\(\)/);
    assert.match(mainSource,/createProtectedSqliteStore/);
    assert.doesNotMatch(mainSource,/fs\.copyFileSync\(tmp,p\)/);
    console.log('PASS TC SQLITE: fresh save, full integrity, lastgood, restart, ENOSPC, fsync, locked rename, zero stage leaks, fail-closed corrupted files, durable local operations, single instance');
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1});
