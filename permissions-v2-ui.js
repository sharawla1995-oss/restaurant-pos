(function(global){
'use strict';
const VERSION='permissions-v2.1';
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const toast=m=>{try{return global.toast?.(m)}catch{};console.warn(m)};
async function rest(resource,query=''){if(typeof global.rest!=='function')throw new Error('REST غير جاهز');return global.rest(resource,query)}
async function rpc(name,payload){if(typeof global.rpc!=='function')throw new Error('RPC غير جاهز');return global.rpc(name,payload)}
function isUsersPage(){return String(document.querySelector('#pageTitle')?.textContent||'').includes('المستخدم')}
async function openPermissions(employeeId,employeeName){
 const [actions,overrides]=await Promise.all([
   rest('permission_actions_v2','select=code,name_ar,domain,legacy_permission,sort_order&active=eq.true&order=domain,sort_order,code'),
   rest('employee_action_permissions_v2',`select=action_code,allowed&employee_id=eq.${Number(employeeId)}`)
 ]);
 const map=new Map((overrides||[]).map(x=>[String(x.action_code),x.allowed===true?'allow':'deny']));
 const groups=new Map();for(const a of (actions||[])){const d=String(a.domain||'other');if(!groups.has(d))groups.set(d,[]);groups.get(d).push(a)}
 const modal=document.createElement('div');modal.className='modal';
 modal.innerHTML=`<div class="modal-card" style="max-width:760px"><h2>🔐 الصلاحيات المتقدمة — ${esc(employeeName)}</h2><p class="muted">توريث = استخدام صلاحيات النظام القديمة. سماح/منع هنا يتغلب على التوريث لهذا الإجراء فقط.</p><div style="max-height:60vh;overflow:auto">${[...groups.entries()].map(([d,rows])=>`<section style="margin:14px 0"><h3>${esc(d)}</h3>${rows.map(a=>`<label class="setting-switch" style="display:grid;grid-template-columns:1fr 160px;gap:10px"><span><b>${esc(a.name_ar)}</b><small style="display:block;direction:ltr">${esc(a.code)}</small></span><select data-action-code="${esc(a.code)}"><option value="inherit" ${!map.has(a.code)?'selected':''}>توريث</option><option value="allow" ${map.get(a.code)==='allow'?'selected':''}>سماح</option><option value="deny" ${map.get(a.code)==='deny'?'selected':''}>منع</option></select></label>`).join('')}</section>`).join('')}</div><div class="modal-actions"><button type="button" class="secondary" data-close>إلغاء</button><button type="button" class="primary" data-save>حفظ</button></div></div>`;
 document.body.appendChild(modal);
 modal.onclick=async e=>{
   if(e.target===modal||e.target.closest('[data-close]')){modal.remove();return}
   const save=e.target.closest('[data-save]');if(!save)return;
   save.disabled=true;
   try{
     const selects=[...modal.querySelectorAll('select[data-action-code]')];
     for(const s of selects){const code=s.dataset.actionCode,val=s.value,old=map.get(code)||'inherit';if(val===old)continue;if(val==='inherit')await rpc('admin_reset_employee_action_permission_v2',{p_employee_id:Number(employeeId),p_action_code:code});else await rpc('admin_set_employee_action_permission_v2',{p_employee_id:Number(employeeId),p_action_code:code,p_allowed:val==='allow'});}
     toast('تم حفظ الصلاحيات المتقدمة');modal.remove();
   }catch(err){toast(err?.message||String(err));save.disabled=false}
 };
}
function decorate(){
 if(!isUsersPage())return;
 document.querySelectorAll('[data-edit-user]').forEach(edit=>{
   const card=edit.closest('.user-card');if(!card)return;
   const id=edit.dataset.editUser;if(!id||card.querySelector(`[data-action-permissions="${id}"]`))return;
   const name=card.querySelector('.user-main b')?.textContent||`#${id}`;
   const b=document.createElement('button');b.type='button';b.className='secondary';b.dataset.actionPermissions=id;b.textContent='🔐 صلاحيات متقدمة';b.onclick=()=>openPermissions(id,name).catch(err=>toast(err?.message||String(err)));
   (card.querySelector('.row-actions')||card).appendChild(b);
 });
}
const observer=new MutationObserver(()=>queueMicrotask(decorate));
function start(){decorate();observer.observe(document.body,{childList:true,subtree:true});global.__SharawlaPermissionsV2=Object.freeze({version:VERSION,openPermissions})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
