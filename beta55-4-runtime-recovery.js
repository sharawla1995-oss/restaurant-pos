(function(global){
'use strict';

// Beta55.4 — SH-0007 regression recovery layer.
// Scope: offline read fallbacks, open-shift continuity, reconnect reconciliation,
// and offline bon sequencing. Authentication/fingerprint/licensing are untouched.
const VERSION='10.5.4-beta.58.32';
const CACHE_PREFIX='sharawla55.4:read:';
const BON_PREFIX='sharawla55.4:bon:';
let installed=false;
let syncBusy=false;
let lastReconnectNotice=0;
let cacheFallbackState=null;

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
function publishFallback(table,reason){cacheFallbackState={active:true,table:text(table),reason:text(reason)||'offline',at:new Date().toISOString()};global.__SharawlaOfflineCacheFallback=clone(cacheFallbackState);try{global.dispatchEvent(new CustomEvent('sharawla:offline-cache-fallback',{detail:clone(cacheFallbackState)}))}catch{}}
function clearFallback(){if(!cacheFallbackState)return;cacheFallbackState=null;global.__SharawlaOfflineCacheFallback=null;try{global.dispatchEvent(new CustomEvent('sharawla:offline-cache-fallback',{detail:{active:false,at:new Date().toISOString()}}))}catch{}}
async function dbGet(k){try{if(typeof odbGet==='function')return await odbGet(k)}catch{}try{return await global.odbGet?.(k)}catch{return null}}
async function dbSet(k,v){try{if(typeof odbSet==='function')return await odbSet(k,v)}catch{}try{return await global.odbSet?.(k)}catch{return v}}
async function getQueue(){try{if(typeof offlineQueue==='function')return (await offlineQueue())||[]}catch{}try{return (await global.offlineQueue?.())||[]}catch{return[]}}
async function setQueue(q){try{if(typeof setOfflineQueue==='function')return await setOfflineQueue(q)}catch{}if(global.setOfflineQueue)return await global.setOfflineQueue(q);return q}
async function rememberShift(sh){if(!sh)return sh;try{if(typeof rememberOpenShift==='function')return await rememberOpenShift(sh)}catch{}try{return await global.rememberOpenShift?.(sh)}catch{return sh}}
async function cachedShift(){try{if(typeof cachedOpenShift==='function')return await cachedOpenShift()}catch{}try{return await global.cachedOpenShift?.()}catch{return null}}
async function ownership55(job){const gate=global.SharawlaOfflineOwnership;if(!gate?.resolve)return {owner:'UNKNOWN',reason:'OWNERSHIP_GATE_UNAVAILABLE'};try{return await gate.resolve(job)}catch(e){return {owner:'UNKNOWN',reason:'OWNERSHIP_RESOLUTION_FAILED',error:text(e?.message||e)}}}
function legacyMayRead55(owner){const gate=global.SharawlaOfflineOwnership;return gate?.legacyMayRead?gate.legacyMayRead(owner):false}
function legacyMayOperate55(owner){const gate=global.SharawlaOfflineOwnership;return gate?.legacyMayOperate?gate.legacyMayOperate(owner):false}

function isLocalShiftId(v){return /^offline-shift-[0-9a-f-]+$/i.test(text(v))}
function parseEq(query,key){const m=String(query||'').match(new RegExp(`(?:^|&)${key}=eq\\.([^&]+)`));if(!m)return null;try{return decodeURIComponent(m[1])}catch{return m[1]}}
function parseIn(query,key){const m=String(query||'').match(new RegExp(`(?:^|&)${key}=in\\.\\(([^)]*)\\)`));return m?m[1].split(',').map(x=>text(x)).filter(Boolean):null}
function parseBound(query,key,op){const m=String(query||'').match(new RegExp(`(?:^|&)${key}=${op}\\.([^&]+)`));if(!m)return null;try{return decodeURIComponent(m[1])}catch{return m[1]}}
function applyQuery(rows,query){
 let out=Array.isArray(rows)?rows.slice():[];
 const keys=['id','branch_id','employee_id','shift_id','order_id','return_id','customer_id','driver_id','product_id','status','order_type','source','active','auth_user_id','invoice_number','bon_number','payment_method','payment_status'];
 for(const k of keys){const v=parseEq(query,k);if(v!==null)out=out.filter(r=>String(r?.[k])===String(v));const vals=parseIn(query,k);if(vals)out=out.filter(r=>vals.includes(String(r?.[k])))}
 for(const k of ['created_at','opened_at']){const g=parseBound(query,k,'gte'),l=parseBound(query,k,'lte');if(g)out=out.filter(r=>new Date(r?.[k]||0)>=new Date(g));if(l)out=out.filter(r=>new Date(r?.[k]||0)<=new Date(l))}
 const order=String(query||'').match(/(?:^|&)order=([a-zA-Z0-9_]+)\.(asc|desc)/);if(order){const [,key,dir]=order;out.sort((a,b)=>{const av=a?.[key],bv=b?.[key];if(av===bv)return 0;if(av==null)return 1;if(bv==null)return -1;const an=typeof av==='number'?av:(Date.parse(av)||null),bn=typeof bv==='number'?bv:(Date.parse(bv)||null),cmp=an!==null&&bn!==null?an-bn:String(av).localeCompare(String(bv));return dir==='desc'?-cmp:cmp})}
 const offset=Number(String(query||'').match(/(?:^|&)offset=(\d+)/)?.[1]||0);if(offset>0)out=out.slice(offset);
 const lim=Number(String(query||'').match(/(?:^|&)limit=(\d+)/)?.[1]||0);if(lim>0)out=out.slice(0,lim);
 return out;
}

async function nativeProjection(){
 const api=global.topBurgerDesktop?.offlineV2;if(!api?.outbox)return null;
 let events=[];try{events=await api.outbox()}catch{return null}
 const p={orders:[],order_items:[],order_payments:[],expenses:[],returns:[],return_items:[],return_payments:[],customers:[],customer_addresses:[],shifts:[]},orderPatches=[];
 for(const row of (events||[])){
  if(row?.last_error_code==='OFFLINE_V2_LEGACY_PRESERVED')continue;
  const type=text(row?.operation_type),tx=text(row?.client_tx_id),status=text(row?.status)||'pending',pending=status!=='synced',created=text(row?.created_local_at)||text(row?.created_at)||new Date().toISOString();
  const payload=clone(row?.envelope?.payload?.rpc_payload||{}),ack=row?.server_ack||{},result=ack?.result||{},localId=text(row?.local_entity_id);
  if(type==='sale'){
   const ackOrder=result?.order&&typeof result.order==='object'?clone(result.order):null,id=(ackOrder?.id??ack.server_entity_id??localId)||`offline-${tx}`;
   const order={...(payload.p_order||{}),...(ackOrder||{}),id,client_tx_id:tx,created_at:ackOrder?.created_at||created,payment_status:ackOrder?.payment_status||'confirmed',_offline:pending,_offline_sync_status:status};
   p.orders.push(order);
   const ackItems=Array.isArray(result?.items)?result.items:null,items=ackItems||payload.p_items||[];
   p.order_items.push(...items.map((x,i)=>({...clone(x),id:x.id??`${id}-line-${x.line_uid||i+1}`,order_id:id})));
   p.order_payments.push(...(payload.p_payments||[]).map((x,i)=>({...clone(x),id:x.id??`${id}-p${i+1}`,order_id:id})));
  }else if(type==='expense'){
   const id=(result?.id??ack.server_entity_id??localId)||`offline-exp-${tx}`;
   p.expenses.push({...clone(result&&typeof result==='object'?result:{}),id,branch_id:row.branch_id,employee_id:row.employee_id,shift_id:payload.p_shift_id,description:payload.p_description,amount:Number(payload.p_amount||0),created_at:result?.created_at||created,client_tx_id:tx,_offline:pending,_offline_sync_status:status});
  }else if(type==='shift_open'){
   const ackShift=result&&typeof result==='object'?clone(result):null,id=ackShift?.id??ack.server_entity_id??localId??`offline-shift-${tx}`;
   p.shifts.push({...clone(payload),...(ackShift||{}),id,branch_id:ackShift?.branch_id??row.branch_id,employee_id:ackShift?.employee_id??row.employee_id,opening_cash:Number(ackShift?.opening_cash??payload.p_opening_cash??0),status:ackShift?.status||'open',opened_at:ackShift?.opened_at||created,client_tx_id:tx,_offline:pending,_offline_sync_status:status});
  }else if(type==='shift_close'){
   const ackShift=result&&typeof result==='object'?clone(result):null,id=ackShift?.id??ack.server_entity_id??payload.p_shift_id;
   p.shifts.push({...clone(payload.p_metrics||{}),...clone(ackShift||{}),id,branch_id:ackShift?.branch_id??row.branch_id,employee_id:ackShift?.employee_id??row.employee_id,closing_cash:Number(ackShift?.closing_cash??payload.p_closing_cash??0),closed_at:ackShift?.closed_at||created,status:'closed',client_tx_id:tx,_offline:pending,_offline_sync_status:status,_projection_patch:true});
  }else if(type==='return'){
   const id=(result?.return_id??ack.server_entity_id??localId)||`offline-ret-${tx}`;
   p.returns.push({id,return_number:pending?`OFF-${tx.slice(0,8)}`:result?.return_number||id,branch_id:row.branch_id,order_id:payload.p_order_id,shift_id:payload.p_shift_id??null,reason:payload.p_reason,notes:payload.p_notes,subtotal:(payload.p_payments||[]).reduce((n,x)=>n+Number(x.amount||0),0),total:(payload.p_payments||[]).reduce((n,x)=>n+Number(x.amount||0),0),created_at:created,client_tx_id:tx,_offline:pending,_offline_sync_status:status});
   p.return_items.push(...(payload.p_items||[]).map((x,i)=>({...clone(x),id:x.id??`${id}-i${i+1}`,return_id:id})));
   p.return_payments.push(...(payload.p_payments||[]).map((x,i)=>({...clone(x),id:x.id??`${id}-p${i+1}`,return_id:id})));
  }else if(type==='customer_create'){
   const id=(result?.customer_id??ack.server_entity_id??localId)||`offline-customer-${tx}`;
   p.customers.push({id,name:payload.p_name,phone:payload.p_phone,area:payload.p_area,address:payload.p_address,notes:payload.p_notes,created_at:created,client_tx_id:tx,_offline:pending,_offline_sync_status:status});
  }else if(type==='customer_update'){
   const id=result?.customer_id??ack.server_entity_id??payload.p_customer_id??`offline-customer-${text(payload.p_customer_create_tx)}`;
   p.customers.push({id,name:payload.p_name,phone:payload.p_phone,area:payload.p_area,address:payload.p_address,notes:payload.p_notes,updated_at:created,client_tx_id:tx,_offline:pending,_offline_sync_status:status,_projection_patch:true});
  }else if(type==='customer_address_save'){
   const id=(result?.address_id??ack.server_entity_id??localId)||`offline-customer_address_save-${tx}`,customerId=result?.customer_id??payload.p_customer_id??`offline-customer-${text(payload.p_customer_create_tx)}`;
   p.customer_addresses.push({id,customer_id:customerId,label:payload.p_label,area:payload.p_area,address:payload.p_address,notes:payload.p_notes,is_default:payload.p_is_default===true,created_at:created,updated_at:created,client_tx_id:tx,_offline:pending,_offline_sync_status:status});
  }else if(type==='customer_address_delete'){
   p.customer_addresses.push({id:payload.p_address_id??`offline-customer_address_save-${text(payload.p_address_save_tx)}`,_projection_deleted:true});
  }else if(type==='order_status')orderPatches.push({id:payload.p_order_id,status:payload.p_target_status,_offline_status_pending:pending,_offline_status_tx:tx,_offline_status_at:created});
  else if(type==='delivery_assign_driver')orderPatches.push({id:payload.p_order_id,status:'out_for_delivery',driver_id:payload.p_driver_id,assigned_at:created,_offline_status_pending:pending,_offline_status_tx:tx,_offline_status_at:created});
 }
 p.order_patches=orderPatches;return p;
}
function mergeById(base,overlay){
 const out=Array.isArray(base)?clone(base):[];
 for(const row of (overlay||[])){
  const k=String(row?.id);if(!k)continue;const rowTx=text(row?.client_tx_id),matches=[];
  for(let i=0;i<out.length;i++)if(String(out[i]?.id)===k||(rowTx&&text(out[i]?.client_tx_id)===rowTx))matches.push(i);
  if(row?._projection_deleted){for(const i of matches.reverse())out.splice(i,1);continue}
  if(!matches.length){out.push(clone(row));continue}
  const merged=Object.assign({},...matches.map(i=>out[i]),clone(row)),insertAt=matches[0];
  for(const i of matches.reverse())out.splice(i,1);out.splice(Math.min(insertAt,out.length),0,merged);
 }
 return out;
}
async function mergeNative(table,rows){
 const p=await nativeProjection();if(!p)return Array.isArray(rows)?rows:[];
 let out=mergeById(rows,p[table]||[]);
 if(table==='orders')for(const patch of p.order_patches||[]){const i=out.findIndex(x=>String(x.id)===String(patch.id));if(i>=0)out[i]={...out[i],...patch}}
 return out;
}

async function baselineRows(table,query){
 const st=appState()||{};
 let rows=null;
 if(table==='products')rows=st.products||[];
 else if(table==='categories')rows=st.categories||[];
 else if(table==='branch_products')rows=st.branchProducts||[];
 else if(table==='modifiers')rows=st.modifiers||[];
 else if(table==='product_modifiers')rows=st.productModifiers||[];
 else if(table==='product_variants')rows=st.productVariants||[];
 else if(table==='delivery_zones')rows=st.deliveryZones||[];
 else if(table==='delivery_drivers')rows=st.drivers||[];
 else if(table==='branches')rows=st.branches||[];
 else if(table==='branch_print_settings')rows=st.branchPrintSettings||[];
 else if(table==='payment_methods')rows=st.paymentMethods||[];
 else if(table==='branch_payment_methods')rows=st.branchPaymentMethods||[];
 else if(table==='branch_financial_settings')rows=st.branchFinancialSettings||[];
 else if(table==='employee_branches')rows=(st.employeeBranches||[]).map(x=>({employee_id:employeeId(),...x}));
 else if(table==='employee_permissions')rows=(st.userPermissions||[]).map(x=>({employee_id:employeeId(),...x}));
 else if(table==='employees')rows=st.employee?[st.employee]:[];
 else if(table==='business_settings')rows=st.business?[st.business]:[];
 else if(table==='website_settings')rows=st.websiteSettings?[st.websiteSettings]:[];
 else if(table==='app_settings')rows=Object.entries(st.settings||{}).map(([key,value])=>({key,value:String(value)}));
 else if(table==='orders'){
   const bundles=await dbGet('cachedOrders')||[];rows=bundles.map(x=>x.order).filter(Boolean);
   const q=await getQueue();rows=[...q.filter(x=>x.type==='sale'&&x.local_order).map(x=>x.local_order),...rows];
 }
 else if(table==='order_items'){
   const bundles=await dbGet('cachedOrders')||[];rows=bundles.flatMap(x=>x.items||[]);
   const q=await getQueue();rows=[...q.filter(x=>x.type==='sale').flatMap(x=>x.local_items||[]),...rows];
 }
 else if(table==='order_payments'){
   const q=await getQueue();rows=q.filter(x=>x.type==='sale').flatMap(x=>(x.p_payments||[]).map(p=>({...p,order_id:x.local_order?.id||null})));
 }
 else if(table==='expenses'){
   rows=(await dbGet('offlineV2Expenses'))||[];const q=await getQueue();rows.push(...q.filter(x=>x.type==='expense'&&x.local_expense).map(x=>x.local_expense));
 }
 else if(table==='shifts'){
   rows=(await dbGet(`shiftHistory:${branchId()}`))||[];const c=await cachedShift();if(c&&!rows.some(x=>String(x.id)===String(c.id)))rows.unshift(c);
   const q=await getQueue();for(const j of q.filter(x=>x.type==='shift_open'&&x.local_shift)){if(!rows.some(r=>String(r.id)===String(j.local_shift.id)))rows.unshift(j.local_shift)}
 }
 else if(table==='returns'){
   rows=(await dbGet(`cachedReturns:${branchId()}`))||[];const q=await getQueue();rows=[...q.filter(x=>x.type==='return'&&x.local_return).map(x=>x.local_return),...rows];
 }
 else if(table==='return_items'){
   rows=(await dbGet('offlineV2ReturnItems'))||[];const q=await getQueue();rows=[...q.filter(x=>x.type==='return').flatMap(x=>x.local_items||[]),...rows];
 }
 else if(table==='return_payments'){
   rows=(await dbGet('offlineV2ReturnPayments'))||[];const q=await getQueue();rows=[...q.filter(x=>x.type==='return').flatMap(x=>x.local_payments||[]),...rows];
  }
 else if(table==='customers')rows=(await dbGet('customersCache'))||[];
 else if(table==='customer_addresses')rows=(await dbGet('customerAddressesCache'))||[];
 else if(table==='shift_bon_counters')rows=[];
 if(rows===null)return null;
 rows=await mergeNative(table,rows);
 if(table==='return_items'){
   const orderId=parseEq(query,'returns.order_id');
   if(orderId!==null){
     let returns=(await dbGet(`cachedReturns:${branchId()}`))||[];
     returns=await mergeNative('returns',returns);
     const ids=new Set(returns.filter(x=>String(x.order_id)===String(orderId)).map(x=>String(x.id)));
     rows=rows.filter(x=>ids.has(String(x.return_id)));
   }
 }
 return applyQuery(clone(rows),query);
}

let baseRest=null;
async function restRecovery(table,query='',opt={}){
 const method=String(opt?.method||'GET').toUpperCase();
 if(method!=='GET'){
   if(!navigator.onLine)throw new Error('العملية دي تحتاج إنترنت. البيانات الحالية محفوظة ومش هتتمسح.');
   try{return await baseRest(table,query,opt)}catch(e){if(netError(e))throw new Error('العملية دي تحتاج اتصالًا بالإنترنت. لم يتم تأكيد أي تغيير؛ راجع البيانات بعد رجوع الاتصال قبل إعادة المحاولة.');throw e}
 }
 const localShiftEq=parseEq(query,'shift_id');
 const localShiftId=(table==='shifts'?parseEq(query,'id'):null);
 if(isLocalShiftId(localShiftEq)||isLocalShiftId(localShiftId)){
   const local=await baselineRows(table,query);
   if(local!==null){publishFallback(table,'local-shift-id');return local}
   throw new Error('الوردية المحلية لم تتزامن بعد، والبيانات المطلوبة غير محفوظة محليًا.');
 }
 let networkFailed=false;
 if(onlineAuthorized()){
   try{const remote=await baseRest(table,query,opt),rows=applyQuery(await mergeNative(table,remote),query);await dbSet(readKey(table,query),rows);clearFallback();return rows}catch(e){if(!netError(e))throw e;networkFailed=true}
 }
 const exact=await dbGet(readKey(table,query));if(Array.isArray(exact)){publishFallback(table,networkFailed?'network-failure':'offline');return applyQuery(await mergeNative(table,clone(exact)),query)}
 const local=await baselineRows(table,query);if(local!==null){publishFallback(table,networkFailed?'network-failure':'offline');return local}
 if(networkFailed)throw new Error('تعذر الاتصال بالإنترنت، والبيانات المطلوبة غير محفوظة على هذا الجهاز. لم يتم تغيير أي بيانات.');
 if(navigator.onLine)return baseRest(table,query,opt);
 throw new Error('البيانات دي مش محفوظة على الجهاز للعمل بدون إنترنت.');
}

async function pendingLocalShift(){
 const q=await getQueue(),bid=branchId(),eid=employeeId(),eligible=[];
 for(const j of q){
  if(j.type!=='shift_open'||!j.local_shift||Number(j.local_shift.branch_id)!==bid||Number(j.local_shift.employee_id)!==eid)continue;
  const own=await ownership55(j);if(legacyMayRead55(own.owner))eligible.push(j.local_shift);else if(own.owner==='UNKNOWN')console.error('Offline ownership unresolved; pending shift read fail-closed',j.client_tx_id,own.reason);
 }
 return eligible.sort((a,b)=>new Date(b.opened_at||0)-new Date(a.opened_at||0))[0]||null;
}
let baseGetOpenShift=null;
async function getOpenShiftRecovery(employee=employeeId(),branch=branchId()){
 if(!onlineAuthorized())return (await cachedShift())||(await pendingLocalShift())||null;
 try{
  const sh=await baseGetOpenShift(employee,branch);
  if(sh){await rememberShift(sh);return sh}
  return (await pendingLocalShift())||null;
 }catch(e){if(netError(e))return (await cachedShift())||(await pendingLocalShift())||null;throw e}
}

async function remapQueuedShift(q,localId,serverId){
 for(const j of q){
  const own=await ownership55(j);if(!legacyMayOperate55(own.owner))continue;
  if(String(j.p_shift_id)===String(localId))j.p_shift_id=Number(serverId);
  if(String(j.p_order?.shift_id)===String(localId))j.p_order.shift_id=Number(serverId);
  if(String(j.local_order?.shift_id)===String(localId))j.local_order.shift_id=Number(serverId);
  if(String(j.local_expense?.shift_id)===String(localId))j.local_expense.shift_id=Number(serverId);
  if(String(j.local_return?.shift_id)===String(localId))j.local_return.shift_id=Number(serverId);
 }
}
async function reconcileOpenShiftBeforeSync(){
 if(!onlineAuthorized()||!branchId()||!employeeId())return {ok:false,reason:'NO_ONLINE_SESSION'};
 let rows=[];try{rows=await baseRest('shifts',`select=*&branch_id=eq.${branchId()}&employee_id=eq.${employeeId()}&status=eq.open&closed_at=is.null&order=opened_at.desc&limit=2`)}catch(e){return {ok:false,reason:text(e?.message||e)}}
 if(!Array.isArray(rows)||rows.length!==1)return {ok:false,reason:rows.length>1?'MULTIPLE_OPEN_SHIFTS':'NO_SERVER_OPEN_SHIFT'};
 const server=rows[0];await rememberShift(server);await dbSet(`shiftHistory:${branchId()}`,[server,...((await dbGet(`shiftHistory:${branchId()}`))||[]).filter(x=>String(x.id)!==String(server.id))]);
 let q=await getQueue(),redundant=[];
 for(const j of q){
  if(j.type!=='shift_open'||Number(j.local_shift?.branch_id||j.p_branch_id||0)!==branchId()||Number(j.local_shift?.employee_id||j._scope?.employee_id||employeeId())!==employeeId())continue;
  const own=await ownership55(j);if(legacyMayOperate55(own.owner))redundant.push(j);else if(own.owner==='UNKNOWN')console.error('Offline ownership unresolved; recovery reconciliation fail-closed',j.client_tx_id,own.reason);
 }
 if(!redundant.length)return {ok:true,reconciled:0,server_shift_id:server.id};
 for(const j of redundant)await remapQueuedShift(q,j.local_shift_id,server.id);
 const ids=new Set(redundant.map(j=>String(j.client_tx_id)));q=q.filter(j=>!ids.has(String(j.client_tx_id)));await setQueue(q);
 for(const j of redundant){try{await global.topBurgerDesktop?.operations?.status?.(j.client_tx_id,'synced','Reconciled with existing server open shift')}catch{}}
 return {ok:true,reconciled:redundant.length,server_shift_id:server.id};
}

let baseSync=null;
async function syncRecovery(){
 if(syncBusy)return;
 if(!navigator.onLine)return;
 if(!appSession()?.access_token){
   const now=Date.now();if(now-lastReconnectNotice>15000){lastReconnectNotice=now;toast55('رجع الإنترنت — سجل دخول Online مرة واحدة علشان نزامن الحركات المحفوظة.');}
   return;
 }
 syncBusy=true;
 try{const r=await reconcileOpenShiftBeforeSync();if(r?.reconciled)toast55(`تم ربط ${r.reconciled} محاولة وردية بالوردية المفتوحة #${r.server_shift_id}`);return await baseSync()}
 finally{syncBusy=false}
}

function runtimeBusiness(){try{return text(sharawlaRuntimeConfig?.business_id)}catch{return ''}}
let baseSaveOfflineSale=null;
async function saveOfflineSaleRecovery(orderPayload,itemPayload,payRows,providedClientTx=null){
 const out=await baseSaveOfflineSale(orderPayload,itemPayload,payRows,providedClientTx);
 if(!out?.order)return out;
 if(!navigator.onLine){
  out.order.invoice_number=null;out.order.bon_number=null;out.order._official_number_pending=true;
  if(!text(out.order.offline_reference)){const tx=text(out.client_tx_id||providedClientTx||out.order.client_tx_id);out.order.offline_reference=`OFF-${tx.replace(/-/g,'').slice(0,8).toUpperCase()}`}
 }
 return out;
}
let baseUpdateNextBon=null;
async function updateNextBonRecovery(){
 if(onlineAuthorized())return baseUpdateNextBon();
 const el=document.querySelector('#nextBonBadge');if(!el)return;
 const sh=(await cachedShift())||(await pendingLocalShift());if(!sh){el.innerHTML='<span>رقم البون التالي</span><b>—</b><small>لا توجد وردية محفوظة</small>';return}
 el.innerHTML=`<span>رقم البون التالي</span><b>بعد المزامنة</b><small>الرقم الرسمي يخصصه السيرفر • وردية ${text(sh.id).slice(0,12)}</small>`;
}

async function warmRuntimeCaches(){
 if(!onlineAuthorized()||!branchId()||!employeeId())return false;
 const b=branchId();const calls=[
  ['shifts',`select=*&branch_id=eq.${b}&order=opened_at.desc&limit=100`],
  ['order_items',`select=*&order_id=not.is.null&order=id.desc&limit=5000`],
  ['orders',`select=*&branch_id=eq.${b}&order=created_at.desc&limit=500`],
  ['expenses',`select=*&branch_id=eq.${b}&order=created_at.desc&limit=500`],
  ['customers','select=*&order=created_at.desc&limit=10000'],
  ['customer_addresses','select=*&order=id.desc&limit=20000'],
  ['delivery_drivers',`select=*&branch_id=eq.${b}&order=active.desc,name`],
  ['delivery_zones',`select=*&branch_id=eq.${b}&order=active.desc,name`],
  ['driver_settlements',`select=*&branch_id=eq.${b}&order=created_at.desc&limit=50`]
 ];
 for(const [t,q] of calls){try{const rows=await baseRest(t,q);await dbSet(readKey(t,q),rows);if(t==='shifts')await dbSet(`shiftHistory:${b}`,rows);if(t==='orders'){const bundles=(await dbGet('cachedOrders'))||[],itemsByOrder=new Map();for(const x of ((await dbGet(readKey('order_items','select=*&order_id=not.is.null&order=id.desc&limit=5000')))||[])){const k=String(x.order_id);if(!itemsByOrder.has(k))itemsByOrder.set(k,[]);itemsByOrder.get(k).push(x)}await dbSet('cachedOrders',rows.map(o=>({order:o,items:itemsByOrder.get(String(o.id))||[]})).concat(bundles.filter(x=>!rows.some(o=>String(o.id)===String(x.order?.id)))).slice(0,500))}if(t==='customers')await dbSet('customersCache',rows);if(t==='customer_addresses')await dbSet('customerAddressesCache',rows)}catch{}}
 try{await getOpenShiftRecovery(employeeId(),b)}catch{}
 return true;
}

function install(){
 if(installed)return true;
 if(typeof global.rest!=='function'||typeof global.syncOfflineQueue!=='function'||typeof global.saveOfflineSale!=='function'||typeof global.updateNextBonBadge!=='function'||typeof global.getOpenShift!=='function')return false;
 baseRest=global.rest;baseSync=global.syncOfflineQueue;baseSaveOfflineSale=global.saveOfflineSale;baseUpdateNextBon=global.updateNextBonBadge;baseGetOpenShift=global.getOpenShift;
 try{rest=restRecovery}catch{};global.rest=restRecovery;
 try{getOpenShift=getOpenShiftRecovery}catch{};global.getOpenShift=getOpenShiftRecovery;
 try{syncOfflineQueue=syncRecovery}catch{};global.syncOfflineQueue=syncRecovery;
 try{saveOfflineSale=saveOfflineSaleRecovery}catch{};global.saveOfflineSale=saveOfflineSaleRecovery;
 try{updateNextBonBadge=updateNextBonRecovery}catch{};global.updateNextBonBadge=updateNextBonRecovery;
 global.addEventListener('online',()=>setTimeout(()=>syncRecovery().catch(()=>{}),250));
 global.addEventListener('sharawla:offline-auth-readiness',e=>{if(e?.detail?.ready===true&&onlineAuthorized())setTimeout(()=>warmRuntimeCaches().catch(()=>{}),100)});
 setTimeout(()=>{if(onlineAuthorized())warmRuntimeCaches().catch(()=>{})},1200);
 installed=true;
 global.__SharawlaBeta554RuntimeRecovery=Object.freeze({version:VERSION,installed:true,warmRuntimeCaches,reconcileOpenShiftBeforeSync,syncNow:syncRecovery,offlineReadFallback:true,openShiftContinuity:true,reconnectReconcile:true,officialNumberServerAssigned:true,bonSequencing:false,ownershipGate:true,cacheFallbackState:()=>clone(cacheFallbackState)});
 global.dispatchEvent(new CustomEvent('sharawla-beta55-4-runtime-recovery-ready',{detail:{version:VERSION}}));
 return true;
}
function start(){let tries=0;const t=setInterval(()=>{tries++;if(install()||tries>=80)clearInterval(t)},75)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
