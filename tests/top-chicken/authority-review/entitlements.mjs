import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setup,execute,proof,economicState,db,q,TC,OTHER,login,serviceQuery,uid,mockCloud,gateway} from './fixture.mjs';
import {createTopChickenStaffHandler} from '../../../supabase/functions/top-chicken-staff/core.mjs';
import {assertTCChannelSecret,assertCloudPublicKey} from '../../../supabase/functions/top-chicken-staff/cloud-authority.mjs';
import {operationHandler} from '../../../supabase/functions/top-chicken-operations/core.mjs';
const results=[];
async function test(name,fn){try{await fn();results.push({name,result:'PASS'});console.log('PASS',name);}catch(e){results.push({name,result:'FAIL',error:e.message});throw e;}}
const rpc='top_chicken_transition_order_status',body=(id=1,status='preparing')=>({p_order_id:id,p_expected_status:'new',p_new_status:status,p_request_id:randomUUID()});
async function denied(p,source,actor=uid(1)){const before=await economicState();await assert.rejects(()=>execute(rpc,p,actor,source),e=>e.code==='42501');assert.deepEqual(await economicState(),before);}
try{
 const auth=await setup();
 await test('Old profile defaults never grant permission, even if a legacy cached boolean is true',async()=>{await serviceQuery("update sharawla_internal.top_chicken_feature_cache_v1 set enabled=true");await login(1);assert.equal((await q("select sharawla_internal.operational_feature_entitled_v1('commerce.orders') as allowed"))[0].allowed,false);});
 await test('Current TC Cloud resolver decisions deny commerce despite enabled modules/defaults',async()=>{const live=JSON.parse(fs.readFileSync('evidence/top-chicken/authority-review/cloud-effective-entitlements.json'));const p=body();const s=proof(rpc,p);s.decisions['commerce.orders']={...s.decisions['commerce.orders'],...live.find(f=>f.code==='commerce.orders').effective,evaluation_time:s.observed_at};assert.equal(s.decisions['commerce.orders'].entitled,false);await denied(p,s);});
 for(const [name,mutate] of [
 ['disabled entitlement',s=>s.decisions['commerce.orders'].entitled=false],
 ['inactive feature',s=>s.decisions['commerce.orders'].feature_active=false],
 ['unimplemented feature',s=>s.decisions['commerce.orders'].feature_implemented=false],
 ['explicit Cloud business feature disable',s=>s.decisions['commerce.orders'].override_disabled=true],
 ['disabled module',s=>s.modules.pos=false],
 ['inactive business',s=>s.business_active=false],
 ['inactive profile',s=>s.profile_active=false],
 ['wrong profile',s=>s.profile_code='retail'],
 ['expired entitlement',s=>s.decisions['commerce.orders'].effective_until=new Date(Date.now()-1).toISOString()],
 ['expiry equality boundary',s=>s.decisions['commerce.orders'].effective_until=s.observed_at],
 ['future entitlement',s=>s.decisions['commerce.orders'].effective_from=new Date(Date.now()+60000).toISOString()],
 ['stale decision',s=>s.observed_at=new Date(Date.now()-11000).toISOString()],
 ['future decision clock',s=>s.observed_at=new Date(Date.now()+2000).toISOString()],
 ['wrong business',s=>s.business_id=OTHER],
 ['wrong decision feature',s=>s.decisions['commerce.orders'].feature_code='commerce.delivery'],
 ['missing decision',s=>delete s.decisions['commerce.orders']],
 ['missing expiry timestamp freshness',s=>delete s.observed_at]
 ])await test('Fail closed with no finance/audit/receipt mutation: '+name,async()=>{const p=body(),s=proof(rpc,p);mutate(s);await denied(p,s);});
 await test('Foreign actor cannot borrow TC Cloud entitlement',async()=>{const p=body();await denied(p,proof(rpc,p),uid(4));});
 await test('Authenticated callers cannot use service executor or direct canonical owner',async()=>{await login(1);await db.exec('SET ROLE authenticated');try{await assert.rejects(()=>q("select public.top_chicken_execute_cloud_authorized_v1($1,$2,'{}','{}')",[uid(1),rpc]),e=>e.code==='42501');await assert.rejects(()=>q("select public.order_fulfillment_transition_v2(1,'preparing')"));}finally{await db.exec('RESET ROLE');}});
 await test('Rollback pause gate blocks all new TC operations and records an audit; no data deletion',async()=>{
  const before=await economicState();await serviceQuery("update sharawla_internal.top_chicken_execution_gate_v1 set enabled=false,reason='synthetic rollback proof'");
  const p=body();await denied(p,proof(rpc,p));assert.equal((await serviceQuery('select new_enabled from sharawla_internal.top_chicken_gate_audit_v1 order by id desc limit 1'))[0].new_enabled,false);
  await serviceQuery("update sharawla_internal.top_chicken_execution_gate_v1 set enabled=true,reason='synthetic resume proof',approval_ref='c65d3311811db7ac33b2ed77e3b365e17839622b'");assert.deepEqual(await economicState(),before);
 });
 await test('Unregistered device selector is preserved and rejected by delegated execution',async()=>{const p=body(),s=proof(rpc,p);s.device_selector='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';await denied(p,s);});
 await test('TC channel is narrowly scoped; Central service credentials are rejected in Beta',async()=>{assert.throws(()=>assertCloudPublicKey('sb_secret_'+'a'.repeat(50)));assert.throws(()=>assertTCChannelSecret('sb_publishable_not_a_shared_secret'));assertTCChannelSecret('a'.repeat(64));assertCloudPublicKey('sb_publishable_'+'a'.repeat(40));});
 const p=body();
 await test('Fresh trusted decision executes original owner and restores caller claims in the same transaction',async()=>{
  await serviceQuery('BEGIN');
  const capture=()=>q("select current_setting('request.jwt.claim.sub',true) as sub,current_setting('request.jwt.claim.role',true) as role,current_setting('request.jwt.claims',true) as claims,current_setting('request.headers',true) as headers");
  try{const before=await capture();const result=await execute(rpc,p);assert.equal(result.ok,true);assert.deepEqual(await capture(),before);assert.equal((await q('select status from orders where id=1'))[0].status,'preparing');await q('COMMIT');}catch(e){await q('ROLLBACK');throw e;}
 });
 await test('Decision context cannot be reused in a later transaction',async()=>{await login(1);assert.equal((await q("select sharawla_internal.operational_feature_entitled_v1('commerce.orders') as allowed"))[0].allowed,false);});
 await test('Exact replay fetches current permission; revocation rejects replay without side effects',async()=>{const before=await economicState();assert.equal((await execute(rpc,p)).replayed,true);const after=await economicState();for(const field of ['orders','audits','events','receipts','payments','delivery_events'])assert.deepEqual(after[0][field],before[0][field]);const s=proof(rpc,p);s.decisions['commerce.orders'].entitled=false;await denied(p,s);});
 await test('Entitlement expiring during owner write rolls the entire operation back',async()=>{
  await serviceQuery("CREATE FUNCTION public.tc_expiry_delay() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN PERFORM pg_sleep(0.8);RETURN NEW;END$$; CREATE TRIGGER tc_expiry_delay BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION public.tc_expiry_delay();");
  try{const b=body(8),s=proof(rpc,b);s.decisions['commerce.orders'].effective_until=new Date(Date.now()+500).toISOString();await denied(b,s);}finally{await serviceQuery('DROP TRIGGER tc_expiry_delay ON audit_logs');}
 });
 await test('Completion requires pickup entitlement in addition to general orders',async()=>{const b={p_order_id:1,p_expected_status:'preparing',p_new_status:'completed',p_request_id:randomUUID()},s=proof(rpc,b);s.decisions['commerce.pickup'].entitled=false;await denied(b,s);});
 await test('Disabled users/auth/permissions cannot reserve staff or resolve login context',async()=>{for(const f of ['core.auth','core.users','core.permissions']){const name='top_chicken_reserve_staff_v1',b={p_actor:uid(1),p_request_id:randomUUID(),p_operation:'create',p_payload:{},p_digest:'a'.repeat(64)},s=proof(name,b);s.decisions[f].entitled=false;await assert.rejects(()=>execute(name,b,uid(1),s),e=>e.code==='42501');}const name='top_chicken_staff_login_context_v1',b={p_username:'fixture1'},s=proof(name,b);s.decisions['core.auth'].entitled=false;await assert.rejects(()=>execute(name,b,null,s),e=>e.code==='42501');});
 const cloud=mockCloud(),run=gateway(cloud);
 await test('Actual Cloud reader performs scoped resolver and override/module reads every request',async()=>{const r=await run('top_chicken_staff_login_context_v1',{p_username:'fixture1'},null);assert.equal(r.error,null);assert.ok(r.data.auth_user_id);assert.ok(cloud.config.calls.some(c=>c.rpc==='resolve_sharawla_commercial_entitlement_cloud_v1'));assert.ok(cloud.config.calls.filter(c=>c.filters?.business_id).every(c=>c.filters.business_id===TC));});
 await test('Cloud disable after prior success prevents the next identical request; no cache fallback',async()=>{cloud.config.entitled=false;assert.equal((await run('top_chicken_staff_login_context_v1',{p_username:'fixture1'},null)).error.code,'42501');cloud.config.entitled=true;cloud.config.failure=true;assert.equal((await run('top_chicken_staff_login_context_v1',{p_username:'fixture1'},null)).error.code,'CLOUD_AUTHORITY_UNAVAILABLE');cloud.config.failure=false;});
 await test('Staff handler checks fresh Cloud before creating Auth users',async()=>{cloud.config.override=true;const h=createTopChickenStaffHandler({admin:{auth:auth.api},authClient:{auth:{signInWithPassword:auth.signInWithPassword}},digestSecret:'synthetic-secret',executeRPC:run});const r=await h(new Request('http://127.0.0.1/staff',{method:'POST',headers:{Authorization:'Bearer fixture-token-1'},body:JSON.stringify({action:'create',request_id:randomUUID(),name:'Synthetic blocked',username:'blocked_cloud_fixture',password:'Fixture-password',role:'cashier',branch_id:22,branch_ids:[22],permissions:[],active:true})}));assert.equal(r.status,403);assert.equal(auth.calls.length,0);cloud.config.override=false;});
 await test('Operation Edge ignores client actor/business and permits only the two TC owner wrappers',async()=>{let seen;const h=operationHandler({admin:{auth:auth.api},executeRPC:async(name,params,actor)=>{seen={name,params,actor};return {data:{ok:true},error:null}}});const r=await h(new Request('http://127.0.0.1/order',{method:'POST',headers:{Authorization:'Bearer fixture-token-1'},body:JSON.stringify({rpc,params:body(),actor:uid(4),business_id:OTHER})}));assert.equal(r.status,200);assert.equal(seen.actor,uid(1));const bad=await h(new Request('http://127.0.0.1/order',{method:'POST',headers:{Authorization:'Bearer fixture-token-1'},body:JSON.stringify({rpc:'arbitrary_function',params:{}})}));assert.equal(bad.status,400);});
 await test('New executor preserves a complete delivery cycle and financial idempotency',async()=>{
  for(const [from,to] of [['new','preparing'],['preparing','ready']])assert.equal((await execute(rpc,{p_order_id:2,p_expected_status:from,p_new_status:to,p_request_id:randomUUID()},uid(2))).ok,true);
  const assignment={p_order_id:2,p_driver_id:1,p_request_id:randomUUID()};assert.equal((await execute('top_chicken_assign_order_driver',assignment,uid(2))).ok,true);
  const finish={p_order_id:2,p_expected_status:'out_for_delivery',p_new_status:'delivered',p_request_id:randomUUID()};assert.equal((await execute(rpc,finish,uid(2))).ok,true);
  const row=(await serviceQuery('select status,payment_status,delivery_cash_custody_amount from orders where id=2'))[0];assert.equal(row.status,'delivered');assert.equal(row.payment_status,'confirmed');assert.equal(Number(row.delivery_cash_custody_amount),170);
  const before=await economicState();assert.equal((await execute(rpc,finish,uid(2))).replayed,true);const after=await economicState();for(const key of ['orders','audits','events','receipts','payments','delivery_events'])assert.deepEqual(after[0][key],before[0][key]);
 });
 await test('New staff executor preserves atomic creation, login and password change with fresh core grants',async()=>{
  const h=createTopChickenStaffHandler({admin:{auth:auth.api},authClient:{auth:{signInWithPassword:auth.signInWithPassword}},digestSecret:'synthetic-secret',executeRPC:run});
  const invoke=(body,token='fixture-token-1')=>h(new Request('http://127.0.0.1/staff',{method:'POST',headers:{...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)})).then(async r=>({status:r.status,body:await r.json()}));
  const payload={action:'create',request_id:randomUUID(),name:'Synthetic cloud cashier',username:'cloud_fixture_cashier',password:'Fixture-password-new',role:'cashier',branch_id:22,branch_ids:[22],permissions:['home','pos','orders','deliveryOrders'],active:true};
  const r=await invoke(payload);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.permissions_persisted,true);assert.equal((await invoke({...payload,action:'login'},null)).status,200);
  assert.equal((await invoke({action:'password',request_id:randomUUID(),employee_id:r.body.employee_id,password:'Changed-fixture-password'})).status,200);
  cloud.config.entitled=false;const denied=await invoke(payload);assert.equal(denied.status,403);cloud.config.entitled=true;
 });
 fs.writeFileSync((process.env.TC_REVIEW_OUTPUT||'evidence/top-chicken/authority-review')+'/entitlement-results.json',JSON.stringify({engine:process.env.TOP_CHICKEN_PG_URL?'native PostgreSQL16':'PGlite/WASM, role/RLS native CI required',source_cloud:'Actual read-only Cloud decision metadata; positive grants synthetic only',results},null,2));process.exit(0);
}catch(e){console.error(e.stack,e.code);fs.writeFileSync((process.env.TC_REVIEW_OUTPUT||'evidence/top-chicken/authority-review')+'/entitlement-results.json',JSON.stringify({results,error:e.message,code:e.code},null,2));process.exit(1);}
