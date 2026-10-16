'use strict';
// SOURCE ONLY, isolated HR renderer evaluation. No Supabase writes or device changes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const full=fs.readFileSync('hr-attendance-admin-v1.js','utf8');
const begin=full.indexOf('function appVisible(){'),end=full.indexOf('function syncNav(){',begin);
assert(begin>0&&end>begin,'HR visibility / permissions source must exist');
const scope=full.slice(begin,end);
let count=0;
const pass=(label,fn)=>Promise.resolve().then(fn).then(()=>{count++;console.log('PASS',label)});
function fixture({visibility='visible',api=true,local=null,implement}={}){
 let requests=[],navCount=0;
 const perms=Object.create(null),PERMISSIONS=['hr.employees.view','hr.deduction_rules.view'];
 const context={
  global:{...(api?{rpc:(name,args)=>{requests.push([name,args]);return implement?implement(name,args):Promise.resolve(true)}}:{}),
    ...(local?{sharawlaHasPermissionLocal:local}:{})},
  document:{visibilityState:visibility},PERMISSIONS,perms,
  rpc:(name,args)=>context.global.rpc(name,args),
  syncNav:()=>{navCount++}
 };
 vm.createContext(context);
 vm.runInContext(scope,context,{timeout:1000});
 return{context,requests,perms,PERMISSIONS,get navCount(){return navCount}};
}
(async()=>{
 await pass('visibility helper exists and does not throw',async()=>{const a=fixture();assert.equal(a.context.appVisible(),true)});
 await pass('hidden Electron window skips network',async()=>{const a=fixture({visibility:'hidden'});await a.context.refreshPermissions();assert.equal(a.requests.length,0)});
 await pass('missing backend skips fetch with no ReferenceError',async()=>{const a=fixture({api:false});await a.context.refreshPermissions();assert.equal(a.requests.length,0)});
 await pass('foreground HR permissions update on resolved RPC',async()=>{const a=fixture();await a.context.refreshPermissions();assert.equal(a.requests.length,2);assert.equal(a.perms['hr.employees.view'],true);assert.equal(a.navCount,1)});
 await pass('overlapping timer/auth refreshes share one network batch',async()=>{
  let unblock;
  const wait=new Promise(r=>{unblock=r});
  const a=fixture({implement:()=>wait});
  const first=a.context.refreshPermissions(),second=a.context.refreshPermissions();
  assert.equal(a.requests.length,2);
  unblock(false);await Promise.all([first,second]);
  assert.equal(a.requests.length,2);
  await a.context.refreshPermissions();assert.equal(a.requests.length,4);
 });
 await pass('a rejected remote call does not cause unhandled promise',async()=>{
  const a=fixture({implement:async(_,{p_permission})=>{
   if(p_permission==='hr.deduction_rules.view')throw Error('NETWORK_FAILED');
   return true;
  }});
  await a.context.refreshPermissions();
  assert.equal(a.perms['hr.employees.view'],true);
  assert.equal(a.perms['hr.deduction_rules.view'],false);
 });
 await pass('hidden page retains only legitimate local permission snapshot',async()=>{
  const a=fixture({visibility:'hidden',local:code=>code==='hr.employees.view'});
  await a.context.refreshPermissions();
  assert.equal(a.perms['hr.employees.view'],true);
  assert.equal(a.perms['hr.deduction_rules.view'],false);
  assert.equal(a.requests.length,0);
 });
 await pass('auth listener and 8-second refresh remain present',async()=>{
  assert(full.includes("addEventListener('sharawla:auth-ready',refreshPermissions)"));
  assert(full.includes('setInterval(refreshPermissions,8000)'));
 });
 console.log('PASS '+count+' HR source-only regression groups; no network requests executed.');
})().catch(e=>{console.error(e);process.exitCode=1});
