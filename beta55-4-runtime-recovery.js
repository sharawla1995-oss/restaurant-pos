(function(global){
'use strict';

// Beta55.4 — SH-0007 regression recovery layer.
// Scope: offline read fallbacks, open-shift continuity, reconnect reconciliation,
// and offline bon sequencing. Authentication/fingerprint/licensing are untouched.
const VERSION='10.5.4-beta.55.4';
const CACHE_PREFIX='sharawla55.4:read:';
const BON_PREFIX='sharawla55.4:bon:';
let installed=false;
let syncBusy=false;
let lastReconnectNotice=0;

const text=v=>String(v??'').trim();
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
function appState(){try{return state}catch{return null}}
function appSession(){try{return session}catch{return null}}
function branchId(){try{return Number(typeof currentBranchId==='function'?currentBranchId():appState()?.activeBranchId||0)}catch{return 0}}
function employeeId(){return Number(appState()?.employee?.id||0)}
function onlineAuthorized(){return navigator.onLine===true&&!!appSession()?.access_token}
function netError(e){try{return typeof isNetError==='function'?isNetError(e):/failed to fetch|networkerror|load failed/i.test(text(e?.message||e))}catch{return /failed to fetch|networkerror|load failed/i.test(text(e?.message||e))}}
function toast55(m){try{if(typeof toast==='function')return toast(m)}catch{}try{return global.toast?.(m)}catch{}}
function hash(s){let h=2166136261;for(const ch of String(s||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return (h>>>0).toString(36)}
function readKey(table,query){return `${CACHE_PREFIX}${table}:${hash(query)}`}
async function dbGet(k){try{if(typeof odbGet==='function')return await odbGet(k)}catch{}try{return await global.odbGet?.(k)}catch{return null}}
async function dbSet(k,v){try{if(typeof odbSet==='function')return await odbSet(k,v)}catch{}try{return await global.odbSet?.(k)}catch{return v}}
async function getQueue(){try{if(typeof offlineQueue==='function')return (await offlineQueue())||[]}catch{}try{return (await global.offlineQueue?.())||[]}catch{return[]}}
async function setQueue(q){try{if(typeof setOfflineQueue==='function')return await setOfflineQueue(q)}catch{}if(global.setOfflineQueue)return await global.setOfflineQueue(q);return q}
async function rememberShift(sh){if(!sh)return sh;try{if(typeof rememberOpenShift==='function')return await rememberOpenShift(sh)}catch{}try{return await global.rememberOpenShift?.(sh)}catch{return sh}}
async function cachedShift(){try{if(typeof cachedOpenShift==='function')return await cachedOpenShift()}catch{}try{return await global.cachedOpenShift?.()}catch{return null}}
async function ownership55(job){const gate=global.SharawlaOfflineOwnership;if(!gate?.resolve)return {owner:'UNKNOWN',reason:'OWNERSHIP_GATE_UNAVAILABLE'};try{return await gate.resolve(job)}catch(e){return {owner:'UNKNOWN',reason:'OWNERSHIP_RESOLUTION_FAILED',error:text(e?.message||e)}}}
function legacyMayOperate55(owner){const gate=global.SharawlaOfflineOwnership;return gate?.legacyMayOperate?gate.legacyMayOperate(owner):false}

function parseEq(query,key){const m=String(query||'').match(new RegExp(`(?:^|&)${key}=eq\\.([^&]+)`));if(!m)return null;try{return decodeURIComponent(m[1])}catch{return m[1]}}
function parseIn(query,key){const m=String(query||'').match(new RegExp(`(?:^|&)${key}=in\\.\\(([^)]*)\\)`));return m?m[1].split(',').map(x=>text(x)).filter(Boolean):null}
function parseBound(query,key,op){const m=String(query||'').match(new RegExp(`(?:^|&)${key}=${op}\\.([^&]+)`));if(!m)return null;try{return decodeURIComponent(m[1])}catch{return m[1]}}
function applyQuery(rows,query){
 let out=Array.isArray(rows)?rows.slice():[];
 const keys=['id','branch_id','employee_id','shift_id','order_id','return_id','customer_id','driver_id','product_id','status','order_type','active','auth_user_id'];
 for(const k of keys){const v=parseEq(query,k);if(v!==null)out=out.filter(r=>String(r?.[k])===String(v));const vals=parseIn(query,k);if(vals)out=out.filter(r=>vals.includes(String(r?.[k])))}
 for(const k of ['created_at','opened_at']){const g=parseBound(query,k,'gte'),l=parseBound(query,k,'lte');if(g)out=out.filter(r=>new Date(r?.[k]||0)>=new Date(g));if(l)out=out.filter(r=>new Date(r?.[k]||0)<=new Date(l))}
 const lim=Number(String(query||'').match(/(?:^|&)limit=(\d+)/)?.[1]||0);if(lim>0)out=out.slice(0,lim);
 return out;
}

async function baselineRows(table,query){
 const st=appState()||{};let rows=null;
 if(table==='products')rows=st.products||[];else if(table==='categories')rows=st.categories||[];else if(table==='branch_products')rows=st.branchProducts||[];else if(table==='modifiers')rows=st.modifiers||[];else if(table==='product_modifiers')rows=st.productModifiers||[];else if(table==='product_variants')rows=st.productVariants||[];else if(table==='delivery_zones')rows=st.deliveryZones||[];else if(table==='delivery_drivers')rows=st.drivers||[];else if(table==='branches')rows=st.branches||[];else if(table==='branch_print_settings')rows=st.branchPrintSettings||[];else if(table==='payment_methods')rows=st.paymentMethods||[];else if(table==='branch_payment_methods')rows=st.branchPaymentMethods||[];else if(table==='branch_financial_settings')rows=st.branchFinancialSettings||[];else if(table==='employee_branches')rows=(st.employeeBranches||[]).map(x=>({employee_id:employeeId(),...x}));else if(table==='employee_permissions')rows=(st.userPermissions||[]).map(x=>({employee_id:employeeId(),...x}));else if(table==='employees')rows=st.employee?[st.employee]:[];else if(table==='business_settings')rows=st.business?[st.business]:[];else if(table==='website_settings')rows=st.websiteSettings?[st.websiteSettings]:[];else if(table==='app_settings')rows=Object.entries(st.settings||{}).map(([key,value])=>({key,value:String(value)}));
 else if(table==='orders'){const bundles=await dbGet('cachedOrders')||[];rows=bundles.map(x=>x.order).filter(Boolean);const q=await getQueue();rows=[...q.filter(x=>x.type==='sale'&&x.local_order).map(x=>x.local_order),...rows]}
 else if(table==='order_items'){const bundles=await dbGet('cachedOrders')||[];rows=bundles.flatMap(x=>x.items||[]);const q=await getQueue();rows=[...q.filter(x=>x.type==='sale').flatMap(x=>x.local_items||[]),...rows]}
 else if(table==='order_payments'){const q=await getQueue();rows=q.filter(x=>x.type==='sale').flatMap(x=>(x.p_payments||[]).map(p=>({...p,order_id:x.local_order?.id||null})))}
 else if(table==='expenses'){rows=[];const q=await getQueue();rows.push(...q.filter(x=>x.type==='expense'&&x.local_expense).map(x=>x.local_expense))}
 else if(table==='shifts'){rows=(await dbGet(`shiftHistory:${branchId()}`))||[];const c=await cachedShift();if(c&&!rows.some(x=>String(x.id)===String(c.id)))rows.unshift(c);const q=await getQueue();for(const j of q.filter(x=>x.type==='shift_open'&&x.local_shift)){if(!rows.some(r=>String(r.id)===String(j.local_shift.id)))rows.unshift(j.local_shift)}}
 else if(table==='returns'){rows=(await dbGet(`cachedReturns:${branchId()}`))||[];const q=await getQueue();rows=[...q.filter(x=>x.type==='return'&&x.local_return).map(x=>x.local_return),...rows]}
 else if(table==='return_items'){const q=await getQueue();rows=q.filter(x=>x.type==='return').flatMap(x=>x.local_items||[])}
 else if(table==='return_payments'){const q=await getQueue();rows=q.filter(x=>x.type==='return').flatMap(x=>x.local_payments||[])}
 else if(['driver_settlements','website_orders','website_order_items','website_order_item_modifiers','shift_bon_counters'].includes(table))rows=[];
 if(rows===null)return null;return applyQuery(clone(rows),query);
}

let baseRest=null;
async function restRecovery(table,query='',opt={}){const method=String(opt?.method||'GET').toUpperCase();if(method!=='GET'){if(!navigator.onLine)throw new Error('العملية دي تحتاج إنترنت. البيانات الحالية محفوظة ومش هتتمسح.');return baseRest(table,query,opt)}if(onlineAuthorized()){try{const rows=await baseRest(table,query,opt);await dbSet(readKey(table,query),rows);return rows}catch(e){if(!netError(e))throw e}}const exact=await dbGet(readKey(table,query));if(Array.isArray(exact))return clone(exact);const local=await baselineRows(table,query);if(local!==null)return local;if(navigator.onLine)return baseRest(table,query,opt);throw new Error('البيانات دي مش محفوظة على الجهاز للعمل بدون إنترنت.')}
async function pendingLocalShift(){const q=await getQueue(),bid=branchId(),eid=employeeId();return q.filter(x=>x.type==='shift_open'&&x.local_shift&&Number(x.local_shift.branch_id)===bid&&Number(x.local_shift.employee_id)===eid).map(x=>x.local_shift).sort((a,b)=>new Date(b.opened_at||0)-new Date(a.opened_at||0))[0]||null}
let baseGetOpenShift=null;
async function getOpenShiftRecovery(employee=employeeId(),branch=branchId()){if(!onlineAuthorized())return (await cachedShift())||(await pendingLocalShift())||null;try{const sh=await baseGetOpenShift(employee,branch);if(sh)await rememberShift(sh);return sh}catch(e){if(netError(e))return (await cachedShift())||(await pendingLocalShift())||null;throw e}}

async function remapQueuedShift(q,localId,serverId){
 for(const j of q){const own=await ownership55(j);if(!legacyMayOperate55(own.owner))continue;if(String(j.p_shift_id)===String(localId))j.p_shift_id=Number(serverId);if(String(j.p_order?.shift_id)===String(localId))j.p_order.shift_id=Number(serverId);if(String(j.local_order?.shift_id)===String(localId))j.local_order.shift_id=Number(serverId);if(String(j.local_expense?.shift_id)===String(localId))j.local_expense.shift_id=Number(serverId);if(String(j.local_return?.shift_id)===String(localId))j.local_return.shift_id=Number(serverId)}
}
async function reconcileOpenShiftBeforeSync(){
 if(!onlineAuthorized()||!branchId()||!employeeId())return {ok:false,reason:'NO_ONLINE_SESSION'};
 let rows=[];try{rows=await baseRest('shifts',`select=*&branch_id=eq.${branchId()}&employee_id=eq.${employeeId()}&status=eq.open&closed_at=is.null&order=opened_at.desc&limit=2`)}catch(e){return {ok:false,reason:text(e?.message||e)}}
 if(!Array.isArray(rows)||rows.length!==1)return {ok:false,reason:rows.length>1?'MULTIPLE_OPEN_SHIFTS':'NO_SERVER_OPEN_SHIFT'};
 const server=rows[0];await rememberShift(server);await dbSet(`shiftHistory:${branchId()}`,[server,...((await dbGet(`shiftHistory:${branchId()}`))||[]).filter(x=>String(x.id)!==String(server.id))]);
 let q=await getQueue(),redundant=[];for(const j of q){if(j.type!=='shift_open'||Number(j.local_shift?.branch_id||j.p_branch_id||0)!==branchId()||Number(j.local_shift?.employee_id||j._scope?.employee_id||employeeId())!==employeeId())continue;const own=await ownership55(j);if(legacyMayOperate55(own.owner))redundant.push(j);else if(own.owner==='UNKNOWN')console.error('Offline ownership unresolved; recovery reconciliation fail-closed',j.client_tx_id,own.reason)}
 if(!redundant.length)return {ok:true,reconciled:0,server_shift_id:server.id};
 for(const j of redundant)await remapQueuedShift(q,j.local_shift_id,server.id);
 const ids=new Set(redundant.map(j=>String(j.client_tx_id)));q=q.filter(j=>!ids.has(String(j.client_tx_id)));await setQueue(q);
 for(const j of redundant){try{await global.topBurgerDesktop?.operations?.status?.(j.client_tx_id,'synced','Reconciled with existing server open shift')}catch{}}
 return {ok:true,reconciled:redundant.length,server_shift_id:server.id};
}

let baseSync=null;
async function syncRecovery(){if(syncBusy)return;if(!navigator.onLine)return;if(!appSession()?.access_token){const now=Date.now();if(now-lastReconnectNotice>15000){lastReconnectNotice=now;toast55('رجع الإنترنت — سجل دخول Online مرة واحدة علشان نزامن الحركات المحفوظة.')}return}syncBusy=true;try{const r=await reconcileOpenShiftBeforeSync();if(r?.reconciled)toast55(`تم ربط ${r.reconciled} محاولة وردية بالوردية المفتوحة #${r.server_shift_id}`);return await baseSync()}finally{syncBusy=false}}

function runtimeBusiness(){try{return text(sharawlaRuntimeConfig?.business_id)}catch{return ''}}
function bonKey(shiftId){return `${BON_PREFIX}${runtimeBusiness()||'business'}:${branchId()}:${text(shiftId)||'shift'}`}
async function numericBonFloor(shiftId){let max=Number(localStorage.getItem(bonKey(shiftId))||0);const q=await getQueue();for(const j of q.filter(x=>x.type==='sale'&&String(x.p_order?.shift_id||x.local_order?.shift_id)===String(shiftId))){const m=String(j.local_order?.bon_number||'').match(/^OFF-(\d+)$/);if(m)max=Math.max(max,Number(m[1]||0))}return max}
async function nextOfflineBon(shiftId,commit=false){const floor=await numericBonFloor(shiftId),n=floor+1;if(commit)localStorage.setItem(bonKey(shiftId),String(n));return n}
let baseSaveOfflineSale=null;
async function saveOfflineSaleRecovery(orderPayload,itemPayload,payRows,providedClientTx=null){
 const wasOffline=!navigator.onLine;const out=await baseSaveOfflineSale(orderPayload,itemPayload,payRows,providedClientTx);if(!wasOffline||!out?.order)return out;
 const sid=orderPayload?.shift_id||out.order.shift_id;const n=await nextOfflineBon(sid,true);out.order.invoice_number=`OFF-${n}`;out.order.bon_number=`OFF-${n}`;
 try{const q=await getQueue();const j=q.find(x=>String(x.client_tx_id)===String(out.client_tx_id||providedClientTx));if(j?.local_order){const own=await ownership55(j);if(legacyMayOperate55(own.owner)){j.local_order.invoice_number=`OFF-${n}`;j.local_order.bon_number=`OFF-${n}`;await setQueue(q);try{await global.topBurgerDesktop?.operations?.put?.(j)}catch{}}else if(own.owner==='UNKNOWN')console.error('Offline ownership unresolved; legacy sale recovery mutation fail-closed',j.client_tx_id,own.reason)}}catch{}
 return out;
}
let baseUpdateNextBon=null;
async function updateNextBonRecovery(){if(onlineAuthorized())return baseUpdateNextBon();const el=document.querySelector('#nextBonBadge');if(!el)return;const sh=(await cachedShift())||(await pendingLocalShift());if(!sh){el.innerHTML='<span>رقم البون التالي</span><b>—</b><small>لا توجد وردية محفوظة</small>';return}const n=await nextOfflineBon(sh.id,false);el.innerHTML=`<span>رقم البون التالي</span><b>OFF-${n}</b><small>أوفلاين • وردية ${text(sh.id).slice(0,12)}</small>`}

async function warmRuntimeCaches(){if(!onlineAuthorized()||!branchId()||!employeeId())return false;const b=branchId();const calls=[['shifts',`select=*&branch_id=eq.${b}&order=opened_at.desc&limit=100`],['expenses',`select=*&branch_id=eq.${b}&order=created_at.desc&limit=500`],['orders',`select=*&branch_id=eq.${b}&order=created_at.desc&limit=300`],['delivery_drivers',`select=*&branch_id=eq.${b}&order=active.desc,name`],['delivery_zones',`select=*&branch_id=eq.${b}&order=active.desc,name`],['driver_settlements',`select=*&branch_id=eq.${b}&order=created_at.desc&limit=50`]];for(const [t,q] of calls){try{const rows=await baseRest(t,q);await dbSet(readKey(t,q),rows);if(t==='shifts')await dbSet(`shiftHistory:${b}`,rows)}catch{}}try{await getOpenShiftRecovery(employeeId(),b)}catch{}return true}

function install(){
 if(installed)return true;if(typeof global.rest!=='function'||typeof global.syncOfflineQueue!=='function'||typeof global.saveOfflineSale!=='function'||typeof global.updateNextBonBadge!=='function'||typeof global.getOpenShift!=='function')return false;
 baseRest=global.rest;baseSync=global.syncOfflineQueue;baseSaveOfflineSale=global.saveOfflineSale;baseUpdateNextBon=global.updateNextBonBadge;baseGetOpenShift=global.getOpenShift;
 try{rest=restRecovery}catch{};global.rest=restRecovery;try{getOpenShift=getOpenShiftRecovery}catch{};global.getOpenShift=getOpenShiftRecovery;try{syncOfflineQueue=syncRecovery}catch{};global.syncOfflineQueue=syncRecovery;try{saveOfflineSale=saveOfflineSaleRecovery}catch{};global.saveOfflineSale=saveOfflineSaleRecovery;try{updateNextBonBadge=updateNextBonRecovery}catch{};global.updateNextBonBadge=updateNextBonRecovery;
 global.addEventListener('online',()=>setTimeout(()=>syncRecovery().catch(()=>{}),250));global.addEventListener('sharawla:offline-auth-readiness',e=>{if(e?.detail?.ready===true&&onlineAuthorized())setTimeout(()=>warmRuntimeCaches().catch(()=>{}),100)});setTimeout(()=>{if(onlineAuthorized())warmRuntimeCaches().catch(()=>{})},1200);installed=true;
 global.__SharawlaBeta554RuntimeRecovery=Object.freeze({version:VERSION,installed:true,warmRuntimeCaches,reconcileOpenShiftBeforeSync,syncNow:syncRecovery,offlineReadFallback:true,openShiftContinuity:true,reconnectReconcile:true,bonSequencing:true,ownershipGate:true});global.dispatchEvent(new CustomEvent('sharawla-beta55-4-runtime-recovery-ready',{detail:{version:VERSION}}));return true;
}
function start(){let tries=0;const t=setInterval(()=>{tries++;if(install()||tries>=80)clearInterval(t)},75)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);