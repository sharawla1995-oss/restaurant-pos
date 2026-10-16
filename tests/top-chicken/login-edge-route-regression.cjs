'use strict';
// SH-0008-only user/PIN routing; mock Auth only. Never contacts live Supabase.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
const start=source.indexOf('async function signIn(email,password){');
const end=source.indexOf('async function logout()',start);
assert.ok(start>0&&end>start,'login function exists');
const text=source.slice(start,end);
assert.ok(text.includes('/auth/v1/token?grant_type=password'),'email login preserved');
assert.ok(text.includes('/functions/v1/top-chicken-pin-login'),'PIN4 route exists');
let tenant='top-chicken',online=true;
const calls=[],kv=new Map(),legacy=[];
const session={access_token:'test.jwt',refresh_token:'test-refresh',user:{id:'staff-user'}};
const ctx=vm.createContext({
 navigator:{get onLine(){return online}},localStorage:{
  setItem:(k,v)=>kv.set(k,v),getItem:k=>kv.get(k)||null,removeItem:k=>kv.delete(k)
 },
 isTopChickenStaffContext:async()=>tenant==='top-chicken',
 req:async(path,opt)=>{calls.push({path,opt});
  if(path.includes('/top-chicken-pin-login'))
   return {ok:true,business_id:'5358328c-9724-49aa-affc-1bce8be90f92',session};
  return session;
 },
 rememberOfflineLogin:async(u,p)=>legacy.push({u,p}),
 offlinePasswordHash:async()=>{throw Error('should not hash offline')},
 Error,String,JSON
});
vm.runInContext('let session=null,resumeSession=null;\n'+text+'\nglobalThis.login=signIn;globalThis.getSession=()=>session;',ctx);
(async()=>{
 const old=await ctx.login('OWNER@EXAMPLE.COM','strong-secret');
 assert.equal(old,session);
 assert.equal(calls[0].path,'/auth/v1/token?grant_type=password');
 assert.equal(JSON.parse(calls[0].opt.body).email,'owner@example.com');
 assert.equal(legacy.length,1);
 const pin=await ctx.login('Ahmed','1234');
 assert.equal(pin,session);
 assert.equal(calls[1].path,'/functions/v1/top-chicken-pin-login');
 assert.equal(JSON.parse(calls[1].opt.body).username,'ahmed');
 assert.equal(JSON.parse(calls[1].opt.body).pin,'1234');
 assert.equal(legacy.length,1,'4-digit secret is NOT saved in offline verifier');
 assert.equal(kv.get('offlineLoginVerifier'),undefined);
 const count=calls.length;
 await assert.rejects(ctx.login('ahmed','12x4'),/4 أرقام/);
 assert.equal(calls.length,count,'invalid PIN rejected before request');
 tenant='top-burger';await ctx.login('Burger@Example.com','strong-secret');
 assert.equal(calls.at(-1).path,'/auth/v1/token?grant_type=password');
 tenant='top-chicken';online=false;
 await assert.rejects(ctx.login('ahmed','1234'),/يحتاج إنترنت/);
 assert.equal(calls.length,count+1,'no offline bypass');
 console.log('PASS: Top Chicken username/PIN4 online Edge route, legacy email preserved and other tenants unchanged, offline PIN denied');
})().catch(e=>{console.error(e);process.exitCode=1});
