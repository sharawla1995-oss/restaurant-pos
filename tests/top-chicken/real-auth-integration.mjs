// Actual local GoTrue + native PostgreSQL16, never a hosted Supabase project.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {setupIntegration,db,q,TC,OTHER} from './integration-fixture.mjs';
import {runStaffChecks,uid,serviceQuery} from './staff-integration.mjs';
import {runBrowserFlows} from './browser-flow.mjs';
if(!process.env.TOP_CHICKEN_PG_URL||process.env.TC_LOCAL_AUTH_URL!=='http://127.0.0.1:9999')throw new Error('Native loopback Auth/PG fixture required');
const authURL=process.env.TC_LOCAL_AUTH_URL;
const jwtSecret='top-chicken-local-fixture-jwt-secret-only-2026';
const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const content=enc({alg:'HS256',typ:'JWT'})+'.'+enc({role:'service_role',aud:'authenticated',iss:authURL,exp:Math.floor(Date.now()/1000)+3600});
const service=content+'.'+createHmac('sha256',jwtSecret).update(content).digest('base64url');
async function call(url,method='GET',body,token=service){
 const r=await fetch(authURL+url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();return r.ok?{data,error:null}:{data:null,error:{status:r.status,message:data.msg||data.message}};
}
const api={getUser:async token=>{const r=await call('/user','GET',undefined,token);return {data:{user:r.data},error:r.error};},admin:{
 getUserById:async id=>{const r=await call('/admin/users/'+id);return {data:{user:r.data?.user||r.data},error:r.error};},
 createUser:async p=>{const r=await call('/admin/users','POST',p);return {data:{user:r.data?.user||r.data},error:r.error};},
 updateUserById:async(id,p)=>{const r=await call('/admin/users/'+id,'PUT',p);return {data:{user:r.data?.user||r.data},error:r.error};}
}};
const signInWithPassword=async p=>{const r=await call('/token?grant_type=password','POST',p);return {data:{user:r.data?.user,session:r.data},error:r.error};};
const auth={api,signInWithPassword};const results=[];
async function test(name,fn){try{await fn();results.push({name,result:'PASS'});console.log('PASS',name);}catch(e){results.push({name,result:'FAIL',error:e.message,code:e.code});throw e;}}
try{
 // Actual Auth inserts synthetic identities before restoring their operational FKs.
 for(let n=1;n<=7;n++){const r=await api.admin.createUser({id:uid(n),email:`fixture${n}@local.test`,password:'Fixture-password-1',email_confirm:true});assert.equal(r.error,null,JSON.stringify(r.error));}
 await setupIntegration({realAuth:true});
 const adminLogin=await signInWithPassword({email:'fixture1@local.test',password:'Fixture-password-1'});assert.equal(adminLogin.error,null);
 const otherLogin=await signInWithPassword({email:'fixture4@local.test',password:'Fixture-password-1'});assert.equal(otherLogin.error,null);
 // No token is mocked: every handler and browser login reaches the local GoTrue server.
 await runStaffChecks(auth,test,adminLogin.data.session.access_token,otherLogin.data.session.access_token);
 const browser=await runBrowserFlows(auth,test);
 await test('Operational profile: legacy activity binding remains unchanged; TC selects its own cache',async()=>{
  await serviceQuery("select 1");const legacy=(await q('select * from sharawla_internal.operational_business_identity_v1'))[0];assert.equal(legacy.cloud_business_id,OTHER);
  await q("select set_config('request.jwt.claim.sub',$1,false),set_config('request.headers',$2,false)",[uid(1),JSON.stringify({'x-sharawla-business':TC})]);assert.equal((await q('select sharawla_internal.current_operational_business_id_v1() as id'))[0].id,TC);
  await q("select set_config('request.jwt.claim.sub',$1,false),set_config('request.headers',$2,false)",[uid(4),JSON.stringify({'x-sharawla-business':OTHER})]);assert.equal((await q('select sharawla_internal.current_operational_business_id_v1() as id'))[0].id,OTHER);
 });
 fs.writeFileSync('evidence/top-chicken/real-auth-browser-results.json',JSON.stringify({auth:'EXECUTED: local supabase/gotrue:v2.196.0 with real Auth users and sessions; native PostgreSQL16',licensing:'Synthetic only; no physical devices or Cloud license writes',results,browser},null,2));process.exit(0);
}catch(e){console.error(e.stack,e.code);fs.writeFileSync('evidence/top-chicken/real-auth-browser-results.json',JSON.stringify({results,error:e.message,code:e.code},null,2));process.exit(1);}
