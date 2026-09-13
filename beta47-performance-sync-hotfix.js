(function(global){
'use strict';
const VERSION='10.5.4-beta.47';
let syncBusy47=false;
const text=v=>String(v??'').trim();
const permanentError=e=>/المخزون غير كاف|insufficient stock|negative stock|stock.*insufficient|inventory.*insufficient|oversell|لا يمكن.*المخزون/i.test(text(e?.message||e));
function session47(){try{return session}catch{return global.session||null}}
function state47(){try{return state}catch{return global.state||null}}
async function rpc47(name,payload){if(typeof global.rpc==='function')return await global.rpc(name,payload);return await rpc(name,payload)}
async function rest47(table,query){if(typeof global.rest==='function')return await global.rest(table,query);return await rest(table,query)}
async function refreshSession47(){try{if(typeof refreshSessionIfNeeded==='function')return await refreshSessionIfNeeded()}catch{}if(typeof global.refreshSessionIfNeeded==='function')return await global.refreshSessionIfNeeded()}
async function rememberOpenShift47(sh){try{if(typeof rememberOpenShift==='function')return await rememberOpenShift(sh)}catch{}if(typeof global.rememberOpenShift==='function')return await global.rememberOpenShift(sh)}
async function refreshBadge47(){try{if(typeof refreshPendingSyncBadge==='function')return await refreshPendingSyncBadge()}catch{}if(typeof global.refreshPendingSyncBadge==='function')return await global.refreshPendingSyncBadge()}
async function getQueue47(){if(typeof global.offlineQueue==='function')return await global.offlineQueue();return await offlineQueue()}
async function setQueue47(q){if(typeof global.setOfflineQueue==='function')return await global.setOfflineQueue(q);return await setOfflineQueue(q)}
async function persistQueue47(q){await setQueue47(q);if(global.topBurgerDesktop?.operations?.put){for(const j of q){try{await global.topBurgerDesktop.operations.put(j)}catch{}}}}
async function mark47(job,status,e){
  const q=await getQueue47(),now=new Date().toISOString(),msg=text(e?.message||e);
  for(const j of q){if(j.client_tx_id===job.client_tx_id)j._sync={...(j._sync||{}),status,last_error:msg,last_attempt_at:now,attempts:Number(j._sync?.attempts||0)+1}}
  await persistQueue47(q);
  try{if(global.topBurgerDesktop?.operations?.status)await global.topBurgerDesktop.operations.status(job.client_tx_id,status==='conflict'?'conflict':'pending',msg)}catch{}
}
async function markDone47(job){const q=(await getQueue47()).filter(x=>x.client_tx_id!==job.client_tx_id);await setQueue47(q);try{if(global.topBurgerDesktop?.operations?.status)await global.topBurgerDesktop.operations.status(job.client_tx_id,'synced',null)}catch{}}
function offlineShiftId47(v){return String(v||'').startsWith('offline-shift-')}
function dependsOnShift47(job,q){const sid=job.type==='sale'?job.p_order?.shift_id:job.p_shift_id;if(!offlineShiftId47(sid))return false;return q.some(x=>x.type==='shift_open'&&String(x.local_shift_id)===String(sid))}
function alreadyOpen47(e){return /وردية مفتوحة|already.*open.*shift|shift.*already.*open/i.test(text(e?.message||e))}
async function currentOpenShift47(job){
  const st=state47(),branch=Number(job.p_branch_id||job.local_shift?.branch_id||0),employee=Number(job.local_shift?.employee_id||job._scope?.employee_id||st?.employee?.id||0);if(!branch||!employee)return null;
  try{const rows=await rest47('shifts',`select=*&branch_id=eq.${branch}&employee_id=eq.${employee}&status=eq.open&closed_at=is.null&order=opened_at.desc&limit=2`);return Array.isArray(rows)&&rows.length===1?rows[0]:null}catch{return null}
}
async function remapShift47(localId,serverId){
  const q=await getQueue47();
  for(const j of q){
    if(String(j.p_shift_id)===String(localId))j.p_shift_id=Number(serverId);
    if(String(j.p_order?.shift_id)===String(localId))j.p_order.shift_id=Number(serverId);
    if(String(j.local_order?.shift_id)===String(localId))j.local_order.shift_id=Number(serverId);
    if(String(j.local_expense?.shift_id)===String(localId))j.local_expense.shift_id=Number(serverId);
    if(String(j.local_return?.shift_id)===String(localId))j.local_return.shift_id=Number(serverId);
    if(String(j.local_shift_id)===String(localId))j._sync={...(j._sync||{}),reconciled_server_shift_id:Number(serverId)};
  }
  await persistQueue47(q);return q;
}
async function syncOne47(job){
  if(job.type==='shift_open'){
    try{const sh=await rpc47('open_pos_shift_idempotent',{p_branch_id:job.p_branch_id,p_opening_cash:job.p_opening_cash,p_client_tx_id:job.client_tx_id});await remapShift47(job.local_shift_id,sh.id);await rememberOpenShift47(sh);await markDone47(job);return 'done'}
    catch(e){if(alreadyOpen47(e)){const sh=await currentOpenShift47(job);if(sh?.id){await remapShift47(job.local_shift_id,sh.id);await rememberOpenShift47(sh);await markDone47(job);return 'reconciled'}}throw e}
  }
  const q=await getQueue47();if(dependsOnShift47(job,q))return 'blocked';
  if(job.type==='sale')await rpc47(job.engine==='retail'?'create_retail_pos_order_atomic':'create_pos_order_atomic',{p_order:job.p_order,p_items:job.p_items,p_payments:job.p_payments});
  else if(job.type==='expense')await rpc47('create_pos_expense_idempotent',{p_shift_id:Number(job.p_shift_id),p_description:job.p_description,p_amount:job.p_amount,p_client_tx_id:job.client_tx_id});
  else if(job.type==='return')await rpc47(job.engine==='retail'?'create_retail_order_return_idempotent':'create_order_return_idempotent',{p_order_id:job.p_order_id,p_reason:job.p_reason,p_notes:job.p_notes,p_items:job.p_items,p_payments:job.p_payments,p_client_tx_id:job.client_tx_id});
  else if(job.type==='shift_close')await rpc47('close_pos_shift_idempotent',{p_shift_id:Number(job.p_shift_id),p_closing_cash:job.p_closing_cash,p_metrics:job.p_metrics,p_client_tx_id:job.client_tx_id});
  else throw new Error(`نوع حركة Offline غير معروف: ${job.type}`);
  await markDone47(job);return 'done';
}
async function classifyExisting47(){
  const q=await getQueue47();let changed=false;
  for(const j of q){if(j?._sync?.status!=='conflict'&&permanentError(j?._sync?.last_error)){j._sync={...(j._sync||{}),status:'conflict',conflict_reason:'permanent_business_rule',classified_at:new Date().toISOString()};changed=true;try{if(global.topBurgerDesktop?.operations?.status)await global.topBurgerDesktop.operations.status(j.client_tx_id,'conflict',j._sync.last_error||'permanent business rule')}catch{}}}
  if(changed)await persistQueue47(q);return {changed,conflicts:q.filter(x=>x?._sync?.status==='conflict').length,total:q.length};
}
async function syncOfflineQueue47(){
  if(syncBusy47||!navigator.onLine||!session47()?.access_token)return;
  syncBusy47=true;let done=0,reconciled=0,failed=0,blocked=0,conflicts=0;
  try{
    try{await refreshSession47()}catch(e){console.warn('Beta47 session refresh before sync',e);return}
    await classifyExisting47();
    const snapshot=[...(await getQueue47())];if(!snapshot.length)return;
    snapshot.sort((a,b)=>Number(a.type!=='shift_open')-Number(b.type!=='shift_open')||String(a.created_at||'').localeCompare(String(b.created_at||'')));
    for(const job of snapshot){
      const current=(await getQueue47()).find(x=>x.client_tx_id===job.client_tx_id);if(!current)continue;
      if(current?._sync?.status==='conflict'){conflicts++;continue}
      try{const r=await syncOne47(current);if(r==='done')done++;else if(r==='reconciled')reconciled++;else if(r==='blocked'){blocked++;await mark47(current,'blocked',new Error('الحركة تنتظر مزامنة الوردية المرتبطة بها'))}}
      catch(e){if(permanentError(e)){conflicts++;await mark47(current,'conflict',e);console.warn('Beta47 permanent sync conflict; auto-retry disabled',current.type,current.client_tx_id,text(e?.message||e))}else{failed++;await mark47(current,'failed',e);console.warn('Beta47 retryable sync failure',current.type,current.client_tx_id,e)}}
    }
    try{await refreshBadge47()}catch{}
    if(done||reconciled)try{global.toast?.(`مزامنة Offline: ${done} تمت${reconciled?` • ${reconciled} تمت تسويتها`:''}${failed?` • ${failed} لإعادة المحاولة`:''}${blocked?` • ${blocked} معلقة`:''}${conflicts?` • ${conflicts} تعارض`:''}`)}catch{}
  }finally{syncBusy47=false}
}
function install47(){
  try{syncOfflineQueue=syncOfflineQueue47}catch{}
  try{global.syncOfflineQueue=syncOfflineQueue47}catch{}
  global.__SharawlaBeta47PerformanceSyncHotfix=Object.freeze({version:VERSION,permanentConflictClassifier:true,autoRetryPermanentConflicts:false,classifyExisting:classifyExisting47,syncNow:syncOfflineQueue47});
  setTimeout(()=>classifyExisting47().catch(()=>{}),1000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install47,{once:true});else install47();
})(window);
