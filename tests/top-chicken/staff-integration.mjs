import assert from 'node:assert/strict';
import {webcrypto,randomUUID} from 'node:crypto';
import {createTopChickenStaffHandler,TC_BUSINESS} from '../../supabase/functions/top-chicken-staff/core.mjs';
import {db,q,login,TC,OTHER} from './integration-fixture.mjs';
globalThis.crypto ||= webcrypto;
export const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
export async function fakeAuth(){
  const users=new Map(),tokens=new Map();const calls=[];
  for(let n=1;n<=7;n++){users.set(uid(n),{id:uid(n),email:`fixture${n}@local.test`,password:'Fixture-password-1',app_metadata:{}});tokens.set('fixture-token-'+n,uid(n));}
  const admin={getUserById:async id=>users.has(id)?{data:{user:users.get(id)},error:null}:{data:{user:null},error:{status:404}},
    createUser:async p=>{calls.push({operation:'create',id:p.id});if(users.has(p.id))return {data:{user:null},error:{status:422}};const u={...p,app_metadata:p.app_metadata};users.set(p.id,u);await q('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[p.id,p.email,p.app_metadata]);return {data:{user:u},error:null};},
    updateUserById:async(id,p)=>{calls.push({operation:'password',id});users.get(id).password=p.password;return {data:{user:users.get(id)},error:null};}};
  const signInWithPassword=async({email,password})=>{const u=[...users.values()].find(u=>u.email===email&&u.password===password);if(!u)return {data:{session:null},error:{status:400}};const token='fixture-session-'+randomUUID();tokens.set(token,u.id);return {data:{user:u,session:{access_token:token,refresh_token:'fixture-refresh',expires_in:3600}},error:null};};
  return {api:{admin,getUser:async token=>({data:{user:users.get(tokens.get(token))||null},error:tokens.has(token)?null:{status:401}})},signInWithPassword,calls,tokens};
}
export async function serviceQuery(sql,params=[]){await db.exec('RESET ROLE');await q("select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false),set_config('request.headers','{}',false)");if(!params.length&&/^(CREATE|DROP)/i.test(sql)){await db.exec(sql);return [];}return q(sql,params);}
export function makeHandler(auth){
  const names={top_chicken_reserve_staff_v1:['p_actor','p_request_id','p_operation','p_payload','p_digest'],top_chicken_complete_staff_v1:['p_actor','p_request_id','p_digest'],top_chicken_staff_login_context_v1:['p_username']};
  const admin={auth:auth.api,rpc:async(name,p)=>{try{const keys=names[name];const r=await serviceQuery(`select public.${name}(${keys.map((k,i)=>'$'+(i+1)+(k==='p_payload'?'::jsonb':'')).join(',')}) as result`,keys.map(k=>k==='p_payload'?JSON.stringify(p[k]):p[k]));return {data:r[0].result,error:null};}catch(e){console.error('FIXTURE_RPC_ERROR',name,e.code,e.message);return {data:null,error:{code:e.code,message:e.message}};}}};
  return createTopChickenStaffHandler({admin,authClient:{auth:{signInWithPassword:auth.signInWithPassword}},digestSecret:'isolated-fixture-secret-never-a-live-service-key'});
}
export function invoke(handler,p,token='fixture-token-1'){return handler(new Request('http://127.0.0.1/edge',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(p)})).then(async r=>({status:r.status,body:await r.json()}));}
export async function runStaffChecks(auth,test,actorToken='fixture-token-1',otherToken='fixture-token-4'){
  const h=makeHandler(auth);const payload={action:'create',request_id:randomUUID(),name:'Synthetic cashier',username:'new_fixture_cashier',password:'Fixture-password-2',role:'cashier',branch_id:22,branch_ids:[22],permissions:['home','pos','orders','deliveryOrders','shifts'],active:true};let employee;
  await test('TC staff: unauthenticated and foreign admin rejected before provisioning',async()=>{assert.equal((await invoke(h,payload,null)).status,401);const r=await invoke(h,payload,otherToken);assert.equal(r.status,403,JSON.stringify(r));});
  await test('TC staff: wrong branch, role and unknown permission rejected',async()=>{for(const p of [{branch_ids:[23]},{role:'super_admin'},{permissions:['unknown.privilege']}])assert.equal((await invoke(h,{...payload,...p},actorToken)).status,400);});
  await test('TC staff: successful atomic employee/branch/permissions/membership binding',async()=>{const r=await invoke(h,payload,actorToken);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.business_id,TC_BUSINESS);assert.equal(r.body.permissions_persisted,true);employee=r.body.employee_id;const rows=await serviceQuery('select * from employees where id=$1',[employee]);assert.equal(rows[0].business_id,TC);const e=rows[0];assert.equal((await serviceQuery('select * from employee_branches where employee_id=$1',[employee])).length,1);assert.equal((await serviceQuery('select * from employee_permissions where employee_id=$1',[employee])).length,25);assert.equal((await serviceQuery('select * from business_auth_memberships where auth_user_id=$1',[e.auth_user_id]))[0].active,true);assert.equal((await serviceQuery("select allowed from employee_action_permissions_v2 where employee_id=$1 and action_code='orders.fulfillment.manage'",[employee]))[0].allowed,true);});
  await test('TC staff: new cashier cannot administer staff or bypass service-only RPCs',async()=>{
    const loginResult=await invoke(h,{action:'login',username:payload.username,password:payload.password},null);
    assert.equal((await invoke(h,{...payload,request_id:randomUUID(),username:'forbidden_fixture'},loginResult.body.access_token)).status,403);
    const e=(await serviceQuery('select auth_user_id from employees where id=$1',[employee]))[0];
    await q("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false),set_config('request.headers',$2,false)",[e.auth_user_id,JSON.stringify({'x-sharawla-business':TC})]);
    await db.exec('SET ROLE authenticated');
    try{assert.equal((await q("select public.has_permission('users') as allowed"))[0].allowed,false);
      // Native CI is authoritative for role/RLS enforcement; WASM fixture does not filter this SET ROLE query.
      if(process.env.TOP_CHICKEN_PG_URL){assert.deepEqual((await q('select id from employees')).map(x=>Number(x.id)),[Number(employee)]);await assert.rejects(()=>q("select public.top_chicken_staff_login_context_v1('fixture1')"),err=>err.code==='42501');}
    }finally{await db.exec('RESET ROLE');}
  });
  await test('TC staff: exact replay and changed payload/password conflict',async()=>{const r=await invoke(h,payload,actorToken);assert.equal(r.status,200);assert.equal(r.body.replayed,true);assert.equal(r.body.employee_id,employee);assert.equal((await invoke(h,{...payload,password:'Changed-password'},actorToken)).status,409);assert.equal((await invoke(h,{...payload,request_id:randomUUID()},actorToken)).status,409);});
  await test('TC staff: successful login uses active TC membership and real request handler',async()=>{const r=await invoke(h,{action:'login',username:payload.username,password:payload.password},null);assert.equal(r.status,200,JSON.stringify(r));assert.ok(r.body.access_token);assert.equal((await invoke(h,{action:'login',username:payload.username,password:'wrong-password'},null)).status,401);});
  await test('TC staff: another activity password target rejected',async()=>{assert.equal((await invoke(h,{action:'password',request_id:randomUUID(),employee_id:4,password:'Fixture-password-3'},actorToken)).status,403);});
  await test('TC staff: password change and replay preserve same target',async()=>{const p={action:'password',request_id:randomUUID(),employee_id:employee,password:'Fixture-password-3'};assert.equal((await invoke(h,p,actorToken)).status,200);assert.equal((await invoke(h,p,actorToken)).body.replayed,true);assert.equal((await invoke(h,{action:'login',username:payload.username,password:p.password},null)).status,200);});
  await test('TC staff: permission-write failure leaves no partial staff membership, retry recovers',async()=>{
    await serviceQuery("CREATE FUNCTION public.tc_fail_permissions() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF new.employee_id>=10000 THEN RAISE EXCEPTION 'fixture permission failure';END IF;RETURN new;END$$; CREATE TRIGGER tc_fail_permissions BEFORE INSERT ON employee_permissions FOR EACH ROW EXECUTE FUNCTION tc_fail_permissions();");
    const p={...payload,request_id:randomUUID(),username:'recover_fixture_cashier'};
    assert.equal((await invoke(h,p,actorToken)).status,400);assert.equal((await serviceQuery('select * from employees where username=$1',[p.username])).length,0);
    const reserved=(await serviceQuery('select * from sharawla_internal.top_chicken_staff_requests_v1 where request_id=$1',[p.request_id]))[0];assert.equal(reserved.result,null);assert.equal((await serviceQuery('select * from business_auth_memberships where auth_user_id=$1',[reserved.auth_user_id])).length,0);
    await serviceQuery('DROP TRIGGER tc_fail_permissions ON employee_permissions');assert.equal((await invoke(h,p,actorToken)).status,200);
  });
  await test('TC staff: revoked membership cannot log in or replay',async()=>{const e=(await serviceQuery('select auth_user_id from employees where id=$1',[employee]))[0];await serviceQuery('update business_auth_memberships set active=false where auth_user_id=$1',[e.auth_user_id]);assert.equal((await invoke(h,{action:'login',username:payload.username,password:'Fixture-password-3'},null)).status,401);await serviceQuery("update business_auth_memberships set active=false where auth_user_id=$1",[uid(1)]);assert.equal((await invoke(h,payload,actorToken)).status,403);await serviceQuery('update business_auth_memberships set active=true where auth_user_id=$1',[uid(1)]);});
  return {handler:h,employee};
}
