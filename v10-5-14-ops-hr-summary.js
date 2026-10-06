(function(global){
'use strict';
const VERSION='10.5.14';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt=v=>v?new Date(v).toLocaleString('ar-EG'):'—';
const dateOnly=d=>d.toISOString().slice(0,10);
const tx=p=>`${p}-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
let perms={summary:false,financeView:false,financePay:false,adjustmentRequest:false},timer=null;

async function hasPermission(code){
 try{return (await global.rpc('has_permission',{p_permission:code}))===true}catch{return false}
}
function activeBranch(){try{return Number(global.currentBranchId())||0}catch{return 0}}
function setTitle(v){const t=$('#pageTitle');if(t)t.textContent=v}
function clearActiveNav(){$$('#nav button').forEach(b=>b.classList.remove('active'))}
function money(v){try{return global.money(v)}catch{return Number(v||0).toFixed(2)}}

async function refreshNotifications(){
 if(!navigator.onLine)return;
 try{
  const rows=await global.rest('app_notifications_v1','select=id,kind,title,body,entity_type,entity_id,action_page,read_at,created_at&order=created_at.desc&limit=100');
  const count=(rows||[]).filter(x=>!x.read_at).length,b=$('#v14NotificationBadge');
  if(b){b.textContent=String(count);b.classList.toggle('hidden',count===0)}
  global.__sharawlaV14Notifications=rows||[];
 }catch(e){console.warn('v14 notifications',e)}
}
async function markNotificationRead(id){
 try{await global.rest('app_notifications_v1',`id=eq.${Number(id)}`,{method:'PATCH',body:JSON.stringify({read_at:new Date().toISOString()})})}catch(e){console.warn(e)}
}
function navigateNotification(page){
 if(!page)return;
 if(page==='approvals')return global.showPage('approvals');
 if(page==='branch-hr-finance')return renderBranchFinance();
 if(page==='hr-advances')return $('#nav [data-beta54-page="advances"]')?.click();
 if(page==='hr-adjustments')return $('#nav [data-beta54-page="adjustments"]')?.click();
 if(page==='hr-payroll')return $('#nav [data-beta54-page="payroll"]')?.click();
 if(page==='hr-leave')return $('#nav [data-beta54-attendance-page="leave"]')?.click();
}
async function openNotifications(){
 await refreshNotifications();
 const rows=global.__sharawlaV14Notifications||[];
 const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card" style="width:min(720px,96vw)"><div class="section-head"><div><h2>🔔 الإشعارات</h2><p class="muted">طلبات الموافقة والقرارات والحركات التي تحتاج انتباهك.</p></div><button class="secondary" data-close>إغلاق</button></div><div class="notification-list">${rows.map(n=>`<button class="notification-row ${n.read_at?'':'unread'}" data-note="${n.id}" data-page="${esc(n.action_page||'')}"><b>${esc(n.title)}</b>${n.body?`<span>${esc(n.body)}</span>`:''}<small>${fmt(n.created_at)}</small></button>`).join('')||'<div class="empty">لا توجد إشعارات.</div>'}</div></div>`;document.body.appendChild(m);
 m.onclick=async e=>{if(e.target===m||e.target.closest('[data-close]'))return m.remove();const b=e.target.closest('[data-note]');if(!b)return;await markNotificationRead(b.dataset.note);m.remove();await refreshNotifications();navigateNotification(b.dataset.page)};
}
function injectBell(){
 if($('#v14NotificationBell'))return;
 const host=$('.branch-top-actions')||$('.topbar');
 if(!host)return;
 const b=document.createElement('button');b.id='v14NotificationBell';b.className='notification-bell';b.type='button';b.innerHTML='🔔<span id="v14NotificationBadge" class="notification-badge hidden">0</span>';b.title='الإشعارات';b.onclick=openNotifications;host.prepend(b);
}
function injectNav(){
 const nav=$('#nav');if(!nav)return;
 let summary=nav.querySelector('[data-v14-page="summary"]');
 if(perms.summary&&!summary){summary=document.createElement('button');summary.type='button';summary.dataset.v14Page='summary';summary.textContent='📈 الملخص';const anchor=nav.querySelector('button[data-page="reports"]');if(anchor)nav.insertBefore(summary,anchor);else nav.appendChild(summary)}
 if(summary)summary.classList.toggle('hidden',!perms.summary);
 let finance=nav.querySelector('[data-v14-page="finance"]');
 if(perms.financeView&&!finance){finance=document.createElement('button');finance.type='button';finance.dataset.v14Page='finance';finance.textContent='💵 صرف HR المعتمد';const anchor=nav.querySelector('button[data-page="settings"]');if(anchor)nav.insertBefore(finance,anchor);else nav.appendChild(finance)}
 if(finance)finance.classList.toggle('hidden',!perms.financeView);
 if(!nav.__v14Bound){nav.__v14Bound=true;nav.addEventListener('click',e=>{const b=e.target.closest('[data-v14-page]');if(!b)return;e.preventDefault();e.stopPropagation();if(b.dataset.v14Page==='summary')renderSummary();else renderBranchFinance()},true)}
}
function table(headers,rows){
 return `<div class="table-wrap"><table><thead><tr>${headers.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${headers.length}">لا توجد بيانات</td></tr>`}</tbody></table></div>`;
}
async function renderSummary(){
 clearActiveNav();$('#nav [data-v14-page="summary"]')?.classList.add('active');setTitle('الملخص');
 const d=dateOnly(new Date());
 $('#page').innerHTML=`<div class="panel"><div class="section-head"><div><h2>📈 الملخص V2</h2><p class="muted">مؤشرات تشغيلية مباشرة من البيانات الفعلية.</p></div></div><div class="toolbar"><label>من<input id="v14SummaryFrom" type="date" value="${d}"></label><label>إلى<input id="v14SummaryTo" type="date" value="${d}"></label><button class="secondary" id="v14SummaryToday">اليوم</button><button class="primary" id="v14SummaryRun">عرض</button></div><div id="v14SummaryOut"><div class="empty">جاري التحميل…</div></div></div>`;
 const run=async()=>{
  const out=$('#v14SummaryOut');out.innerHTML='<div class="empty">جاري التحميل…</div>';
  try{
   const from=$('#v14SummaryFrom').value,to=$('#v14SummaryTo').value,a=new Date(from+'T00:00:00'),b=new Date(to+'T00:00:00');b.setDate(b.getDate()+1);
   const data=await global.rpc('business_summary_v2',{p_branch_id:activeBranch(),p_from:a.toISOString(),p_to:b.toISOString()});
   const s=data?.summary||{},avg=Number(s.orders_count||0)?Number(s.sales_total||0)/Number(s.orders_count):0;
   const types=(data?.order_types||[]).map(x=>`<tr><td>${esc(global.orderTypeLabel?.(x.order_type)||x.order_type)}</td><td>${Number(x.orders||0)}</td><td>${money(x.sales)}</td></tr>`).join('');
   const pays=(data?.payments||[]).map(x=>`<tr><td>${esc(global.paymentLabel?.(x.method)||x.method)}</td><td>${Number(x.orders||0)}</td><td>${money(x.amount)}</td></tr>`).join('');
   const products=(data?.top_products||[]).map(x=>`<tr><td>${esc(x.product_name)}</td><td>${Number(x.qty||0)}</td><td>${money(x.sales)}</td></tr>`).join('');
   const hours=(data?.hourly||[]).map(x=>`<tr><td>${String(x.hour).padStart(2,'0')}:00</td><td>${Number(x.orders||0)}</td><td>${money(x.sales)}</td></tr>`).join('');
   out.innerHTML=`<div class="v14-summary-kpis"><div><small>صافي المبيعات</small><b>${money(s.net_sales)}</b></div><div><small>عدد الطلبات</small><b>${Number(s.orders_count||0)}</b></div><div><small>متوسط الأوردر</small><b>${money(avg)}</b></div><div><small>المرتجعات</small><b>${money(s.returns_total)}</b></div><div><small>المصروفات</small><b>${money(s.expenses_total)}</b></div><div><small>صافي الدخل التشغيلي</small><b>${money(s.net_income)}</b></div><div><small>إجمالي المبيعات</small><b>${money(s.sales_total)}</b></div><div><small>الفرع</small><b>${esc(global.branchName?.(activeBranch())||'الكل')}</b></div></div><div class="v14-summary-grid"><section class="panel"><h3>نوع الطلب</h3>${table(['النوع','الطلبات','المبيعات'],types)}</section><section class="panel"><h3>طرق الدفع</h3>${table(['الطريقة','الطلبات','القيمة'],pays)}</section><section class="panel"><h3>أفضل المنتجات</h3>${table(['الصنف','الكمية','المبيعات'],products)}</section><section class="panel"><h3>المبيعات بالساعة</h3>${table(['الساعة','الطلبات','المبيعات'],hours)}</section></div>`;
  }catch(e){out.innerHTML=`<div class="empty">${esc(e.message||String(e))}</div>`}
 };
 $('#v14SummaryRun').onclick=run;$('#v14SummaryToday').onclick=()=>{$('#v14SummaryFrom').value=d;$('#v14SummaryTo').value=d;run()};await run();
}
async function promptPayment(title){
 return new Promise(resolve=>{
  const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>${esc(title)}</h2><label>طريقة الدفع<select data-method><option value="cash">كاش</option><option value="wallet">محفظة</option><option value="instapay">InstaPay</option><option value="bank">تحويل بنكي</option></select></label><label>مرجع / رقم عملية<input data-ref></label><div class="modal-actions"><button class="secondary" data-cancel>إلغاء</button><button class="primary" data-ok>تأكيد الصرف</button></div></div>`;document.body.appendChild(m);
  m.onclick=e=>{if(e.target===m||e.target.closest('[data-cancel]')){m.remove();resolve(null)}if(e.target.closest('[data-ok]')){const v={method:m.querySelector('[data-method]').value,reference:m.querySelector('[data-ref]').value.trim()||null};m.remove();resolve(v)}};
 });
}
async function openAdjustmentRequest(){
 try{
  const employees=await global.rpc('branch_hr_staff_list_v1',{p_branch_id:activeBranch()});
  if(!(employees||[]).length)return global.toast('لا يوجد موظفون في الفرع');
  const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>➕ طلب جزاء / مكافأة</h2><label>الموظف<select data-emp>${employees.map(e=>`<option value="${e.id}">${esc(e.name)}${e.job_title?' — '+esc(e.job_title):''}</option>`).join('')}</select></label><label>النوع<select data-type><option value="deduction">جزاء / خصم</option><option value="bonus">مكافأة</option><option value="overtime">إضافي</option></select></label><label>القيمة<input data-amount type="number" min=".01" step=".01"></label><label>التاريخ<input data-date type="date" value="${dateOnly(new Date())}"></label><label>السبب<input data-reason></label><div class="modal-actions"><button class="secondary" data-cancel>إلغاء</button><button class="primary" data-ok>إرسال إلى HR</button></div></div>`;document.body.appendChild(m);
  m.onclick=async e=>{if(e.target===m||e.target.closest('[data-cancel]'))return m.remove();if(!e.target.closest('[data-ok]'))return;const b=e.target.closest('[data-ok]');b.disabled=true;try{await global.rpc('hr_adjustment_create_v1',{p_employee_id:Number(m.querySelector('[data-emp]').value),p_adjustment_type:m.querySelector('[data-type]').value,p_amount:Number(m.querySelector('[data-amount]').value),p_effective_date:m.querySelector('[data-date]').value,p_reason:m.querySelector('[data-reason]').value,p_client_tx_id:tx('BR-HR-ADJ')});m.remove();global.toast('تم إرسال الطلب إلى HR للمراجعة');await refreshNotifications()}catch(err){b.disabled=false;global.toast(err.message)}};
 }catch(e){global.toast(e.message)}
}
async function renderBranchFinance(){
 clearActiveNav();$('#nav [data-v14-page="finance"]')?.classList.add('active');setTitle('صرف HR المعتمد');
 $('#page').innerHTML='<div class="panel"><h2>💵 صرف مستحقات HR المعتمدة</h2><div class="empty">جاري التحميل…</div></div>';
 try{
  const data=await global.rpc('branch_hr_finance_queue_v1',{p_branch_id:activeBranch()}),adv=data?.advances||[],pay=data?.payrolls||[];
  $('#page').innerHTML=`<div class="panel"><div class="section-head"><div><h2>💵 مستحقات HR المعتمدة — ${esc(global.branchName?.(activeBranch())||'الفرع')}</h2><p class="muted">HR يعتمد فقط؛ الصرف الفعلي يتم من الفرع ويُسجل في الخزنة وAudit.</p></div>${perms.adjustmentRequest?'<button id="v14AdjustmentRequest" class="secondary">➕ طلب جزاء / مكافأة</button>':''}</div></div><div class="v14-summary-grid"><section class="panel"><h3>سلف في انتظار الصرف</h3>${adv.map(a=>`<div class="manage-row"><span><b>${esc(a.employee_name)}</b><small>${money(a.amount)} • ${esc(a.reason||'بدون سبب')}</small></span>${perms.financePay?`<button class="primary" data-pay-advance="${a.id}">صرف</button>`:'<span class="tag">عرض فقط</span>'}</div>`).join('')||'<div class="empty">لا توجد سلف معتمدة في الانتظار.</div>'}</section><section class="panel"><h3>مرتبات معتمدة في انتظار الصرف</h3>${pay.map(p=>`<div class="manage-row"><span><b>${esc(p.period_start)} → ${esc(p.period_end)}</b><small>${Number(p.employees_count||0)} موظف • ${money(p.total)}</small></span>${perms.financePay?`<button class="primary" data-pay-payroll="${p.id}">صرف المسير</button>`:'<span class="tag">عرض فقط</span>'}</div>`).join('')||'<div class="empty">لا توجد مرتبات معتمدة في الانتظار.</div>'}</section></div>`;
  $('#v14AdjustmentRequest')?.addEventListener('click',openAdjustmentRequest);
  $$('#page [data-pay-advance]').forEach(b=>b.onclick=async()=>{const p=await promptPayment('صرف السلفة المعتمدة');if(!p)return;try{await global.rpc('hr_advance_disburse_v1',{p_advance_id:Number(b.dataset.payAdvance),p_method:p.method,p_reference:p.reference,p_shift_id:null,p_client_tx_id:tx('BR-HR-ADV-PAY')});global.toast('تم صرف السلفة وتسجيل حركة الخزنة');await renderBranchFinance()}catch(e){global.toast(e.message)}});
  $$('#page [data-pay-payroll]').forEach(b=>b.onclick=async()=>{const p=await promptPayment('صرف مسير المرتبات المعتمد');if(!p)return;try{await global.rpc('hr_payroll_pay_attendance_v1',{p_payroll_period_id:Number(b.dataset.payPayroll),p_method:p.method,p_reference:p.reference,p_shift_id:null,p_client_tx_id:tx('BR-HR-PAYROLL')});global.toast('تم صرف المرتبات وتسجيل الحركات');await renderBranchFinance()}catch(e){global.toast(e.message)}});
 }catch(e){$('#page').innerHTML=`<div class="panel"><h2>💵 صرف HR المعتمد</h2><div class="empty">${esc(e.message||String(e))}</div></div>`}
}
async function syncContext(){
 if(!global.rpc||!global.rest)return;
 injectBell();
 if($('#appView')?.classList.contains('hidden')||!activeBranch())return;
 const [summary,financeView,financePay,adjustmentRequest]=await Promise.all([hasPermission('reports'),hasPermission('branch.hr.finance.view'),hasPermission('branch.hr.finance.disburse'),hasPermission('branch.hr.adjustments.request')]);
 perms={summary,financeView,financePay,adjustmentRequest};injectNav();await refreshNotifications();
}
async function init(){
 await syncContext();
 clearInterval(timer);timer=setInterval(syncContext,10000);
}
addEventListener('focus',syncContext);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncContext()});
setTimeout(init,900);
global.SharawlaV14={renderSummary,renderBranchFinance,refreshNotifications,version:VERSION};
})(globalThis);
