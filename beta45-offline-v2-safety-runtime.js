(function(global){
'use strict';

// Sharawla Offline Engine V2 — Phase 8 renderer safety integration.
// Offline authorization is independent from a live Supabase access token but is
// bound to the canonical device identity, cached employee permissions and
// license grace. Destructive actions are blocked while durable work is unresolved.
const VERSION='10.5.4-beta.54';
let installed=false;
let lastOnlineCredentials=null;
let offlineVerifiedUntil=0;
let offlineReadyState={ready:false,status:'NOT_READY',reason:'NOT_ENROLLED',checked_at:null};
const DAILY_BACKUP_KEY='sharawlaOfflineV2LastDailyBackupAt';

function text(v){return String(v??'').trim()}
function num(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f}
function api(){return global.topBurgerDesktop?.offlineV2||null}
function html(v){try{return typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}catch{return String(v??'')}}
function cash(v){try{return typeof money==='function'?money(v):Number(v||0).toFixed(2)}catch{return Number(v||0).toFixed(2)}}
async function currentIdentity(){
  const st=typeof loadLicenseState==='function'?await loadLicenseState():null;
  const identity={device_id:text(st?.device_id),business_id:text(st?.business_id),device_fingerprint:text(st?.device_fingerprint)};
  if(!identity.device_id||!identity.business_id||!identity.device_fingerprint){const e=new Error('بصمة الجهاز الثابتة وبيانات النشاط مطلوبة للعمل Offline');e.code='OFFLINE_V2_CANONICAL_IDENTITY_REQUIRED';throw e}
  return {identity,license:st};
}
function setOfflineReady(ready,status,reason=null,extra={}){offlineReadyState={ready:ready===true,status,reason,checked_at:new Date().toISOString(),...extra};try{global.dispatchEvent(new CustomEvent('sharawla:offline-auth-readiness',{detail:offlineReadyState}))}catch{}return offlineReadyState}
async function verifyOfflineReady(identity){
  const a=api();if(!a?.authState)throw new Error('Offline V2 auth state غير متاح');
  const state=await a.authState({identity});
  if(state?.ok!==true||state?.enrolled!==true||state?.valid!==true){const e=new Error('Offline Login = NOT READY');e.code='OFFLINE_V2_AUTH_NOT_READY';e.auth_state=state;throw e}
  return setOfflineReady(true,'READY',null,{auth_state:state});
}
async function enrollOfflineCredential(email,password,bootstrap=null){
  const a=api();if(!a?.authEnroll)throw new Error('Offline V2 authorization enrollment غير متاح');
  const boot=bootstrap||await odbGet('bootstrap');
  if(!boot?.employee?.id){setOfflineReady(false,'NOT_READY','BOOTSTRAP_NOT_READY');return {ok:false,pending:true,reason:'BOOTSTRAP_NOT_READY'}}
  const {identity,license}=await currentIdentity();
  try{
    const enrolled=await a.authEnroll({identity,license,bootstrap:boot,email:text(email).toLowerCase(),password:String(password||'')});
    if(enrolled?.enrolled!==true)throw Object.assign(new Error('Offline enrollment did not complete'),{code:'OFFLINE_V2_AUTH_ENROLL_FAILED'});
    await verifyOfflineReady(identity);
    return {ok:true,enrolled:true};
  }catch(e){setOfflineReady(false,'NOT_READY',e?.code||'ENROLL_FAILED',{error:text(e?.message||e)});throw e}
}
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
  if(installed)return;installed=true;const a=api();if(!a)return;if(typeof signIn!=='function'||typeof cacheBootstrap!=='function'||typeof loadOfflineBootstrap!=='function')throw new Error('Offline V2 Phase 8 requires login/bootstrap runtime');
  const baseSignIn=signIn,baseCacheBootstrap=cacheBootstrap,baseLoadOfflineBootstrap=loadOfflineBootstrap;const baseResetGroups=typeof resetGroups==='function'?resetGroups:null;const baseRestoreBackup=typeof restoreBackup==='function'?restoreBackup:null;const baseClearBusiness=typeof clearBusinessLocalStateForLicenseChange==='function'?clearBusinessLocalStateForLicenseChange:null;const baseRenderReports=typeof renderReports==='function'?renderReports:null;
  signIn=async function(email,password){
    email=text(email).toLowerCase();
    if(navigator.onLine){
      const d=await baseSignIn(email,password);lastOnlineCredentials={email,password:String(password||'')};offlineVerifiedUntil=0;
      try{const boot=await odbGet('bootstrap');if(boot?.employee?.id)await enrollOfflineCredential(email,password,boot);else setOfflineReady(false,'NOT_READY','WAITING_FOR_BOOTSTRAP')}catch(e){console.error('Offline V2 authoritative enrollment after online signIn failed',e)}
      return d;
    }
    const {identity}=await currentIdentity();if(!a.authVerify)throw new Error('Offline V2 authorization غير متاح');const verified=await a.authVerify({identity,email,password:String(password||'')});if(verified?.offline_authorized!==true||!verified?.bootstrap?.employee?.id)throw new Error('تعذر اعتماد تسجيل الدخول Offline');await odbSet('bootstrap',verified.bootstrap);offlineVerifiedUntil=Date.parse(verified.valid_until||0)||0;session={offline:true,offline_authorized:true,user:{email},expires_at:verified.valid_until,employee_id:verified.employee_id};resumeSession=session;return session;
  };
  cacheBootstrap=async function(){
    const out=await baseCacheBootstrap();
    if(navigator.onLine&&lastOnlineCredentials){
      try{const boot=await odbGet('bootstrap');await enrollOfflineCredential(lastOnlineCredentials.email,lastOnlineCredentials.password,boot);await maybeDailyBackup()}catch(e){console.error('Offline V2 authoritative enrollment after bootstrap failed',e)}
    }
    return out;
  };
  loadOfflineBootstrap=async function(){if(Date.now()>offlineVerifiedUntil){const e=new Error('يجب تسجيل الدخول Offline بكلمة المرور المعتمدة على هذا الجهاز أولًا');e.code='OFFLINE_V2_OFFLINE_AUTH_REQUIRED';throw e}return baseLoadOfflineBootstrap()};
  if(baseClearBusiness){clearBusinessLocalStateForLicenseChange=async function(){await requireSafe('تغيير الترخيص/النشاط','pre-license-change');await a.authClear?.();setOfflineReady(false,'NOT_READY','AUTH_CLEARED');return baseClearBusiness()}}
  if(baseResetGroups){resetGroups=async function(groups){await requireSafe('إعادة ضبط البيانات','pre-reset');return baseResetGroups(groups)}}
  if(baseRestoreBackup){restoreBackup=async function(file,groups){await requireSafe('استعادة Backup','pre-restore');return baseRestoreBackup(file,groups)}}
  if(baseRenderReports){renderReports=async function(){if(!navigator.onLine){const report=await a.localReport({branch_id:typeof currentBranchId==='function'?currentBranchId():null,limit:100});return renderLocalReport(report)}const out=await baseRenderReports();addCloudReportBanner();return out}}
  global.addEventListener('online',()=>{if(session?.offline_authorized===true){try{toast('تم رجوع الإنترنت. سجّل الدخول أونلاين لتجديد جلسة Cloud قبل المزامنة.')}catch{}}});global.addEventListener('sharawla:offline-v2-server-event',()=>{if(navigator.onLine&&document.querySelector('[data-offline-v2-report-source="cloud"]'))addCloudReportBanner()});
  global.__SharawlaOfflineV2Phase8=Object.freeze({version:VERSION,requireSafe,maybeDailyBackup,guard:()=>a.guardState?.(),recovery:()=>a.recoveryState?.(),localReport:x=>a.localReport?.(x||{}),offlineReadiness:()=>({...offlineReadyState}),enrollOfflineCredential});
}
try{install()}catch(e){console.error('Offline V2 Phase 8 runtime install failed',e)}
})(window);
