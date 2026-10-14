import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const TC='5358328c-9724-49aa-affc-1bce8be90f92',OTHER='91826502-590e-4afa-8826-2c0f4b99c490';
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/smart-function/index.ts','utf8').replace(/^import .*;\n/,''));
let handler,actorBusiness=OTHER,targetBusiness=TC,loginBusiness=TC;const calls=[];
const query=()=>{const obj={select(){return this},eq(k,v){this.key=k;return this},async maybeSingle(){return {error:null,data:this.key==='auth_user_id'?{id:4,active:true,role:'admin',business_id:actorBusiness}:this.key==='username'?{id:1,username:'fixture',active:true,auth_user_id:'fixture-target',business_id:loginBusiness}:{auth_user_id:'fixture-target',business_id:targetBusiness}}}};return obj};
const admin={from:query,auth:{getUser:async()=>({data:{user:{id:'fixture-actor'}},error:null}),admin:{getUserById:async()=>{calls.push('getUserById');return {data:{user:{email:'fixture@local.test'}},error:null}},updateUserById:async()=>{calls.push('password');return {error:null}},createUser:async()=>{calls.push('create');throw Error('Unexpected Auth create')},deleteUser:async()=>{throw Error('No deletion allowed')}}}};
vm.runInNewContext(source,{Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://xihcxydjnzemflhedzor.supabase.co':'fixture'},serve:fn=>handler=fn},createClient:(_url,key)=>key==='fixture'?{...admin,auth:{...admin.auth,signInWithPassword:async()=>({data:{user:{id:'fixture-target'},session:{access_token:'synthetic'}},error:null})}}:admin,crypto:webcrypto,TextEncoder,Response,console});
const invoke=body=>handler(new Request('http://127.0.0.1/legacy',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:JSON.stringify(body)}));const results=[];
for(const [name,body,business] of [
 ['TC administrator fenced before Auth mutation',{action:'create'},TC],
 ['Other admin cannot create in TC branch',{action:'create',branch_ids:[22]},OTHER],
 ['Other admin cannot reset TC password',{action:'password',employee_id:1,password:'Fixture-password'},OTHER],
 ['TC legacy login fenced',{action:'login',username:'fixture',password:'Fixture-password'},OTHER]
]){actorBusiness=business;calls.length=0;assert.equal((await invoke(body)).status,403);assert.equal(calls.length,0);results.push({name,result:'PASS'});}
actorBusiness=OTHER;targetBusiness=OTHER;calls.length=0;assert.equal((await invoke({action:'password',employee_id:4,password:'Fixture-password'})).status,200);assert.deepEqual(calls,['password']);results.push({name:'Other activity password behavior preserved',result:'PASS'});
loginBusiness=OTHER;assert.equal((await invoke({action:'login',username:'fixture',password:'Fixture-password'})).status,200);results.push({name:'Other activity login behavior preserved',result:'PASS'});
fs.writeFileSync('evidence/top-chicken/legacy-staff-fence-results.json',JSON.stringify({scope:'Handler executed with mocked service clients; no hosted endpoint deployment',results},null,2));console.log('PASS legacy staff safety fences:',results.length);
