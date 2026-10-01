'use strict';

const fs=require('fs');
const assert=require('assert');
const {classifyError}=require('../beta45-offline-v2-sync.js');
const profile=require('../hr-employee-profile-model-v1.js');

const read=p=>fs.readFileSync(p,'utf8');
const compact=s=>String(s||'').replace(/\s+/g,' ').trim();

function functionContract(src,name){
  const re=new RegExp(
    'create\\s+or\\s+replace\\s+function\\s+public\\.'+name+
    '\\s*\\(([\\s\\S]*?)\\)\\s*returns\\s+([a-zA-Z0-9_]+)',
    'i'
  );
  const m=src.match(re);
  assert(m,'missing function contract: '+name);
  const args=m[1]
    .split(',')
    .map(x=>compact(x).replace(/\s+default\s+.+$/i,''))
    .filter(Boolean);
  return {args,returns:String(m[2]).toLowerCase()};
}

function functionSlice(src,name){
  const start=src.search(new RegExp('create\\s+or\\s+replace\\s+function\\s+public\\.'+name+'\\s*\\(','i'));
  assert(start>=0,'missing function body: '+name);
  const next=src.slice(start+1).search(/\ncreate\s+or\s+replace\s+function\s+public\./i);
  return next<0?src.slice(start):src.slice(start,start+1+next);
}

function exactArgs(src,name,args,returns){
  const c=functionContract(src,name);
  assert.deepStrictEqual(c.args,args,name+' signature/argument order drifted');
  assert.strictEqual(c.returns,returns,name+' return type drifted');
}

function assertUtf8(path){
  const bytes=fs.readFileSync(path);
  const text=bytes.toString('utf8');
  assert(!text.includes('\uFFFD'),path+' contains UTF-8 replacement characters');
  assert(Buffer.from(text,'utf8').equals(bytes),path+' is not stable valid UTF-8');
}

async function checkHrModel(){
  assert.strictEqual(profile.classifyOptionalError(Object.assign(new Error('Could not find relation'),{code:'PGRST202'})).kind,'missing_contract');
  assert.strictEqual(profile.classifyOptionalError(Object.assign(new Error('permission denied'),{code:'42501'})).kind,'auth');
  const net=profile.classifyOptionalError(Object.assign(new Error('connection reset'),{code:'ECONNRESET'}));
  assert.strictEqual(net.kind,'network');
  assert.strictEqual(net.retryable,true);
  assert.strictEqual(profile.classifyOptionalError(Object.assign(new Error('invalid input'),{code:'22P02'})).kind,'query');
  assert.strictEqual(profile.classifyOptionalError(new Error('unexpected renderer failure')).kind,'runtime');

  const seen=[];
  const reader=async(table,query)=>{
    seen.push({table,query});
    if(table==='hr_employees'){
      const id=Number(String(query).match(/id=eq\.(\d+)/)?.[1]||0);
      return [{id,name:'Employee '+id}];
    }
    if(table==='hr_attendance_daily_summary'){
      throw Object.assign(new Error('schema cache missing'),{code:'PGRST202'});
    }
    return [{ok:true}];
  };

  const p77=await profile.load(77,reader);
  assert.strictEqual(p77.employee.id,77,'HR profile opened wrong selected employee');
  assert.strictEqual(p77.sections.attendance.available,false);
  assert.strictEqual(p77.sections.attendance.error.kind,'missing_contract');
  assert.strictEqual(p77.sections.payroll.available,true,'optional failure must not collapse unrelated HR sections');

  const p88=await profile.load(88,reader);
  assert.strictEqual(p88.employee.id,88,'HR profile did not switch to second selected employee');

  const optionalCalls=seen.filter(x=>x.table!=='hr_employees');
  assert(optionalCalls.length>=profile.OPTIONAL_SECTIONS.length*2,'HR optional sections were not independently queried');
  assert(optionalCalls.some(x=>String(x.query).includes('employee_id=eq.77')),'employee 77 optional queries missing');
  assert(optionalCalls.some(x=>String(x.query).includes('employee_id=eq.88')),'employee 88 optional queries missing');
}

(async()=>{
  // Backend-contract skew must preserve durable work as retryable, while generic validation remains permanent.
  const skew=classifyError(Object.assign(
    new Error('Offline V2 operation/RPC binding غير مدعومة'),
    {code:'22023',http_status:400}
  ));
  assert.strictEqual(skew.kind,'transient');
  assert.strictEqual(skew.reason,'backend_contract');
  assert.strictEqual(skew.code,'OFFLINE_V2_BACKEND_CONTRACT_MISSING');
  assert.strictEqual(skew.retryable,true);

  const validation=classifyError(Object.assign(new Error('bad event'),{code:'22023',http_status:400}));
  assert.strictEqual(validation.kind,'permanent');
  assert.strictEqual(validation.retryable,false);

  await checkHrModel();

  const hard=read('beta55-5-runtime-hardening.js');
  assert(hard.includes("deliverySettings:Object.freeze({mode:'partial',read:true,create:true,update:true"));
  assert(hard.includes("if(page==='deliverySettings')return '[data-settle]'"));
  assert(!hard.includes("if(page==='deliverySettings')return '#addDriver,#addZone"));

  const recovery=read('beta55-4-runtime-recovery.js');
  assert(recovery.includes("['treasury_movements',"));

  const beta54=read('beta54-shared-core-ui.js');
  assert(beta54.includes('data-treasury-offline="1"'));
  assert(beta54.includes("const add=!offline&&has('treasury.post')"));

  const parity=read('beta55-navigation-parity.js');
  assert(parity.includes('canonicalNavAliasOf'));
  assert(parity.includes("__SharawlaBeta54SharedCore?.render('treasury')"));
  assert(parity.includes("__SharawlaHrAttendanceAdminV1?.open()"));

  const hr=read('hr-attendance-admin-v1.js');
  assert(hr.includes("const HR_NAV_KEYS=Object.freeze(['employees','attendance','schedules','leaves','advances','adjustments','rules','payroll','reports','settings']);"));
  assert(hr.includes('renderEmployeeProfile'));

  const loader=read('beta36-integration-loader.js');
  assert(loader.indexOf("['hr-employee-profile-model-v1'")>=0);
  assert(loader.indexOf("['hr-employee-profile-model-v1'")<loader.indexOf("['hr-attendance-admin-v1'"));

  const owner=read('permissions-v2-owner-delivery-settings.sql');
  exactArgs(owner,'delivery_driver_save_v2',[
    'p_driver_id bigint','p_branch_id bigint','p_name text','p_phone text','p_active boolean'
  ],'bigint');
  exactArgs(owner,'delivery_zone_save_v2',[
    'p_zone_id bigint','p_branch_id bigint','p_name text','p_delivery_fee numeric','p_active boolean'
  ],'bigint');

  const referenceOwners=read('supabase-offline-v2-restaurant-reference-owners-v1.sql');
  exactArgs(referenceOwners,'offline_delivery_driver_save_v1',[
    'p_driver_id bigint','p_branch_id bigint','p_name text','p_phone text','p_active boolean',
    'p_client_tx_id text','p_payload_digest text'
  ],'jsonb');
  exactArgs(referenceOwners,'offline_delivery_zone_save_v1',[
    'p_zone_id bigint','p_branch_id bigint','p_name text','p_delivery_fee numeric','p_active boolean',
    'p_client_tx_id text','p_payload_digest text'
  ],'jsonb');

  assert.strictEqual((referenceOwners.match(/create or replace function public\.offline_delivery_driver_save_v1\s*\(/gi)||[]).length,1);
  assert.strictEqual((referenceOwners.match(/create or replace function public\.offline_delivery_zone_save_v1\s*\(/gi)||[]).length,1);

  const receiptIndex=referenceOwners.indexOf('create table if not exists public.offline_restaurant_reference_receipts_v1');
  const driverIndex=referenceOwners.indexOf('create or replace function public.offline_delivery_driver_save_v1');
  const zoneIndex=referenceOwners.indexOf('create or replace function public.offline_delivery_zone_save_v1');
  assert(receiptIndex>=0&&driverIndex>receiptIndex&&zoneIndex>receiptIndex,'reference receipt authority must precede Delivery wrappers');

  const driverWrapper=compact(functionSlice(referenceOwners,'offline_delivery_driver_save_v1'));
  const zoneWrapper=compact(functionSlice(referenceOwners,'offline_delivery_zone_save_v1'));
  assert(driverWrapper.includes('public.delivery_driver_save_v2(p_driver_id,p_branch_id,p_name,p_phone,p_active)'),'Driver wrapper owner argument order drifted');
  assert(zoneWrapper.includes('public.delivery_zone_save_v2(p_zone_id,p_branch_id,p_name,p_delivery_fee,p_active)'),'Zone wrapper owner argument order drifted');
  assert(driverWrapper.includes("'driver_id',v_id"),'Driver wrapper canonical result id missing');
  assert(zoneWrapper.includes("'zone_id',v_id"),'Zone wrapper canonical result id missing');

  const dispatcher=read('supabase-rc1-offline-v2-runtime-alignment-final-dispatcher.sql');
  assert.strictEqual((dispatcher.match(/create or replace function public\.offline_delivery_driver_save_v1\s*\(/gi)||[]).length,0,'final dispatcher must not redefine Driver wrapper');
  assert.strictEqual((dispatcher.match(/create or replace function public\.offline_delivery_zone_save_v1\s*\(/gi)||[]).length,0,'final dispatcher must not redefine Zone wrapper');
  assert(!dispatcher.includes('offline_customer_delivery_receipts_v1'),'final dispatcher must not depend on obsolete/unmanifested Delivery receipt table');

  const guardIndex=dispatcher.indexOf("v_operation in ('driver_save','zone_save')");
  const caseIndex=dispatcher.indexOf('case v_rpc');
  assert(guardIndex>=0&&caseIndex>guardIndex,'Driver/Zone branch guard must execute before owner dispatch');

  const dc=compact(dispatcher);
  assert(dc.includes("when 'offline_delivery_driver_save_v1' then v_result := public.offline_delivery_driver_save_v1(nullif(v_payload->>'p_driver_id','')::bigint,v_branch,v_payload->>'p_name',v_payload->>'p_phone',coalesce((v_payload->>'p_active')::boolean,true),v_payload->>'p_client_tx_id',v_digest); v_entity_id := nullif(v_result->>'driver_id','');"),'Driver execution branch/canonical id drifted');
  assert(dc.includes("when 'offline_delivery_zone_save_v1' then v_result := public.offline_delivery_zone_save_v1(nullif(v_payload->>'p_zone_id','')::bigint,v_branch,v_payload->>'p_name',(v_payload->>'p_delivery_fee')::numeric,coalesce((v_payload->>'p_active')::boolean,true),v_payload->>'p_client_tx_id',v_digest); v_entity_id := nullif(v_result->>'zone_id','');"),'Zone execution branch/canonical id drifted');

  assert(dispatcher.includes("revoke all on function public.offline_delivery_driver_save_v1(bigint,bigint,text,text,boolean,text,text) from public,anon,authenticated;"),'Driver wrapper must remain private behind final dispatcher');
  assert(dispatcher.includes("revoke all on function public.offline_delivery_zone_save_v1(bigint,bigint,text,numeric,boolean,text,text) from public,anon,authenticated;"),'Zone wrapper must remain private behind final dispatcher');

  const matrix=read('docs/SHARAWLA-RC1-ROOT-CAUSE-STABILIZATION-PRACTICAL-MATRIX-2026-09-30.md');
  const pa03=matrix.split('\n').find(x=>x.includes('| PA-03 |'))||'';
  assert(pa03.includes('reconnect normally once'),'PA-03 must use normal reconnect/replay');
  assert(/Do \*\*not\*\* inject ACK loss/i.test(pa03),'PA-03 must explicitly exclude ACK-loss injection');

  const pkg=JSON.parse(read('package.json'));
  assert(String(pkg.scripts.check).includes('check-beta58-30-offline-practical-rc1.js'));
  assert(String(pkg.scripts['check:ci']).includes('check-beta58-30-offline-practical-rc1.js'));
  assert(String(pkg.scripts['check:ci']).includes('check-rc1-root-cause-stabilization-runtime.js'),'focused Root-Cause gate is not wired into check:ci');

  const syntax=read('scripts/check-runtime-syntax.js');
  assert(!syntax.includes("require('./check-beta58-30-offline-practical-rc1.js');"));
  assert(syntax.includes("'hr-employee-profile-model-v1.js'"));

  const changed=[
    'beta36-integration-loader.js','beta45-offline-v2-sync.js','beta54-shared-core-ui.js',
    'beta55-4-runtime-recovery.js','beta55-5-runtime-hardening.js','beta55-navigation-parity.js',
    'beta55-ui-workflow-fixes.js',
    'docs/SHARAWLA-RC1-ROOT-CAUSE-STABILIZATION-CONTRACT-2026-09-30.md',
    'docs/SHARAWLA-RC1-ROOT-CAUSE-STABILIZATION-PRACTICAL-MATRIX-2026-09-30.md',
    'hr-attendance-admin-v1.js','hr-employee-profile-model-v1.js','package.json',
    'scripts/check-beta45-offline-v2-transport.js','scripts/check-beta55-5-runtime-hardening.js',
    'scripts/check-rc1-root-cause-stabilization-runtime.js','scripts/check-runtime-syntax.js',
    'supabase-rc1-offline-v2-runtime-alignment-final-dispatcher.sql','sw.js'
  ];
  assert.strictEqual(changed.length,18);
  for(const rel of changed){
    assert(fs.existsSync(rel),rel+' missing');
    assertUtf8(rel);
  }

  console.log('RC1 Root-Cause stabilization focused behavioral gate PASS — backend-contract + HR identity/errors + Delivery owner signatures/dispatch + UTF-8');
})().catch(error=>{
  console.error(error&&error.stack||error);
  process.exit(1);
});
