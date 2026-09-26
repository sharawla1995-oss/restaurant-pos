(function(global){
'use strict';
const VERSION='10.5.4-beta.58.32';
const R=()=>global.__SharawlaAcceptanceRegistry;
const branch=()=>Number(global.currentBranchId?.()||0);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tx=(run,s)=>`${run}-${s}`;
function ensure(){if(typeof global.rpc!=='function'||typeof global.rest!=='function')throw new Error('Runtime RPC/REST unavailable');if(!branch())throw new Error('Active branch missing')}
async function cleanupCustomer(run){const out=await global.rpc('sharawla_beta54_customer_acceptance_cleanup_v1',{p_run_id:run});if(out?.ok!==true||Number(out?.residue||0)!==0)throw new Error(`Customer cleanup failed: ${JSON.stringify(out)}`);return out}
async function cleanupTreasury(run){const out=await global.rpc('sharawla_beta54_treasury_acceptance_cleanup_v1',{p_run_id:run});if(out?.ok!==true||Number(out?.residue||0)!==0)throw new Error(`Treasury cleanup failed: ${JSON.stringify(out)}`);return out}
function hashRun(run){let h=2166136261>>>0;for(const ch of String(run)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0}return h>>>0}
async function freePhone(run){let base=hashRun(run)%100000000;for(let i=0;i<100;i++){const tail=String((base+i)%100000000).padStart(8,'0'),phone=`010${tail}`;const rows=await global.rest('customers',`select=id&phone=eq.${phone}&limit=1`);if(!rows?.length)return phone}throw new Error('Could not allocate acceptance customer phone')}

async function customerRoundtrip(ctx){
 ensure();const run=ctx.run_id,name=`Acceptance Customer ${run}`,marker=`SHARAWLA_ACCEPTANCE:${run}`;let originalError=null,evidence=null;
 await cleanupCustomer(run);
 try{
  const phone=await freePhone(run);
  const id=Number(await global.rpc('customer_create_v2',{p_name:name,p_phone:phone,p_area:'Acceptance Area',p_address:'Acceptance Address',p_notes:marker}));
  if(!id)throw new Error('Customer create returned no id');
  const rows=await global.rest('customers',`select=id,name,phone,area,address,notes&id=eq.${id}`);
  if(rows?.length!==1)throw new Error(`Customer row mismatch=${rows?.length||0}`);
  const c=rows[0];
  if(c.name!==name||c.phone!==phone||c.area!=='Acceptance Area'||c.address!=='Acceptance Address'||c.notes!==marker)throw new Error(`Customer data mismatch: ${JSON.stringify(c)}`);
  let duplicateRejected=false,duplicateMessage='';
  try{await global.rpc('customer_create_v2',{p_name:name,p_phone:phone,p_area:'Acceptance Area',p_address:'Acceptance Address',p_notes:marker})}catch(e){duplicateMessage=String(e?.message||e);duplicateRejected=/مسجل|duplicate|unique/i.test(duplicateMessage)}
  if(!duplicateRejected)throw new Error(`Duplicate customer phone was not rejected: ${duplicateMessage||'no error'}`);
  const audits=await global.rest('audit_logs',`select=id,action,entity_type,entity_id&entity_type=eq.customer&entity_id=eq.${id}&action=eq.customer_create`);
  if(audits?.length!==1)throw new Error(`Customer audit mismatch=${audits?.length||0}`);
  evidence={customer_id:id,phone,duplicate_guard:true,audit_rows:audits.length};
 }catch(e){originalError=e}
 let clean=null;try{clean=await cleanupCustomer(run)}catch(e){if(!originalError)originalError=e}
 if(originalError)throw originalError;
 return {status:'PASS',detail:`customer=${evidence.customer_id}; duplicate_phone=rejected; audit=${evidence.audit_rows}; cleanup=zero`,evidence:{...evidence,cleanup_zero:Number(clean?.residue||0)===0}};
}

async function treasuryManualRoundtrip(ctx){
 ensure();const run=ctx.run_id,marker=`SHARAWLA_ACCEPTANCE:${run}`;let originalError=null,evidence=null;
 await cleanupTreasury(run);
 try{
  const inTx=tx(run,'TREASURY-IN'),outTx=tx(run,'TREASURY-OUT');
  const i1=Number(await global.rpc('treasury_manual_post_v1',{p_branch_id:branch(),p_direction:'in',p_amount:125.5,p_method:'cash',p_reference:run,p_notes:marker,p_shift_id:null,p_client_tx_id:inTx}));
  const i2=Number(await global.rpc('treasury_manual_post_v1',{p_branch_id:branch(),p_direction:'in',p_amount:125.5,p_method:'cash',p_reference:run,p_notes:marker,p_shift_id:null,p_client_tx_id:inTx}));
  if(!i1||i1!==i2)throw new Error('Treasury cash-in idempotency failed');
  const o1=Number(await global.rpc('treasury_manual_post_v1',{p_branch_id:branch(),p_direction:'out',p_amount:40.25,p_method:'cash',p_reference:run,p_notes:marker,p_shift_id:null,p_client_tx_id:outTx}));
  const o2=Number(await global.rpc('treasury_manual_post_v1',{p_branch_id:branch(),p_direction:'out',p_amount:40.25,p_method:'cash',p_reference:run,p_notes:marker,p_shift_id:null,p_client_tx_id:outTx}));
  if(!o1||o1!==o2)throw new Error('Treasury cash-out idempotency failed');
  const rows=await global.rest('treasury_movements',`select=id,direction,movement_type,amount,reference,notes,client_tx_id&client_tx_id=like.${encodeURIComponent(run+'-%')}&order=id`);
  const ours=(rows||[]).filter(x=>x.reference===run&&x.notes===marker&&['cash_in','cash_out'].includes(x.movement_type));
  if(ours.length!==2)throw new Error(`Treasury movement count mismatch=${ours.length}`);
  const rin=ours.find(x=>Number(x.id)===i1),rout=ours.find(x=>Number(x.id)===o1);
  if(!rin||rin.direction!=='in'||rin.movement_type!=='cash_in'||Math.abs(Number(rin.amount)-125.5)>.005)throw new Error(`Cash-in mismatch: ${JSON.stringify(rin)}`);
  if(!rout||rout.direction!=='out'||rout.movement_type!=='cash_out'||Math.abs(Number(rout.amount)-40.25)>.005)throw new Error(`Cash-out mismatch: ${JSON.stringify(rout)}`);
  const audits=await global.rest('audit_logs',`select=id,action,entity_type,entity_id&entity_type=eq.treasury_movement&entity_id=in.(${i1},${o1})&action=eq.treasury_manual_post`);
  if(audits?.length!==2)throw new Error(`Treasury audit mismatch=${audits?.length||0}`);
  evidence={cash_in_id:i1,cash_out_id:o1,movements:ours.length,audit_rows:audits.length,idempotent:true};
 }catch(e){originalError=e}
 let clean=null;try{clean=await cleanupTreasury(run)}catch(e){if(!originalError)originalError=e}
 if(originalError)throw originalError;
 return {status:'PASS',detail:`cash_in=125.50; cash_out=40.25; idempotent=yes; audit=${evidence.audit_rows}; cleanup=zero`,evidence:{...evidence,cleanup_zero:Number(clean?.residue||0)===0}};
}

async function permissionUiContract(){
 ensure();
 const codes=[
  'customers.create',
  'hr.employees.view','hr.employees.create','hr.employees.edit','hr.salary.view','hr.salary.manage',
  'hr.advances.view','hr.advances.create','hr.advances.approve','hr.advances.disburse',
  'hr.adjustments.view','hr.adjustments.manage','hr.payroll.view','hr.payroll.run','hr.payroll.approve','hr.payroll.pay',
  'treasury.view','treasury.post',
  'purchasing.attachments.view','purchasing.attachments.upload','purchasing.attachments.delete'
 ];
 const rows=await global.rest('permission_actions_v2',`select=code,active&code=in.(${codes.join(',')})&order=code`);
 const found=new Map((rows||[]).map(x=>[String(x.code),x.active!==false]));
 const missing=codes.filter(c=>found.get(c)!==true);if(missing.length)throw new Error(`Missing active action permissions: ${missing.join(', ')}`);
 for(const code of codes){const ok=await global.rpc('has_action_permission_v2',{p_action_code:code});if(ok!==true)throw new Error(`Acceptance admin lacks permission: ${code}`)}
 if(!global.__SharawlaSharedBusinessCoreV1||!global.__SharawlaBeta54SharedCore||!global.__SharawlaPurchasingAttachmentsV1)throw new Error('Shared Core runtime UI APIs are not loaded');
 await global.__SharawlaBeta54SharedCore.refreshPermissions();
 const navKeys=['employees','advances','adjustments','payroll','treasury'];
 const navMissing=navKeys.filter(k=>{const b=document.querySelector(`#nav button[data-beta54-page="${k}"]`);return !b||b.classList.contains('hidden')});
 if(navMissing.length)throw new Error(`Permission-gated nav missing for admin: ${navMissing.join(', ')}`);
 if(typeof global.showPage!=='function')throw new Error('showPage runtime unavailable for UI acceptance');
 let customerButton=false,attachmentButton=false;
 try{
  await Promise.resolve(global.showPage('customers'));await sleep(350);global.__SharawlaSharedBusinessCoreV1.refresh();await sleep(100);
  const cb=document.querySelector('#newCustomerBtn');customerButton=!!cb&&!cb.classList.contains('hidden');
  if(!customerButton)throw new Error('Customer create button missing for permitted admin');
  await global.__SharawlaPurchasingAttachmentsV1.refreshPermissions();
  await Promise.resolve(global.showPage('purchasing'));await sleep(500);
  attachmentButton=[...document.querySelectorAll('button')].some(b=>/أرشيف فواتير الموردين/.test(String(b.textContent||''))&&!b.classList.contains('hidden'));
  if(!attachmentButton)throw new Error('Purchasing attachment archive button missing for permitted admin');
 }finally{try{await Promise.resolve(global.showPage('home'))}catch{}}
 return {status:'PASS',detail:`permissions=${codes.length}; HR_nav=5; customer_create_button=visible; purchase_archive_button=visible`,evidence:{permission_codes:codes.length,hr_nav_pages:5,customer_create_button:customerButton,purchase_archive_button:attachmentButton}};
}

function register(){const reg=R();if(!reg||global.__SharawlaSharedCoreExtraV54Registered)return false;global.__SharawlaSharedCoreExtraV54Registered=true;reg.registerMany([
 {id:'shared.customer-create-roundtrip',name:'Shared Core Customer Create → Duplicate Guard → Audit → Cleanup',pack:'shared-core',profile:'retail',level:'full',mode:'write',features:[],run:customerRoundtrip},
 {id:'shared.treasury-manual-roundtrip',name:'Shared Core Treasury In/Out → Idempotency → Audit → Cleanup',pack:'shared-core',profile:'retail',level:'full',mode:'write',features:[],run:treasuryManualRoundtrip},
 {id:'shared.permission-ui-contract',name:'Shared Core Action Permissions → Visible UI Contract',pack:'shared-core',profile:'retail',level:'full',mode:'read',features:[],run:permissionUiContract}
 ]);return true}
if(!register())global.addEventListener('sharawla-acceptance-registry-ready',register,{once:true});
global.__SharawlaSharedCoreExtraAcceptanceV54=Object.freeze({version:VERSION,register});
})(window);
