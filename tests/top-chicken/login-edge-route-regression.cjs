'use strict';
// CI-only test: mock auth; NEVER contacts Supabase, stores real passwords or installs software.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const s=fs.readFileSync('app.js','utf8');
const start=s.indexOf('async function signIn(email,password){');
const end=s.indexOf('async function logout()',start);
assert.ok(start>=0&&end>start,'login function boundaries stable');
const body=s.slice(start,end);
assert.ok(!body.includes("callFunction('smart-function'"),'no undeployed Edge login route');
assert.ok(body.includes('/auth/v1/token?grant_type=password'),'keep deployed Supabase Auth');
assert.ok(body.includes("!email.includes('@') && await isTopChickenStaffContext()"),'non-email staff logins fail explicitly for TC only');
const test=async()=>{
  let tenant='top-chicken',requests=[],remembered=[],edgeCalls=0;
  const kv=new Map(),res={access_token:'fixture-token',user:{id:'test-user'}};
  const localStorage={
    setItem(k,v){kv.set(k,v)},getItem(k){return kv.get(k)||null},removeItem(k){kv.delete(k)}
  };
  const ctx=vm.createContext({
    navigator:{onLine:true},localStorage,
    isTopChickenStaffContext:async()=>tenant==='top-chicken',
    callFunction:async()=>{edgeCalls++;throw Error('UNDEPLOYED_EDGE_WAS_CALLED')},
    req:async(p,o)=>{requests.push({p,o});assert.equal(p,'/auth/v1/token?grant_type=password');return res},
    rememberOfflineLogin:async(user,password)=>remembered.push({user,password}),
    offlinePasswordHash:async()=>{throw Error('not used in online test')},
    Error,JSON,String
  });
  vm.runInContext('let session=null,resumeSession=null;\n'+body+'\nglobalThis.testSignIn=signIn;globalThis.readSession=()=>session;',ctx);
  const one=await ctx.testSignIn('  EXISTING@SHARAWLA.LOCAL  ','fixture-pass');
  assert.equal(one,res);
  assert.equal(ctx.readSession(),res);
  assert.equal(requests.length,1);
  assert.equal(requests[0].o.auth,false);
  assert.equal(JSON.parse(requests[0].o.body).email,'existing@sharawla.local');
  assert.equal(edgeCalls,0);
  assert.equal(remembered.length,1);
  assert.equal(JSON.parse(kv.get('sbResumeSession')).access_token,'fixture-token');
  const prev=requests.length;
  await assert.rejects(()=>ctx.testSignIn('unprovisioned-username','fixture-pass'),/تسجيل الدخول باسم المستخدم لتوب تشيكن غير متاح/);
  assert.equal(requests.length,prev,'TC username must not call missing service');
  assert.equal(edgeCalls,0);
  tenant='top-burger';
  await ctx.testSignIn('Burger@Example.COM','fixture-pass');
  assert.equal(requests.length,prev+1,'ordinary business login still uses Supabase Auth');
  assert.equal(JSON.parse(requests.at(-1).o.body).email,'burger@example.com');
  assert.equal(edgeCalls,0);
  assert.ok(s.includes("input.type='email';input.parentElement.firstChild.textContent='البريد الإلكتروني'"),'TC login label restored to email');
  console.log('PASS: existing TC email login uses real Auth; no missing Edge calls; username fails clearly; other tenants unchanged');
};
test().catch(e=>{console.error(e);process.exitCode=1});
