(function(global){
'use strict';

// PV2-D SOURCE CANDIDATE ONLY.
// Do not wire this file into beta36-integration-loader.js until PV2-A/B/C/D
// are deployed together to the isolated Beta backend.
const VERSION='permissions-v2.2-pv2d-source';
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const toast=m=>{try{return global.toast?.(m)}catch{};console.warn(m)};
async function rest(resource,query=''){if(typeof global.rest!=='function')throw new Error('REST غير جاهز');return global.rest(resource,query)}
async function rpc(name,payload){if(typeof global.rpc!=='function')throw new Error('RPC غير جاهز');return global.rpc(name,payload)}
function isUsersPage(){return String(document.querySelector('#pageTitle')?.textContent||'').includes('المستخدم')}
function normalizeRows(v){return Array.isArray(v)?v:(Array.isArray(v?.data)?v.data:[])}
function inheritanceText(mode){
  return mode==='role_default'
    ? 'توريث = استخدام الإعداد الافتراضي لدور الموظف.'
    : 'توريث = استخدام صلاحيات النظام القديمة مؤقتًا لحين تفعيل إعدادات الأدوار.';
}
async function openPermissions(employeeId,employeeName){
 const id=Number(employeeId);
 if(!Number.isFinite(id)||id<=0)throw new Error('معرّف المستخدم غير صالح');

 const [catalogRaw,overridesRaw]=await Promise.all([
   rpc('admin_list_permission_actions_v2',{p_employee_id:id}),
   rest('employee_action_permissions_v2',`select=action_code,allowed&employee_id=eq.${id}`)
 ]);
 const actions=normalizeRows(catalogRaw);
 const overrides=normalizeRows(overridesRaw);
 const map=new Map(overrides.map(x=>[String(x.action_code),x.allowed===true?'allow':'deny']));
 const profile=String(actions[0]?.profile_code||'');
 const inheritanceMode=String(actions[0]?.inheritance_mode||'legacy_transition');
 const groups=new Map();
 for(const a of actions){
   const d=String(a.domain||'other');
   if(!groups.has(d))groups.set(d,[]);
   groups.get(d).push(a);
 }

 const modal=document.createElement('div');modal.className='modal';
 const empty=actions.length===0
   ? '<div class="empty-state">لا توجد صلاحيات متاحة لهذا النشاط والخصائص المفعّلة حاليًا.</div>'
   : [...groups.entries()].map(([d,rows])=>`<section style="margin:14px 0"><h3>${esc(d)}</h3>${rows.map(a=>`<label class="setting-switch" style="display:grid;grid-template-columns:1fr 160px;gap:10px"><span><b>${esc(a.name_ar)}</b><small style="display:block;direction:ltr">${esc(a.code)}</small></span><select data-action-code="${esc(a.code)}"><option value="inherit" ${!map.has(a.code)?'selected':''}>توريث</option><option value="allow" ${map.get(a.code)==='allow'?'selected':''}>سماح</option><option value="deny" ${map.get(a.code)==='deny'?'selected':''}>منع</option></select></label>`).join('')}</section>`).join('');

 modal.innerHTML=`<div class="modal-card" style="max-width:760px"><h2>🔐 الصلاحيات المتقدمة — ${esc(employeeName)}</h2><p class="muted">${esc(inheritanceText(inheritanceMode))}${profile?` النشاط الحالي: ${esc(profile)}.`:''} لا تظهر هنا إلا الإجراءات المسموحة للنشاط والخصائص المفعّلة.</p><div style="max-height:60vh;overflow:auto">${empty}</div><div class="modal-actions"><button type="button" class="secondary" data-close>إلغاء</button><button type="button" class="primary" data-save ${actions.length?'':'disabled'}>حفظ</button></div></div>`;
 document.body.appendChild(modal);

 modal.onclick=async e=>{
   if(e.target===modal||e.target.closest('[data-close]')){modal.remove();return}
   const save=e.target.closest('[data-save]');if(!save||save.disabled)return;
   save.disabled=true;
   try{
     const selects=[...modal.querySelectorAll('select[data-action-code]')];
     for(const s of selects){
       const code=s.dataset.actionCode,val=s.value,old=map.get(code)||'inherit';
       if(val===old)continue;
       if(val==='inherit'){
         await rpc('admin_reset_employee_action_permission_v2',{p_employee_id:id,p_action_code:code});
       }else{
         await rpc('admin_set_employee_action_permission_v2',{p_employee_id:id,p_action_code:code,p_allowed:val==='allow'});
       }
     }
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
function start(){decorate();observer.observe(document.body,{childList:true,subtree:true});global.__SharawlaPermissionsV2PV2D=Object.freeze({version:VERSION,openPermissions})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
