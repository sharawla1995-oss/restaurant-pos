'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const d=require('../staff/hr-staff-domain.js');
if(typeof global.structuredClone!=='function')global.structuredClone=value=>{if(value===undefined||value===null)return value;if(Buffer.isBuffer(value))return Buffer.from(value);if(Array.isArray(value))return value.map(global.structuredClone);if(typeof value==='object'){const out={};for(const [k,v] of Object.entries(value))out[k]=global.structuredClone(v);return out}return value};
const TestBlob=global.Blob||class Blob{constructor(parts=[],options={}){this.parts=parts;this.type=options.type||'';this.size=parts.reduce((n,p)=>n+(typeof p==='string'?Buffer.byteLength(p):Buffer.isBuffer(p)?p.length:Number(p?.byteLength||p?.length||0)),0)}};
const tests=[];function test(name,fn){tests.push([name,fn])}
const schedule={startAt:'2026-09-18T07:00:00.000Z',endAt:'2026-09-18T15:00:00.000Z',graceMinutes:10,breakMinutes:0,overtimeAfterMinutes:0,earlyLeaveGraceMinutes:0};
const verified=(type,time)=>({type,capturedAt:time,verificationStatus:'verified'});

test('valid check-in',()=>{const r=d.verifyGeofence({point:{latitude:30.0445,longitude:31.2358,accuracyM:8},geofence:{latitude:30.0444,longitude:31.2357,allowedRadiusM:100,minimumAccuracyM:30}});assert.equal(r.verificationStatus,'verified');assert(r.distanceFromBranchM<100)});
test('duplicate client_tx_id',()=>{const ledger=new d.IdempotencyLedger(),a=ledger.submit('TX-1',{x:1},()=>({id:7})),b=ledger.submit('TX-1',{x:1},()=>({id:8}));assert.equal(a.id,7);assert.equal(b.id,7);assert.equal(b.replay,true)});
test('same tx different payload rejection',()=>{const ledger=new d.IdempotencyLedger();ledger.submit('TX-1',{x:1},()=>({id:1}));assert.throws(()=>ledger.submit('TX-1',{x:2},()=>({id:2})),/IDEMPOTENCY_PAYLOAD_MISMATCH/)});
test('outside geofence',()=>{const r=d.verifyGeofence({point:{latitude:30.05,longitude:31.24,accuracyM:5},geofence:{latitude:30.0444,longitude:31.2357,allowedRadiusM:50,minimumAccuracyM:30},outsidePolicy:'reject'});assert.equal(r.verificationStatus,'rejected');assert.equal(r.verificationReason,'outside_geofence')});
test('poor GPS accuracy',()=>{const r=d.verifyGeofence({point:{latitude:30.0444,longitude:31.2357,accuracyM:200},geofence:{latitude:30.0444,longitude:31.2357,allowedRadiusM:100,minimumAccuracyM:30}});assert.equal(r.verificationStatus,'pending_review');assert.equal(r.verificationReason,'poor_gps_accuracy')});
test('offline check-in durable',async()=>{const store=new d.MemoryQueueStore(),q=new d.DurableAttendanceQueue(store);await q.enqueue({clientTxId:'IN-1',eventType:'check_in',selfie:new TestBlob(['x'],{type:'image/jpeg'})});assert.equal((await q.pending())[0].eventType,'check_in')});
test('offline check-out durable',async()=>{const store=new d.MemoryQueueStore(),q=new d.DurableAttendanceQueue(store);await q.enqueue({clientTxId:'OUT-1',eventType:'check_out',selfie:new TestBlob(['x'],{type:'image/jpeg'})});assert.equal((await q.pending())[0].eventType,'check_out')});
test('restart before sync',async()=>{const store=new d.MemoryQueueStore(),q1=new d.DurableAttendanceQueue(store);await q1.enqueue({clientTxId:'RST-1',eventType:'check_in',selfie:new TestBlob(['x'],{type:'image/jpeg'})});const q2=new d.DurableAttendanceQueue(store);assert.equal((await q2.pending()).length,1)});
test('reconnect replay',async()=>{const store=new d.MemoryQueueStore(),q=new d.DurableAttendanceQueue(store);await q.enqueue({clientTxId:'RC-1',eventType:'check_in',selfie:new TestBlob(['x'],{type:'image/jpeg'})});const r=await q.replay(async()=>({eventId:1}));assert.equal(r.synced,1);assert.equal((await q.pending()).length,0)});
test('ACK-loss idempotency',async()=>{const store=new d.MemoryQueueStore(),q=new d.DurableAttendanceQueue(store),server=new d.IdempotencyLedger();await q.enqueue({clientTxId:'ACK-1',eventType:'check_in',selfie:new TestBlob(['x'],{type:'image/jpeg'})});let first=true;await q.replay(async row=>{const ack=server.submit(row.clientTxId,{type:row.eventType},()=>({eventId:11}));if(first){first=false;throw new Error('ACK_LOST')}return ack});assert.equal((await q.pending()).length,1);const r=await q.replay(async row=>server.submit(row.clientTxId,{type:row.eventType},()=>({eventId:12})));assert.equal(r.synced,1);assert.equal((await q.pending()).length,0)});
test('duplicate selfie upload protection',()=>{const ledger=new d.IdempotencyLedger(),a=ledger.submit('SELFIE-1',{sha:'abc'},()=>({path:'one.jpg'})),b=ledger.submit('SELFIE-1',{sha:'abc'},()=>({path:'two.jpg'}));assert.equal(a.path,b.path);assert.throws(()=>ledger.submit('SELFIE-1',{sha:'def'},()=>({})),/MISMATCH/)});
test('check-out without valid check-in',()=>{const r=d.validateCheckout([],new Date().toISOString());assert.equal(r.accepted,false);assert.equal(r.reason,'missing_check_in')});
test('overnight shift',()=>{const r=d.calculateDailySummary({schedule:{...schedule,startAt:'2026-09-18T19:00:00Z',endAt:'2026-09-19T03:00:00Z'},events:[verified('check_in','2026-09-18T19:00:00Z'),verified('check_out','2026-09-19T03:00:00Z')]});assert.equal(r.workedMinutes,480);assert.equal(r.missingCheckOut,false)});
test('late calculation',()=>{const r=d.calculateDailySummary({schedule,events:[verified('check_in','2026-09-18T07:17:00Z'),verified('check_out','2026-09-18T15:00:00Z')]});assert.equal(r.lateMinutes,7)});
test('grace period',()=>{const r=d.calculateDailySummary({schedule,events:[verified('check_in','2026-09-18T07:10:00Z'),verified('check_out','2026-09-18T15:00:00Z')]});assert.equal(r.lateMinutes,0)});
test('early leave',()=>{const r=d.calculateDailySummary({schedule,events:[verified('check_in','2026-09-18T07:00:00Z'),verified('check_out','2026-09-18T14:30:00Z')]});assert.equal(r.earlyLeaveMinutes,30)});
test('overtime calculation',()=>{const r=d.calculateDailySummary({schedule,events:[verified('check_in','2026-09-18T07:00:00Z'),verified('check_out','2026-09-18T16:15:00Z')]});assert.equal(r.overtimeMinutes,75)});
test('missing check-out',()=>{const r=d.calculateDailySummary({schedule,events:[verified('check_in','2026-09-18T07:00:00Z')]});assert.equal(r.missingCheckOut,true);assert.equal(r.incomplete,true)});
test('manual adjustment with audit values',()=>{const r=d.calculateDailySummary({schedule,events:[verified('check_in','2026-09-18T07:20:00Z'),verified('check_out','2026-09-18T15:00:00Z')],adjustment:{lateMinutes:0,workedMinutes:480}});assert.equal(r.lateMinutes,0);assert.equal(r.workedMinutes,480)});
test('leave approval effect',()=>{const r=d.calculateDailySummary({schedule,events:[],approvedLeave:true});assert.equal(r.absent,false);assert.equal(r.approvedLeave,true)});
test('deduction rule generated once only',()=>{const summary=d.calculateDailySummary({schedule,events:[verified('check_in','2026-09-18T07:42:00Z'),verified('check_out','2026-09-18T15:00:00Z')]}),rule={name:'كل 10 دقائق',ruleType:'late_minutes',threshold:10,formula:{minutesPerUnit:10,amountPerUnit:5}},value=d.evaluateRule(rule,summary,{workDate:'2026-09-18'}),ledger=new d.IdempotencyLedger();const a=ledger.submit('rule:1:day:2026-09-18',value,()=>({adjustmentId:1})),b=ledger.submit('rule:1:day:2026-09-18',value,()=>({adjustmentId:2}));assert.equal(value.amount,15);assert.equal(a.adjustmentId,b.adjustmentId)});
test('recurring deduction once per period',()=>{const key=d.recurringPeriodKey({frequency:'monthly'},'2026-09-18'),ledger=new d.IdempotencyLedger();ledger.submit(`recurring:3:${key}`,{amount:100},()=>({id:1}));const b=ledger.submit(`recurring:3:${key}`,{amount:100},()=>({id:2}));assert.equal(key,'2026-09');assert.equal(b.id,1)});
test('attendance recalculation deterministic',()=>{const input={schedule,events:[verified('check_in','2026-09-18T07:17:00Z'),verified('check_out','2026-09-18T15:10:00Z')]};assert.deepStrictEqual(d.calculateDailySummary(input),d.calculateDailySummary(input))});
test('incomplete daily payroll period rejected',()=>{assert.throws(()=>d.calculatePayroll({basis:'daily',rate:100,requiredAttendanceDates:['2026-09-18','2026-09-19'],approvedSummaries:[{workDate:'2026-09-18',verificationStatus:'approved',absent:false,workedMinutes:480},{workDate:'2026-09-19',verificationStatus:'draft',absent:false,workedMinutes:450}]}),/ATTENDANCE_PERIOD_NOT_FINALIZED:2026-09-19/)});
test('incomplete hourly payroll period rejected',()=>{assert.throws(()=>d.calculatePayroll({basis:'hourly',rate:50,requiredAttendanceDates:['2026-09-18','2026-09-19'],approvedSummaries:[{workDate:'2026-09-18',verificationStatus:'approved',absent:false,workedMinutes:600}]}),/ATTENDANCE_PERIOD_NOT_FINALIZED:2026-09-19/)});
test('pending-review payroll day rejected',()=>{assert.throws(()=>d.calculatePayroll({basis:'hourly',rate:50,requiredAttendanceDates:['2026-09-18'],approvedSummaries:[{workDate:'2026-09-18',verificationStatus:'pending_review',absent:false,workedMinutes:600}]}),/ATTENDANCE_PERIOD_NOT_FINALIZED:2026-09-18/)});
test('complete finalized daily payroll period accepted',()=>{const p=d.calculatePayroll({basis:'daily',rate:100,requiredAttendanceDates:['2026-09-18','2026-09-19'],approvedSummaries:[{workDate:'2026-09-18',verificationStatus:'approved',absent:false,workedMinutes:480},{workDate:'2026-09-19',verificationStatus:'approved',absent:false,workedMinutes:450}]});assert.equal(p.baseAmount,200);assert.equal(p.workedDays,2)});
test('complete finalized hourly payroll period accepted',()=>{const p=d.calculatePayroll({basis:'hourly',rate:50,requiredAttendanceDates:['2026-09-18','2026-09-19'],approvedSummaries:[{workDate:'2026-09-18',verificationStatus:'approved',absent:false,workedMinutes:600},{workDate:'2026-09-19',verificationStatus:'approved',absent:false,workedMinutes:300}]});assert.equal(p.baseAmount,750);assert.equal(p.workedMinutes,900)});
test('approved leave and non-scheduled days do not fail coverage',()=>{const p=d.calculatePayroll({basis:'daily',rate:100,requiredAttendanceDates:['2026-09-18','2026-09-19'],approvedLeaveDates:['2026-09-19'],approvedSummaries:[{workDate:'2026-09-18',verificationStatus:'approved',absent:false,workedMinutes:480},{workDate:'2026-09-20',verificationStatus:'draft',absent:true,workedMinutes:0}]});assert.equal(p.baseAmount,100);assert.equal(p.workedDays,1)});
test('monthly payroll behavior unchanged by attendance finalization',()=>{const p=d.calculatePayroll({basis:'monthly',rate:5000,requiredAttendanceDates:['2026-09-18'],approvedSummaries:[{workDate:'2026-09-18',verificationStatus:'draft',absent:true,workedMinutes:0}],adjustments:[{type:'bonus',amount:300},{type:'deduction',amount:100}],advanceDeduction:500});assert.equal(p.netAmount,4700);assert.equal(p.baseAmount,5000)});
test('payroll payment replay does not duplicate treasury or advance deduction',()=>{const state={period:{id:7,status:'approved'},items:[{employeeId:11,netAmount:900,advanceDeduction:100}],treasuryMovements:[],advances:[{id:3,employeeId:11,outstandingAmount:300,status:'active'}]};const first=d.payPayrollIdempotently(state,{clientTxId:'PAY-1'}),second=d.payPayrollIdempotently(state,{clientTxId:'PAY-RETRY'});assert.equal(first.replay,false);assert.equal(second.replay,true);assert.equal(state.treasuryMovements.length,1);assert.equal(state.advances[0].outstandingAmount,200);assert.equal(state.period.status,'paid')});
test('detailed payslip',()=>{const p=d.calculatePayroll({basis:'monthly',rate:5000,adjustments:[{type:'deduction',amount:50,lineType:'late_deduction',reason:'تأخير 42 دقيقة - 2026-09-18'}]}),lines=d.buildPayslipLines(p,[{type:'deduction',amount:50,lineType:'late_deduction',reason:'تأخير 42 دقيقة - 2026-09-18',effectiveDate:'2026-09-18'}]);assert(lines.some(x=>x.type==='late_deduction'&&x.reason.includes('42')));assert(lines.some(x=>x.type==='net_salary'))});
test('branch isolation',()=>{assert.deepStrictEqual(d.branchScoped([{id:1,branchId:1},{id:2,branchId:2}],1).map(x=>x.id),[1])});
test('unauthorized employee data access',()=>{assert.throws(()=>d.authorizeStaffSelf({account:{active:true,employeeId:1},device:{active:true},requestedEmployeeId:2,action:'self.read'}),/SELF_SCOPE/)});
test('Staff user cannot access POS/Admin privileged data',()=>{assert.throws(()=>d.authorizeStaffSelf({account:{active:true,employeeId:1},device:{active:true},requestedEmployeeId:1,action:'hr.payroll.run'}),/ADMIN_PRIVILEGE/)});
test('revoked device rejection',()=>{assert.throws(()=>d.authorizeStaffSelf({account:{active:true,employeeId:1},device:{active:false,revoked:true},requestedEmployeeId:1,action:'attendance.submit'}),/DEVICE_REVOKED/)});
test('disabled Staff Account rejection',()=>{assert.throws(()=>d.authorizeStaffSelf({account:{active:false,employeeId:1},device:{active:true},requestedEmployeeId:1,action:'attendance.submit'}),/ACCOUNT_DISABLED/)});

test('source contract and standalone PWA security',()=>{
 const sql=read('supabase-v10-5-13-hr-attendance-extension.sql'),pwa=read('staff/app.js'),html=read('staff/index.html'),manifest=JSON.parse(read('staff/manifest.webmanifest')),edge=read('supabase/functions/hr-staff-api/index.ts');
 for(const token of ['hr_work_schedules','hr_employee_schedule_assignments','hr_branch_geofences','hr_staff_accounts','hr_attendance_devices','hr_attendance_events','hr_attendance_daily_summary','hr_attendance_adjustments','hr_deduction_rules','hr_deduction_rule_assignments','hr_leave_requests'])assert(sql.includes(token),`missing ${token}`);
 assert(sql.includes("crypt(p_new_pin,gen_salt('bf',10))"));assert(sql.includes('hr_attendance_events_immutable_v1'));assert(sql.includes('source_identity'));assert(sql.includes('hr_payroll_item_lines'));
 assert(sql.includes('hr_payroll_run_attendance_v1'));assert(sql.includes('hr_payroll_pay_attendance_v1'));assert(sql.includes('approval_status'));
 assert(sql.includes("ds.id is null or ds.verification_status<>'approved'"));assert(sql.includes("l.request_type in ('leave','sick_leave','unpaid_leave')"));assert(sql.includes("if p.status='paid' then return true"));
 assert(sql.includes('revoke all on function public.hr_attendance_recalculate_day_v1(bigint,date) from public,anon,authenticated'));
 assert(sql.includes('revoke all on function public.hr_staff_login_v1(text,text,text,text,text,text,text) from public,anon,authenticated'));
 assert(sql.includes('revoke select on public.hr_staff_accounts from anon,authenticated'));
 assert(!/grant select on[^;]*hr_staff_accounts/i.test(sql));
 assert(!/update\s+public\.hr_attendance_events|delete\s+from\s+public\.hr_attendance_events/i.test(sql));
 assert.equal(manifest.display,'standalone');assert(manifest.icons.some(x=>x.sizes==='192x192'&&x.type==='image/png'));assert(manifest.icons.some(x=>x.sizes==='512x512'&&x.type==='image/png'));assert(html.includes('cameraVideo'));assert(!html.includes('type="file"'));assert(pwa.includes('navigator.mediaDevices.getUserMedia'));assert(pwa.includes("document.addEventListener('visibilitychange'"));assert(edge.includes('SUPABASE_SERVICE_ROLE_KEY'));assert(edge.includes('@supabase/supabase-js@2.49.4'));assert(!edge.includes('has_action_permission_v2'));
});

(async()=>{let passed=0;for(const [name,fn] of tests){try{await fn();passed++}catch(error){console.error(`FAIL: ${name}`);throw error}}console.log(`Sharawla HR Stable Port PASS — ${passed} behavioral/security tests`)} )().catch(error=>{console.error(error.stack||error);process.exit(1)});

const stableFoundation=read('supabase-v10-5-13-hr-foundation.sql');
const stableCore=read('hr-core-admin-v1.js');
const stableAdmin=read('hr-attendance-admin-v1.js');
const stableEngine=read('restaurant-engine.js');
const stableIndex=read('index.html');
const hrStaffApi=read('supabase/functions/hr-staff-api/index.ts');
const hrPrivilegeHardening=read('supabase-v10-5-13-hr-privilege-hardening.sql');

assert(!stableFoundation.includes('has_action_permission_v2'));
assert(!stableFoundation.includes('permission_actions_v2(code'));
assert(!read('supabase-v10-5-13-hr-attendance-extension.sql').includes('permission_actions_v2(code'));
for(const file of ['supabase-v10-5-13-hr-foundation.sql','supabase-v10-5-13-hr-payroll-runtime.sql','supabase-v10-5-13-hr-ui-support.sql','supabase-v10-5-13-hr-attendance-extension.sql']){
  assert(!read(file).includes('has_action_permission_v2'));
}
assert(stableCore.includes('__SharawlaHrCoreAdminV1'));
assert(stableCore.includes("rpc('has_permission',{p_permission:code})"));
assert(stableAdmin.includes('__SharawlaHrCoreAdminV1'));
assert(stableAdmin.includes("rpc('has_permission',{p_permission:code})"));
assert(!stableAdmin.includes('has_action_permission_v2'));
assert(stableIndex.includes('hr-core-admin-v1.js?v=10.5.13'));
assert(stableIndex.includes('hr-attendance-admin-v1.js?v=10.5.13'));
for(const code of ['hr.attendance.view','hr.staff_accounts.manage','hr.payroll.pay'])assert(stableEngine.includes(code));
for(const forbidden of ['beta36-integration-loader.js','check-point4-stock-v2','canonical stock']){
  assert(!stableCore.toLowerCase().includes(forbidden.toLowerCase()));
}

assert(hrStaffApi.includes('Deno.serve(async (request:Request)=>{'));
assert(hrStaffApi.trim().endsWith('});'));
assert(!hrStaffApi.trim().endsWith('}));'));
assert(hrStaffApi.includes('x-staff-session'));
assert(hrStaffApi.includes('SUPABASE_SERVICE_ROLE_KEY'));

for(const fn of ['hr_employee_create_v1','hr_employee_compensation_set_v1','hr_advance_create_v1','hr_advance_decide_v1','hr_advance_disburse_v1','hr_adjustment_create_v1','hr_payroll_run_v1','hr_payroll_approve_v1','hr_payroll_pay_v1','treasury_manual_post_v1','hr_employee_update_v1']){
  assert(hrPrivilegeHardening.includes('revoke all on function public.'+fn));
}

console.log('V10.5.13_HR_STABLE_PORT_STATIC_PASS');
console.log('V10.5.13_HR_EDGE_SOURCE_PASS');
console.log('V10.5.13_HR_PRIVILEGE_HARDENING_PASS');
