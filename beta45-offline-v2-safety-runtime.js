(function(global){
'use strict';

// Sharawla Offline Engine V2 — Phase 8 renderer safety integration.
// Offline authorization is independent from a live Supabase access token but is
// bound to the canonical device identity, cached employee permissions and
// license grace. Destructive actions are blocked while durable work is unresolved.
const VERSION='10.5.4-beta.58.33';
let installed=false;
const DAILY_BACKUP_KEY='sharawlaOfflineV2LastDailyBackupAt';

function text(v){return String(v??'').trim()}
function num(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f}
function api(){return global.topBurgerDesktop?.offlineV2||null}
function html(v){try{return typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}catch{return String(v??'')}}
function cash(v){try{return typeof money==='function'?money(v):Number(v||0).toFixed(2)}catch{return Number(v||0).toFixed(2)}}
function guardMessage(g,action){
  const n=num(g?.unresolved_count),critical=num(g?.critical_count);
  if(g?.integrity_ok===false)return `تم منع ${action}: قاعدة Offline V2 المحلية تحتاج مراجعة سلامة.`;
  if(n>0)return `تم منع ${action}: يوجد ${n} حركة محلية غير متزامنة${critical?` (${critical} تحتاج مراجعة)`:''}.`;
  return `تم منع ${action} لحماية بيانات Offline V2.`;
}
async function requireSafe(action,backupReason=null){
  const a=api();if(!a?.guardAssert)throw new Error('Offline V2 safety guard غير متاح');
  try{const r=await a.guardAssert({action});if(backupReason&&a.backupCreate)await a.backupCreate({reason:backupReason});return r}catch(e){const g=e?.guard||await a.guardState?.().catch?.(()=>null);const msg=guardMessage(g,action);try{if(typeof toast==='function')toast(msg)}catch{}const x=new Error(msg);x.code=e?.code||'OFFLINE_V2_GUARD_BLOCKED';x.guard=g;throw x}
}
async function maybeDailyBackup(){const a=api();if(!a?.backupCreate)return;const last=Date.parse(localStorage.getItem(DAILY_BACKUP_KEY)||'')||0;if(Date.now()-last<24*60*60*1000)return;try{await a.backupCreate({reason:'daily'});localStorage.setItem(DAILY_BACKUP_KEY,new Date().toISOString())}catch(e){console.warn('Offline V2 daily backup',e)}}
function renderLocalReport(data){const rows=(data?.rows||[]).map(r=>`<tr><td>${html(r.device_sequence)}</td><td>${html(r.operation_type)}</td><td>${html(r.status)}</td><td>${html(r.created_local_at||'')}</td><td>${cash(r.amount||0)}</td><td>${html(r.last_error_message||'—')}</td></tr>`).join('');const c=data?.counts||{};const page=document.getElementById('page');if(!page)return;page.innerHTML=`<div class="panel"><div class="section-head"><div><h2>📱 تقرير هذا الجهاز — Offline</h2><p>هذا تقرير تشغيلي محلي للجهاز الحالي فقط، وليس تقرير Cloud مجمعًا بين الأجهزة.</p></div><span class="tag">LOCAL DEVICE</span></div><div class="stats-grid"><div class="stat-card"><span>مبيعات محلية</span><b>${cash(data?.sale_total||0)}</b></div><div class="stat-card"><span>مرتجعات محلية</span><b>${cash(data?.return_total||0)}</b></div><div class="stat-card"><span>مصروفات محلية</span><b>${cash(data?.expense_total||0)}</b></div><div class="stat-card"><span>غير متزامن</span><b>${num(data?.unsynced_count)}</b></div></div><p class="hint">Pending: ${num(c.pending)} • Retryable: ${num(c.retryable)} • Blocked: ${num(c.blocked)} • Conflict: ${num(c.conflict)} • DLQ: ${num(c.dead_letter)} • Synced: ${num(c.synced)}</p><div class="table-wrap"><table><thead><tr><th>Seq</th><th>الحركة</th><th>الحالة</th><th>وقت الجهاز</th><th>القيمة</th><th>آخر ملاحظة</th></tr></thead><tbody>${rows||'<tr><td colspan="6">لا توجد حركات محلية محفوظة.</td></tr>'}</tbody></table></div></div>`}
function addCloudReportBanner(){const page=document.getElementById('page');if(!page||page.querySelector('[data-offline-v2-report-source]'))return;const b=document.createElement('div');b.dataset.offlineV2ReportSource='cloud';b.className='panel';b.style.marginBottom='12px';b.innerHTML='<b>☁️ Cloud Consolidated Report</b><div class="hint">الأرقام التالية من Backend النشاط للفرع الحالي. الحركات المحلية غير المتزامنة لا تعتبر Cloud مؤكدة حتى تستلم ACK.</div>';page.prepend(b)}
function install(){
  if(installed)return;installed=true;const a=api();if(!a)return;
  const baseResetGroups=typeof resetGroups==='function'?resetGroups:null;const baseRestoreBackup=typeof restoreBackup==='function'?restoreBackup:null;const baseClearBusiness=typeof clearBusinessLocalStateForLicenseChange==='function'?clearBusinessLocalStateForLicenseChange:null;const baseRenderReports=typeof renderReports==='function'?renderReports:null;
  // SHARAWLA_OFFLINE_AUTH_55_3_WRAPPER_REMOVED — app.js owns online enrollment/read-back.
  // Phase 8 keeps only safety/report guards; app.js owns Offline Authentication.
  if(baseClearBusiness){clearBusinessLocalStateForLicenseChange=async function(){await requireSafe('تغيير الترخيص/النشاط','pre-license-change');await a.authClear?.();return baseClearBusiness()}}
  if(baseResetGroups){resetGroups=async function(groups){await requireSafe('إعادة ضبط البيانات','pre-reset');return baseResetGroups(groups)}}
  if(baseRestoreBackup){restoreBackup=async function(file,groups){await requireSafe('استعادة Backup','pre-restore');return baseRestoreBackup(file,groups)}}
  if(baseRenderReports){renderReports=async function(){if(!navigator.onLine){const report=await a.localReport({branch_id:typeof currentBranchId==='function'?currentBranchId():null,limit:100});return renderLocalReport(report)}const out=await baseRenderReports();addCloudReportBanner();return out}}
  global.addEventListener('online',()=>{if(session?.offline_authorized===true){try{toast('تم رجوع الإنترنت. سجّل الدخول أونلاين لتجديد جلسة Cloud قبل المزامنة.')}catch{}}});global.addEventListener('sharawla:offline-v2-server-event',()=>{if(navigator.onLine&&document.querySelector('[data-offline-v2-report-source="cloud"]'))addCloudReportBanner()});
  global.__SharawlaOfflineV2Phase8=Object.freeze({version:VERSION,requireSafe,maybeDailyBackup,guard:()=>a.guardState?.(),recovery:()=>a.recoveryState?.(),localReport:x=>a.localReport?.(x||{})});
}
try{install()}catch(e){console.error('Offline V2 Phase 8 runtime install failed',e)}
})(window);
