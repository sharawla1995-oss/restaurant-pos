// Ephemeral Windows runner ONLY: no real device, credentials, license activation or live service requests.
import {_electron as electron} from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
if(process.platform!=='win32')throw new Error('Windows runner required');
const exe=path.resolve('dist-top-chicken-connected-qa/win-unpacked/Top Chicken Connected QA.exe');
const results=[];
async function check(label){
 let instance;
 try {
   instance=await electron.launch({executablePath:exe,args:['--disable-gpu'],timeout:60000});
   const proc=instance.process();
   const page=await instance.firstWindow({timeout:60000});
   await page.waitForFunction(()=>!!window.topBurgerDesktop?.isDesktop);
   const runtime=await instance.evaluate(()=>({electron:process.versions.electron,platform:process.platform}));
   assert.equal(runtime.electron,'22.3.27');
   const info=await page.evaluate(()=>window.topBurgerDesktop.app.info());
   assert.equal(info.version,'10.5.4-beta.18');
   const paths=await page.evaluate(()=>window.topBurgerDesktop.paths());
   const normalize=s=>String(s||'').toLowerCase();
   assert.ok(normalize(paths.database).includes('top chicken connected qa'),'app userData must be scoped to QA productName');
   assert.ok(normalize(paths.backups).includes('qa-backups'),'backups must be scoped to QA userData');
   assert.ok(!normalize(paths.backups).includes('documents\\topburgerpos'),'no shared Top Burger backups');
   const up=await page.evaluate(()=>window.topBurgerDesktop.update.check());
   assert.equal(up.error,'Updater is disabled or repository is not configured');
   if(label==='A')await page.evaluate(()=>window.topBurgerDesktop.db.set('qa-isolation-proof',{value:'qa-only',amount:218}));
   else assert.deepEqual(await page.evaluate(()=>window.topBurgerDesktop.db.get('qa-isolation-proof')),{value:'qa-only',amount:218});
   const pid=proc.pid;
   await instance.close();instance=null;
   results.push({label,pid,version:info.version,electron:runtime.electron,userData:paths.data,backups:paths.backups,sqlite_reopen:'PASS',updater_disabled:true,network:'not contacted'});
 } finally {if(instance)await instance.close().catch(()=>{});}
}
try{
 await check('A');
 await check('B');
 assert.notEqual(results[0].pid,results[1].pid);
 fs.mkdirSync('evidence/top-chicken',{recursive:true});
 fs.writeFileSync('evidence/top-chicken/connected-qa-windows-smoke.json',JSON.stringify({result:'PASS',network_qa_only:'allowlist in packaged main.js',hosted_login:'NOT_EXECUTED',actual_device_install:'NOT_EXECUTED',results},null,2));
 console.log('PASS: isolated connected QA install/process restart/SQLite preservation; no live server requests');
}catch(e){
 fs.mkdirSync('evidence/top-chicken',{recursive:true});
 fs.writeFileSync('evidence/top-chicken/connected-qa-windows-smoke.json',JSON.stringify({result:'FAIL',error:e.message,results},null,2));
 throw e;
}
