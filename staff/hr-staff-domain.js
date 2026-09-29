(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.SharawlaStaffDomain=Object.freeze(api);
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

const validStatuses=new Set(['verified','verified_after_sync']);
const minutes=ms=>Math.max(0,Math.floor(ms/60000));
const round2=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;

function stable(value){
 if(Array.isArray(value))return value.map(stable);
 if(value&&typeof value==='object')return Object.keys(value).sort().reduce((out,key)=>{if(value[key]!==undefined)out[key]=stable(value[key]);return out},{});
 return value;
}
function canonicalPayload(value){return JSON.stringify(stable(value))}

function haversineMeters(a,b){
 const rad=n=>Number(n)*Math.PI/180,R=6371000;
 const dLat=rad(b.latitude-a.latitude),dLon=rad(b.longitude-a.longitude);
 const q=Math.sin(dLat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dLon/2)**2;
 return round2(R*2*Math.atan2(Math.sqrt(q),Math.sqrt(1-q)));
}

function verifyGeofence({point,geofence,outsidePolicy='pending_review',poorAccuracyPolicy='pending_review',offline=false}){
 const distance=haversineMeters(geofence,point);
 let status=offline?'verified_after_sync':'verified',reason=null;
 if(Number.isFinite(Number(geofence.minimumAccuracyM))&&Number(point.accuracyM)>Number(geofence.minimumAccuracyM)){
  status=poorAccuracyPolicy==='reject'?'rejected':'pending_review';reason='poor_gps_accuracy';
 }else if(distance>Number(geofence.allowedRadiusM)){
  status=outsidePolicy==='reject'?'rejected':'pending_review';reason='outside_geofence';
 }
 return {distanceFromBranchM:distance,verificationStatus:status,verificationReason:reason};
}

function calculateDailySummary({schedule,events=[],approvedLeave=false,adjustment=null}){
 const start=new Date(schedule.startAt),end=new Date(schedule.endAt);
 if(!(start<end))throw new Error('INVALID_SCHEDULE_WINDOW');
 const accepted=events.filter(e=>validStatuses.has(e.verificationStatus)).sort((a,b)=>new Date(a.capturedAt)-new Date(b.capturedAt));
 let checkIn=accepted.find(e=>e.type==='check_in')?.capturedAt||null;
 let checkOut=[...accepted].reverse().find(e=>e.type==='check_out')?.capturedAt||null;
 if(adjustment?.actualCheckInAt!==undefined)checkIn=adjustment.actualCheckInAt;
 if(adjustment?.actualCheckOutAt!==undefined)checkOut=adjustment.actualCheckOutAt;
 const inAt=checkIn?new Date(checkIn):null,outAt=checkOut?new Date(checkOut):null;
 let result={
  scheduledStartAt:start.toISOString(),scheduledEndAt:end.toISOString(),actualCheckInAt:inAt?.toISOString()||null,
  actualCheckOutAt:outAt?.toISOString()||null,workedMinutes:0,breakMinutes:Number(schedule.breakMinutes||0),lateMinutes:0,
  earlyLeaveMinutes:0,overtimeMinutes:0,absent:!inAt&&!approvedLeave,incomplete:Boolean((inAt&&!outAt)||(!inAt&&outAt)),
  missingCheckOut:Boolean(inAt&&!outAt),approvedLeave:Boolean(approvedLeave)
 };
 if(inAt)result.lateMinutes=Math.max(0,minutes(inAt-start)-Number(schedule.graceMinutes||0));
 if(outAt){
  result.earlyLeaveMinutes=Math.max(0,minutes(end-outAt)-Number(schedule.earlyLeaveGraceMinutes||0));
  result.overtimeMinutes=Math.max(0,minutes(outAt-end)-Number(schedule.overtimeAfterMinutes||0));
 }
 if(inAt&&outAt&&outAt>inAt)result.workedMinutes=Math.max(0,minutes(outAt-inAt)-result.breakMinutes);
 for(const key of ['workedMinutes','lateMinutes','earlyLeaveMinutes','overtimeMinutes'])if(adjustment&&adjustment[key]!==undefined)result[key]=Math.max(0,Number(adjustment[key]));
 return result;
}

function evaluateRule(rule,summary,context={}){
 let amount=0,type='deduction',reason=rule.name||rule.ruleType;
 const threshold=Number(rule.threshold??1),fixed=Number(rule.amount||0),formula=rule.formula||{};
 if(rule.ruleType==='late_fixed'&&summary.lateMinutes>=threshold){amount=fixed;reason=`تأخير ${summary.lateMinutes} دقيقة - ${context.workDate}`}
 if(rule.ruleType==='late_minutes'&&summary.lateMinutes>=threshold){amount=Math.floor(summary.lateMinutes/Number(formula.minutesPerUnit||threshold||1))*Number(formula.amountPerUnit||fixed);reason=`تأخير ${summary.lateMinutes} دقيقة - ${context.workDate}`}
 if(rule.ruleType==='absence_day'&&summary.absent){amount=fixed;reason=`غياب يوم - ${context.workDate}`}
 if(rule.ruleType==='early_leave'&&summary.earlyLeaveMinutes>=threshold){amount=fixed;reason=`خروج مبكر ${summary.earlyLeaveMinutes} دقيقة - ${context.workDate}`}
 if(rule.ruleType==='overtime_bonus'&&summary.overtimeMinutes>=threshold){amount=Math.floor(summary.overtimeMinutes/Number(formula.minutesPerUnit||threshold||1))*Number(formula.amountPerUnit||fixed);type='overtime';reason=`إضافي ${summary.overtimeMinutes} دقيقة - ${context.workDate}`}
 if(rule.ruleType==='attendance_bonus'&&!summary.absent&&!summary.incomplete&&summary.lateMinutes===0){amount=fixed;type='bonus';reason=`مكافأة انتظام - ${context.workDate}`}
 return amount>0?{type,amount:round2(amount),reason}:null;
}

function recurringPeriodKey(definition,dateValue){
 const d=new Date(`${dateValue}T00:00:00Z`),yyyy=d.getUTCFullYear(),mm=String(d.getUTCMonth()+1).padStart(2,'0');
 if(definition.frequency==='monthly')return `${yyyy}-${mm}`;
 if(definition.frequency==='weekly'){
  const t=new Date(Date.UTC(yyyy,d.getUTCMonth(),d.getUTCDate()));t.setUTCDate(t.getUTCDate()+4-(t.getUTCDay()||7));
  const y0=new Date(Date.UTC(t.getUTCFullYear(),0,1)),week=Math.ceil((((t-y0)/86400000)+1)/7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2,'0')}`;
 }
 return dateValue;
}

function validatePayrollAttendanceCoverage({basis,requiredAttendanceDates=[],approvedLeaveDates=[],summaries=[]}){
 if(basis==='monthly')return {requiredDates:[],unresolvedDates:[]};
 const leave=new Set(approvedLeaveDates),byDate=new Map(summaries.map(row=>[row.workDate||row.work_date,row]));
 const required=[...new Set(requiredAttendanceDates)].filter(workDate=>!leave.has(workDate));
 const unresolved=required.filter(workDate=>{const row=byDate.get(workDate);return !row||String(row.verificationStatus||row.verification_status)!=='approved'});
 if(unresolved.length){const error=new Error(`ATTENDANCE_PERIOD_NOT_FINALIZED:${unresolved.join(',')}`);error.unresolvedDates=unresolved;throw error}
 return {requiredDates:required,unresolvedDates:[]};
}

function calculatePayroll({basis,rate,approvedSummaries=[],requiredAttendanceDates=[],approvedLeaveDates=[],adjustments=[],advanceDeduction=0}){
 validatePayrollAttendanceCoverage({basis,requiredAttendanceDates,approvedLeaveDates,summaries:approvedSummaries});
 const workedDays=approvedSummaries.filter(s=>s.verificationStatus==='approved'&&!s.absent&&Number(s.workedMinutes)>0).length;
 const workedMinutes=approvedSummaries.filter(s=>s.verificationStatus==='approved').reduce((n,s)=>n+Number(s.workedMinutes||0),0);
 const base=round2(basis==='monthly'?rate:basis==='daily'?rate*workedDays:rate*workedMinutes/60);
 const sum=type=>round2(adjustments.filter(a=>a.type===type).reduce((n,a)=>n+Number(a.amount||0),0));
 const bonus=sum('bonus'),overtime=sum('overtime'),deduction=Math.min(sum('deduction'),base+bonus+overtime);
 const advance=Math.min(Number(advanceDeduction||0),Math.max(0,base+bonus+overtime-deduction));
 return {basis,workedDays,workedMinutes,baseAmount:base,bonusAmount:bonus,overtimeAmount:overtime,deductionAmount:deduction,advanceDeduction:round2(advance),netAmount:round2(Math.max(0,base+bonus+overtime-deduction-advance))};
}

function payPayrollIdempotently(state,{clientTxId}){
 if(state.period.status==='paid')return {replay:true,treasuryMovements:state.treasuryMovements.length};
 if(state.period.status!=='approved')throw new Error('PAYROLL_NOT_APPROVED');
 for(const item of state.items){
  const movementKey=`${clientTxId}:employee:${item.employeeId}`;
  if(Number(item.netAmount)>0&&!state.treasuryMovements.some(row=>row.clientTxId===movementKey))state.treasuryMovements.push({clientTxId:movementKey,employeeId:item.employeeId,amount:Number(item.netAmount)});
  let remaining=Number(item.advanceDeduction||0);
  for(const advance of state.advances.filter(row=>row.employeeId===item.employeeId&&row.status==='active')){
   if(remaining<=0)break;const amount=Math.min(Number(advance.outstandingAmount),remaining);advance.outstandingAmount=round2(Number(advance.outstandingAmount)-amount);remaining=round2(remaining-amount);if(advance.outstandingAmount<=0)advance.status='settled';
  }
 }
 state.period.status='paid';state.period.paymentClientTxId=clientTxId;
 return {replay:false,treasuryMovements:state.treasuryMovements.length};
}

function buildPayslipLines(payroll,adjustments=[]){
 const lines=[{type:'basic_salary',amount:payroll.baseAmount,reason:'Basic Salary'}];
 if(payroll.basis==='daily')lines.push({type:'worked_days',amount:0,quantity:payroll.workedDays,reason:'Worked Days'});
 if(payroll.basis==='hourly')lines.push({type:'worked_hours',amount:0,quantity:round2(payroll.workedMinutes/60),reason:'Worked Hours'});
 for(const adjustment of adjustments)lines.push({type:adjustment.lineType||(adjustment.type==='bonus'?'bonus':adjustment.type==='overtime'?'overtime':'manual_deduction'),amount:Number(adjustment.amount),reason:adjustment.reason,effectiveDate:adjustment.effectiveDate});
 if(payroll.advanceDeduction>0)lines.push({type:'advance_installment',amount:payroll.advanceDeduction,reason:'Advance Installment'});
 lines.push({type:'net_salary',amount:payroll.netAmount,reason:'Net Salary'});return lines;
}

function validateCheckout(events,capturedAt){
 const at=new Date(capturedAt),accepted=events.filter(e=>validStatuses.has(e.verificationStatus)&&new Date(e.capturedAt)<=at&&new Date(e.capturedAt)>=new Date(at-36*3600000)).sort((a,b)=>new Date(a.capturedAt)-new Date(b.capturedAt));
 let open=false;for(const event of accepted){if(event.type==='check_in')open=true;if(event.type==='check_out')open=false}return open?{accepted:true}:{accepted:false,status:'rejected',reason:'missing_check_in'};
}

function authorizeStaffSelf({account,device,requestedEmployeeId,action}){
 const allowed=new Set(['self.read','attendance.submit','leave.create','pin.change','logout']);
 if(!account?.active)throw new Error('STAFF_ACCOUNT_DISABLED');
 if(!device?.active||device?.revoked)throw new Error('STAFF_DEVICE_REVOKED');
 if(Number(requestedEmployeeId)!==Number(account.employeeId))throw new Error('EMPLOYEE_SELF_SCOPE_VIOLATION');
 if(!allowed.has(action))throw new Error('STAFF_ADMIN_PRIVILEGE_FORBIDDEN');
 return true;
}

function branchScoped(rows,branchId){return rows.filter(row=>Number(row.branchId)===Number(branchId))}

class IdempotencyLedger{
 constructor(){this.rows=new Map()}
 submit(key,payload,create){
  const digest=canonicalPayload(payload),old=this.rows.get(key);
  if(old){if(old.digest!==digest)throw new Error('IDEMPOTENCY_PAYLOAD_MISMATCH');return {...old.value,replay:true}}
  const value=create(payload);this.rows.set(key,{digest,value});return {...value,replay:false};
 }
}

class MemoryQueueStore{
 constructor(seed=[]){this.rows=new Map(seed.map(x=>[x.clientTxId,structuredClone(x)]))}
 async list(){return [...this.rows.values()].map(row=>structuredClone(row))}
 async put(row){this.rows.set(row.clientTxId,structuredClone(row));return row}
 async remove(key){this.rows.delete(key)}
}

class DurableAttendanceQueue{
 constructor(store){this.store=store;this.running=false}
 async enqueue(envelope){
  if(!envelope.clientTxId||!envelope.selfie)throw new Error('INVALID_OFFLINE_ENVELOPE');
  const rows=await this.store.list(),old=rows.find(x=>x.clientTxId===envelope.clientTxId),digest=canonicalPayload({...envelope,selfie:{size:envelope.selfie.size,type:envelope.selfie.type}});
  if(old&&old.digest!==digest)throw new Error('OFFLINE_TX_PAYLOAD_MISMATCH');
  if(old)return old;
  const row={...envelope,digest,state:'pending',attempts:0,createdAt:new Date().toISOString()};await this.store.put(row);return row;
 }
 async pending(){return (await this.store.list()).filter(x=>x.state!=='acked')}
 async replay(send){
  if(this.running)return {skipped:true,synced:0};this.running=true;let synced=0;
  try{
   for(const row of await this.pending()){
    row.state='syncing';row.attempts+=1;await this.store.put(row);
    try{const ack=await send(row);row.state='acked';row.ack=ack;await this.store.put(row);await this.store.remove(row.clientTxId);synced++}
    catch(error){row.state='pending';row.lastError=String(error?.message||error);await this.store.put(row);break}
   }
   return {skipped:false,synced};
  }finally{this.running=false}
 }
}

return {canonicalPayload,haversineMeters,verifyGeofence,calculateDailySummary,evaluateRule,recurringPeriodKey,validatePayrollAttendanceCoverage,calculatePayroll,payPayrollIdempotently,buildPayslipLines,validateCheckout,authorizeStaffSelf,branchScoped,IdempotencyLedger,MemoryQueueStore,DurableAttendanceQueue};
});
