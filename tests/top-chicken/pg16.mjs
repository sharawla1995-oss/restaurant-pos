import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const TC='5358328c-9724-49aa-affc-1bce8be90f92',OTHER='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const pgURL=process.env.TOP_CHICKEN_PG_URL;
let db,NativeClient;
if(pgURL){
 const u=new URL(pgURL);
 if(!['127.0.0.1','localhost'].includes(u.hostname)||u.pathname!=='/top_chicken_prelaunch')throw new Error('LOCAL TEST DATABASE ONLY');
 const pgModule=await import('pg');NativeClient=pgModule.Client||pgModule.default.Client;const client=new NativeClient({connectionString:pgURL});await client.connect();
 db={query:(...args)=>client.query(...args),exec:sql=>client.query(sql)};
}else db=new PGlite();
const results=[];
const q=async(sql,params=[])=>(await db.query(sql,params)).rows;
async function test(name,fn){try{await fn();results.push({name,result:'PASS'});}catch(e){results.push({name,result:'FAIL',error:e.message});throw e;}}
async function denied(sql,code,params=[]){await assert.rejects(()=>q(sql,params),e=>e.code===code);}
async function login(n,business=TC,device=''){
 await q("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false),set_config('request.headers',$2,false)",[
 n===null?'':`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`,
 JSON.stringify({'x-sharawla-business':business,...(device?{'x-sharawla-device':device}:{})})]);
}
const transition=(order,from,to,id)=>q('select public.top_chicken_transition_order_status($1,$2,$3,$4) as result',[order,from,to,id]);
const assign=(order,driver,id)=>q('select public.top_chicken_assign_order_driver($1,$2,$3) as result',[order,driver,id]);
async function main(){
 const version=(await q('select version() as version'))[0].version;
 assert.match(version,/PostgreSQL 16\./);
 await db.exec(read('evidence/top-chicken/dependency-tables.sql'));
 // Functions with table references are created after the table snapshot.
 const fixture=read('tests/top-chicken/fixture.sql');
 await db.exec(fixture.slice(0,fixture.indexOf('CREATE FUNCTION public.is_admin')));
 await db.exec("CREATE TABLE public.businesses(id uuid PRIMARY KEY,active boolean);");
 await q('insert into public.businesses values($1,true),($2,true)',[TC,OTHER]);
 await db.exec('SET check_function_bodies=off');
 for(const definition of read('evidence/top-chicken/deployed-owner-snapshot.sql').match(/CREATE OR REPLACE FUNCTION[\s\S]*?AS \$function\$[\s\S]*?\$function\$\n/g))await db.exec(definition+';');
 await db.exec(fixture.slice(fixture.indexOf('CREATE FUNCTION public.is_admin')));
 const contracts=JSON.parse(read('evidence/top-chicken/contracts.json'))[0].data;
 for(const c of contracts.constraints)await db.exec(`ALTER TABLE public.${c.table} ADD CONSTRAINT ${c.name} ${c.definition};`);
 for(const t of ['audit_logs','order_payments','delivery_payment_events'])await db.exec(`CREATE SEQUENCE public.${t}_id_seq START 10000;`);
 await db.exec(`ALTER TABLE public.employee_action_permissions_v2 ADD PRIMARY KEY(business_id,employee_id,action_code);
 CREATE TABLE public.permission_actions_v2(code text PRIMARY KEY,active boolean,legacy_permission text);
 CREATE TABLE public.permission_action_profiles_v2(action_code text,profile_code text,active boolean,required_feature_code text);
 CREATE TABLE public.permission_role_action_defaults_v2(action_code text,profile_code text,role_code text,active boolean,allowed boolean);
 CREATE TABLE sharawla_internal.operational_business_identity_v1(profile_code text);
 INSERT INTO sharawla_internal.operational_business_identity_v1 VALUES('restaurant');
 CREATE FUNCTION sharawla_internal.operational_feature_entitled_v1(text) RETURNS boolean LANGUAGE sql AS $$SELECT $1='commerce.delivery' AND current_setting('fixture.delivery_entitled',true)='true'$$;`);
 for(const d of contracts.definitions.filter(x=>!/operational_feature_entitled/.test(x.signature)))await db.exec(d.definition);
 await db.exec(JSON.parse(read('evidence/top-chicken/evaluator.json'))[0].definition);
 await db.exec(`CREATE FUNCTION public.has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM public.employee_permissions WHERE employee_id=public.current_employee_id() AND business_id=public.current_business_id() AND permission_key=$1 AND allowed) $$;
 CREATE FUNCTION public.has_action_permission_v2(text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT allowed FROM sharawla_internal.evaluate_action_permission_v2($1) $$;`);
 const actionseed=JSON.parse(read('evidence/top-chicken/action-seed.json'))[0].data;
 for(const a of contracts.actions)await q('insert into public.permission_actions_v2 values($1,$2,$3)',[a.code,a.active,a.legacy_permission]);
 for(const a of actionseed.profiles)await q('insert into public.permission_action_profiles_v2 values($1,$2,$3,$4)',[a.action_code,a.profile_code,a.active,a.required_feature_code]);
 for(const a of actionseed.defaults)await q('insert into public.permission_role_action_defaults_v2 values($1,$2,$3,$4,$5)',[a.action_code,a.profile_code,a.role_code,a.active,a.allowed]);
 await q("select set_config('fixture.delivery_entitled','true',false)");
 const triggers=JSON.parse(read('evidence/top-chicken/trigger-snapshot.json'));
 for(const t of triggers.filter(t=>['mt1_business_write_guard_orders','trg_ensure_delivery_custody_snapshot_v2','trg_offline_v2_order_event','mt1_business_write_guard_audit_logs'].includes(t.tgname))){
  await db.exec(t.function_definition);await db.exec(t.definition);
 }
 // Add the actual domain-event tenant guard, which is shared with orders/audit.
 await db.exec('CREATE TRIGGER tenant_event_guard BEFORE INSERT ON public.offline_v2_domain_events FOR EACH ROW EXECUTE FUNCTION public.mt1_business_write_guard();');
 await test('pinned canonical owner repair applies without definition drift',()=>db.exec(read('supabase/top-chicken-canonical-owner-ids-CANDIDATE.sql')));
 await test('candidate SQL compiles on PostgreSQL16',()=>db.exec(read('supabase/top-chicken-order-status-rpc-v1-CANDIDATE.sql')));
 await q(`insert into public.branches(id,name,business_id) values(22,'Fixture TC',$1),(23,'Other branch',$1),(99,'Other tenant',$2)`,[TC,OTHER]);
 for(const [n,role,active,business,branch] of [[1,'admin',true,TC,22],[2,'cashier',true,TC,22],[3,'cashier',false,TC,22],[4,'admin',true,OTHER,99],[5,'admin',true,TC,23],[6,'delivery',true,TC,22],[7,'callcenter',true,TC,22]]){
  const uid=`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
  await q('insert into public.employees(id,name,username,auth_user_id,role,active,business_id,branch_id) values($1,$2,$2,$3,$4,$5,$6,$7)',[n,'fixture'+n,uid,role,active,business,branch]);
  await q('insert into public.employee_branches(employee_id,branch_id,business_id) values($1,$2,$3)',[n,branch,business]);
  await q('insert into public.business_auth_memberships(auth_user_id,business_id) values($1,$2)',[uid,business]);
 }
 for(const [id,business,branch,active] of [[1,TC,22,true],[2,TC,22,false],[3,TC,23,true],[4,OTHER,22,true]])await q('insert into public.delivery_drivers(id,name,business_id,branch_id,active) values($1,$2,$3,$4,$5)',[id,'fixture-driver'+id,business,branch,active]);
 await q("insert into public.payment_methods(id,code,name,business_id) values(1,'cash','Cash',$1)",[TC]);
 await q('insert into public.branch_payment_methods(branch_id,payment_method_id,business_id) values(22,1,$1)',[TC]);
 await db.exec('ALTER TABLE public.orders DISABLE TRIGGER trg_offline_v2_order_event');
 for(const [id,type,status,branch,business,driver] of [[1,'pickup','new',22,TC,null],[2,'delivery','new',22,TC,null],[3,'pickup','cancelled',22,TC,null],[4,'pickup','new',99,OTHER,null],[5,'pickup','new',23,TC,null],[6,'delivery','out_for_delivery',22,TC,null],[7,'delivery','ready',22,TC,null],[8,'pickup','new',22,TC,null],[9,'pickup','new',22,TC,null],[10,'pickup','new',22,TC,null],[11,null,'ready',22,TC,null]])await q('insert into public.orders(id,order_type,status,branch_id,business_id,driver_id,total) values($1,$2,$3,$4,$5,$6,170)',[id,type,status,branch,business,driver]);
 await db.exec('ALTER TABLE public.orders ENABLE TRIGGER trg_offline_v2_order_event');
 await test('anonymous rejected',async()=>{await login(null);await denied("select public.top_chicken_transition_order_status(1,'new','preparing','anon-0001')",'42501');});
 await test('wrong tenant rejected',async()=>{await login(4,OTHER);await denied("select public.top_chicken_transition_order_status(1,'new','preparing','wrong-tenant')",'42501');});
 await test('forged selector rejected',async()=>{await login(4);await denied("select public.top_chicken_transition_order_status(1,'new','preparing','forged-tenant')",'42501');});
 await test('forged device binding rejected',async()=>{await login(1,TC,'dddddddd-dddd-dddd-dddd-dddddddddddd');await denied("select public.top_chicken_transition_order_status(1,'new','preparing','forged-device')",'42501');});
 await test('inactive employee rejected',async()=>{await login(3);await denied("select public.top_chicken_transition_order_status(1,'new','preparing','inactive-staff')",'42501');});
 await test('wrong branch admin rejected',async()=>{await login(5);await denied("select public.top_chicken_transition_order_status(1,'new','preparing','wrong-branch')",'42501');});
 await test('cross-tenant and cross-branch order rejected',async()=>{await login(1);for(const id of [4,5])await denied(`select public.top_chicken_transition_order_status(${id},'new','preparing','scope-${id}-001')`,'42501');});
 await test('cashier pickup full SQL state cycle',async()=>{await login(2);for(const [from,to] of [['new','preparing'],['preparing','ready'],['ready','completed']])await transition(1,from,to,'pickup-'+to);assert.equal((await q('select status from public.orders where id=1'))[0].status,'completed');});
 await test('exact replay returns original result without audit/event duplication',async()=>{const before=await q('select (select count(*) from public.audit_logs) as audits,(select count(*) from public.offline_v2_domain_events) as events');const r=await transition(1,'new','preparing','pickup-preparing');assert.equal(r[0].result.replayed,true);assert.deepEqual(await q('select (select count(*) from public.audit_logs) as audits,(select count(*) from public.offline_v2_domain_events) as events'),before);});
 await test('changed payload and actor replay rejected',async()=>{await denied("select public.top_chicken_transition_order_status(2,'new','preparing','pickup-preparing')",'23505');await login(1);await denied("select public.top_chicken_transition_order_status(1,'new','preparing','pickup-preparing')",'23505');});
 await test('stale and cancelled transition rejected',async()=>{await login(2);await denied("select public.top_chicken_transition_order_status(1,'new','preparing','stale-0001')",'40001');await denied("select public.top_chicken_transition_order_status(3,'cancelled','preparing','cancelled-01')",'22023');});
 await test('explicit employee action deny overrides cashier default',async()=>{await q("insert into public.employee_action_permissions_v2 values(2,'orders.fulfillment.manage',false,now(),$1)",[TC]);await denied("select public.top_chicken_transition_order_status(2,'new','preparing','permission-01')",'42501');await q('delete from public.employee_action_permissions_v2 where employee_id=2');});
 await test('feature denial remains fail closed for assignment',async()=>{await q("select set_config('fixture.delivery_entitled','false',false)");await denied("select public.top_chicken_assign_order_driver(7,1,'no-entitlement')",'42501');await q("select set_config('fixture.delivery_entitled','true',false)");});
 await test('cashier delivery preparing and ready',async()=>{await transition(2,'new','preparing','delivery-prep');await transition(2,'preparing','ready','delivery-ready');});
 await test('delivery cannot complete as pickup',async()=>{await denied("select public.top_chicken_transition_order_status(2,'ready','completed','bad-complete')",'22023');});
 await test('unknown order type cannot complete as pickup',()=>denied("select public.top_chicken_transition_order_status(11,'ready','completed','unknown-type')",'22023'));
 await test('inactive/cross-branch/cross-tenant drivers rejected',async()=>{for(const id of [2,3,4])await denied(`select public.top_chicken_assign_order_driver(2,${id},'bad-driver-${id}')`,'42501');});
 await test('delivery role cannot assign driver',async()=>{await login(6);await denied("select public.top_chicken_assign_order_driver(2,1,'role-no-assign')",'42501');await login(2);});
 await test('driver assignment and exact replay',async()=>{await assign(2,1,'assign-0001');assert.equal((await assign(2,1,'assign-0001'))[0].result.replayed,true);assert.equal((await q('select status,driver_id from public.orders where id=2'))[0].status,'out_for_delivery');});
 await test('delivery without driver rejected',()=>denied("select public.top_chicken_transition_order_status(6,'out_for_delivery','delivered','missing-driver')",'22023'));
 await test('canonical delivery owner finalizes cash payment and custody once',async()=>{await transition(2,'out_for_delivery','delivered','delivered-0001');await transition(2,'out_for_delivery','delivered','delivered-0001');const o=(await q('select status,payment_status,delivery_cash_custody_amount from public.orders where id=2'))[0];assert.equal(o.status,'delivered');assert.equal(o.payment_status,'confirmed');assert.equal(Number(o.delivery_cash_custody_amount),170);assert.equal((await q('select count(*)::int as n from public.order_payments where order_id=2'))[0].n,1);assert.equal((await q('select count(*)::int as n from public.delivery_payment_events where order_id=2'))[0].n,1);});
 await test('audit failure rolls status, event and receipt back atomically',async()=>{await db.exec("CREATE FUNCTION public.fixture_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fixture audit failure';END$$; CREATE TRIGGER fixture_fail_audit BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.fixture_fail_audit();");await denied("select public.top_chicken_transition_order_status(8,'new','preparing','atomic-audit-01')",'P0001');assert.equal((await q('select status from public.orders where id=8'))[0].status,'new');assert.equal((await q("select count(*)::int as n from public.top_chicken_order_status_receipts_v1 where request_id='atomic-audit-01'"))[0].n,0);await db.exec('DROP TRIGGER fixture_fail_audit ON public.audit_logs');});
 await test('receipt failure rolls canonical state and audit back',async()=>{await db.exec("ALTER TABLE public.top_chicken_order_status_receipts_v1 ADD CONSTRAINT fixture_receipt_fail CHECK(request_id<>'atomic-receipt');");await denied("select public.top_chicken_transition_order_status(8,'new','preparing','atomic-receipt')",'23514');assert.equal((await q('select status from public.orders where id=8'))[0].status,'new');await db.exec('ALTER TABLE public.top_chicken_order_status_receipts_v1 DROP CONSTRAINT fixture_receipt_fail');});
 await test('authenticated broad table UPDATE remains absent',async()=>{assert.equal((await q("select has_table_privilege('authenticated','public.orders','UPDATE') as allowed"))[0].allowed,false);});
 await test('anon execute and private receipt access absent',async()=>{assert.equal((await q("select has_function_privilege('anon','public.top_chicken_assign_order_driver(bigint,bigint,text)','EXECUTE') as allowed"))[0].allowed,false);assert.equal((await q("select has_table_privilege('authenticated','public.top_chicken_order_status_receipts_v1','SELECT') as allowed"))[0].allowed,false);});
 await test('existing staff-create payload is rejected by deployed dependency schema',async()=>{await denied("insert into public.employees(name,username,role,branch_id,active,auth_user_id) values('Fixture new','fixture_new','cashier',22,true,'99999999-9999-9999-9999-999999999999')",'23502');});
 if(pgURL){
  async function connection(){const c=new NativeClient({connectionString:pgURL});await c.connect();await c.query("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false),set_config('request.jwt.claim.role','authenticated',false),set_config('request.headers',$1,false),set_config('fixture.delivery_entitled','true',false)",[JSON.stringify({'x-sharawla-business':TC})]);return c;}
  const a=await connection(),b=await connection();
  try{
   await test('native simultaneous same request commits once and replays once',async()=>{const values=[9,'new','preparing','race-same-key'];const rows=await Promise.all([a.query('select public.top_chicken_transition_order_status($1,$2,$3,$4) as result',values),b.query('select public.top_chicken_transition_order_status($1,$2,$3,$4) as result',values)]);assert.deepEqual(rows.map(r=>r.rows[0].result.replayed).sort(),[false,true]);assert.equal((await q("select count(*)::int as n from public.audit_logs where entity_id=9"))[0].n,1);});
   await test('native different request IDs racing same order reject stale writer',async()=>{const attempts=await Promise.allSettled([a.query("select public.top_chicken_transition_order_status(10,'new','preparing','race-order-a')"),b.query("select public.top_chicken_transition_order_status(10,'new','preparing','race-order-b')")]);assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);assert.equal(attempts.find(r=>r.status==='rejected').reason.code,'40001');});
  }finally{await a.end();await b.end();}
 }
 const counts=await q('select (select count(*) from public.audit_logs) as audit_count,(select count(*) from public.top_chicken_order_status_receipts_v1) as receipt_count');
 const report={version,engine:pgURL?'native PostgreSQL16 loopback-only isolated CI':'PGlite 0.2.0; WASM single backend',native_pg16:pgURL?'EXECUTED':'NOT RUN: OS does not permit non-root UID',fixture:'21 deployed table column definitions; selected PK/check constraints, canonical owners and selected real triggers; synthetic auth claims, profile/feature fixtures',concurrency:pgURL?'EXECUTED: two independent connections':'NOT RUN: PGlite single backend is not a multi-session race test',website_to_pos_ui:'NOT RUN',results,counts};
 fs.writeFileSync('evidence/top-chicken/pg16-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 process.exit(results.some(r=>r.result!=='PASS')?1:0);
}
main().catch(e=>{console.error(e.message,e.code);fs.writeFileSync('evidence/top-chicken/pg16-results.json',JSON.stringify({results,error:e.message,code:e.code},null,2));process.exit(1);});
