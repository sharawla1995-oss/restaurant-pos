// Isolated packaged Windows runtime; no live services, credentials or device binding.
import {_electron as electron} from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
if(process.platform!=='win32')throw new Error('Windows execution required');
const exe=path.resolve('dist-top-chicken-test/win-unpacked/Top Chicken Beta TEST.exe');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'tc-prelaunch-'));
const runs=[];
async function run(label){
 let app;let log='';
 try{
  app=await electron.launch({executablePath:exe,args:['--disable-gpu'],env:{...process.env,TOP_CHICKEN_TEST_USER_DATA:data},timeout:60000});
  const child=app.process();child.stdout?.on('data',d=>log+=d);child.stderr?.on('data',d=>log+=d);
  const page=await app.firstWindow({timeout:60000});await page.waitForFunction(()=>window.topBurgerDesktop?.isDesktop);
  const runtime=await app.evaluate(()=>({electron:process.versions.electron,platform:process.platform}));
  assert.equal(runtime.electron,'22.3.27');assert.equal(runtime.platform,'win32');
  const info=await page.evaluate(()=>window.topBurgerDesktop.app.info());assert.equal(info.version,'10.5.4-beta.17');
  const update=await page.evaluate(()=>window.topBurgerDesktop.update.check());
  assert.equal(update.error,'Updater is disabled or repository is not configured');
  const network=await page.evaluate(async()=>{try{await fetch('https://xihcxydjnzemflhedzor.supabase.co/rest/v1/orders');return 'unexpected-success';}catch{return 'blocked';}});
  assert.equal(network,'blocked');
  const paths=await page.evaluate(()=>window.topBurgerDesktop.paths());
  if(label==='A')await page.evaluate(()=>window.topBurgerDesktop.db.set('tc-test-sentinel',{test:true,amount:170}));
  else assert.deepEqual(await page.evaluate(()=>window.topBurgerDesktop.db.get('tc-test-sentinel')),{test:true,amount:170});
  const pid=child.pid;
  await app.close();if(child.exitCode===null)await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,5000))]);assert.notEqual(child.exitCode,null,'Full Electron process exit required');app=null;
  runs.push({process:label,pid,runtime,info,paths,update,live_network:network,sqlite_persistence:'PASS',full_exit:'PASS'});
 }finally{
  if(app)await app.close().catch(()=>{});
  fs.writeFileSync(`evidence/top-chicken/windows-process-${label}.log`,log);
 }
}
try{await run('A');await run('B');assert.notEqual(runs[0].pid,runs[1].pid);fs.writeFileSync('evidence/top-chicken/windows-runtime-results.json',JSON.stringify({result:'PASS',platform:process.platform,processes:runs,scope:'isolated packaged app startup / updater blocked / live network blocked / SQLite full restart; no Auth login or site-to-POS workflow'},null,2));}
catch(e){fs.writeFileSync('evidence/top-chicken/windows-runtime-results.json',JSON.stringify({result:'FAIL',error:e.message,processes:runs},null,2));throw e;}
