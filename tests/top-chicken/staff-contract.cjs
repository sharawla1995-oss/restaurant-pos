// Node24 isolated contract reproduction against the exact retrieved Edge source.
// Auth and REST are mock adapters; no real Auth user is created or deleted.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const {webcrypto}=require('node:crypto');
const ts=fs.readFileSync('evidence/top-chicken/smart-function-v2-source.ts','utf8').replace(/^import .*;\n/,'');
const js=stripTypeScriptTypes(ts,{mode:'strip'});
async function scenario(role,business,auth=true){
 const calls=[];let handler;
 const actor={id:1,role,active:true,business_id:business};
 const admin={auth:{getUser:async()=>({data:{user:{id:'fixture-admin'}},error:null}),admin:{
  createUser:async payload=>{calls.push({action:'mock_auth_create'});return {data:{user:{id:'fixture-new-auth'}},error:null};},
  deleteUser:async()=>{calls.push({action:'mock_auth_compensation'});return {error:null};}
 }},from:table=>{
  const b={key:null,select(){return b;},eq(k){b.key=k;return b;},maybeSingle:async()=>({data:b.key==='auth_user_id'?actor:null,error:null}),
   insert(payload){calls.push({action:'employee_insert',table,payload});return b;},
   single:async()=>({data:null,error:{code:'23502',message:'null value in column id of relation employees'}})};return b;
 }};
 const c=vm.createContext({Deno:{env:{get:k=>({'SUPABASE_URL':'https://fixture.invalid','SUPABASE_SERVICE_ROLE_KEY':'fixture-service','SUPABASE_ANON_KEY':'fixture-anon'})[k]},serve:fn=>handler=fn},createClient:()=>admin,Response,Request,TextEncoder,crypto:webcrypto,console:{error(){}}});vm.runInContext(js,c);
 const req=new Request('https://fixture.invalid/create',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer fixture-token'}:{})},body:JSON.stringify({action:'create',name:'Fixture User',username:'fixture_user',password:'fixture-only',role:'cashier',branch_ids:[22]})});
 const response=await handler(req);return {http:response.status,body:await response.json(),calls};
}
(async()=>{
 const anonymous=await scenario('admin','fixture-top-chicken',false);assert.equal(anonymous.http,401);assert.equal(anonymous.calls.length,0);
 const cashier=await scenario('cashier','fixture-top-chicken');assert.equal(cashier.http,403);assert.equal(cashier.calls.length,0);
 const admin=await scenario('admin','fixture-top-chicken');assert.equal(admin.http,400);
 const insert=admin.calls.find(c=>c.action==='employee_insert');assert.ok(insert);assert.equal(insert.payload.id,undefined);assert.equal(insert.payload.business_id,undefined);
 const other=await scenario('admin','fixture-other-business');assert.ok(other.calls.some(c=>c.action==='mock_auth_create'));
 const report={scope:'Actual smart-function v2 source executed in a Node24 VM; mock Auth/REST. PostgreSQL payload failure separately reproduced on restored dependency schema.',live_auth_create:'NOT RUN',results:[
  {name:'unauthenticated create blocked',result:'PASS'},
  {name:'cashier cannot create employees',result:'PASS'},
  {name:'successful admin employee create contract',result:'FAIL',cause:'Employee INSERT omits required id and business_id; mock returns actual schema 23502 condition'},
  {name:'cross-tenant admin cannot begin Top Chicken account provisioning',result:'FAIL',cause:'Retrieved handler selects actor by auth_user_id only and accepts branch 22 without tenant check; mock Auth creation reached'},
  {name:'atomic employee/branches/permissions/membership provisioning',result:'NOT PROVEN',cause:'Separate writes; permissions are saved afterwards by app.js; no trusted membership insert in retrieved handler'}
 ],trace:{admin,other}};
 fs.writeFileSync('evidence/top-chicken/staff-contract-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report.results));
})().catch(e=>{console.error(e);process.exit(1)});
