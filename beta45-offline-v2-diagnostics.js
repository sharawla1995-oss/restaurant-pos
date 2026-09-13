(function(global){
'use strict';

// Sharawla Offline Engine V2 — Phase 9 diagnostics + support bundle.
// Active takeover only. Legacy mode remains owned by the Beta43 center.
const VERSION='10.5.4-beta.51';
const LEGACY_PRESERVED='OFFLINE_V2_LEGACY_PRESERVED';
const STATUS_ORDER=['pending','syncing','retryable','blocked','conflict','dead_letter'];
let refreshing=false,timer=null,activeCached=false;

function text(v){return String(v??'').trim()}
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function fmt(v){try{return new Date(v).toLocaleString('ar-EG')}catch{return text(v)||'—'}}
function api(){return global.topBurgerDesktop?.offlineV2||null}
function counts(rows){const out={};for(const r of rows||[])out[text(r.status)||'unknown']=(out[text(r.status)||'unknown']||0)+1;return out}
function statusLabel(s){return ({pending:'في الانتظار',syncing:'جاري المزامنة',retryable:'إعادة محاولة تلقائية',blocked:'معلّقة',conflict:'تعارض يحتاج مراجعة',dead_letter:'تحتاج تدخل يدوي',synced:'تمت المزامنة'}[text(s)]||text(s)||'—')}
function typeLabel(t){return ({shift_open:'فتح وردية',shift_close:'قفل وردية',sale:'بيع',expense:'مصروف',return:'مرتجع',customer_create:'عميل',inventory_movement:'حركة مخزون',order_status:'حالة أوردر'}[text(t)]||text(t)||'—')}
function retryAllowed(r){return ['retryable','blocked','conflict','dead_letter'].includes(text(r?.status))&&text(r?.last_error_code)!==LEGACY_PRESERVED}
function safeName(v){return text(v).replace(/[^0-9A-Za-z._-]/g,'-')||'unknown'}

async function active(){
  try{
    const s=await api()?.takeoverState?.();
    activeCached=s?.active===true&&s?.migration_verified===true&&s?.transport_ready===true;
    return activeCached;
  }catch{activeCached=false;return false}
}

async function model(){
  const a=api();if(!a?.outbox)return {v2:[],legacy:[],counts:{}};
  const all=(await a.outbox())||[];
  const v2=all.filter(r=>text(r.status)!=='synced'&&text(r.last_error_code)!==LEGACY_PRESERVED);
  let legacy=[];try{legacy=typeof offlineQueue==='function'?(await offlineQueue())||[]:[]}catch{}
  return {v2,legacy,counts:counts(v2)};
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
  return `<div class="ov2-sync-card" data-v2-tx="${esc(r.client_tx_id)}"><div class="ov2-sync-head"><b>${esc(typeLabel(r.operation_type))}</b><span>${esc(statusLabel(r.status))}</span></div><small>Seq ${esc(r.device_sequence)} • ${esc(fmt(r.created_local_at||r.created_at))}</small><div class="ov2-sync-error">${esc(error)}</div>${code?`<small dir="ltr">${esc(code)}</small>`:''}<small dir="ltr">TX: ${esc(r.client_tx_id)}</small>${retryAllowed(r)?'<button type="button" class="secondary" data-v2-retry>إعادة محاولة آمنة</button>':''}</div>`;
}
function legacyCard(j){
  const error=text(j?._sync?.last_error)||'في انتظار المزامنة بالنظام القديم';
  return `<div class="ov2-sync-card legacy"><div class="ov2-sync-head"><b>${esc(typeLabel(j.type))}</b><span>Legacy محفوظة</span></div><small>${esc(fmt(j.created_at))}</small><div class="ov2-sync-error">${esc(error)}</div><small dir="ltr">TX: ${esc(j.client_tx_id)}</small></div>`;
}
function groupedBody(m){
  const parts=[];
  for(const status of STATUS_ORDER){
    const rows=m.v2.filter(x=>text(x.status)===status);if(!rows.length)continue;
    parts.push(`<div class="ov2-sync-group"><h3>${esc(statusLabel(status))} <small>(${rows.length})</small></h3>${rows.map(v2Card).join('')}</div>`);
  }
  const other=m.v2.filter(x=>!STATUS_ORDER.includes(text(x.status)));if(other.length)parts.push(`<div class="ov2-sync-group"><h3>حالات أخرى (${other.length})</h3>${other.map(v2Card).join('')}</div>`);
  if(m.legacy.length)parts.push(`<div class="ov2-sync-group"><h3>Legacy محفوظة (${m.legacy.length})</h3>${m.legacy.map(legacyCard).join('')}</div>`);
  return parts.join('');
}

async function supportBundle(){
  const a=api();
  const [info,health,stats,guard,recovery,startup,takeover,inbox,inventory,rows,license]=await Promise.all([
    global.topBurgerDesktop?.update?.info?.().catch(()=>null),
    a?.health?.().catch(()=>null),
    a?.syncStats?.().catch(()=>null),
    a?.guardState?.().catch(()=>null),
    a?.recoveryState?.().catch(()=>null),
    a?.startupReport?.().catch(()=>null),
    a?.takeoverState?.().catch(()=>null),
    a?.inboxStats?.().catch(()=>null),
    a?.inventoryStats?.({}).catch(()=>null),
    a?.outbox?.().catch(()=>[]),
    global.topBurgerDesktop?.licenseState?.get?.().catch(()=>null)
  ]);
  let legacy=[];try{legacy=typeof offlineQueue==='function'?(await offlineQueue())||[]:[]}catch{}
  const cleanRows=(rows||[]).slice(-250).map(r=>({client_tx_id:r.client_tx_id,device_sequence:r.device_sequence,operation_type:r.operation_type,entity_type:r.entity_type,status:r.status,attempts:r.attempts,last_attempt_at:r.last_attempt_at,next_retry_at:r.next_retry_at,last_error_code:r.last_error_code,last_error_message:r.last_error_message,created_local_at:r.created_local_at,synced_at:r.synced_at,has_server_ack:!!r.server_ack}));
  return {
    product:'Sharawla POS',bundle_version:1,diagnostics_version:VERSION,generated_at:new Date().toISOString(),
    app:{version:info?.version||null,channel:info?.channel||null,arch:info?.arch||null},
    device:{support_code:license?.support_code||null,device_id:license?.device_id||null,business_id:license?.business_id||null,canonical_fingerprint_present:!!text(license?.device_fingerprint)},
    health,stats,guard,recovery,startup,
    takeover:takeover?{mode:takeover.mode,armed:!!takeover.armed,active:!!takeover.active,migration_verified:!!takeover.migration_verified,transport_ready:!!takeover.transport_ready,legacy_retired:!!takeover.legacy_retired,legacy_count:takeover.legacy_count,prepared_at:takeover.prepared_at,activated_at:takeover.activated_at}:null,
    inbox,inventory,
    unresolved:cleanRows,
    legacy:{count:legacy.length,rows:legacy.slice(-100).map(j=>({client_tx_id:j.client_tx_id,type:j.type,created_at:j.created_at,status:j?._sync?.status||'pending',last_error:j?._sync?.last_error||null}))}
  };
}
function downloadJson(name,value){const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
async function exportSupportBundle(){const b=await supportBundle();downloadJson(`sharawla-offline-support-${safeName(b.device.support_code||b.app.version||'device')}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`,b);try{toast('تم تصدير Support Bundle')}catch{}return b}

async function openCenter(){
  if(!(await active()))return false;
  document.querySelector('[data-offline-v2-center]')?.remove();
  const [mdata,guard,recovery]=await Promise.all([model(),api()?.guardState?.().catch(()=>null),api()?.recoveryState?.().catch(()=>null)]),m=document.createElement('div');m.className='modal';m.dataset.offlineV2Center='1';
  const c=mdata.counts||{};
  const body=groupedBody(mdata);
  m.innerHTML=`<div class="modal-card ov2-sync-modal"><div class="section-head"><div><h2>⟳ مركز المزامنة V2</h2><p class="muted">الحركة لا تُحذف بسبب خطأ. التعارض وDead Letter يظلان محفوظين حتى المراجعة.</p></div></div><div class="hint">Pending ${c.pending||0} • Retryable ${c.retryable||0} • Blocked ${c.blocked||0} • Conflict ${c.conflict||0} • DLQ ${c.dead_letter||0} • Legacy ${mdata.legacy.length}</div><div class="hint">Integrity: ${guard?.integrity_ok===true?'OK':'CHECK'} • Recovery: ${recovery?.ok===true?'OK':'CHECK'} • آخر Startup: ${esc(fmt(recovery?.startup_at||recovery?.updated_at||''))}</div><div class="ov2-sync-list">${body||'<div class="empty">كل الحركات متزامنة</div>'}</div><div class="modal-actions"><button type="button" class="secondary" data-v2-close>إغلاق</button><button type="button" class="secondary" data-v2-support>تصدير Support Bundle</button>${mdata.legacy.length?'<button type="button" class="secondary" data-legacy-retry>إعادة محاولة Legacy</button>':''}<button type="button" class="primary" data-v2-sync>مزامنة الآن</button></div></div>`;
  document.body.appendChild(m);
  m.onclick=async e=>{
    if(e.target===m||e.target.closest('[data-v2-close]'))return m.remove();
    if(e.target.closest('[data-v2-support]')){const b=e.target.closest('[data-v2-support]');b.disabled=true;try{await exportSupportBundle()}catch(err){try{toast(err.message)}catch{}}finally{b.disabled=false}return}
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
  global.SharawlaOfflineV2Diagnostics=Object.freeze({version:VERSION,refresh,openCenter,model,statusLabel,typeLabel,supportBundle,exportSupportBundle,isActiveCached:()=>activeCached});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
