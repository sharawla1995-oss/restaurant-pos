(function(global){
'use strict';
const VERSION='dfr02-customer-timeline-v1';
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money=v=>Number(v||0).toFixed(2);
const rpc=(n,p)=>global.rpc(n,p);
const branch=()=>Number(global.currentBranchId?.()||0);
const toast=m=>{try{return global.toast?.(m)}catch{};console.warn(m)};
const today=()=>new Date().toISOString().slice(0,10);
const monthStart=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`};
const isoStart=v=>new Date(`${v}T00:00:00`).toISOString();
const isoEnd=v=>{const d=new Date(`${v}T00:00:00`);d.setDate(d.getDate()+1);return d.toISOString()};
function methodLabel(v){return ({cash:'كاش',wallet:'محفظة',instapay:'إنستا باي'})[v]||v}
function paymentText(obj){const x=obj&&typeof obj==='object'?obj:{};const rows=Object.entries(x);return rows.length?rows.map(([k,v])=>`${methodLabel(k)} ${money(v)}`).join(' • '):'—'}
function inject(){
 const body=document.querySelector('#customersBody');if(!body)return;
 body.querySelectorAll('[data-edit-customer]').forEach(edit=>{
   const id=String(edit.dataset.editCustomer||'');if(!id)return;
   const actions=edit.closest('.row-actions')||edit.parentElement;if(!actions||actions.querySelector(`[data-customer-file="${id}"]`))return;
   const b=document.createElement('button');b.className='secondary';b.dataset.customerFile=id;b.textContent='📁 ملف العميل';actions.appendChild(b);
 });
}
async function open(customerId,label){
 if(navigator.onLine===false)return toast('ملف العميل يحتاج اتصالًا بالإنترنت لأنه سجل Cloud للقراءة فقط');
 const m=document.createElement('div');m.className='modal';
 m.innerHTML=`<div class="modal-card" style="width:min(1050px,96vw);max-height:94vh;overflow:auto"><div class="section-head"><div><h2>📁 ملف العميل — ${esc(label||('#'+customerId))}</h2><p class="muted">سجل مبيعات تشغيلي — ليس كشف حساب مالي</p></div><button class="secondary" data-close>إغلاق</button></div><div class="form-grid"><label>من<input type="date" data-from value="${monthStart()}"></label><label>إلى<input type="date" data-to value="${today()}"></label><label>&nbsp;<button class="primary" data-run>عرض</button></label></div><div data-out style="margin-top:12px"></div></div>`;
 document.body.appendChild(m);
 const run=async()=>{const f=m.querySelector('[data-from]').value,t=m.querySelector('[data-to]').value,out=m.querySelector('[data-out]');if(!f||!t)return toast('اختر الفترة');out.innerHTML='<div class="empty">جاري التحميل…</div>';try{const rows=await rpc('customer_timeline_v1',{p_branch_id:branch(),p_customer_id:Number(customerId),p_from:isoStart(f),p_to:isoEnd(t),p_limit:500});const sales=(rows||[]).filter(x=>x.event_type==='sale'),rets=(rows||[]).filter(x=>x.event_type==='return');const saleValue=sales.reduce((a,x)=>a+Number(x.amount||0),0),returnValue=rets.reduce((a,x)=>a+Number(x.amount||0),0);out.innerHTML=`<div class="home-grid"><div class="panel"><small>فواتير</small><h3>${sales.length}</h3></div><div class="panel"><small>إجمالي بيع تشغيلي</small><h3>${money(saleValue)}</h3></div><div class="panel"><small>مرتجعات</small><h3>${money(returnValue)}</h3></div><div class="panel"><small>صافي مبيعات تشغيلي</small><h3>${money(saleValue-returnValue)}</h3></div></div><div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>النوع</th><th>المستند</th><th>القيمة</th><th>الدفع/الاسترداد</th><th>الموظف</th></tr></thead><tbody>${(rows||[]).map(x=>`<tr><td>${esc(new Date(x.event_at).toLocaleString('ar-EG'))}</td><td>${x.event_type==='sale'?'بيع':'مرتجع'}</td><td>${esc(x.document_no)}</td><td>${money(x.amount)}</td><td>${esc(paymentText(x.payment_breakdown))}</td><td>${esc(x.employee_name||'—')}</td></tr>`).join('')||'<tr><td colspan="6">لا توجد حركة في الفترة</td></tr>'}</tbody></table></div>`}catch(e){out.innerHTML=`<div class="empty">${esc(e.message||e)}</div>`}};
 m.onclick=e=>{if(e.target===m||e.target.closest('[data-close]'))m.remove();else if(e.target.closest('[data-run]'))run()};run();
}
function click(e){const b=e.target.closest('[data-customer-file]');if(!b)return;const tr=b.closest('tr');open(b.dataset.customerFile,tr?.querySelector('td')?.textContent?.trim()||'')}
function start(){document.addEventListener('click',click);const o=new MutationObserver(inject);o.observe(document.body,{childList:true,subtree:true});inject();global.__SharawlaDFR02CustomerTimeline=Object.freeze({version:VERSION,open})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);