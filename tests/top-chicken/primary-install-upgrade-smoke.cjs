// Windows-only disposable-runner acceptance: stable 10.5.15 -> installed Top Chicken rc.4 -> repaired rc.5.
// No hosted credentials, SQL, Edge changes, physical devices or real customer data.
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {_electron:electron}=require('playwright');
if(process.platform!=='win32')throw Error('Windows runner required');
const target=process.env.TC_PRIMARY_INSTALL_DIR;
if(!target)throw Error('TC_PRIMARY_INSTALL_DIR missing');
const exe=path.join(target,'Sharawla POS.exe');
assert.ok(fs.existsSync(exe),'primary EXE should preserve installed Sharawla POS filename');
const out='evidence/top-chicken/primary-upgrade-smoke.json';
fs.mkdirSync(path.dirname(out),{recursive:true});
const results=[];
async function launch(label,version,seed=false){
  let instance;
  try{
    instance=await electron.launch({
      executablePath:exe,
      args:['--disable-gpu','--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE localhost'],
      env:{...process.env,TOP_CHICKEN_PRIMARY_CI_NO_NETWORK:'1'},
      timeout:60000
    });
    const win=await instance.firstWindow({timeout:45000});
    await win.waitForFunction(()=>!!window.topBurgerDesktop?.isDesktop,{timeout:30000});
    const observed=await instance.evaluate(({app})=>({version:app.getVersion(),userData:app.getPath('userData')}));
    assert.equal(observed.version,version,'running installed version');
    const paths=await win.evaluate(()=>window.topBurgerDesktop.paths());
    assert.ok(paths.database.toLowerCase().endsWith('topburger-pos.sqlite'));
    assert.ok(paths.data.startsWith(observed.userData),'DB within fixed legacy userData');
    if(!seed){
      assert.deepEqual(await win.evaluate(()=>window.topBurgerDesktop.db.get('tc-primary-upgrade-fixture')),{kind:'CI-ONLY',amount:319,from:'10.5.15'},'local DB survives main installer upgrade');
      await win.evaluate(v=>window.topBurgerDesktop.db.set('tc-primary-new-writer-proof',{written:v}),version);
      assert.deepEqual(await win.evaluate(()=>window.topBurgerDesktop.db.get('tc-primary-new-writer-proof')),{written:version},'new Windows SQLite writer works');
    }
    const pid=instance.process().pid;
    results.push({label,version:observed.version,userData:observed.userData,database:paths.database,pid,preservedFixture:true});
    await instance.close();
    instance=null;
    return observed;
  }finally{
    if(instance)await instance.close().catch(()=>{});
  }
}
async function seedSyntheticLegacyRecord(userData){
 const dbFile=path.join(userData,'data','topburger-pos.sqlite');
 assert.ok(fs.existsSync(dbFile),'official 10.5.15 local SQLite database created');
 const SqlJs=require('sql.js');
 const SQL=await SqlJs();
 const db=new SQL.Database(fs.readFileSync(dbFile));
 db.run("insert into kv(key,value,updated_at) values(?,?,datetime('now')) on conflict(key) do update set value=excluded.value,updated_at=datetime('now')",['tc-primary-upgrade-fixture',JSON.stringify({kind:'CI-ONLY',amount:319,from:'10.5.15'})]);
 const data=Buffer.from(db.export());db.close();
 fs.writeFileSync(dbFile,data);
 const verify=new SQL.Database(fs.readFileSync(dbFile));
 const row=verify.exec("select value from kv where key='tc-primary-upgrade-fixture'");
 assert.equal(JSON.parse(row[0].values[0][0]).amount,319,'synthetic old-version data inserted offline');
 verify.close();
}
(async()=>{
 try{
   const v=process.argv[2];
   let previous;
   if(v==='before'){
     previous=await launch('official-10.5.15','10.5.15',true);
     await seedSyntheticLegacyRecord(previous.userData);
     fs.writeFileSync('evidence/top-chicken/primary-upgrade-before-state.json',JSON.stringify(previous));
   }else if(v==='middle'){
     previous=await launch('existing-top-chicken-10.5.19-rc.4','10.5.19-rc.4',false);
     const original=JSON.parse(fs.readFileSync('evidence/top-chicken/primary-upgrade-before-state.json','utf8'));
     assert.equal(previous.userData,original.userData,'same main-app namespace after existing tc rc3');
   }else if(v==='after'){
     previous=await launch('candidate-10.5.19-rc.5','10.5.19-rc.5',false);
     const original=JSON.parse(fs.readFileSync('evidence/top-chicken/primary-upgrade-before-state.json','utf8'));
     assert.equal(previous.userData,original.userData,'same installed app userData before/after upgrade');
   }else throw Error('Expected "before", "middle", or "after"');
   fs.writeFileSync(out,JSON.stringify({result:'PASS',step:v,network:'blocked',hosted_E2E:'NOT TESTED',device:'CI disposable Windows only',results},null,2));
   console.log('PASS primary Windows upgrade '+v+' '+JSON.stringify(previous));
 }catch(e){
   fs.writeFileSync(out,JSON.stringify({result:'FAIL',step:process.argv[2],error:String(e&&e.stack||e),results},null,2));
   throw e;
 }
})();
