(function(global){
'use strict';

// Sharawla Offline Engine V2 — Phase 5 diagnostics surface.
// Active takeover only. Legacy mode remains byte-for-byte on the Beta43 center.
const VERSION='10.5.4-beta.45-dev-phase5-diagnostics';
const LEGACY_PRESERVED='OFFLINE_V2_LEGACY_PRESERVED';
let refreshing=false,timer=null,activeCached=false;

function text(v){return String(v??'').trim()}
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function fmt(v){try{return new Date(v).toLocaleString('ar-EG')}catch{return text(v)||'—'}}
function api(){return global.topBurgerDesktop?.offlineV2||null}
async function active(){
  try{
    const s=await api()?.takeoverState?.();
    activeCached=s?.active===true&&s?.migration_verified===true&&s?.transport_ready===true;
    return activeCached;
  }catch{activeCached=false;return false}
}
function statusLabel(s){return ({pending:'في الانتظار',syncing:'جاري المزامنة',retryable:'إعادة محاولة تلقائية',blocked:'معلّقة',conflict:'تعارض يحتاج مراجعة',dead_letter:'تحتاج تدخل يدوي',synced:'تمت المزامنة'}[text(s)]||text(s)||'—')}
function typeLabel(t){return ({shift_open:'فتح وردية',shift_close:'قفل وردية',sale:'بيع',expense:'مصروف',return:'مرتجع',customer_create:'عميل',inventory_movement:'حركة مخزون',order_status:'حالة أوردر'}[text(t)]||text(t)||'—')}
function retryAllowed(r){return ['retryable','blocked','conflict','dead_letter'].includes(text(r?.status))&&text(r?.last_error_code)!==LEGACY_PRESERVED}

async function model(){
  const a=api();if(!a?.outbox)return {v2:[],legacy:[]};
  const all=(await a.outbox())||[];
  const v2=all.filter(r=>text(r.status)!=='synced'&&text(r.last_error_code)!==LEGACY_PRESERVED);
  let legacy=[];try{legacy=typeof offlineQueue==='function'?(await offlineQueue())||[]:[]}catch{}
  return {v2,legacy};
}
function countModel(m){return m.v2.length+m.legacy.length}
function ensureBadge(){let el=document.getElementById('pendingSyncBadge');if(!el){el=document.createElement('button');el.type='button';el.id='pendingSyncBadge';el.className='pending-sync-badge';document.body.appendChild(el)}return el}
async function refresh(){
  if(refreshing)return false;
  const isActive=await active();if(!isActive)return false;
  refreshing=true;
  try{
    const m=await model(),n=countModel(m),el=ensureBadge();
    el.textContent=n?`⟳ ${n} معلّقة`:'✓ متزامن';
    el.title=n?`${n} حركة تحتاج مزامنة أو مراجعة — اضغط للتفاصيل`:'كل الحركات متزامنة';
    el.classList.toggle('has-pending',n>0);el.classList.toggle('all-synced',n===0);el.classList.toggle('is-hidden',n===0);
    el.dataset.offlineV2Diagnostics='1';
    if(n>0)el.classList.remove('is-hidden');
    return true;
  }finally{refreshing=false}
}

function v2Card(r){
  const error=text(r.last_error_message||r.envelope?.last_error_message)||'لا يوجد خطأ مسجل';
  const code=text(r.last_error_code||r.envelope?.last_error_code);
  return `<div class="ov2-sync-card" data-v2-tx="${esc(r.client_tx_id)}"><div class="ov2-sync-head"><b>${esc(typeLabel(r.operation_type))}</b><span>${esc(statusLabel(r.status))}</span></div><small>${esc(fmt(r.created_local_at||r.created_at))}</small><div class="ov2-sync-error">${esc(error)}</div>${code?`<small dir="ltr">${esc(code)}</small>`:''}<small dir="ltr">TX: ${esc(r.client_tx_id)}</small>${retryAllowed(r)?'<button type="button" class="secondary" data-v2-retry>إعادة محاولة آمنة</button>':''}</div>`;
}
function legacyCard(j){
  const error=text(j?._sync?.last_error)||'في انتظار المزامنة بالنظام القديم';
  return `<div class="ov2-sync-card legacy"><div class="ov2-sync-head"><b>${esc(typeLabel(j.type))}</b><span>Legacy محفوظة</span></div><small>${esc(fmt(j.created_at))}</small><div class="ov2-sync-error">${esc(error)}</div><small dir="ltr">TX: ${esc(j.client_tx_id)}</small></div>`;
}
async function openCenter(){
  if(!(await active()))return false;
  document.querySelector('[data-offline-v2-center]')?.remove();
  const mdata=await model(),m=document.createElement('div');m.className='modal';m.dataset.offlineV2Center='1';
  const body=[...mdata.v2.map(v2Card),...mdata.legacy.map(legacyCard)].join('');
  m.innerHTML=`<div class="modal-card ov2-sync-modal"><div class="section-head"><div><h2>⟳ مركز المزامنة</h2><p class="muted">الحركة لا تُحذف بسبب خطأ. التعارض وDead Letter يظلان محفوظين حتى المراجعة.</p></div></div><div class="ov2-sync-list">${body||'<div class="empty">كل الحركات متزامنة</div>'}</div><div class="modal-actions"><button type="button" class="secondary" data-v2-close>إغلاق</button>${mdata.legacy.length?'<button type="button" class="secondary" data-legacy-retry>إعادة محاولة Legacy</button>':''}<button type="button" class="primary" data-v2-sync>مزامنة الآن</button></div></div>`;
  document.body.appendChild(m);
  m.onclick=async e=>{
    if(e.target===m||e.target.closest('[data-v2-close]'))return m.remove();
    const retry=e.target.closest('[data-v2-retry]');
    if(retry){const card=retry.closest('[data-v2-tx]'),tx=text(card?.dataset.v2Tx);retry.disabled=true;try{await global.SharawlaOfflineV2Transport?.manualRetry?.(tx)}catch(err){try{toast(err.message)}catch{}}m.remove();await openCenter();await refresh();return}
    if(e.target.closest('[data-v2-sync]')){e.target.closest('[data-v2-sync]').disabled=true;try{await global.SharawlaOfflineV2Transport?.syncNow?.()}catch(err){try{toast(err.message)}catch{}}m.remove();await openCenter();await refresh();return}
    if(e.target.closest('[data-legacy-retry]')){e.target.closest('[data-legacy-retry]').disabled=true;try{if(typeof syncOfflineQueue==='function')await syncOfflineQueue()}catch(err){try{toast(err.message)}catch{}}m.remove();await openCenter();await refresh()}
  };
  return true;
}

// Capture synchronously. Do not await takeoverState before stopping the event:
// Beta43 may own an onclick on the same badge and would otherwise win the race.
document.addEventListener('click',e=>{
  const badge=e.target?.closest?.('#pendingSyncBadge');if(!badge||!activeCached)return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  openCenter().catch(err=>{try{toast(err.message)}catch{}});
},true);

function start(){
  active().then(()=>refresh()).catch(()=>{});
  timer=setInterval(()=>refresh().catch(()=>{}),1500);
  global.addEventListener('online',()=>setTimeout(()=>refresh().catch(()=>{}),250));
  global.SharawlaOfflineV2Diagnostics=Object.freeze({version:VERSION,refresh,openCenter,model,statusLabel,typeLabel,isActiveCached:()=>activeCached});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
