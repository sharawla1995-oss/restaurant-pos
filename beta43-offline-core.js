(function(global){
'use strict';

const VERSION='10.5.4-beta.43';
const LOGIN_STORE_KEY='sharawlaOfflineLoginV2';
const BOOTSTRAP_PREFIX='bootstrap:v2';
const JOB_META_VERSION=2;
let activeUsername='';
let syncBusy=false;
let shiftOpenBusy=false;
let counterShiftScope='';

const base={
  signIn:typeof signIn==='function'?signIn:null,
  logout:typeof logout==='function'?logout:null,
  cacheBootstrap:typeof cacheBootstrap==='function'?cacheBootstrap:null,
  loadOfflineBootstrap:typeof loadOfflineBootstrap==='function'?loadOfflineBootstrap:null,
  saveOfflineSale:typeof saveOfflineSale==='function'?saveOfflineSale:null,
  saveOfflineExpense:typeof saveOfflineExpense==='function'?saveOfflineExpense:null,
  saveOfflineReturn:typeof saveOfflineReturn==='function'?saveOfflineReturn:null,
  saveOfflineShiftOpen:typeof saveOfflineShiftOpen==='function'?saveOfflineShiftOpen:null,
  saveOfflineShiftClose:typeof saveOfflineShiftClose==='function'?saveOfflineShiftClose:null,
  remapQueuedShift:typeof remapQueuedShift==='function'?remapQueuedShift:null,
  renderOrders:typeof renderOrders==='function'?renderOrders:null,
  updateNextBonBadge:typeof updateNextBonBadge==='function'?updateNextBonBadge:null,
  updatePendingSyncBadge:typeof updatePendingSyncBadge==='function'?updatePendingSyncBadge:null,
  syncOfflineQueue:typeof syncOfflineQueue==='function'?syncOfflineQueue:null,
  offlineOrderNo:typeof offlineOrderNo==='function'?offlineOrderNo:null,
  setOfflineOrderNo:typeof setOfflineOrderNo==='function'?setOfflineOrderNo:null
};

function norm(v){return String(v??'').trim().toLowerCase()}
function bytesHex43(bytes){return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function hash43(password,saltHex){
  const salt=new Uint8Array((String(saltHex||'').match(/.{2}/g)||[]).map(x=>parseInt(x,16)));
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(String(password||'')),'PBKDF2',false,['deriveBits']);
  return bytesHex43(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:120000,hash:'SHA-256'},key,256)));
}
function readLoginStore(){try{return JSON.parse(localStorage.getItem(LOGIN_STORE_KEY)||'{}')||{}}catch{return {}}}
function writeLoginStore(v){localStorage.setItem(LOGIN_STORE_KEY,JSON.stringify(v||{}))}
async function businessId43(){try{return String((await loadLicenseState())?.business_id||'')}catch{return ''}}
function loginKey(bid,user){return `${String(bid||'unknown')}|${norm(user)}`}
function bootstrapKey(bid,user){return `${BOOTSTRAP_PREFIX}:${String(bid||'unknown')}:${norm(user)}`}
function currentUserGuess(){return activeUsername||norm(state?.employee?.username||state?.employee?.login||state?.employee?.email||'')}

async function rememberOfflineLogin43(username,password,s){
  const bid=await businessId43();
  const salt=crypto.getRandomValues(new Uint8Array(16)),saltHex=bytesHex43(salt);
  const store=readLoginStore();
  store[loginKey(bid,username)]={
    username:norm(username),business_id:bid,salt:saltHex,
    hash:await hash43(password,saltHex),session:s||null,
    updated_at:new Date().toISOString(),version:VERSION
  };
  writeLoginStore(store);
}

async function usernameSignIn43(username,password){
  username=norm(username);
  if(!username)throw new Error('اكتب اسم المستخدم');
  if(/@|\s/.test(username))throw new Error('اسم المستخدم لا يحتوي على @ أو مسافات');
  activeUsername=username;
  const bid=await businessId43();
  if(navigator.onLine){
    const d=await callFunction('smart-function',{action:'login',username,password:String(password||'')});
    const s=d?.session||d;
    if(!s?.access_token||!s?.user)throw new Error(d?.message||d?.error||'بيانات الدخول غير صحيحة');
    session=s;resumeSession=s;
    localStorage.setItem('sbResumeSession',JSON.stringify(s));
    await rememberOfflineLogin43(username,password,s);
    return s;
  }
  const rec=readLoginStore()[loginKey(bid,username)];
  if(!rec||await hash43(password,rec.salt)!==rec.hash){
    throw new Error('بيانات الدخول غير صحيحة أو لم يتم تسجيل هذا المستخدم Online على هذا الجهاز بعد Beta43');
  }
  if(!rec.session?.access_token)throw new Error('لا توجد جلسة محفوظة للعمل بدون إنترنت لهذا المستخدم');
  session=rec.session;resumeSession=rec.session;
  return session;
}

function installSignIn43(){
  try{signIn=usernameSignIn43}catch{}
  try{global.signIn=usernameSignIn43}catch{}
}

async function cacheBootstrap43(){
  if(base.cacheBootstrap)await base.cacheBootstrap();
  const user=currentUserGuess();if(!user||!state?.employee)return;
  const bid=await businessId43();
  const row={employee:state.employee,homeBranchId:state.homeBranchId,branches:state.branches,categories:state.categories,products:state.products,modifiers:state.modifiers,productModifiers:state.productModifiers,productVariants:state.productVariants,deliveryZones:state.deliveryZones,drivers:state.drivers,branchPrintSettings:state.branchPrintSettings,paymentMethods:state.paymentMethods,branchPaymentMethods:state.branchPaymentMethods,branchFinancialSettings:state.branchFinancialSettings,employeeBranches:state.employeeBranches,userPermissions:state.userPermissions,settings:state.settings,business:state.business,websiteSettings:state.websiteSettings,activeBranchId:state.activeBranchId,username:user,business_id:bid,at:new Date().toISOString(),version:VERSION};
  await odbSet(bootstrapKey(bid,user),row);
}

async function loadOfflineBootstrap43(){
  const user=currentUserGuess();const bid=await businessId43();
  const c=await odbGet(bootstrapKey(bid,user));
  if(!c?.employee)throw new Error('لا توجد بيانات محفوظة للعمل بدون إنترنت لهذا المستخدم. سجّل دخوله Online مرة واحدة بعد Beta43.');
  Object.assign(state,c);applyBusinessBranding();
  $('#who').textContent=`${state.employee.name} • ${state.employee.role}`;
  refreshBranchChrome();applyRoleNavigation();show('appView');showOfflineStatus();
  if(state.activeBranchId)showPage('pos');else renderBranchPicker();
}

async function logout43(){
  clearInterval(websiteOrderWatchTimer);websiteOrderWatchTimer=null;
  try{if(navigator.onLine&&session?.access_token)await req('/auth/v1/logout',{method:'POST'})}catch{}
  session=null;resumeSession=null;localStorage.removeItem('sbResumeSession');
  // Beta43 intentionally preserves per-user offline enrollment + bootstrap.
  state.employee=null;show('loginView');
}

function jobScope43(job){
  const local=job?.local_shift||job?.local_order||job?.local_expense||job?.local_return||{};
  return {
    business_id:String(state?.business?.id||sharawlaRuntimeConfig?.business_id||''),
    branch_id:Number(job?.p_branch_id||job?.p_order?.branch_id||local?.branch_id||currentBranchId()||0),
    employee_id:Number(local?.employee_id||job?.p_order?.employee_id||state?.employee?.id||0),
    meta_version:JOB_META_VERSION
  };
}
async function annotateJob43(clientTx){
  if(!clientTx)return;
  const q=await offlineQueue();let changed=false;
  for(const j of q){if(j.client_tx_id===clientTx){j._scope={...(j._scope||{}),...jobScope43(j)};j._sync={...(j._sync||{}),status:'pending'};changed=true}}
  if(changed){await setOfflineQueue(q);try{const j=q.find(x=>x.client_tx_id===clientTx);if(j&&global.topBurgerDesktop?.operations?.put)await global.topBurgerDesktop.operations.put(j)}catch{}}
}

function counterKey43(){
  const bid=String(state?.business?.id||sharawlaRuntimeConfig?.business_id||'unknown');
  const branch=Number(currentBranchId()||0);
  const shift=String(counterShiftScope||'unscoped');
  return `offlineOrderNo:v2:${bid}:${branch}:${shift}`;
}
function offlineOrderNo43(){return Number(localStorage.getItem(counterKey43())||0)+1}
function setOfflineOrderNo43(n){localStorage.setItem(counterKey43(),String(Number(n||0)))}

async function saveOfflineSale43(orderPayload,itemPayload,payRows,providedClientTx=null){
  if(!base.saveOfflineSale)throw new Error('Offline sale base unavailable');
  counterShiftScope=String(orderPayload?.shift_id||'');
  try{
    const out=await base.saveOfflineSale(orderPayload,itemPayload,payRows,providedClientTx);
    await annotateJob43(out?.client_tx_id||providedClientTx);
    try{await cacheOrderBundle(out?.order,out?.items||[])}catch{}
    return out;
  }finally{counterShiftScope=''}
}

async function saveOfflineExpense43(shift,description,amount,providedClientTx=null){
  const q=await offlineQueue(),clientTx=providedClientTx||uuid(),created=new Date().toISOString();
  const shiftId=shift?.id;
  const local={id:`offline-exp-${clientTx}`,branch_id:currentBranchId(),employee_id:state.employee.id,shift_id:shiftId,description,amount:Number(amount),created_at:created,_offline:true};
  const job={type:'expense',client_tx_id:clientTx,created_at:created,p_shift_id:shiftId,p_description:description,p_amount:Number(amount),local_expense:local,_scope:{business_id:String(state?.business?.id||sharawlaRuntimeConfig?.business_id||''),branch_id:Number(currentBranchId()),employee_id:Number(state.employee.id),meta_version:JOB_META_VERSION},_sync:{status:'pending'}};
  q.push(job);await setOfflineQueue(q);try{if(global.topBurgerDesktop?.operations?.put)await global.topBurgerDesktop.operations.put(job)}catch{}return local;
}

function pendingShiftFor43(q,branch,employee){
  return q.find(j=>j.type==='shift_open'&&Number(j.p_branch_id)===Number(branch)&&Number(j.local_shift?.employee_id||j._scope?.employee_id)===Number(employee));
}
async function saveOfflineShiftOpen43(opening,providedClientTx=null){
  if(shiftOpenBusy)throw new Error('جاري فتح الوردية، انتظر لحظة');
  shiftOpenBusy=true;
  try{
    const q=await offlineQueue(),branch=Number(currentBranchId()),employee=Number(state.employee?.id||0);
    const existing=pendingShiftFor43(q,branch,employee);
    if(existing?.local_shift){await rememberOpenShift(existing.local_shift);return existing.local_shift}
    const cached=await cachedOpenShift();
    if(cached?.status==='open'&&String(cached.id||'').startsWith('offline-shift-'))return cached;
    const clientTx=providedClientTx||uuid(),created=new Date().toISOString(),localId=`offline-shift-${clientTx}`;
    const local={id:localId,branch_id:branch,employee_id:employee,opening_cash:Number(opening||0),status:'open',opened_at:created,_offline:true,client_tx_id:clientTx};
    const job={type:'shift_open',client_tx_id:clientTx,created_at:created,p_branch_id:branch,p_opening_cash:Number(opening||0),local_shift_id:localId,local_shift:local,_scope:{business_id:String(state?.business?.id||sharawlaRuntimeConfig?.business_id||''),branch_id:branch,employee_id:employee,meta_version:JOB_META_VERSION},_sync:{status:'pending'}};
    q.push(job);await setOfflineQueue(q);await rememberOpenShift(local);try{if(global.topBurgerDesktop?.operations?.put)await global.topBurgerDesktop.operations.put(job)}catch{}return local;
  }finally{shiftOpenBusy=false}
}

async function annotateBaseJob43(baseFn,args,result){
  const before=new Set((await offlineQueue()).map(x=>x.client_tx_id));
  const out=await baseFn(...args);
  const after=await offlineQueue();const job=after.find(x=>!before.has(x.client_tx_id));
  if(job)await annotateJob43(job.client_tx_id);
  return out;
}
async function saveOfflineReturn43(...args){return annotateBaseJob43(base.saveOfflineReturn,args)}
async function saveOfflineShiftClose43(...args){return annotateBaseJob43(base.saveOfflineShiftClose,args)}

async function persistQueueAndOps43(q){
  await setOfflineQueue(q);
  if(global.topBurgerDesktop?.operations?.put){for(const j of q){try{await global.topBurgerDesktop.operations.put(j)}catch{}}}
}
async function remapQueuedShift43(localId,serverId){
  let q=await offlineQueue();
  for(const j of q){
    if(String(j.p_shift_id)===String(localId))j.p_shift_id=Number(serverId);
    if(String(j.p_order?.shift_id)===String(localId))j.p_order.shift_id=Number(serverId);
    if(String(j.local_order?.shift_id)===String(localId))j.local_order.shift_id=Number(serverId);
    if(String(j.local_expense?.shift_id)===String(localId))j.local_expense.shift_id=Number(serverId);
    if(String(j.local_return?.shift_id)===String(localId))j.local_return.shift_id=Number(serverId);
    if(String(j.local_shift_id)===String(localId))j._sync={...(j._sync||{}),reconciled_server_shift_id:Number(serverId)};
  }
  await persistQueueAndOps43(q);return q;
}

function isAlreadyOpenShiftError43(e){return /وردية مفتوحة|already.*open.*shift|shift.*already.*open/i.test(String(e?.message||e||''))}
async function currentOpenShift43(job){
  const branch=Number(job.p_branch_id||job.local_shift?.branch_id||0);
  const employee=Number(job.local_shift?.employee_id||job._scope?.employee_id||state.employee?.id||0);
  if(!branch||!employee)return null;
  try{
    const rows=await rest('shifts',`select=*&branch_id=eq.${branch}&employee_id=eq.${employee}&status=eq.open&closed_at=is.null&order=opened_at.desc&limit=2`);
    return Array.isArray(rows)&&rows.length===1?rows[0]:null;
  }catch{return null}
}
function offlineShiftId43(v){return String(v||'').startsWith('offline-shift-')}
function jobDependsOnUnresolvedShift43(job,q){
  const sid=job.type==='sale'?job.p_order?.shift_id:job.p_shift_id;
  if(!offlineShiftId43(sid))return false;
  return q.some(x=>x.type==='shift_open'&&String(x.local_shift_id)===String(sid));
}
async function markJobError43(job,status,e){
  let q=await offlineQueue();const now=new Date().toISOString();
  for(const j of q){if(j.client_tx_id===job.client_tx_id)j._sync={...(j._sync||{}),status,last_error:String(e?.message||e||''),last_attempt_at:now,attempts:Number(j._sync?.attempts||0)+1}}
  await persistQueueAndOps43(q);
  try{if(global.topBurgerDesktop?.operations?.status)await global.topBurgerDesktop.operations.status(job.client_tx_id,'pending',String(e?.message||e||''))}catch{}
}
async function markJobDone43(job){
  let q=(await offlineQueue()).filter(x=>x.client_tx_id!==job.client_tx_id);await setOfflineQueue(q);
  try{if(global.topBurgerDesktop?.operations?.status)await global.topBurgerDesktop.operations.status(job.client_tx_id,'synced',null)}catch{}
}

async function syncOne43(job){
  if(job.type==='shift_open'){
    try{
      const sh=await rpc('open_pos_shift_idempotent',{p_branch_id:job.p_branch_id,p_opening_cash:job.p_opening_cash,p_client_tx_id:job.client_tx_id});
      await remapQueuedShift43(job.local_shift_id,sh.id);await rememberOpenShift(sh);await markJobDone43(job);return 'done';
    }catch(e){
      if(isAlreadyOpenShiftError43(e)){
        const sh=await currentOpenShift43(job);
        if(sh?.id){await remapQueuedShift43(job.local_shift_id,sh.id);await rememberOpenShift(sh);await markJobDone43(job);return 'reconciled'}
      }
      throw e;
    }
  }
  const q=await offlineQueue();
  if(jobDependsOnUnresolvedShift43(job,q))return 'blocked';
  if(job.type==='sale')await rpc(job.engine==='retail'?'create_retail_pos_order_atomic':'create_pos_order_atomic',{p_order:job.p_order,p_items:job.p_items,p_payments:job.p_payments});
  else if(job.type==='expense')await rpc('create_pos_expense_idempotent',{p_shift_id:Number(job.p_shift_id),p_description:job.p_description,p_amount:job.p_amount,p_client_tx_id:job.client_tx_id});
  else if(job.type==='return')await rpc(job.engine==='retail'?'create_retail_order_return_idempotent':'create_order_return_idempotent',{p_order_id:job.p_order_id,p_reason:job.p_reason,p_notes:job.p_notes,p_items:job.p_items,p_payments:job.p_payments,p_client_tx_id:job.client_tx_id});
  else if(job.type==='shift_close')await rpc('close_pos_shift_idempotent',{p_shift_id:Number(job.p_shift_id),p_closing_cash:job.p_closing_cash,p_metrics:job.p_metrics,p_client_tx_id:job.client_tx_id});
  else throw new Error(`نوع حركة Offline غير معروف: ${job.type}`);
  await markJobDone43(job);return 'done';
}

async function syncOfflineQueue43(){
  if(syncBusy||!navigator.onLine||!session?.access_token)return;
  syncBusy=true;let done=0,reconciled=0,failed=0,blocked=0;
  try{
    try{await refreshSessionIfNeeded()}catch(e){console.warn('Beta43 session refresh before sync',e);return}
    const snapshot=[...(await offlineQueue())];if(!snapshot.length)return;
    // Parents first, then dependent operations. Stable order within each group.
    snapshot.sort((a,b)=>Number(a.type!=='shift_open')-Number(b.type!=='shift_open')||String(a.created_at||'').localeCompare(String(b.created_at||'')));
    for(const job of snapshot){
      if(!(await offlineQueue()).some(x=>x.client_tx_id===job.client_tx_id))continue;
      try{
        const r=await syncOne43(job);
        if(r==='done')done++;else if(r==='reconciled')reconciled++;else if(r==='blocked'){blocked++;await markJobError43(job,'blocked',new Error('الحركة تنتظر مزامنة الوردية المرتبطة بها'))}
      }catch(e){failed++;await markJobError43(job,'failed',e);console.warn('Beta43 sync job failed; continuing independent jobs',job.type,job.client_tx_id,e)}
    }
    await refreshPendingSyncBadge();
    if(done||reconciled)toast(`مزامنة Offline: ${done} تمت${reconciled?` • ${reconciled} تمت تسويتها`:''}${failed?` • ${failed} تحتاج مراجعة`:''}${blocked?` • ${blocked} معلقة`:''}`);
  }finally{syncBusy=false}
}

function syncLabel43(job){
  const s=job?._sync?.status||'pending';
  return s==='failed'?'فشل':s==='blocked'?'محجوبة':'في انتظار المزامنة';
}
function typeLabel43(t){return ({shift_open:'فتح وردية',shift_close:'قفل وردية',sale:'بيع',expense:'مصروف',return:'مرتجع'}[t]||t||'-')}
async function openPendingSyncCenter43(){
  const q=await offlineQueue();const m=document.createElement('div');m.className='modal';
  const rows=q.map(j=>`<tr><td>${esc(typeLabel43(j.type))}</td><td>${esc(syncLabel43(j))}</td><td>${esc(fmtDate(j.created_at))}</td><td dir="ltr"><small>${esc(String(j.client_tx_id||'').slice(0,12))}</small></td><td>${esc(j._sync?.last_error||'—')}</td></tr>`).join('');
  m.innerHTML=`<div class="modal-card" style="max-width:920px"><div class="section-head"><div><h2>⟳ الحركات المعلقة</h2><p class="muted">لا يتم حذف أي حركة تلقائيًا. الأخطاء المعزولة لا توقف الحركات المستقلة.</p></div></div><div class="table-wrap"><table><thead><tr><th>النوع</th><th>الحالة</th><th>الوقت</th><th>TX</th><th>آخر خطأ</th></tr></thead><tbody>${rows||'<tr><td colspan="5">لا توجد حركات معلقة</td></tr>'}</tbody></table></div><div class="modal-actions"><button class="secondary" data-close>إغلاق</button><button class="primary" data-retry ${q.length?'':'disabled'}>إعادة المحاولة</button></div></div>`;
  document.body.appendChild(m);m.onclick=async e=>{if(e.target===m||e.target.closest('[data-close]'))return m.remove();if(e.target.closest('[data-retry]')){e.target.closest('[data-retry]').disabled=true;await syncOfflineQueue43();m.remove();openPendingSyncCenter43()}};
}
function updatePendingSyncBadge43(n){
  let el=document.getElementById('pendingSyncBadge');if(!el){el=document.createElement('button');el.type='button';el.id='pendingSyncBadge';el.className='pending-sync-badge';document.body.appendChild(el)}
  const c=Number(n||0);el.textContent=c?`⟳ ${c} معلّقة`:'✓ متزامن';el.title=c?`${c} حركة في انتظار المزامنة — اضغط للتفاصيل`:'كل الحركات متزامنة';
  el.classList.toggle('has-pending',c>0);el.classList.toggle('all-synced',c===0);el.classList.toggle('is-hidden',c===0);
  el.onclick=c?()=>openPendingSyncCenter43():null;
  if(c===0){clearTimeout(el._hideTimer);el._hideTimer=setTimeout(()=>el.classList.add('is-hidden'),900)}else el.classList.remove('is-hidden');
}

async function renderOrders43(){
  let remote=[];
  try{
    remote=await rest('orders',`select=*&branch_id=eq.${currentBranchId()}&order=created_at.desc&limit=200`);
    const bundles=await cachedOrderBundles();for(const o of remote){const old=bundles.find(x=>String(x.order?.id)===String(o.id));await cacheOrderBundle(o,old?.items||[])}
  }catch(e){if(!isNetError(e))throw e;remote=(await cachedOrderBundles()).map(x=>x.order).filter(o=>Number(o.branch_id)===currentBranchId())}
  const q=await offlineQueue();
  const pending=q.filter(x=>x.type==='sale'&&Number(x.local_order?.branch_id)===currentBranchId()).map(x=>({...x.local_order,_sync_state:syncLabel43(x)}));
  for(const j of q.filter(x=>x.type==='sale'))try{await cacheOrderBundle(j.local_order,j.local_items||[])}catch{}
  const remoteTx=new Set(remote.map(x=>String(x.client_tx_id||'')).filter(Boolean));
  const rows=[...pending.filter(x=>!remoteTx.has(String(x.client_tx_id||''))),...remote].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
  $('#page').innerHTML=`<div class="panel"><h2>آخر الطلبات</h2><div class="table-wrap"><table><thead><tr><th>رقم الفاتورة</th><th>رقم البون</th><th>التاريخ</th><th>الفرع</th><th>العميل</th><th>النوع</th><th>الدفع</th><th>الحالة</th><th>الإجمالي</th><th></th></tr></thead><tbody>${rows.map(o=>`<tr><td>${esc(invoiceDisplay(o))}</td><td>${esc(bonDisplay(o))}</td><td>${fmtDate(o.created_at)}</td><td>${branchName(o.branch_id)}</td><td>${esc(o.customer_name||o.customer_phone||'-')}</td><td>${orderTypeLabel(o.order_type)}</td><td>${paymentLabel(o.payment_method)}</td><td><span class="tag">${esc(o._sync_state||statusLabel(o.status))}</span></td><td>${money(o.total)}</td><td><button class="secondary" data-order="${o.id}">تفاصيل</button></td></tr>`).join('')||'<tr><td colspan="10">لا توجد طلبات</td></tr>'}</tbody></table></div></div>`;
  $('#page').onclick=e=>{const b=e.target.closest('[data-order]');if(b)openOrderDetails(b.dataset.order)};
}

async function updateNextBonBadge43(){
  const el=$('#nextBonBadge');if(!el)return;
  try{
    const sh=await getOpenShift();if(!sh){el.innerHTML='<span>رقم البون التالي</span><b>—</b><small>افتح وردية</small>';return}
    if(!navigator.onLine||offlineShiftId43(sh.id)){
      counterShiftScope=String(sh.id||'');const next=offlineOrderNo43();counterShiftScope='';
      el.innerHTML=`<span>رقم البون التالي</span><b>OFF-${next}</b><small>أوفلاين</small>`;return;
    }
    return base.updateNextBonBadge?base.updateNextBonBadge():undefined;
  }catch{el.innerHTML='<span>رقم البون التالي</span><b>—</b>'}
}

function friendlyOfflineFetch43(){
  global.addEventListener('unhandledrejection',e=>{if(!navigator.onLine&&/failed to fetch|networkerror|load failed/i.test(String(e?.reason?.message||e?.reason||''))){try{toast('هذه الصفحة تحتاج اتصالًا بالإنترنت لإكمال تحميل البيانات')}catch{} }});
}

function install43(){
  try{cacheBootstrap=cacheBootstrap43}catch{};try{global.cacheBootstrap=cacheBootstrap43}catch{};
  try{loadOfflineBootstrap=loadOfflineBootstrap43}catch{};try{global.loadOfflineBootstrap=loadOfflineBootstrap43}catch{};
  try{logout=logout43}catch{};try{global.logout=logout43}catch{};
  try{saveOfflineSale=saveOfflineSale43}catch{};try{global.saveOfflineSale=saveOfflineSale43}catch{};
  try{saveOfflineExpense=saveOfflineExpense43}catch{};try{global.saveOfflineExpense=saveOfflineExpense43}catch{};
  try{saveOfflineShiftOpen=saveOfflineShiftOpen43}catch{};try{global.saveOfflineShiftOpen=saveOfflineShiftOpen43}catch{};
  if(base.saveOfflineReturn){try{saveOfflineReturn=saveOfflineReturn43}catch{};try{global.saveOfflineReturn=saveOfflineReturn43}catch{}}
  if(base.saveOfflineShiftClose){try{saveOfflineShiftClose=saveOfflineShiftClose43}catch{};try{global.saveOfflineShiftClose=saveOfflineShiftClose43}catch{}}
  try{remapQueuedShift=remapQueuedShift43}catch{};try{global.remapQueuedShift=remapQueuedShift43}catch{};
  try{syncOfflineQueue=syncOfflineQueue43}catch{};try{global.syncOfflineQueue=syncOfflineQueue43}catch{};
  try{renderOrders=renderOrders43}catch{};try{global.renderOrders=renderOrders43}catch{};
  try{updateNextBonBadge=updateNextBonBadge43}catch{};try{global.updateNextBonBadge=updateNextBonBadge43}catch{};
  try{updatePendingSyncBadge=updatePendingSyncBadge43}catch{};try{global.updatePendingSyncBadge=updatePendingSyncBadge43}catch{};
  try{offlineOrderNo=offlineOrderNo43}catch{};try{global.offlineOrderNo=offlineOrderNo43}catch{};
  try{setOfflineOrderNo=setOfflineOrderNo43}catch{};try{global.setOfflineOrderNo=setOfflineOrderNo43}catch{};
  installSignIn43();friendlyOfflineFetch43();
  const obs=new MutationObserver(()=>installSignIn43());obs.observe(document.body,{childList:true,subtree:true});
  global.__SharawlaBeta43OfflineCore=Object.freeze({version:VERSION,offlineLoginV2:true,perUserBootstrap:true,syncLock:true,dependencyAwareSync:true,shiftReconcile:true,pendingCenter:true,ordersMerge:true,scopedBonCounter:true});
  setTimeout(()=>refreshPendingSyncBadge().catch(()=>{}),500);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install43,{once:true});else install43();
})(window);
