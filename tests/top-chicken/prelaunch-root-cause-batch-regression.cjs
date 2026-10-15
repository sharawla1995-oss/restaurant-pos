'use strict';
// Source-only Top Chicken prelaunch batch. No DB, cloud, device, queue, or release writes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8');
const notifications=fs.readFileSync('v10-5-14-ops-hr-summary.js','utf8');
const updater=fs.readFileSync('main.js','utf8');
new vm.Script(app);new vm.Script(notifications);new vm.Script(updater);

const TC='5358328c-9724-49aa-affc-1bce8be90f92';
const BETA='https://xihcxydjnzemflhedzor.supabase.co';
const pauseStart=app.indexOf("const TOP_CHICKEN_SYNC_PAUSE_KEY=");
const pauseEnd=app.indexOf("async function showTopChickenSyncDiagnostics()",pauseStart);
assert.ok(pauseStart>=0&&pauseEnd>pauseStart,'sync pause is present');
const db=new Map([['top-chicken-sh0008-sync-diagnostics-paused-v1','0']]);
const context={
 cfg:{url:BETA},state:{employee:null},currentBranchId:()=>22,
 localStorage:{getItem:k=>db.get(k)||null,setItem:(k,v)=>db.set(k,v),removeItem:k=>db.delete(k)}
};
vm.createContext(context);
vm.runInContext(app.slice(pauseStart,pauseEnd),context);
const paused=()=>vm.runInContext('isTopChickenSyncPaused()',context);
assert.equal(paused(),true,'unknown identity on Beta must not auto replay');
context.state.employee={business_id:TC};
assert.equal(paused(),true,'prior stored consent is NOT fresh session consent');
vm.runInContext('topChickenSyncResumeApprovedThisSession=true',context);
assert.equal(paused(),false,'current session consent can allow replay in memory (no actual sends)');
context.currentBranchId=()=>1;
assert.equal(paused(),true,'Top Chicken wrong branch cannot replay');
context.currentBranchId=()=>22;
context.state.employee={business_id:'91826502-590e-4afa-8826-2c0f4b99c490'};
assert.equal(paused(),false,'unrelated legacy Beta business maintains behavior');
context.cfg.url='https://some-other-supabase.co';context.state.employee=null;
assert.equal(paused(),false,'non Beta database remains unaffected');
assert.match(app,/if\(!navigator\.onLine\|\|!session\?\.access_token\|\|isTopChickenSyncPaused\(\)\)return;/);
assert.match(app,/for\(const job of \[\.\.\.q\]\)\{if\(isTopChickenSyncPaused\(\)\)break;/);

const notifStart=notifications.indexOf('// This optional V14 table is not installed');
const notifEnd=notifications.indexOf('function navigateNotification(',notifStart);
assert.ok(notifStart>=0&&notifEnd>notifStart,'Top Chicken 404 backoff code exists');
let scoped=true,requests=0;
const mockNotice={
 global:{isTopChickenSyncDiagnosticsScope:()=>scoped,rest:async()=>{
  requests++;throw Error("Could not find the table 'public.app_notifications_v1' in the schema cache")
 }},
 navigator:{onLine:true},console:{warn:()=>{}},
 $:()=>({classList:{add:()=>{},toggle:()=>{}},textContent:'7'})
};
vm.createContext(mockNotice);
vm.runInContext(notifications.slice(notifStart,notifEnd),mockNotice);
(async()=>{
 await vm.runInContext('refreshNotifications()',mockNotice);
 await vm.runInContext('refreshNotifications()',mockNotice);
 assert.equal(requests,1,'TC missing table must not be polled repeatedly');
 await vm.runInContext('markNotificationRead(5)',mockNotice);
 assert.equal(requests,1,'missing TC notification table is never PATCHed');
 scoped=false;
 await vm.runInContext('refreshNotifications()',mockNotice);
 assert.equal(requests,2,'other tenant preserves original API route');

 const tcUpdater=updater.slice(
  updater.indexOf('async function checkForTopChickenUpdate('),
  updater.indexOf('async function checkForWindowsUpdate(')
 );
 for(const stage of [
  'device-identity','central-entitlement','dedicated-github-feed',
  'installer-download','pre-install-entitlement','pre-install-local-backup'
 ])assert.ok(tcUpdater.includes(stage),'updater diagnostic stage '+stage);
 assert.ok(tcUpdater.includes('topChickenUpdates.FEED_URL'),'dedicated update feed');
 assert.ok(!tcUpdater.includes('const api='),'Top Chicken does not use generic latest release API');
 assert.ok(tcUpdater.includes("error,stage:checkStage"),'stage and error returned');
 console.log('PASS: Top Chicken startup replay fails closed, fresh consent enforced, other Beta/Production preserved; missing notification table bounded to one read and no PATCH; updater stage diagnostics');
})().catch(e=>{console.error(e);process.exitCode=1});
