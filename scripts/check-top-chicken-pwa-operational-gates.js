'use strict';
// Top Chicken Branch 22 web-only gate. No network or database is used by this test.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const boot=fs.readFileSync(path.join(root,'top-chicken-pos/tc-pwa-boot.js'),'utf8');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const installedFetches=[];
let beaconInvocations=0;
const navigator={sendBeacon(){beaconInvocations++;return true}};
const win={
  topBurgerDesktop:null,
  location:{href:'https://top-chicken-pos-beta-preview.vercel.app/'},
  fetch:async (input,init)=>{installedFetches.push([input,init]);return {ok:true}},
  addEventListener(){},
};
vm.runInNewContext(boot,{
  window:win,navigator,
  document:{getElementById:()=>null},URL,Response,Promise,Error,console
},{filename:'tc-pwa-boot.js'});
assert.equal(win.__TOP_CHICKEN_PWA_PREVIEW__,'top-chicken-branch22-preview-v1');
const beta='https://xihcxydjnzemflhedzor.supabase.co';
const central='https://ikppryeavoabnugcijeq.supabase.co';
const burger='https://kzokretuuigjhxjzdlmk.supabase.co';
(async()=>{
  // Exact Beta authentication & read-only authorization calls allowed.
  for(const uri of [
    '/auth/v1/token?grant_type=password',
    '/auth/v1/token?grant_type=refresh_token',
    '/functions/v1/top-chicken-pin-login',
    '/rest/v1/rpc/has_permission'
  ])await win.fetch(beta+uri,{method:'POST'});
  await win.fetch(beta+'/rest/v1/products',{method:'GET'});
  await win.fetch(beta+'/rest/v1/products',{method:'HEAD'});
  const missing=await win.fetch(beta+'/rest/v1/app_notifications_v1?select=*',{method:'GET'});
  assert.equal(missing.status,200);
  assert.deepEqual(await missing.json(),[]);
  assert.equal(installedFetches.length,6,'Missing optional table must not hit Beta');
  assert(app.includes('TOP_CHICKEN_PWA_PREVIEW?15000:5000'));
  // Every operational mutation, including alternate destinations, must fail.
  for(const url of [
    beta+'/rest/v1/rpc/create_pos_order_atomic',
    beta+'/rest/v1/orders',
    beta+'/rest/v1/rpc/open_pos_shift_idempotent',
    beta+'/rest/v1/rpc/close_pos_shift_idempotent',
    beta+'/rest/v1/rpc/has_permission?force=true',
    burger+'/rest/v1/orders',
    central+'/rest/v1/anywrite',
    'https://example.org/receiver'
  ])for(const method of ['POST','PUT','PATCH','DELETE']){
    await assert.rejects(win.fetch(url,{method}),/ممنوع حفظ أو تعديل/);
  }
  assert.equal(installedFetches.length,6,'No blocked mutation reached network transport');
  assert.equal(navigator.sendBeacon('https://example.org/receiver','x'),false);
  assert.equal(beaconInvocations,0);
  // Preview must never fall back to offline credentials or persisted financial queues.
  for(const signal of [
    'if(TOP_CHICKEN_PWA_PREVIEW&&!navigator.onLine)throw new Error',
    "if(TOP_CHICKEN_PWA_PREVIEW)throw new Error('Top Chicken PWA المعاينة لا يفتح بيانات مخزنة",
    'if(TOP_CHICKEN_PWA_PREVIEW)return;if(!navigator.onLine',
    'if(TOP_CHICKEN_PWA_PREVIEW)return;try{await odbSet',
    'if(TOP_CHICKEN_PWA_PREVIEW||!navigator.onLine)return;',
    'if(TOP_CHICKEN_PWA_PREVIEW)return sh;if(sh)await odbSet',
    'if(TOP_CHICKEN_PWA_PREVIEW)return;if(!o?.id)return;',
    'if(TOP_CHICKEN_PWA_PREVIEW)localStorage.removeItem'
  ])assert(app.includes(signal),'Missing fail-closed offline guard: '+signal);
  for(const phrase of [
    "if(isTopChickenBetaAuthScope()&&!window.topBurgerDesktop?.isDesktop){toast('تم طلب فتح نافذة الطباعة",
    "function autoPrintOrder(o,items){if(isTopChickenBetaAuthScope()&&!window.topBurgerDesktop?.isDesktop)return;",
    "async function recordSuccessfulPrint(o,type,wasCopy){if(isTopChickenBetaAuthScope()&&!window.topBurgerDesktop?.isDesktop)return;"
  ])assert(app.includes(phrase),'Missing web-only print honesty guard: '+phrase);
  assert(app.includes("String(member.business_id)!==TOP_CHICKEN_PWA_BUSINESS_ID"));
  assert(app.includes("Number(member.branch_id)!==TOP_CHICKEN_PWA_BRANCH_ID"));
  console.log('TOP_CHICKEN_PWA_SECURITY_GATE_PASS 8 destinations x 4 write methods blocked, offline denied');
})().catch(e=>{console.error(e);process.exitCode=1});
