// Executes only the separately packaged, offline-only test build on an isolated Windows runner.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
if(process.platform!=='win32')throw new Error('Windows execution required');
const exe=path.resolve('dist-top-chicken-test/win-unpacked/Top Chicken Beta TEST.exe');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'tc-prelaunch-'));
const runs=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function run(label){
 const child=spawn(exe,['--remote-debugging-port=9322'],{env:{...process.env,TOP_CHICKEN_TEST_USER_DATA:data},stdio:'pipe'});
 let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
 let browser;
 try{
  for(let i=0;i<60;i++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9322');break;}catch{await pause(500);}}
  assert.ok(browser,'Packaged Electron must expose a renderer');
  const page=browser.contexts()[0].pages()[0];await page.waitForFunction(()=>window.topBurgerDesktop?.isDesktop);
  const info=await page.evaluate(()=>window.topBurgerDesktop.app.info());
  assert.equal(info.version,'10.5.4-beta.17');
  const update=await page.evaluate(()=>window.topBurgerDesktop.update.check());
  assert.equal(update.error,'Updater is disabled or repository is not configured');
  const network=await page.evaluate(async()=>{try{await fetch('https://xihcxydjnzemflhedzor.supabase.co/rest/v1/orders');return 'unexpected-success';}catch{return 'blocked';}});
  assert.equal(network,'blocked');
  const paths=await page.evaluate(()=>window.topBurgerDesktop.paths());
  if(label==='A')await page.evaluate(()=>window.topBurgerDesktop.db.set('tc-test-sentinel',{test:true,amount:170}));
  else assert.deepEqual(await page.evaluate(()=>window.topBurgerDesktop.db.get('tc-test-sentinel')),{test:true,amount:170});
  runs.push({process:label,pid:child.pid,info,paths,update,live_network:network,sqlite_persistence:'PASS'});
  await page.evaluate(()=>window.close());
  for(let i=0;i<40&&child.exitCode===null;i++)await pause(250);
  assert.notEqual(child.exitCode,null,'Electron must fully exit before next process');
 }finally{
  if(browser)await browser.close().catch(()=>{});
  if(child.exitCode===null){const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F']);await new Promise(r=>killer.once('exit',r));}
  fs.writeFileSync(`evidence/top-chicken/windows-process-${label}.log`,log);
 }
}
try{await run('A');await run('B');assert.notEqual(runs[0].pid,runs[1].pid);fs.writeFileSync('evidence/top-chicken/windows-runtime-results.json',JSON.stringify({result:'PASS',platform:process.platform,processes:runs,scope:'isolated packaged app startup / updater blocked / network blocked / SQLite full restart; no Auth login or site-to-POS workflow'},null,2));}
catch(e){fs.writeFileSync('evidence/top-chicken/windows-runtime-results.json',JSON.stringify({result:'FAIL',error:e.message,processes:runs},null,2));throw e;}
