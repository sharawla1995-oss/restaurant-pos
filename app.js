const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let cfg={url:localStorage.getItem('sbUrl')||'',key:localStorage.getItem('sbKey')||''};
let session=null;

// ===== Sharawla Cloud device licensing V10.4.15 =====
const SHARAWLA_CLOUD_URL='https://ikppryeavoabnugcijeq.supabase.co';
const SHARAWLA_CLOUD_KEY='sb_publishable_Lv-eHHXQnWGy-g0rrc2x3w_daXKN2LI';
const LICENSE_STATE_KEY='sharawlaLicenseStateV1';
const BUSINESS_CONNECTION_CACHE_KEY='sharawlaBusinessConnectionV1';
const RUNTIME_CONFIG_CACHE_KEY='sharawlaRuntimeConfigV1';
// V10.5.2 Phase 2 Step 2: Restaurant navigation, permissions, page titles and
// operational page rules now live in the Restaurant Engine instead of app.js.
let sharawlaRuntimeConfig=null;
let sharawlaDeviceInfo=null;
function clearLegacyBusinessConfig(){
  if(!window.topBurgerDesktop?.isDesktop)return;
  localStorage.removeItem('sbUrl');
  localStorage.removeItem('sbKey');
}
function loadBusinessConnectionCache(businessId){
  try{
    const c=JSON.parse(localStorage.getItem(BUSINESS_CONNECTION_CACHE_KEY)||'null');
    if(!c||String(c.business_id)!==String(businessId||''))return null;
    if(!/^https:\/\/[a-zA-Z0-9-]+\.supabase\.co$/.test(String(c.url||'').replace(/\/$/,'')))return null;
    if(!String(c.key||'').startsWith('sb_publishable_'))return null;
    return c;
  }catch{return null}
}
function saveBusinessConnectionCache(c){
  const row={business_id:String(c.business_id),business_name:c.business_name||'',url:String(c.supabase_url||c.url||'').replace(/\/$/,''),key:String(c.supabase_publishable_key||c.key||''),updated_at:new Date().toISOString()};
  localStorage.setItem(BUSINESS_CONNECTION_CACHE_KEY,JSON.stringify(row));
  return row;
}
async function ensureSharawlaBusinessConnection(){
  if(!window.topBurgerDesktop?.isDesktop)return true;
  clearLegacyBusinessConfig();
  const st=await loadLicenseState();
  if(!st?.device_id||!st?.business_id)return showActivation('بيانات ربط الجهاز بالنشاط غير مكتملة. أعد التحقق من الترخيص.'),false;
  if(!sharawlaDeviceInfo&&window.topBurgerDesktop?.device?.info){try{sharawlaDeviceInfo=await window.topBurgerDesktop.device.info()}catch{}}
  if(navigator.onLine){
    try{
      const canonical=String(st.device_fingerprint||'').trim();
      if(!canonical)return showActivation('بصمة الجهاز الثابتة غير مثبتة بعد. اضغط إعادة التحقق أثناء الاتصال بالإنترنت.'),false;
      const d=await cloudRpc('get_sharawla_business_connection',{p_device_id:st.device_id,p_device_fingerprint:canonical});
      if(!d?.ok)return showActivation(d?.message||'تعذر تحميل إعدادات اتصال النشاط.'),false;
      if(String(d.business_id)!==String(st.business_id))return showActivation('بيانات اتصال النشاط غير متطابقة مع ترخيص الجهاز.'),false;
      const c=saveBusinessConnectionCache(d);
      cfg={url:c.url,key:c.key};
      return true;
    }catch(e){
      const cached=loadBusinessConnectionCache(st.business_id);
      if(cached&&licenseGraceValid(st)){cfg={url:cached.url,key:cached.key};return true}
      return showActivation('تعذر تحميل إعدادات النشاط من Sharawla Cloud. وصّل الإنترنت واضغط إعادة التحقق.'),false;
    }
  }
  const cached=loadBusinessConnectionCache(st.business_id);
  if(cached&&licenseGraceValid(st)){cfg={url:cached.url,key:cached.key};return true}
  return showActivation('لا توجد إعدادات اتصال محفوظة لهذا النشاط. وصّل الجهاز بالإنترنت للتحقق مرة واحدة.'),false;
}

function runtimeCore(){return window.SharawlaRuntimeCore||null}
function loadRuntimeConfigCache(businessId){
  const core=runtimeCore();
  return core?core.loadCache(RUNTIME_CONFIG_CACHE_KEY,businessId):null;
}
function saveRuntimeConfigCache(c){
  const core=runtimeCore();
  if(!core)throw new Error('Sharawla Runtime Core غير محمل.');
  const row=core.saveCache(RUNTIME_CONFIG_CACHE_KEY,c);
  sharawlaRuntimeConfig=row;
  return row;
}
function moduleEnabled(code){
  // Until Runtime Config is resolved, keep legacy behavior during bootstrap.
  if(!sharawlaRuntimeConfig)return true;
  return runtimeCore()?.moduleEnabled(sharawlaRuntimeConfig,code)===true;
}
function runtimeAllowsPage(page){
  if(!sharawlaRuntimeConfig)return true;
  return runtimeCore()?.pageAllowed(sharawlaRuntimeConfig,page)===true;
}
function runtimeOperationalAllowsPage(page){
  const core=runtimeCore();
  if(!core)return false;
  return core.pageOperationalAllowed(sharawlaRuntimeConfig,page,state?.settings||{})===true;
}
function runtimePageTitle(page){
  return runtimeCore()?.pageTitle(sharawlaRuntimeConfig,page)||String(page||'');
}
function runtimeAllPages(){
  return runtimeCore()?.allPages(sharawlaRuntimeConfig)||['home'];
}
function runtimeRolePages(role){
  return runtimeCore()?.rolePages(sharawlaRuntimeConfig,role)||['home'];
}
function runtimePermissionDefs(){
  return runtimeCore()?.permissionDefs(sharawlaRuntimeConfig)||[];
}
function runtimePermissionGroups(){
  return runtimeCore()?.permissionGroups(sharawlaRuntimeConfig)||[];
}
async function ensureSharawlaRuntimeConfig(){
  const st=await loadLicenseState();
  if(!st?.device_id||!st?.business_id)return showActivation('بيانات النشاط غير مكتملة. أعد التحقق من الترخيص.'),false;
  const canonical=String(st.device_fingerprint||'').trim();
  if(!canonical)return showActivation('بصمة الجهاز الثابتة غير مثبتة بعد. اضغط إعادة التحقق أثناء الاتصال بالإنترنت.'),false;
  const core=runtimeCore();
  if(!core)return showActivation('تعذر تحميل Sharawla Runtime Core. أعد تشغيل البرنامج.'),false;
  if(navigator.onLine){
    try{
      const d=await cloudRpc('get_sharawla_business_runtime_config',{p_device_id:st.device_id,p_device_fingerprint:canonical});
      if(!d?.ok)return showActivation(d?.message||'تعذر تحميل إعداد تشغيل النشاط.'),false;
      if(String(d.business_id)!==String(st.business_id))return showActivation('Runtime Config غير متطابقة مع ترخيص الجهاز.'),false;
      const profile=String(d.pos_profile||'').trim().toLowerCase();
      if(d.profile_active===false)return showActivation('POS Profile الخاص بالنشاط موقوف في Sharawla Admin.'),false;
      if(d.profile_implemented!==true)return showActivation('POS Profile الخاص بالنشاط غير منفذ بعد في هذا الإصدار.'),false;
      if(!core.hasEngine(profile))return showActivation(`لا يوجد Engine مثبت للـ POS Profile الحالي: ${profile||'غير محدد'}`),false;
      saveRuntimeConfigCache(d);
      return true;
    }catch(e){
      const cached=loadRuntimeConfigCache(st.business_id);
      if(cached&&licenseGraceValid(st)){sharawlaRuntimeConfig=cached;return true}
      return showActivation('تعذر تحميل POS Profile وModules من Sharawla Cloud. وصّل الإنترنت وأعد المحاولة.'),false;
    }
  }
  const cached=loadRuntimeConfigCache(st.business_id);
  if(cached&&licenseGraceValid(st)){sharawlaRuntimeConfig=cached;return true}
  return showActivation('لا توجد Runtime Config محفوظة لهذا النشاط. وصّل الجهاز بالإنترنت للتحقق مرة واحدة.'),false;
}

async function cloudRpc(name,payload={}){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const r=await fetch(`${SHARAWLA_CLOUD_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{'Content-Type':'application/json','apikey':SHARAWLA_CLOUD_KEY},body:JSON.stringify(payload),signal:controller.signal});
    let d=null;try{d=await r.json()}catch{}
    if(!r.ok)throw new Error(d?.message||d?.hint||`Sharawla Cloud ${r.status}`);
    return Array.isArray(d)?d[0]:d;
  }catch(e){
    if(e?.name==='AbortError')throw new Error('انتهت مهلة الاتصال بـ Sharawla Cloud. تحقق من الإنترنت وحاول مرة أخرى.');
    throw e;
  }finally{clearTimeout(timeout)}
}
async function loadLicenseState(){
  try{
    if(window.topBurgerDesktop?.licenseState?.get){
      const fileState=await window.topBurgerDesktop.licenseState.get();
      if(fileState?.device_id)return fileState;
      const legacy=await odbGet(LICENSE_STATE_KEY);
      if(legacy?.device_id){await window.topBurgerDesktop.licenseState.set(legacy);return legacy}
      return legacy||null;
    }
    return await odbGet(LICENSE_STATE_KEY);
  }catch{return null}
}
async function saveLicenseState(v){
  if(window.topBurgerDesktop?.licenseState?.set)await window.topBurgerDesktop.licenseState.set(v);
  await odbSet(LICENSE_STATE_KEY,v);
  return v;
}
async function clearLicenseState(){
  if(window.topBurgerDesktop?.licenseState?.clear)await window.topBurgerDesktop.licenseState.clear();
  await odbSet(LICENSE_STATE_KEY,null);
}

// V10.4.21 — read-only device Support Code for the Login screen.
// This is display metadata only; it never changes Device ID, Canonical Fingerprint,
// activation identity or the existing license verification contract.
function renderLoginSupportCode(code){
  const el=$('#loginSupportCodeValue');
  if(!el)return;
  const v=String(code||'').trim();
  el.textContent=v||'—';
}
async function ensureSharawlaSupportCode(st=null){
  try{
    const current=st||await loadLicenseState();
    if(!current?.device_id)return null;
    const cached=String(current.support_code||'').trim();
    if(cached){renderLoginSupportCode(cached);return cached}
    const canonical=String(current.device_fingerprint||'').trim();
    if(!canonical||!navigator.onLine){renderLoginSupportCode(null);return null}
    const d=await cloudRpc('get_sharawla_device_support_code',{p_device_id:current.device_id,p_device_fingerprint:canonical});
    const code=String(d?.support_code||'').trim();
    if(!d?.ok||!code){renderLoginSupportCode(null);return null}
    await saveLicenseState({...current,support_code:code});
    renderLoginSupportCode(code);
    return code;
  }catch(e){
    // Support Code is helpful metadata and must never block POS startup.
    console.warn('Sharawla Support Code read failed:',e?.message||e);
    try{renderLoginSupportCode((st||await loadLicenseState())?.support_code)}catch{}
    return null;
  }
}
async function clearBusinessLocalStateForLicenseChange(){
  session=null;resumeSession=null;
  localStorage.removeItem(BUSINESS_CONNECTION_CACHE_KEY);
  localStorage.removeItem(RUNTIME_CONFIG_CACHE_KEY);
  sharawlaRuntimeConfig=null;
  localStorage.removeItem('sbResumeSession');
  localStorage.removeItem('offlineLoginVerifier');
  localStorage.removeItem('sbUrl');
  localStorage.removeItem('sbKey');
  localStorage.removeItem('offlineOrderNo');
  for(const k of ['bootstrap','customersCache','customerAddressesCache','customersCacheAt','cachedOrders','lastFullBackupAt']){
    try{await odbSet(k,null)}catch(e){console.warn('clear business cache',k,e)}
  }
  state.employee=null;state.selectedCustomer=null;state.customerAddresses=[];state.cart=[];state.activeBranchId=null;
}
function licenseGraceValid(st){if(!st?.last_verified_at)return false;const days=Math.max(0,Number(st.offline_grace_days||0));return Date.now()-new Date(st.last_verified_at).getTime() <= days*86400000}
function licenseFingerprintCandidates(st){
 // V10.4.20 FINAL: once a canonical fingerprint is pinned locally it is the
 // only identity allowed for this device. Never replace it automatically.
 const canonical=String(st?.device_fingerprint||'').trim();
 if(canonical)return [canonical];
 // Legacy migration only: old states have a device_id but no canonical
 // fingerprint. Try historical fingerprints to recover the identity already
 // registered in Sharawla Cloud; the first successful one is pinned forever.
 const vals=[...(sharawlaDeviceInfo?.fingerprint_candidates||[]),sharawlaDeviceInfo?.fingerprint]
  .map(x=>String(x||'').trim()).filter(Boolean);
 return [...new Set(vals)];
}
async function verifySharawlaDeviceState(st){
 const canonical=String(st?.device_fingerprint||'').trim();
 const candidates=licenseFingerprintCandidates(st);
 let last=null;
 for(const fp of candidates){
  const d=await cloudRpc('verify_sharawla_device',{p_device_id:st.device_id,p_device_fingerprint:fp,p_app_version:sharawlaDeviceInfo.version});
  last=d;
  if(d?.ok)return {data:d,fingerprint:fp,migrated:!canonical};
  // Canonical identity is immutable: any Cloud rejection is authoritative.
  // Only a legacy state with NO canonical fingerprint may try another
  // historical candidate when the current candidate is reported unknown.
  if(canonical)break;
  if(!/غير معروف|unknown/i.test(String(d?.message||'')))break;
 }
 return {data:last,fingerprint:null,migrated:false};
}
let licenseRetryBusy=false,licenseRetryTimer=null;
async function setActivationMode(){
  const st=await loadLicenseState();
  const linked=!!st?.device_id;
  if($('#licenseKeyLabel'))$('#licenseKeyLabel').classList.toggle('hidden',linked);
  if($('#activateBtn'))$('#activateBtn').classList.toggle('hidden',linked);
  if($('#retryLicenseBtn'))$('#retryLicenseBtn').classList.toggle('hidden',!linked);
  if($('#changeLicenseBtn'))$('#changeLicenseBtn').classList.toggle('hidden',!linked);
  if($('#licenseKey'))$('#licenseKey').required=!linked;
  return linked;
}
function stopLicenseRetry(){if(licenseRetryTimer){clearInterval(licenseRetryTimer);licenseRetryTimer=null}}
async function retryExistingSharawlaLicense({quiet=false}={}){
  if(licenseRetryBusy)return false;
  const st=await loadLicenseState();
  if(!st?.device_id)return false;
  if(!navigator.onLine){if(!quiet)toast('الجهاز غير متصل بالإنترنت');return false}
  licenseRetryBusy=true;
  try{
    if(!sharawlaDeviceInfo&&window.topBurgerDesktop?.device?.info)sharawlaDeviceInfo=await window.topBurgerDesktop.device.info();
    const vr=await verifySharawlaDeviceState(st),d=vr.data;
    if(!d?.ok){if(!quiet&&d?.message)toast(d.message);return false}
    const nextState={...st,device_fingerprint:vr.fingerprint,business_id:d.business_id,business_name:d.business_name,offline_grace_days:d.offline_grace_days,last_verified_at:new Date().toISOString()};
    await saveLicenseState(nextState);
    await ensureSharawlaSupportCode(nextState);
    stopLicenseRetry();
    if(!quiet)toast('تم التحقق من الجهاز');
    setTimeout(()=>location.reload(),250);
    return true;
  }catch(e){if(!quiet)toast(e.message||'تعذر التحقق من الترخيص');return false}
  finally{licenseRetryBusy=false}
}
async function showActivation(message='أدخل كود الترخيص الخاص بهذا الجهاز.'){
  show('activationView');const m=$('#activationMessage');if(m)m.textContent=message;
  if(!sharawlaDeviceInfo&&window.topBurgerDesktop?.device?.info){try{sharawlaDeviceInfo=await window.topBurgerDesktop.device.info()}catch{}}
  if($('#deviceHint')&&sharawlaDeviceInfo)$('#deviceHint').textContent=`الجهاز: ${sharawlaDeviceInfo.name} • ${String(sharawlaDeviceInfo.fingerprint||'').slice(0,12)}…`;
  const linked=await setActivationMode();
  if(linked){
    if(m && (!message||message==='أدخل كود الترخيص الخاص بهذا الجهاز.'))m.textContent='الجهاز مربوط بالفعل. سيتم إعادة التحقق تلقائيًا عند إعادة تشغيله من Sharawla Admin.';
    if(!licenseRetryTimer)licenseRetryTimer=setInterval(()=>{if(!$('#activationView')?.classList.contains('hidden'))retryExistingSharawlaLicense({quiet:true})},5000);
  }else stopLicenseRetry();
}
async function ensureSharawlaLicense(){
  if(!window.topBurgerDesktop?.isDesktop)return true;
  try{sharawlaDeviceInfo=await window.topBurgerDesktop.device.info()}catch{return showActivation('تعذر قراءة بصمة الجهاز. أعد تشغيل البرنامج.'),false}
  const st=await loadLicenseState();
  if(!st?.device_id)return showActivation(),false;
  if(!navigator.onLine){
    renderLoginSupportCode(st?.support_code);
    if(licenseGraceValid(st))return true;
    return showActivation('انتهت فترة السماح بدون إنترنت. وصّل الجهاز بالإنترنت للتحقق من الترخيص.'),false;
  }
  try{
    const vr=await verifySharawlaDeviceState(st),d=vr.data;
    if(!d?.ok)return showActivation(d?.message||'الترخيص غير ساري.'),false;
    const nextState={...st,device_fingerprint:vr.fingerprint,business_id:d.business_id,business_name:d.business_name,offline_grace_days:d.offline_grace_days,last_verified_at:new Date().toISOString()};
    await saveLicenseState(nextState);
    await ensureSharawlaSupportCode(nextState);
    return true;
  }catch(e){
    if(licenseGraceValid(st))return true;
    return showActivation('تعذر الاتصال بـ Sharawla Cloud وفترة السماح غير متاحة. وصّل الإنترنت ثم أعد المحاولة.'),false;
  }
}

let resumeSession=JSON.parse(localStorage.getItem('sbResumeSession')||'null');
let state={employee:null,branches:[],categories:[],products:[],cart:[],cat:'all',
business:{business_name:'Sharawla POS',tagline:'نظام نقاط البيع',phone:'',address:'',logo_url:'',currency_symbol:'ج.م',receipt_footer:'شكرًا لزيارتكم',primary_color:'#111827',accent_color:'#f5b82e'},
settings:{
  enable_extras:true,enable_removals:true,enable_item_notes:true,
  enable_kitchen:false,enable_receipt_print:true,enable_prep_receipt:true,
  enable_inventory:false,enable_delivery:true,enable_customer_search:true,
  enable_delivery_drivers:true,enable_mixed_payment:true,returns_allow_closed_shifts:false
},
modifiers:[],productModifiers:[],productVariants:[],branchProducts:[],deliveryZones:[],drivers:[],branchPrintSettings:[],paymentMethods:[],branchPaymentMethods:[],branchFinancialSettings:[],websiteSettings:null,employeeBranches:[],userPermissions:null,selectedCustomer:null,activeBranchId:null,homeBranchId:null,customerAddresses:[],activePromo:null,checkoutInProgress:false};
let websiteOrderWatchTimer=null;
let knownWebsiteOrderIds=new Set();
let websiteOrderWatchPrimed=false;
let websiteAudioCtx=null;
function websiteOrderBeep(){
  try{
    websiteAudioCtx=websiteAudioCtx||new (window.AudioContext||window.webkitAudioContext)();
    if(websiteAudioCtx.state==='suspended') websiteAudioCtx.resume();
    const o=websiteAudioCtx.createOscillator(),g=websiteAudioCtx.createGain();
    o.type='sine';o.frequency.value=880;g.gain.value=.0001;o.connect(g);g.connect(websiteAudioCtx.destination);
    const t=websiteAudioCtx.currentTime;g.gain.exponentialRampToValueAtTime(.18,t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+.45);o.start(t);o.stop(t+.48);
    setTimeout(()=>{try{const o2=websiteAudioCtx.createOscillator(),g2=websiteAudioCtx.createGain();o2.frequency.value=1040;g2.gain.value=.0001;o2.connect(g2);g2.connect(websiteAudioCtx.destination);const x=websiteAudioCtx.currentTime;g2.gain.exponentialRampToValueAtTime(.16,x+.02);g2.gain.exponentialRampToValueAtTime(.0001,x+.38);o2.start(x);o2.stop(x+.4)}catch{}},180);
  }catch{}
}
function showWebsiteOrderAlert(w){
  document.querySelectorAll('.website-global-alert').forEach(x=>x.remove());
  const el=document.createElement('div');el.className='website-global-alert';
  el.innerHTML=`<div class="website-alert-icon">🌐</div><div class="website-alert-copy"><b>طلب جديد من الموقع</b><span>WEB-${String(w.id).padStart(5,'0')} • ${esc(w.customer_name||'عميل')} • ${money(w.total)}</span></div><button class="website-alert-open" type="button">عرض الطلب</button><button class="website-alert-close" type="button" aria-label="إغلاق">×</button>`;
  document.body.appendChild(el);requestAnimationFrame(()=>el.classList.add('show'));websiteOrderBeep();
  el.querySelector('.website-alert-open').onclick=()=>{el.remove();showPage('deliveryOrders')};
  el.querySelector('.website-alert-close').onclick=()=>el.remove();
}
async function checkWebsiteOrders(){
  if(!session?.access_token||!state.employee||!state.activeBranchId||!canAccessPage('deliveryOrders'))return;
  try{
    const rows=await rest('website_orders',`select=id,customer_name,total,created_at&branch_id=eq.${currentBranchId()}&status=eq.pending&order=created_at.asc&limit=100`);
    const list=rows||[];
    const ids=new Set(list.map(x=>String(x.id)));

    // أول فحص بعد الدخول/اختيار الفرع: لو فيه طلبات معلقة، ننبّه بأحدث طلب بدل ما نعتبرها كلها "مقروءة".
    if(!websiteOrderWatchPrimed){
      knownWebsiteOrderIds=ids;
      websiteOrderWatchPrimed=true;
      if(list.length) showWebsiteOrderAlert(list[list.length-1]);
      return;
    }

    const fresh=list.filter(x=>!knownWebsiteOrderIds.has(String(x.id)));
    knownWebsiteOrderIds=ids;
    if(fresh.length) showWebsiteOrderAlert(fresh[fresh.length-1]);
  }catch(e){console.warn('website order watch',e)}
}
function startWebsiteOrderWatch(){
  clearInterval(websiteOrderWatchTimer);
  websiteOrderWatchPrimed=false;
  knownWebsiteOrderIds=new Set();
  checkWebsiteOrders();
  websiteOrderWatchTimer=setInterval(checkWebsiteOrders,5000);
}

// لو رجع للشاشة أو فتح التبويب بعد ما كان بالخلفية، افحص فورًا بدل انتظار المؤقت.
window.addEventListener('focus',()=>{if(state.activeBranchId)checkWebsiteOrders()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.activeBranchId)checkWebsiteOrders()});
const money=n=>`${Number(n||0).toFixed(2)} ${state.business?.currency_symbol||'ج.م'}`;
const fmtDate=s=>new Date(s).toLocaleString('ar-EG');
function toast(m){const e=$('#toast');e.textContent=m;e.style.display='block';setTimeout(()=>e.style.display='none',2600)}
function uiPrompt(message,defaultValue='',opts={}){return new Promise(resolve=>{const m=document.createElement('div');m.className='modal app-dialog';const type=opts.type||'text';const danger=opts.danger?' dialog-danger':'';m.innerHTML=`<div class="modal-card app-dialog-card${danger}"><div class="dialog-icon">${opts.icon||'✏️'}</div><h2>${esc(opts.title||'إدخال البيانات')}</h2><p class="dialog-message">${esc(message)}</p><input class="dialog-input" type="${esc(type)}" value="${esc(defaultValue)}" ${opts.placeholder?`placeholder="${esc(opts.placeholder)}"`:''} autocomplete="off"><div class="modal-actions"><button class="secondary" data-dialog-cancel>إلغاء</button><button class="primary" data-dialog-ok>${esc(opts.okText||'حفظ')}</button></div></div>`;document.body.appendChild(m);const input=m.querySelector('.dialog-input');setTimeout(()=>{input.focus();if(type!=='password')input.select()},30);let done=false;const finish=v=>{if(done)return;done=true;m.remove();resolve(v)};m.addEventListener('click',e=>{if(e.target===m||e.target.closest('[data-dialog-cancel]'))finish(null);if(e.target.closest('[data-dialog-ok]'))finish(input.value)});input.addEventListener('keydown',e=>{if(e.key==='Enter')finish(input.value);if(e.key==='Escape')finish(null)})})}
function uiConfirm(message,opts={}){return new Promise(resolve=>{const m=document.createElement('div');m.className='modal app-dialog';const danger=opts.danger?' dialog-danger':'';m.innerHTML=`<div class="modal-card app-dialog-card${danger}"><div class="dialog-icon">${opts.icon||(opts.danger?'⚠️':'✓')}</div><h2>${esc(opts.title||'تأكيد العملية')}</h2><p class="dialog-message">${esc(message)}</p><div class="modal-actions"><button class="secondary" data-dialog-no>${esc(opts.cancelText||'إلغاء')}</button><button class="${opts.danger?'danger':'primary'}" data-dialog-yes>${esc(opts.okText||'تأكيد')}</button></div></div>`;document.body.appendChild(m);let done=false;const finish=v=>{if(done)return;done=true;m.remove();resolve(v)};m.addEventListener('click',e=>{if(e.target===m||e.target.closest('[data-dialog-no]'))finish(false);if(e.target.closest('[data-dialog-yes]'))finish(true)});document.addEventListener('keydown',function key(e){if(done)return document.removeEventListener('keydown',key);if(e.key==='Escape'){document.removeEventListener('keydown',key);finish(false)}})})}
function show(id){['activationView','setupView','loginView','appView'].forEach(x=>$('#'+x).classList.add('hidden'));$('#'+id).classList.remove('hidden')}
function headers(auth=true){return {'Content-Type':'application/json','apikey':cfg.key,...(auth&&session?.access_token?{Authorization:`Bearer ${session.access_token}`}:{})}}
async function req(path,opt={}){const r=await fetch(cfg.url+path,{...opt,headers:{...headers(opt.auth!==false),...(opt.headers||{})}});let d=null;try{d=await r.json()}catch{}if(!r.ok)throw new Error(d?.message||d?.error_description||d?.hint||`خطأ ${r.status}`);return d}
async function rest(table,query='',opt={}){return req(`/rest/v1/${table}${query?`?${query}`:''}`,opt)}
async function callFunction(name,payload={}){return req(`/functions/v1/${name}`,{method:'POST',body:JSON.stringify(payload)})}
async function rpc(name,payload={}){return req(`/rest/v1/rpc/${name}`,{method:'POST',body:JSON.stringify(payload)})}

// ===== V9.8 Offline Core =====
const OFFLINE_DB='topburger-pos-offline-v98', OFFLINE_STORE='kv';
function odb(){return new Promise((res,rej)=>{const r=indexedDB.open(OFFLINE_DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(OFFLINE_STORE))r.result.createObjectStore(OFFLINE_STORE)};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function odbGet(k){
  if(window.topBurgerDesktop?.db?.get){
    try{return await window.topBurgerDesktop.db.get(k)}catch(e){console.warn('desktop db get',e)}
  }
  const d=await odb();return new Promise((res,rej)=>{const t=d.transaction(OFFLINE_STORE,'readonly'),r=t.objectStore(OFFLINE_STORE).get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})
}
async function odbSet(k,v){
  if(window.topBurgerDesktop?.db?.set){
    try{await window.topBurgerDesktop.db.set(k,v);return v}catch(e){console.warn('desktop db set',e)}
  }
  const d=await odb();return new Promise((res,rej)=>{const t=d.transaction(OFFLINE_STORE,'readwrite');t.objectStore(OFFLINE_STORE).put(v,k);t.oncomplete=()=>res(v);t.onerror=()=>rej(t.error)})
}
async function offlineQueue(){
  let q=(await odbGet('queue'))||[];
  if(!q.length&&window.topBurgerDesktop?.operations?.list){
    try{const rows=await window.topBurgerDesktop.operations.list('pending');q=(rows||[]).map(r=>r.payload).filter(Boolean);if(q.length)await odbSet('queue',q)}catch(e){console.warn('recover pending queue',e)}
  }
  return q
}
async function setOfflineQueue(q){await odbSet('queue',q);try{if(window.topBurgerDesktop?.db?.set)await window.topBurgerDesktop.db.set('queueCount',q.length)}catch{}updatePendingSyncBadge(q.length);return q}
function updatePendingSyncBadge(n){let el=document.getElementById('pendingSyncBadge');if(!el){el=document.createElement('div');el.id='pendingSyncBadge';el.className='pending-sync-badge';document.body.appendChild(el)}const c=Number(n||0);el.textContent=c?`⟳ ${c} معلّقة`:'✓ متزامن';el.title=c?`${c} حركة في انتظار المزامنة`:'كل الحركات متزامنة';el.classList.toggle('has-pending',c>0);el.classList.toggle('all-synced',c===0);el.classList.toggle('is-hidden',c===0);if(c===0){clearTimeout(el._hideTimer);el._hideTimer=setTimeout(()=>el.classList.add('is-hidden'),900)}else el.classList.remove('is-hidden')}
async function refreshPendingSyncBadge(){try{updatePendingSyncBadge((await offlineQueue()).length)}catch{}}
async function removeQueuedOperation(clientTx){let q=await offlineQueue();q=q.filter(x=>x.client_tx_id!==clientTx);await setOfflineQueue(q);try{if(window.topBurgerDesktop?.operations?.status)await window.topBurgerDesktop.operations.status(clientTx,'synced',null)}catch{}return q}
function uuid(){return (crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`)}
function offlineOrderNo(){return Number(localStorage.getItem('offlineOrderNo')||0)+1}
function setOfflineOrderNo(n){localStorage.setItem('offlineOrderNo',String(n))}
function isNetError(e){const m=String(e?.message||e||'').toLowerCase();return !navigator.onLine||m.includes('failed to fetch')||m.includes('networkerror')||m.includes('load failed')}
async function cacheBootstrap(){try{await odbSet('bootstrap',{employee:state.employee,homeBranchId:state.homeBranchId,branches:state.branches,categories:state.categories,products:state.products,modifiers:state.modifiers,productModifiers:state.productModifiers,productVariants:state.productVariants,deliveryZones:state.deliveryZones,drivers:state.drivers,branchPrintSettings:state.branchPrintSettings,paymentMethods:state.paymentMethods,branchPaymentMethods:state.branchPaymentMethods,branchFinancialSettings:state.branchFinancialSettings,employeeBranches:state.employeeBranches,userPermissions:state.userPermissions,settings:state.settings,business:state.business,websiteSettings:state.websiteSettings,activeBranchId:state.activeBranchId,at:new Date().toISOString()})}catch(e){console.warn('offline cache',e)}}
async function loadOfflineBootstrap(){const c=await odbGet('bootstrap');if(!c?.employee)throw new Error('لا توجد بيانات محفوظة للعمل بدون إنترنت على هذا الجهاز');Object.assign(state,c);applyBusinessBranding();$('#who').textContent=`${state.employee.name} • ${state.employee.role}`;refreshBranchChrome();applyRoleNavigation();show('appView');showOfflineStatus();if(state.activeBranchId)showPage('pos');else renderBranchPicker()}
function showOfflineStatus(){let el=document.getElementById('offlineStatus');if(!el){el=document.createElement('div');el.id='offlineStatus';document.body.appendChild(el)}const off=!navigator.onLine;el.textContent=off?'⚠️ أوفلاين':'✓ متصل';el.title=off?'وضع أوفلاين — الحركات محفوظة على الجهاز وستتزامن تلقائيًا':'الجهاز متصل بالإنترنت';el.className=off?'offline-status offline':'offline-status online';setTimeout(()=>{if(navigator.onLine)el.classList.add('fade')},1800)}
async function refreshOfflineCustomerCache(){
  if(!navigator.onLine)return;
  try{const customers=await fetchAll('customers','select=id,name,phone,area,address,updated_at');await odbSet('customersCache',customers);const addresses=await fetchAll('customer_addresses','select=*');await odbSet('customerAddressesCache',addresses);await odbSet('customersCacheAt',new Date().toISOString())}catch(e){console.warn('customer offline cache',e)}
}
async function cachedCustomerByPhone(raw){const normalized=normalizePhone(raw),all=(await odbGet('customersCache'))||[];const tail=normalized.slice(-10);return all.find(c=>normalizePhone(c.phone)===normalized)||all.find(c=>normalizePhone(c.phone).slice(-10)===tail)||null}
async function cachedAddressesForCustomer(id){return ((await odbGet('customerAddressesCache'))||[]).filter(a=>String(a.customer_id)===String(id)).sort((a,b)=>Number(b.is_default===true)-Number(a.is_default===true)||Number(b.id||0)-Number(a.id||0))}
async function cachedOpenShift(){return await odbGet(`openShift:${state.employee?.id}:${currentBranchId()}`)}
async function rememberOpenShift(sh){if(sh)await odbSet(`openShift:${state.employee?.id}:${currentBranchId()}`,sh);return sh}
async function saveOfflineSale(orderPayload,itemPayload,payRows,providedClientTx=null){const q=await offlineQueue(),n=offlineOrderNo(),clientTx=providedClientTx||uuid(),created=new Date().toISOString();setOfflineOrderNo(n);const localId=`offline-${clientTx}`;const localOrder={...orderPayload,id:localId,client_tx_id:clientTx,invoice_number:`OFF-${n}`,bon_number:`OFF-${n}`,created_at:created,payment_status:'confirmed',_offline:true};const localItems=itemPayload.map((x,i)=>({...x,id:`${localId}-i${i+1}`,order_id:localId}));const job={type:'sale',client_tx_id:clientTx,created_at:created,p_order:{...orderPayload,client_tx_id:clientTx},p_items:itemPayload,p_payments:payRows,local_order:localOrder,local_items:localItems};q.push(job);await setOfflineQueue(q);try{if(window.topBurgerDesktop?.operations?.put)await window.topBurgerDesktop.operations.put(job)}catch{}return {order:localOrder,items:localItems,client_tx_id:clientTx}}
async function cacheOrderBundle(o,items=[]){if(!o?.id)return;const all=(await odbGet('cachedOrders'))||[];const next=[{order:o,items},...all.filter(x=>String(x.order?.id)!==String(o.id))].slice(0,250);await odbSet('cachedOrders',next)}
async function cachedOrderBundles(){return (await odbGet('cachedOrders'))||[]}
async function saveOfflineExpense(shift,description,amount,providedClientTx=null){const q=await offlineQueue(),clientTx=providedClientTx||uuid(),created=new Date().toISOString();const local={id:`offline-exp-${clientTx}`,branch_id:currentBranchId(),employee_id:state.employee.id,shift_id:shift.id,description,amount,created_at:created,_offline:true};const job={type:'expense',client_tx_id:clientTx,created_at:created,p_shift_id:Number(shift.id),p_description:description,p_amount:Number(amount),local_expense:local};q.push(job);await setOfflineQueue(q);try{if(window.topBurgerDesktop?.operations?.put)await window.topBurgerDesktop.operations.put(job)}catch{}return local}
async function saveOfflineReturn(o,selected,reason,notes,method,total,available,providedClientTx=null){const q=await offlineQueue(),clientTx=providedClientTx||uuid(),created=new Date().toISOString(),sh=await getOpenShift();const localReturn={id:`offline-ret-${clientTx}`,return_number:`OFF-${clientTx.slice(0,6)}`,branch_id:o.branch_id,order_id:o.id,shift_id:sh?.id,original_invoice_number:o.invoice_number,original_bon_number:o.bon_number,reason,notes,subtotal:total,total,created_at:created,_offline:true};const localItems=selected.map(x=>{const i=available.find(z=>String(z.id)===String(x.order_item_id));const unit=Number(i?.total||0)/Number(i?.quantity||1);return {return_id:localReturn.id,order_item_id:x.order_item_id,product_name:i?.product_name||'صنف',quantity:x.quantity,unit_refund:unit,total:unit*x.quantity}});const localPayments=[{return_id:localReturn.id,method,amount:total}];const job={type:'return',client_tx_id:clientTx,created_at:created,p_order_id:Number(o.id),p_reason:reason,p_notes:notes,p_items:selected,p_payments:[{method,amount:total}],local_return:localReturn,local_items:localItems,local_payments:localPayments};q.push(job);await setOfflineQueue(q);try{if(window.topBurgerDesktop?.operations?.put)await window.topBurgerDesktop.operations.put(job)}catch{}return {r:localReturn,items:localItems,payments:localPayments}}
async function saveOfflineShiftOpen(opening,providedClientTx=null){const q=await offlineQueue(),clientTx=providedClientTx||uuid(),created=new Date().toISOString(),localId=`offline-shift-${clientTx}`;const local={id:localId,branch_id:currentBranchId(),employee_id:state.employee.id,opening_cash:Number(opening||0),status:'open',opened_at:created,_offline:true,client_tx_id:clientTx};const job={type:'shift_open',client_tx_id:clientTx,created_at:created,p_branch_id:Number(currentBranchId()),p_opening_cash:Number(opening||0),local_shift_id:localId,local_shift:local};q.push(job);await setOfflineQueue(q);await rememberOpenShift(local);try{if(window.topBurgerDesktop?.operations?.put)await window.topBurgerDesktop.operations.put(job)}catch{}return local}
async function saveOfflineShiftClose(shift,metrics,actual,providedClientTx=null){const q=await offlineQueue(),clientTx=providedClientTx||uuid(),created=new Date().toISOString(),diff=Number(actual)-Number(metrics.expected||0);const local={...shift,closing_cash:Number(actual),closed_at:created,status:'closed',closed_by_employee_id:state.employee.id,sales_total:metrics.sales,cash_sales:metrics.cash,wallet_sales:metrics.wallet,instapay_sales:metrics.instapay,expenses_total:metrics.exp,expected_cash:metrics.expected,cash_difference:diff,orders_count:metrics.count,_offline:true};const job={type:'shift_close',client_tx_id:clientTx,created_at:created,p_shift_id:shift.id,p_closing_cash:Number(actual),p_metrics:{sales_total:metrics.sales,cash_sales:metrics.cash,wallet_sales:metrics.wallet,instapay_sales:metrics.instapay,expenses_total:metrics.exp,expected_cash:metrics.expected,cash_difference:diff,orders_count:metrics.count},local_shift_id:shift.id,local_shift:local};q.push(job);await setOfflineQueue(q);await odbSet(`openShift:${state.employee?.id}:${currentBranchId()}`,null);try{if(window.topBurgerDesktop?.operations?.put)await window.topBurgerDesktop.operations.put(job)}catch{}return local}
async function remapQueuedShift(localId,serverId){let q=await offlineQueue();for(const j of q){if(j.p_shift_id===localId)j.p_shift_id=Number(serverId);if(j.p_order?.shift_id===localId)j.p_order.shift_id=Number(serverId);if(j.local_order?.shift_id===localId)j.local_order.shift_id=Number(serverId);if(j.local_expense?.shift_id===localId)j.local_expense.shift_id=Number(serverId);if(j.local_return?.shift_id===localId)j.local_return.shift_id=Number(serverId)}await setOfflineQueue(q);return q}
function jwtExp(token){try{return Number(JSON.parse(atob(String(token||'').split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).exp||0)}catch{return 0}}
async function refreshSessionIfNeeded(force=false){
  if(!session?.refresh_token)return session;
  const exp=jwtExp(session.access_token),soon=!exp||(exp*1000-Date.now()<120000);
  if(!force&&!soon)return session;
  const d=await req('/auth/v1/token?grant_type=refresh_token',{method:'POST',auth:false,body:JSON.stringify({refresh_token:session.refresh_token})});
  session=d;resumeSession=d;localStorage.setItem('sbResumeSession',JSON.stringify(d));return d
}
async function syncOfflineQueue(){if(!navigator.onLine||!session?.access_token)return;try{await refreshSessionIfNeeded()}catch(e){console.warn('session refresh before sync',e);return;}let q=await offlineQueue();if(!q.length)return;let done=0;for(const job of [...q]){try{if(job.type==='shift_open'){const sh=await rpc('open_pos_shift_idempotent',{p_branch_id:job.p_branch_id,p_opening_cash:job.p_opening_cash,p_client_tx_id:job.client_tx_id});q=await remapQueuedShift(job.local_shift_id,sh.id);await rememberOpenShift(sh)}else if(job.type==='sale')await rpc('create_pos_order_atomic',{p_order:job.p_order,p_items:job.p_items,p_payments:job.p_payments});else if(job.type==='expense')await rpc('create_pos_expense_idempotent',{p_shift_id:Number(job.p_shift_id),p_description:job.p_description,p_amount:job.p_amount,p_client_tx_id:job.client_tx_id});else if(job.type==='return')await rpc('create_order_return_idempotent',{p_order_id:job.p_order_id,p_reason:job.p_reason,p_notes:job.p_notes,p_items:job.p_items,p_payments:job.p_payments,p_client_tx_id:job.client_tx_id});else if(job.type==='shift_close')await rpc('close_pos_shift_idempotent',{p_shift_id:Number(job.p_shift_id),p_closing_cash:job.p_closing_cash,p_metrics:job.p_metrics,p_client_tx_id:job.client_tx_id});q=(await offlineQueue()).filter(x=>x.client_tx_id!==job.client_tx_id);await setOfflineQueue(q);try{if(window.topBurgerDesktop?.operations?.status)await window.topBurgerDesktop.operations.status(job.client_tx_id,'synced',null)}catch{}done++}catch(e){console.warn('sync stopped',e);try{if(window.topBurgerDesktop?.operations?.status)await window.topBurgerDesktop.operations.status(job.client_tx_id,'pending',String(e?.message||e))}catch{}break}}if(done){await refreshPendingSyncBadge();toast(`تمت مزامنة ${done} حركة أوفلاين`)}}
window.addEventListener('online',()=>{showOfflineStatus();syncOfflineQueue()});window.addEventListener('offline',showOfflineStatus);setTimeout(refreshPendingSyncBadge,800);setInterval(()=>{if(navigator.onLine)syncOfflineQueue().catch(()=>{})},30000);

function bytesHex(buf){return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function offlinePasswordHash(password,saltHex){
  const salt=new Uint8Array((saltHex.match(/.{1,2}/g)||[]).map(x=>parseInt(x,16)));
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  return bytesHex(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:120000,hash:'SHA-256'},key,256));
}
async function rememberOfflineLogin(email,password){
  const salt=crypto.getRandomValues(new Uint8Array(16)),saltHex=bytesHex(salt);
  const hash=await offlinePasswordHash(password,saltHex);
  localStorage.setItem('offlineLoginVerifier',JSON.stringify({email:String(email).trim().toLowerCase(),salt:saltHex,hash}));
}
async function signIn(email,password){
  email=String(email||'').trim().toLowerCase();
  if(navigator.onLine){
    const d=await req('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:JSON.stringify({email,password})});
    session=d;resumeSession=d;localStorage.setItem('sbResumeSession',JSON.stringify(d));
    await rememberOfflineLogin(email,password);return d;
  }
  const v=JSON.parse(localStorage.getItem('offlineLoginVerifier')||'null');
  if(!v||v.email!==email||await offlinePasswordHash(password,v.salt)!==v.hash)throw new Error('بيانات الدخول غير صحيحة أو لم يتم تسجيل هذا المستخدم على الجهاز أثناء وجود الإنترنت');
  if(!resumeSession?.access_token)throw new Error('لا توجد جلسة محفوظة للعمل بدون إنترنت على هذا الجهاز');
  session=resumeSession;return session;
}
async function logout(){clearInterval(websiteOrderWatchTimer);websiteOrderWatchTimer=null;try{if(navigator.onLine&&session?.access_token)await req('/auth/v1/logout',{method:'POST'})}catch{}session=null;resumeSession=null;localStorage.removeItem('sbResumeSession');localStorage.removeItem('offlineLoginVerifier');state.employee=null;show('loginView')}
function businessName(){return state.business?.business_name||sharawlaRuntimeConfig?.business_name||'Sharawla POS'}
function businessTagline(){return state.business?.tagline||''}
function applyBusinessBranding(){
  document.title='Sharawla POS';
  const n=$('#appBrandName');if(n)n.textContent='Sharawla POS';
  const logo=$('#appBrandLogo');if(logo){const u=state.business?.logo_url||'';logo.src=u;logo.classList.toggle('hidden',!u)}
  const root=document.documentElement;
  if(state.business?.primary_color)root.style.setProperty('--business-primary',state.business.primary_color);
  if(state.business?.accent_color)root.style.setProperty('--business-accent',state.business.accent_color);
}
function branchName(id){return state.branches.find(b=>String(b.id)===String(id))?.name||''}
function driverName(id){return state.drivers.find(d=>String(d.id)===String(id))?.name||''}
function zoneName(id){return state.deliveryZones.find(z=>String(z.id)===String(id))?.name||''}
function employeeName(id,employees=[]){return employees.find(e=>String(e.id)===String(id))?.name||''}
function isAdmin(){return state.employee?.role==='admin'}
function isCallCenter(){return ['callcenter','delivery'].includes(state.employee?.role)}
function effectivePermissionSet(){
  if(isAdmin())return new Set(runtimeAllPages());
  if(Array.isArray(state.userPermissions)&&state.userPermissions.length){
    return new Set(['home',...state.userPermissions.filter(x=>x.allowed!==false).map(x=>x.permission_key)]);
  }
  return new Set(runtimeRolePages(state.employee?.role));
}
function hasFeaturePermission(key){
  if(isAdmin())return true;
  if(Array.isArray(state.userPermissions)&&state.userPermissions.length){
    return state.userPermissions.some(x=>x.permission_key===key&&x.allowed!==false);
  }
  return false;
}
function canAccessPage(page){
  if(!runtimeAllowsPage(page))return false;
  const allowed=effectivePermissionSet();
  if(page==='websiteManagement')return isAdmin()||allowed.has('branchProductAvailability')||allowed.has('websiteBranchSettings')||allowed.has('websiteAppearance')||allowed.has('financialSettings');
  if(page==='websiteBranchSettings')return isAdmin()||allowed.has('websiteBranchSettings');
  if(page==='websitePayments')return isAdmin()||allowed.has('financialSettings')||allowed.has('websiteAppearance');
  if(page==='websiteAppearance')return isAdmin()||allowed.has('websiteAppearance');
  if(page==='settings')return isAdmin()||allowed.has('settings')||allowed.has('businessSettings')||allowed.has('printingSettings')||allowed.has('financialSettings');
  if(!allowed.has(page))return false;
  if(page==='users')return isAdmin();
  return runtimeOperationalAllowsPage(page);
}
function applyRoleNavigation(){
  $$('#nav button[data-page]').forEach(b=>b.classList.toggle('hidden',!canAccessPage(b.dataset.page)));
}
function allowedBranchIds(){if(isAdmin())return state.branches.map(b=>Number(b.id));const ids=(state.employeeBranches||[]).map(x=>Number(x.branch_id));if(!ids.length&&state.employee?.branch_id)ids.push(Number(state.employee.branch_id));return [...new Set(ids)]}
function allowedBranches(){const ids=new Set(allowedBranchIds().map(String));return state.branches.filter(b=>ids.has(String(b.id)))}
function canSeeAllBranches(){return isAdmin()||allowedBranchIds().length>1}
function currentBranchId(){return Number(state.activeBranchId||state.homeBranchId||state.employee?.branch_id||0)}
function currentBranch(){return state.branches.find(b=>Number(b.id)===currentBranchId())||null}
function refreshBranchChrome(){
  const id=currentBranchId();
  if($('#branchName')) $('#branchName').textContent=id?`فرع ${branchName(id)}`:'اختر الفرع';
  const btn=$('#changeBranchBtn');
  if(btn){const multi=allowedBranches().length>1;btn.classList.toggle('hidden',!multi||!id);btn.textContent=id?`تغيير الفرع • ${branchName(id)}`:'تغيير الفرع';}
  const add=$('#addBranchBtn');
  if(add)add.classList.toggle('hidden',!hasFeaturePermission('branchManagement'));
  const manage=$('#manageBranchesBtn');
  if(manage)manage.classList.toggle('hidden',!hasFeaturePermission('branchManagement'));
}
function selectBranch(id){
  const bid=Number(id);
  if(!allowedBranchIds().includes(bid)) return toast('ليس لديك صلاحية لهذا الفرع');
  state.activeBranchId=bid;
  refreshBranchChrome();
  startWebsiteOrderWatch();
  showPage('home');
}
function renderBranchPicker(){
  state.activeBranchId=null;
  refreshBranchChrome();
  if($('#branchName')) $('#branchName').textContent='اختر الفرع';
  if($('#changeBranchBtn')) $('#changeBranchBtn').classList.add('hidden');
  $('#pageTitle').textContent='اختيار الفرع';
  $('#page').innerHTML=`<section class="branch-picker"><div class="branch-picker-head"><span>${esc(businessName().toUpperCase())} • POS</span><h1>اختار الفرع</h1><p>كل الطلبات والورديات والمصروفات والتقارير بعد الاختيار هتكون للفرع ده فقط.</p></div><div class="branch-picker-grid">${allowedBranches().map((b,i)=>`<button class="branch-pick-card ${i%2?'alt':''}" data-branch-pick="${b.id}"><span class="branch-pick-icon">🏪</span><div><b>${esc(b.name)}</b><small>الدخول إلى نظام الفرع</small></div><span>‹</span></button>`).join('')}</div></section>`;
  $('#page').onclick=e=>{const b=e.target.closest('[data-branch-pick]');if(b)selectBranch(b.dataset.branchPick)};
}

async function openCreateBranch(){
  if(!hasFeaturePermission('branchManagement'))return toast('ليس لديك صلاحية إدارة الفروع');
  const templates=state.branches.filter(b=>b.active!==false);
  const m=document.createElement('div');m.className='modal';
  m.innerHTML=`<div class="modal-card branch-create-modal"><div class="section-head"><div><h2>🏪 إضافة فرع جديد</h2><p class="muted">الفرع الجديد يتجهز تلقائيًا بنفس بنية النظام الحالية.</p></div></div>
  <form id="createBranchForm">
    <div class="form-grid">
      <label>اسم الفرع<input id="newBranchName" required placeholder="مثال: مدينة نصر"></label>
      <label>رقم الهاتف<input id="newBranchPhone" inputmode="tel" placeholder="اختياري"></label>
      <label>العنوان<input id="newBranchAddress" placeholder="اختياري"></label>
    </div>
    <label>استخدم فرع كنموذج
      <select id="newBranchTemplate"><option value="">الأسعار الأساسية + كل الأصناف متاحة</option>${templates.map(b=>`<option value="${b.id}" ${Number(b.id)===currentBranchId()?'selected':''}>نسخ إعدادات فرع ${esc(b.name)}</option>`).join('')}</select>
    </label>
    <div class="branch-create-summary">
      <b>سيتم تلقائيًا:</b>
      <span>✓ إضافة كل الأصناف للفرع</span>
      <span>✓ نسخ أسعار الفرع النموذج وحالات التوافر</span>
      <span>✓ إنشاء إعدادات الموقع ومدة التجهيز</span>
      <span>✓ إظهاره في اختيار الفروع والموقع</span>
      <small>الإيقافات المؤقتة الحالية لا تُنسخ للفرع الجديد، ومناطق الدليفري والموظفون يضافوا للفرع بعد الإنشاء لأنهم بيانات خاصة بالموقع الجديد.</small>
    </div>
    <label class="inline-check"><input id="newBranchWebsite" type="checkbox" checked> يظهر على الموقع</label>
    <div class="modal-actions"><button type="button" class="secondary" data-close>إلغاء</button><button type="submit" class="primary">➕ إنشاء الفرع كاملًا</button></div>
  </form></div>`;
  document.body.appendChild(m);
  m.onclick=e=>{if(e.target.closest('[data-close]')||e.target===m)m.remove()};
  m.querySelector('#createBranchForm').onsubmit=async e=>{
    e.preventDefault();
    const name=m.querySelector('#newBranchName').value.trim();if(!name)return toast('اكتب اسم الفرع');
    const submit=e.submitter; if(submit)submit.disabled=true;
    try{
      const id=Number(await rpc('create_branch_full',{
        p_name:name,
        p_phone:m.querySelector('#newBranchPhone').value.trim()||null,
        p_address:m.querySelector('#newBranchAddress').value.trim()||null,
        p_source_branch_id:m.querySelector('#newBranchTemplate').value?Number(m.querySelector('#newBranchTemplate').value):null,
        p_website_visible:m.querySelector('#newBranchWebsite').checked
      }));
      const fresh=await rest('branches','select=*&active=eq.true&order=sort_order,id');
      state.branches=fresh||state.branches;
      try{state.employeeBranches=await rest('employee_branches',`select=branch_id&employee_id=eq.${state.employee.id}`)}catch(_){ }
      m.remove();toast(`تم إنشاء فرع ${name} وتجهيزه بالكامل`);refreshBranchChrome();
      if(allowedBranchIds().includes(id))selectBranch(id);else renderBranchPicker();
    }catch(err){toast(err.message||'تعذر إنشاء الفرع')}finally{if(submit)submit.disabled=false}
  };
}

async function reloadBranches(){
  const fresh=await rest('branches','select=*&active=eq.true&order=sort_order,id');
  state.branches=fresh||[];
  try{state.employeeBranches=await rest('employee_branches',`select=branch_id&employee_id=eq.${state.employee.id}`)}catch(_){ }
  refreshBranchChrome();
}
async function openManageBranches(){
  if(!hasFeaturePermission('branchManagement'))return toast('ليس لديك صلاحية إدارة الفروع');
  let all=[];
  try{all=await rest('branches','select=*&order=sort_order,id')}catch(e){return toast(e.message)}
  const m=document.createElement('div');m.className='modal';
  const render=()=>{
    m.innerHTML=`<div class="modal-card branch-manage-modal"><div class="section-head"><div><h2>⚙️ إدارة الفروع</h2><p class="muted">تعديل بيانات الفرع أو ترتيبه أو إخفاؤه أو تعطيله بأمان.</p></div><button class="secondary" data-close>إغلاق</button></div>
    <div class="branch-admin-list">${all.map(b=>`<div class="branch-admin-card ${b.active===false?'is-disabled':''}">
      <div class="branch-admin-main"><div><b>${esc(b.name)}</b><small>${esc(b.phone||'بدون هاتف')} • ${b.active===false?'معطل':'فعال'} • ${b.website_visible===false?'مخفي من الموقع':'ظاهر بالموقع'}</small></div><span class="tag">ترتيب ${Number(b.sort_order||b.id)}</span></div>
      <div class="branch-admin-actions">
        <button class="secondary" data-edit-branch="${b.id}">✏️ تعديل</button>
        <button class="secondary" data-copy-branch="${b.id}">📋 نسخ إعدادات</button>
        <button class="secondary" data-toggle-site="${b.id}">${b.website_visible===false?'🌐 إظهار بالموقع':'🙈 إخفاء من الموقع'}</button>
        <button class="secondary" data-toggle-branch="${b.id}">${b.active===false?'♻️ إعادة تفعيل':'⛔ تعطيل'}</button>
        <button class="danger" data-delete-branch="${b.id}">🗑️ حذف آمن</button>
      </div>
    </div>`).join('')||'<div class="empty">لا توجد فروع</div>'}</div></div>`;
  };
  render();document.body.appendChild(m);
  const find=id=>all.find(x=>String(x.id)===String(id));
  m.onclick=async e=>{
    if(e.target.closest('[data-close]')||e.target===m){m.remove();return}
    const edit=e.target.closest('[data-edit-branch]');
    if(edit){const b=find(edit.dataset.editBranch);if(!b)return;const f=document.createElement('div');f.className='modal';f.innerHTML=`<form class="modal-card branch-edit-modal" id="branchEditForm"><h2>✏️ تعديل فرع ${esc(b.name)}</h2><div class="form-grid"><label>اسم الفرع<input id="beName" required value="${esc(b.name)}"></label><label>الهاتف<input id="bePhone" value="${esc(b.phone||'')}"></label><label>العنوان<input id="beAddress" value="${esc(b.address||'')}"></label><label>رابط اللوكيشن<input id="beLocation" value="${esc(b.location_url||'')}" placeholder="https://maps.google.com/..."></label><label>واتساب الفرع<input id="beWhatsapp" value="${esc(b.whatsapp||'')}" placeholder="01xxxxxxxxx"></label><label>ترتيب الظهور<input id="beSort" type="number" min="1" value="${Number(b.sort_order||b.id)}"></label></div><label class="inline-check"><input id="beWebsite" type="checkbox" ${b.website_visible===false?'':'checked'}> يظهر على الموقع</label><div class="modal-actions"><button type="button" class="secondary" data-close-edit>إلغاء</button><button class="primary" type="submit">حفظ</button></div></form>`;document.body.appendChild(f);f.onclick=x=>{if(x.target.closest('[data-close-edit]')||x.target===f)f.remove()};f.querySelector('#branchEditForm').onsubmit=async x=>{x.preventDefault();try{await rpc('update_branch_full',{p_branch_id:Number(b.id),p_name:f.querySelector('#beName').value.trim(),p_phone:f.querySelector('#bePhone').value.trim()||null,p_address:f.querySelector('#beAddress').value.trim()||null,p_website_visible:f.querySelector('#beWebsite').checked,p_sort_order:Number(f.querySelector('#beSort').value||b.sort_order||b.id)});await rest('branches',`id=eq.${b.id}`,{method:'PATCH',body:JSON.stringify({location_url:f.querySelector('#beLocation')?.value.trim()||null,whatsapp:f.querySelector('#beWhatsapp')?.value.trim()||null})});all=await rest('branches','select=*&order=sort_order,id');f.remove();render();await reloadBranches();toast('تم تعديل الفرع')}catch(err){toast(err.message)}};return}
    const site=e.target.closest('[data-toggle-site]');
    if(site){const b=find(site.dataset.toggleSite);if(!b)return;try{await rpc('update_branch_full',{p_branch_id:Number(b.id),p_name:b.name,p_phone:b.phone||null,p_address:b.address||null,p_website_visible:b.website_visible===false,p_sort_order:Number(b.sort_order||b.id)});all=await rest('branches','select=*&order=sort_order,id');render();await reloadBranches();toast('تم تحديث ظهور الفرع على الموقع')}catch(err){toast(err.message)}return}
    const tog=e.target.closest('[data-toggle-branch]');
    if(tog){const b=find(tog.dataset.toggleBranch);if(!b)return;if(Number(b.id)===currentBranchId()&&b.active!==false)return toast('غيّر للفرع الآخر قبل تعطيل الفرع الحالي');if(!await uiConfirm(`${b.active===false?'إعادة تفعيل':'تعطيل'} فرع ${b.name}؟`))return;try{await rpc('set_branch_active',{p_branch_id:Number(b.id),p_active:b.active===false});all=await rest('branches','select=*&order=sort_order,id');render();await reloadBranches();toast('تم تحديث حالة الفرع')}catch(err){toast(err.message)}return}
    const copy=e.target.closest('[data-copy-branch]');
    if(copy){const target=find(copy.dataset.copyBranch);if(!target)return;const sources=all.filter(x=>x.active!==false&&String(x.id)!==String(target.id));if(!sources.length)return toast('لا يوجد فرع آخر للنسخ منه');const src=await uiPrompt(`اكتب رقم الفرع الذي تريد النسخ منه إلى ${target.name}:\n${sources.map(x=>`${x.id} = ${x.name}`).join(' | ')}`);if(src===null)return;const source=sources.find(x=>String(x.id)===String(src.trim()));if(!source)return toast('رقم الفرع غير صحيح');if(!await uiConfirm(`نسخ الأسعار + التوافر + إعدادات الموقع من ${source.name} إلى ${target.name}؟`))return;try{await rpc('copy_branch_configuration',{p_source_branch_id:Number(source.id),p_target_branch_id:Number(target.id)});toast('تم نسخ إعدادات الفرع')}catch(err){toast(err.message)}return}
    const del=e.target.closest('[data-delete-branch]');
    if(del){const b=find(del.dataset.deleteBranch);if(!b)return;if(Number(b.id)===currentBranchId())return toast('لا يمكن حذف الفرع المفتوح حاليًا');if(!await uiConfirm(`حذف فرع ${b.name} نهائيًا؟\nلن يسمح النظام بالحذف إذا كان عليه أي حركة.`))return;try{await rpc('delete_branch_if_empty',{p_branch_id:Number(b.id)});all=await rest('branches','select=*&order=sort_order,id');render();await reloadBranches();toast('تم حذف الفرع الفارغ بأمان')}catch(err){toast(err.message)}return}
  };
}
function esc(v){return String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}
function localDateInput(d=new Date()){const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,10)}
function rangeISO(from,to){return {from:new Date(`${from}T00:00:00`).toISOString(),to:new Date(`${to}T23:59:59.999`).toISOString()}}
async function fetchAll(table,query='',pageSize=1000){let out=[],offset=0;while(true){const join=query?`${query}&`:'';const rows=await rest(table,`${join}limit=${pageSize}&offset=${offset}`);out.push(...(rows||[]));if(!rows||rows.length<pageSize)break;offset+=pageSize}return out}
async function getOpenShift(employeeId=state.employee.id,branchId=currentBranchId()){try{const rows=await rest('shifts',`select=*&employee_id=eq.${employeeId}&branch_id=eq.${branchId}&status=eq.open&closed_at=is.null&order=opened_at.desc&limit=1`);const sh=rows?.[0]||null;if(sh)await rememberOpenShift(sh);return sh}catch(e){if(isNetError(e))return cachedOpenShift();throw e}}
async function audit(action,entityType,entityId,details={}){try{await rest('audit_logs','',{method:'POST',body:JSON.stringify([{employee_id:state.employee.id,branch_id:currentBranchId(),action,entity_type:entityType,entity_id:entityId||null,details}])})}catch(e){}}

async function bootstrap(){
  const [emps,branches,cats,products,branchProducts,settingsRows,modifiers,productModifiers,productVariants,zones,drivers,printSettings,paymentMethods,branchPaymentMethods,branchFinancialSettings]=await Promise.all([
    rest('employees','select=*&auth_user_id=eq.'+session.user.id+'&active=eq.true'),
    rest('branches','select=*&active=eq.true&order=sort_order,id'),
    rest('categories','select=*&active=eq.true&order=sort_order'),
    rest('products','select=*&active=eq.true&order=id'),
    rest('branch_products','select=*').catch(()=>[]),
    rest('app_settings','select=key,value'),
    rest('modifiers','select=*&active=eq.true&order=id'),
    rest('product_modifiers','select=*'),
    rest('product_variants','select=*&active=eq.true&order=sort_order,id'),
    rest('delivery_zones','select=*&active=eq.true&order=name'),
    rest('delivery_drivers','select=*&active=eq.true&order=name'),
    rest('branch_print_settings','select=*'),
    rest('payment_methods','select=*&active=eq.true&order=sort_order,id').catch(()=>[]),
    rest('branch_payment_methods','select=*').catch(()=>[]),
    rest('branch_financial_settings','select=*').catch(()=>[])
  ]);
  if(!emps?.length)throw new Error('الحساب غير مربوط بموظف في النظام');
  try{const br=await rest('business_settings','select=*&id=eq.1&limit=1');if(br?.[0])state.business={...state.business,...br[0]}}catch(e){}
  try{const wr=await rest('website_settings','select=*&id=eq.1&limit=1');if(wr?.[0])state.websiteSettings=wr[0]}catch(e){state.websiteSettings=null}
  state.employee=emps[0];state.homeBranchId=Number(emps[0].branch_id||0);state.branches=branches||[];state.categories=cats||[];state.products=products||[];state.branchProducts=branchProducts||[];state.modifiers=modifiers||[];state.productModifiers=productModifiers||[];state.productVariants=productVariants||[];state.deliveryZones=zones||[];state.drivers=drivers||[];state.branchPrintSettings=printSettings||[];state.paymentMethods=paymentMethods||[];state.branchPaymentMethods=branchPaymentMethods||[];state.branchFinancialSettings=branchFinancialSettings||[];try{state.employeeBranches=await rest('employee_branches',`select=branch_id&employee_id=eq.${state.employee.id}`)}catch(e){state.employeeBranches=[]}try{state.userPermissions=await rest('employee_permissions',`select=permission_key,allowed&employee_id=eq.${state.employee.id}`)}catch(e){state.userPermissions=null}for(const r of (settingsRows||[])){if(r.key in state.settings)state.settings[r.key]=String(r.value)==='true';}
  applyBusinessBranding();
  $('#who').textContent=`${state.employee.name} • ${state.employee.role}`;
  const allowed=allowedBranches();
  const allowedIds=allowedBranchIds();
  // مستخدم الفرع الواحد يدخل فرعه مباشرة حتى لو قائمة branches تأخرت/كانت مقيدة بـRLS.
  state.activeBranchId=allowed.length===1?Number(allowed[0].id):((!isAdmin()&&allowedIds.length===1)?Number(allowedIds[0]):null);
  if(!state.activeBranchId && !isAdmin() && state.homeBranchId && allowedIds.includes(Number(state.homeBranchId))) state.activeBranchId=Number(state.homeBranchId);
  refreshBranchChrome();
  applyRoleNavigation();
  show('appView');if(state.activeBranchId){startWebsiteOrderWatch();showPage('home')}else renderBranchPicker();
  await cacheBootstrap();showOfflineStatus();syncOfflineQueue();setTimeout(()=>refreshOfflineCustomerCache(),1200);setTimeout(()=>maybeDesktopDailyBackup(),5000);
}

if($('#retryLicenseBtn'))$('#retryLicenseBtn').addEventListener('click',()=>retryExistingSharawlaLicense());
if($('#changeLicenseBtn'))$('#changeLicenseBtn').addEventListener('click',async()=>{
  const pending=await offlineQueue();
  if(pending.length)return toast(`لا يمكن تغيير الترخيص الآن: يوجد ${pending.length} حركة أوفلاين في انتظار المزامنة. وصّل الإنترنت وانتظر اكتمال المزامنة أولًا.`);
  if(!confirm('سيتم فك الربط المحلي وتنظيف بيانات النشاط المحفوظة على هذا الجهاز ثم إظهار خانة كود الترخيص. النسخ الاحتياطية لن تُحذف. متابعة؟'))return;
  await clearBusinessLocalStateForLicenseChange();
  await clearLicenseState();
  stopLicenseRetry();
  await showActivation('أدخل كود الترخيص الجديد الخاص بهذا الجهاز.');
});

if($('#activationForm'))$('#activationForm').addEventListener('submit',async e=>{
  e.preventDefault();const btn=$('#activateBtn');
  try{
    btn.disabled=true;
    if(!navigator.onLine)throw new Error('أول تفعيل يحتاج اتصال بالإنترنت');
    if(!sharawlaDeviceInfo)sharawlaDeviceInfo=await window.topBurgerDesktop.device.info();
    const key=$('#licenseKey').value.trim().toUpperCase();
    const d=await cloudRpc('activate_sharawla_device',{p_license_key:key,p_device_fingerprint:sharawlaDeviceInfo.fingerprint,p_device_name:sharawlaDeviceInfo.name,p_app_version:sharawlaDeviceInfo.version,p_operating_system:sharawlaDeviceInfo.os});
    if(!d?.ok)throw new Error(d?.message||'فشل التفعيل');
    const nextState={device_id:d.device_id,device_fingerprint:sharawlaDeviceInfo.fingerprint,business_id:d.business_id,business_name:d.business_name,offline_grace_days:d.offline_grace_days,last_verified_at:new Date().toISOString()};
    await saveLicenseState(nextState);
    await ensureSharawlaSupportCode(nextState);
    toast('تم تفعيل الجهاز بنجاح');setTimeout(()=>location.reload(),500);
  }catch(err){toast(err.message)}finally{btn.disabled=false}
});
$('#setupForm').addEventListener('submit',async e=>{e.preventDefault();const url=$('#supabaseUrl').value.trim().replace(/\/$/,'');const key=$('#publishableKey').value.trim();if(!/^https:\/\/.+\.supabase\.co$/.test(url))return toast('راجع Project URL');if(!key.startsWith('sb_'))return toast('راجع Publishable key');localStorage.setItem('sbUrl',url);localStorage.setItem('sbKey',key);location.reload()});

$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();try{await signIn($('#email').value.trim(),$('#password').value);if(navigator.onLine)await bootstrap();else await loadOfflineBootstrap()}catch(err){session=null;toast(err.message)}});
if($('#logoutBtn'))$('#logoutBtn').onclick=logout;if($('#logoutMenuBtn'))$('#logoutMenuBtn').onclick=logout;
function setSidebarOpen(open){const sb=$('.sidebar');if(!sb)return;sb.classList.toggle('open',!!open)}
if($('#menuBtn'))$('#menuBtn').onclick=()=>setSidebarOpen(!$('.sidebar')?.classList.contains('open'));
if($('#sidebarCloseBtn'))$('#sidebarCloseBtn').onclick=()=>setSidebarOpen(false);
$('#changeBranchBtn').onclick=()=>renderBranchPicker();if($('#addBranchBtn'))$('#addBranchBtn').onclick=openCreateBranch;if($('#manageBranchesBtn'))$('#manageBranchesBtn').onclick=openManageBranches;
$('#nav').onclick=e=>{const b=e.target.closest('button[data-page]');if(b)showPage(b.dataset.page)};
setInterval(()=>{if($('#clock'))$('#clock').textContent=new Date().toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})},1000);
function navActive(p){$$('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===p));setSidebarOpen(false)}
async function showPage(p){try{if(!state.activeBranchId){renderBranchPicker();return;}if(!canAccessPage(p)){toast('ليس لديك صلاحية لفتح هذا القسم');return showPage('home');}navActive(p);$('#pageTitle').textContent=runtimePageTitle(p);await ({home:renderHome,pos:renderPOS,orders:renderOrders,returns:renderReturns,customers:renderCustomers,deliveryOrders:renderDeliveryOrders,deliverySettings:renderDeliverySettings,delivery:renderDeliveryOrders,kitchen:renderKitchen,shifts:renderShifts,inventory:renderInventory,expenses:renderExpenses,products:renderProducts,promoCodes:renderPromoCodes,branchProductAvailability:renderWebsiteAvailability,websiteManagement:renderWebsiteManagement,websiteBranchSettings:renderWebsiteBranchSettings,websitePayments:renderWebsitePayments,websiteAppearance:renderWebsiteAppearance,reports:renderReports,users:renderUsers,settings:renderSettings}[p]||renderPOS)()}catch(e){toast(e.message)}}


async function renderHome(){
  const ids=[currentBranchId()];
  let activeDelivery=[], openShift=null;
  try{activeDelivery=await rest('orders','select=id,status,branch_id&order_type=eq.delivery&status=in.(new,ready,out_for_delivery)&order=created_at.desc&limit=200')}catch(e){}
  try{openShift=await getOpenShift()}catch(e){}
  activeDelivery=(activeDelivery||[]).filter(o=>ids.includes(Number(o.branch_id)));
  const cards=[
    ['pos','🧾','الكاشير','بيع وإنشاء أوردر جديد','mint'],
    ['deliveryOrders','🛵','طلبات الدليفري',`${activeDelivery.length} طلب نشط`,'amber'],
    ['orders','📋','الطلبات','متابعة وطباعة الطلبات','blue'],
    ['returns','↩️','المرتجعات','مرتجع كلي أو جزئي من الفاتورة','rose'],
    ['customers','👤','العملاء','بحث وبيانات العملاء','violet'],
    ['shifts','🕘','الورديات',openShift?'الوردية مفتوحة 🟢':'لا توجد وردية مفتوحة','green'],
    ['reports','📊','التقارير','المبيعات والورديات والتحليلات','blue'],
    ['expenses','💸','المصروفات','تسجيل ومراجعة المصروفات','rose'],
    ['products','🍔','الأصناف','الأصناف والأسعار','amber'],
    ['websiteManagement','🌐','إدارة الموقع','التحكم في الموقع وتوافر الأصناف','green'],
    ['deliverySettings','📍','إعدادات الدليفري','المناطق والمناديب والتسويات','violet'],
    ['users','👥','المستخدمون والصلاحيات','الفروع وصلاحيات الموظفين','blue'],
    ['settings','⚙️','الإعدادات','تشغيل وإيقاف المميزات','slate']
  ];
  const visible=cards.filter(c=>canAccessPage(c[0]));
  $('#page').innerHTML=`<section class="home-hero"><div><span class="home-kicker">${esc(businessName().toUpperCase())} • POS</span><h1>أهلاً ${esc(state.employee.name)}</h1><p>فرع ${esc(branchName(currentBranchId()))}</p></div><div class="home-shift ${openShift?'is-open':''}"><span>${openShift?'● الوردية مفتوحة':'○ الوردية مغلقة'}</span>${openShift?`<small>من ${fmtDate(openShift.opened_at)}</small>`:''}</div></section><section class="home-grid">${visible.map(c=>`<button class="home-card tone-${c[4]}" data-home-page="${c[0]}"><span class="home-icon">${c[1]}</span><span class="home-copy"><b>${c[2]}</b><small>${c[3]}</small></span><span class="home-arrow">‹</span></button>`).join('')}<button class="home-card tone-rose" data-home-logout><span class="home-icon">🚪</span><span class="home-copy"><b>تسجيل الخروج</b><small>الخروج من حساب المستخدم الحالي</small></span><span class="home-arrow">‹</span></button></section>`;
  $('#page').onclick=e=>{const b=e.target.closest('[data-home-page]');if(b)return showPage(b.dataset.homePage);if(e.target.closest('[data-home-logout]'))logout()};
}

function financialCfg(branchId=currentBranchId()){return state.branchFinancialSettings.find(x=>Number(x.branch_id)===Number(branchId))||{branch_id:Number(branchId),discount_enabled:true,discount_mode:'both',max_discount_percent:100,tax_enabled:false,tax_rate:0,prices_include_tax:true,service_enabled:false,service_rate:0};}
function branchPaymentList(branchId=currentBranchId()){const rows=state.branchPaymentMethods.filter(x=>Number(x.branch_id)===Number(branchId)&&x.active!==false);let list=rows.map(r=>{const m=state.paymentMethods.find(x=>Number(x.id)===Number(r.payment_method_id));return m?{...m,is_default:r.is_default===true}:null}).filter(Boolean);if(!list.length)list=state.paymentMethods.filter(x=>x.active!==false).map((m,i)=>({...m,is_default:i===0}));return list.sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)||Number(a.id)-Number(b.id));}
function bonDisplay(o){return Number(o?.bon_number)>0?String(o.bon_number):(o?.order_number||'#'+o?.id);}
async function updateNextBonBadge(){const el=$('#nextBonBadge');if(!el)return;try{const sh=await getOpenShift();if(!sh){el.innerHTML='<span>رقم البون التالي</span><b>—</b><small>افتح وردية</small>';return}const r=await rest('shift_bon_counters',`select=next_number&shift_id=eq.${sh.id}&limit=1`).catch(()=>[]);let next=Number(r?.[0]?.next_number||0);if(!next){const oo=await rest('orders',`select=bon_number&shift_id=eq.${sh.id}&order=bon_number.desc&limit=1`).catch(()=>[]);next=Number(oo?.[0]?.bon_number||0)+1}el.innerHTML=`<span>رقم البون التالي</span><b>${next||1}</b><small>وردية #${sh.id}</small>`}catch(e){el.innerHTML='<span>رقم البون التالي</span><b>—</b>'}}
function invoiceDisplay(o){return Number(o?.invoice_number)>0?String(o.invoice_number):'-';}
function discountAllowed(){return isAdmin()||hasFeaturePermission('discount');}
function renderPOS(){
 $('#page').innerHTML=`<div class="pos-layout"><section class="catalog">
 <div class="catalog-tools"><input id="productSearch" placeholder="🔎 بحث سريع عن صنف"></div>
 <div class="cat-tabs" id="catTabs"><button data-cat="all" class="active">الكل</button>${state.categories.map(c=>`<button data-cat="${c.id}">${esc(c.name)}</button>`).join('')}</div>
 <div class="products-grid" id="productsGrid"></div></section>
 <aside class="cart">
  <div class="next-bon-badge" id="nextBonBadge"><span>رقم البون التالي</span><b>...</b></div><div class="cart-head sales-head">
   <select id="orderType"><option value="takeaway">تيك أواي</option>${state.settings.enable_delivery&&moduleEnabled('delivery')?`<option value="delivery">دليفري</option>`:''}<option value="dinein">صالة</option></select>
   <input id="customerPhone" inputmode="tel" placeholder="رقم العميل">
   <input id="customerName" placeholder="اسم العميل">
  </div>
  <div id="deliveryFields" class="delivery-fields hidden">
   <select id="deliveryBranch" disabled><option value="${currentBranchId()}" selected>${esc(branchName(currentBranchId()))}</option></select>
   <select id="deliveryZone"><option value="">اختر المنطقة</option>${state.deliveryZones.filter(z=>String(z.branch_id)===String(currentBranchId())).map(z=>`<option value="${z.id}" data-fee="${z.delivery_fee}" data-branch="${z.branch_id||''}">${esc(z.name)} — ${money(z.delivery_fee)}</option>`).join('')}</select>
   <div class="delivery-fee-control">
    <label class="delivery-fee-manual">رسوم التوصيل<input id="manualDeliveryFee" type="number" min="0" step="0.01" inputmode="decimal" placeholder="اكتب رسوم التوصيل"></label>
   </div>
   <select id="savedCustomerAddress" class="hidden"><option value="">اختر عنوان محفوظ</option></select>
   <textarea id="deliveryAddress" rows="2" placeholder="عنوان التوصيل"></textarea>
   <select id="deliveryDriver"><option value="">المندوب — يحدد لاحقًا</option></select>
  </div>
  <div id="customerHint" class="customer-hint"></div>
  <div class="cart-items" id="cartItems"></div>
  <div class="cart-foot">
   <div class="totline"><span>الإجمالي الفرعي</span><b id="subtotal">0</b></div>
   ${financialCfg().discount_enabled&&discountAllowed()?`<div class="totline discount-row"><span>خصم</span><div style="display:flex;gap:6px"><select id="discountType" style="width:82px">${financialCfg().discount_mode!=='percent'?'<option value="amount">مبلغ</option>':''}${financialCfg().discount_mode!=='amount'?'<option value="percent">%</option>':''}</select><input id="discount" type="number" min="0" value="0" style="width:90px;padding:5px"></div></div>`:''}${moduleEnabled('promocodes')?`<div class="promo-pos-box"><div class="promo-pos-entry"><input id="posPromoCode" placeholder="برومو كود" autocomplete="off"><button id="applyPosPromo" class="secondary" type="button">تطبيق</button></div><div id="posPromoResult" class="promo-pos-result hidden"></div></div>`:''}<div class="totline" id="taxLine"><span>الضريبة</span><b id="taxAmount">0</b></div><div class="totline" id="serviceLine"><span>الخدمة</span><b id="serviceAmount">0</b></div>
   <div class="totline delivery-total hidden" id="deliveryFeeLine"><span>الدليفري</span><b id="deliveryFee">0</b></div>
   <div class="totline grand"><span>المطلوب</span><span id="grand">0</span></div>
   <div class="pay-actions">${branchPaymentList().map((m,i)=>`<button class="${m.is_default?'primary':'secondary'}" data-pay="${esc(m.code)}">${esc(m.name)}</button>`).join('')}${state.settings.enable_mixed_payment&&branchPaymentList().length>1?'<button class="secondary" data-mixed-pay>➗ دفع مختلط</button>':''}</div>
  </div>
 </aside></div>`;
 $('#catTabs').onclick=e=>{const b=e.target.closest('button');if(!b)return;state.cat=b.dataset.cat;$$('#catTabs button').forEach(x=>x.classList.toggle('active',x===b));drawProducts()};
 $('#productSearch').oninput=drawProducts;
 if($('#discount'))$('#discount').oninput=drawCart;if($('#discountType'))$('#discountType').onchange=drawCart;if($('#applyPosPromo'))$('#applyPosPromo').onclick=applyPosPromo;
 $('#orderType').onchange=()=>{toggleDeliveryFields();drawCart()};
 $('#deliveryZone')?.addEventListener('change',e=>{
   const opt=e.target.selectedOptions[0];
   if($('#deliveryBranch')) $('#deliveryBranch').value=currentBranchId();
   if($('#manualDeliveryFee')) $('#manualDeliveryFee').value=opt?.dataset?.fee??'';
   refreshDeliveryDrivers();drawCart();
 });
 $('#manualDeliveryFee')?.addEventListener('input',drawCart);
 $('#deliveryBranch')?.addEventListener('change',refreshDeliveryDrivers);
 $('#savedCustomerAddress')?.addEventListener('change',applySavedCustomerAddress);
 let customerLookupTimer; $('#customerPhone').addEventListener('input',()=>{clearTimeout(customerLookupTimer);customerLookupTimer=setTimeout(lookupCustomerByPhone,350)}); $('#customerPhone').addEventListener('blur',lookupCustomerByPhone);
 $('.pay-actions').onclick=e=>{const b=e.target.closest('[data-pay]');if(b)return checkout(b.dataset.pay);if(e.target.closest('[data-mixed-pay]'))return openMixedPayment()};
 toggleDeliveryFields();refreshDeliveryDrivers();drawProducts();drawCart();updateNextBonBadge();
}
function refreshDeliveryDrivers(){const el=$('#deliveryDriver');if(!el)return;const branch=currentBranchId();const current=el.value;const list=state.drivers.filter(d=>d.active!==false&&(!branch||String(d.branch_id)===String(branch)));el.innerHTML='<option value="">المندوب — يحدد لاحقًا</option>'+list.map(d=>`<option value="${d.id}">${esc(d.name)}${d.phone?` — ${esc(d.phone)}`:''}</option>`).join('');if(list.some(d=>String(d.id)===String(current)))el.value=current;}

function toggleDeliveryFields(){
 const delivery=$('#orderType')?.value==='delivery';
 $('#deliveryFields')?.classList.toggle('hidden',!delivery);
 $('#deliveryFeeLine')?.classList.toggle('hidden',!delivery);
}
function normalizePhone(v){
 const ar='٠١٢٣٤٥٦٧٨٩', fa='۰۱۲۳۴۵۶۷۸۹';
 let x=String(v||'').replace(/[٠-٩]/g,c=>String(ar.indexOf(c))).replace(/[۰-۹]/g,c=>String(fa.indexOf(c))).replace(/\D/g,'');
 if(x.startsWith('0020'))x=x.slice(4); else if(x.startsWith('20')&&x.length>=12)x=x.slice(2);
 if(x.length===10&&x.startsWith('1'))x='0'+x;
 return x;
}
function phoneCandidates(v){
 const n=normalizePhone(v); if(!n)return [];
 const out=[n]; if(n.startsWith('0')){out.push('20'+n.slice(1),'+20'+n.slice(1),'0020'+n.slice(1));}
 return [...new Set(out)];
}
function findZoneByArea(area){
 const a=String(area||'').trim(); if(!a)return null;
 return state.deliveryZones.find(x=>String(x.name||'').trim()===a)||state.deliveryZones.find(x=>String(x.name||'').trim().includes(a)||a.includes(String(x.name||'').trim()))||null;
}
function applyCustomerAddress(addr, fallback={}){
 if(!addr&&!fallback)return;
 const address=(addr?.address||fallback.address||'').trim();
 const area=(addr?.area||fallback.area||'').trim();
 const directZoneId=addr?.delivery_zone_id||fallback.delivery_zone_id||null;
 if($('#deliveryAddress'))$('#deliveryAddress').value=address;
 let z=null;
 if(directZoneId)z=state.deliveryZones.find(x=>String(x.id)===String(directZoneId))||null;
 if(!z&&area)z=findZoneByArea(area);
 if(z&&$('#deliveryZone')){
   $('#deliveryZone').value=z.id;
   if($('#deliveryBranch'))$('#deliveryBranch').value=currentBranchId();
   if($('#manualDeliveryFee'))$('#manualDeliveryFee').value=Number(z.delivery_fee||0);
   refreshDeliveryDrivers();
 }else{
   if($('#deliveryZone'))$('#deliveryZone').value='';
   if($('#manualDeliveryFee'))$('#manualDeliveryFee').value='';
 }
 drawCart();
}
function applySavedCustomerAddress(){
 const el=$('#savedCustomerAddress'); if(!el||!state.customerAddresses)return;
 const a=state.customerAddresses.find(x=>String(x.id)===String(el.value));
 if(a)applyCustomerAddress(a,state.selectedCustomer||{});
}
async function recentDeliveryForPhone(raw){
 const normalized=normalizePhone(raw); if(!normalized)return null;
 let rows=[];
 for(const cand of phoneCandidates(raw)){
   try{
     rows=await rest('orders',`select=id,customer_phone,customer_name,delivery_address,delivery_area,delivery_zone_id,branch_id,created_at&order_type=eq.delivery&customer_phone=eq.${encodeURIComponent(cand)}&order=created_at.desc&limit=10`);
     if(rows?.length)break;
   }catch(e){}
 }
 if(!rows?.length){
   try{
     const tail=normalized.slice(-8);
     const possible=await rest('orders',`select=id,customer_phone,customer_name,delivery_address,delivery_area,delivery_zone_id,branch_id,created_at&order_type=eq.delivery&customer_phone=ilike.*${encodeURIComponent(tail)}*&order=created_at.desc&limit=30`);
     rows=(possible||[]).filter(o=>normalizePhone(o.customer_phone).slice(-10)===normalized.slice(-10));
   }catch(e){}
 }
 return (rows||[]).find(o=>o.delivery_address||o.delivery_area||o.delivery_zone_id)||rows?.[0]||null;
}
async function lookupCustomerByPhone(){
 if(!state.settings.enable_customer_search)return;
 const input=$('#customerPhone'); if(!input)return;
 const raw=input.value.trim(), normalized=normalizePhone(raw);
 if(normalized.length<10)return;
 try{
   let rows=[];
   if(!navigator.onLine){const c=await cachedCustomerByPhone(raw);rows=c?[c]:[]}
   else{
     for(const cand of phoneCandidates(raw)){
       rows=await rest('customers',`select=*&phone=eq.${encodeURIComponent(cand)}&limit=1`);
       if(rows?.length)break;
     }
     if(!rows?.length){
       const tail=normalized.slice(-10);
       const possible=await rest('customers',`select=*&phone=ilike.*${encodeURIComponent(tail.slice(-8))}*&limit=25`);
       rows=(possible||[]).filter(c=>normalizePhone(c.phone).slice(-10)===tail).slice(0,1);
     }
   }
   if(rows?.length){
     const c=rows[0]; state.selectedCustomer=c;
     if($('#customerName'))$('#customerName').value=c.name||'';

     let adds=[];
     try{adds=navigator.onLine?await rest('customer_addresses',`select=*&customer_id=eq.${c.id}&order=is_default.desc,id.desc&limit=20`):await cachedAddressesForCustomer(c.id)}catch(e){}
     const lastOrder=await recentDeliveryForPhone(raw);

     // Complete old/incomplete address rows from the customer record or the last delivery order.
     const fallbackArea=(c.area||lastOrder?.delivery_area||zoneName(lastOrder?.delivery_zone_id)||'').trim();
     const fallbackAddress=(c.address||lastOrder?.delivery_address||'').trim();
     const fallbackZone=lastOrder?.delivery_zone_id||null;
     adds=(adds||[]).map(a=>({
       ...a,
       address:(a.address||fallbackAddress||'').trim(),
       area:(a.area||fallbackArea||'').trim(),
       delivery_zone_id:a.delivery_zone_id||fallbackZone||null
     }));
     if(!adds.length&&(fallbackAddress||fallbackArea||fallbackZone)){
       adds=[{id:'customer',label:'العنوان الأساسي',address:fallbackAddress,area:fallbackArea,is_default:true,delivery_zone_id:fallbackZone}];
     }

     state.customerAddresses=adds;
     const sel=$('#savedCustomerAddress');
     if(sel){
       sel.classList.toggle('hidden',adds.length<=1);
       sel.innerHTML='<option value="">اختر عنوان محفوظ</option>'+adds.map((a,i)=>`<option value="${esc(a.id)}" ${i===0?'selected':''}>${esc(a.label||a.area||`عنوان ${i+1}`)}${a.address?` — ${esc(a.address)}`:''}</option>`).join('');
     }

     const preferred=adds[0]||{
       address:fallbackAddress,
       area:fallbackArea,
       delivery_zone_id:fallbackZone
     };
     applyCustomerAddress(preferred,{address:fallbackAddress,area:fallbackArea,delivery_zone_id:fallbackZone});

     const finalArea=preferred.area||fallbackArea||'';
     const finalAddress=preferred.address||fallbackAddress||'';
     $('#customerHint').innerHTML=`✅ عميل مسجل: <b>${esc(c.name||raw)}</b>${finalArea?` • ${esc(finalArea)}`:''}${finalAddress?` • ${esc(finalAddress)}`:''}`;
   }else{
     state.selectedCustomer=null; state.customerAddresses=[];
     if($('#customerName'))$('#customerName').value='';
     if($('#deliveryAddress'))$('#deliveryAddress').value='';
     if($('#deliveryZone'))$('#deliveryZone').value='';

     if($('#manualDeliveryFee')){$('#manualDeliveryFee').value='';$('#manualDeliveryFee').classList.remove('hidden');}
     const sel=$('#savedCustomerAddress');if(sel){sel.classList.add('hidden');sel.innerHTML='<option value="">اختر عنوان محفوظ</option>'}
     drawCart();
     $('#customerHint').textContent='عميل جديد — سيتم حفظه مع الأوردر';
   }
 }catch(e){console.error('customer lookup',e);$('#customerHint').textContent='تعذر تحميل بيانات العميل';}
}

function branchProductCfg(productId,branchId=currentBranchId()){return (state.branchProducts||[]).find(x=>Number(x.product_id)===Number(productId)&&Number(x.branch_id)===Number(branchId))||null}
function effectiveProductPrice(p,branchId=currentBranchId()){const bp=branchProductCfg(p?.id,branchId);return bp&&bp.price_override!==null&&bp.price_override!==undefined&&bp.price_override!==''?Number(bp.price_override):Number(p?.price||0)}
function productAvailableAtBranch(p,branchId=currentBranchId()){const bp=branchProductCfg(p?.id,branchId);return !bp||bp.active!==false}
function drawProducts(){
 const q=($('#productSearch')?.value||'').trim().toLowerCase();
 const grid=$('#productsGrid'); if(!grid)return;
 // شاشة «الكل» = التصنيفات الرئيسية. البحث فقط يعرض الأصناف المطابقة مباشرة.
 if(state.cat==='all'&&!q){
   const cats=state.categories.filter(c=>c.active!==false).sort((a,b)=>Number(a.website_sort_order||a.sort_order||0)-Number(b.website_sort_order||b.sort_order||0)||Number(a.id)-Number(b.id));
   grid.classList.add('category-grid');
   grid.innerHTML=cats.map(c=>{
     const count=state.products.filter(p=>p.active!==false&&productAvailableAtBranch(p)&&String(p.category_id)===String(c.id)).length;
     const first=state.products.find(p=>p.active!==false&&productAvailableAtBranch(p)&&String(p.category_id)===String(c.id)&&p.image_url);
     return `<button class="category-card" data-open-cat="${c.id}">${first?.image_url?`<img class="category-card-img" src="${esc(first.image_url)}" alt="${esc(c.name)}" loading="lazy">`:`<div class="category-card-img category-placeholder">🍔</div>`}<span class="category-card-copy"><b>${esc(c.name)}</b><small>${count} صنف</small></span><span class="category-arrow">‹</span></button>`;
   }).join('')||'<div class="empty">لا توجد تصنيفات</div>';
   grid.onclick=e=>{const b=e.target.closest('[data-open-cat]');if(!b)return;state.cat=b.dataset.openCat;const tab=$(`#catTabs button[data-cat="${state.cat}"]`);$$('#catTabs button').forEach(x=>x.classList.toggle('active',x===tab));drawProducts()};
   return;
 }
 grid.classList.remove('category-grid');
 const list=state.products.filter(p=>p.active!==false&&productAvailableAtBranch(p)&&(state.cat==='all'||String(p.category_id)===String(state.cat))&&(!q||String(p.name).toLowerCase().includes(q))).slice().sort((a,b)=>{const ca=state.categories.find(c=>String(c.id)===String(a.category_id)),cb=state.categories.find(c=>String(c.id)===String(b.category_id));return catalogOrderValue(ca)-catalogOrderValue(cb)||catalogOrderValue(a)-catalogOrderValue(b)||Number(a.id)-Number(b.id)});
 grid.innerHTML=list.map(p=>`<button class="product" data-id="${p.id}">${p.image_url?`<img class="product-img" src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy">`:`<div class="product-img product-placeholder">🍔</div>`}<b>${esc(p.name)}</b><span>${money(effectiveProductPrice(p))}</span></button>`).join('')||'<div class="empty">لا توجد أصناف في هذا التصنيف</div>';
 grid.onclick=e=>{const b=e.target.closest('.product');if(!b)return;setSidebarOpen(false);const p=state.products.find(x=>String(x.id)===String(b.dataset.id));if(p)addProductToCart({...p,price:effectiveProductPrice(p)})};
}
function productModifierList(p){const ids=state.productModifiers.filter(x=>String(x.product_id)===String(p.id)).map(x=>String(x.modifier_id));return state.modifiers.filter(m=>ids.includes(String(m.id)))}
function productVariantList(p){return (state.productVariants||[]).filter(x=>String(x.product_id)===String(p.id)&&x.active!==false).sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)||Number(a.id)-Number(b.id))}
function isOfferProduct(p){return ['عرض السنجل','عرض الدبل','عرض الملوك'].includes(String(p.name||'').trim())}
function addProductToCart(p){const canExtras=state.settings.enable_extras&&p.allow_extras!==false&&productModifierList(p).length;const canRemovals=state.settings.enable_removals&&p.allow_removals!==false&&Array.isArray(p.removable_components)&&p.removable_components.length;const canNotes=state.settings.enable_item_notes&&p.allow_item_notes!==false;const hasVariants=productVariantList(p).length>0;if(isOfferProduct(p))return openOfferOptions(p);if(hasVariants||canExtras||canRemovals||canNotes)return openItemOptions(p);pushCartItem({product_id:p.id,name:p.name,price:Number(p.price),base_price:Number(p.price),cost:Number(p.cost||0),qty:1,modifiers:[],removed:[],notes:''})}
function openOfferOptions(p){let groups=[],fixed='';if(p.name==='عرض السنجل'){groups=Array.from({length:2},(_,i)=>({label:`الساندوتش ${i+1}`,opts:['أوريجنال لحم','أوريجنال تشيكن']}));fixed='بدون بطاطس'}else if(p.name==='عرض الدبل'){groups=Array.from({length:2},(_,i)=>({label:`الساندوتش الدبل ${i+1}`,opts:['أوريجنال لحم دبل','أوريجنال تشيكن دبل','برجر ميكس دبل']}));fixed='يشمل 2 ماكس كولا'}else{groups=Array.from({length:4},(_,i)=>({label:`الساندوتش ${i+1}`,opts:['أوريجنال لحم','أوريجنال تشيكن']}));fixed='يشمل 2 طبق بطاطس + ماكس كولا لتر'}const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>${esc(p.name)}</h2><p>${esc(fixed)}</p>${groups.map((g,gi)=>`<h3>${g.label}</h3><div class="option-list">${g.opts.map((o,oi)=>`<label><input type="radio" name="offer${gi}" value="${esc(o)}" ${oi===0?'checked':''}> ${esc(o)}</label>`).join('')}</div>`).join('')}<h3>العدد</h3><div class="item-qty-picker"><button type="button" data-q="minus">−</button><input id="itemQty" type="number" min="1" value="1"><button type="button" data-q="plus">+</button></div><h3>ملاحظة</h3><textarea id="itemNote" rows="2"></textarea><div class="modal-actions"><button class="secondary" data-close>إلغاء</button><button class="primary" data-add>إضافة للأوردر</button></div></div>`;document.body.appendChild(m);m.onclick=e=>{const qb=e.target.closest('[data-q]');if(qb){const q=m.querySelector('#itemQty');let v=Math.max(1,Number(q.value||1));q.value=qb.dataset.q==='plus'?v+1:Math.max(1,v-1);return}if(e.target.closest('[data-close]')||e.target===m)return m.remove();if(e.target.closest('[data-add]')){const choices=groups.map((g,gi)=>m.querySelector(`input[name="offer${gi}"]:checked`)?.value).filter(Boolean);const note=[choices.length?'الاختيارات: '+choices.join(' | '):'',fixed,m.querySelector('#itemNote').value.trim()].filter(Boolean).join(' | ');const qty=Math.max(1,Math.floor(Number(m.querySelector('#itemQty').value||1)));pushCartItem({product_id:p.id,name:p.name,price:Number(p.price),base_price:Number(p.price),cost:Number(p.cost||0),qty,modifiers:[],removed:[],notes:note});m.remove()}}}

function invalidateActivePromo(){state.activePromo=null;const r=$('#posPromoResult');if(r){r.classList.add('hidden');r.innerHTML=''}const i=$('#posPromoCode');if(i)i.value=''}
function promoItemsFromCart(){return state.cart.map(x=>({product_id:Number(x.product_id),line_total:Number(x.price||0)*Number(x.qty||0)}))}
async function applyPosPromo(){const code=$('#posPromoCode')?.value.trim();if(!code)return toast('اكتب البرومو كود');if(!state.cart.length)return toast('الأوردر فارغ');try{const sub=state.cart.reduce((a,x)=>a+Number(x.price||0)*Number(x.qty||0),0);const r=await rpc('preview_promo_code',{p_code:code,p_branch_id:currentBranchId(),p_channel:'pos',p_customer_phone:($('#customerPhone')?.value||'').trim(),p_items:promoItemsFromCart(),p_subtotal:sub});state.activePromo={id:Number(r.promo_id),code:r.code,name:r.name,discount:Number(r.discount||0)};const out=$('#posPromoResult');if(out){out.classList.remove('hidden');out.innerHTML=`✅ ${esc(r.code)} — خصم ${money(r.discount)} <button type="button" class="link-btn" id="removePosPromo">إلغاء</button>`;$('#removePosPromo').onclick=()=>{invalidateActivePromo();drawCart()}}drawCart();toast('تم تطبيق البرومو كود')}catch(e){state.activePromo=null;toast(e.message||'تعذر تطبيق البرومو كود')}}
function pushCartItem(item){invalidateActivePromo();state.cart.push(item);drawCart()}
function openItemOptions(p){const mods=productModifierList(p);const variants=productVariantList(p);const removals=Array.isArray(p.removable_components)?p.removable_components:[];const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card item-options-modal"><h2>${p.name}</h2>${variants.length?`<h3>اختار الحجم</h3><div class="option-list variant-list">${variants.map((v,i)=>`<label><input type="radio" name="variant" data-variant="${v.id}" ${i===0?'checked':''}> ${esc(v.name)} — ${money(v.price)}</label>`).join('')}</div>`:''}<h3>العدد</h3><div class="item-qty-picker"><button type="button" data-q="minus">−</button><input id="itemQty" type="number" min="1" value="1" inputmode="numeric"><button type="button" data-q="plus">+</button></div>${state.settings.enable_extras&&p.allow_extras!==false&&mods.length?`<h3>إضافات</h3><div class="option-list">${mods.map(x=>`<label><input type="checkbox" data-mod="${x.id}"> ${x.name} (+${money(x.price)})</label>`).join('')}</div>`:''}${state.settings.enable_removals&&p.allow_removals!==false&&removals.length?`<h3>بدون</h3><div class="option-list">${removals.map((x,i)=>`<label><input type="checkbox" data-rem="${i}"> بدون ${x}</label>`).join('')}</div>`:''}${state.settings.enable_item_notes&&p.allow_item_notes!==false?`<h3>تعليق الصنف</h3><textarea id="itemNote" rows="3" placeholder="مثال: من غير بصل"></textarea>`:''}<div class="modal-actions"><button class="secondary" data-close>إلغاء</button><button class="primary" data-add>إضافة للأوردر</button></div></div>`;document.body.appendChild(m);m.onclick=e=>{const qb=e.target.closest('[data-q]');if(qb){const q=m.querySelector('#itemQty');let v=Math.max(1,Number(q.value||1));q.value=qb.dataset.q==='plus'?v+1:Math.max(1,v-1);return;}if(e.target.closest('[data-close]')||e.target===m)return m.remove();if(e.target.closest('[data-add]')){const variant=variants.length?variants.find(v=>String(v.id)===String(m.querySelector('[name="variant"]:checked')?.dataset.variant)):null;if(variants.length&&!variant)return toast('اختار الحجم');const selected=[...m.querySelectorAll('[data-mod]:checked')].map(c=>mods.find(x=>String(x.id)===String(c.dataset.mod))).filter(Boolean);const removed=[...m.querySelectorAll('[data-rem]:checked')].map(c=>removals[Number(c.dataset.rem)]);const extra=selected.reduce((a,x)=>a+Number(x.price||0),0);const base=variant?Number(variant.price):Number(p.price);const qty=Math.max(1,Math.floor(Number(m.querySelector('#itemQty')?.value||1)));const item={product_id:p.id,name:variant?`${p.name} - ${variant.name}`:p.name,base_price:base,price:base+extra,cost:Number(p.cost||0),qty,modifiers:selected.map(x=>({id:x.id,name:x.name,price:Number(x.price||0)})),removed,notes:m.querySelector('#itemNote')?.value.trim()||'',variant_id:variant?.id||null,variant_name:variant?.name||null};const same=state.cart.find(x=>String(x.product_id)===String(item.product_id)&&String(x.variant_id||'')===String(item.variant_id||'')&&JSON.stringify(x.modifiers||[])===JSON.stringify(item.modifiers||[])&&JSON.stringify(x.removed||[])===JSON.stringify(item.removed||[]));if(same){invalidateActivePromo();same.qty+=item.qty;if(item.notes)same.notes=item.notes;drawCart()}else pushCartItem(item);m.remove()}}}
function cartCalc(){const subtotal=state.cart.reduce((s,i)=>s+(Number(i.price||0)*Number(i.qty||0)),0);const f=financialCfg();let discountValue=Number($('#discount')?.value||0),discountType=$('#discountType')?.value||(f.discount_mode==='percent'?'percent':'amount');if(f.discount_mode==='amount')discountType='amount';if(f.discount_mode==='percent')discountType='percent';if(!f.discount_enabled||!discountAllowed())discountValue=0;if(discountType==='percent')discountValue=Math.min(Math.max(0,discountValue),Number(f.max_discount_percent||100));let manualDiscount=discountType==='percent'?subtotal*discountValue/100:Math.max(0,discountValue);manualDiscount=Math.min(subtotal,manualDiscount,subtotal*Number(f.max_discount_percent||100)/100);const promoDiscount=Math.max(0,Math.min(Number(state.activePromo?.discount||0),Math.max(0,subtotal-manualDiscount)));const discount=Math.min(subtotal,manualDiscount+promoDiscount);const base=Math.max(0,subtotal-discount);let taxAmount=f.tax_enabled?base*Number(f.tax_rate||0)/100:0;if(f.tax_enabled&&f.prices_include_tax)taxAmount=base-(base/(1+Number(f.tax_rate||0)/100));const serviceAmount=f.service_enabled?base*Number(f.service_rate||0)/100:0;let deliveryFee=0;if($('#orderType')?.value==='delivery')deliveryFee=Math.max(0,Number($('#manualDeliveryFee')?.value||0)||0);const total=Math.max(0,base+(f.tax_enabled&&!f.prices_include_tax?taxAmount:0)+serviceAmount+deliveryFee);return{subtotal,discount,manualDiscount,promoDiscount,discountType,discountValue,taxAmount,serviceAmount,deliveryFee,total}}
function drawCart(){if(!$('#cartItems'))return;$('#cartItems').innerHTML=state.cart.length?state.cart.map((i,n)=>`<div class="cart-item"><div class="cart-row"><b>${esc(i.name)}</b><b>${money(i.price*i.qty)}</b></div>${i.modifiers?.length?`<small>+ ${i.modifiers.map(x=>esc(x.name)).join('، ')}</small>`:''}${i.removed?.length?`<small>بدون: ${i.removed.map(esc).join('، ')}</small>`:''}${i.notes?`<small>ملاحظة: ${esc(i.notes)}</small>`:''}<div class="qty"><button data-a="plus" data-i="${n}">+</button><b>${i.qty}</b><button data-a="minus" data-i="${n}">−</button><button data-a="del" data-i="${n}">🗑</button></div></div>`).join(''):'<div class="empty">أضف أصناف للأوردر</div>';$('#cartItems').onclick=e=>{const b=e.target.closest('button[data-a]');if(!b)return;const i=state.cart[+b.dataset.i];invalidateActivePromo();if(b.dataset.a==='plus')i.qty++;if(b.dataset.a==='minus'){i.qty--;if(i.qty<=0)state.cart.splice(+b.dataset.i,1)}if(b.dataset.a==='del')state.cart.splice(+b.dataset.i,1);drawCart()};const c=cartCalc();$('#subtotal').textContent=money(c.subtotal);if($('#posPromoResult')&&state.activePromo){$('#posPromoResult').classList.remove('hidden');$('#posPromoResult').innerHTML=`✅ ${esc(state.activePromo.code)} — خصم ${money(c.promoDiscount)} <button type="button" class="link-btn" id="removePosPromo">إلغاء</button>`;const rb=$('#removePosPromo');if(rb)rb.onclick=()=>{invalidateActivePromo();drawCart()}}if($('#deliveryFee'))$('#deliveryFee').textContent=money(c.deliveryFee);if($('#taxAmount'))$('#taxAmount').textContent=money(c.taxAmount);if($('#serviceAmount'))$('#serviceAmount').textContent=money(c.serviceAmount);if($('#taxLine'))$('#taxLine').classList.toggle('hidden',!financialCfg().tax_enabled);if($('#serviceLine'))$('#serviceLine').classList.toggle('hidden',!financialCfg().service_enabled);$('#grand').textContent=money(c.total)}
async function checkout(payment,payments=null){
 if(state.checkoutInProgress)return toast('جاري حفظ الفاتورة...');
 if(!state.cart.length)return toast('الأوردر فارغ');
 state.checkoutInProgress=true;
 try{
  const c=cartCalc(), orderType=$('#orderType').value;
  let openShift=await getOpenShift();if(!openShift){toast('لازم تفتح وردية قبل تسجيل البيع');setTimeout(()=>showPage('shifts'),700);return;}
  const phone=($('#customerPhone')?.value||'').trim(), name=($('#customerName')?.value||'').trim();
  let customerId=state.selectedCustomer?.id||null;
  const area=orderType==='delivery'?($('#deliveryZone')?.selectedOptions?.[0]?.textContent?.split('—')[0]?.trim()||null):null;
  if(phone && !customerId){
    try{
      const createdCustomer=await rest('customers','select=*',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{name:name||phone,phone,address:orderType==='delivery'?($('#deliveryAddress')?.value||null):null,area}])});
      customerId=createdCustomer?.[0]?.id||null;
      if(customerId && orderType==='delivery' && $('#deliveryAddress')?.value){
        await rest('customer_addresses','',{method:'POST',body:JSON.stringify([{customer_id:customerId,label:'العنوان الأساسي',address:$('#deliveryAddress').value,area,is_default:true}])});
      }
    }catch(e){}
  }
  const branchId=currentBranchId();
  const source=(state.employee.role==='delivery'||state.employee.role==='callcenter')?'callcenter':'pos';
  const selectedDriver=orderType==='delivery'&&$('#deliveryDriver')?.value?Number($('#deliveryDriver').value):null;
  const orderPayload={
    branch_id:branchId,employee_id:state.employee.id,customer_id:customerId,shift_id:openShift?.id||null,order_type:orderType,
    payment_method:payment,subtotal:c.subtotal,discount:c.discount,discount_type:c.discountType,discount_value:c.discountValue,tax_amount:c.taxAmount,service_amount:c.serviceAmount,delivery_fee:c.deliveryFee,total:c.total,promo_code_id:state.activePromo?.id||null,promo_code:state.activePromo?.code||null,promo_discount:c.promoDiscount||0,
    status:orderType==='delivery'?'new':'completed',source,customer_phone:phone||null,customer_name:name||state.selectedCustomer?.name||null,
    delivery_address:orderType==='delivery'?($('#deliveryAddress')?.value||null):null,delivery_area:area,
    delivery_zone_id:orderType==='delivery'&&$('#deliveryZone')?.value?Number($('#deliveryZone').value):null,
    driver_id:selectedDriver,assigned_at:selectedDriver?new Date().toISOString():null,notes:null
  };
  const itemPayload=state.cart.map(i=>({
    product_id:i.product_id,product_name:i.name,quantity:i.qty,unit_price:i.price,cost:i.cost,total:i.price*i.qty,
    notes:[i.removed?.length?`بدون: ${i.removed.map(esc).join('، ')}`:'',i.notes||''].filter(Boolean).join(' | ')||null,
    modifiers:(i.modifiers||[]).map(md=>({id:md.id,name:md.name,price:Number(md.price||0)}))
  }));
  const payRows=(payments&&payments.length?payments:[{method:payment,amount:c.total}]).map(x=>({method:x.method,amount:Number(x.amount)}));
  let result;const clientTx=uuid();let localFirst=null;if(window.topBurgerDesktop?.isDesktop){if(state.activePromo&&!navigator.onLine)throw new Error('البرومو كود يحتاج إنترنت. ألغِ البرومو وأكمل البيع أوفلاين');localFirst=await saveOfflineSale(orderPayload,itemPayload,payRows,clientTx)}try{if(!navigator.onLine)throw new TypeError('Failed to fetch');result=await rpc('create_pos_order_atomic',{p_order:{...orderPayload,client_tx_id:clientTx},p_items:itemPayload,p_payments:payRows});if(window.topBurgerDesktop?.isDesktop)await removeQueuedOperation(clientTx)}catch(err){if(!isNetError(err)){if(window.topBurgerDesktop?.isDesktop){try{await window.topBurgerDesktop.operations.status(clientTx,'failed',String(err.message||err))}catch{}try{await removeQueuedOperation(clientTx)}catch{}}throw err}if(state.activePromo)throw new Error('البرومو كود يحتاج إنترنت. ألغِ البرومو وأكمل البيع أوفلاين');result=localFirst||await saveOfflineSale(orderPayload,itemPayload,payRows,clientTx);toast('تم حفظ الفاتورة محليًا وستتزامن عند رجوع النت')}
  const o=result?.order, savedItems=result?.items||[];
  if(!o?.id)throw new Error('تمت العملية لكن تعذر قراءة الفاتورة');
  state.cart=[];state.selectedCustomer=null;state.activePromo=null;document.getElementById('receiptPrintFrame')?.remove();toast(`تم حفظ بون ${bonDisplay(o)}`);renderPOS();showReceipt(o,savedItems);
 }catch(e){
  console.error('atomic checkout',e);
  const msg=String(e?.message||'تعذر حفظ الفاتورة');
  if(msg.includes('create_pos_order_atomic')||msg.includes('Could not find the function'))toast('شغّل SQL V9.7.1 أولًا');
  else toast(msg);
 }finally{state.checkoutInProgress=false;}
}
async function openMixedPayment(){const c=cartCalc();if(!state.cart.length)return toast('الأوردر فارغ');const methods=branchPaymentList();const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>➗ دفع مختلط</h2><p>المطلوب: <b>${money(c.total)}</b></p><div class="form-grid">${methods.map((x,i)=>`<label>${esc(x.name)}<input type="number" min="0" step="0.01" data-mix="${esc(x.code)}" value="${i===0?Number(c.total).toFixed(2):'0'}"></label>`).join('')}</div><div class="modal-actions"><button class="secondary" data-close>إلغاء</button><button class="primary" data-save-mix>تأكيد الدفع</button></div></div>`;document.body.appendChild(m);m.onclick=async e=>{if(e.target===m||e.target.closest('[data-close]'))return m.remove();if(e.target.closest('[data-save-mix]')){const rows=[...m.querySelectorAll('[data-mix]')].map(x=>({method:x.dataset.mix,amount:Number(x.value||0)})).filter(x=>x.amount>0);const sum=rows.reduce((a,x)=>a+x.amount,0);if(Math.abs(sum-c.total)>0.01)return toast(`مجموع طرق الدفع لازم يساوي ${money(c.total)}`);m.remove();await checkout('mixed',rows)}}}
const orderTypeLabel=v=>({takeaway:'تيك أواي',pickup:'استلام من الفرع',delivery:'دليفري',dinein:'صالة'}[v]||v||'');
const paymentLabel=v=>v==='mixed'?'دفع مختلط':(state.paymentMethods.find(x=>String(x.code)===String(v))?.name||({cash:'كاش',wallet:'محفظة',instapay:'InstaPay',visa:'Visa / Card'}[v]||v||''));
const statusLabel=v=>({new:'جديد',preparing:'قيد التحضير',ready:'جاهز',out_for_delivery:'خرج مع المندوب',delivered:'تم التسليم',completed:'مكتمل',cancelled:'ملغي'}[v]||v||'');

function customerInfoHTML(o){if(o.order_type!=='delivery')return '';const n=o.customer_name||'';const ph=o.customer_phone||'';const area=o.delivery_area||zoneName(o.delivery_zone_id)||'';const addr=o.delivery_address||'';const drv=o._driver_name||driverName(o.driver_id)||'';return `<div class="r-customer">${n?`<div><b>العميل:</b> ${esc(n)}</div>`:''}${ph?`<div><b>الموبايل:</b> ${esc(ph)}</div>`:''}${area?`<div><b>المنطقة:</b> ${esc(area)}</div>`:''}${addr?`<div><b>العنوان:</b> ${esc(addr)}</div>`:''}${drv?`<div><b>المندوب:</b> ${esc(drv)}</div>`:''}</div><hr>`}
function printCfg(branchId){return state.branchPrintSettings.find(x=>Number(x.branch_id)===Number(branchId))||{branch_id:Number(branchId),paper_size:'80',customer_copies:1,prep_copies:1,show_logo:true,show_business_name:true,show_branch_phone:true,show_branch_address:true,receipt_header:'',receipt_footer:'',prep_show_prices:true,auto_print_customer:false,auto_print_prep:false};}
function branchById(id){return state.branches.find(b=>Number(b.id)===Number(id))||{};}
function receiptIdentityHTML(o,c){const b=branchById(o.branch_id);return `${c.show_logo&&state.business?.logo_url?`<img class="receipt-logo" src="${esc(state.business.logo_url)}" alt="">`:''}${c.show_business_name?`<h2>${esc(businessName())}</h2>`:''}<div class="r-meta">${c.receipt_header?`<b>${esc(c.receipt_header)}</b><br>`:''}<b>${esc(branchName(o.branch_id))}</b>${c.show_branch_phone&&b.phone?`<br>☎ ${esc(b.phone)}`:''}${c.show_branch_address&&b.address?`<br>${esc(b.address)}`:''}<br><b>رقم البون: ${esc(bonDisplay(o))}</b><br>${fmtDate(o.created_at||new Date().toISOString())}</div>`;}
function receiptCopyMark(isCopy){return isCopy?'<div class="receipt-copy-mark">نسخة</div>':''}
function receiptHTML(o,items,isCopy=false){const c=printCfg(o.branch_id);return `<div class="receipt">${receiptCopyMark(isCopy)}${receiptIdentityHTML(o,c)}<hr>${customerInfoHTML(o)}<div class="r-items">${items.map(i=>`<div><span>${esc(i.product_name)} × ${i.quantity}${i.notes?`<small>${esc(i.notes)}</small>`:''}</span><b>${money(i.total)}</b></div>`).join('')}</div><hr><div class="r-totals"><div><span>إجمالي الأصناف</span><b>${money(o.subtotal)}</b></div>${Number(o.discount||0)?`<div><span>${o.promo_code?'خصم ('+esc(o.promo_code)+')':'خصم'}</span><b>-${money(o.discount)}</b></div>`:''}${Number(o.tax_amount||0)?`<div><span>الضريبة</span><b>${money(o.tax_amount)}</b></div>`:''}${Number(o.service_amount||0)?`<div><span>الخدمة</span><b>${money(o.service_amount)}</b></div>`:''}${Number(o.delivery_fee||0)?`<div><span>الدليفري</span><b>${money(o.delivery_fee)}</b></div>`:''}<div class="grand-print"><span>المطلوب</span><b>${money(o.total)}</b></div></div><hr><div class="r-footer">${orderTypeLabel(o.order_type)} • ${paymentLabel(o.payment_method)}<br>${esc(c.receipt_footer||state.business?.receipt_footer||'شكرًا لزيارتكم')}</div></div>`}
function desktopPrinterKey(branchId,type){return `tb_printer_${Number(branchId)||0}_${type}`}
function selectedDesktopPrinter(branchId,type){try{return localStorage.getItem(desktopPrinterKey(branchId,type))||''}catch{return ''}}
function desktopAutoPrintKey(branchId,type){return `tb_auto_print_${Number(branchId)||0}_${type}`}
function localAutoPrint(branchId,type,fallback=false){if(!window.topBurgerDesktop?.isDesktop)return !!fallback;try{const v=localStorage.getItem(desktopAutoPrintKey(branchId,type));return v===null?!!fallback:v==='true'}catch{return !!fallback}}
function setLocalAutoPrint(branchId,type,value){try{localStorage.setItem(desktopAutoPrintKey(branchId,type),String(!!value))}catch{}}
function printCountKey(o,type){return `tb_print_count_${type}_${String(o?.id||o?.client_tx_id||o?.invoice_number||o?.bon_number||'unknown')}`}
function getPrintCount(o,type){try{return Math.max(0,Number(localStorage.getItem(printCountKey(o,type))||0))}catch{return 0}}
function setPrintCount(o,type,n){try{localStorage.setItem(printCountKey(o,type),String(Math.max(0,Number(n)||0)))}catch{}}
async function printIsolated(html,paper='80',copies=1,opts={}){const old=document.getElementById('receiptPrintFrame');if(old)old.remove();const f=document.createElement('iframe');f.id='receiptPrintFrame';f.setAttribute('aria-hidden','true');f.style.cssText='position:fixed;width:1px;height:1px;right:-9999px;bottom:-9999px;border:0;opacity:0;pointer-events:none';document.body.appendChild(f);const width=paper==='58'?'54mm':'78mm',page=paper==='58'?'58mm':'80mm';const n=Math.max(1,Math.min(5,Number(copies)||1));const body=Array.from({length:n},()=>`<div class="print-copy">${html}</div>`).join('');const doc=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>@page{size:${page} auto;margin:1mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,Tahoma,sans-serif;color:#000;direction:rtl;font-weight:700}small,td,th,p,span,div{font-weight:inherit}.receipt h1,.receipt h2,.receipt h3,.grand-print,.receipt-copy-mark,strong,b{font-weight:900}.print-copy{width:${width}}.print-copy:not(:last-child){page-break-after:always}.receipt{width:${width};font-size:13px;line-height:1.28}.receipt-copy-mark{text-align:center;font-size:18px;font-weight:900;border:2px solid #000;padding:2px 5px;margin:0 auto 4px;max-width:30mm}.receipt-logo{display:block;max-width:30mm;max-height:18mm;object-fit:contain;margin:1mm auto}.receipt h2{text-align:center;font-size:20px;margin:2px 0}.receipt h1{text-align:center;font-size:25px;line-height:1.1;margin:3px 0}.receipt h3,.receipt p{margin:2px 0}.receipt hr{border:0;border-top:1px dashed #000;margin:4px 0}.r-meta,.r-footer{text-align:center}.r-customer{line-height:1.35}.r-items>div,.r-totals>div{display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin:3px 0}.r-items>div>span{flex:1;min-width:0}.r-items small{display:block;font-size:11px;line-height:1.2;margin-top:1px}.prep-item>span>b{font-size:15px}.prep-note{font-weight:700}.grand-print{font-size:17px;font-weight:900;border-top:1px dashed #000;padding-top:4px}.r-footer{font-size:11px;line-height:1.25}.shift-print{width:${width};font-size:11px}.shift-print h2,.shift-print h3{text-align:center;margin:4px 0}.shift-report-table{width:100%;border-collapse:collapse;font-size:10px}.shift-report-table th,.shift-report-table td{border-bottom:1px dashed #777;padding:3px 2px;text-align:right}.shift-report-table th:nth-child(n+2),.shift-report-table td:nth-child(n+2){text-align:left}.shift-report-table small{display:block;font-size:8px}</style></head><body>${body}</body></html>`;if(window.topBurgerDesktop?.print?.html){try{const r=await window.topBurgerDesktop.print.html(doc,{silent:true,deviceName:opts.deviceName||''});f.remove();if(!r?.ok){if(r?.error)toast('تعذر الطباعة: '+r.error);return false}return true}catch(e){f.remove();toast('تعذر الطباعة: '+e.message);return false}}const d=f.contentDocument;d.open();d.write(doc);d.close();setTimeout(()=>{try{f.contentWindow.focus();f.contentWindow.print()}finally{setTimeout(()=>f.remove(),1200)}},150);return true}
async function recordSuccessfulPrint(o,type,wasCopy){const prev=getPrintCount(o,type);setPrintCount(o,type,prev+1);if(wasCopy){await audit('reprint_order_receipt','order',o?.id||null,{print_type:type,print_count:prev+1,invoice_number:o?.invoice_number||null,bon_number:o?.bon_number||null})}}
async function printReceipt(o,items){const c=printCfg(o.branch_id),isCopy=getPrintCount(o,'customer')>0;const ok=await printIsolated(receiptHTML(o,items,isCopy),c.paper_size,c.customer_copies,{deviceName:selectedDesktopPrinter(o.branch_id,'customer')});if(ok)await recordSuccessfulPrint(o,'customer',isCopy);return ok}
function prepReceiptHTML(o,items,isCopy=false){const c=printCfg(o.branch_id);return `<div class="receipt">${receiptCopyMark(isCopy)}<div class="receipt-head"><h2>ريسيت التحضير</h2><h1>بون ${esc(bonDisplay(o))}</h1><p>${branchName(o.branch_id)} • ${fmtDate(o.created_at)}</p><p>${orderTypeLabel(o.order_type)}</p></div><hr>${customerInfoHTML(o)}<div class="r-items">${items.map(i=>`<div class="prep-item"><span><b>${i.quantity} × ${esc(i.product_name)}</b>${i.notes?`<small class="prep-note">📝 ${esc(i.notes)}</small>`:''}</span><b>${money(i.total)}</b></div>`).join('')}</div><hr><div class="r-totals"><div><span>إجمالي الأصناف</span><b>${money(o.subtotal)}</b></div></div></div>`}
async function printPrepReceipt(o,items){const c=printCfg(o.branch_id),isCopy=getPrintCount(o,'prep')>0;const ok=await printIsolated(prepReceiptHTML(o,items,isCopy),c.paper_size,c.prep_copies,{deviceName:selectedDesktopPrinter(o.branch_id,'prep')});if(ok)await recordSuccessfulPrint(o,'prep',isCopy);return ok}
function autoPrintOrder(o,items){const c=printCfg(o.branch_id),autoPrep=localAutoPrint(o.branch_id,'prep',c.auto_print_prep),autoCustomer=localAutoPrint(o.branch_id,'customer',c.auto_print_customer);if(autoPrep&&state.settings.enable_prep_receipt)setTimeout(()=>printPrepReceipt(o,items),250);if(autoCustomer&&state.settings.enable_receipt_print)setTimeout(()=>printReceipt(o,items),900)}
function showReceipt(o,items){const c=printCfg(o.branch_id),autoPrep=localAutoPrint(o.branch_id,'prep',c.auto_print_prep),autoCustomer=localAutoPrint(o.branch_id,'customer',c.auto_print_customer),didAuto=(autoCustomer&&state.settings.enable_receipt_print)||(autoPrep&&state.settings.enable_prep_receipt);autoPrintOrder(o,items);if(didAuto)return;const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>تم حفظ بون ${esc(bonDisplay(o))}</h2>${receiptHTML(o,items)}<div class="modal-actions"><button class="secondary" data-close>إغلاق</button>${state.settings.enable_prep_receipt?'<button class="secondary" data-prep>ريسيت التحضير</button>':''}${state.settings.enable_receipt_print?'<button class="primary" data-print>فاتورة العميل</button>':''}</div></div>`;document.body.appendChild(m);m.onclick=e=>{if(e.target.closest('[data-close]')||e.target===m)m.remove();if(e.target.closest('[data-print]'))printReceipt(o,items);if(e.target.closest('[data-prep]'))printPrepReceipt(o,items)}}
async function openReturnForOrder(o,items){
 if(!canAccessPage('returns'))return toast('ليس لديك صلاحية المرتجعات');
 const sh=await getOpenShift();if(!sh)return toast('افتح وردية أولًا قبل عمل المرتجع');
 let prior=[];try{prior=await rest('return_items',`select=order_item_id,quantity,returns!inner(order_id)&returns.order_id=eq.${o.id}`);await odbSet(`returnUsage:${o.id}`,prior)}catch(e){if(!isNetError(e))throw e;prior=(await odbGet(`returnUsage:${o.id}`))||[]}
 const used={};for(const x of prior)used[String(x.order_item_id)]=(used[String(x.order_item_id)]||0)+Number(x.quantity||0);
 const available=items.map(i=>({...i,_available:Math.max(0,Number(i.quantity||0)-Number(used[String(i.id)]||0))})).filter(i=>i._available>0);
 if(!available.length)return toast('تم إرجاع كل أصناف الفاتورة بالفعل');
 const pays=branchPaymentList(o.branch_id);const defaultPay=pays.find(x=>x.is_default)||pays[0];
 const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card return-modal"><h2>↩️ مرتجع من بون ${esc(bonDisplay(o))}</h2><p>فاتورة داخلية ${esc(invoiceDisplay(o))} • ${fmtDate(o.created_at)}</p><div class="table-wrap"><table style="min-width:0"><thead><tr><th>الصنف</th><th>المتاح</th><th>كمية المرتجع</th></tr></thead><tbody>${available.map(i=>`<tr><td>${esc(i.product_name)}</td><td>${i._available}</td><td><input class="return-qty" data-ri="${i.id}" type="number" min="0" max="${i._available}" step="1" value="0"></td></tr>`).join('')}</tbody></table></div><div class="form-grid"><label>سبب المرتجع<select id="retReason"><option value="">اختر السبب</option><option>خطأ في الطلب</option><option>جودة المنتج</option><option>طلب العميل</option><option>تكرار الطلب</option><option>أخرى</option></select></label><label>طريقة رد المبلغ<select id="retMethod">${pays.map(x=>`<option value="${esc(x.code)}" ${defaultPay&&String(x.id)===String(defaultPay.id)?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label><label class="span-2">ملاحظات<textarea id="retNotes" rows="2" placeholder="اختياري"></textarea></label></div><div class="return-total-box">المبلغ المتوقع للمرتجع <b id="retEstimate">${money(0)}</b><small>رسوم الدليفري لا تُرد تلقائيًا</small></div><div class="modal-actions"><button class="secondary" data-close>إلغاء</button><button class="secondary" data-full-return>↩️ مرتجع الأوردر بالكامل</button><button class="danger" data-submit-return>تنفيذ المرتجع</button></div></div>`;document.body.appendChild(m);
 const calc=()=>{let sub=0;for(const inp of m.querySelectorAll('.return-qty')){const i=available.find(x=>String(x.id)===String(inp.dataset.ri));const q=Math.min(i._available,Math.max(0,Number(inp.value||0)));sub+=(Number(i.total||0)/Number(i.quantity||1))*q}const ratio=Number(o.subtotal||0)>0?Math.min(1,sub/Number(o.subtotal)):0;const f=financialCfg(o.branch_id),taxPart=Number(o.tax_amount||0)*ratio;const total=Math.max(0,sub-Number(o.discount||0)*ratio+(f.prices_include_tax?0:taxPart)+Number(o.service_amount||0)*ratio);m.querySelector('#retEstimate').textContent=money(total);return Math.round(total*100)/100};
 m.oninput=e=>{if(e.target.matches('.return-qty'))calc()};
 m.onclick=async e=>{if(e.target.closest('[data-close]')||e.target===m){m.remove();return}if(e.target.closest('[data-full-return]')){for(const inp of m.querySelectorAll('.return-qty')){const i=available.find(x=>String(x.id)===String(inp.dataset.ri));inp.value=i?i._available:0}calc();toast('تم تحديد كل الكميات المتاحة للمرتجع');return}if(!e.target.closest('[data-submit-return]'))return;const selected=[...m.querySelectorAll('.return-qty')].map(inp=>{const item=available.find(x=>String(x.id)===String(inp.dataset.ri));const quantity=Math.min(Number(item?._available||0),Math.max(0,Math.floor(Number(inp.value||0)||0)));inp.value=quantity;return {order_item_id:Number(inp.dataset.ri),quantity}}).filter(x=>x.quantity>0);if(!selected.length)return toast('حدد كمية مرتجع لصنف واحد على الأقل');const reason=m.querySelector('#retReason').value;if(!reason)return toast('اختر سبب المرتجع');const total=calc();if(total<=0)return toast('قيمة المرتجع غير صحيحة');if(!await uiConfirm(`تأكيد مرتجع ${money(total)}؟\nالعملية لن تمسح الفاتورة الأصلية.`,{title:'تأكيد المرتجع',danger:true,okText:'تنفيذ المرتجع'}))return;const btn=m.querySelector('[data-submit-return]');btn.disabled=true;try{let rr,ri,rp,rid;try{rid=Number(await rpc('create_order_return_idempotent',{p_order_id:Number(o.id),p_reason:reason,p_notes:m.querySelector('#retNotes').value.trim()||null,p_items:selected,p_payments:[{method:m.querySelector('#retMethod').value,amount:total}],p_client_tx_id:uuid()}));[rr,ri,rp]=await Promise.all([rest('returns',`select=*&id=eq.${rid}`),rest('return_items',`select=*&return_id=eq.${rid}&order=id`),rest('return_payments',`select=*&return_id=eq.${rid}&order=id`)])}catch(netErr){if(!isNetError(netErr))throw netErr;if(String(o.id).startsWith('offline-'))throw new Error('مرتجع فاتورة أوفلاين جديدة يتم بعد مزامنة الفاتورة أولًا');const saved=await saveOfflineReturn(o,selected,reason,m.querySelector('#retNotes').value.trim()||null,m.querySelector('#retMethod').value,total,available);rr=[saved.r];ri=saved.items;rp=saved.payments;rid=saved.r.id}m.remove();toast(rr[0]?._offline?'تم حفظ المرتجع أوفلاين وسيُزامن تلقائيًا':`تم تسجيل مرتجع #${rr[0]?.return_number||rid}`);const x=document.createElement('div');x.className='modal';x.innerHTML=`<div class="modal-card"><h2>تم تسجيل المرتجع</h2>${returnReceiptHTML(rr[0],ri,rp)}<div class="modal-actions"><button class="secondary" data-close>إغلاق</button><button class="primary" data-print-return>🖨️ طباعة إيصال المرتجع</button></div></div>`;document.body.appendChild(x);x.onclick=z=>{if(z.target.closest('[data-close]')||z.target===x)x.remove();if(z.target.closest('[data-print-return]'))printReturnReceipt(rr[0],ri,rp)}}catch(err){btn.disabled=false;toast(err.message)}};
}
async function renderReturns(){
 let rows=[];try{rows=await rest('returns',`select=*&branch_id=eq.${currentBranchId()}&order=created_at.desc&limit=200`);await odbSet(`cachedReturns:${currentBranchId()}`,rows)}catch(e){if(!isNetError(e))throw e;rows=(await odbGet(`cachedReturns:${currentBranchId()}`))||[];const q=await offlineQueue();rows=[...q.filter(x=>x.type==='return'&&Number(x.local_return?.branch_id)===currentBranchId()).map(x=>x.local_return),...rows]}
 $('#page').innerHTML=`<div class="panel"><div class="section-head"><div><h2>↩️ المرتجعات</h2><p>المرتجع مرتبط بالفاتورة الأصلية ولا يحذف عملية البيع.</p></div><button id="findReturnOrder" class="primary">+ مرتجع من فاتورة</button></div><div class="table-wrap"><table><thead><tr><th>رقم المرتجع</th><th>الفاتورة</th><th>البون الأصلي</th><th>التاريخ</th><th>السبب</th><th>المبلغ</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.return_number}</td><td>${r.original_invoice_number||'-'}</td><td>${r.original_bon_number||'-'}</td><td>${fmtDate(r.created_at)}</td><td>${esc(r.reason)}</td><td>${money(r.total)}</td><td><button class="secondary" data-return-details="${r.id}">تفاصيل</button></td></tr>`).join('')||'<tr><td colspan="7">لا توجد مرتجعات</td></tr>'}</tbody></table></div></div>`;
 $('#findReturnOrder').onclick=async()=>{const sh=await getOpenShift();if(!sh)return toast('افتح وردية أولًا قبل عمل المرتجع');const allowClosed=(state.settings.returns_allow_closed_shifts===true||String(state.settings.returns_allow_closed_shifts)==='true');const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>↩️ البحث عن فاتورة</h2><div class="form-grid"><label>البحث بواسطة<select id="retSearchType"><option value="bon">رقم البون</option><option value="invoice">رقم الفاتورة</option></select></label><label>الرقم<input id="retSearchNo" type="number" min="1" placeholder="اكتب الرقم"></label></div><p class="hint">${allowClosed?'مسموح بالبحث في الورديات السابقة.':'البحث داخل الوردية الحالية فقط.'}</p><div class="modal-actions"><button class="secondary" data-close>إلغاء</button><button class="primary" data-find>بحث</button></div><div id="retSearchResults"></div></div>`;document.body.appendChild(m);m.onclick=async e=>{if(e.target.closest('[data-close]')||e.target===m){m.remove();return}if(!e.target.closest('[data-find]'))return;const n=Number(m.querySelector('#retSearchNo').value||0),type=m.querySelector('#retSearchType').value;if(!n)return toast('اكتب رقم صحيح');let q=`select=*&branch_id=eq.${currentBranchId()}&${type==='bon'?'bon_number':'invoice_number'}=eq.${n}&order=created_at.desc&limit=30`;if(!allowClosed)q+=`&shift_id=eq.${sh.id}`;let oo=[];try{oo=await rest('orders',q)}catch(err){if(!isNetError(err))throw err;oo=(await cachedOrderBundles()).map(x=>x.order).filter(x=>Number(x.branch_id)===currentBranchId()&&Number(type==='bon'?x.bon_number:x.invoice_number)===n&&((allowClosed)||String(x.shift_id)===String(sh.id)))}if(!oo.length)return toast('الفاتورة غير محفوظة على هذا الجهاز أو غير موجودة');if(oo.length===1){let it=[];try{it=await rest('order_items',`select=*&order_id=eq.${oo[0].id}&order=id`);await cacheOrderBundle(oo[0],it)}catch(err){if(!isNetError(err))throw err;it=((await cachedOrderBundles()).find(x=>String(x.order?.id)===String(oo[0].id))?.items)||[]}m.remove();return openReturnForOrder(oo[0],it)}m.querySelector('#retSearchResults').innerHTML=`<div class="table-wrap"><table><thead><tr><th>الفاتورة</th><th>البون</th><th>التاريخ</th><th></th></tr></thead><tbody>${oo.map(o=>`<tr><td>${esc(invoiceDisplay(o))}</td><td>${esc(bonDisplay(o))}</td><td>${fmtDate(o.created_at)}</td><td><button class="secondary" data-pick-return="${o.id}">اختيار</button></td></tr>`).join('')}</tbody></table></div>`;m.querySelector('#retSearchResults').onclick=async z=>{const b=z.target.closest('[data-pick-return]');if(!b)return;const o=oo.find(x=>String(x.id)===String(b.dataset.pickReturn));let it=[];try{it=await rest('order_items',`select=*&order_id=eq.${o.id}&order=id`);await cacheOrderBundle(o,it)}catch(err){if(!isNetError(err))throw err;it=((await cachedOrderBundles()).find(x=>String(x.order?.id)===String(o.id))?.items)||[]}m.remove();openReturnForOrder(o,it)}}};
 $('#page').onclick=async e=>{const b=e.target.closest('[data-return-details]');if(!b)return;const id=Number(b.dataset.returnDetails);const [rr,ri,rp]=await Promise.all([rest('returns',`select=*&id=eq.${id}`),rest('return_items',`select=*&return_id=eq.${id}&order=id`),rest('return_payments',`select=*&return_id=eq.${id}&order=id`)]);if(!rr[0])return;const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>تفاصيل مرتجع #${rr[0].return_number}</h2>${returnReceiptHTML(rr[0],ri,rp)}<div class="modal-actions"><button class="secondary" data-close>إغلاق</button><button class="primary" data-print-return>🖨️ طباعة</button></div></div>`;document.body.appendChild(m);m.onclick=z=>{if(z.target.closest('[data-close]')||z.target===m)m.remove();if(z.target.closest('[data-print-return]'))printReturnReceipt(rr[0],ri,rp)}};
}
async function renderPromoCodes(){
 if(!(isAdmin()||hasFeaturePermission('promoCodes'))){toast('ليس لديك صلاحية إدارة البرومو كود');return showPage('home')}
 let promos=[],links=[],cats=[],prods=[];try{[promos,links,cats,prods]=await Promise.all([rest('promo_codes','select=*&order=created_at.desc'),rest('promo_code_branches','select=*'),rest('promo_code_categories','select=*'),rest('promo_code_products','select=*')])}catch(e){$('#page').innerHTML=`<div class="panel"><h2>🎟️ البرومو كود</h2><div class="empty">شغّل SQL V9.7.0 أولًا.<br>${esc(e.message)}</div></div>`;return}
 const useCounts={};try{const rr=await rest('promo_redemptions','select=promo_code_id');for(const x of rr)useCounts[x.promo_code_id]=(useCounts[x.promo_code_id]||0)+1}catch(e){}
 const rows=promos.map(p=>{const bs=links.filter(x=>String(x.promo_code_id)===String(p.id)).map(x=>branchName(x.branch_id)).join('، ')||'كل الفروع';const val=p.discount_type==='percent'?`${Number(p.discount_value)}%`:money(p.discount_value);return `<tr><td><b>${esc(p.code)}</b><small style="display:block">${esc(p.name||'')}</small></td><td>${val}</td><td>${esc(bs)}</td><td>${p.channel==='both'?'POS + الموقع':p.channel==='website'?'الموقع':'POS'}</td><td>${useCounts[p.id]||0}${p.max_uses?` / ${p.max_uses}`:''}</td><td><span class="tag">${p.active?'فعال':'موقوف'}</span></td><td><button class="secondary" data-edit-promo="${p.id}">✏️ تعديل</button> <button class="secondary" data-toggle-promo="${p.id}">${p.active?'⛔ إيقاف':'✅ تشغيل'}</button></td></tr>`}).join('');
 $('#page').innerHTML=`<div class="panel"><div class="section-head"><div><h2>🎟️ البرومو كود</h2><p class="muted">خصم نسبة أو مبلغ، مدة، حد أدنى، عدد استخدامات، فروع وقنوات وأصناف محددة.</p></div><button id="newPromo" class="primary">+ برومو كود جديد</button></div><div class="table-wrap"><table><thead><tr><th>الكود</th><th>الخصم</th><th>الفروع</th><th>القناة</th><th>الاستخدام</th><th>الحالة</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="7">لا توجد أكواد حتى الآن</td></tr>'}</tbody></table></div></div>`;
 const openForm=(p=null)=>{const edit=!!p;const selectedBranches=links.filter(x=>String(x.promo_code_id)===String(p?.id)).map(x=>String(x.branch_id));const selectedCats=cats.filter(x=>String(x.promo_code_id)===String(p?.id)).map(x=>String(x.category_id));const selectedProducts=prods.filter(x=>String(x.promo_code_id)===String(p?.id)).map(x=>String(x.product_id));const m=document.createElement('div');m.className='modal';m.innerHTML=`<form class="modal-card promo-admin-modal" id="promoForm"><h2>${edit?'✏️ تعديل البرومو':'🎟️ برومو كود جديد'}</h2><div class="form-grid"><label>الكود<input id="prCode" value="${esc(p?.code||'')}" required placeholder="TOP20"></label><label>اسم العرض<input id="prName" value="${esc(p?.name||'')}" placeholder="خصم العملاء"></label><label>نوع الخصم<select id="prType"><option value="percent" ${p?.discount_type!=='amount'?'selected':''}>نسبة %</option><option value="amount" ${p?.discount_type==='amount'?'selected':''}>مبلغ ثابت</option></select></label><label>قيمة الخصم<input id="prValue" type="number" min="0" step="0.01" value="${Number(p?.discount_value||0)}"></label><label>أقصى خصم<input id="prMaxDiscount" type="number" min="0" step="0.01" value="${p?.max_discount??''}" placeholder="اختياري"></label><label>حد أدنى للطلب<input id="prMinOrder" type="number" min="0" step="0.01" value="${Number(p?.min_order||0)}"></label><label>يبدأ<input id="prStart" type="datetime-local" value="${p?.starts_at?new Date(p.starts_at).toISOString().slice(0,16):''}"></label><label>ينتهي<input id="prEnd" type="datetime-local" value="${p?.ends_at?new Date(p.ends_at).toISOString().slice(0,16):''}"></label><label>إجمالي مرات الاستخدام<input id="prMaxUses" type="number" min="0" value="${p?.max_uses??''}" placeholder="بدون حد"></label><label>لكل رقم موبايل<input id="prPerPhone" type="number" min="0" value="${p?.max_uses_per_phone??''}" placeholder="بدون حد"></label><label>القناة<select id="prChannel"><option value="both" ${p?.channel==='both'||!p?'selected':''}>POS + الموقع</option><option value="website" ${p?.channel==='website'?'selected':''}>الموقع فقط</option><option value="pos" ${p?.channel==='pos'?'selected':''}>POS فقط</option></select></label><label>ينطبق على<select id="prScope"><option value="all" ${p?.scope==='all'||!p?'selected':''}>كل الأصناف</option><option value="categories" ${p?.scope==='categories'?'selected':''}>أقسام محددة</option><option value="products" ${p?.scope==='products'?'selected':''}>أصناف محددة</option></select></label></div><h3>الفروع</h3><div class="branch-checks">${state.branches.map(b=>`<label><input class="pr-branch" type="checkbox" value="${b.id}" ${(!edit&&Number(b.id)===currentBranchId())||selectedBranches.includes(String(b.id))?'checked':''}> ${esc(b.name)}</label>`).join('')}</div><div id="prCategoriesBox"><h3>الأقسام</h3><div class="branch-checks">${state.categories.filter(c=>c.active!==false).map(c=>`<label><input class="pr-cat" type="checkbox" value="${c.id}" ${selectedCats.includes(String(c.id))?'checked':''}> ${esc(c.name)}</label>`).join('')}</div></div><div id="prProductsBox"><h3>الأصناف</h3><div class="branch-checks promo-product-checks">${state.products.filter(x=>x.active!==false).map(x=>`<label><input class="pr-product" type="checkbox" value="${x.id}" ${selectedProducts.includes(String(x.id))?'checked':''}> ${esc(x.name)}</label>`).join('')}</div></div><label class="inline-check"><input id="prActive" type="checkbox" ${p?.active===false?'':'checked'}> فعال</label><div class="modal-actions"><button type="button" class="secondary" data-close>إلغاء</button><button type="submit" class="primary">حفظ</button></div></form>`;document.body.appendChild(m);const updateScope=()=>{const sc=m.querySelector('#prScope').value;m.querySelector('#prCategoriesBox').classList.toggle('hidden',sc!=='categories');m.querySelector('#prProductsBox').classList.toggle('hidden',sc!=='products')};m.querySelector('#prScope').onchange=updateScope;updateScope();m.onclick=e=>{if(e.target===m||e.target.closest('[data-close]'))m.remove()};m.querySelector('#promoForm').onsubmit=async e=>{e.preventDefault();const code=m.querySelector('#prCode').value.trim().toUpperCase();if(!code)return toast('اكتب الكود');const branches=[...m.querySelectorAll('.pr-branch:checked')].map(x=>Number(x.value));if(!branches.length)return toast('حدد فرعًا واحدًا على الأقل');const scope=m.querySelector('#prScope').value;const scats=[...m.querySelectorAll('.pr-cat:checked')].map(x=>Number(x.value));const sprods=[...m.querySelectorAll('.pr-product:checked')].map(x=>Number(x.value));if(scope==='categories'&&!scats.length)return toast('حدد قسمًا واحدًا على الأقل');if(scope==='products'&&!sprods.length)return toast('حدد صنفًا واحدًا على الأقل');const discountType=m.querySelector('#prType').value,discountValue=Number(m.querySelector('#prValue').value||0),maxDiscount=m.querySelector('#prMaxDiscount').value===''?null:Number(m.querySelector('#prMaxDiscount').value),minOrder=Number(m.querySelector('#prMinOrder').value||0),maxUses=m.querySelector('#prMaxUses').value===''?null:Number(m.querySelector('#prMaxUses').value),perPhone=m.querySelector('#prPerPhone').value===''?null:Number(m.querySelector('#prPerPhone').value);if(!Number.isFinite(discountValue)||discountValue<0||(discountType==='percent'&&discountValue>100))return toast('راجع قيمة الخصم');if(maxDiscount!==null&&(!Number.isFinite(maxDiscount)||maxDiscount<0))return toast('راجع أقصى خصم');if(!Number.isFinite(minOrder)||minOrder<0)return toast('راجع الحد الأدنى للطلب');if(maxUses!==null&&(!Number.isInteger(maxUses)||maxUses<0))return toast('راجع إجمالي مرات الاستخدام');if(perPhone!==null&&(!Number.isInteger(perPhone)||perPhone<0))return toast('راجع عدد الاستخدامات لكل رقم');const startValue=m.querySelector('#prStart').value,endValue=m.querySelector('#prEnd').value;if(startValue&&endValue&&new Date(endValue).getTime()<=new Date(startValue).getTime())return toast('تاريخ انتهاء البرومو لازم يكون بعد تاريخ البداية');const row={code,name:m.querySelector('#prName').value.trim()||null,discount_type:discountType,discount_value:discountValue,max_discount:maxDiscount,min_order:minOrder,starts_at:m.querySelector('#prStart').value?new Date(m.querySelector('#prStart').value).toISOString():null,ends_at:m.querySelector('#prEnd').value?new Date(m.querySelector('#prEnd').value).toISOString():null,max_uses:maxUses,max_uses_per_phone:perPhone,channel:m.querySelector('#prChannel').value,scope,active:m.querySelector('#prActive').checked,updated_at:new Date().toISOString()};try{let id=p?.id;if(edit){await rest('promo_codes',`id=eq.${id}`,{method:'PATCH',body:JSON.stringify(row)})}else{const cr=await rest('promo_codes','select=*',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{...row,created_at:new Date().toISOString()}])});id=cr?.[0]?.id}for(const t of ['promo_code_branches','promo_code_categories','promo_code_products'])await rest(t,`promo_code_id=eq.${id}`,{method:'DELETE'});await rest('promo_code_branches','',{method:'POST',body:JSON.stringify(branches.map(branch_id=>({promo_code_id:id,branch_id})))});if(scope==='categories')await rest('promo_code_categories','',{method:'POST',body:JSON.stringify(scats.map(category_id=>({promo_code_id:id,category_id})))});if(scope==='products')await rest('promo_code_products','',{method:'POST',body:JSON.stringify(sprods.map(product_id=>({promo_code_id:id,product_id})))});m.remove();toast('تم حفظ البرومو كود');renderPromoCodes()}catch(err){toast(err.message)}}};
 $('#newPromo').onclick=()=>openForm();$('#page').onclick=async e=>{const eb=e.target.closest('[data-edit-promo]');if(eb){const p=promos.find(x=>String(x.id)===String(eb.dataset.editPromo));return openForm(p)}const tb=e.target.closest('[data-toggle-promo]');if(tb){const p=promos.find(x=>String(x.id)===String(tb.dataset.togglePromo));await rest('promo_codes',`id=eq.${p.id}`,{method:'PATCH',body:JSON.stringify({active:!p.active,updated_at:new Date().toISOString()})});toast('تم تحديث حالة البرومو');renderPromoCodes()}};
}

async function openOrderDetails(id){let orders=[],items=[];try{[orders,items]=await Promise.all([rest('orders',`select=*&id=eq.${id}`),rest('order_items',`select=*&order_id=eq.${id}&order=id`)]);if(orders[0])await cacheOrderBundle(orders[0],items)}catch(e){if(!isNetError(e))throw e;const b=(await cachedOrderBundles()).find(x=>String(x.order?.id)===String(id));if(b){orders=[b.order];items=b.items||[]}}const o=orders[0];if(!o)return toast('الأوردر غير موجود على الجهاز');o._driver_name=driverName(o.driver_id);const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>تفاصيل الفاتورة ${esc(invoiceDisplay(o))}</h2><p><b>رقم البون: ${esc(bonDisplay(o))}</b></p><p>${fmtDate(o.created_at)} — ${branchName(o.branch_id)}</p><p><b>${orderTypeLabel(o.order_type)}</b> • ${paymentLabel(o.payment_method)} • <span class="tag">${statusLabel(o.status)}</span></p>${o.order_type==='delivery'?customerInfoHTML(o):''}<div class="table-wrap"><table style="min-width:0"><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${items.map(i=>`<tr><td>${esc(i.product_name)}${i.notes?`<small style="display:block;margin-top:4px">📝 ${esc(i.notes)}</small>`:''}</td><td>${i.quantity}</td><td>${money(i.unit_price)}</td><td>${money(i.total)}</td></tr>`).join('')}</tbody></table></div><h3>المطلوب: ${money(o.total)}</h3><div class="modal-actions"><button class="secondary" data-close>إغلاق</button><button class="secondary" data-prep>ريسيت التحضير</button><button class="primary" data-print>فاتورة العميل</button>${canAccessPage('returns')?'<button class="danger" data-return>↩️ عمل مرتجع</button>':''}</div></div>`;document.body.appendChild(m);m.onclick=e=>{if(e.target.closest('[data-close]')||e.target===m)m.remove();if(e.target.closest('[data-print]'))printReceipt(o,items);if(e.target.closest('[data-prep]'))printPrepReceipt(o,items);if(e.target.closest('[data-return]')){m.remove();openReturnForOrder(o,items)}}}


function returnReceiptHTML(r,items,payments){const c=printCfg(r.branch_id);return `<div class="receipt"><div class="receipt-head"><h2>${esc(businessName())}</h2><h3>إيصال مرتجع #${esc(r.return_number)}</h3><p>${esc(branchName(r.branch_id))} • ${fmtDate(r.created_at)}</p><p>مرتجع من بون ${esc(r.original_bon_number||'-')}</p></div><hr><div class="r-items">${items.map(i=>`<div><span>${esc(i.product_name)} × ${i.quantity}</span><b>${money(i.total)}</b></div>`).join('')}</div><hr><div class="r-totals"><div><span>قيمة الأصناف</span><b>${money(r.subtotal)}</b></div>${Number(r.discount_adjustment||0)?`<div><span>تسوية الخصم</span><b>-${money(r.discount_adjustment)}</b></div>`:''}${Number(r.tax_adjustment||0)?`<div><span>تسوية الضريبة</span><b>${money(r.tax_adjustment)}</b></div>`:''}${Number(r.service_adjustment||0)?`<div><span>تسوية الخدمة</span><b>${money(r.service_adjustment)}</b></div>`:''}<div class="grand-print"><span>المبلغ المرتجع</span><b>${money(r.total)}</b></div></div><hr><p>السبب: ${esc(r.reason)}</p><div class="r-footer">${payments.map(p=>`${esc(paymentLabel(p.method))}: ${money(p.amount)}`).join(' • ')}<br>${esc(c.receipt_footer||state.business?.receipt_footer||'شكرًا لزيارتكم')}</div></div>`}
function printReturnReceipt(r,items,payments){const c=printCfg(r.branch_id);printIsolated(returnReceiptHTML(r,items,payments),c.paper_size,1)}

async function renderOrders(){let rows=[];try{rows=await rest('orders',`select=*&branch_id=eq.${currentBranchId()}&order=created_at.desc&limit=200`);const bundles=await cachedOrderBundles();for(const o of rows){const old=bundles.find(x=>String(x.order?.id)===String(o.id));await cacheOrderBundle(o,old?.items||[])}}catch(e){if(!isNetError(e))throw e;rows=(await cachedOrderBundles()).map(x=>x.order).filter(o=>Number(o.branch_id)===currentBranchId())}$('#page').innerHTML=`<div class="panel"><h2>آخر الطلبات</h2><div class="table-wrap"><table><thead><tr><th>رقم الفاتورة</th><th>رقم البون</th><th>التاريخ</th><th>الفرع</th><th>العميل</th><th>النوع</th><th>الدفع</th><th>الحالة</th><th>الإجمالي</th><th></th></tr></thead><tbody>${rows.map(o=>`<tr><td>${esc(invoiceDisplay(o))}</td><td>${esc(bonDisplay(o))}</td><td>${fmtDate(o.created_at)}</td><td>${branchName(o.branch_id)}</td><td>${esc(o.customer_name||o.customer_phone||'-')}</td><td>${orderTypeLabel(o.order_type)}</td><td>${paymentLabel(o.payment_method)}</td><td><span class="tag">${statusLabel(o.status)}</span></td><td>${money(o.total)}</td><td><button class="secondary" data-order="${o.id}">تفاصيل</button></td></tr>`).join('')}</tbody></table></div></div>`;$('#page').onclick=e=>{const b=e.target.closest('[data-order]');if(b)openOrderDetails(b.dataset.order)}}


function customerImportField(row,names){for(const n of names){const k=Object.keys(row).find(x=>String(x).trim().toLowerCase()===String(n).trim().toLowerCase());if(k!==undefined&&row[k]!==null&&row[k]!==undefined)return String(row[k]).trim()}return ''}
function validEgyptMobile(phone){return /^01[0125]\d{8}$/.test(normalizePhone(phone))}
function colLettersToIndex(ref){let n=0;for(const ch of String(ref||'').match(/[A-Z]+/i)?.[0]||'')n=n*26+(ch.toUpperCase().charCodeAt(0)-64);return n-1}
async function unzipEntry(bytes,name){
 const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let eocd=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(dv.getUint32(i,true)===0x06054b50){eocd=i;break}}if(eocd<0)throw new Error('ملف Excel غير صالح');
 const count=dv.getUint16(eocd+10,true),cd=dv.getUint32(eocd+16,true);let pos=cd;
 for(let i=0;i<count;i++){if(dv.getUint32(pos,true)!==0x02014b50)break;const method=dv.getUint16(pos+10,true),comp=dv.getUint32(pos+20,true),fnl=dv.getUint16(pos+28,true),exl=dv.getUint16(pos+30,true),cml=dv.getUint16(pos+32,true),off=dv.getUint32(pos+42,true);const fn=new TextDecoder().decode(bytes.slice(pos+46,pos+46+fnl));if(fn===name){const lfn=dv.getUint16(off+26,true),lex=dv.getUint16(off+28,true),start=off+30+lfn+lex,data=bytes.slice(start,start+comp);if(method===0)return data;if(method===8){if(typeof DecompressionStream==='undefined')throw new Error('هذا الجهاز لا يدعم قراءة Excel مباشرة؛ استخدم CSV');const ds=new DecompressionStream('deflate-raw');return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer())}throw new Error('نوع ضغط Excel غير مدعوم')}pos+=46+fnl+exl+cml}
 return null;
}
async function parseXlsxRows(file){
 const bytes=new Uint8Array(await file.arrayBuffer()),dec=new TextDecoder('utf-8');
 const sharedBytes=await unzipEntry(bytes,'xl/sharedStrings.xml');let shared=[];
 if(sharedBytes){const doc=new DOMParser().parseFromString(dec.decode(sharedBytes),'application/xml');shared=[...doc.getElementsByTagName('si')].map(si=>[...si.getElementsByTagName('t')].map(t=>t.textContent||'').join(''))}
 let sheetBytes=await unzipEntry(bytes,'xl/worksheets/sheet1.xml');if(!sheetBytes)throw new Error('لم يتم العثور على أول Sheet في ملف Excel');
 const doc=new DOMParser().parseFromString(dec.decode(sheetBytes),'application/xml'),matrix=[];
 for(const r of [...doc.getElementsByTagName('row')]){const arr=[];for(const c of [...r.getElementsByTagName('c')]){const idx=colLettersToIndex(c.getAttribute('r')),t=c.getAttribute('t'),v=c.getElementsByTagName('v')[0]?.textContent??'',inline=c.getElementsByTagName('is')[0];let value=t==='s'?shared[Number(v)]??'':t==='inlineStr'?[...inline?.getElementsByTagName('t')||[]].map(x=>x.textContent||'').join(''):v;arr[idx]=value}matrix.push(arr)}
 if(!matrix.length)return[];const headers=(matrix.shift()||[]).map(x=>String(x??'').trim());return matrix.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
}
function parseCsvRows(text){const rows=[];let row=[],cell='',q=false;for(let i=0;i<=text.length;i++){const ch=text[i]??'\n';if(q){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++}else if(ch==='"')q=false;else cell+=ch}else if(ch==='"')q=true;else if(ch===','){row.push(cell);cell=''}else if(ch==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell=''}else cell+=ch}if(rows.length<2)return[];const h=rows.shift().map(x=>x.trim());return rows.filter(r=>r.some(x=>String(x).trim())).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))}
async function readCustomerImportFile(file){if(/\.xlsx$/i.test(file.name))return parseXlsxRows(file);if(/\.csv$/i.test(file.name))return parseCsvRows(await file.text());throw new Error('اختر ملف XLSX أو CSV')}
function normalizeImportedCustomer(row){
 const name=customerImportField(row,['cust_name','اسم العميل','name','customer_name','الاسم']);
 const phone=normalizePhone(customerImportField(row,['cust_phone','رقم الهاتف','phone','mobile','الموبايل']));
 const area=customerImportField(row,['area','المنطقة']);const address=customerImportField(row,['cust_address','العنوان','address']);const building=customerImportField(row,['building','المبنى','الدور']);
 return{name:name||phone,phone,area:area||null,address:[address,building].filter(Boolean).join(' — ')||null};
}
async function openCustomerImport(){
 const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>📥 استيراد العملاء</h2><p>اختر ملف أو أكثر بصيغة Excel XLSX أو CSV. لن يتم إنشاء رقم مكرر، والرقم غير الصالح سيتم تجاهله.</p><input id="customerImportFiles" type="file" accept=".xlsx,.csv" multiple><div id="customerImportSummary" class="empty">لم يتم اختيار ملفات</div><div class="modal-actions"><button class="secondary" data-close>إلغاء</button><button class="primary" data-import disabled>استيراد</button></div></div>`;document.body.appendChild(m);let prepared=[];
 const input=m.querySelector('#customerImportFiles'),summary=m.querySelector('#customerImportSummary'),btn=m.querySelector('[data-import]');
 input.onchange=async()=>{btn.disabled=true;summary.textContent='جاري فحص الملفات...';try{let raw=[];for(const f of [...input.files])raw.push(...await readCustomerImportFile(f));const mapped=raw.map(normalizeImportedCustomer),valid=mapped.filter(x=>validEgyptMobile(x.phone));const unique=new Map();for(const c of valid){const old=unique.get(c.phone);if(!old)unique.set(c.phone,c);else unique.set(c.phone,{name:old.name||c.name,phone:c.phone,area:old.area||c.area,address:old.address||c.address})}const existing=await fetchAll('customers','select=id,name,phone,area,address');const byPhone=new Map(existing.map(c=>[normalizePhone(c.phone),c]));prepared=[...unique.values()].map(c=>({data:c,existing:byPhone.get(c.phone)||null}));const newCount=prepared.filter(x=>!x.existing).length,dup=prepared.length-newCount,invalid=mapped.length-valid.length,fileDup=valid.length-unique.size;summary.innerHTML=`إجمالي الصفوف: <b>${mapped.length}</b><br>أرقام صالحة وفريدة: <b>${unique.size}</b><br>جديد: <b>${newCount}</b><br>موجود بالفعل: <b>${dup}</b><br>تكرار داخل الملفات: <b>${fileDup}</b><br>أرقام غير صالحة: <b>${invalid}</b>`;btn.disabled=!prepared.length}catch(e){summary.textContent='تعذر قراءة الملف: '+e.message}};
 m.onclick=async e=>{if(e.target.closest('[data-close]')||e.target===m){m.remove();return}if(!e.target.closest('[data-import]'))return;btn.disabled=true;try{let added=0,updated=0,skipped=0;const inserts=[];for(const x of prepared){if(!x.existing){inserts.push(x.data);continue}const patch={};if(!x.existing.name&&x.data.name)patch.name=x.data.name;if(!x.existing.area&&x.data.area)patch.area=x.data.area;if(!x.existing.address&&x.data.address)patch.address=x.data.address;if(Object.keys(patch).length){patch.updated_at=new Date().toISOString();await rest('customers',`id=eq.${x.existing.id}`,{method:'PATCH',body:JSON.stringify(patch)});updated++}else skipped++}for(let i=0;i<inserts.length;i+=100){const part=inserts.slice(i,i+100);await rest('customers','',{method:'POST',body:JSON.stringify(part)});added+=part.length}toast(`تم الاستيراد: ${added} جديد، ${updated} تحديث، ${skipped} موجود`);m.remove();renderCustomers()}catch(err){btn.disabled=false;toast('تعذر الاستيراد: '+err.message)}};
}
async function renderCustomers(){
 let rows=[];try{rows=await fetchAll('customers','select=*&order=created_at.desc');await odbSet('customersCache',rows)}catch(e){if(!isNetError(e))throw e;rows=(await odbGet('customersCache'))||[]}
 $('#page').innerHTML=`<div class="panel"><div class="toolbar"><h2>العملاء</h2><input id="customerSearch" placeholder="بحث بالاسم أو رقم الموبايل"><button id="importCustomers" class="secondary">📥 استيراد Excel/CSV</button></div><div class="table-wrap"><table><thead><tr><th>الاسم</th><th>الموبايل</th><th>المنطقة</th><th>العنوان</th><th>إجراء</th></tr></thead><tbody id="customersBody"></tbody></table></div></div>`;
 const draw=()=>{const v=$('#customerSearch').value.trim().toLowerCase();$('#customersBody').innerHTML=rows.filter(c=>!v||String(c.name||'').toLowerCase().includes(v)||String(c.phone||'').includes(v)).slice(0,300).map(c=>`<tr><td>${esc(c.name||'')}</td><td>${esc(c.phone||'')}</td><td>${esc(c.area||'')}</td><td>${esc(c.address||'')}</td><td><button class="secondary" data-edit-customer="${c.id}">✏️ تعديل</button> <button class="secondary" data-addresses="${c.id}">📍 العناوين</button></td></tr>`).join('')||'<tr><td colspan="5">لا توجد نتائج</td></tr>'};$('#customerSearch').oninput=draw;draw();$('#importCustomers').onclick=openCustomerImport;
 $('#customersBody').onclick=async e=>{const eb=e.target.closest('[data-edit-customer]'),ab=e.target.closest('[data-addresses]');if(eb){const c=rows.find(x=>String(x.id)===eb.dataset.editCustomer);const name=await uiPrompt('اسم العميل',c.name||'');if(name===null)return;const phone=await uiPrompt('رقم الموبايل',c.phone||'');if(phone===null)return;const area=await uiPrompt('المنطقة',c.area||'');if(area===null)return;const address=await uiPrompt('العنوان',c.address||'');if(address===null)return;const dup=rows.find(x=>x.id!==c.id&&normalizePhone(x.phone)===normalizePhone(phone));if(dup)return toast('رقم الموبايل مسجل لعميل آخر');await rest('customers',`id=eq.${c.id}`,{method:'PATCH',body:JSON.stringify({name:name.trim(),phone:phone.trim(),area:area.trim()||null,address:address.trim()||null,updated_at:new Date().toISOString()})});toast('تم تعديل العميل');renderCustomers();return;}if(ab){openCustomerAddresses(Number(ab.dataset.addresses));}};
}
async function openCustomerAddresses(customerId){const rows=await rest('customer_addresses',`select=*&customer_id=eq.${customerId}&order=is_default.desc,id.desc`);const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>عناوين العميل</h2><div class="option-list">${rows.map(a=>`<div class="manage-row"><span>${esc(a.label||a.area||'عنوان')} — ${esc(a.address||'')}</span><span><button class="secondary" data-edit-address="${a.id}">✏️</button><button class="danger" data-delete-address="${a.id}">🗑️</button></span></div>`).join('')||'<div class="empty">لا توجد عناوين</div>'}</div><button class="secondary" data-add-address>+ إضافة عنوان</button><div class="modal-actions"><button class="primary" data-close>إغلاق</button></div></div>`;document.body.appendChild(m);m.onclick=async e=>{if(e.target.closest('[data-close]')||e.target===m){m.remove();return}const add=e.target.closest('[data-add-address]');if(add){const label=await uiPrompt('اسم العنوان','المنزل');if(label===null)return;const area=await uiPrompt('المنطقة','');if(area===null)return;const address=await uiPrompt('العنوان بالتفصيل','');if(address===null||!address.trim())return;await rest('customer_addresses','',{method:'POST',body:JSON.stringify([{customer_id:customerId,label,area,address,is_default:rows.length===0}])});m.remove();openCustomerAddresses(customerId);return}const ed=e.target.closest('[data-edit-address]');if(ed){const a=rows.find(x=>String(x.id)===ed.dataset.editAddress);const label=await uiPrompt('اسم العنوان',a.label||'');if(label===null)return;const area=await uiPrompt('المنطقة',a.area||'');if(area===null)return;const address=await uiPrompt('العنوان',a.address||'');if(address===null)return;await rest('customer_addresses',`id=eq.${a.id}`,{method:'PATCH',body:JSON.stringify({label,area,address})});m.remove();openCustomerAddresses(customerId);return}const del=e.target.closest('[data-delete-address]');if(del&&await uiConfirm('حذف هذا العنوان؟')){await rest('customer_addresses',`id=eq.${del.dataset.deleteAddress}`,{method:'DELETE'});m.remove();openCustomerAddresses(customerId)}}}

async function renderDelivery(){
 $('#page').innerHTML=`<div class="panel"><h2>تحميل شاشة الدليفري...</h2></div>`;
 let drivers=[],zones=[],outOrders=[];
 try{drivers=await rest('delivery_drivers','select=*&order=active.desc,name')}catch(e){console.error('drivers',e)}
 try{zones=await rest('delivery_zones','select=*&order=active.desc,name')}catch(e){console.error('zones',e)}
 try{outOrders=await rest('orders','select=*&order_type=eq.delivery&status=in.(new,ready,out_for_delivery)&order=created_at.desc&limit=100')}catch(e){console.error('delivery orders',e)}
 state.drivers=drivers||[]; state.deliveryZones=zones||[];
 $('#page').innerHTML=`<div class="grid delivery-admin-grid">
 <div class="panel"><h2>🛵 مناديب التوصيل</h2><div class="form-grid"><label>الاسم<input id="driverName" placeholder="اسم المندوب"></label><label>الموبايل<input id="driverPhone" inputmode="tel" placeholder="رقم الموبايل"></label><label>الفرع<select id="driverBranch" disabled><option value="${currentBranchId()}">${esc(branchName(currentBranchId()))}</option></select></label></div><button id="addDriver" class="primary">إضافة مندوب</button><div class="chips">${drivers.map(d=>`<span class="chip">${d.name} • ${branchName(d.branch_id)}</span>`).join('')||'لا يوجد مناديب حتى الآن'}</div></div>
 <div class="panel"><h2>📍 مناطق الدليفري</h2><div class="form-grid"><label>المنطقة<input id="zoneName" placeholder="اسم المنطقة"></label><label>الفرع المسؤول<select id="zoneBranch" disabled><option value="${currentBranchId()}">${esc(branchName(currentBranchId()))}</option></select></label><label>رسوم التوصيل<input id="zoneFee" type="number" min="0" step="0.01" value="0"></label></div><button id="addZone" class="primary">إضافة منطقة</button><div class="chips">${zones.map(z=>`<span class="chip">${z.name} • ${money(z.delivery_fee)} • ${branchName(z.branch_id)}</span>`).join('')||'لا توجد مناطق حتى الآن'}</div></div></div>
 <div class="panel"><h2>طلبات الدليفري الحالية</h2><div class="table-wrap"><table><thead><tr><th>الأوردر</th><th>الفرع</th><th>العميل</th><th>العنوان</th><th>الحالة</th><th>المندوب</th><th>إجراء</th></tr></thead><tbody>${outOrders.length?outOrders.map(o=>`<tr><td>${esc(bonDisplay(o))}</td><td>${branchName(o.branch_id)}</td><td>${o.customer_phone||'-'}</td><td>${o.delivery_address||'-'}</td><td>${statusLabel(o.status)}</td><td>${drivers.find(d=>String(d.id)===String(o.driver_id))?.name||'-'}</td><td>${o.status!=='out_for_delivery'?`<button class="secondary" data-assign="${o.id}">تسليم لمندوب</button>`:`<button class="primary" data-delivered="${o.id}">تم التسليم</button>`}</td></tr>`).join(''):'<tr><td colspan="7">لا توجد طلبات دليفري حالية</td></tr>'}</tbody></table></div></div>`;
 $('#addDriver').onclick=async()=>{if(!$('#driverName').value.trim())return toast('اكتب اسم المندوب');await rest('delivery_drivers','',{method:'POST',body:JSON.stringify([{name:$('#driverName').value.trim(),phone:$('#driverPhone').value.trim()||null,branch_id:currentBranchId(),active:true}])});toast('تمت إضافة المندوب');renderDelivery()};
 $('#addZone').onclick=async()=>{const zoneNameValue=$('#zoneName').value.trim(),zoneFeeValue=Number($('#zoneFee')?.value||0);if(!zoneNameValue)return toast('اكتب اسم المنطقة');if(!Number.isFinite(zoneFeeValue)||zoneFeeValue<0)return toast('رسوم التوصيل غير صحيحة');await rest('delivery_zones','',{method:'POST',body:JSON.stringify([{name:zoneNameValue,delivery_fee:zoneFeeValue,branch_id:currentBranchId(),active:true}])});toast('تمت إضافة المنطقة');renderDelivery()};
 $('#page').onclick=async e=>{
   const a=e.target.closest('[data-assign]'); if(a){
     openDriverPicker(Number(a.dataset.assign),drivers,()=>renderDelivery());return;
   }
   const done=e.target.closest('[data-delivered]');
   if(done){
     await rest('orders',`id=eq.${done.dataset.delivered}`,{method:'PATCH',body:JSON.stringify({status:'delivered',delivered_at:new Date().toISOString()})});
     toast('تم تسجيل التسليم');renderDelivery()
   }
 };
}

async function renderKitchen(){if(!state.settings.enable_kitchen){$('#page').innerHTML='<div class="empty">شاشة المطبخ غير مفعلة من الإعدادات</div>';return;}const rows=await rest('orders',`select=*&branch_id=eq.${currentBranchId()}&status=in.(new,preparing,ready)&order=created_at.asc&limit=100`);const cards=await Promise.all(rows.map(async o=>{const items=await rest('order_items',`select=product_name,quantity,notes&order_id=eq.${o.id}&order=id`);return `<div class="panel kitchen-card"><div class="kitchen-head"><div><h2>أوردر #${o.id}</h2><small>${fmtDate(o.created_at)} • ${orderTypeLabel(o.order_type)}</small></div><span class="tag">${statusLabel(o.status)}</span></div><div class="kitchen-items">${items.map(i=>`<div><b>${Number(i.quantity)||0} ×</b> ${esc(i.product_name)}${i.notes?`<small class=\"kitchen-note\">📝 ${esc(i.notes)}</small>`:''}</div>`).join('')}</div><div class="modal-actions">${o.status==='new'?`<button class="primary" data-status="preparing" data-id="${o.id}">بدء التحضير</button>`:''}${o.status==='preparing'?`<button class="primary" data-status="ready" data-id="${o.id}">${o.source==='website'&&o.order_type==='pickup'?'جاهز للاستلام':'جاهز'}</button>`:''}${o.status==='ready'&&o.source==='website'&&o.order_type==='pickup'?`<button class="primary" data-status="completed" data-id="${o.id}">تم تسليم الطلب للعميل</button>`:''}${o.status==='ready'&&!(o.source==='website'&&['pickup','delivery'].includes(o.order_type))?`<button class="primary" data-status="completed" data-id="${o.id}">تم التسليم</button>`:''}</div></div>`}));$('#page').innerHTML=`<div class="kitchen-grid">${cards.join('')||'<div class="empty">لا توجد طلبات بالمطبخ حاليًا</div>'}</div>`;$('#page').onclick=async e=>{const b=e.target.closest('[data-status]');if(!b)return;await rest('orders',`id=eq.${b.dataset.id}`,{method:'PATCH',body:JSON.stringify({status:b.dataset.status})});toast('تم تحديث حالة الطلب');renderKitchen()}}

async function shiftMetrics(shift){
 const orderIds=(await rest('orders',`select=id&shift_id=eq.${shift.id}`)).map(x=>x.id);
 const [orders,payments,expenses,returns,returnPays]=await Promise.all([
  rest('orders',`select=id,total,subtotal,discount,delivery_fee,status,order_type,payment_method,source,payment_status&shift_id=eq.${shift.id}`),
  rest('order_payments',`select=order_id,method,amount&order_id=in.(${orderIds.join(',')||0})`),
  rest('expenses',`select=amount&shift_id=eq.${shift.id}`),
  rest('returns',`select=id,total&shift_id=eq.${shift.id}`).catch(()=>[]),
  rest('return_payments',`select=return_id,method,amount&return_id=in.(${(await rest('returns',`select=id&shift_id=eq.${shift.id}`).catch(()=>[])).map(x=>x.id).join(',')||0})`).catch(()=>[])
 ]);
 const operational=orders.filter(o=>o.status!=='cancelled');const valid=operational.filter(o=>String(o.source||'')!=='website'||o.payment_status==='confirmed'||(String(o.payment_method||'').toLowerCase()==='cash'&&['delivered','completed'].includes(String(o.status||'').toLowerCase())));const ids=new Set(valid.map(o=>String(o.id)));const paymentTotals={};
 const addPay=(method,amount)=>{const k=String(method||'unknown');paymentTotals[k]=(paymentTotals[k]||0)+Number(amount||0)};
 for(const p of payments){if(!ids.has(String(p.order_id)))continue;addPay(p.method,p.amount)}
 for(const o of valid){
  if(payments.some(p=>String(p.order_id)===String(o.id)))continue;
  const isWebsite=String(o.source||'')==='website';
  const websiteCollected=!isWebsite||o.payment_status==='confirmed'||(o.payment_method==='cash'&&['delivered','completed'].includes(o.status));
  if(!websiteCollected)continue;
  addPay(o.payment_method,Number(o.total||0));
 }
 const returnPaymentTotals={};for(const p of returnPays){const k=String(p.method||'unknown');returnPaymentTotals[k]=(returnPaymentTotals[k]||0)+Number(p.amount||0);addPay(k,-Number(p.amount||0))}
 const cash=Number(paymentTotals.cash||0),wallet=Number(paymentTotals.wallet||0),instapay=Number(paymentTotals.instapay||0);
 const returnCash=Number(returnPaymentTotals.cash||0),returnWallet=Number(returnPaymentTotals.wallet||0),returnInstapay=Number(returnPaymentTotals.instapay||0);
 const grossSales=valid.reduce((a,o)=>a+Number(o.total||0),0),returnTotal=(returns||[]).reduce((a,r)=>a+Number(r.total||0),0),sales=grossSales-returnTotal,exp=expenses.reduce((a,e)=>a+Number(e.amount||0),0),expected=Number(shift.opening_cash||0)+cash-exp;
 return{orders,valid,sales,grossSales,returnTotal,returns,cash,wallet,instapay,paymentTotals,returnPaymentTotals,returnCash,returnWallet,returnInstapay,exp,expected,count:valid.length,cancelled:orders.filter(o=>o.status==='cancelled').length}
}
async function shiftReportData(shift){
 const orders=await rest('orders',`select=id,order_number,total,subtotal,discount,delivery_fee,status,order_type,payment_method,source,payment_status,created_at&shift_id=eq.${shift.id}&order=created_at.asc`);
 const ids=(orders||[]).map(o=>o.id);
 const [items,expenses,returnRows]=await Promise.all([
   ids.length?rest('order_items',`select=order_id,product_name,quantity,unit_price,total&order_id=in.(${ids.join(',')})`):Promise.resolve([]),
   rest('expenses',`select=id,description,amount,created_at,employee_id&shift_id=eq.${shift.id}&order=created_at.asc`),
   rest('returns',`select=*&shift_id=eq.${shift.id}&order=created_at.asc`).catch(()=>[])
 ]);
 const valid=(orders||[]).filter(o=>{const web=String(o.source||'')==='website',paid=!web||o.payment_status==='confirmed'||(String(o.payment_method||'').toLowerCase()==='cash'&&['delivered','completed'].includes(String(o.status||'').toLowerCase()));return o.status!=='cancelled'&&paid});
 const validIds=new Set(valid.map(o=>String(o.id)));
 const products=new Map();
 for(const i of (items||[])){
   if(!validIds.has(String(i.order_id)))continue;
   const k=i.product_name||'صنف',x=products.get(k)||{name:k,qty:0,total:0};
   x.qty+=Number(i.quantity||0);x.total+=Number(i.total||0);products.set(k,x);
 }
 const returnIds=(returnRows||[]).map(r=>r.id);
 const returnItems=returnIds.length?await rest('return_items',`select=return_id,product_name,quantity,total&return_id=in.(${returnIds.join(',')})`).catch(()=>[]):[];
 for(const i of returnItems){
   const k=i.product_name||'صنف',x=products.get(k)||{name:k,qty:0,total:0};
   x.qty-=Number(i.quantity||0);x.total-=Number(i.total||0);products.set(k,x);
 }
 return {
   orders:orders||[],valid,items:items||[],expenses:expenses||[],returnItems,
   products:[...products.values()].filter(x=>Math.abs(x.qty)>0.0001||Math.abs(x.total)>0.005).sort((a,b)=>b.qty-a.qty),
   deliveryCount:valid.filter(o=>o.order_type==='delivery').length,
   deliveryFees:valid.reduce((a,o)=>a+Number(o.delivery_fee||0),0),
   cancelled:(orders||[]).filter(o=>o.status==='cancelled'),
   cancelledValue:(orders||[]).filter(o=>o.status==='cancelled').reduce((a,o)=>a+Number(o.total||0),0),
   returns:returnRows||[],returnTotal:(returnRows||[]).reduce((a,r)=>a+Number(r.total||0),0)
 };
}
function shiftReportHTML(sh,employees,mtr,data){
 const sales=sh.closed_at?Number(sh.sales_total??mtr.sales):mtr.sales,cash=sh.closed_at?Number(sh.cash_sales??mtr.cash):mtr.cash,exp=sh.closed_at?Number(sh.expenses_total??mtr.exp):mtr.exp,expected=sh.closed_at?Number(sh.expected_cash??mtr.expected):mtr.expected;
 const methodName=code=>state.paymentMethods.find(x=>String(x.code)===String(code))?.name||({cash:'كاش',wallet:'محفظة',instapay:'InstaPay',visa:'Visa'}[code]||code);
 const paymentRows=Object.entries(mtr.paymentTotals||{}).filter(([,v])=>Math.abs(Number(v||0))>0.005).map(([code,v])=>`<div><span>${esc(methodName(code))}</span><b>${money(v)}</b></div>`).join('');
 return `<div class="shift-print"><h2>${esc(businessName())}</h2><h3>تقرير وردية #${sh.id}</h3><div class="r-meta">${esc(branchName(sh.branch_id))}<br>${esc(employeeName(sh.employee_id,employees)||'موظف')}<br>فتح: ${fmtDate(sh.opened_at)}<br>قفل: ${sh.closed_at?fmtDate(sh.closed_at):'مفتوحة الآن'}</div><hr>
 <div class="r-totals"><div><span>صافي المبيعات بعد المرتجعات</span><b>${money(sales)}</b></div>${Number(data.returnTotal||0)?`<div><span>المرتجعات</span><b>-${money(data.returnTotal)}</b></div>`:``}<div><span>عدد الأوردرات</span><b>${data.valid.length}</b></div>${paymentRows}<div><span>أوردرات دليفري</span><b>${data.deliveryCount}</b></div><div><span>رسوم التوصيل</span><b>${money(data.deliveryFees)}</b></div><div><span>أوردرات ملغية</span><b>${data.cancelled.length} (${money(data.cancelledValue)})</b></div></div><hr>
 <h3>مبيعات الأصناف</h3><table class="shift-report-table"><thead><tr><th>الصنف</th><th>الكمية</th><th>الإجمالي</th></tr></thead><tbody>${data.products.map(x=>`<tr><td>${esc(x.name)}</td><td>${x.qty}</td><td>${money(x.total)}</td></tr>`).join('')||'<tr><td colspan="3">لا توجد مبيعات</td></tr>'}</tbody></table><hr>
 <h3>المصروفات</h3><table class="shift-report-table"><thead><tr><th>البيان</th><th>المبلغ</th></tr></thead><tbody>${data.expenses.map(x=>`<tr><td>${esc(x.description||'مصروف')}<small>${fmtDate(x.created_at)}</small></td><td>${money(x.amount)}</td></tr>`).join('')||'<tr><td colspan="2">لا توجد مصروفات</td></tr>'}</tbody></table><div class="r-totals"><div><span>إجمالي المصروفات</span><b>${money(exp)}</b></div></div><hr>
 <div class="r-totals"><div><span>افتتاحية الخزنة</span><b>${money(sh.opening_cash)}</b></div><div><span>الكاش المتوقع</span><b>${money(expected)}</b></div>${sh.closed_at?`<div><span>الكاش الفعلي</span><b>${money(sh.closing_cash)}</b></div><div class="grand-print"><span>العجز / الزيادة</span><b>${money(sh.cash_difference||0)}</b></div>`:''}</div><hr><div class="r-footer">تقرير الوردية • ${new Date().toLocaleString('ar-EG')}</div></div>`;
}
async function openShiftReport(sh,employees){const [mtr,data]=await Promise.all([shiftMetrics(sh),shiftReportData(sh)]);const html=shiftReportHTML(sh,employees,mtr,data);const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card shift-detail"><h2>تقرير وردية #${sh.id}</h2><div class="report-summary-list"><div>صافي المبيعات <b>${money(sh.closed_at?sh.sales_total:mtr.sales)}</b></div><div>المرتجعات <b>${money(data.returnTotal||mtr.returnTotal||0)}</b></div><div>الأوردرات <b>${data.valid.length}</b></div><div>المصروفات <b>${money(sh.closed_at?sh.expenses_total:mtr.exp)}</b></div><div>أصناف مباعة <b>${data.products.length}</b></div><div>رسوم التوصيل <b>${money(data.deliveryFees)}</b></div><div>ملغي <b>${data.cancelled.length}</b></div></div><div class="modal-actions"><button class="secondary" data-close>إغلاق</button><button class="primary" data-print-shift>🖨️ طباعة تقرير الوردية</button></div></div>`;document.body.appendChild(m);m.onclick=e=>{if(e.target.closest('[data-close]')||e.target===m)m.remove();if(e.target.closest('[data-print-shift]'))printIsolated(html)}}
async function renderShifts(){let employees=[],rows=[];try{employees=await rest('employees','select=id,name,branch_id,role,active&order=name');rows=await rest('shifts',`select=*&branch_id=eq.${currentBranchId()}&order=opened_at.desc&limit=100`);await odbSet(`shiftHistory:${currentBranchId()}`,rows)}catch(e){if(!isNetError(e))throw e;employees=[state.employee];rows=(await odbGet(`shiftHistory:${currentBranchId()}`))||[];const cached=await cachedOpenShift();if(cached&&!rows.some(x=>String(x.id)===String(cached.id)))rows.unshift(cached)}const isAdmin=state.employee.role==='admin';const open=rows.find(s=>String(s.employee_id)===String(state.employee.id)&&s.status==='open'&&!s.closed_at);let metrics=open?await shiftMetrics(open):null;$('#page').innerHTML=`${open?`<div class="panel shift-current"><div class="shift-title"><div><h2>🟢 الوردية الحالية</h2><p>${branchName(open.branch_id)} • بدأت ${fmtDate(open.opened_at)} • ${employeeName(open.employee_id,employees)}</p></div><span class="shift-duration">${Math.max(0,Math.floor((Date.now()-new Date(open.opened_at))/60000))} دقيقة</span></div><div class="grid kpis"><div class="card kpi"><small>إجمالي المبيعات</small><strong>${money(metrics.sales)}</strong></div><div class="card kpi"><small>عدد الأوردرات</small><strong>${metrics.count}</strong></div><div class="card kpi"><small>كاش</small><strong>${money(metrics.cash)}</strong></div><div class="card kpi"><small>مصروفات</small><strong>${money(metrics.exp)}</strong></div></div><div class="shift-pay-grid"><div>افتتاحية الخزنة <b>${money(open.opening_cash)}</b></div>${Object.entries(metrics.paymentTotals||{}).filter(([k,v])=>k!=='cash'&&Math.abs(Number(v||0))>0.005).map(([k,v])=>`<div>${esc(state.paymentMethods.find(x=>String(x.code)===String(k))?.name||k)} <b>${money(v)}</b></div>`).join('')}<div>الكاش المتوقع بالدرج <b>${money(metrics.expected)}</b></div></div><div class="toolbar close-shift-bar"><label>الكاش الفعلي عند القفل<input id="closingCash" type="number" min="0" step="0.01" placeholder="عدّ الدرج واكتب الرقم"></label><button id="closeShift" class="danger">إغلاق الوردية وعمل التسوية</button></div></div>`:`<div class="panel"><h2>فتح وردية جديدة</h2><p>أي مبيعات ومصروفات بعد الفتح هتتربط بالوردية دي تلقائيًا.</p><div class="toolbar"><label>عهدة بداية الوردية<input id="openingCash" type="number" min="0" step="0.01" value="0"></label><button id="openShift" class="primary">فتح الوردية</button></div></div>`}<div class="panel"><div class="shift-title"><h2>سجل الورديات</h2></div><div class="table-wrap"><table><thead><tr><th>#</th><th>الفرع</th><th>الموظف</th><th>الفتح</th><th>القفل</th><th>المبيعات</th><th>كاش</th><th>مصروفات</th><th>العجز/الزيادة</th><th>الحالة</th><th></th></tr></thead><tbody id="shiftRows"></tbody></table></div></div>`;
 const drawHistory=()=>{const list=rows;$('#shiftRows').innerHTML=list.map(x=>`<tr><td>${x.id}</td><td>${esc(branchName(x.branch_id))}</td><td>${esc(employeeName(x.employee_id,employees))}</td><td>${fmtDate(x.opened_at)}</td><td>${x.closed_at?fmtDate(x.closed_at):'-'}</td><td>${money(x.sales_total||0)}</td><td>${money(x.cash_sales||0)}</td><td>${money(x.expenses_total||0)}</td><td class="${Number(x.cash_difference||0)<0?'negative':'positive'}">${x.closed_at?money(x.cash_difference||0):'-'}</td><td><span class="tag">${x.status==='open'?'مفتوحة':'مقفولة'}</span></td><td><button class="secondary" data-shift="${x.id}">التفاصيل</button></td></tr>`).join('')||'<tr><td colspan="11">لا توجد ورديات</td></tr>'};drawHistory();
 if(open)$('#closeShift').onclick=async()=>{const actual=Number($('#closingCash').value);if(!Number.isFinite(actual)||actual<0)return toast('اكتب الكاش الفعلي عند القفل بقيمة صفر أو أكبر');const pending=metrics.orders.filter(o=>(o.order_type==='delivery'&&!['delivered','cancelled','completed'].includes(o.status))||(String(o.source||'')==='website'&&o.order_type!=='delivery'&&!['completed','cancelled'].includes(o.status)));if(pending.length)return toast(`فيه ${pending.length} أوردر معلق — خلصه أو الغيه قبل القفل`);const diff=actual-metrics.expected;let closedShift;try{closedShift=await rpc('close_pos_shift_idempotent',{p_shift_id:Number(open.id),p_closing_cash:actual,p_metrics:{sales_total:metrics.sales,cash_sales:metrics.cash,wallet_sales:metrics.wallet,instapay_sales:metrics.instapay,expenses_total:metrics.exp,expected_cash:metrics.expected,cash_difference:diff,orders_count:metrics.count},p_client_tx_id:uuid()});await odbSet(`openShift:${state.employee?.id}:${currentBranchId()}`,null);toast(diff===0?'تم قفل الوردية — الخزنة مظبوطة':`تم القفل — ${diff>0?'زيادة':'عجز'} ${money(Math.abs(diff))}`)}catch(err){if(!isNetError(err))throw err;closedShift=await saveOfflineShiftClose(open,metrics,actual);toast(`تم قفل الوردية محليًا — ${diff===0?'الخزنة مظبوطة':(diff>0?'زيادة ':'عجز ')+money(Math.abs(diff))} — ستتم المزامنة تلقائيًا`)}try{if(window.topBurgerDesktop?.backup?.create)await window.topBurgerDesktop.backup.create('shift-close')}catch{};if(navigator.onLine&&window.topBurgerDesktop?.isDesktop)createDesktopFullBackup('shift-close-full').catch(e=>console.warn('shift close full backup',e));await renderShifts();if(navigator.onLine)await openShiftReport(closedShift,employees)};
 else $('#openShift').onclick=async()=>{const opening=Number($('#openingCash').value||0);if(!Number.isFinite(opening)||opening<0)return toast('عهدة بداية الوردية لازم تكون صفر أو أكبر');try{const created=await rpc('open_pos_shift_idempotent',{p_branch_id:Number(currentBranchId()),p_opening_cash:opening,p_client_tx_id:uuid()});await rememberOpenShift(created);toast('تم فتح الوردية')}catch(err){if(!isNetError(err))throw err;await saveOfflineShiftOpen(opening);toast('تم فتح الوردية محليًا — ستتم المزامنة تلقائيًا')}renderShifts()};
 $('#page').addEventListener('click',async e=>{const b=e.target.closest('[data-shift]');if(!b)return;const sh=rows.find(x=>String(x.id)===String(b.dataset.shift));if(!sh)return;await openShiftReport(sh,employees)});
}

async function renderExpenses(){
 const today=localDateInput();
 $('#page').innerHTML=`<div class="panel"><h2>إضافة مصروف</h2><div class="form-grid"><label>البيان<input id="exTitle"></label><label>المبلغ<input id="exAmount" type="number" min="0" step="0.01"></label></div><button id="addExpense" class="primary">حفظ المصروف</button></div>
 <div class="panel"><div class="toolbar expense-toolbar"><button class="secondary" data-period="today">اليوم</button><button class="secondary" data-period="yesterday">أمس</button><button class="secondary" data-period="week">الأسبوع</button><button class="secondary" data-period="month">الشهر</button><label>من<input id="exFrom" type="date" value="${today}"></label><label>إلى<input id="exTo" type="date" value="${today}"></label><button id="loadExpenses" class="primary">عرض</button></div><div class="kpi-line">إجمالي مصروفات الفترة: <strong id="expenseTotal">0</strong></div><div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>البيان</th><th>المبلغ</th><th>الوردية</th><th>إجراء</th></tr></thead><tbody id="expenseRows"></tbody></table></div></div>`;
 const load=async()=>{const from=$('#exFrom').value,to=$('#exTo').value;if(!from||!to||from>to)return toast('راجع فترة المصروفات: تاريخ البداية لازم يكون قبل أو يساوي تاريخ النهاية');const a=new Date(from+'T00:00:00').toISOString(),b=new Date(to+'T23:59:59.999').toISOString();const rows=await rest('expenses',`select=*&branch_id=eq.${currentBranchId()}&created_at=gte.${encodeURIComponent(a)}&created_at=lte.${encodeURIComponent(b)}&order=created_at.desc&limit=500`);$('#expenseTotal').textContent=money(rows.reduce((x,e)=>x+Number(e.amount||0),0));$('#expenseRows').innerHTML=rows.map(e=>`<tr><td>${fmtDate(e.created_at)}</td><td>${esc(e.description)}</td><td>${money(e.amount)}</td><td>${e.shift_id?'#'+e.shift_id:'-'}</td><td><button class="secondary" data-edit-exp="${e.id}">✏️ تعديل</button></td></tr>`).join('')||'<tr><td colspan="5">لا توجد مصروفات في الفترة</td></tr>';$('#expenseRows').onclick=async ev=>{const btn=ev.target.closest('[data-edit-exp]');if(!btn)return;const e=rows.find(x=>String(x.id)===btn.dataset.editExp);if(!e)return;const desc=await uiPrompt('بيان المصروف',e.description);if(desc===null)return;const amount=await uiPrompt('المبلغ',e.amount);const amountNum=Number(amount);if(amount===null||!desc.trim()||!Number.isFinite(amountNum)||amountNum<=0)return toast('اكتب بيانًا ومبلغًا أكبر من صفر');await rest('expenses',`id=eq.${e.id}`,{method:'PATCH',body:JSON.stringify({description:desc.trim(),amount:amountNum})});await audit('edit_expense','expense',e.id,{amount:Number(amount)});toast('تم تعديل المصروف');load()};};
 $('#loadExpenses').onclick=load;$('#page').onclick=e=>{const b=e.target.closest('[data-period]');if(!b)return;const d=new Date(),fmt=x=>{const z=new Date(x.getTime()-x.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)};let from=new Date(d),to=new Date(d);if(b.dataset.period==='yesterday'){from.setDate(d.getDate()-1);to=new Date(from)}if(b.dataset.period==='week')from.setDate(d.getDate()-6);if(b.dataset.period==='month')from=new Date(d.getFullYear(),d.getMonth(),1);$('#exFrom').value=fmt(from);$('#exTo').value=fmt(to);load()};
 $('#addExpense').onclick=async()=>{const description=$('#exTitle').value.trim(),amount=Number($('#exAmount').value);if(!description||!Number.isFinite(amount)||amount<=0)return toast('أدخل بيانًا ومبلغًا أكبر من صفر');const shift=await getOpenShift();if(!shift)return toast('افتح وردية أولًا قبل تسجيل المصروف');let created;try{created=await rpc('create_pos_expense_idempotent',{p_shift_id:Number(shift.id),p_description:description,p_amount:amount,p_client_tx_id:uuid()});await audit('create_expense','expense',created?.id,{amount,shift_id:shift.id});toast('تم حفظ المصروف وربطه بالوردية')}catch(err){if(!isNetError(err))throw err;await saveOfflineExpense(shift,description,amount);toast('تم حفظ المصروف أوفلاين وسيُزامن تلقائيًا')}if(navigator.onLine)load()};load();
}

function catalogOrderValue(x){const w=Number(x?.website_sort_order);if(Number.isFinite(w)&&w>0)return w;const s=Number(x?.sort_order);if(Number.isFinite(s)&&s>0)return s;return 1000000+Number(x?.id||0)}
function sortedActiveCategories(){return state.categories.filter(c=>c.active!==false).slice().sort((a,b)=>catalogOrderValue(a)-catalogOrderValue(b)||Number(a.id)-Number(b.id))}
function sortedActiveProducts(categoryId=null){return state.products.filter(p=>p.active!==false&&(categoryId===null||String(p.category_id)===String(categoryId))).slice().sort((a,b)=>catalogOrderValue(a)-catalogOrderValue(b)||Number(a.id)-Number(b.id))}
async function moveCategoryOrder(id,dir){const items=sortedActiveCategories();const i=items.findIndex(x=>String(x.id)===String(id));const j=i+dir;if(i<0||j<0||j>=items.length)return;[items[i],items[j]]=[items[j],items[i]];await Promise.all(items.map((x,k)=>rest('categories',`id=eq.${x.id}`,{method:'PATCH',body:JSON.stringify({sort_order:(k+1)*10,website_sort_order:(k+1)*10})})));await reloadCatalog();toast('تم حفظ ترتيب التصنيفات');renderProducts()}
async function moveProductOrder(id,dir){const p=state.products.find(x=>String(x.id)===String(id));if(!p)return;const items=sortedActiveProducts(p.category_id);const i=items.findIndex(x=>String(x.id)===String(id));const j=i+dir;if(i<0||j<0||j>=items.length)return;[items[i],items[j]]=[items[j],items[i]];await Promise.all(items.map((x,k)=>rest('products',`id=eq.${x.id}`,{method:'PATCH',body:JSON.stringify({website_sort_order:(k+1)*10})})));await reloadCatalog();toast('تم حفظ ترتيب الأصناف');renderProducts()}
async function reloadCatalog(){state.categories=await rest('categories','select=*&order=id');state.products=await rest('products','select=*&order=id');}
function variantBuilderHTML(rows=[]){
 const data=rows.length?rows:[{name:'سينجل',price:'',sort_order:10},{name:'دبل',price:'',sort_order:20}];
 return `<div class="variant-builder-list">${data.map((v,i)=>`<div class="variant-builder-row" data-variant-row ${v.id?`data-existing-id="${v.id}"`:''}><input data-variant-name placeholder="اسم الاختيار مثل سينجل" value="${esc(v.name||'')}"><input data-variant-price type="number" min="0" step="0.01" placeholder="السعر" value="${v.price??''}"><button type="button" class="danger variant-remove" data-remove-variant title="حذف الاختيار">×</button></div>`).join('')}</div>`;
}
function bindVariantBuilder(root,toggleSel,boxSel,addSel){
 const toggle=root.querySelector(toggleSel),box=root.querySelector(boxSel),add=root.querySelector(addSel);
 const sync=()=>{if(box)box.classList.toggle('hidden',!toggle?.checked)};
 toggle?.addEventListener('change',sync);sync();
 add?.addEventListener('click',()=>{const list=box.querySelector('.variant-builder-list');const row=document.createElement('div');row.className='variant-builder-row';row.setAttribute('data-variant-row','');row.innerHTML='<input data-variant-name placeholder="اسم الاختيار"><input data-variant-price type="number" min="0" step="0.01" placeholder="السعر"><button type="button" class="danger variant-remove" data-remove-variant title="حذف الاختيار">×</button>';list.appendChild(row)});
 root.addEventListener('click',e=>{const b=e.target.closest('[data-remove-variant]');if(!b)return;const row=b.closest('[data-variant-row]');if(row)row.remove()});
}
function collectVariantRows(root,scope){
 const rows=[...root.querySelectorAll(`${scope} [data-variant-row]`)];
 const out=[];
 for(let i=0;i<rows.length;i++){
  const name=rows[i].querySelector('[data-variant-name]')?.value.trim()||'';
  const raw=rows[i].querySelector('[data-variant-price]')?.value;
  if(!name && (raw===''||raw==null))continue;
  const price=Number(raw);
  if(!name)throw new Error('اكتب اسم كل اختيار');
  if(!Number.isFinite(price)||price<0)throw new Error(`راجع سعر ${name}`);
  out.push({id:rows[i].dataset.existingId?Number(rows[i].dataset.existingId):null,name,price,sort_order:(i+1)*10,active:true});
 }
 return out;
}

function activeModifiers(){return state.modifiers.filter(x=>x.active!==false)}
function modifierPickerHTML(prefix,selectedIds=[],defaultAll=false){
 const mods=activeModifiers();const selected=new Set(selectedIds.map(String));const all=mods.length>0&&(defaultAll||mods.every(x=>selected.has(String(x.id))));
 return `<div class="extras-picker" data-extras-picker="${prefix}"><label class="setting-switch extras-all"><span>كل الإضافات</span><input id="${prefix}AllExtras" type="checkbox" ${all?'checked':''}></label><div class="option-list extras-admin-list">${mods.map(x=>`<label><input type="checkbox" data-extra-choice="${x.id}" ${(all||selected.has(String(x.id)))?'checked':''} ${all?'disabled':''}> ${esc(x.name)} (+${money(x.price)})</label>`).join('')||'<span class="muted">أضف إضافات أولًا</span>'}</div></div>`;
}
function bindModifierPicker(root,allowSelector,boxSelector,prefix){
 const allow=root.querySelector(allowSelector),box=root.querySelector(boxSelector),all=box?.querySelector(`#${prefix}AllExtras`);if(!allow||!box)return;
 const syncAllow=()=>box.classList.toggle('hidden',!allow.checked);allow.addEventListener('change',syncAllow);syncAllow();
 if(all){all.addEventListener('change',()=>{const checks=[...box.querySelectorAll('[data-extra-choice]')];if(all.checked){checks.forEach(c=>{c.checked=true;c.disabled=true})}else checks.forEach(c=>c.disabled=false)})}
}
function collectModifierChoices(root,boxSelector){return [...root.querySelectorAll(`${boxSelector} [data-extra-choice]:checked`)].map(x=>Number(x.dataset.extraChoice)).filter(Number.isFinite)}

async function renderProducts(){
 state.products=await rest('products','select=*&order=id'); state.branchProducts=await rest('branch_products','select=*'); state.modifiers=await rest('modifiers','select=*&order=id'); state.productModifiers=await rest('product_modifiers','select=*'); state.productVariants=await rest('product_variants','select=*&order=sort_order,id');
 $('#page').innerHTML=`<div class="panel"><h2>التصنيفات</h2><div class="toolbar"><input id="newCategory" placeholder="اسم التصنيف"><button id="addCategory" class="primary">إضافة تصنيف</button></div><div class="chips">${sortedActiveCategories().map((c,i,a)=>`<span class="chip sort-chip"><b>${esc(c.name)}</b> <button class="secondary sort-arrow" data-cat-up="${c.id}" ${i===0?'disabled':''} title="تحريك لأعلى">↑</button> <button class="secondary sort-arrow" data-cat-down="${c.id}" ${i===a.length-1?'disabled':''} title="تحريك لأسفل">↓</button> <button class="secondary" data-edit-cat="${c.id}">✏️</button> <button class="danger" data-delete-cat="${c.id}">🗑️ حذف</button></span>`).join('')}</div></div>
 <div class="panel"><h2>إضافة صنف</h2><div class="form-grid"><label>الاسم<input id="pName"></label><label>القسم<select id="pCat">${sortedActiveCategories().map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label><label>سعر البيع الأساسي<input id="pPrice" type="number"></label><label>التكلفة<input id="pCost" type="number"></label><label>باركود<input id="pBarcode"></label><label>مكونات يمكن حذفها<input id="pRemovals" placeholder="بصل، مخلل، صوص"></label></div>
 <div class="toggle-row"><label><input id="pHasVariants" type="checkbox"> للصنف اختيارات / أحجام</label><label><input id="pExtras" type="checkbox" checked> يسمح بإضافات</label><label><input id="pRemove" type="checkbox" checked> يسمح بحذف مكونات</label><label><input id="pNotes" type="checkbox" checked> يسمح بملاحظة</label></div>
 <div id="pExtrasBox"><h3>الإضافات المتاحة لهذا الصنف</h3><p class="muted">اختر كل الإضافات أو حدد الإضافات التي تريد ظهورها مع الصنف.</p>${modifierPickerHTML('p',[],true)}</div>
 <div id="pVariantsBox" class="variant-builder hidden"><div class="variant-builder-head"><div><h3>اختيارات الصنف</h3><p class="muted">أضف أي اختيارات تريدها: سينجل، دبل، تريبل أو أي اسم آخر.</p></div><button type="button" id="addNewVariant" class="secondary">+ إضافة اختيار</button></div>${variantBuilderHTML()}</div>
 <button id="addProduct" class="primary">إضافة الصنف</button></div>
 <div class="panel"><h2>الإضافات (Extras)</h2><div class="form-grid"><label>اسم الإضافة<input id="mName" placeholder="Extra Cheese"></label><label>السعر<input id="mPrice" type="number" value="0"></label></div><button id="addModifier" class="primary">إضافة</button><div class="chips">${state.modifiers.map(m=>`<span class="chip">${esc(m.name)} • ${money(m.price)}</span>`).join('')||'لا توجد إضافات'}</div></div>
 <div class="panel"><div class="section-head"><h2>الأصناف</h2></div><div class="table-wrap"><table><thead><tr><th>ترتيب</th><th>الصورة</th><th>الصنف</th><th>السعر</th><th>الاختيارات / الأحجام</th><th>الإضافات المتاحة</th><th>إجراء</th></tr></thead><tbody>${sortedActiveCategories().flatMap(c=>sortedActiveProducts(c.id)).map((p,idx,all)=>{const same=all.filter(x=>String(x.category_id)===String(p.category_id));const pos=same.findIndex(x=>String(x.id)===String(p.id));return `<tr><td class="sort-cell"><button class="secondary sort-arrow" data-product-up="${p.id}" ${pos===0?'disabled':''}>↑</button><button class="secondary sort-arrow" data-product-down="${p.id}" ${pos===same.length-1?'disabled':''}>↓</button></td><td>${p.image_url?`<img class="admin-product-img" src="${esc(p.image_url)}">`:'🍔'}</td><td>${esc(p.name)}</td><td>${money(p.price)}</td><td>${productVariantList(p).map(x=>`${esc(x.name)} ${money(x.price)}`).join('، ')||'-'}</td><td>${productModifierList(p).map(x=>esc(x.name)).join('، ')||'-'}</td><td><button class="secondary" data-image-product="${p.id}">🖼️ صورة</button> <button class="secondary" data-edit-product="${p.id}">✏️ تعديل</button> <button class="secondary" data-config="${p.id}">خيارات</button> <button class="danger" data-delete-product="${p.id}">🗑️ حذف</button></td></tr>`}).join('')}</tbody></table></div></div>`;
 bindVariantBuilder($('#page'),'#pHasVariants','#pVariantsBox','#addNewVariant');
 bindModifierPicker($('#page'),'#pExtras','#pExtrasBox','p');
 $('#addProduct').onclick=async()=>{
  if(!$('#pName').value.trim())return toast('اكتب اسم الصنف');
  const removable=$('#pRemovals').value.split(/[،,]/).map(x=>x.trim()).filter(Boolean);
  let variants=[];try{if($('#pHasVariants').checked){variants=collectVariantRows($('#page'),'#pVariantsBox');if(!variants.length)return toast('أضف اختيار واحد على الأقل')}}catch(err){return toast(err.message)}
  let basePrice=Number($('#pPrice').value||0);if(variants.length)basePrice=variants[0].price;const cost=Number($('#pCost').value||0),categoryId=Number($('#pCat').value);if(!Number.isFinite(basePrice)||basePrice<0)return toast('سعر البيع غير صحيح');if(!Number.isFinite(cost)||cost<0)return toast('التكلفة غير صحيحة');if(!Number.isFinite(categoryId)||!sortedActiveCategories().some(c=>Number(c.id)===categoryId))return toast('اختار تصنيف صحيح');
  const body={name:$('#pName').value.trim(),category_id:categoryId,price:basePrice,cost,barcode:$('#pBarcode').value||null,active:true,website_visible:true,website_sort_order:(sortedActiveProducts(Number($('#pCat').value)).length+1)*10,allow_extras:$('#pExtras').checked,allow_removals:$('#pRemove').checked,allow_item_notes:$('#pNotes').checked,removable_components:removable};
  try{
   const created=await rest('products','select=*',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([body])});const pid=created?.[0]?.id;if(!pid)throw new Error('تعذر الحصول على رقم الصنف');
   if(variants.length)await rest('product_variants','',{method:'POST',body:JSON.stringify(variants.map(v=>({product_id:pid,name:v.name,price:v.price,sort_order:v.sort_order,active:true})))});
   if($('#pExtras').checked){const modifierIds=collectModifierChoices($('#page'),'#pExtrasBox');if(modifierIds.length)await rest('product_modifiers','',{method:'POST',body:JSON.stringify(modifierIds.map(id=>({product_id:pid,modifier_id:id})))})}
   // إتاحة الصنف تلقائيًا في كل الفروع الحالية، مع تجاهل أي تكرار قائم
   for(const b of state.branches){try{await rest('branch_products','',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify([{branch_id:b.id,product_id:pid,active:true}])})}catch(e){}}
   toast('تمت إضافة الصنف');renderProducts();
  }catch(err){toast(err.message||'تعذر إضافة الصنف')}
 };
 $('#addModifier').onclick=async()=>{const name=$('#mName').value.trim(),price=Number($('#mPrice').value||0);if(!name)return toast('اكتب اسم الإضافة');if(!Number.isFinite(price)||price<0)return toast('سعر الإضافة غير صحيح');await rest('modifiers','',{method:'POST',body:JSON.stringify([{name,price,active:true}])});toast('تمت إضافة الإضافة');renderProducts()};
 $('#addCategory').onclick=async()=>{const name=$('#newCategory').value.trim();if(!name)return toast('اكتب اسم التصنيف');await rest('categories','',{method:'POST',body:JSON.stringify([{name,active:true,website_visible:true,sort_order:(sortedActiveCategories().length+1)*10,website_sort_order:(sortedActiveCategories().length+1)*10}])});toast('تمت إضافة التصنيف');await reloadCatalog();renderProducts()};
 $('#page').onclick=async e=>{const cu=e.target.closest('[data-cat-up]');if(cu)return moveCategoryOrder(cu.dataset.catUp,-1);const cd=e.target.closest('[data-cat-down]');if(cd)return moveCategoryOrder(cd.dataset.catDown,1);const pu=e.target.closest('[data-product-up]');if(pu)return moveProductOrder(pu.dataset.productUp,-1);const pd=e.target.closest('[data-product-down]');if(pd)return moveProductOrder(pd.dataset.productDown,1);const ip=e.target.closest('[data-image-product]');if(ip){const p=state.products.find(x=>String(x.id)===ip.dataset.imageProduct);if(p)return openProductImage(p)}const cfg=e.target.closest('[data-config]');if(cfg)return openProductConfig(state.products.find(p=>String(p.id)===String(cfg.dataset.config)));const ep=e.target.closest('[data-edit-product]');if(ep){const p=state.products.find(x=>String(x.id)===ep.dataset.editProduct);if(p)return openEditProductModal(p)}const tp=e.target.closest('[data-delete-product]');if(tp){const p=state.products.find(x=>String(x.id)===tp.dataset.deleteProduct);if(!p)return;if(!await uiConfirm(`حذف الصنف ${p.name}؟\nسيختفي من الكاشير والإدارة مع الاحتفاظ به داخل الفواتير القديمة.`))return;await rest('products',`id=eq.${p.id}`,{method:'PATCH',body:JSON.stringify({active:false,website_visible:false})});toast('تم حذف الصنف');return renderProducts()}const ec=e.target.closest('[data-edit-cat]');if(ec){const c=state.categories.find(x=>String(x.id)===ec.dataset.editCat);const name=await uiPrompt('اسم التصنيف',c.name);if(name===null||!name.trim())return toast('اكتب اسم التصنيف');await rest('categories',`id=eq.${c.id}`,{method:'PATCH',body:JSON.stringify({name:name.trim()})});await reloadCatalog();return renderProducts()}const tc=e.target.closest('[data-delete-cat]');if(tc){const c=state.categories.find(x=>String(x.id)===tc.dataset.deleteCat);if(!c)return;const linked=state.products.filter(p=>p.active!==false&&String(p.category_id)===String(c.id));const extra=linked.length?`\nوسيتم حذف ${linked.length} صنف تابع له من القوائم الحالية.`:'';if(!await uiConfirm(`حذف التصنيف ${c.name}؟${extra}\nالفواتير القديمة ستظل محفوظة.`))return;if(linked.length)await rest('products',`category_id=eq.${c.id}`,{method:'PATCH',body:JSON.stringify({active:false,website_visible:false})});await rest('categories',`id=eq.${c.id}`,{method:'PATCH',body:JSON.stringify({active:false,website_visible:false})});await reloadCatalog();toast('تم حذف التصنيف');return renderProducts()}};
}



async function renderWebsiteManagement(){
 const canAvailability=hasFeaturePermission('branchProductAvailability');
 const canBranchSettings=hasFeaturePermission('websiteBranchSettings');
 const canPayments=isAdmin()||hasFeaturePermission('financialSettings')||hasFeaturePermission('websiteAppearance');
 const canAppearance=isAdmin()||hasFeaturePermission('websiteAppearance');
 $('#page').innerHTML=`<div class="panel"><div class="section-head"><div><h2>🌐 إدارة الموقع</h2><p class="muted">التحكم في تشغيل الموقع والدفع والتصميم والقائمة الجانبية من مكان واحد.</p></div></div><div class="home-grid">${canAvailability?`<button class="home-card tone-green" data-site-tool="availability"><span class="home-icon">🍔</span><span class="home-copy"><b>توافر أصناف الموقع</b><small>تشغيل وإيقاف الأصناف لكل فرع</small></span><span class="home-arrow">‹</span></button>`:''}${canBranchSettings?`<button class="home-card tone-amber" data-site-tool="branch-settings"><span class="home-icon">🔥</span><span class="home-copy"><b>استقبال الطلبات ومدة التجهيز</b><small>فتح أو إيقاف الطلبات وتحديد وقت التجهيز</small></span><span class="home-arrow">‹</span></button>`:''}${canPayments?`<button class="home-card tone-blue" data-site-tool="payments"><span class="home-icon">💳</span><span class="home-copy"><b>طرق الدفع على الموقع</b><small>تشغيل الوسائل وأرقام التحويل والإيصالات لكل فرع</small></span><span class="home-arrow">‹</span></button>`:''}${canAppearance?`<button class="home-card tone-rose" data-site-tool="appearance"><span class="home-icon">🎨</span><span class="home-copy"><b>تصميم وقائمة الموقع</b><small>الثيم والخلفية والقائمة والتواصل ومتابعة الطلب</small></span><span class="home-arrow">‹</span></button>`:''}</div></div>`;
 $('#page').onclick=e=>{if(e.target.closest('[data-site-tool="availability"]'))return showPage('branchProductAvailability');if(e.target.closest('[data-site-tool="branch-settings"]'))return showPage('websiteBranchSettings');if(e.target.closest('[data-site-tool="payments"]'))return showPage('websitePayments');if(e.target.closest('[data-site-tool="appearance"]'))return showPage('websiteAppearance')};
}

async function renderWebsitePayments(){
 if(!(isAdmin()||hasFeaturePermission('financialSettings')||hasFeaturePermission('websiteAppearance'))){toast('ليس لديك صلاحية إدارة طرق دفع الموقع');return showPage('websiteManagement')}
 state.paymentMethods=await rest('payment_methods','select=*&active=eq.true&order=sort_order,id').catch(()=>state.paymentMethods||[]);
 state.branchPaymentMethods=await rest('branch_payment_methods','select=*').catch(()=>state.branchPaymentMethods||[]);
 const branches=allowedBranches();
 let activeBranch=Number(currentBranchId()||branches[0]?.id||0);
 const draw=()=>{
   const list=state.paymentMethods.map(m=>{const r=state.branchPaymentMethods.find(x=>Number(x.branch_id)===activeBranch&&Number(x.payment_method_id)===Number(m.id))||{};return `<div class="site-pay-row"><div class="site-pay-head"><b>${esc(m.name)}</b><label class="setting-switch compact-switch"><span>على الموقع</span><input type="checkbox" data-webpay-enable="${m.id}" ${r.website_enabled?'checked':''}></label></div><div class="form-grid"><label>رقم / حساب التحويل<input data-webpay-account="${m.id}" value="${esc(r.payment_account||'')}" placeholder="مثال: 010xxxxxxxx"></label><label>تعليمات الدفع<input data-webpay-instructions="${m.id}" value="${esc(r.payment_instructions||'')}" placeholder="مثال: حوّل المبلغ على الرقم ده"></label></div><div class="site-pay-options"><label><input type="checkbox" data-webpay-ref="${m.id}" ${r.allow_reference!==false?'checked':''}> السماح برقم مرجع</label><label><input type="checkbox" data-webpay-receipt="${m.id}" ${r.allow_receipt_upload!==false?'checked':''}> السماح برفع إيصال</label></div></div>`}).join('');
   $('#page').innerHTML=`<div class="panel"><div class="section-head"><div><h2>💳 طرق الدفع على الموقع</h2><p class="muted">كل فرع مستقل. أي تغيير هنا يظهر على الموقع تلقائيًا.</p></div><select id="webPayBranch">${branches.map(b=>`<option value="${b.id}" ${Number(b.id)===activeBranch?'selected':''}>${esc(b.name)}</option>`).join('')}</select></div><div class="site-pay-list">${list||'<div class="empty">لا توجد طرق دفع</div>'}</div><div class="toolbar"><button id="saveWebsitePayments" class="primary">💾 حفظ طرق دفع الموقع</button></div></div>`;
   $('#webPayBranch').onchange=e=>{activeBranch=Number(e.target.value);draw()};
   $('#saveWebsitePayments').onclick=async()=>{try{for(const m of state.paymentMethods){const existing=state.branchPaymentMethods.find(x=>Number(x.branch_id)===activeBranch&&Number(x.payment_method_id)===Number(m.id));const row={branch_id:activeBranch,payment_method_id:Number(m.id),active:existing?.active!==false,is_default:existing?.is_default===true,website_enabled:$(`[data-webpay-enable="${m.id}"]`)?.checked===true,payment_account:$(`[data-webpay-account="${m.id}"]`)?.value.trim()||null,payment_instructions:$(`[data-webpay-instructions="${m.id}"]`)?.value.trim()||null,allow_reference:$(`[data-webpay-ref="${m.id}"]`)?.checked!==false,allow_receipt_upload:$(`[data-webpay-receipt="${m.id}"]`)?.checked!==false};await rest('branch_payment_methods','',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify([row])})}state.branchPaymentMethods=await rest('branch_payment_methods','select=*');toast('تم حفظ طرق الدفع على الموقع')}catch(e){toast(e.message)}};
 };
 draw();
}

async function renderWebsiteAppearance(){
 if(!(isAdmin()||hasFeaturePermission('websiteAppearance'))){toast('ليس لديك صلاحية تصميم الموقع');return showPage('websiteManagement')}
 let wr=[];try{wr=await rest('website_settings','select=*&id=eq.1&limit=1')}catch(e){throw new Error('شغّل SQL الخاص بـ V9.5.0 أولًا')}
 const w=wr?.[0]||{id:1,theme_name:'topburger',page_background:'#b51f2b',surface_color:'#ffffff',text_color:'#171717',card_radius:22,show_contact:true,show_locations:true,show_track_order:true,show_cancel_order:true,allow_customer_cancel:true,show_whatsapp:false,show_facebook:false,show_instagram:false,show_payment_reference:true,show_payment_receipt_upload:true,show_payment_status:true};
 $('#page').innerHTML=`<div class="panel"><div class="section-head"><div><h2>🎨 تصميم وقائمة الموقع</h2><p class="muted">التغييرات تظهر على الموقع مباشرة من غير تعديل ملفات.</p></div></div><h3>الثيم</h3><div class="theme-presets"><button type="button" data-theme="topburger">🔴 Top Burger</button><button type="button" data-theme="dark">🌑 Dark</button><button type="button" data-theme="light">☀️ Light</button><button type="button" data-theme="custom">🎨 Custom</button></div><div class="form-grid"><label>خلفية الموقع<input id="siteBg" type="color" value="${esc(w.page_background||'#b51f2b')}"></label><label>لون الكروت<input id="siteSurface" type="color" value="${esc(w.surface_color||'#ffffff')}"></label><label>لون النص<input id="siteText" type="color" value="${esc(w.text_color||'#171717')}"></label><label>استدارة الكروت<input id="siteRadius" type="number" min="0" max="40" value="${Number(w.card_radius||22)}"></label></div><h3>القائمة الجانبية</h3><div class="settings-list"><label class="setting-switch"><span>☎ اتصل بنا</span><input id="siteContact" type="checkbox" ${w.show_contact?'checked':''}></label><label class="setting-switch"><span>📍 العناوين واللوكيشن</span><input id="siteLocations" type="checkbox" ${w.show_locations?'checked':''}></label><label class="setting-switch"><span>🔎 متابعة الطلب</span><input id="siteTrack" type="checkbox" ${w.show_track_order?'checked':''}></label><label class="setting-switch"><span>❌ إلغاء الطلب</span><input id="siteCancel" type="checkbox" ${w.show_cancel_order?'checked':''}></label><label class="setting-switch"><span>السماح للعميل بالإلغاء قبل استلام الفرع</span><input id="siteCancelAllowed" type="checkbox" ${w.allow_customer_cancel?'checked':''}></label><label class="setting-switch"><span>🧾 رقم مرجع الدفع</span><input id="sitePaymentRef" type="checkbox" ${w.show_payment_reference?'checked':''}></label><label class="setting-switch"><span>📷 رفع إيصال الدفع</span><input id="sitePaymentReceipt" type="checkbox" ${w.show_payment_receipt_upload?'checked':''}></label><label class="setting-switch"><span>💰 إظهار حالة الدفع للعميل</span><input id="sitePaymentStatus" type="checkbox" ${w.show_payment_status?'checked':''}></label></div><h3>روابط التواصل</h3><div class="form-grid"><label>واتساب<input id="siteWhats" value="${esc(w.whatsapp_url||'')}" placeholder="https://wa.me/20..."></label><label>فيسبوك<input id="siteFacebook" value="${esc(w.facebook_url||'')}" placeholder="https://facebook.com/..."></label><label>إنستجرام<input id="siteInstagram" value="${esc(w.instagram_url||'')}" placeholder="https://instagram.com/..."></label></div><div class="settings-list"><label class="setting-switch"><span>إظهار واتساب</span><input id="siteWhatsOn" type="checkbox" ${w.show_whatsapp?'checked':''}></label><label class="setting-switch"><span>إظهار فيسبوك</span><input id="siteFacebookOn" type="checkbox" ${w.show_facebook?'checked':''}></label><label class="setting-switch"><span>إظهار إنستجرام</span><input id="siteInstagramOn" type="checkbox" ${w.show_instagram?'checked':''}></label></div><p class="muted">روابط خرائط الفروع تتعدل من ⚙️ إدارة الفروع → تعديل الفرع.</p><button id="saveWebsiteAppearance" class="primary">💾 حفظ تصميم وإعدادات الموقع</button></div>`;
 let theme=w.theme_name||'topburger';
 $$('#page [data-theme]').forEach(b=>b.onclick=()=>{theme=b.dataset.theme;if(theme==='topburger'){$('#siteBg').value='#b51f2b';$('#siteSurface').value='#ffffff';$('#siteText').value='#171717'}else if(theme==='dark'){$('#siteBg').value='#151515';$('#siteSurface').value='#242424';$('#siteText').value='#f5f5f5'}else if(theme==='light'){$('#siteBg').value='#f7f7f7';$('#siteSurface').value='#ffffff';$('#siteText').value='#171717'}toast(`تم اختيار ثيم ${b.textContent.trim()} — اضغط حفظ`) });
 $('#saveWebsiteAppearance').onclick=async()=>{try{const row={id:1,theme_name:theme,page_background:$('#siteBg').value,surface_color:$('#siteSurface').value,text_color:$('#siteText').value,card_radius:Number($('#siteRadius').value||22),show_contact:$('#siteContact').checked,show_locations:$('#siteLocations').checked,show_track_order:$('#siteTrack').checked,show_cancel_order:$('#siteCancel').checked,allow_customer_cancel:$('#siteCancelAllowed').checked,show_whatsapp:$('#siteWhatsOn').checked,whatsapp_url:$('#siteWhats').value.trim()||null,show_facebook:$('#siteFacebookOn').checked,facebook_url:$('#siteFacebook').value.trim()||null,show_instagram:$('#siteInstagramOn').checked,instagram_url:$('#siteInstagram').value.trim()||null,show_payment_reference:$('#sitePaymentRef').checked,show_payment_receipt_upload:$('#sitePaymentReceipt').checked,show_payment_status:$('#sitePaymentStatus').checked,updated_at:new Date().toISOString()};await rest('website_settings','',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify([row])});state.websiteSettings=row;toast('تم حفظ تصميم وقائمة الموقع')}catch(e){toast(e.message)}};
}

const WEBSITE_WEEK_DAYS=[
 {id:0,name:'الأحد'},{id:1,name:'الاثنين'},{id:2,name:'الثلاثاء'},{id:3,name:'الأربعاء'},{id:4,name:'الخميس'},{id:5,name:'الجمعة'},{id:6,name:'السبت'}
];
function hhmm(v,fallback){const x=String(v||fallback||'').slice(0,5);return /^\d{2}:\d{2}$/.test(x)?x:(fallback||'12:00')}
function timeMinutes(v){const [h,m]=hhmm(v,'00:00').split(':').map(Number);return h*60+m}
function scheduleClock(timeZone='Africa/Cairo'){
 try{
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const get=t=>parts.find(x=>x.type===t)?.value;const map={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  return {dow:map[get('weekday')]??new Date().getDay(),minutes:Number(get('hour')||0)*60+Number(get('minute')||0)};
 }catch{return {dow:new Date().getDay(),minutes:new Date().getHours()*60+new Date().getMinutes()}}
}
function branchScheduleOpen(row,hours=[]){
 if(!row?.schedule_enabled)return true;
 const now=scheduleClock(row.schedule_timezone||'Africa/Cairo'),today=hours.find(x=>Number(x.day_of_week)===now.dow),prev=hours.find(x=>Number(x.day_of_week)===(now.dow+6)%7);
 const inToday=()=>{if(!today?.enabled)return false;const a=timeMinutes(today.open_time),b=timeMinutes(today.close_time);if(a===b)return true;if(a<b)return now.minutes>=a&&now.minutes<b;return now.minutes>=a};
 if(inToday())return true;
 if(prev?.enabled){const a=timeMinutes(prev.open_time),b=timeMinutes(prev.close_time);if(a>b&&now.minutes<b)return true}
 return false;
}
function websiteBranchState(row,hours=[]){
 const until=row?.orders_paused_until?new Date(row.orders_paused_until):null;
 if(row?.orders_open===false)return {open:false,temp:false,label:'🔴 موقوف يدويًا'};
 if(until&&!Number.isNaN(until.getTime())&&until.getTime()>Date.now()){
   const t=until.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'});
   return {open:false,temp:true,label:`🟠 موقوف حتى ${t}`};
 }
 if(row?.schedule_enabled&&!branchScheduleOpen(row,hours))return {open:false,temp:false,schedule:true,label:'🔵 مغلق حسب المواعيد'};
 return {open:true,temp:false,label:row?.schedule_enabled?'🟢 مفتوح حسب المواعيد':'🟢 استقبال مفتوح'};
}
function chooseBranchOrderAction(branchName){return new Promise(resolve=>{
 const m=document.createElement('div');m.className='modal';
 m.innerHTML=`<div class="modal-card availability-modal"><h2>🔥 ${esc(branchName)}</h2><p class="muted">اختر حالة استقبال طلبات الموقع للفرع.</p><div class="availability-actions"><button class="primary" data-bo-action="on">🟢 فتح الآن</button><button class="secondary" data-bo-action="30">⏱️ إيقاف 30 دقيقة</button><button class="secondary" data-bo-action="60">⏱️ إيقاف ساعة</button><button class="secondary" data-bo-action="120">⏱️ إيقاف ساعتين</button><button class="secondary" data-bo-action="custom">🕒 لوقت محدد</button><button class="danger" data-bo-action="off">🔴 إيقاف يدوي</button></div><div class="modal-actions"><button class="secondary" data-close>إلغاء</button></div></div>`;
 document.body.appendChild(m);const finish=v=>{m.remove();resolve(v)};
 m.onclick=async e=>{if(e.target===m||e.target.closest('[data-close]'))return finish(null);const b=e.target.closest('[data-bo-action]');if(!b)return;const a=b.dataset.boAction;if(a==='custom'){const v=await uiPrompt('حدد وقت فتح الطلبات تلقائيًا','',{title:'إيقاف الطلبات لوقت محدد',type:'datetime-local',okText:'تأكيد',icon:'🕒'});if(!v)return;const d=new Date(v);if(Number.isNaN(d.getTime())||d.getTime()<=Date.now())return toast('اختار وقت بعد الوقت الحالي');return finish({type:'temp',until:d.toISOString()})}if(a==='on')return finish({type:'on'});if(a==='off')return finish({type:'off'});return finish({type:'temp',until:new Date(Date.now()+Number(a)*60000).toISOString()})};
 })}
function openWebsiteHoursModal(branch,row,hours){
 const current=new Map((hours||[]).map(x=>[Number(x.day_of_week),x]));
 const m=document.createElement('div');m.className='modal';
 const lines=WEBSITE_WEEK_DAYS.map(d=>{const h=current.get(d.id)||{enabled:true,open_time:'12:00',close_time:'03:00'};const allDay=hhmm(h.open_time)===hhmm(h.close_time);return `<div class="schedule-day-row" data-schedule-day="${d.id}"><label class="inline-check"><input type="checkbox" data-day-enabled ${h.enabled===false?'':'checked'}> ${d.name}</label><label class="inline-check"><input type="checkbox" data-day-24h ${allDay?'checked':''}> 24 ساعة</label><label>فتح <input type="time" data-day-open value="${hhmm(h.open_time,'12:00')}" ${allDay?'disabled':''}></label><label>قفل <input type="time" data-day-close value="${hhmm(h.close_time,'03:00')}" ${allDay?'disabled':''}></label></div>`}).join('');
 m.innerHTML=`<form class="modal-card website-hours-modal"><h2>🕒 مواعيد ${esc(branch.name)}</h2><p class="muted">اختار 24 ساعة لأي يوم، أو حدد وقت الفتح والقفل. لو وقت القفل أقل من وقت الفتح، النظام يعتبر القفل في اليوم التالي.</p><label class="setting-switch"><span>تفعيل الفتح والقفل التلقائي حسب المواعيد</span><input id="scheduleEnabled" type="checkbox" ${row?.schedule_enabled?'checked':''}></label><div class="schedule-days">${lines}</div><div class="modal-actions"><button type="button" class="secondary" data-close>إلغاء</button><button type="submit" class="primary">💾 حفظ المواعيد</button></div></form>`;
 document.body.appendChild(m);m.onclick=e=>{if(e.target===m||e.target.closest('[data-close]'))m.remove()};
 m.querySelectorAll('[data-day-24h]').forEach(cb=>cb.addEventListener('change',()=>{const el=cb.closest('[data-schedule-day]'),on=cb.checked,open=el.querySelector('[data-day-open]'),close=el.querySelector('[data-day-close]');open.disabled=on;close.disabled=on;if(on){const v=open.value||'00:00';open.value=v;close.value=v}}));
 m.querySelector('form').onsubmit=async e=>{e.preventDefault();const enabled=m.querySelector('#scheduleEnabled').checked;const rows=[...m.querySelectorAll('[data-schedule-day]')].map(el=>{const allDay=el.querySelector('[data-day-24h]').checked;let open=el.querySelector('[data-day-open]').value||'12:00',close=el.querySelector('[data-day-close]').value||'03:00';if(allDay)close=open;return {branch_id:Number(branch.id),day_of_week:Number(el.dataset.scheduleDay),enabled:el.querySelector('[data-day-enabled]').checked,open_time:open,close_time:close,updated_at:new Date().toISOString()}});try{await rest('branch_website_hours','',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify(rows)});await rest('branch_website_settings',`branch_id=eq.${Number(branch.id)}`,{method:'PATCH',body:JSON.stringify({schedule_enabled:enabled,schedule_timezone:'Africa/Cairo',updated_at:new Date().toISOString()})});m.remove();toast(enabled?'تم حفظ وتفعيل المواعيد التلقائية':'تم حفظ المواعيد بدون تفعيل التشغيل التلقائي');renderWebsiteBranchSettings()}catch(err){toast(err.message||'تعذر حفظ المواعيد')}};
}
async function renderWebsiteBranchSettings(){
 if(!hasFeaturePermission('websiteBranchSettings')){toast('ليس لديك صلاحية إدارة استقبال طلبات الموقع');return showPage('home')}
 let rows=[],hours=[];try{[rows,hours]=await Promise.all([rest('branch_website_settings','select=*'),rest('branch_website_hours','select=*&order=branch_id,day_of_week')])}catch(e){throw new Error('شغّل SQL الخاص بمواعيد الموقع أولًا')}
 const branches=allowedBranches();
 const cards=branches.map(b=>{const r=rows.find(x=>Number(x.branch_id)===Number(b.id))||{branch_id:b.id,orders_open:true,prep_min:30,prep_max:45,schedule_enabled:false,schedule_timezone:'Africa/Cairo'};const bh=hours.filter(x=>Number(x.branch_id)===Number(b.id));const st=websiteBranchState(r,bh);return `<div class="branch-web-card" data-branch-settings="${b.id}"><div class="branch-web-head"><div><h3>📍 ${esc(b.name)}</h3><span class="branch-web-status ${st.open?'is-open':st.temp?'is-temp':'is-closed'}">${st.label}</span><small>${r.schedule_enabled?'🕒 المواعيد التلقائية مفعلة':'🕒 المواعيد التلقائية غير مفعلة'}</small></div><div class="toolbar"><button class="secondary compact" data-order-state="${b.id}">تغيير الحالة</button><button class="secondary compact" data-hours="${b.id}">🕒 مواعيد الأسبوع</button></div></div><div class="prep-settings"><label>من <input type="number" min="5" max="240" step="5" data-prep-min="${b.id}" value="${Number(r.prep_min||30)}"> دقيقة</label><label>إلى <input type="number" min="5" max="240" step="5" data-prep-max="${b.id}" value="${Number(r.prep_max||45)}"> دقيقة</label><button class="primary compact" data-save-prep="${b.id}">💾 حفظ مدة التجهيز</button></div></div>`}).join('');
 $('#page').innerHTML=`<div class="panel branch-website-panel"><div class="section-head"><div><h2>🔥 استقبال طلبات الموقع ومدة التجهيز</h2><p class="muted">كل فرع مستقل. تقدر توقف يدويًا أو مؤقتًا، وكمان تحدد مواعيد أسبوعية تفتح وتقفل الموقع تلقائيًا.</p></div></div><div class="branch-web-list">${cards||'<div class="empty">لا توجد فروع متاحة</div>'}</div></div>`;
 $('#page').onclick=async e=>{const hb=e.target.closest('[data-hours]');if(hb){const branchId=Number(hb.dataset.hours);if(!allowedBranchIds().includes(branchId))return toast('ليس لديك صلاحية لهذا الفرع');const b=state.branches.find(x=>Number(x.id)===branchId),r=rows.find(x=>Number(x.branch_id)===branchId)||{branch_id:branchId,schedule_enabled:false};return openWebsiteHoursModal(b,r,hours.filter(x=>Number(x.branch_id)===branchId))}const sb=e.target.closest('[data-order-state]');if(sb){const branchId=Number(sb.dataset.orderState);if(!allowedBranchIds().includes(branchId))return toast('ليس لديك صلاحية لهذا الفرع');const b=state.branches.find(x=>Number(x.id)===branchId);const action=await chooseBranchOrderAction(b?.name||'الفرع');if(!action)return;let payload;if(action.type==='on')payload={orders_open:true,orders_paused_until:null,updated_at:new Date().toISOString()};else if(action.type==='off')payload={orders_open:false,orders_paused_until:null,updated_at:new Date().toISOString()};else payload={orders_open:true,orders_paused_until:action.until,updated_at:new Date().toISOString()};try{await rest('branch_website_settings','',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify([{branch_id:branchId,...payload}])});toast(action.type==='on'?'تم فتح استقبال الطلبات':action.type==='off'?'تم إيقاف الطلبات يدويًا':'تم إيقاف الطلبات مؤقتًا');return renderWebsiteBranchSettings()}catch(err){return toast(err.message||'تعذر تحديث حالة الفرع')}}const sp=e.target.closest('[data-save-prep]');if(sp){const branchId=Number(sp.dataset.savePrep);if(!allowedBranchIds().includes(branchId))return toast('ليس لديك صلاحية لهذا الفرع');const mn=Number($(`[data-prep-min="${branchId}"]`)?.value||0),mx=Number($(`[data-prep-max="${branchId}"]`)?.value||0);if(mn<5||mx<5||mn>240||mx>240||mx<mn)return toast('راجع مدة التجهيز: من 5 إلى 240 دقيقة، والنهاية أكبر من البداية');try{await rest('branch_website_settings','',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify([{branch_id:branchId,prep_min:mn,prep_max:mx,updated_at:new Date().toISOString()}])});toast('تم حفظ مدة التجهيز');return renderWebsiteBranchSettings()}catch(err){return toast(err.message||'تعذر حفظ مدة التجهيز')}}};
}

function availabilityState(bp){
 if(!bp)return {on:true,temp:false,label:'✅ متاح'};
 if(bp.active===false)return {on:false,temp:false,label:'❌ موقوف'};
 const until=bp.website_paused_until?new Date(bp.website_paused_until):null;
 if(until&&!Number.isNaN(until.getTime())&&until.getTime()>Date.now()){
   const t=until.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'});
   return {on:false,temp:true,label:`⏱️ حتى ${t}`};
 }
 return {on:true,temp:false,label:'✅ متاح'};
}
function chooseAvailabilityAction(productName,branchName,current){return new Promise(resolve=>{
 const m=document.createElement('div');m.className='modal';
 m.innerHTML=`<div class="modal-card availability-modal"><h2>🌐 ${esc(productName)}</h2><p class="muted">${esc(branchName)} — اختر حالة الصنف على الموقع</p><div class="availability-actions"><button class="primary" data-av-action="on">✅ تشغيل الآن</button><button class="secondary" data-av-action="30">⏱️ إيقاف 30 دقيقة</button><button class="secondary" data-av-action="60">⏱️ إيقاف ساعة</button><button class="secondary" data-av-action="120">⏱️ إيقاف ساعتين</button><button class="secondary" data-av-action="custom">🕒 لوقت محدد</button><button class="danger" data-av-action="off">⛔ إيقاف يدوي</button></div><div class="modal-actions"><button class="secondary" data-close>إلغاء</button></div></div>`;
 document.body.appendChild(m);
 const finish=v=>{m.remove();resolve(v)};
 m.onclick=async e=>{if(e.target===m||e.target.closest('[data-close]'))return finish(null);const b=e.target.closest('[data-av-action]');if(!b)return;const a=b.dataset.avAction;if(a==='custom'){const v=await uiPrompt('حدد وقت رجوع الصنف تلقائيًا','',{title:'إيقاف لوقت محدد',type:'datetime-local',okText:'تأكيد',icon:'🕒'});if(!v)return;const d=new Date(v);if(Number.isNaN(d.getTime())||d.getTime()<=Date.now())return toast('اختار وقت بعد الوقت الحالي');return finish({type:'temp',until:d.toISOString()})}if(a==='on')return finish({type:'on'});if(a==='off')return finish({type:'off'});const mins=Number(a);return finish({type:'temp',until:new Date(Date.now()+mins*60000).toISOString()})};
 })}

async function renderWebsiteAvailability(){
 if(!hasFeaturePermission('branchProductAvailability')){toast('ليس لديك صلاحية إدارة توافر أصناف الموقع');return showPage('home')}
 state.products=await rest('products','select=*&order=id');
 state.branchProducts=await rest('branch_products','select=*');
 const products=sortedActiveCategories().flatMap(c=>sortedActiveProducts(c.id));
 const branches=allowedBranches();
 const rows=products.map(p=>`<tr><td><b>${esc(p.name)}</b></td>${branches.map(b=>{const bp=(state.branchProducts||[]).find(x=>String(x.product_id)===String(p.id)&&String(x.branch_id)===String(b.id));const st=availabilityState(bp);return `<td><button class="availability-btn ${st.on?'primary':st.temp?'warning':'secondary'}" data-av-product="${p.id}" data-av-branch="${b.id}">${st.label}</button></td>`}).join('')}</tr>`).join('');
 $('#page').innerHTML=`<div class="panel website-availability-panel"><div class="section-head"><div><h2>🌐 توافر أصناف الموقع</h2><p class="muted">اضغط على حالة الصنف لتشغيله أو إيقافه مؤقتًا أو يدويًا. التأثير على الموقع فقط وفي الفرع المحدد.</p></div></div><div class="table-wrap website-availability-wrap"><table class="website-availability-table"><thead><tr><th>الصنف</th>${branches.map(b=>`<th>${esc(b.name)}</th>`).join('')}</tr></thead><tbody>${rows||'<tr><td colspan="99">لا توجد أصناف</td></tr>'}</tbody></table></div></div>`;
 $('#page').onclick=async e=>{const bt=e.target.closest('[data-av-product]');if(!bt)return;const productId=Number(bt.dataset.avProduct),branchId=Number(bt.dataset.avBranch);if(!allowedBranchIds().includes(branchId))return toast('ليس لديك صلاحية لهذا الفرع');const p=state.products.find(x=>Number(x.id)===productId);const b=state.branches.find(x=>Number(x.id)===branchId);const current=(state.branchProducts||[]).find(x=>Number(x.product_id)===productId&&Number(x.branch_id)===branchId);const action=await chooseAvailabilityAction(p?.name||'الصنف',b?.name||'الفرع',current);if(!action)return;bt.disabled=true;try{let payload;if(action.type==='on')payload={active:true,website_paused_until:null};else if(action.type==='off')payload={active:false,website_paused_until:null};else payload={active:true,website_paused_until:action.until};if(current){await rest('branch_products',`branch_id=eq.${branchId}&product_id=eq.${productId}`,{method:'PATCH',body:JSON.stringify(payload)})}else{await rest('branch_products','',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify([{branch_id:branchId,product_id:productId,...payload}])})}toast(action.type==='on'?'تم تشغيل الصنف':action.type==='off'?'تم إيقاف الصنف يدويًا':'تم إيقاف الصنف مؤقتًا');return renderWebsiteAvailability()}catch(err){toast(err.message||'تعذر تحديث التوافر')}finally{bt.disabled=false}};
}

async function uploadProductImage(product,file){
 if(!file)return; if(!/^image\//.test(file.type))return toast('اختر ملف صورة'); if(file.size>5*1024*1024)return toast('الصورة أكبر من 5MB');
 const ext=(file.name.split('.').pop()||'jpg').replace(/[^a-z0-9]/gi,'').toLowerCase();const path=`products/${product.id}-${Date.now()}.${ext}`;
 const r=await fetch(`${cfg.url}/storage/v1/object/product-images/${path}`,{method:'POST',headers:{apikey:cfg.key,Authorization:`Bearer ${session.access_token}`,'Content-Type':file.type,'x-upsert':'true'},body:file});
 if(!r.ok){let d={};try{d=await r.json()}catch{}throw new Error(d.message||d.error||`خطأ رفع الصورة ${r.status}`)}
 const url=`${cfg.url}/storage/v1/object/public/product-images/${path}`;await rest('products',`id=eq.${product.id}`,{method:'PATCH',body:JSON.stringify({image_url:url})});await reloadCatalog();toast('تم حفظ صورة الصنف');renderProducts();
}
function openProductImage(p){const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>🖼️ صورة ${esc(p.name)}</h2>${p.image_url?`<img class="product-image-preview" src="${esc(p.image_url)}">`:'<div class="product-image-preview product-placeholder">🍔</div>'}<label>اختر صورة من الموبايل<input id="productImageFile" type="file" accept="image/*"></label><div class="modal-actions">${p.image_url?'<button class="danger" data-remove-image>حذف الصورة</button>':''}<button class="secondary" data-close>إلغاء</button><button class="primary" data-upload-image>رفع الصورة</button></div></div>`;document.body.appendChild(m);m.onclick=async e=>{if(e.target===m||e.target.closest('[data-close]'))return m.remove();if(e.target.closest('[data-upload-image]')){const f=m.querySelector('#productImageFile').files[0];if(!f)return toast('اختر صورة أولاً');try{await uploadProductImage(p,f);m.remove()}catch(err){toast(err.message)}}if(e.target.closest('[data-remove-image]')){if(!await uiConfirm('حذف صورة الصنف؟'))return;await rest('products',`id=eq.${p.id}`,{method:'PATCH',body:JSON.stringify({image_url:null})});m.remove();await reloadCatalog();toast('تم حذف الصورة');renderProducts()}}}


function openEditProductModal(p){
 const variants=productVariantList(p).slice().sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)||Number(a.id)-Number(b.id));
 const currentModifierIds=state.productModifiers.filter(x=>String(x.product_id)===String(p.id)).map(x=>Number(x.modifier_id));
 const defaultAllExtras=p.allow_extras!==false&&currentModifierIds.length===0&&activeModifiers().length>0;
 const m=document.createElement('div');m.className='modal';
 m.innerHTML=`<div class="modal-card product-edit-modal"><h2>✏️ تعديل ${esc(p.name)}</h2>
  <div class="form-grid">
   <label>اسم الصنف<input id="editProductName" value="${esc(p.name)}"></label>
   <label>التصنيف<select id="editProductCat">${sortedActiveCategories().map(c=>`<option value="${c.id}" ${String(c.id)===String(p.category_id)?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>
   <label>التكلفة<input id="editProductCost" type="number" min="0" step="0.01" value="${Number(p.cost||0)}"></label>
   <label>سعر البيع الأساسي<input id="editProductPrice" type="number" min="0" step="0.01" value="${Number(p.price||0)}"></label>
   <label>مكونات يمكن حذفها<input id="editProductRemovals" value="${esc((p.removable_components||[]).join('، '))}" placeholder="بصل، مخلل، صوص"></label>
  </div>
  <div class="toggle-row"><label><input id="editHasVariants" type="checkbox" ${variants.length?'checked':''}> للصنف اختيارات / أحجام</label><label><input id="editExtras" type="checkbox" ${p.allow_extras!==false?'checked':''}> يسمح بإضافات</label><label><input id="editRemove" type="checkbox" ${p.allow_removals!==false?'checked':''}> يسمح بحذف مكونات</label><label><input id="editNotes" type="checkbox" ${p.allow_item_notes!==false?'checked':''}> يسمح بملاحظة</label></div>
  <div id="editExtrasBox"><h3>الإضافات المتاحة لهذا الصنف</h3><p class="muted">اختر كل الإضافات أو حدد إضافات معينة.</p>${modifierPickerHTML('edit',currentModifierIds,defaultAllExtras)}</div>
  <div id="editVariantsBox" class="variant-builder ${variants.length?'':'hidden'}"><div class="variant-builder-head"><div><h3>الاختيارات / الأحجام</h3><p class="muted">غيّر الاسم أو السعر، أضف اختيار جديد أو احذفه.</p></div><button type="button" id="editAddVariant" class="secondary">+ إضافة اختيار</button></div>${variantBuilderHTML(variants)}</div>
  <div class="modal-actions"><button class="secondary" data-close>إلغاء</button><button class="primary" data-save-product>حفظ التعديلات</button></div>
 </div>`;
 document.body.appendChild(m);bindVariantBuilder(m,'#editHasVariants','#editVariantsBox','#editAddVariant');bindModifierPicker(m,'#editExtras','#editExtrasBox','edit');
 const close=()=>m.remove();
 m.onclick=async e=>{
  if(e.target===m||e.target.closest('[data-close]'))return close();
  if(!e.target.closest('[data-save-product]'))return;
  const name=m.querySelector('#editProductName').value.trim();const cost=Number(m.querySelector('#editProductCost').value||0);const category_id=Number(m.querySelector('#editProductCat').value);if(!name)return toast('اكتب اسم الصنف');if(!Number.isFinite(cost)||cost<0)return toast('التكلفة غير صحيحة');
  const hasVariants=m.querySelector('#editHasVariants').checked;let desired=[];try{if(hasVariants){desired=collectVariantRows(m,'#editVariantsBox');if(!desired.length)return toast('أضف اختيار واحد على الأقل')}}catch(err){return toast(err.message)}
  let basePrice=Number(m.querySelector('#editProductPrice').value||0);if(!Number.isFinite(basePrice)||basePrice<0)return toast('سعر البيع غير صحيح');if(desired.length)basePrice=desired[0].price;
  const allow_extras=m.querySelector('#editExtras').checked,allow_removals=m.querySelector('#editRemove').checked,allow_item_notes=m.querySelector('#editNotes').checked;const removable_components=m.querySelector('#editProductRemovals').value.split(/[،,]/).map(x=>x.trim()).filter(Boolean);const modifierIds=allow_extras?collectModifierChoices(m,'#editExtrasBox'):[];
  const saveBtn=m.querySelector('[data-save-product]');saveBtn.disabled=true;saveBtn.textContent='جاري الحفظ...';
  try{
   await rest('products',`id=eq.${p.id}`,{method:'PATCH',body:JSON.stringify({name,category_id,price:basePrice,cost,allow_extras,allow_removals,allow_item_notes,removable_components})});
   const keepIds=new Set();
   if(hasVariants){
    for(const v of desired){
     if(v.id){await rest('product_variants',`id=eq.${v.id}&product_id=eq.${p.id}`,{method:'PATCH',body:JSON.stringify({name:v.name,price:v.price,sort_order:v.sort_order,active:true})});keepIds.add(Number(v.id));}
     else{const created=await rest('product_variants','select=id',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{product_id:p.id,name:v.name,price:v.price,sort_order:v.sort_order,active:true}])});if(created?.[0]?.id)keepIds.add(Number(created[0].id));}
    }
   }
   for(const old of variants){if(!keepIds.has(Number(old.id)))await rest('product_variants',`id=eq.${old.id}&product_id=eq.${p.id}`,{method:'DELETE'})}
   await rest('product_modifiers',`product_id=eq.${p.id}`,{method:'DELETE'});if(modifierIds.length)await rest('product_modifiers','',{method:'POST',body:JSON.stringify(modifierIds.map(id=>({product_id:p.id,modifier_id:id})))});
   await audit('edit_product','product',p.id,{name,category_id,price:basePrice,cost,variants:desired.map(v=>({name:v.name,price:v.price})),allow_extras,modifier_ids:modifierIds});
   close();toast('تم حفظ الصنف والاختيارات والإضافات');await renderProducts();
  }catch(err){saveBtn.disabled=false;saveBtn.textContent='حفظ التعديلات';toast(err.message||'تعذر حفظ التعديلات')}
 };
}

function openProductConfig(p){const selected=new Set(state.productModifiers.filter(x=>String(x.product_id)===String(p.id)).map(x=>String(x.modifier_id)));const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>خيارات ${esc(p.name)}</h2><div class="toggle-row"><label><input id="cfgExtras" type="checkbox" ${p.allow_extras!==false?'checked':''}> إضافات</label><label><input id="cfgRem" type="checkbox" ${p.allow_removals!==false?'checked':''}> حذف مكونات</label><label><input id="cfgNotes" type="checkbox" ${p.allow_item_notes!==false?'checked':''}> ملاحظات</label></div><label>مكونات قابلة للحذف<input id="cfgComponents" value="${(p.removable_components||[]).join('، ')}"></label><h3>الإضافات المسموحة</h3><div class="option-list">${state.modifiers.map(x=>`<label><input type="checkbox" data-pm="${x.id}" ${selected.has(String(x.id))?'checked':''}> ${x.name} (+${money(x.price)})</label>`).join('')||'أضف Extras أولًا'}</div><div class="modal-actions"><button class="secondary" data-close>إلغاء</button><button class="primary" data-save>حفظ</button></div></div>`;document.body.appendChild(m);m.onclick=async e=>{if(e.target.closest('[data-close]')||e.target===m)m.remove();if(e.target.closest('[data-save]')){const comps=m.querySelector('#cfgComponents').value.split(/[،,]/).map(x=>x.trim()).filter(Boolean);await rest('products',`id=eq.${p.id}`,{method:'PATCH',body:JSON.stringify({allow_extras:m.querySelector('#cfgExtras').checked,allow_removals:m.querySelector('#cfgRem').checked,allow_item_notes:m.querySelector('#cfgNotes').checked,removable_components:comps})});await rest('product_modifiers',`product_id=eq.${p.id}`,{method:'DELETE'});const ids=[...m.querySelectorAll('[data-pm]:checked')].map(x=>Number(x.dataset.pm));if(ids.length)await rest('product_modifiers','',{method:'POST',body:JSON.stringify(ids.map(id=>({product_id:p.id,modifier_id:id})))});m.remove();toast('تم حفظ خيارات الصنف');renderProducts()}}}

async function renderInventory(){if(!state.settings.enable_inventory){$('#page').innerHTML='<div class="empty">المخزون غير مفعّل من الإعدادات</div>';return;}const rows=await rest('ingredient_stock',`select=id,branch_id,quantity,ingredients(name,unit)&branch_id=eq.${currentBranchId()}&order=id`);$('#page').innerHTML=`<div class="panel"><h2>مخزون الخامات</h2><div class="table-wrap"><table><thead><tr><th>الخامة</th><th>الوحدة</th><th>الفرع</th><th>الرصيد</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.ingredients?.name||'')}</td><td>${esc(r.ingredients?.unit||'')}</td><td>${branchName(r.branch_id)}</td><td>${r.quantity}</td></tr>`).join('')}</tbody></table></div></div>`}

function downloadCSV(name,rows){const csv='\ufeff'+rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
async function renderReports(){
  const today=localDateInput();
  const branchId=currentBranchId();
  const reportPaymentMethods=branchPaymentList(branchId);
  $('#page').innerHTML=`
    <div class="panel report-filters"><h2>📊 تقارير ${esc(branchName(branchId))}</h2><p>كل الأرقام المعروضة تخص الفرع الحالي فقط.</p><div class="toolbar">
      <label>من<input id="repFrom" type="date" value="${today}"></label><label>إلى<input id="repTo" type="date" value="${today}"></label>
      <label>نوع الطلب<select id="repType"><option value="all">كل الأنواع</option><option value="takeaway">تيك أواي</option><option value="pickup">استلام من الفرع</option><option value="delivery">دليفري</option><option value="dinein">صالة</option></select></label>
      <label>الدفع<select id="repPay"><option value="all">كل طرق الدفع</option>${reportPaymentMethods.map(method=>`<option value="${esc(method.code)}">${esc(method.name)}</option>`).join('')}</select></label>
      <label>الموظف<select id="repEmployee"><option value="all">كل الموظفين</option></select></label><label>رقم الوردية<select id="repShift"><option value="all">كل الورديات</option></select></label>
      <button id="runReport" class="primary">عرض التقرير</button><button id="printReport" class="secondary">🖨️ طباعة التقرير</button><button id="exportReport" class="secondary">تصدير CSV</button>
    </div></div><div id="reportBody"><div class="empty">اختار الفترة والفلاتر واضغط «عرض التقرير»</div></div>`;

  let employees=[];
  let lastExport=[];
  let lastShifts=[];
  let lastReportPrintHTML='';
  try{
    employees=(await rest('employees',`select=id,name,branch_id,role&branch_id=eq.${branchId}&order=name`))||[];
    const employeeSelect=$('#repEmployee');
    if(employeeSelect)employeeSelect.innerHTML='<option value="all">كل الموظفين</option>'+employees.map(employee=>`<option value="${employee.id}">${esc(employee.name)}</option>`).join('');
  }catch(error){console.warn('report employees',error)}

  const safeFetch=async(table,query)=>{try{return (await fetchAll(table,query))||[]}catch(error){console.warn('report '+table,error);return []}};
  const fetchByIds=async(table,select,key,ids)=>{
    const clean=[...new Set((ids||[]).filter(value=>value!==null&&value!==undefined&&value!==''))];
    const output=[];
    for(let index=0;index<clean.length;index+=100){
      const part=clean.slice(index,index+100).join(',');
      if(part)output.push(...await safeFetch(table,`${select}&${key}=in.(${part})`));
    }
    return output;
  };
  const isCollected=order=>{
    if(String(order.source||'').toLowerCase()!=='website')return true;
    if(String(order.payment_status||'').toLowerCase()==='confirmed')return true;
    return String(order.payment_method||'').toLowerCase()==='cash'&&['delivered','completed'].includes(String(order.status||'').toLowerCase());
  };
  const employeeLabel=id=>employeeName(id,employees)||'موظف';

  const runReport=async()=>{
    const body=$('#reportBody');
    if(!body)return;
    body.innerHTML='<div class="empty">جاري حساب التقرير...</div>';
    await new Promise(resolve=>setTimeout(resolve,20));
    try{
      const from=$('#repFrom')?.value||today;
      const to=$('#repTo')?.value||today;
      if(from>to)throw new Error('تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية');
      const period=rangeISO(from,to);

      const results=await Promise.all([
        safeFetch('orders',`select=*&branch_id=eq.${branchId}&created_at=gte.${encodeURIComponent(period.from)}&created_at=lte.${encodeURIComponent(period.to)}&order=created_at.desc`),
        safeFetch('expenses',`select=*&branch_id=eq.${branchId}&created_at=gte.${encodeURIComponent(period.from)}&created_at=lte.${encodeURIComponent(period.to)}&order=created_at.desc`),
        safeFetch('shifts',`select=*&branch_id=eq.${branchId}&opened_at=lte.${encodeURIComponent(period.to)}&order=opened_at.desc`),
        safeFetch('returns',`select=*&branch_id=eq.${branchId}&created_at=gte.${encodeURIComponent(period.from)}&created_at=lte.${encodeURIComponent(period.to)}&order=created_at.desc`),
        safeFetch('delivery_zones',`select=id,name,branch_id&branch_id=eq.${branchId}`),
        safeFetch('delivery_drivers',`select=id,name,branch_id&branch_id=eq.${branchId}`),
        safeFetch('website_orders',`select=id,branch_id,status,order_type,total,subtotal,delivery_fee,promo_discount,payment_method_code,payment_status,created_at,accepted_at&branch_id=eq.${branchId}&created_at=gte.${encodeURIComponent(period.from)}&created_at=lte.${encodeURIComponent(period.to)}&order=created_at.desc`)
      ]);
      const orders=results[0],expenses=results[1],shifts=results[2],allReturns=results[3],zones=results[4],drivers=results[5],websiteOrders=results[6];

      lastShifts=(shifts||[]).filter(shift=>new Date(shift.opened_at)<=new Date(period.to)&&(shift.closed_at?new Date(shift.closed_at)>=new Date(period.from):true));
      const shiftSelect=$('#repShift');
      if(shiftSelect){
        const selectedShift=shiftSelect.value;
        shiftSelect.innerHTML='<option value="all">كل الورديات</option>'+lastShifts.map(shift=>`<option value="${shift.id}">#${shift.id} — ${fmtDate(shift.opened_at)}</option>`).join('');
        if([...shiftSelect.options].some(option=>option.value===selectedShift))shiftSelect.value=selectedShift;
      }

      const typeFilter=$('#repType')?.value||'all';
      const paymentFilter=String($('#repPay')?.value||'all').toLowerCase();
      const employeeFilter=$('#repEmployee')?.value||'all';
      const shiftFilter=$('#repShift')?.value||'all';

      let filteredOrders=(orders||[]).filter(order=>(typeFilter==='all'||String(order.order_type)===typeFilter)&&(employeeFilter==='all'||String(order.employee_id)===employeeFilter)&&(shiftFilter==='all'||String(order.shift_id)===shiftFilter));
      let orderPayments=await fetchByIds('order_payments','select=order_id,method,amount','order_id',filteredOrders.map(order=>order.id));
      if(paymentFilter!=='all'){
        const methodsByOrder=new Map();
        for(const payment of orderPayments){
          const key=String(payment.order_id);
          if(!methodsByOrder.has(key))methodsByOrder.set(key,new Set());
          methodsByOrder.get(key).add(String(payment.method||'').toLowerCase());
        }
        filteredOrders=filteredOrders.filter(order=>methodsByOrder.get(String(order.id))?.has(paymentFilter)||(!methodsByOrder.has(String(order.id))&&String(order.payment_method||'').toLowerCase()===paymentFilter));
      }

      const operationalOrders=filteredOrders.filter(order=>String(order.status||'').toLowerCase()!=='cancelled');
      const cancelledOrders=filteredOrders.filter(order=>String(order.status||'').toLowerCase()==='cancelled');
      const collectedOrders=operationalOrders.filter(isCollected);
      const uncollectedOrders=operationalOrders.filter(order=>!isCollected(order));
      const collectedOrderIds=new Set(collectedOrders.map(order=>String(order.id)));

      const filteredExpenses=(expenses||[]).filter(expense=>(employeeFilter==='all'||String(expense.employee_id)===employeeFilter)&&(shiftFilter==='all'||String(expense.shift_id)===shiftFilter));
      let returns=(allReturns||[]).filter(returnRow=>(employeeFilter==='all'||String(returnRow.employee_id)===employeeFilter)&&(shiftFilter==='all'||String(returnRow.shift_id)===shiftFilter));
      const allReturnPayments=await fetchByIds('return_payments','select=return_id,method,amount','return_id',returns.map(returnRow=>returnRow.id));
      if(paymentFilter!=='all'){
        const allowedReturnIds=new Set(allReturnPayments.filter(payment=>String(payment.method||'').toLowerCase()===paymentFilter).map(payment=>String(payment.return_id)));
        returns=returns.filter(returnRow=>allowedReturnIds.has(String(returnRow.id)));
      }
      const returnIdSet=new Set(returns.map(returnRow=>String(returnRow.id)));
      const returnPayments=allReturnPayments.filter(payment=>returnIdSet.has(String(payment.return_id)));
      const returnItems=await fetchByIds('return_items','select=return_id,product_name,quantity,total','return_id',returns.map(returnRow=>returnRow.id));

      const grossSales=collectedOrders.reduce((sum,order)=>sum+Number(order.total||0),0);
      const returnTotal=returns.reduce((sum,returnRow)=>sum+Number(returnRow.total||0),0);
      const netSales=grossSales-returnTotal;
      const expenseTotal=filteredExpenses.reduce((sum,expense)=>sum+Number(expense.amount||0),0);
      const averageOrder=collectedOrders.length?grossSales/collectedOrders.length:0;
      const totalDiscounts=collectedOrders.reduce((sum,order)=>sum+Number(order.discount||0),0);
      const promoDiscounts=collectedOrders.reduce((sum,order)=>sum+Number(order.promo_discount||0),0);
      const manualDiscounts=Math.max(0,totalDiscounts-promoDiscounts);
      const deliveryFees=collectedOrders.reduce((sum,order)=>sum+Number(order.delivery_fee||0),0);

      const paymentTotals={};
      for(const method of reportPaymentMethods)paymentTotals[String(method.code).toLowerCase()]=0;
      const ordersWithDetailedPayments=new Set();
      for(const payment of orderPayments){
        if(!collectedOrderIds.has(String(payment.order_id)))continue;
        const method=String(payment.method||'').toLowerCase();
        paymentTotals[method]=(paymentTotals[method]||0)+Number(payment.amount||0);
        ordersWithDetailedPayments.add(String(payment.order_id));
      }
      for(const order of collectedOrders){
        if(ordersWithDetailedPayments.has(String(order.id)))continue;
        const method=String(order.payment_method||'').toLowerCase();
        if(method&&method!=='mixed')paymentTotals[method]=(paymentTotals[method]||0)+Number(order.total||0);
      }
      for(const payment of returnPayments){
        const method=String(payment.method||'').toLowerCase();
        paymentTotals[method]=(paymentTotals[method]||0)-Number(payment.amount||0);
      }

      const orderItems=await fetchByIds('order_items','select=order_id,product_id,product_name,quantity,total','order_id',collectedOrders.map(order=>order.id));
      const productStats={};
      for(const item of orderItems){
        const name=item.product_name||'صنف';
        if(!productStats[name])productStats[name]={name,qty:0,total:0};
        productStats[name].qty+=Number(item.quantity||0);
        productStats[name].total+=Number(item.total||0);
      }
      for(const item of returnItems){
        const name=item.product_name||'صنف';
        if(!productStats[name])productStats[name]={name,qty:0,total:0};
        productStats[name].qty-=Number(item.quantity||0);
        productStats[name].total-=Number(item.total||0);
      }
      const products=Object.values(productStats).filter(item=>Math.abs(item.qty)>0.0001||Math.abs(item.total)>0.005).sort((left,right)=>right.qty-left.qty);

      const channelStats={};
      for(const order of collectedOrders){
        const key=String(order.order_type||'unknown');
        if(!channelStats[key])channelStats[key]={count:0,total:0};
        channelStats[key].count++;
        channelStats[key].total+=Number(order.total||0);
      }

      const hourlyStats=Array.from({length:24},(_,hour)=>({hour,count:0,total:0}));
      for(const order of collectedOrders){
        const hour=new Date(order.created_at).getHours();
        if(hourlyStats[hour]){hourlyStats[hour].count++;hourlyStats[hour].total+=Number(order.total||0)}
      }
      const busyHours=hourlyStats.filter(row=>row.count).sort((left,right)=>right.count-left.count);

      const zoneNames=Object.fromEntries((zones||[]).map(zone=>[String(zone.id),zone.name]));
      const driverNames=Object.fromEntries((drivers||[]).map(driver=>[String(driver.id),driver.name]));
      const deliveryStats={};
      const driverStats={};
      for(const order of collectedOrders.filter(order=>order.order_type==='delivery')){
        const zoneName=order.delivery_area||zoneNames[String(order.delivery_zone_id)]||'غير محدد';
        if(!deliveryStats[zoneName])deliveryStats[zoneName]={name:zoneName,count:0,sales:0,fees:0};
        deliveryStats[zoneName].count++;
        deliveryStats[zoneName].sales+=Number(order.total||0);
        deliveryStats[zoneName].fees+=Number(order.delivery_fee||0);
        if(order.driver_id){
          const key=String(order.driver_id),name=driverNames[key]||driverName(order.driver_id)||'مندوب';
          if(!driverStats[key])driverStats[key]={name,count:0,total:0};
          driverStats[key].count++;
          driverStats[key].total+=Number(order.total||0);
        }
      }

      const promoStats={};
      for(const order of collectedOrders.filter(order=>order.promo_code)){
        const code=String(order.promo_code);
        if(!promoStats[code])promoStats[code]={code,count:0,discount:0,sales:0};
        promoStats[code].count++;
        promoStats[code].discount+=Number(order.promo_discount||0);
        promoStats[code].sales+=Number(order.total||0);
      }
      const returnReasons={};
      for(const returnRow of returns){
        const reason=returnRow.reason||'غير محدد';
        if(!returnReasons[reason])returnReasons[reason]={reason,count:0,total:0};
        returnReasons[reason].count++;
        returnReasons[reason].total+=Number(returnRow.total||0);
      }

      const employeeStats={};
      for(const employee of employees)employeeStats[String(employee.id)]={name:employee.name,count:0,sales:0,discounts:0,returns:0,expenses:0};
      for(const order of collectedOrders){
        const key=String(order.employee_id||'');
        if(!employeeStats[key])employeeStats[key]={name:employeeLabel(order.employee_id),count:0,sales:0,discounts:0,returns:0,expenses:0};
        employeeStats[key].count++;
        employeeStats[key].sales+=Number(order.total||0);
        employeeStats[key].discounts+=Number(order.discount||0);
      }
      for(const returnRow of returns){const key=String(returnRow.employee_id||'');if(!employeeStats[key])employeeStats[key]={name:employeeLabel(returnRow.employee_id),count:0,sales:0,discounts:0,returns:0,expenses:0};employeeStats[key].returns+=Number(returnRow.total||0)}
      for(const expense of filteredExpenses){const key=String(expense.employee_id||'');if(!employeeStats[key])employeeStats[key]={name:employeeLabel(expense.employee_id),count:0,sales:0,discounts:0,returns:0,expenses:0};employeeStats[key].expenses+=Number(expense.amount||0)}
      const visibleEmployeeStats=Object.values(employeeStats).filter(row=>row.count||row.sales||row.returns||row.expenses||row.discounts);

      const websiteStatusStats={};
      for(const websiteOrder of websiteOrders){
        const status=String(websiteOrder.status||'pending');
        if(!websiteStatusStats[status])websiteStatusStats[status]={status,count:0,total:0};
        websiteStatusStats[status].count++;
        websiteStatusStats[status].total+=Number(websiteOrder.total||0);
      }
      const websitePickup=(websiteOrders||[]).filter(row=>row.order_type==='pickup');
      const websiteDelivery=(websiteOrders||[]).filter(row=>row.order_type==='delivery');

      const shiftRows=lastShifts.filter(shift=>(employeeFilter==='all'||String(shift.employee_id)===employeeFilter)&&(shiftFilter==='all'||String(shift.id)===shiftFilter));
      const shiftDisplay=new Map();
      await Promise.all(shiftRows.map(async shift=>{if(shift.closed_at){shiftDisplay.set(String(shift.id),{sales:Number(shift.sales_total||0),expenses:Number(shift.expenses_total||0)});return}try{const metrics=await shiftMetrics(shift);shiftDisplay.set(String(shift.id),{sales:Number(metrics.sales||0),expenses:Number(metrics.exp||0)})}catch(e){console.warn('live shift metrics',e);shiftDisplay.set(String(shift.id),{sales:Number(shift.sales_total||0),expenses:Number(shift.expenses_total||0)})}}));
      const paymentCards=reportPaymentMethods.map(method=>`<div class="card kpi"><small>${esc(method.name)}</small><strong>${money(paymentTotals[String(method.code).toLowerCase()]||0)}</strong></div>`).join('');

      body.innerHTML=`<div class="grid report-kpis"><div class="card kpi"><small>إجمالي المبيعات المحصلة</small><strong>${money(grossSales)}</strong></div><div class="card kpi"><small>المرتجعات</small><strong>${money(returnTotal)}</strong></div><div class="card kpi"><small>صافي المبيعات</small><strong>${money(netSales)}</strong></div><div class="card kpi"><small>المصروفات</small><strong>${money(expenseTotal)}</strong></div><div class="card kpi"><small>نتيجة بعد المصروفات</small><strong>${money(netSales-expenseTotal)}</strong></div><div class="card kpi"><small>الأوردرات المحصلة</small><strong>${collectedOrders.length}</strong></div><div class="card kpi"><small>متوسط الفاتورة</small><strong>${money(averageOrder)}</strong></div>${paymentCards}<div class="card kpi"><small>الخصومات</small><strong>${money(totalDiscounts)}</strong></div><div class="card kpi"><small>رسوم الدليفري</small><strong>${money(deliveryFees)}</strong></div><div class="card kpi"><small>طلبات موقع غير محصلة داخل POS</small><strong>${uncollectedOrders.length}</strong></div><div class="card kpi"><small>أوردرات POS ملغية</small><strong>${cancelledOrders.length}</strong></div></div>
      <div class="panel"><h2>🧾 قنوات البيع</h2><div class="table-wrap"><table><thead><tr><th>القناة</th><th>الأوردرات</th><th>المبيعات</th><th>متوسط الأوردر</th></tr></thead><tbody>${Object.entries(channelStats).map(([key,row])=>`<tr><td>${esc(orderTypeLabel(key))}</td><td>${row.count}</td><td>${money(row.total)}</td><td>${money(row.count?row.total/row.count:0)}</td></tr>`).join('')||'<tr><td colspan="4">لا توجد بيانات</td></tr>'}</tbody></table></div></div>
      <div class="panel"><h2>🌐 طلبات الموقع</h2><div class="report-summary-list"><div>إجمالي طلبات الموقع <b>${websiteOrders.length}</b></div><div>استلام فرع <b>${websitePickup.length}</b></div><div>دليفري <b>${websiteDelivery.length}</b></div></div><div class="table-wrap"><table><thead><tr><th>الحالة</th><th>العدد</th><th>القيمة</th></tr></thead><tbody>${Object.values(websiteStatusStats).map(row=>`<tr><td>${esc(statusLabel(row.status))}</td><td>${row.count}</td><td>${money(row.total)}</td></tr>`).join('')||'<tr><td colspan="3">لا توجد طلبات موقع</td></tr>'}</tbody></table></div></div>
      <div class="panel"><h2>🍔 الأصناف بعد المرتجعات</h2><div class="table-wrap"><table><thead><tr><th>الصنف</th><th>الكمية</th><th>صافي المبيعات</th></tr></thead><tbody>${products.slice(0,100).map(row=>`<tr><td>${esc(row.name)}</td><td>${row.qty}</td><td>${money(row.total)}</td></tr>`).join('')||'<tr><td colspan="3">لا توجد بيانات</td></tr>'}</tbody></table></div></div>
      <div class="panel"><h2>⏰ ساعات الذروة</h2><div class="table-wrap"><table><thead><tr><th>الساعة</th><th>الأوردرات</th><th>المبيعات</th></tr></thead><tbody>${busyHours.map(row=>`<tr><td>${String(row.hour).padStart(2,'0')}:00 - ${String((row.hour+1)%24).padStart(2,'0')}:00</td><td>${row.count}</td><td>${money(row.total)}</td></tr>`).join('')||'<tr><td colspan="3">لا توجد بيانات</td></tr>'}</tbody></table></div></div>
      <div class="panel"><h2>🛵 الدليفري</h2><div class="table-wrap"><table><thead><tr><th>المنطقة</th><th>الأوردرات</th><th>المبيعات</th><th>رسوم التوصيل</th></tr></thead><tbody>${Object.values(deliveryStats).sort((left,right)=>right.count-left.count).map(row=>`<tr><td>${esc(row.name)}</td><td>${row.count}</td><td>${money(row.sales)}</td><td>${money(row.fees)}</td></tr>`).join('')||'<tr><td colspan="4">لا توجد طلبات دليفري</td></tr>'}</tbody></table></div>${Object.values(driverStats).length?`<h3>المناديب</h3><div class="table-wrap"><table><thead><tr><th>المندوب</th><th>الأوردرات</th><th>قيمة الطلبات</th></tr></thead><tbody>${Object.values(driverStats).sort((left,right)=>right.count-left.count).map(row=>`<tr><td>${esc(row.name)}</td><td>${row.count}</td><td>${money(row.total)}</td></tr>`).join('')}</tbody></table></div>`:''}</div>
      <div class="panel"><h2>🎟️ الخصومات والبرومو</h2><div class="report-summary-list"><div>خصم يدوي <b>${money(manualDiscounts)}</b></div><div>خصم برومو <b>${money(promoDiscounts)}</b></div><div>إجمالي الخصومات <b>${money(totalDiscounts)}</b></div></div><div class="table-wrap"><table><thead><tr><th>الكود</th><th>الاستخدام</th><th>الخصم</th><th>مبيعات الطلبات</th></tr></thead><tbody>${Object.values(promoStats).map(row=>`<tr><td>${esc(row.code)}</td><td>${row.count}</td><td>${money(row.discount)}</td><td>${money(row.sales)}</td></tr>`).join('')||'<tr><td colspan="4">لا توجد استخدامات برومو</td></tr>'}</tbody></table></div></div>
      <div class="panel"><h2>↩️ المرتجعات</h2><div class="table-wrap"><table><thead><tr><th>السبب</th><th>العدد</th><th>القيمة</th></tr></thead><tbody>${Object.values(returnReasons).map(row=>`<tr><td>${esc(row.reason)}</td><td>${row.count}</td><td>${money(row.total)}</td></tr>`).join('')||'<tr><td colspan="3">لا توجد مرتجعات</td></tr>'}</tbody></table></div></div>
      <div class="panel"><h2>👤 الموظفين</h2><div class="table-wrap"><table><thead><tr><th>الموظف</th><th>الأوردرات</th><th>المبيعات</th><th>متوسط الفاتورة</th><th>الخصومات</th><th>المرتجعات</th><th>المصروفات</th></tr></thead><tbody>${visibleEmployeeStats.map(row=>`<tr><td>${esc(row.name)}</td><td>${row.count}</td><td>${money(row.sales)}</td><td>${money(row.count?row.sales/row.count:0)}</td><td>${money(row.discounts)}</td><td>${money(row.returns)}</td><td>${money(row.expenses)}</td></tr>`).join('')||'<tr><td colspan="7">لا توجد بيانات</td></tr>'}</tbody></table></div></div>
      <div class="panel"><h2>💸 المصروفات</h2><div class="report-summary-list"><div>عدد المصروفات <b>${filteredExpenses.length}</b></div><div>إجمالي المصروفات <b>${money(expenseTotal)}</b></div></div><div class="table-wrap"><table><thead><tr><th>البيان</th><th>الموظف</th><th>القيمة</th><th>التاريخ</th></tr></thead><tbody>${filteredExpenses.slice(0,100).map(expense=>`<tr><td>${esc(expense.description||expense.title||'مصروف')}</td><td>${esc(employeeLabel(expense.employee_id))}</td><td>${money(expense.amount)}</td><td>${fmtDate(expense.created_at)}</td></tr>`).join('')||'<tr><td colspan="4">لا توجد مصروفات</td></tr>'}</tbody></table></div></div>
      <div class="panel"><h2>🕒 الورديات بالأرقام</h2><div class="table-wrap"><table><thead><tr><th>#</th><th>الموظف</th><th>الفتح</th><th>القفل</th><th>المبيعات</th><th>المصروفات</th><th>العجز/الزيادة</th><th></th></tr></thead><tbody>${shiftRows.map(shift=>`<tr><td><b>#${shift.id}</b></td><td>${esc(employeeLabel(shift.employee_id))}</td><td>${fmtDate(shift.opened_at)}</td><td>${shift.closed_at?fmtDate(shift.closed_at):'مفتوحة الآن'}</td><td>${money((shiftDisplay.get(String(shift.id))||{}).sales||0)}</td><td>${money((shiftDisplay.get(String(shift.id))||{}).expenses||0)}</td><td>${shift.closed_at?money(shift.cash_difference||0):'-'}</td><td><button class="secondary" data-report-shift="${shift.id}">تقرير الوردية</button></td></tr>`).join('')||'<tr><td colspan="8">لا توجد ورديات</td></tr>'}</tbody></table></div></div>`;

      lastReportPrintHTML=`<div class="shift-print"><h2>تقرير ${esc(branchName(branchId))}</h2><p style="text-align:center">${esc(from)} إلى ${esc(to)}</p>${body.innerHTML}</div>`;

      lastExport=[['الفرع',branchName(branchId)],['الفترة',from+' إلى '+to],['إجمالي المبيعات المحصلة',grossSales],['المرتجعات',returnTotal],['صافي المبيعات',netSales],['المصروفات',expenseTotal],['نتيجة بعد المصروفات',netSales-expenseTotal],['عدد الأوردرات المحصلة',collectedOrders.length],['طلبات موقع غير محصلة داخل POS',uncollectedOrders.length],['الخصومات',totalDiscounts],['رسوم الدليفري',deliveryFees],[],['الصنف','الكمية','صافي المبيعات'],...products.map(row=>[row.name,row.qty,row.total])];
    }catch(error){
      console.error('report error',error);
      body.innerHTML=`<div class="panel"><h2>تعذر تحميل التقرير</h2><p>${esc(error?.message||String(error)||'خطأ غير معروف')}</p><button id="retryReport" class="primary">إعادة المحاولة</button></div>`;
      $('#retryReport')?.addEventListener('click',runReport);
    }
  };

  $('#runReport').onclick=runReport;
  $('#printReport').onclick=()=>{if(!lastReportPrintHTML)return toast('اعرض التقرير الأول');const c=printCfg(branchId);printIsolated(lastReportPrintHTML,c.paper_size,1,{deviceName:selectedDesktopPrinter(branchId,'customer')})};
  $('#exportReport').onclick=()=>{if(!lastExport.length)return toast('اعرض التقرير الأول');downloadCSV(`report-${branchId}-${$('#repFrom').value}-${$('#repTo').value}.csv`,lastExport)};
  $('#reportBody').onclick=event=>{const button=event.target.closest('[data-report-shift]');if(!button)return;const shift=lastShifts.find(row=>String(row.id)===String(button.dataset.reportShift));if(shift)openShiftReport(shift,employees)};
}


const BACKUP_GROUPS={
 orders:{label:'الطلبات وحركات البيع والمرتجعات',tables:['returns','return_items','return_payments','orders','order_items','order_payments','order_item_modifiers','promo_redemptions']},
 shifts:{label:'الورديات',tables:['shifts']},
 expenses:{label:'المصروفات',tables:['expenses']},
 customers:{label:'العملاء والعناوين',tables:['customers','customer_addresses']},
 delivery:{label:'الدليفري والمندوبين والمناطق',tables:['delivery_zones','delivery_drivers','driver_settlements']},
 catalog:{label:'الأصناف والتصنيفات والإضافات',tables:['categories','products','product_variants','modifiers','branch_products','product_modifiers']},
 promos:{label:'البرومو كود وقواعده',tables:['promo_codes','promo_code_branches','promo_code_categories','promo_code_products']},
 permissions:{label:'صلاحيات المستخدمين والفروع',tables:['employee_permissions','employee_branches']},
 settings:{label:'إعدادات البرنامج والموقع وهوية النشاط',tables:['app_settings','business_settings','website_settings','branch_website_settings','branch_print_settings','payment_methods','branch_payment_methods','branch_financial_settings']},
 audit:{label:'سجل العمليات (Audit Log)',tables:['audit_logs']}
};
const BACKUP_RESTORE_ORDER=[
 'categories','products','product_variants','modifiers','branch_products','product_modifiers',
 'promo_codes','promo_code_branches','promo_code_categories','promo_code_products',
 'customers','customer_addresses','shifts',
 'orders','order_items','order_payments','order_item_modifiers',
 'returns','return_items','return_payments','promo_redemptions',
 'expenses','delivery_zones','delivery_drivers','driver_settlements',
 'employee_branches','employee_permissions',
 'app_settings','business_settings','website_settings','branch_website_settings','branch_print_settings',
 'payment_methods','branch_payment_methods','branch_financial_settings','audit_logs'
];
function selectedBackupGroups(root){return [...root.querySelectorAll('[data-backup-group]:checked')].map(x=>x.dataset.backupGroup)}
async function buildBackupData(groups){
 const data={format:'topburger-pos-backup',version:'10.4.9',created_at:new Date().toISOString(),groups:{}};
 const errors=[];
 for(const g of groups){
  data.groups[g]={};
  for(const t of BACKUP_GROUPS[g].tables){
   try{data.groups[g][t]=await fetchAll(t,'select=*')}
   catch(e){errors.push(`${t}: ${e?.message||e}`)}
  }
 }
 if(errors.length)throw new Error('تعذر إنشاء Backup كامل:\n'+errors.join('\n'));
 return data
}
async function exportBackup(groups){
 const data=await buildBackupData(groups),json=JSON.stringify(data,null,2);
 if(window.topBurgerDesktop?.backup?.saveJson){const p=await window.topBurgerDesktop.backup.saveJson(json,'manual-full');toast('تم حفظ النسخة على الكمبيوتر');return p}
 const blob=new Blob([json],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`top-burger-backup-v10.4.9-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)
}
async function createDesktopFullBackup(reason='auto-full'){if(!window.topBurgerDesktop?.backup?.saveJson||!navigator.onLine||!session?.access_token)return null;await refreshSessionIfNeeded();const data=await buildBackupData(Object.keys(BACKUP_GROUPS));const p=await window.topBurgerDesktop.backup.saveJson(JSON.stringify(data,null,2),reason);await odbSet('lastFullBackupAt',new Date().toISOString());return p}
async function maybeDesktopDailyBackup(){if(!window.topBurgerDesktop?.isDesktop||!navigator.onLine)return;const last=await odbGet('lastFullBackupAt');if(last&&Date.now()-new Date(last).getTime()<24*60*60*1000)return;try{await createDesktopFullBackup('daily-full')}catch(e){console.warn('daily full backup',e)}}
async function resetGroups(groups){return req('/rest/v1/rpc/reset_pos_data',{method:'POST',body:JSON.stringify({p_groups:groups})})}
async function restoreBackup(file,groups){
 const text=await file.text();let b;
 try{b=JSON.parse(text)}catch{throw new Error('ملف النسخة غير صالح')}
 if(b?.format!=='topburger-pos-backup')throw new Error('هذا ليس ملف Backup للبرنامج');
 const wanted=new Set(groups.flatMap(g=>BACKUP_GROUPS[g]?.tables||[]));
 for(const t of BACKUP_RESTORE_ORDER){
  if(!wanted.has(t))continue;
  let rows=null;
  for(const g of Object.values(b.groups||{})){if(g&&Array.isArray(g[t])){rows=g[t];break}}
  if(!rows?.length)continue;
  const r=await fetch(`${cfg.url}/rest/v1/${t}`,{method:'POST',headers:{...headers(),'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows)});
  if(!r.ok){let d={};try{d=await r.json()}catch{}throw new Error(`${t}: ${d.message||r.status}`)}
 }
 await reloadCatalog();
}
function businessSettingsPayload(logoOverride){
 const currentLogo=(logoOverride!==undefined?logoOverride:($('#bizLogoUrl')?.value||state.business?.logo_url||''));
 return {p_business_name:$('#bizName').value.trim(),p_tagline:$('#bizTagline').value.trim()||null,p_phone:$('#bizPhone')?.value.trim()||null,p_address:$('#bizAddress')?.value.trim()||null,p_logo_url:currentLogo||null,p_currency_symbol:$('#bizCurrency').value.trim()||'ج.م',p_receipt_footer:$('#bizFooter').value.trim()||'شكرًا لزيارتكم',p_primary_color:$('#bizPrimary').value,p_accent_color:$('#bizAccent').value};
}
async function refreshBusinessSettings(){const rows=await rest('business_settings','select=*&id=eq.1&limit=1');if(rows?.[0])state.business={...state.business,...rows[0]};applyBusinessBranding();}
async function uploadBusinessLogo(file){
 if(!file)throw new Error('اختر صورة اللوجو أولاً');
 if(!file.type?.startsWith('image/'))throw new Error('الملف لازم يكون صورة');
 if(file.size>5*1024*1024)throw new Error('حجم اللوجو لازم يكون أقل من 5 ميجا');
 const ext=(file.name.split('.').pop()||'png').replace(/[^a-zA-Z0-9]/g,'').toLowerCase()||'png';
 const path=`branding/logo-${Date.now()}.${ext}`;
 const r=await fetch(`${cfg.url}/storage/v1/object/business-assets/${path}`,{method:'POST',headers:{apikey:cfg.key,Authorization:`Bearer ${session.access_token}`,'Content-Type':file.type,'x-upsert':'true'},body:file});
 if(!r.ok){let d={};try{d=await r.json()}catch{}throw new Error(d.message||d.error||'تعذر رفع اللوجو');}
 const url=`${cfg.url}/storage/v1/object/public/business-assets/${path}`;
 await rpc('update_business_settings',businessSettingsPayload(url));await refreshBusinessSettings();toast('تم رفع اللوجو وربطه بالـPOS والموقع والفواتير');renderSettings();
}
async function renderSettings(){
 const returnClosed=state.settings.returns_allow_closed_shifts===true||String(state.settings.returns_allow_closed_shifts)==='true';

 const canBusiness=isAdmin()||hasFeaturePermission('businessSettings');
 const canSystem=isAdmin()||hasFeaturePermission('settings');
 const canPrinting=isAdmin()||hasFeaturePermission('printingSettings');
 const canFinancial=isAdmin()||hasFeaturePermission('financialSettings');
 if(!canBusiness&&!canSystem&&!canPrinting&&!canFinancial){ $('#page').innerHTML='<div class="empty">ليس لديك صلاحية لفتح الإعدادات</div>'; return; }
 const b=state.business||{};
 const businessPanel=canBusiness?`<div class="panel business-settings-panel"><h2>🎨 هوية وإعدادات النشاط</h2><p>البيانات دي تظهر تلقائيًا في الـPOS والموقع والفواتير.</p><div class="form-grid business-settings-grid">
 <label>اسم النشاط<input id="bizName" value="${esc(b.business_name||'')}"></label>
 <label>الشعار النصي / الجملة<input id="bizTagline" value="${esc(b.tagline||'')}"></label>
 <label>رقم الهاتف<input id="bizPhone" value="${esc(b.phone||'')}"></label>
 <label>العنوان<input id="bizAddress" value="${esc(b.address||'')}"></label>
 <label>رمز العملة<input id="bizCurrency" value="${esc(b.currency_symbol||'ج.م')}"></label>
 <label>نص أسفل الفاتورة<input id="bizFooter" value="${esc(b.receipt_footer||'')}"></label>
 <div class="wide business-logo-control"><b>لوجو النشاط</b>${b.logo_url?`<img class="business-logo-preview" src="${esc(b.logo_url)}" alt="لوجو النشاط">`:'<div class="business-logo-empty">لا يوجد لوجو مرفوع</div>'}<input id="bizLogoUrl" type="hidden" value="${esc(b.logo_url||'')}"><label class="file-action">📷 اختر صورة اللوجو<input id="bizLogoFile" type="file" accept="image/*"></label><div class="toolbar"><button id="uploadBusinessLogo" class="secondary" type="button">⬆️ رفع اللوجو</button>${b.logo_url?'<button id="removeBusinessLogo" class="danger" type="button">🗑️ حذف اللوجو</button>':''}</div><small>الصورة تُرفع مباشرة وتظهر تلقائيًا في البرنامج والفاتورة والموقع.</small></div>
 <label>اللون الأساسي<input id="bizPrimary" type="color" value="${esc(b.primary_color||'#b51f2b')}"></label>
 <label>اللون المساعد<input id="bizAccent" type="color" value="${esc(b.accent_color||'#f0643d')}"></label>
 </div><button id="saveBusinessSettings" class="primary">حفظ هوية النشاط</button></div>`:'';
 let systemPanel='',backupPanel='',printingPanel='',financialPanel='';
 if(canPrinting){const pc=printCfg(currentBranchId()),localAutoCustomer=localAutoPrint(currentBranchId(),'customer',pc.auto_print_customer),localAutoPrep=localAutoPrint(currentBranchId(),'prep',pc.auto_print_prep);printingPanel=`<div class="panel"><h2>🖨️ إعدادات الطباعة — ${esc(branchName(currentBranchId()))}</h2><p>الإعدادات دي خاصة بالفرع الحالي، وبيانات الهاتف والعنوان بتتسحب من بيانات الفرع.</p><div class="form-grid"><label>مقاس الورق<select id="prPaper"><option value="80" ${pc.paper_size==='80'?'selected':''}>80 مم</option><option value="58" ${pc.paper_size==='58'?'selected':''}>58 مم</option></select></label><label>عدد نسخ فاتورة العميل<input id="prCustomerCopies" type="number" min="1" max="5" value="${Number(pc.customer_copies||1)}"></label><label>عدد نسخ التحضير<input id="prPrepCopies" type="number" min="1" max="5" value="${Number(pc.prep_copies||1)}"></label>${window.topBurgerDesktop?.print?`<label>طابعة فاتورة العميل<select id="prCustomerPrinter"><option value="">الطابعة الافتراضية</option></select></label><label>طابعة ريسيت التحضير<select id="prPrepPrinter"><option value="">الطابعة الافتراضية</option></select></label>`:''}<label>نص أعلى الفاتورة<input id="prHeader" value="${esc(pc.receipt_header||'')}"></label><label class="wide">نص أسفل الفاتورة لهذا الفرع<input id="prFooter" value="${esc(pc.receipt_footer||'')}" placeholder="لو فاضي يستخدم النص العام للنشاط"></label></div><div class="settings-list">${[['prLogo','إظهار اللوجو',pc.show_logo],['prName','إظهار اسم النشاط',pc.show_business_name],['prPhone','إظهار هاتف الفرع',pc.show_branch_phone],['prAddress','إظهار عنوان الفرع',pc.show_branch_address]].map(([id,l,v])=>`<label class="setting-switch"><span>${l}</span><input id="${id}" type="checkbox" ${v?'checked':''}></label>`).join('')}${window.topBurgerDesktop?.isDesktop?[['prAutoCustomer','طباعة فاتورة العميل تلقائيًا على هذا الكمبيوتر',localAutoCustomer],['prAutoPrep','طباعة ريسيت التحضير تلقائيًا على هذا الكمبيوتر',localAutoPrep]].map(([id,l,v])=>`<label class="setting-switch"><span>${l}</span><input id="${id}" type="checkbox" ${v?'checked':''}></label>`).join(''):''}</div><button id="savePrintSettings" class="primary">حفظ إعدادات طباعة الفرع</button></div>`;}
 if(canFinancial){const fc=financialCfg(currentBranchId()),pays=state.paymentMethods.map(m=>{const r=state.branchPaymentMethods.find(x=>Number(x.branch_id)===currentBranchId()&&Number(x.payment_method_id)===Number(m.id));return `<div class="setting-switch"><span><b>${esc(m.name)}</b><small>${esc(m.code)}</small></span><span><label>متاح <input type="checkbox" data-pay-active="${m.id}" ${r?.active!==false?'checked':''}></label> <label>افتراضي <input type="radio" name="payDefault" data-pay-default="${m.id}" ${r?.is_default?'checked':''}></label></span></div>`}).join('');financialPanel=`<div class="panel"><h2>💳 الدفع والخصم والضريبة — ${esc(branchName(currentBranchId()))}</h2><p>الإعدادات دي خاصة بالفرع الحالي.</p><div class="form-grid"><label>نظام الخصم<select id="finDiscountMode"><option value="both" ${fc.discount_mode==='both'?'selected':''}>مبلغ أو نسبة</option><option value="amount" ${fc.discount_mode==='amount'?'selected':''}>مبلغ فقط</option><option value="percent" ${fc.discount_mode==='percent'?'selected':''}>نسبة فقط</option></select></label><label>أقصى خصم %<input id="finMaxDiscount" type="number" min="0" max="100" step="0.1" value="${Number(fc.max_discount_percent||100)}"></label><label>نسبة الضريبة %<input id="finTaxRate" type="number" min="0" max="100" step="0.1" value="${Number(fc.tax_rate||0)}"></label><label>نسبة الخدمة %<input id="finServiceRate" type="number" min="0" max="100" step="0.1" value="${Number(fc.service_rate||0)}"></label></div><div class="settings-list"><label class="setting-switch"><span>تفعيل الخصم</span><input id="finDiscountEnabled" type="checkbox" ${fc.discount_enabled?'checked':''}></label><label class="setting-switch"><span>تفعيل الضريبة</span><input id="finTaxEnabled" type="checkbox" ${fc.tax_enabled?'checked':''}></label><label class="setting-switch"><span>الأسعار شاملة الضريبة</span><input id="finTaxIncluded" type="checkbox" ${fc.prices_include_tax?'checked':''}></label><label class="setting-switch"><span>تفعيل الخدمة</span><input id="finServiceEnabled" type="checkbox" ${fc.service_enabled?'checked':''}></label></div><h3>طرق الدفع</h3><div class="settings-list">${pays}</div><div class="toolbar"><button id="addPaymentMethod" class="secondary">➕ إضافة طريقة دفع</button><button id="saveFinancialSettings" class="primary">💾 حفظ إعدادات الفرع</button></div></div>`;}
 if(canSystem){
   const groups=Object.entries(BACKUP_GROUPS).map(([k,v])=>`<label class="backup-check"><input type="checkbox" data-backup-group="${k}"> ${v.label}</label>`).join('');
   systemPanel=`<div class="panel"><h2>تشغيل وإيقاف المميزات</h2><p>الإعدادات دي بتتزامن على كل الأجهزة.</p><div class="settings-list">${[['enable_extras','الإضافات Extras'],['enable_removals','حذف مكونات'],['enable_item_notes','ملاحظات على الصنف'],['enable_kitchen','شاشة المطبخ'],['enable_prep_receipt','ريسيت التحضير'],['enable_receipt_print','فاتورة العميل'],['enable_inventory','المخزون'],['enable_delivery','الدليفري'],['enable_customer_search','بحث العملاء بالهاتف'],['enable_delivery_drivers','مناديب التوصيل'],['enable_mixed_payment','الدفع المختلط']].map(([k,l])=>`<label class="setting-switch"><span>${l}</span><input type="checkbox" data-setting="${k}" ${state.settings[k]?'checked':''}></label>`).join('')}</div><button id="saveSettings" class="primary">حفظ الإعدادات</button></div>`;
   backupPanel=`<div class="panel backup-panel"><h2>💾 النسخ الاحتياطي والاستعادة</h2><p>حدد البيانات المطلوبة. النسخة لا تحتوي كلمات مرور حسابات الدخول.</p><div class="backup-grid">${groups}</div><div class="toolbar"><button id="backupAll" class="secondary">تحديد الكل</button><button id="backupNone" class="secondary">إلغاء التحديد</button><button id="createBackup" class="primary">⬇️ إنشاء Backup</button></div><div class="toolbar"><label class="file-btn secondary">اختر ملف<input id="restoreFile" type="file" accept="application/json,.json"></label><button id="restoreBackup" class="secondary">♻️ استعادة المحدد</button><button id="resetSelected" class="danger">🗑️ إعادة ضبط المحدد</button></div><small>إعادة الضبط لا تحذف حساب المدير من Authentication. استخدمها بحذر وبعد إنشاء Backup.</small></div>`;
 }
 $('#page').innerHTML=businessPanel+printingPanel+financialPanel+systemPanel+backupPanel;
 if(canPrinting&&window.topBurgerDesktop?.print?.list&&$('#prCustomerPrinter')){try{const printers=await window.topBurgerDesktop.print.list();const opts=(printers||[]).map(p=>`<option value="${esc(p.name)}">${esc(p.displayName||p.name)}${p.isDefault?' — الافتراضية':''}</option>`).join('');$('#prCustomerPrinter').insertAdjacentHTML('beforeend',opts);$('#prPrepPrinter').insertAdjacentHTML('beforeend',opts);$('#prCustomerPrinter').value=selectedDesktopPrinter(currentBranchId(),'customer');$('#prPrepPrinter').value=selectedDesktopPrinter(currentBranchId(),'prep')}catch(e){toast('تعذر تحميل قائمة الطابعات')}}
 if($('#saveBusinessSettings'))$('#saveBusinessSettings').onclick=async()=>{try{await rpc('update_business_settings',businessSettingsPayload());await refreshBusinessSettings();toast('تم حفظ هوية النشاط وربطها بالنظام والموقع')}catch(e){toast(e.message)}};
 if($('#uploadBusinessLogo'))$('#uploadBusinessLogo').onclick=async()=>{try{await uploadBusinessLogo($('#bizLogoFile')?.files?.[0])}catch(e){toast(e.message)}};
 if($('#removeBusinessLogo'))$('#removeBusinessLogo').onclick=async()=>{if(!await uiConfirm('حذف اللوجو من هوية النشاط؟'))return;try{await rpc('update_business_settings',businessSettingsPayload(null));await refreshBusinessSettings();toast('تم حذف اللوجو');renderSettings()}catch(e){toast(e.message)}};
 if($('#savePrintSettings'))$('#savePrintSettings').onclick=async()=>{try{if(window.topBurgerDesktop?.print){try{localStorage.setItem(desktopPrinterKey(currentBranchId(),'customer'),$('#prCustomerPrinter')?.value||'');localStorage.setItem(desktopPrinterKey(currentBranchId(),'prep'),$('#prPrepPrinter')?.value||'');setLocalAutoPrint(currentBranchId(),'customer',$('#prAutoCustomer')?.checked);setLocalAutoPrint(currentBranchId(),'prep',$('#prAutoPrep')?.checked)}catch{}}const row={branch_id:currentBranchId(),paper_size:$('#prPaper').value,customer_copies:Math.max(1,Math.min(5,Number($('#prCustomerCopies').value||1))),prep_copies:Math.max(1,Math.min(5,Number($('#prPrepCopies').value||1))),show_logo:$('#prLogo').checked,show_business_name:$('#prName').checked,show_branch_phone:$('#prPhone').checked,show_branch_address:$('#prAddress').checked,receipt_header:$('#prHeader').value.trim()||null,receipt_footer:$('#prFooter').value.trim()||null,prep_show_prices:true,auto_print_customer:pc.auto_print_customer,auto_print_prep:pc.auto_print_prep,updated_at:new Date().toISOString()};await rest('branch_print_settings','',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify([row])});state.branchPrintSettings=state.branchPrintSettings.filter(x=>Number(x.branch_id)!==currentBranchId()).concat(row);toast('تم حفظ إعدادات طباعة الفرع')}catch(e){toast(e.message)}};
 if($('#saveFinancialSettings'))$('#saveFinancialSettings').onclick=async()=>{try{const row={branch_id:currentBranchId(),discount_enabled:$('#finDiscountEnabled').checked,discount_mode:$('#finDiscountMode').value,max_discount_percent:Math.max(0,Math.min(100,Number($('#finMaxDiscount').value||0))),tax_enabled:$('#finTaxEnabled').checked,tax_rate:Math.max(0,Math.min(100,Number($('#finTaxRate').value||0))),prices_include_tax:$('#finTaxIncluded').checked,service_enabled:$('#finServiceEnabled').checked,service_rate:Math.max(0,Math.min(100,Number($('#finServiceRate').value||0))),updated_at:new Date().toISOString()};await rest('branch_financial_settings','',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify([row])});for(const m of state.paymentMethods){const active=$(`[data-pay-active="${m.id}"]`)?.checked!==false,def=$(`[data-pay-default="${m.id}"]`)?.checked===true;await rest('branch_payment_methods','',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify([{branch_id:currentBranchId(),payment_method_id:m.id,active,is_default:def}])})}state.branchFinancialSettings=state.branchFinancialSettings.filter(x=>Number(x.branch_id)!==currentBranchId()).concat(row);state.branchPaymentMethods=await rest('branch_payment_methods','select=*');toast('تم حفظ طرق الدفع والخصم والضريبة والخدمة')}catch(e){toast(e.message)}};
 if($('#page')&&!$('#returnsPolicyCard')){const card=document.createElement('div');card.id='returnsPolicyCard';card.className='panel';card.innerHTML=`<h2>↩️ إعدادات المرتجعات</h2><label class="inline-check"><input id="allowClosedReturns" type="checkbox" ${returnClosed?'checked':''}> السماح بالمرتجع من ورديات سابقة مقفولة</label><p class="hint">لو مقفول: المرتجع من الوردية الحالية فقط. لو مفتوح: يمكن البحث في ورديات سابقة، لكن المرتجع يُحسب على الوردية الحالية.</p>`;$('#page').prepend(card);$('#allowClosedReturns').onchange=async e=>{try{await rest('app_settings','key=eq.returns_allow_closed_shifts',{method:'PATCH',body:JSON.stringify({value:e.target.checked?'true':'false'})});state.settings.returns_allow_closed_shifts=e.target.checked;toast('تم حفظ إعداد المرتجعات')}catch(err){e.target.checked=!e.target.checked;toast(err.message)}};}
 if($('#addPaymentMethod'))$('#addPaymentMethod').onclick=async()=>{const name=await uiPrompt('اسم طريقة الدفع مثل: Vodafone Cash');if(name===null||!name.trim())return;const code='pay_'+Date.now();try{const r=await rest('payment_methods','select=*',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{code,name:name.trim(),kind:'other',active:true,sort_order:100}])});if(r?.[0]){await rest('branch_payment_methods','',{method:'POST',body:JSON.stringify([{branch_id:currentBranchId(),payment_method_id:r[0].id,active:true,is_default:false}])});state.paymentMethods.push(r[0]);state.branchPaymentMethods=await rest('branch_payment_methods','select=*');toast('تمت إضافة طريقة الدفع');renderSettings()}}catch(e){toast(e.message)}};
 if($('#saveSettings'))$('#saveSettings').onclick=async()=>{const rows=[...document.querySelectorAll('[data-setting]')].map(x=>({key:x.dataset.setting,value:String(x.checked)}));for(const r of rows)await rest('app_settings',`key=eq.${encodeURIComponent(r.key)}`,{method:'PATCH',body:JSON.stringify({value:r.value})});Object.assign(state.settings,Object.fromEntries(rows.map(r=>[r.key,r.value==='true'])));toast('تم حفظ الإعدادات')};
 if($('#backupAll'))$('#backupAll').onclick=()=>$$('[data-backup-group]').forEach(x=>x.checked=true);
 if($('#backupNone'))$('#backupNone').onclick=()=>$$('[data-backup-group]').forEach(x=>x.checked=false);
 if($('#createBackup'))$('#createBackup').onclick=async()=>{const g=selectedBackupGroups($('#page'));if(!g.length)return toast('حدد بيانات للنسخ');try{await exportBackup(g);toast('تم إنشاء النسخة الاحتياطية')}catch(e){toast(e.message)}};
 if($('#restoreBackup'))$('#restoreBackup').onclick=async()=>{const f=$('#restoreFile').files[0],g=selectedBackupGroups($('#page'));if(!f)return toast('اختر ملف النسخة');if(!g.length)return toast('حدد ما تريد استعادته');if(!await uiConfirm('استعادة البيانات المحددة من النسخة؟ سيتم دمجها مع البيانات الحالية.'))return;try{await restoreBackup(f,g);toast('تمت الاستعادة بنجاح')}catch(e){toast(e.message)}};
 if($('#resetSelected'))$('#resetSelected').onclick=async()=>{const g=selectedBackupGroups($('#page'));if(!g.length)return toast('حدد ما تريد إعادة ضبطه');const code=await uiPrompt('اكتب RESET بالحروف الكبيرة لتأكيد مسح البيانات المحددة فقط','',{title:'تأكيد إعادة الضبط',icon:'⚠️',danger:true,placeholder:'RESET',okText:'إعادة الضبط'});if(code!=='RESET')return toast('تم إلغاء إعادة الضبط');try{await resetGroups(g);toast('تمت إعادة ضبط البيانات المحددة');setTimeout(()=>location.reload(),900)}catch(e){toast(e.message)}};
}

function initDeveloperContact(){
 const btn=$('#developerContactBtn'),m=$('#developerContactModal'),close=$('#developerContactClose'),wa=$('#developerWhatsappBtn');
 if(!btn||!m)return;
 const hide=()=>m.classList.add('hidden');
 btn.onclick=()=>m.classList.remove('hidden');
 if(close)close.onclick=hide;
 m.onclick=e=>{if(e.target===m)hide()};
 if(wa)wa.onclick=async()=>{const url='https://wa.me/201140642734';try{if(window.topBurgerDesktop?.external?.open)await window.topBurgerDesktop.external.open(url);else window.open(url,'_blank','noopener,noreferrer')}catch{toast('تعذر فتح واتساب على هذا الجهاز')}};
}
initDeveloperContact();

async function reportDesktopUpdateHealth(ok,phase,message,checks={}){try{if(window.topBurgerDesktop?.update?.health)return await window.topBurgerDesktop.update.health({ok:ok===true,phase,message,checks})}catch(e){console.warn('post update health report',e?.message||e)}return null}
async function init(){
  if(!(await ensureSharawlaLicense())){await reportDesktopUpdateHealth(false,'license','تعذر اجتياز فحص الترخيص',{license:false});return}
  if(!(await ensureSharawlaRuntimeConfig())){await reportDesktopUpdateHealth(false,'runtime','تعذر تحميل Runtime Config',{license:true,runtime:false});return}
  if(window.topBurgerDesktop?.isDesktop){
    if(!(await ensureSharawlaBusinessConnection())){await reportDesktopUpdateHealth(false,'business-connection','تعذر تحميل Business Connection',{license:true,runtime:true,businessConnection:false});return}
  }else if(!cfg.url||!cfg.key)return show('setupView');
  await ensureSharawlaSupportCode();
  await reportDesktopUpdateHealth(true,'renderer-ready','اكتمل فحص التشغيل الكامل بنجاح',{license:true,runtime:true,businessConnection:true,loginRequired:true});
  session=null;
  show('loginView');
}
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'})
      .then(reg=>reg.update().catch(()=>{}))
      .catch(()=>{});
  });
}

// V10.4.12 — visible Windows update download progress.
function bindDesktopUpdateProgress(){
  if(!window.topBurgerDesktop?.update?.onProgress)return;
  let hideTimer=null;
  const ensure=()=>{let el=document.getElementById('desktopUpdateProgress');if(!el){el=document.createElement('div');el.id='desktopUpdateProgress';el.className='desktop-update-progress hidden';el.innerHTML='<div class="desktop-update-progress-head"><b id="desktopUpdateProgressText">جاري تنزيل التحديث…</b><span id="desktopUpdateProgressPct"></span></div><div class="desktop-update-progress-track"><i id="desktopUpdateProgressBar"></i></div>';document.body.appendChild(el)}return el};
  window.topBurgerDesktop.update.onProgress(data=>{const el=ensure(),text=el.querySelector('#desktopUpdateProgressText'),pct=el.querySelector('#desktopUpdateProgressPct'),bar=el.querySelector('#desktopUpdateProgressBar');clearTimeout(hideTimer);if(data?.state==='idle'||data?.state==='up-to-date'){el.classList.add('hidden');return}el.classList.remove('hidden','is-error','is-done');if(data?.state==='error')el.classList.add('is-error');if(data?.state==='done'||data?.state==='installing')el.classList.add('is-done');const p=data?.percent!==null&&data?.percent!==undefined&&Number.isFinite(Number(data.percent))?Math.max(0,Math.min(100,Number(data.percent))):null;const msg=data?.message||'جاري تنزيل التحديث…';text.textContent=msg;el.title=msg;pct.textContent=p===null?'':`${Math.round(p)}%`;bar.style.width=p===null?'18%':`${p}%`;if(['done','downloaded','backup-ready','blocked-offline','integrity-ok'].includes(data?.state))hideTimer=setTimeout(()=>el.classList.add('hidden'),4000);else if(['error','integrity-error','health-failed'].includes(data?.state))hideTimer=setTimeout(()=>el.classList.add('hidden'),6500);});
}

bindDesktopUpdateProgress();
init();


/* V7 — branch permissions, delivery operations and website-ready UI */
function openDriverPicker(orderId, drivers, onDone){
 const available=(drivers||[]).filter(d=>d.active!==false&&String(d.branch_id)===String(currentBranchId()));
 if(!available.length)return toast('لا يوجد مندوب فعال في هذا الفرع');
 const m=document.createElement('div');m.className='modal';
 m.innerHTML=`<div class="modal-card driver-picker"><h2>🛵 تسليم الطلب لمندوب</h2><p>اختر المندوب</p><div class="driver-picker-list">${available.map(d=>`<button class="driver-pick-btn" data-driver-pick="${d.id}"><b>🛵 ${esc(d.name)}</b><small>${esc(d.phone||'بدون رقم')}</small></button>`).join('')}</div><div class="modal-actions"><button class="secondary" data-close>إلغاء</button></div></div>`;
 document.body.appendChild(m);
 m.onclick=async e=>{if(e.target===m||e.target.closest('[data-close]'))return m.remove();const b=e.target.closest('[data-driver-pick]');if(!b)return;const d=available.find(x=>String(x.id)===String(b.dataset.driverPick));if(!d)return;try{await rest('orders',`id=eq.${orderId}`,{method:'PATCH',body:JSON.stringify({driver_id:d.id,status:'out_for_delivery',assigned_at:new Date().toISOString()})});await audit('assign_driver','order',orderId,{driver_id:d.id});m.remove();toast(`تم التسليم إلى ${d.name}`);if(onDone)onDone(d)}catch(err){toast(err.message)}};
}

function paymentStatusLabel(v){return ({unpaid:'💰 غير مدفوع',proof_submitted:'🧾 إيصال للمراجعة',confirmed:'✅ الدفع مؤكد',rejected:'❌ إثبات مرفوض'}[v]||'💰 غير مدفوع')}
function paymentStatusHTML(v){const x=v||'unpaid';return `<span class="payment-status-chip payment-status-${esc(x)}">${paymentStatusLabel(x)}</span>`}
async function openPaymentReceipt(path){if(!path)return toast('لا يوجد إيصال مرفوع');try{const r=await fetch(`${cfg.url}/storage/v1/object/authenticated/website-payment-receipts/${encodeURI(path)}`,{headers:{apikey:cfg.key,Authorization:`Bearer ${session.access_token}`}});if(!r.ok)throw new Error('تعذر تحميل الإيصال');const blob=await r.blob(),url=URL.createObjectURL(blob);const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>🧾 إيصال الدفع</h2><img class="receipt-preview" src="${url}" alt="إيصال الدفع"><div class="modal-actions"><button class="secondary" data-close>إغلاق</button></div></div>`;document.body.appendChild(m);m.onclick=e=>{if(e.target===m||e.target.closest('[data-close]')){URL.revokeObjectURL(url);m.remove()}}}catch(e){toast(e.message)}}
async function getWebsiteOrderDetails(id){
 const [orders,items,zones]=await Promise.all([
  rest('website_orders',`select=*&id=eq.${Number(id)}&limit=1`),
  rest('website_order_items',`select=*&website_order_id=eq.${Number(id)}&order=id`),
  rest('delivery_zones',`select=id,name,delivery_fee&branch_id=eq.${currentBranchId()}`).catch(()=>[])
 ]);
 const order=orders?.[0];if(!order)throw new Error('تعذر تحميل طلب الموقع');
 const ids=(items||[]).map(x=>x.id);
 let modifiers=[];if(ids.length)modifiers=await rest('website_order_item_modifiers',`select=*&website_order_item_id=in.(${ids.join(',')})&order=id`).catch(()=>[]);
 const zone=(zones||[]).find(z=>String(z.id)===String(order.delivery_zone_id));
 return {order,items:items||[],modifiers,zone};
}
function websiteOrderDetailsHTML(d){
 const w=d.order,addr=w.order_type==='pickup'?'استلام من الفرع':(w.customer_address||w.delivery_address||'العنوان غير مسجل');
 const itemRows=d.items.map(i=>{const mods=d.modifiers.filter(m=>String(m.website_order_item_id)===String(i.id));return `<div class="web-detail-item"><div><b>${Number(i.quantity||1)} × ${esc(i.product_name||'صنف')}</b>${i.variant_name?`<small>${esc(i.variant_name)}</small>`:''}${mods.length?`<small>إضافات: ${mods.map(m=>esc(m.modifier_name)).join('، ')}</small>`:''}${i.notes?`<small>ملاحظة: ${esc(i.notes)}</small>`:''}</div><strong>${money(i.line_total)}</strong></div>`}).join('');
 return `<div class="web-order-review"><div class="web-review-address"><b>📍 ${w.order_type==='pickup'?'طريقة الاستلام':'عنوان التوصيل'}</b><span>${esc(addr)}</span>${w.order_type==='delivery'?`<small>المنطقة: ${esc(d.zone?.name||'غير محددة')} • توصيل ${money(w.delivery_fee||d.zone?.delivery_fee||0)}</small>`:''}</div><div class="web-review-customer"><b>👤 ${esc(w.customer_name)}</b><span dir="ltr">${esc(w.customer_phone)}</span></div>${w.customer_notes?`<div class="web-review-note"><b>📝 ملاحظات العميل</b><span>${esc(w.customer_notes)}</span></div>`:''}<div class="web-detail-items">${itemRows||'<div class="empty">لا توجد أصناف</div>'}</div><div class="web-review-total"><span>الإجمالي</span><b>${money(w.total)}</b></div></div>`;
}
async function openWebsiteOrderReview(id,action=null){
 try{
  const d=await getWebsiteOrderDetails(id),w=d.order;
  return await new Promise(resolve=>{const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card website-order-review-modal"><h2>🌐 WEB-${String(w.id).padStart(5,'0')} • مراجعة الطلب</h2><p class="web-review-warning">راجع العنوان والمنطقة والأصناف قبل ${action==='accept'?'الاستلام':action==='reject'?'الرفض':'اتخاذ القرار'}.</p>${websiteOrderDetailsHTML(d)}<div class="modal-actions"><button class="secondary" data-close>إغلاق</button>${action==='reject'?'<button class="danger" data-confirm>رفض الطلب</button>':action==='accept'?'<button class="primary" data-confirm>✅ استلام الطلب</button>':''}</div></div>`;document.body.appendChild(m);m.onclick=e=>{if(e.target===m||e.target.closest('[data-close]')){m.remove();resolve(false);return}if(e.target.closest('[data-confirm]')){m.remove();resolve(true)}}});
 }catch(e){toast(e.message);return false}
}
async function renderDeliveryOrders(){
  $('#page').innerHTML='<div class="panel"><h2>📦 متابعة الطلبات</h2><div class="empty">جاري التحميل...</div></div>';
  const [orders,drivers,webOrders]=await Promise.all([
    rest('orders',`select=*&branch_id=eq.${currentBranchId()}&or=(order_type.eq.delivery,source.eq.website)&order=created_at.desc&limit=300`),
    rest('delivery_drivers','select=*&active=eq.true&order=name'),
    rest('website_orders',`select=*&branch_id=eq.${currentBranchId()}&status=eq.pending&order=created_at.asc&limit=100`).catch(()=>[])
  ]);
  state.drivers=drivers||[];
  const all=(orders||[]).filter(o=>o.status!=='cancelled'&&(o.order_type==='delivery'||(o.source==='website'&&o.order_type==='pickup')));
  const active=all.filter(o=>['new','preparing','ready','out_for_delivery'].includes(o.status));
  const counts={new:all.filter(o=>o.status==='new').length,preparing:all.filter(o=>o.status==='preparing').length,ready:all.filter(o=>o.status==='ready').length,out:all.filter(o=>o.status==='out_for_delivery').length,delivered:all.filter(o=>o.status==='delivered').length};
  const websitePanel=(webOrders||[]).length?`<div class="panel website-orders-panel"><div class="delivery-toolbar"><h2>🌐 طلبات الموقع الجديدة <span class="status-pill">${webOrders.length}</span></h2></div><div class="delivery-rows">${webOrders.map(w=>`<div class="delivery-row website-pending"><span class="delivery-row-id"><b>WEB-${String(w.id).padStart(5,'0')} • ${w.order_type==='pickup'?'🏪 استلام فرع':'🛵 دليفري'}</b><small>${fmtDate(w.created_at)}</small></span><span class="delivery-row-customer"><b>${esc(w.customer_name)}</b><small>${esc(w.customer_phone)}</small><small class="web-pending-address">${w.order_type==='pickup'?'🏪 استلام من الفرع':`📍 ${esc(w.customer_address||w.delivery_address||'العنوان غير مسجل')}`}</small><small>${esc(w.payment_method_name||paymentLabel(w.payment_method_code||'cash'))}${w.payment_reference?` • مرجع: ${esc(w.payment_reference)}`:''}</small>${paymentStatusHTML(w.payment_status)}</span><strong>${money(w.total)}</strong><span><button class="secondary" data-web-details="${w.id}">📋 التفاصيل والعنوان</button> ${w.payment_receipt_path?`<button class="secondary" data-web-receipt="${esc(w.payment_receipt_path)}">🧾 الإيصال</button> `:''}<button class="primary" data-web-accept="${w.id}">✅ استلام</button> <button class="danger" data-web-reject="${w.id}">رفض</button></span></div>`).join('')}</div></div>`:'';
  $('#page').innerHTML=`${websitePanel}<div class="delivery-mini-kpis"><div><b>${counts.new}</b><span>جديد</span></div><div><b>${counts.out}</b><span>مع المندوب</span></div><div><b>${active.length}</b><span>نشط</span></div></div>
  <div class="panel delivery-queue-panel"><div class="delivery-toolbar"><div class="delivery-filter" id="deliveryFilter"><button class="active" data-filter="active">النشط</button><button data-filter="new">تم الاستلام</button><button data-filter="preparing">جاري التجهيز</button><button data-filter="ready">جاهز</button><button data-filter="out_for_delivery">مع المندوب</button><button data-filter="delivered">تم التسليم</button><button data-filter="all">الكل</button></div><input id="deliverySearch" placeholder="🔎 رقم الأوردر أو العميل أو الموبايل"></div><div class="delivery-rows" id="deliveryRows"></div></div>`;
  let filter='active';
  const draw=()=>{
    const q=($('#deliverySearch')?.value||'').trim().toLowerCase();
    const rows=all.filter(o=>{
      const ok=filter==='all'||(filter==='active'?['new','preparing','ready','out_for_delivery'].includes(o.status):o.status===filter);
      const hay=[o.order_number,o.customer_name,o.customer_phone,o.delivery_area,o.delivery_address,branchName(o.branch_id)].join(' ').toLowerCase();
      return ok&&(!q||hay.includes(q));
    });
    $('#deliveryRows').innerHTML=rows.map(o=>deliveryOrderCard(o)).join('')||'<div class="empty">لا توجد طلبات مطابقة</div>';
  };
  $('#deliverySearch').oninput=draw;
  $('#deliveryFilter').onclick=e=>{const b=e.target.closest('[data-filter]');if(!b)return;filter=b.dataset.filter;$$('#deliveryFilter button').forEach(x=>x.classList.toggle('active',x===b));draw()};
  $('#page').onclick=async e=>{
    const wd=e.target.closest('[data-web-details]');if(wd){await openWebsiteOrderReview(Number(wd.dataset.webDetails));return}
    const wr=e.target.closest('[data-web-receipt]');if(wr){return openPaymentReceipt(wr.dataset.webReceipt)}
    const acc=e.target.closest('[data-web-accept]');if(acc){const sh=await getOpenShift();if(!sh)return toast('افتح وردية أولًا قبل استلام طلب الموقع');if(!await openWebsiteOrderReview(Number(acc.dataset.webAccept),'accept'))return;try{const orderId=Number(await rpc('accept_website_order',{p_website_order_id:Number(acc.dataset.webAccept)}));const [orders,items]=await Promise.all([rest('orders',`select=*&id=eq.${orderId}`),rest('order_items',`select=*&order_id=eq.${orderId}&order=id`)]);const o=orders?.[0];if(!o)throw new Error('تم استلام الطلب لكن تعذر تحميله للطباعة');toast(`تم استلام بون ${bonDisplay(o)}`);await renderDeliveryOrders();showReceipt(o,items||[]);return}catch(err){return toast(err.message)}}
    const rej=e.target.closest('[data-web-reject]');if(rej){if(!await openWebsiteOrderReview(Number(rej.dataset.webReject),'reject'))return;try{await rpc('reject_website_order',{p_website_order_id:Number(rej.dataset.webReject)});toast('تم رفض الطلب');return renderDeliveryOrders()}catch(err){return toast(err.message)}}
    const detail=e.target.closest('[data-order-detail]');if(detail)return openDeliveryOrderDetails(detail.dataset.orderDetail);
  };
  draw();
}
function deliveryOrderCard(o){const drv=driverName(o.driver_id);const web=o.source==='website'?'🌐 موقع • ':'';const area=o.delivery_area||zoneName(o.delivery_zone_id)||'';return `<button class="delivery-row status-${esc(o.status)}" data-order-detail="${o.id}"><span class="delivery-row-id"><b>${esc(bonDisplay(o))}</b><small>${web}${branchName(o.branch_id)} • ${fmtDate(o.created_at)}</small></span><span class="delivery-row-customer"><b>${esc(o.customer_name||o.customer_phone||'بدون اسم')}</b><small>${esc(area)}${drv?` • 🛵 ${esc(drv)}`:''}</small></span><strong>${money(o.total)}</strong><span>${o.source==='website'?paymentStatusHTML(o.payment_status):''}</span><span class="status-pill">${statusLabel(o.status)}</span><span class="delivery-chevron">‹</span></button>`}
async function openDeliveryOrderDetails(id){
 const [orders,items]=await Promise.all([rest('orders',`select=*&id=eq.${id}`),rest('order_items',`select=*&order_id=eq.${id}&order=id`)]);const o=orders[0];if(!o)return toast('الأوردر غير موجود');o._driver_name=driverName(o.driver_id);
 const m=document.createElement('div');m.className='modal';
 const isPickup=o.source==='website'&&o.order_type==='pickup';
 const action=o.status==='new'
   ?'<button class="primary" data-preparing>🍳 جاري التجهيز</button>'
   :o.status==='preparing'
     ?`<button class="primary" data-ready>✅ ${isPickup?'جاهز للاستلام':'تم التجهيز'}</button>`
     :o.status==='ready'
       ?(isPickup?'<button class="primary" data-completed>✅ تم تسليم الطلب للعميل</button>':'<button class="primary" data-assign>🛵 تسليم لمندوب</button>')
       :o.status==='out_for_delivery'
         ?'<button class="primary" data-delivered>✅ تم التسليم</button>'
         :'';
 m.innerHTML=`<div class="modal-card delivery-detail-modal"><div class="detail-head"><div><small>${branchName(o.branch_id)}</small><h2>${esc(bonDisplay(o))}</h2></div><span class="status-pill">${statusLabel(o.status)}</span></div>${customerInfoHTML(o)}<div class="detail-items">${items.map(i=>`<div><span>${i.quantity} × ${esc(i.product_name)}</span><b>${money(i.total)}</b></div>`).join('')}</div><div class="detail-total"><span>المطلوب</span><strong>${money(o.total)}</strong></div>${o.source==='website'?`<div class="payment-review-box"><h3>💳 حالة الدفع</h3><p>${paymentStatusHTML(o.payment_status)}</p><p><b>الطريقة:</b> ${esc(paymentLabel(o.payment_method))}${o.payment_reference?` • <b>المرجع:</b> ${esc(o.payment_reference)}`:''}</p><div class="payment-review-actions">${o.payment_receipt_path?`<button class="secondary" data-view-payment-receipt>🧾 عرض الإيصال</button>`:''}<button class="primary" data-payment-confirm>✅ تأكيد الدفع</button><button class="danger" data-payment-reject>رفض الإثبات</button><button class="secondary" data-payment-unpaid>غير مدفوع</button></div></div>`:''}<div class="modal-actions"><button class="secondary" data-close>إغلاق</button><button class="secondary" data-print>طباعة</button>${action}</div></div>`;
 document.body.appendChild(m);
 m.onclick=async e=>{
   if(e.target.closest('[data-close]')||e.target===m){m.remove();return}
   if(e.target.closest('[data-print]')){printReceipt(o,items);return}
   if(e.target.closest('[data-preparing]')){await rest('orders',`id=eq.${o.id}`,{method:'PATCH',body:JSON.stringify({status:'preparing'})});await audit('mark_preparing','order',o.id,{});m.remove();toast('تم بدء تجهيز الطلب');return renderDeliveryOrders()}
   if(e.target.closest('[data-ready]')){await rest('orders',`id=eq.${o.id}`,{method:'PATCH',body:JSON.stringify({status:'ready'})});await audit('mark_ready','order',o.id,{});m.remove();toast(isPickup?'الطلب جاهز للاستلام':'تم تجهيز الطلب');return renderDeliveryOrders()}
   if(e.target.closest('[data-assign]')){const list=state.drivers.filter(d=>String(d.branch_id)===String(o.branch_id));m.remove();openDriverPicker(o.id,list,()=>renderDeliveryOrders());return}
   if(e.target.closest('[data-view-payment-receipt]')){return openPaymentReceipt(o.payment_receipt_path)}
   if(e.target.closest('[data-payment-confirm]')){await rpc('review_order_payment',{p_order_id:Number(o.id),p_status:'confirmed'});o.payment_status='confirmed';m.remove();toast('تم تأكيد الدفع');return renderDeliveryOrders()}
   if(e.target.closest('[data-payment-reject]')){await rpc('review_order_payment',{p_order_id:Number(o.id),p_status:'rejected'});o.payment_status='rejected';m.remove();toast('تم رفض إثبات الدفع');return renderDeliveryOrders()}
   if(e.target.closest('[data-payment-unpaid]')){await rpc('review_order_payment',{p_order_id:Number(o.id),p_status:'unpaid'});o.payment_status='unpaid';m.remove();toast('تم تسجيل الطلب غير مدفوع');return renderDeliveryOrders()}
   if(e.target.closest('[data-completed]')){await rest('orders',`id=eq.${o.id}`,{method:'PATCH',body:JSON.stringify({status:'completed',delivered_at:new Date().toISOString()})});await audit('mark_pickup_completed','order',o.id,{});m.remove();toast('تم تسليم طلب الاستلام للعميل');return renderDeliveryOrders()}
   if(e.target.closest('[data-delivered]')){await rest('orders',`id=eq.${o.id}`,{method:'PATCH',body:JSON.stringify({status:'delivered',delivered_at:new Date().toISOString()})});await audit('mark_delivered','order',o.id,{});m.remove();toast('تم تسجيل التسليم');return renderDeliveryOrders()}
 };
}

async function renderDeliverySettings(){
 if(!canAccessPage('deliverySettings')){ $('#page').innerHTML='<div class="empty">ليس لديك صلاحية لإعدادات الدليفري</div>';return; }
 const [drivers,zones,settlements]=await Promise.all([rest('delivery_drivers',`select=*&branch_id=eq.${currentBranchId()}&order=active.desc,name`),rest('delivery_zones',`select=*&branch_id=eq.${currentBranchId()}&order=active.desc,name`),rest('driver_settlements',`select=*&branch_id=eq.${currentBranchId()}&order=created_at.desc&limit=50`).catch(()=>[])]);
 state.drivers=drivers||[];state.deliveryZones=zones||[];
 $('#page').innerHTML=`<div class="grid delivery-admin-grid"><div class="panel"><h2>🛵 المناديب</h2><div class="form-grid"><label>الاسم<input id="driverName"></label><label>الموبايل<input id="driverPhone" inputmode="tel"></label><label>الفرع<select id="driverBranch" disabled><option value="${currentBranchId()}">${esc(branchName(currentBranchId()))}</option></select></label></div><button id="addDriver" class="primary">إضافة مندوب</button><div class="manage-list">${drivers.filter(d=>d.active!==false).map(d=>`<div class="manage-row"><span>${esc(d.name)}${d.phone?` • ${esc(d.phone)}`:''}</span><span><button class="secondary" data-edit-driver="${d.id}">✏️</button><button class="danger" data-delete-driver="${d.id}">🗑️ حذف</button></span></div>`).join('')||'لا يوجد مناديب'}</div></div><div class="panel"><h2>📍 مناطق الدليفري</h2><div class="form-grid"><label>المنطقة<input id="zoneName"></label><label>الفرع المسؤول<select id="zoneBranch" disabled><option value="${currentBranchId()}">${esc(branchName(currentBranchId()))}</option></select></label><label>رسوم التوصيل<input id="zoneFee" type="number" min="0" step="0.01" value="0"></label></div><button id="addZone" class="primary">إضافة منطقة</button><div class="manage-list">${zones.map(z=>`<div class="manage-row ${z.active===false?'muted':''}"><span>${esc(z.name)} • ${money(z.delivery_fee)}</span><span><button class="secondary" data-edit-zone="${z.id}">✏️</button><button class="secondary" data-toggle-zone="${z.id}">${z.active===false?'تفعيل':'إيقاف'}</button></span></div>`).join('')||'لا توجد مناطق'}</div></div></div><div class="panel"><h2>تسويات المناديب</h2><p>التسوية تحسب طلبات الكاش التي تم تسليمها ولم تتم تسويتها بعد.</p><div class="driver-settle-list">${drivers.map(d=>`<button class="secondary" data-settle="${d.id}">تسوية ${esc(d.name)}</button>`).join('')}</div>${settlements.length?`<div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>المندوب</th><th>الفرع</th><th>الطلبات</th><th>المبلغ</th></tr></thead><tbody>${settlements.map(x=>`<tr><td>${fmtDate(x.created_at)}</td><td>${driverName(x.driver_id)}</td><td>${branchName(x.branch_id)}</td><td>${x.orders_count}</td><td>${money(x.amount)}</td></tr>`).join('')}</tbody></table></div>`:''}</div>`;
 $('#addDriver').onclick=async()=>{if(!$('#driverName').value.trim())return toast('اكتب اسم المندوب');await rest('delivery_drivers','',{method:'POST',body:JSON.stringify([{name:$('#driverName').value.trim(),phone:$('#driverPhone').value.trim()||null,branch_id:currentBranchId(),active:true}])});toast('تمت إضافة المندوب');renderDeliverySettings()};
 $('#addZone').onclick=async()=>{const zoneNameValue=$('#zoneName').value.trim(),zoneFeeValue=Number($('#zoneFee')?.value||0);if(!zoneNameValue)return toast('اكتب اسم المنطقة');if(!Number.isFinite(zoneFeeValue)||zoneFeeValue<0)return toast('رسوم التوصيل غير صحيحة');await rest('delivery_zones','',{method:'POST',body:JSON.stringify([{name:zoneNameValue,delivery_fee:zoneFeeValue,branch_id:currentBranchId(),active:true}])});toast('تمت إضافة المنطقة');renderDeliverySettings()};
 $('#page').onclick=async e=>{const ed=e.target.closest('[data-edit-driver]');if(ed){const d=drivers.find(x=>String(x.id)===ed.dataset.editDriver);const name=await uiPrompt('اسم المندوب',d.name);if(name===null||!name.trim())return toast('اكتب اسم المندوب');const phone=await uiPrompt('الموبايل',d.phone||'');if(phone===null)return;await rest('delivery_drivers',`id=eq.${d.id}`,{method:'PATCH',body:JSON.stringify({name:name.trim(),phone:phone.trim()||null})});toast('تم تعديل المندوب');return renderDeliverySettings()}const td=e.target.closest('[data-delete-driver]');if(td){const d=drivers.find(x=>String(x.id)===td.dataset.deleteDriver);if(!d)return;if(!await uiConfirm(`حذف المندوب ${d.name}؟\nسيختفي من المناديب الحالية مع الاحتفاظ باسمه في الطلبات والتسويات القديمة.`))return;await rest('delivery_drivers',`id=eq.${d.id}`,{method:'PATCH',body:JSON.stringify({active:false})});toast('تم حذف المندوب');return renderDeliverySettings()}const ez=e.target.closest('[data-edit-zone]');if(ez){const z=zones.find(x=>String(x.id)===ez.dataset.editZone);const name=await uiPrompt('اسم المنطقة',z.name);if(name===null||!name.trim())return toast('اكتب اسم المنطقة');const fee=await uiPrompt('رسوم التوصيل',String(Number(z.delivery_fee||0)),{type:'number'});if(fee===null||!Number.isFinite(Number(fee))||Number(fee)<0)return toast('رسوم التوصيل غير صحيحة');await rest('delivery_zones',`id=eq.${z.id}`,{method:'PATCH',body:JSON.stringify({name:name.trim(),delivery_fee:Number(fee)})});toast('تم تعديل المنطقة');return renderDeliverySettings()}const tz=e.target.closest('[data-toggle-zone]');if(tz){const z=zones.find(x=>String(x.id)===tz.dataset.toggleZone);if(!await uiConfirm(`${z.active===false?'تفعيل':'إيقاف'} المنطقة ${z.name}؟`))return;await rest('delivery_zones',`id=eq.${z.id}`,{method:'PATCH',body:JSON.stringify({active:z.active===false})});toast('تم تحديث المنطقة');return renderDeliverySettings()}const b=e.target.closest('[data-settle]');if(!b)return;const did=Number(b.dataset.settle);const d=drivers.find(x=>x.id===did);const os=await rest('orders',`select=id,total&driver_id=eq.${did}&status=eq.delivered&payment_method=eq.cash&driver_settled_at=is.null`);const amount=os.reduce((a,o)=>a+Number(o.total||0),0);if(!os.length)return toast('لا توجد تحصيلات كاش غير مسواة لهذا المندوب');if(!await uiConfirm(`تسوية ${d.name}: ${os.length} طلب بإجمالي ${money(amount)}؟`))return;const now=new Date().toISOString();await rest('orders',`id=in.(${os.map(o=>o.id).join(',')})`,{method:'PATCH',body:JSON.stringify({driver_settled_at:now})});await rest('driver_settlements','',{method:'POST',body:JSON.stringify([{driver_id:did,branch_id:d.branch_id,employee_id:state.employee.id,orders_count:os.length,amount,created_at:now}])});await audit('driver_settlement','delivery_driver',did,{orders_count:os.length,amount});toast('تمت تسوية المندوب');renderDeliverySettings()};
}

async function renderUsers(){
 if(!isAdmin()){ $('#page').innerHTML='<div class="empty">المستخدمون متاحون للمدير فقط</div>';return; }
 let rows=[];
 try{
   const [employees,links,permissions]=await Promise.all([
     rest('employees','select=id,name,username,role,branch_id,active,auth_user_id&order=id'),
     rest('employee_branches','select=employee_id,branch_id'),
     rest('employee_permissions','select=employee_id,permission_key,allowed')
   ]);
   rows=(employees||[]).map(u=>{const upr=(permissions||[]).filter(x=>String(x.employee_id)===String(u.id));return {...u,email:u.username||'',branch_ids:(links||[]).filter(x=>String(x.employee_id)===String(u.id)).map(x=>Number(x.branch_id)),permissions_configured:upr.length>0,permissions:upr.filter(x=>x.allowed!==false).map(x=>x.permission_key)}});
 }catch(e){ $('#page').innerHTML=`<div class="panel"><h2>المستخدمون والصلاحيات</h2><div class="empty"><b>تعذر تحميل المستخدمين.</b><p>${esc(e.message)}</p></div></div>`;return; }
 const roleLabel=r=>({admin:'مدير',cashier:'كاشير',callcenter:'كول سنتر'}[r]||r);
 const branchChecks=(selected=[],admin=false)=>admin?'<span class="tag">كل الفروع</span>':state.branches.map(b=>`<label><input type="checkbox" class="user-branch" value="${b.id}" ${selected.map(String).includes(String(b.id))?'checked':''}> ${esc(b.name)}</label>`).join('');
 const defaultPermissions=role=>runtimeRolePages(role).filter(x=>x!=='home'&&x!=='delivery'&&x!=='users');
 const permissionDefs=runtimePermissionDefs(), permissionGroups=runtimePermissionGroups();
 const permissionChecks=(selected=[],admin=false)=>admin?'<div class="empty">المدير لديه كل الصلاحيات تلقائيًا.</div>':permissionGroups.map(([title,keys])=>`<section class="permission-group"><h4>${title}</h4><div class="permission-list">${keys.map(k=>{const d=permissionDefs.find(x=>x[0]===k);if(!d)return '';return `<label class="permission-row"><span>${d[1]}</span><input type="checkbox" class="user-permission permission-toggle" value="${k}" ${selected.includes(k)?'checked':''}></label>`}).join('')}</div></section>`).join('');
 $('#page').innerHTML=`<div class="panel users-admin-head"><div class="section-head"><div><h2>👥 المستخدمون والصلاحيات</h2><p>حدد لكل مستخدم الفروع والشاشات المسموح له بها.</p></div><button id="newUserBtn" class="primary">+ مستخدم جديد</button></div></div><div class="user-cards user-management-list">${rows.map(u=>`<div class="user-card ${u.active===false?'muted':''}"><div class="user-main"><b>${esc(u.name)}</b><small>${esc(u.email||u.username||'بدون بريد')} • ${roleLabel(u.role)} • ${u.active===false?'موقوف':'فعال'}</small></div><div class="user-branch-tags">${u.role==='admin'?'<span class="tag">كل الفروع</span>':(u.branch_ids||[]).map(id=>`<span class="tag">${esc(branchName(id))}</span>`).join('')||'<span class="tag">بدون فرع</span>'}</div><div class="user-branch-tags">${u.role==='admin'?'<span class="tag">كل الصلاحيات</span>':((u.permissions_configured?u.permissions:defaultPermissions(u.role)).map(k=>`<span class="tag">${esc(permissionDefs.find(x=>x[0]===k)?.[1]||k)}</span>`).join(''))}</div><div class="row-actions"><button class="secondary" data-edit-user="${u.id}">✏️ تعديل</button><button class="secondary" data-toggle-user="${u.id}">${u.active===false?'✅ تفعيل':'⛔ إيقاف'}</button><button class="secondary" data-password-user="${u.id}">🔑 كلمة المرور</button></div></div>`).join('')||'<div class="empty">لا يوجد مستخدمون</div>'}</div>`;
 const savePermissions=async(employeeId,keys)=>{await rest('employee_permissions',`employee_id=eq.${employeeId}`,{method:'DELETE'});const rows=permissionDefs.map(([k])=>({employee_id:employeeId,permission_key:k,allowed:keys.includes(k)}));if(rows.length)await rest('employee_permissions','',{method:'POST',body:JSON.stringify(rows)})};
 const openForm=(u=null)=>{const editing=!!u,role=u?.role||'cashier',ids=u?.branch_ids||[currentBranchId()],initialPerms=u?.permissions_configured?u.permissions:defaultPermissions(role);const m=document.createElement('div');m.className='modal';m.innerHTML=`<form class="modal-card user-edit-modal" id="userForm"><h2>${editing?'تعديل المستخدم':'إضافة مستخدم جديد'}</h2><div class="form-grid"><label>الاسم<input id="uName" value="${esc(u?.name||'')}" required></label><label>البريد الإلكتروني<input id="uEmail" type="email" value="${esc(u?.email||'')}" ${editing?'readonly':''} required></label>${editing?'':`<label>كلمة المرور<input id="uPassword" type="password" minlength="6" required></label>`}<label>الدور<select id="uRole"><option value="cashier" ${role==='cashier'?'selected':''}>كاشير</option><option value="callcenter" ${role==='callcenter'?'selected':''}>كول سنتر</option><option value="admin" ${role==='admin'?'selected':''}>مدير</option></select></label><label>الفرع الأساسي<select id="uHomeBranch">${state.branches.map(b=>`<option value="${b.id}" ${String(b.id)===String(u?.branch_id||currentBranchId())?'selected':''}>${esc(b.name)}</option>`).join('')}</select></label><label class="check-line"><input id="uActive" type="checkbox" ${u?.active===false?'':'checked'}> المستخدم فعال</label></div><div class="user-branches-box"><b>الفروع المسموح بها</b><div id="uBranchChecks" class="branch-checks">${branchChecks(ids,role==='admin')}</div><small id="uBranchHint">${role==='admin'?'المدير لديه صلاحية كل الفروع تلقائيًا.':'حدد فرعًا واحدًا أو أكثر.'}</small></div><div class="user-branches-box"><b>الصلاحيات</b><div id="uPermissionChecks" class="branch-checks">${permissionChecks(initialPerms,role==='admin')}</div><small>الدور يضع قالبًا افتراضيًا، وبعدها تقدر تزود أو تشيل أي صلاحية.</small></div><div class="modal-actions"><button type="button" class="secondary" data-close>إلغاء</button><button type="submit" class="primary">حفظ</button></div></form>`;document.body.appendChild(m);
   const redraw=()=>{const r=m.querySelector('#uRole').value;const currentBranches=[...m.querySelectorAll('.user-branch:checked')].map(x=>x.value);m.querySelector('#uBranchChecks').innerHTML=branchChecks(currentBranches.length?currentBranches:ids,r==='admin');m.querySelector('#uBranchHint').textContent=r==='admin'?'المدير لديه صلاحية كل الفروع تلقائيًا.':'حدد فرعًا واحدًا أو أكثر.';m.querySelector('#uPermissionChecks').innerHTML=permissionChecks(defaultPermissions(r),r==='admin')};
   m.querySelector('#uRole').onchange=redraw;m.onclick=e=>{if(e.target.closest('[data-close]')||e.target===m)m.remove()};
   m.querySelector('#userForm').onsubmit=async e=>{e.preventDefault();const role=m.querySelector('#uRole').value;let branch_ids=role==='admin'?state.branches.map(b=>Number(b.id)):[...m.querySelectorAll('.user-branch:checked')].map(x=>Number(x.value));if(role!=='admin'&&!branch_ids.length)return toast('حدد فرعًا واحدًا على الأقل');const branch_id=Number(m.querySelector('#uHomeBranch').value);branch_ids=[branch_id,...branch_ids.filter(x=>Number(x)!==branch_id)];const permissions=role==='admin'?runtimeAllPages():[...m.querySelectorAll('.user-permission:checked')].map(x=>x.value);const active=m.querySelector('#uActive').checked;try{let employeeId=u?.id;if(editing){await rest('employees',`id=eq.${u.id}`,{method:'PATCH',body:JSON.stringify({name:m.querySelector('#uName').value.trim(),role,branch_id,active})});await rest('employee_branches',`employee_id=eq.${u.id}`,{method:'DELETE'});if(branch_ids.length)await rest('employee_branches','',{method:'POST',body:JSON.stringify(branch_ids.map(bid=>({employee_id:u.id,branch_id:bid})))});}else{const result=await callFunction('smart-function',{action:'create',name:m.querySelector('#uName').value.trim(),username:m.querySelector('#uEmail').value.trim(),email:m.querySelector('#uEmail').value.trim(),password:m.querySelector('#uPassword').value,role,branch_ids});employeeId=result?.employee_id;if(active===false&&employeeId)await rest('employees',`id=eq.${employeeId}`,{method:'PATCH',body:JSON.stringify({active:false})});}if(employeeId)await savePermissions(employeeId,permissions);m.remove();toast(editing?'تم تعديل المستخدم والصلاحيات':'تم إنشاء المستخدم والصلاحيات');renderUsers()}catch(err){toast(err.message)}};
 };
 $('#newUserBtn').onclick=()=>openForm();$('#page').onclick=async e=>{const eb=e.target.closest('[data-edit-user]');if(eb){const u=rows.find(x=>String(x.id)===eb.dataset.editUser);if(u)openForm(u);return}const tb=e.target.closest('[data-toggle-user]');if(tb){const u=rows.find(x=>String(x.id)===tb.dataset.toggleUser);if(!u)return;if(String(u.auth_user_id)===String(session.user.id)&&u.active!==false)return toast('لا يمكنك إيقاف حسابك الحالي');if(!await uiConfirm(`${u.active===false?'تفعيل':'إيقاف'} ${u.name}؟`))return;try{await rest('employees',`id=eq.${u.id}`,{method:'PATCH',body:JSON.stringify({active:u.active===false})});toast('تم تحديث حالة المستخدم');renderUsers()}catch(err){toast(err.message)}return}const pb=e.target.closest('[data-password-user]');if(pb){const u=rows.find(x=>String(x.id)===pb.dataset.passwordUser);if(!u)return;const password=await uiPrompt(`كلمة المرور الجديدة لـ ${u.name}`);if(password===null)return;if(password.length<6)return toast('كلمة المرور 6 أحرف على الأقل');try{await callFunction('smart-function',{action:'password',employee_id:u.id,password});toast('تم تغيير كلمة المرور')}catch(err){toast(err.message)}return}};
}

