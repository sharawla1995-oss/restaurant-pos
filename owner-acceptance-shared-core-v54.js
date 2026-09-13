(function(global){
'use strict';
const VERSION='10.5.4-beta.54';
const R=()=>global.__SharawlaAcceptanceRegistry;
const branch=()=>Number(global.currentBranchId?.()||0);
const eq=(a,b,eps=.005)=>Math.abs(Number(a||0)-Number(b||0))<=eps;
const tx=(run,s)=>`${run}-${s}`;
function ensure(){if(typeof global.rpc!=='function'||typeof global.rest!=='function')throw new Error('Runtime RPC/REST unavailable');if(!branch())throw new Error('Active branch missing')}
function uniqueDate(run){let h=0;for(const ch of String(run)){h=((h<<5)-h+ch.charCodeAt(0))|0}const d=new Date(Date.UTC(2035,0,1));d.setUTCDate(d.getUTCDate()+Math.abs(h)%5000);return d.toISOString().slice(0,10)}
async function cleanup(run){const out=await global.rpc('sharawla_beta54_hr_acceptance_cleanup_v1',{p_run_id:run});if(out?.ok!==true||Number(out?.residue||0)!==0)throw new Error(`Beta54 HR cleanup failed: ${JSON.stringify(out)}`);return out}
async function hrPayrollTreasuryRoundtrip(ctx){
 ensure();const run=ctx.run_id,code=`ACC-HR-${run}`,periodDate=uniqueDate(run);let originalError=null,evidence=null;
 await cleanup(run);
 try{
  const employeeTx=tx(run,'HR-EMP');
  const e1=Number(await global.rpc('hr_employee_create_v1',{p_branch_id:branch(),p_name:`Acceptance HR ${run}`,p_phone:null,p_employee_code:code,p_job_title:'Acceptance Tester',p_department:'QA',p_hire_date:periodDate,p_notes:`SHARAWLA_ACCEPTANCE:${run}`,p_client_tx_id:employeeTx}));
  const e2=Number(await global.rpc('hr_employee_create_v1',{p_branch_id:branch(),p_name:`Acceptance HR ${run}`,p_phone:null,p_employee_code:code,p_job_title:'Acceptance Tester',p_department:'QA',p_hire_date:periodDate,p_notes:`SHARAWLA_ACCEPTANCE:${run}`,p_client_tx_id:employeeTx}));
  if(!e1||e1!==e2)throw new Error('HR employee idempotency failed');
  await global.rpc('hr_employee_compensation_set_v1',{p_employee_id:e1,p_salary_basis:'monthly',p_base_salary:1000,p_effective_from:periodDate});

  const advTx=tx(run,'HR-ADV');
  const a1=Number(await global.rpc('hr_advance_create_v1',{p_employee_id:e1,p_amount:300,p_repayment_mode:'installments',p_installment_amount:100,p_installments_count:3,p_reason:'Acceptance advance',p_notes:`SHARAWLA_ACCEPTANCE:${run}`,p_client_tx_id:advTx}));
  const a2=Number(await global.rpc('hr_advance_create_v1',{p_employee_id:e1,p_amount:300,p_repayment_mode:'installments',p_installment_amount:100,p_installments_count:3,p_reason:'Acceptance advance',p_notes:`SHARAWLA_ACCEPTANCE:${run}`,p_client_tx_id:advTx}));
  if(!a1||a1!==a2)throw new Error('Advance idempotency failed');
  await global.rpc('hr_advance_decide_v1',{p_advance_id:a1,p_approve:true,p_note:'Acceptance approval'});
  const disTx=tx(run,'HR-ADV-PAY');
  const m1=Number(await global.rpc('hr_advance_disburse_v1',{p_advance_id:a1,p_method:'cash',p_reference:run,p_shift_id:null,p_client_tx_id:disTx}));
  const m2=Number(await global.rpc('hr_advance_disburse_v1',{p_advance_id:a1,p_method:'cash',p_reference:run,p_shift_id:null,p_client_tx_id:disTx}));
  if(!m1||m1!==m2)throw new Error('Advance disbursement idempotency failed');

  const bonusTx=tx(run,'HR-BONUS'),dedTx=tx(run,'HR-DED');
  const b1=Number(await global.rpc('hr_adjustment_create_v1',{p_employee_id:e1,p_adjustment_type:'bonus',p_amount:50,p_effective_date:periodDate,p_reason:'Acceptance bonus',p_client_tx_id:bonusTx}));
  const b2=Number(await global.rpc('hr_adjustment_create_v1',{p_employee_id:e1,p_adjustment_type:'bonus',p_amount:50,p_effective_date:periodDate,p_reason:'Acceptance bonus',p_client_tx_id:bonusTx}));
  if(!b1||b1!==b2)throw new Error('Bonus idempotency failed');
  const d1=Number(await global.rpc('hr_adjustment_create_v1',{p_employee_id:e1,p_adjustment_type:'deduction',p_amount:20,p_effective_date:periodDate,p_reason:'Acceptance deduction',p_client_tx_id:dedTx}));
  const d2=Number(await global.rpc('hr_adjustment_create_v1',{p_employee_id:e1,p_adjustment_type:'deduction',p_amount:20,p_effective_date:periodDate,p_reason:'Acceptance deduction',p_client_tx_id:dedTx}));
  if(!d1||d1!==d2)throw new Error('Deduction idempotency failed');

  const payrollTx=tx(run,'HR-PAYROLL');
  const p1=Number(await global.rpc('hr_payroll_run_v1',{p_branch_id:branch(),p_period_start:periodDate,p_period_end:periodDate,p_notes:`SHARAWLA_ACCEPTANCE:${run}`,p_client_tx_id:payrollTx}));
  const p2=Number(await global.rpc('hr_payroll_run_v1',{p_branch_id:branch(),p_period_start:periodDate,p_period_end:periodDate,p_notes:`SHARAWLA_ACCEPTANCE:${run}`,p_client_tx_id:payrollTx}));
  if(!p1||p1!==p2)throw new Error('Payroll run idempotency failed');
  const items=await global.rest('hr_payroll_items',`select=id,employee_id,base_amount,overtime_amount,bonus_amount,deduction_amount,advance_deduction,net_amount&payroll_period_id=eq.${p1}&employee_id=eq.${e1}`);
  if(items?.length!==1)throw new Error(`Payroll item mismatch=${items?.length||0}`);
  const item=items[0];
  if(!eq(item.base_amount,1000)||!eq(item.bonus_amount,50)||!eq(item.deduction_amount,20)||!eq(item.advance_deduction,100)||!eq(item.net_amount,930))throw new Error(`Payroll calculation mismatch: ${JSON.stringify(item)}`);
  await global.rpc('hr_payroll_approve_v1',{p_payroll_period_id:p1,p_note:'Acceptance approval'});
  const payTx=tx(run,'HR-PAY');
  const paid1=await global.rpc('hr_payroll_pay_v1',{p_payroll_period_id:p1,p_method:'cash',p_reference:run,p_shift_id:null,p_client_tx_id:payTx});
  const paid2=await global.rpc('hr_payroll_pay_v1',{p_payroll_period_id:p1,p_method:'cash',p_reference:run,p_shift_id:null,p_client_tx_id:payTx});
  if(paid1!==true||paid2!==true)throw new Error('Payroll pay idempotency failed');

  const [adv,adjustments,period,treasury,audits]=await Promise.all([
   global.rest('hr_employee_advances',`select=id,outstanding_amount,status&id=eq.${a1}`),
   global.rest('hr_employee_adjustments',`select=id,status&employee_id=eq.${e1}`),
   global.rest('hr_payroll_periods',`select=id,status&id=eq.${p1}`),
   global.rest('treasury_movements',`select=id,movement_type,amount,client_tx_id&client_tx_id=like.${encodeURIComponent(run+'-%')}&order=id`),
   global.rest('audit_logs',`select=id,action,entity_type,entity_id&or=(and(entity_type.eq.hr_employee,entity_id.eq.${e1}),and(entity_type.eq.hr_advance,entity_id.eq.${a1}),and(entity_type.eq.hr_payroll_period,entity_id.eq.${p1}))`)
  ]);
  if(adv?.length!==1||!eq(adv[0].outstanding_amount,200)||adv[0].status!=='active')throw new Error(`Advance balance mismatch: ${JSON.stringify(adv?.[0])}`);
  if(adjustments?.length!==2||adjustments.some(x=>x.status!=='applied'))throw new Error('Payroll did not apply adjustments exactly once');
  if(period?.[0]?.status!=='paid')throw new Error('Payroll period not paid');
  const advanceMovement=treasury.find(x=>x.movement_type==='employee_advance'),payrollMovement=treasury.find(x=>x.movement_type==='payroll');
  if(treasury.length!==2||!advanceMovement||!payrollMovement||!eq(advanceMovement.amount,300)||!eq(payrollMovement.amount,930))throw new Error(`Treasury movements mismatch: ${JSON.stringify(treasury)}`);
  if((audits||[]).length<5)throw new Error(`Audit evidence too small=${audits?.length||0}`);
  evidence={employee_id:e1,advance_id:a1,payroll_id:p1,period_date:periodDate,net_pay:930,advance_outstanding:200,treasury_movements:treasury.length,audit_rows:audits.length};
 }catch(e){originalError=e}
 let clean=null;try{clean=await cleanup(run)}catch(e){if(!originalError)originalError=e}
 if(originalError)throw originalError;
 return {status:'PASS',detail:`employee=${evidence.employee_id}; advance=300->${evidence.advance_outstanding}; payroll_net=${evidence.net_pay}; treasury=2; audit>=${evidence.audit_rows}; cleanup=zero`,evidence:{...evidence,cleanup_zero:Number(clean?.residue||0)===0}};
}
function register(){const reg=R();if(!reg||global.__SharawlaSharedCoreV54Registered)return false;global.__SharawlaSharedCoreV54Registered=true;reg.registerMany([
 {id:'shared.hr-payroll-treasury-roundtrip',name:'Shared Core HR → Advance → Payroll → Treasury → Cleanup',pack:'shared-core',profile:'retail',level:'full',mode:'write',features:[],run:hrPayrollTreasuryRoundtrip}
 ]);return true}
if(!register())global.addEventListener('sharawla-acceptance-registry-ready',register,{once:true});
global.__SharawlaSharedCoreAcceptanceV54=Object.freeze({version:VERSION,register});
})(window);
