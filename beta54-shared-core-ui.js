(function(global){
'use strict';
const VERSION='10.5.4-beta.58.33';
const PERMISSION_CODES=[
 'hr.employees.view','hr.employees.create','hr.employees.edit','hr.salary.view','hr.salary.manage',
 'hr.advances.view','hr.advances.create','hr.advances.approve','hr.advances.disburse',
 'hr.adjustments.view','hr.adjustments.manage','hr.payroll.view','hr.payroll.run','hr.payroll.approve','hr.payroll.pay',
 'treasury.view','treasury.post'
];
const PAGE_DEF={
 employees:{label:'👨‍💼 الموظفون',title:'الموظفون',permission:'hr.employees.view'},
 advances:{label:'💰 السلف',title:'سلف الموظفين',permission:'hr.advances.view'},
 adjustments:{label:'➕➖ الخصومات والمكافآت',title:'الخصومات والمكافآت',permission:'hr.adjustments.view'},
 payroll:{label:'🧾 المرتبات',title:'المرتبات',permission:'hr.payroll.view'},
 treasury:{label:'🏦 الخزنة',title:'الخزنة',permission:'treasury.view'}
};
let perms=Object.create(null),started=false,currentPage=null,refreshTimer=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money=v=>Number(v||0).toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2});
const date=v=>v?new Date(v).toLocaleDateString('ar-EG'):'—';
const tx=p=>`${p}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const toast=m=>{try{if(typeof global.toast==='function')return global.toast(m)}catch{};alert(m)};
async function rpc(name,payload={}){if(typeof global.rpc!=='function')throw new Error('الاتصال غير جاهز');return global.rpc(name,payload)}
async function rest(table,query=''){if(typeof global.rest!=='function')throw new Error('الاتصال غير جاهز');return global.rest(table,query)}
function branchId(){try{return Number(typeof global.currentBranchId==='function'?global.currentBranchId():0)||0}catch{return 0}}
function has(code){return perms[code]===true}
async function permission(code){try{return (await rpc('has_action_permission_v2',{p_action_code:code}))===true}catch{return false}}
async function refreshPermissions(){const values=await Promise.all(PERMISSION_CODES.map(permission));PERMISSION_CODES.forEach((c,i)=>perms[c]=values[i]);syncNav()}
function appVisible(){const v=document.querySelector('#appView');return !!v&&!v.classList.contains('hidden')}
function injectStyle(){if(document.querySelector('#beta54CoreStyle'))return;const s=document.createElement('style');s.id='beta54CoreStyle';s.textContent=`
.beta54-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
.beta54-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
.beta54-card{background:var(--card,#171a21);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px}
.beta54-card h3{margin:0 0 8px}.beta54-muted{opacity:.72;font-size:.88em}.beta54-kpi{font-size:1.35rem;font-weight:800}
.beta54-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}
.beta54-table-wrap{overflow:auto}.beta54-table{width:100%;border-collapse:collapse;min-width:720px}.beta54-table th,.beta54-table td{padding:9px;border-bottom:1px solid rgba(255,255,255,.08);text-align:right;white-space:nowrap}
.beta54-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.beta54-pill{padding:5px 9px;border-radius:999px;background:rgba(255,255,255,.08)}
.beta54-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.beta54-form-grid label{display:flex;flex-direction:column;gap:5px}.beta54-form-grid .wide{grid-column:1/-1}
@media(max-width:680px){.beta54-form-grid{grid-template-columns:1fr}.beta54-table{min-width:620px}}
`;document.head.appendChild(s)}
function syncNav(){
 const nav=document.querySelector('#nav');if(!nav)return;
 const anchor=nav.querySelector('button[data-page="users"]')||nav.querySelector('button[data-page="settings"]');
 for(const [key,d] of Object.entries(PAGE_DEF)){
   let b=nav.querySelector(`button[data-beta54-page="${key}"]`);
   if(!b){b=document.createElement('button');b.type='button';b.dataset.beta54Page=key;b.textContent=d.label;if(anchor)nav.insertBefore(b,anchor);else nav.appendChild(b)}
   b.classList.toggle('hidden',!has(d.permission));
 }
}
function activateNav(key){
 document.querySelectorAll('#nav button').forEach(b=>b.classList.remove('active'));
 document.querySelector(`#nav button[data-beta54-page="${key}"]`)?.classList.add('active');
 document.querySelector('.sidebar')?.classList.remove('open');
}
function setPage(key,html){
 currentPage=key;activateNav(key);
 const title=document.querySelector('#pageTitle');if(title)title.textContent=PAGE_DEF[key]?.title||'Sharawla';
 const page=document.querySelector('#page');if(page)page.innerHTML=html;
}
function ensureAllowed(key){const d=PAGE_DEF[key];if(!d||!has(d.permission)){toast('ليس لديك صلاحية لفتح هذا القسم');return false}return true}
function button(label,attr='',cls='secondary'){return `<button type="button" class="${cls}" ${attr}>${label}</button>`}
function modal(title,body,onSave,saveLabel='حفظ'){
 const el=document.createElement('div');el.className='modal';el.innerHTML=`<div class="modal-card" style="max-width:760px"><h2>${esc(title)}</h2>${body}<div class="modal-actions"><button type="button" class="secondary" data-close>إلغاء</button><button type="button" class="primary" data-save>${esc(saveLabel)}</button></div></div>`;document.body.appendChild(el);
 el.addEventListener('click',async e=>{if(e.target===el||e.target.closest('[data-close]')){el.remove();return}const b=e.target.closest('[data-save]');if(!b)return;b.disabled=true;try{await onSave(el);el.remove()}catch(err){toast(err?.message||String(err));b.disabled=false}});
 return el;
}
async function renderEmployees(){
 if(!ensureAllowed('employees'))return;
 setPage('employees','<div class="beta54-muted">جاري تحميل الموظفين…</div>');
 const [employees,comp]=await Promise.all([
   rest('hr_employees','select=id,home_branch_id,employee_code,name,phone,job_title,department,hire_date,employment_status,notes,active,created_at&order=name'),
   has('hr.salary.view')?rest('hr_employee_compensation','select=employee_id,salary_basis,base_salary,effective_from,updated_at'):[]
 ]);
 const cm=new Map((comp||[]).map(x=>[Number(x.employee_id),x]));
 const add=has('hr.employees.create')?button('➕ موظف جديد','data-add-employee','primary'):'';
 const cards=(employees||[]).map(x=>{const c=cm.get(Number(x.id));return `<article class="beta54-card"><h3>${esc(x.name)}</h3><div class="beta54-muted">${esc(x.employee_code||'بدون كود')} • ${esc(x.job_title||'بدون وظيفة')} • ${esc(x.department||'بدون قسم')}</div><div>📱 ${esc(x.phone||'—')}</div><div>📅 التعيين: ${esc(x.hire_date||'—')}</div><div>الحالة: <span class="beta54-pill">${esc(x.employment_status)}</span></div>${has('hr.salary.view')?`<div>الراتب: <b>${c?money(c.base_salary):'غير محدد'}</b> ${c?esc(c.salary_basis):''}</div>`:''}<div class="beta54-actions">${has('hr.employees.edit')?button('✏️ تعديل',`data-edit-employee="${x.id}"`):''}${has('hr.salary.manage')?button('💵 الراتب',`data-salary="${x.id}"`):''}${button('📒 كشف الحساب',`data-statement="${x.id}"`)}</div></article>`}).join('');
 setPage('employees',`<div class="beta54-toolbar">${add}<span class="beta54-muted">الموظف هنا سجل HR مستقل عن حساب الدخول للبرنامج.</span></div><div class="beta54-grid">${cards||'<div class="beta54-card">لا يوجد موظفون بعد.</div>'}</div>`);
 const page=document.querySelector('#page');
 page.querySelector('[data-add-employee]')?.addEventListener('click',()=>openEmployeeForm());
 page.querySelectorAll('[data-edit-employee]').forEach(b=>b.onclick=()=>openEmployeeForm((employees||[]).find(x=>String(x.id)===b.dataset.editEmployee)));
 page.querySelectorAll('[data-salary]').forEach(b=>b.onclick=()=>openSalary(Number(b.dataset.salary),cm.get(Number(b.dataset.salary))));
 page.querySelectorAll('[data-statement]').forEach(b=>b.onclick=()=>openStatement(Number(b.dataset.statement),(employees||[]).find(x=>Number(x.id)===Number(b.dataset.statement))));
}
function openEmployeeForm(row=null){
 const isEdit=!!row;
 const body=`<div class="beta54-form-grid">
 <label>الاسم<input data-f="name" value="${esc(row?.name||'')}" required></label>
 <label>كود الموظف<input data-f="code" value="${esc(row?.employee_code||'')}"></label>
 <label>الموبايل<input data-f="phone" value="${esc(row?.phone||'')}"></label>
 <label>الوظيفة<input data-f="job" value="${esc(row?.job_title||'')}"></label>
 <label>القسم<input data-f="dept" value="${esc(row?.department||'')}"></label>
 <label>تاريخ التعيين<input data-f="hire" type="date" value="${esc(row?.hire_date||'')}"></label>
 ${isEdit?`<label>الحالة<select data-f="status"><option value="active" ${row.employment_status==='active'?'selected':''}>فعال</option><option value="leave" ${row.employment_status==='leave'?'selected':''}>إجازة</option><option value="terminated" ${row.employment_status==='terminated'?'selected':''}>منتهي</option></select></label><label>نشط بالنظام<select data-f="active"><option value="true" ${row.active!==false?'selected':''}>نعم</option><option value="false" ${row.active===false?'selected':''}>لا</option></select></label>`:''}
 <label class="wide">ملاحظات<textarea data-f="notes" rows="3">${esc(row?.notes||'')}</textarea></label>
 </div>`;
 modal(isEdit?'تعديل موظف':'إضافة موظف',body,async m=>{
   const v=k=>m.querySelector(`[data-f="${k}"]`)?.value||null;
   if(!v('name')?.trim())throw new Error('اسم الموظف مطلوب');
   if(isEdit)await rpc('hr_employee_update_v1',{p_employee_id:Number(row.id),p_name:v('name'),p_phone:v('phone'),p_employee_code:v('code'),p_job_title:v('job'),p_department:v('dept'),p_hire_date:v('hire')||null,p_employment_status:v('status'),p_notes:v('notes'),p_active:v('active')==='true'});
   else {const bid=branchId();if(!bid)throw new Error('اختر فرعًا أولًا');await rpc('hr_employee_create_v1',{p_branch_id:bid,p_name:v('name'),p_phone:v('phone'),p_employee_code:v('code'),p_job_title:v('job'),p_department:v('dept'),p_hire_date:v('hire')||null,p_notes:v('notes'),p_client_tx_id:tx('HR-EMP')})}
   toast(isEdit?'تم تعديل الموظف':'تمت إضافة الموظف');await renderEmployees();
 });
}
function openSalary(employeeId,c){
 const body=`<div class="beta54-form-grid"><label>نظام الراتب<select data-f="basis"><option value="monthly" ${c?.salary_basis==='monthly'||!c?'selected':''}>شهري</option><option value="daily" ${c?.salary_basis==='daily'?'selected':''}>يومي</option><option value="hourly" ${c?.salary_basis==='hourly'?'selected':''}>بالساعة</option></select></label><label>الراتب الأساسي<input data-f="salary" type="number" min="0" step=".01" value="${esc(c?.base_salary??0)}"></label><label>ساري من<input data-f="from" type="date" value="${esc(c?.effective_from||new Date().toISOString().slice(0,10))}"></label></div><p class="beta54-muted">المسير التلقائي الحالي يحسب الشهري. اليومي/بالساعة سيحتاج حضور/ساعات قبل اعتماد المسير.</p>`;
 modal('تحديد راتب الموظف',body,async m=>{await rpc('hr_employee_compensation_set_v1',{p_employee_id:employeeId,p_salary_basis:m.querySelector('[data-f="basis"]').value,p_base_salary:Number(m.querySelector('[data-f="salary"]').value||0),p_effective_from:m.querySelector('[data-f="from"]').value||null});toast('تم حفظ الراتب');await renderEmployees()});
}
async function openStatement(employeeId,row){
 try{
  const [adv,adj,items,periods]=await Promise.all([
   has('hr.advances.view')?rest('hr_employee_advances',`select=id,amount,outstanding_amount,status,requested_on,reason&employee_id=eq.${employeeId}&order=requested_on.desc`):[],
   (has('hr.adjustments.view')||has('hr.adjustments.manage'))?rest('hr_employee_adjustments',`select=id,adjustment_type,amount,effective_date,status,reason&employee_id=eq.${employeeId}&order=effective_date.desc`):[],
   has('hr.payroll.view')?rest('hr_payroll_items',`select=id,payroll_period_id,base_amount,overtime_amount,bonus_amount,deduction_amount,advance_deduction,net_amount&employee_id=eq.${employeeId}&order=id.desc`):[],
   has('hr.payroll.view')?rest('hr_payroll_periods','select=id,period_start,period_end,status&order=period_end.desc'):[]
  ]);
  const pm=new Map((periods||[]).map(x=>[Number(x.id),x]));
  const body=`<div style="max-height:65vh;overflow:auto">
  <h3>السلف</h3>${(adv||[]).map(a=>`<div class="beta54-card">${date(a.requested_on)} — ${money(a.amount)} — متبقي ${money(a.outstanding_amount)} — ${esc(a.status)} ${a.reason?`<div class="beta54-muted">${esc(a.reason)}</div>`:''}</div>`).join('')||'<p class="beta54-muted">لا توجد حركات.</p>'}
  <h3>الخصومات والمكافآت</h3>${(adj||[]).map(a=>`<div class="beta54-card">${date(a.effective_date)} — ${esc(a.adjustment_type)} — ${money(a.amount)} — ${esc(a.status)} ${a.reason?`<div class="beta54-muted">${esc(a.reason)}</div>`:''}</div>`).join('')||'<p class="beta54-muted">لا توجد حركات.</p>'}
  <h3>المرتبات</h3>${(items||[]).map(i=>{const p=pm.get(Number(i.payroll_period_id));return `<div class="beta54-card">${p?`${esc(p.period_start)} → ${esc(p.period_end)}`:`#${i.payroll_period_id}`} — صافي <b>${money(i.net_amount)}</b> — ${esc(p?.status||'')}</div>`}).join('')||'<p class="beta54-muted">لا توجد حركات.</p>'}
  </div>`;
  modal(`كشف حساب — ${row?.name||employeeId}`,body,async()=>{},'إغلاق').querySelector('[data-save]').onclick=e=>{e.preventDefault();e.currentTarget.closest('.modal').remove()};
 }catch(err){toast(err?.message||String(err))}
}
async function renderAdvances(){
 if(!ensureAllowed('advances'))return;
 setPage('advances','<div class="beta54-muted">جاري تحميل السلف…</div>');
 const [employees,rows]=await Promise.all([
  rest('hr_employees','select=id,name,home_branch_id&active=eq.true&order=name'),
  rest('hr_employee_advances','select=id,employee_id,branch_id,amount,outstanding_amount,repayment_mode,installment_amount,installments_count,status,requested_on,reason,payment_method,payment_reference,created_at&order=requested_on.desc,id.desc')
 ]);
 const em=new Map((employees||[]).map(x=>[Number(x.id),x]));
 const add=has('hr.advances.create')?button('➕ سلفة جديدة','data-add-advance','primary'):'';
 const cards=(rows||[]).map(a=>`<article class="beta54-card"><h3>${esc(em.get(Number(a.employee_id))?.name||'#'+a.employee_id)}</h3><div class="beta54-kpi">${money(a.amount)}</div><div>المتبقي: <b>${money(a.outstanding_amount)}</b></div><div>الحالة: <span class="beta54-pill">${esc(a.status)}</span></div><div>التاريخ: ${date(a.requested_on)}</div>${a.reason?`<div class="beta54-muted">${esc(a.reason)}</div>`:''}<div class="beta54-actions">${a.status==='draft'&&has('hr.advances.approve')?button('✅ اعتماد',`data-adv-approve="${a.id}"`)+button('❌ رفض',`data-adv-reject="${a.id}"`):''}${a.status==='approved'&&has('hr.advances.disburse')&&has('treasury.post')?button('💸 صرف',`data-adv-disburse="${a.id}"`,'primary'):''}</div></article>`).join('');
 setPage('advances',`<div class="beta54-toolbar">${add}<span class="beta54-muted">السلفة أصل موظف وتتحرك ماليًا من الخزنة عند الصرف؛ ليست مصروف تشغيل.</span></div><div class="beta54-grid">${cards||'<div class="beta54-card">لا توجد سلف.</div>'}</div>`);
 const page=document.querySelector('#page');
 page.querySelector('[data-add-advance]')?.addEventListener('click',()=>openAdvance(employees||[]));
 page.querySelectorAll('[data-adv-approve]').forEach(b=>b.onclick=async()=>{try{await rpc('hr_advance_decide_v1',{p_advance_id:Number(b.dataset.advApprove),p_approve:true,p_note:null});toast('تم اعتماد السلفة');await renderAdvances()}catch(e){toast(e.message)}});
 page.querySelectorAll('[data-adv-reject]').forEach(b=>b.onclick=async()=>{try{await rpc('hr_advance_decide_v1',{p_advance_id:Number(b.dataset.advReject),p_approve:false,p_note:null});toast('تم رفض السلفة');await renderAdvances()}catch(e){toast(e.message)}});
 page.querySelectorAll('[data-adv-disburse]').forEach(b=>b.onclick=()=>openDisburse(Number(b.dataset.advDisburse)));
}
function openAdvance(employees){
 const opts=employees.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('');
 const body=`<div class="beta54-form-grid"><label>الموظف<select data-f="employee">${opts}</select></label><label>المبلغ<input data-f="amount" type="number" min=".01" step=".01"></label><label>طريقة الاستقطاع<select data-f="mode"><option value="one_time">مرة واحدة</option><option value="installments">أقساط</option></select></label><label>قيمة القسط<input data-f="installment" type="number" min=".01" step=".01"></label><label>عدد الأقساط<input data-f="count" type="number" min="1" step="1"></label><label class="wide">السبب<input data-f="reason"></label><label class="wide">ملاحظات<textarea data-f="notes" rows="2"></textarea></label></div>`;
 modal('سلفة جديدة',body,async m=>{const mode=m.querySelector('[data-f="mode"]').value;await rpc('hr_advance_create_v1',{p_employee_id:Number(m.querySelector('[data-f="employee"]').value),p_amount:Number(m.querySelector('[data-f="amount"]').value),p_repayment_mode:mode,p_installment_amount:mode==='installments'?Number(m.querySelector('[data-f="installment"]').value):null,p_installments_count:mode==='installments'?Number(m.querySelector('[data-f="count"]').value):null,p_reason:m.querySelector('[data-f="reason"]').value,p_notes:m.querySelector('[data-f="notes"]').value,p_client_tx_id:tx('HR-ADV')});toast('تم إنشاء السلفة كمسودة');await renderAdvances()});
}
function openDisburse(id){
 const body=`<div class="beta54-form-grid"><label>طريقة الصرف<select data-f="method"><option value="cash">كاش</option><option value="wallet">محفظة</option><option value="instapay">InstaPay</option><option value="bank">تحويل بنكي</option></select></label><label>مرجع / رقم عملية<input data-f="ref"></label></div>`;
 modal('صرف السلفة',body,async m=>{await rpc('hr_advance_disburse_v1',{p_advance_id:id,p_method:m.querySelector('[data-f="method"]').value,p_reference:m.querySelector('[data-f="ref"]').value,p_shift_id:null,p_client_tx_id:tx('HR-ADV-PAY')});toast('تم صرف السلفة وتسجيل حركة الخزنة');await renderAdvances()},'صرف');
}
async function renderAdjustments(){
 if(!ensureAllowed('adjustments'))return;
 setPage('adjustments','<div class="beta54-muted">جاري التحميل…</div>');
 const [employees,rows]=await Promise.all([rest('hr_employees','select=id,name&active=eq.true&order=name'),rest('hr_employee_adjustments','select=id,employee_id,adjustment_type,amount,effective_date,status,reason,created_at&order=effective_date.desc,id.desc')]);
 const em=new Map((employees||[]).map(x=>[Number(x.id),x]));const add=has('hr.adjustments.manage')?button('➕ حركة جديدة','data-add-adjustment','primary'):'';
 const labels={deduction:'خصم',bonus:'مكافأة',overtime:'إضافي'};
 const rowsHtml=(rows||[]).map(r=>`<tr><td>${esc(em.get(Number(r.employee_id))?.name||'#'+r.employee_id)}</td><td>${esc(labels[r.adjustment_type]||r.adjustment_type)}</td><td>${money(r.amount)}</td><td>${date(r.effective_date)}</td><td>${esc(r.status)}</td><td>${esc(r.reason||'—')}</td></tr>`).join('');
 setPage('adjustments',`<div class="beta54-toolbar">${add}<span class="beta54-muted">الحركات Pending تدخل تلقائيًا في مسير المرتب الذي يغطي تاريخها.</span></div><div class="beta54-card beta54-table-wrap"><table class="beta54-table"><thead><tr><th>الموظف</th><th>النوع</th><th>القيمة</th><th>التاريخ</th><th>الحالة</th><th>السبب</th></tr></thead><tbody>${rowsHtml||'<tr><td colspan="6">لا توجد حركات.</td></tr>'}</tbody></table></div>`);
 document.querySelector('#page [data-add-adjustment]')?.addEventListener('click',()=>openAdjustment(employees||[]));
}
function openAdjustment(employees){
 const opts=employees.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('');
 const body=`<div class="beta54-form-grid"><label>الموظف<select data-f="employee">${opts}</select></label><label>النوع<select data-f="type"><option value="deduction">خصم</option><option value="bonus">مكافأة</option><option value="overtime">إضافي</option></select></label><label>القيمة<input data-f="amount" type="number" min=".01" step=".01"></label><label>التاريخ<input data-f="date" type="date" value="${new Date().toISOString().slice(0,10)}"></label><label class="wide">السبب<input data-f="reason"></label></div>`;
 modal('إضافة خصم / مكافأة / إضافي',body,async m=>{await rpc('hr_adjustment_create_v1',{p_employee_id:Number(m.querySelector('[data-f="employee"]').value),p_adjustment_type:m.querySelector('[data-f="type"]').value,p_amount:Number(m.querySelector('[data-f="amount"]').value),p_effective_date:m.querySelector('[data-f="date"]').value,p_reason:m.querySelector('[data-f="reason"]').value,p_client_tx_id:tx('HR-ADJ')});toast('تم تسجيل الحركة');await renderAdjustments()});
}
async function renderPayroll(){
 if(!ensureAllowed('payroll'))return;
 setPage('payroll','<div class="beta54-muted">جاري تحميل المرتبات…</div>');
 const [periods,items,employees]=await Promise.all([rest('hr_payroll_periods','select=id,branch_id,period_start,period_end,status,notes,approved_at,paid_at,created_at&order=period_end.desc,id.desc'),rest('hr_payroll_items','select=id,payroll_period_id,employee_id,base_amount,overtime_amount,bonus_amount,deduction_amount,advance_deduction,net_amount,notes&order=id'),rest('hr_employees','select=id,name&order=name')]);
 const em=new Map((employees||[]).map(x=>[Number(x.id),x]));const byP=new Map();for(const i of items||[]){const k=Number(i.payroll_period_id);if(!byP.has(k))byP.set(k,[]);byP.get(k).push(i)}
 const add=has('hr.payroll.run')?button('➕ مسير مرتب','data-run-payroll','primary'):'';
 const cards=(periods||[]).map(p=>{const its=byP.get(Number(p.id))||[];const total=its.reduce((s,i)=>s+Number(i.net_amount||0),0);return `<article class="beta54-card"><h3>${esc(p.period_start)} → ${esc(p.period_end)}</h3><div class="beta54-kpi">${money(total)}</div><div>${its.length} موظف • <span class="beta54-pill">${esc(p.status)}</span></div><div class="beta54-actions">${button('📄 التفاصيل',`data-payroll-details="${p.id}"`)}${p.status==='draft'&&has('hr.payroll.approve')?button('✅ اعتماد',`data-payroll-approve="${p.id}"`):''}${p.status==='approved'&&has('hr.payroll.pay')&&has('treasury.post')?button('💸 صرف',`data-payroll-pay="${p.id}"`,'primary'):''}</div></article>`}).join('');
 setPage('payroll',`<div class="beta54-toolbar">${add}<span class="beta54-muted">الصافي = أساسي + إضافي + مكافآت − خصومات − قسط السلفة.</span></div><div class="beta54-grid">${cards||'<div class="beta54-card">لا توجد مسيرات مرتبات.</div>'}</div>`);
 const page=document.querySelector('#page');
 page.querySelector('[data-run-payroll]')?.addEventListener('click',openPayrollRun);
 page.querySelectorAll('[data-payroll-details]').forEach(b=>b.onclick=()=>openPayrollDetails(Number(b.dataset.payrollDetails),byP.get(Number(b.dataset.payrollDetails))||[],em));
 page.querySelectorAll('[data-payroll-approve]').forEach(b=>b.onclick=async()=>{try{await rpc('hr_payroll_approve_v1',{p_payroll_period_id:Number(b.dataset.payrollApprove),p_note:null});toast('تم اعتماد مسير المرتبات');await renderPayroll()}catch(e){toast(e.message)}});
 page.querySelectorAll('[data-payroll-pay]').forEach(b=>b.onclick=()=>openPayrollPay(Number(b.dataset.payrollPay)));
}
function openPayrollRun(){
 const d=new Date(),start=new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10),end=new Date(d.getFullYear(),d.getMonth()+1,0).toISOString().slice(0,10);
 const body=`<div class="beta54-form-grid"><label>من<input data-f="start" type="date" value="${start}"></label><label>إلى<input data-f="end" type="date" value="${end}"></label><label class="wide">ملاحظات<input data-f="notes"></label></div>`;
 modal('إعداد مسير مرتبات',body,async m=>{const bid=branchId();if(!bid)throw new Error('اختر فرعًا أولًا');await rpc('hr_payroll_run_v1',{p_branch_id:bid,p_period_start:m.querySelector('[data-f="start"]').value,p_period_end:m.querySelector('[data-f="end"]').value,p_notes:m.querySelector('[data-f="notes"]').value,p_client_tx_id:tx('HR-PAYROLL')});toast('تم إعداد مسير المرتبات');await renderPayroll()},'إعداد');
}
function openPayrollDetails(id,items,em){
 const rows=items.map(i=>`<tr><td>${esc(em.get(Number(i.employee_id))?.name||'#'+i.employee_id)}</td><td>${money(i.base_amount)}</td><td>${money(i.overtime_amount)}</td><td>${money(i.bonus_amount)}</td><td>${money(i.deduction_amount)}</td><td>${money(i.advance_deduction)}</td><td><b>${money(i.net_amount)}</b></td></tr>`).join('');
 const body=`<div class="beta54-table-wrap"><table class="beta54-table"><thead><tr><th>الموظف</th><th>الأساسي</th><th>إضافي</th><th>مكافآت</th><th>خصومات</th><th>سلفة</th><th>الصافي</th></tr></thead><tbody>${rows||'<tr><td colspan="7">لا توجد بنود.</td></tr>'}</tbody></table></div>`;
 const m=modal(`تفاصيل مسير #${id}`,body,async()=>{},'إغلاق');m.querySelector('[data-save]').onclick=e=>{e.preventDefault();m.remove()};
}
function openPayrollPay(id){
 const body=`<div class="beta54-form-grid"><label>طريقة الصرف<select data-f="method"><option value="cash">كاش</option><option value="wallet">محفظة</option><option value="instapay">InstaPay</option><option value="bank">تحويل بنكي</option></select></label><label>مرجع العملية<input data-f="ref"></label></div>`;
 modal('صرف مسير المرتبات',body,async m=>{await rpc('hr_payroll_pay_v1',{p_payroll_period_id:id,p_method:m.querySelector('[data-f="method"]').value,p_reference:m.querySelector('[data-f="ref"]').value,p_shift_id:null,p_client_tx_id:tx('HR-PAY')});toast('تم صرف المرتبات وتسجيل حركات الخزنة');await renderPayroll()},'صرف');
}
async function renderTreasury(){
 if(!ensureAllowed('treasury'))return;
 setPage('treasury','<div class="beta54-muted">جاري تحميل الخزنة…</div>');
 const bid=branchId();const rows=await rest('treasury_movements',`select=id,branch_id,shift_id,direction,movement_type,amount,method,entity_type,entity_id,reference,notes,created_at&branch_id=eq.${bid}&order=created_at.desc,id.desc&limit=300`);
 const incoming=(rows||[]).filter(x=>x.direction==='in').reduce((s,x)=>s+Number(x.amount||0),0),out=(rows||[]).filter(x=>x.direction==='out').reduce((s,x)=>s+Number(x.amount||0),0);
 const add=has('treasury.post')?button('➕ حركة خزنة','data-add-treasury','primary'):'';
 const labels={cash_in:'إيداع/دخول',cash_out:'سحب/خروج',employee_advance:'سلفة موظف',payroll:'مرتبات',supplier_payment:'دفعة مورد',customer_collection:'تحصيل عميل',driver_settlement:'تسوية مندوب',merchant_settlement:'تسوية تاجر',transfer:'تحويل'};
 const trs=(rows||[]).map(r=>`<tr><td>${date(r.created_at)}</td><td>${esc(labels[r.movement_type]||r.movement_type)}</td><td>${r.direction==='in'?'داخل':'خارج'}</td><td>${money(r.amount)}</td><td>${esc(r.method)}</td><td>${esc(r.reference||'—')}</td><td>${esc(r.notes||'—')}</td></tr>`).join('');
 setPage('treasury',`<div class="beta54-toolbar">${add}</div><div class="beta54-grid" style="margin-bottom:12px"><div class="beta54-card"><div class="beta54-muted">إجمالي الداخل</div><div class="beta54-kpi">${money(incoming)}</div></div><div class="beta54-card"><div class="beta54-muted">إجمالي الخارج</div><div class="beta54-kpi">${money(out)}</div></div><div class="beta54-card"><div class="beta54-muted">صافي الحركة</div><div class="beta54-kpi">${money(incoming-out)}</div></div></div><div class="beta54-card beta54-table-wrap"><table class="beta54-table"><thead><tr><th>التاريخ</th><th>النوع</th><th>الاتجاه</th><th>القيمة</th><th>الطريقة</th><th>المرجع</th><th>ملاحظات</th></tr></thead><tbody>${trs||'<tr><td colspan="7">لا توجد حركات.</td></tr>'}</tbody></table></div>`);
 document.querySelector('#page [data-add-treasury]')?.addEventListener('click',openTreasuryPost);
}
function openTreasuryPost(){
 const body=`<div class="beta54-form-grid"><label>الاتجاه<select data-f="direction"><option value="in">دخول خزنة</option><option value="out">خروج خزنة</option></select></label><label>المبلغ<input data-f="amount" type="number" min=".01" step=".01"></label><label>الطريقة<select data-f="method"><option value="cash">كاش</option><option value="wallet">محفظة</option><option value="instapay">InstaPay</option><option value="bank">بنك</option></select></label><label>مرجع<input data-f="ref"></label><label class="wide">السبب / الملاحظات<input data-f="notes"></label></div><p class="beta54-muted">الحركات النظامية مثل السلف والمرتبات ودفعات الموردين تُنشأ من شاشتها الأصلية، وليس كحركة يدوية.</p>`;
 modal('حركة خزنة',body,async m=>{const bid=branchId();if(!bid)throw new Error('اختر فرعًا أولًا');await rpc('treasury_manual_post_v1',{p_branch_id:bid,p_direction:m.querySelector('[data-f="direction"]').value,p_amount:Number(m.querySelector('[data-f="amount"]').value),p_method:m.querySelector('[data-f="method"]').value,p_reference:m.querySelector('[data-f="ref"]').value,p_notes:m.querySelector('[data-f="notes"]').value,p_shift_id:null,p_client_tx_id:tx('TREASURY')});toast('تم تسجيل حركة الخزنة');await renderTreasury()});
}
async function render(key){try{if(key==='employees')return await renderEmployees();if(key==='advances')return await renderAdvances();if(key==='adjustments')return await renderAdjustments();if(key==='payroll')return await renderPayroll();if(key==='treasury')return await renderTreasury()}catch(err){toast(err?.message||String(err));setPage(key,`<div class="beta54-card">تعذر تحميل الصفحة: ${esc(err?.message||String(err))}</div>`)}}
function navHandler(e){const b=e.target.closest('button[data-beta54-page]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();render(b.dataset.beta54Page)}
async function heartbeat(){
 if(!appVisible())return;
 try{await refreshPermissions();if(currentPage&&!has(PAGE_DEF[currentPage]?.permission)){currentPage=null}}catch{}
}
function start(){
 if(started)return;started=true;injectStyle();
 const nav=document.querySelector('#nav');if(nav)nav.addEventListener('click',navHandler,true);
 syncNav();heartbeat();refreshTimer=setInterval(heartbeat,4000);
 global.__SharawlaBeta54SharedCore=Object.freeze({version:VERSION,refreshPermissions,render,permissionCodes:[...PERMISSION_CODES]});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
