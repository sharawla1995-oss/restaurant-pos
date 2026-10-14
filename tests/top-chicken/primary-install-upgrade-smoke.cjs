// Windows-only disposable-runner upgrade acceptance: official 10.5.15 -> Top Chicken 10.5.19-rc.1.
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
    const observed=await instance.evaluate(()=>({version:require('electron').app.getVersion(),userData:require('electron').app.getPath('userData')}));
    assert.equal(observed.version,version,'running installed version');
    const paths=await win.evaluate(()=>window.topBurgerDesktop.paths());
    assert.ok(paths.database.toLowerCase().endsWith('topburger-pos.sqlite'));
    assert.ok(paths.data.startsWith(observed.userData),'DB within fixed legacy userData');
    if(seed){
      await win.evaluate(()=>window.topBurgerDesktop.db.set('tc-primary-upgrade-fixture',{kind:'CI-ONLY',amount:319,from:'10.5.15'}));
      assert.deepEqual(await win.evaluate(()=>window.topBurgerDesktop.db.get('tc-primary-upgrade-fixture')),{kind:'CI-ONLY',amount:319,from:'10.5.15'});
    }else{
      assert.deepEqual(await win.evaluate(()=>window.topBurgerDesktop.db.get('tc-primary-upgrade-fixture')),{kind:'CI-ONLY',amount:319,from:'10.5.15'},'local DB survives main installer upgrade');
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
(async()=>{
 try{
   const v=process.argv[2];
   let previous;
   if(v==='before'){
     previous=await launch('official-10.5.15','10.5.15',true);
   }else if(v==='after'){
     previous=await launch('candidate-10.5.19-rc.1','10.5.19-rc.1',false);
   }else throw Error('Expected "before" or "after"');
   fs.writeFileSync(out,JSON.stringify({result:'PASS',step:v,network:'blocked',hosted_E2E:'NOT TESTED',device:'CI disposable Windows only',results},null,2));
   console.log('PASS primary Windows upgrade '+v+' '+JSON.stringify(previous));
 }catch(e){
   fs.writeFileSync(out,JSON.stringify({result:'FAIL',step:process.argv[2],error:String(e&&e.stack||e),results},null,2));
   throw e;
 }
})();
