(function(global){
'use strict';
const VERSION='10.5.4-beta.58.33';
let observer=null,permissionCache=new Map(),injecting=false;
const $=(s,r=document)=>r.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toast=m=>{try{return global.toast?.(m)}catch{};console.log(m)};
async function allowed(code){
 if(permissionCache.has(code))return permissionCache.get(code);
 if(typeof global.rpc!=='function')return false;
 try{const v=await global.rpc('has_action_permission_v2',{p_action_code:code});const ok=v===true;permissionCache.set(code,ok);return ok}catch(e){console.warn('[SharedCore] permission check failed',code,e?.message||e);return false}
}
function isCustomersPage(){return String($('#pageTitle')?.textContent||'').trim()==='العملاء'&&!!$('#customersBody')}
function openNewCustomer(){
 if($('#sharedNewCustomerModal'))return;
 const m=document.createElement('div');m.id='sharedNewCustomerModal';m.className='modal';
 m.innerHTML=`<form class="modal-card" id="sharedNewCustomerForm"><h2>➕ عميل جديد</h2><div class="form-grid"><label>اسم العميل<input id="scName" required></label><label>رقم الموبايل<input id="scPhone" inputmode="tel" placeholder="01xxxxxxxxx"></label><label>المنطقة<input id="scArea"></label><label>العنوان<input id="scAddress"></label></div><label>ملاحظات<textarea id="scNotes" rows="3"></textarea></label><div class="modal-actions"><button type="button" class="secondary" data-close>إلغاء</button><button type="submit" class="primary">حفظ العميل</button></div></form>`;
 document.body.appendChild(m);
 m.addEventListener('click',e=>{if(e.target===m||e.target.closest('[data-close]'))m.remove()});
 $('#sharedNewCustomerForm',m).onsubmit=async e=>{
  e.preventDefault();const save=e.submitter||m.querySelector('button[type="submit"]');save.disabled=true;
  try{
   const name=$('#scName',m).value.trim(),phone=$('#scPhone',m).value.trim(),area=$('#scArea',m).value.trim(),address=$('#scAddress',m).value.trim(),notes=$('#scNotes',m).value.trim();
   if(!name)throw new Error('اسم العميل مطلوب');
   const id=await global.rpc('customer_create_v2',{p_name:name,p_phone:phone||null,p_area:area||null,p_address:address||null,p_notes:notes||null});
   m.remove();toast(`تم إضافة العميل #${id}`);
   if(typeof global.renderCustomers==='function')await global.renderCustomers();else if(typeof global.showPage==='function')await global.showPage('customers');
  }catch(err){save.disabled=false;toast(err?.message||String(err))}
 };
 setTimeout(()=>$('#scName',m)?.focus(),0);
}
async function injectCustomerAction(){
 if(injecting||!isCustomersPage())return;
 const toolbar=$('#page .toolbar');if(!toolbar||$('#newCustomerBtn'))return;
 injecting=true;
 try{
  if(!await allowed('customers.create'))return;
  if(!isCustomersPage()||$('#newCustomerBtn'))return;
  const b=document.createElement('button');b.id='newCustomerBtn';b.type='button';b.className='primary';b.textContent='➕ عميل جديد';b.onclick=openNewCustomer;
  const importBtn=$('#importCustomers');if(importBtn)toolbar.insertBefore(b,importBtn);else toolbar.appendChild(b);
 }finally{injecting=false}
}
function schedule(){queueMicrotask(()=>injectCustomerAction().catch(e=>console.warn('[SharedCore] inject',e)))}
function start(){
 schedule();observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true,characterData:true});
 global.addEventListener?.('sharawla-session-changed',()=>permissionCache.clear());
 global.__SharawlaSharedBusinessCoreV1=Object.freeze({version:VERSION,refresh:schedule,clearPermissionCache:()=>permissionCache.clear()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
