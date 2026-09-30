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
let warmCachesPromise=null;
let lastWarmCachesAt=0;

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
function cacheScope(){return `${runtimeBusiness()||'no-business'}:${branchId()||'no-branch'}`}
function readKey(table,query){return `${CACHE_PREFIX}${cacheScope()}:${table}:${hash(query)}`}
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

function parseEq(query,key){const m=String(query||'').match(new RegExp(`(?:^|&)${key}=eq\\.([^&]+)`));if(!m)return null;try{return decodeURIComponent(m[1])}catch{return m[1]}}
function parseIn(query,key){const m=String(query||'').match(new RegExp(`(?:^|&)${key}=in\\.\\(([^)]*)\\)`));return m?m[1].split(',').map(x=>text(x)).filter(Boolean):null}
function parseBound(query,key,op){const m=String(query||'').match(new RegExp(`(?:^|&)${key}=${op}\\.([^&]+)`));if(!m)return null;try{return decodeURIComponent(m[1])}catch{return m[1]}}
function parseIlike(query,key){const m=String(query||'').match(new RegExp(`(?:^|&)${key}=ilike\\.([^&]+)`));if(!m)return null;try{return decodeURIComponent(m[1])}catch{return m[1]}}
function ilike(value,pattern){const escaped=String(pattern||'').replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*');return new RegExp(`^${escaped}$`,'i').test(String(value??''))}
function applyQuery(rows,query){
 let out=Array.isArray(rows)?rows.slice():[];
 const keys=['id','branch_id','home_branch_id','employee_id','shift_id','order_id','return_id','customer_id','driver_id','product_id','schedule_id','staff_account_id','status','verification_status','request_type','work_date','order_type','source','active','auth_user_id','invoice_number','bon_number','payment_method','payment_status','phone','customer_phone'];
 for(const k of keys){const v=parseEq(query,k);if(v!==null)out=out.filter(r=>String(r?.[k])===String(v));const vals=parseIn(query,k);if(vals)out=out.filter(r=>vals.includes(String(r?.[k])))}
 for(const k of ['phone','customer_phone']){const v=parseIlike(query,k);if(v!==null)out=out.filter(r=>ilike(r?.[k],v))}
 const orderTypeOr=String(query||'').match(/(?:^|&)or=\((order_type\.eq\.[^)]+)\)/)?.[1]?.split(',').map(x=>x.match(/^order_type\.eq\.(.+)$/)?.[1]).filter(Boolean);if(orderTypeOr?.length)out=out.filter(r=>orderTypeOr.includes(String(r?.order_type)));
 for(const k of ['closed_at']){if(new RegExp(`(?:^|&)${k}=is\\.null(?:&|$)`).test(String(query||'')))out=out.filter(r=>r?.[k]==null)}
 for(const k of ['created_at','opened_at','captured_at_device','starts_at','ends_at','work_date','effective_from','effective_to','effective_date','requested_on','last_seen_at']){const g=parseBound(query,k,'gte'),l=parseBound(query,k,'lte');if(g)out=out.filter(r=>new Date(r?.[k]||0)>=new Date(g));if(l)out=out.filter(r=>new Date(r?.[k]||0)<=new Date(l))}
 const order=String(query||'').match(/(?:^|&)order=([a-zA-Z0-9_]+)\.(asc|desc)/);if(order){const [,key,dir]=order;out.sort((a,b)=>{const av=a?.[key],bv=b?.[key];if(av===bv)return 0;if(av==null)return 1;if(bv==null)return -1;const an=typeof av==='number'?av:(Date.parse(av)||null),bn=typeof bv==='number'?bv:(Date.parse(bv)||null),cmp=an!==null&&bn!==null?an-bn:String(av).localeCompare(String(bv));return dir==='desc'?-cmp:cmp})}
 const offset=Number(String(query||'').match(/(?:^|&)offset=(\d+)/)?.[1]||0);if(offset>0)out=out.slice(offset);
 const lim=Number(String(query||'').match(/(?:^|&)limit=(\d+)/)?.[1]||0);if(lim>0)out=out.slice(0,lim);
 return out;
}

async function nativeProjection(){
 const api=global.topBurgerDesktop?.offlineV2;if(!api?.outbox)return null;
 const events=await api.outbox();
 const p={orders:[],order_items:[],order_payments:[],expenses:[],returns:[],return_items:[],return_payments:[],customers:[],customer_addresses:[],shifts:[]},orderPatches=[];
 for(const row of (events||[])){
  if(row?.last_error_code==='OFFLINE_V2_LEGACY_PRESERVED')continue;
  const type=text(row?.operation_type),tx=text(row?.client_tx_id),status=text(row?.status)||'pending',pending=status!=='synced',created=text(row?.created_local_at)||text(row?.created_at)||new Date().toISOString();
  const payload=clone(row?.envelope?.payload?.rpc_payload||{}),ack=row?.server_ack||{},result=ack?.result||{},localId=text(row?.local_entity_id);
  if(type==='sale'){
   const ackOrder=result?.order&&typeof result.order==='object'?clone(result.order):null,id=(ackOrder?.id??ack.server_entity_id??localId)||`offline-${tx}`;
   const order={...(payload.p_order||{}),...(ackOrder||{}),id,client_tx_id:tx,_local_entity_id:localId||null,_server_entity_id:ack.server_entity_id??ackOrder?.id??null,created_at:ackOrder?.created_at||created,payment_status:ackOrder?.payment_status||'confirmed',_offline:pending,_offline_sync_status:status};
   p.orders.push(order);
   const ackItems=Array.isArray(result?.items)?result.items:null,items=ackItems||payload.p_items||[];
   p.order_items.push(...items.map((x,i)=>({...clone(x),id:x.id??`${id}-line-${x.line_uid||i+1}`,order_id:id,_projection_key:`sale:${tx}:item:${x.line_uid||i+1}`})));
   p.order_payments.push(...(payload.p_payments||[]).map((x,i)=>({...clone(x),id:x.id??`${id}-p${i+1}`,order_id:id,_projection_key:`sale:${tx}:payment:${i+1}`})));
  }else if(type==='expense'){
   const id=(result?.id??ack.server_entity_id??localId)||`offline-exp-${tx}`;
   p.expenses.push({...clone(result&&typeof result==='object'?result:{}),id,branch_id:row.branch_id,employee_id:row.employee_id,shift_id:payload.p_shift_id,description:payload.p_description,amount:Number(payload.p_amount||0),created_at:result?.created_at||created,client_tx_id:tx,_local_entity_id:localId||null,_server_entity_id:ack.server_entity_id??result?.id??null,_offline:pending,_offline_sync_status:status});
  }else if(type==='shift_open'){
   const ackShift=result&&typeof result==='object'?clone(result):null,id=ackShift?.id??ack.server_entity_id??localId??`offline-shift-${tx}`;
   p.shifts.push({...clone(payload),...(ackShift||{}),id,branch_id:ackShift?.branch_id??row.branch_id,employee_id:ackShift?.employee_id??row.employee_id,opening_cash:Number(ackShift?.opening_cash??payload.p_opening_cash??0),status:ackShift?.status||'open',opened_at:ackShift?.opened_at||created,client_tx_id:tx,_local_entity_id:localId||null,_server_entity_id:ack.server_entity_id??ackShift?.id??null,_offline:pending,_offline_sync_status:status});
  }else if(type==='shift_close'){
   const ackShift=result&&typeof result==='object'?clone(result):null,id=ackShift?.id??ack.server_entity_id??payload.p_shift_id;
   p.shifts.push({...clone(payload.p_metrics||{}),...clone(ackShift||{}),id,branch_id:ackShift?.branch_id??row.branch_id,employee_id:ackShift?.employee_id??row.employee_id,closing_cash:Number(ackShift?.closing_cash??payload.p_closing_cash??0),closed_at:ackShift?.closed_at||created,status:'closed',client_tx_id:tx,_local_entity_id:payload.p_shift_id??null,_server_entity_id:ack.server_entity_id??ackShift?.id??null,_offline:pending,_offline_sync_status:status,_projection_patch:true});
  }else if(type==='return'){
   const id=(result?.return_id??ack.server_entity_id??localId)||`offline-ret-${tx}`;
   p.returns.push({id,return_number:pending?`OFF-${tx.slice(0,8)}`:result?.return_number||id,branch_id:row.branch_id,order_id:payload.p_order_id,shift_id:payload.p_shift_id??null,reason:payload.p_reason,notes:payload.p_notes,subtotal:(payload.p_payments||[]).reduce((n,x)=>n+Number(x.amount||0),0),total:(payload.p_payments||[]).reduce((n,x)=>n+Number(x.amount||0),0),created_at:created,client_tx_id:tx,_local_entity_id:localId||null,_server_entity_id:ack.server_entity_id??result?.return_id??null,_offline:pending,_offline_sync_status:status});
   p.return_items.push(...(payload.p_items||[]).map((x,i)=>({...clone(x),id:x.id??`${id}-i${i+1}`,return_id:id,_projection_key:`return:${tx}:item:${x.line_uid||i+1}`})));
   p.return_payments.push(...(payload.p_payments||[]).map((x,i)=>({...clone(x),id:x.id??`${id}-p${i+1}`,return_id:id,_projection_key:`return:${tx}:payment:${i+1}`})));
  }else if(type==='customer_create'){
   const id=(result?.customer_id??ack.server_entity_id??localId)||`offline-customer-${tx}`;
   p.customers.push({id,name:payload.p_name,phone:payload.p_phone,area:payload.p_area,address:payload.p_address,notes:payload.p_notes,created_at:created,client_tx_id:tx,_local_entity_id:localId||null,_server_entity_id:ack.server_entity_id??result?.customer_id??null,_offline:pending,_offline_sync_status:status});
  }else if(type==='customer_update'){
   const id=result?.customer_id??ack.server_entity_id??payload.p_customer_id??`offline-customer-${text(payload.p_customer_create_tx)}`;
   p.customers.push({id,name:payload.p_name,phone:payload.p_phone,area:payload.p_area,address:payload.p_address,notes:payload.p_notes,updated_at:created,client_tx_id:tx,_local_entity_id:payload.p_customer_id??null,_server_entity_id:ack.server_entity_id??result?.customer_id??null,_offline:pending,_offline_sync_status:status,_projection_patch:true});
  }else if(type==='customer_address_save'){
   const id=(result?.address_id??ack.server_entity_id??localId)||`offline-customer_address_save-${tx}`,customerId=result?.customer_id??payload.p_customer_id??`offline-customer-${text(payload.p_customer_create_tx)}`;
   p.customer_addresses.push({id,customer_id:customerId,label:payload.p_label,area:payload.p_area,address:payload.p_address,notes:payload.p_notes,is_default:payload.p_is_default===true,created_at:created,updated_at:created,client_tx_id:tx,_local_entity_id:localId||null,_server_entity_id:ack.server_entity_id??result?.address_id??null,_offline:pending,_offline_sync_status:status});
  }else if(type==='customer_address_delete'){
   p.customer_addresses.push({id:payload.p_address_id??`offline-customer_address_save-${text(payload.p_address_save_tx)}`,_projection_deleted:true});
  }else if(type==='order_status')orderPatches.push({id:payload.p_order_id,status:payload.p_target_status,_offline_status_pending:pending,_offline_status_tx:tx,_offline_status_at:created});
  else if(type==='delivery_assign_driver')orderPatches.push({id:payload.p_order_id,status:'out_for_delivery',driver_id:payload.p_driver_id,assigned_at:created,_offline_status_pending:pending,_offline_status_tx:tx,_offline_status_at:created});
 }
 p.order_patches=orderPatches;return p;
}
function canonicalIdentity(row){const out=new Map();for(const k of ['document_uid','source_document_id','original_source_document_id','offline_reference','line_uid','effect_line_key','_projection_key','_local_entity_id','_server_entity_id']){const v=text(row?.[k]);if(v)out.set(k,v)}return out}
function identityMatches(a,b){
 const at=text(a?.client_tx_id),bt=text(b?.client_tx_id);if(at&&bt&&at===bt)return true;
 const ac=canonicalIdentity(a),bc=canonicalIdentity(b),aid=text(a?.id),bid=text(b?.id);
 for(const [field,value] of ac)if(bc.get(field)===value)return true;
 const am=[ac.get('_local_entity_id'),ac.get('_server_entity_id')].filter(Boolean),bm=[bc.get('_local_entity_id'),bc.get('_server_entity_id')].filter(Boolean);
 if((aid&&bm.includes(aid))||(bid&&am.includes(bid)))return true;
 return !!aid&&!!bid&&aid===bid;
}
function mergeByIdentity(base,overlay){
 const out=[];
 for(const row of [...(Array.isArray(base)?base:[]),...(overlay||[])]){
  if(!row||(!text(row.id)&&!text(row.client_tx_id)&&canonicalIdentity(row).size===0))continue;const matches=[];
  for(let i=0;i<out.length;i++)if(identityMatches(out[i],row))matches.push(i);
  if(row?._projection_deleted){for(const i of matches.reverse())out.splice(i,1);continue}
  if(!matches.length){out.push(clone(row));continue}
  const merged=Object.assign({},...matches.map(i=>out[i]),clone(row)),insertAt=matches[0];
  for(const i of matches.reverse())out.splice(i,1);out.splice(Math.min(insertAt,out.length),0,merged);
 }
 return out;
}
async function mergeNative(table,rows){
 const p=await nativeProjection();if(!p)return Array.isArray(rows)?rows:[];
 let out=Array.isArray(rows)?rows.map(clone):[];
 for(const nativeRow of (p[table]||[])){
  const synced=text(nativeRow?._offline_sync_status)==='synced';
  const serverRow=synced?out.find(x=>x?.__sharawla_server_baseline===true&&identityMatches(x,nativeRow)):null;
  if(serverRow){
   const reconciled={...clone(nativeRow),...clone(serverRow),client_tx_id:text(nativeRow.client_tx_id)||serverRow.client_tx_id||null,_local_entity_id:nativeRow._local_entity_id??serverRow._local_entity_id??null,_server_entity_id:nativeRow._server_entity_id??serverRow.id??null,_offline:false,_offline_sync_status:'synced',__sharawla_server_baseline:true};
   out=mergeByIdentity(out,[reconciled]);
  }else out=mergeByIdentity(out,[nativeRow]);
 }
 if(table==='orders'){
  for(const patch of (p.order_patches||[])){
   const serverRow=patch?._offline_status_pending===false?out.find(x=>x?.__sharawla_server_baseline===true&&identityMatches(x,patch)):null;
   if(serverRow)continue;
   // A status/driver patch targets the original local order identity. After the
   // sale ACK has mapped that identity to a canonical server id, the patch may
   // update operational fields but must never overwrite the canonical id.
   const target=out.find(x=>identityMatches(x,patch));
   const projected=target&&text(target.id)!==text(patch.id)?{...patch,id:target.id,_local_entity_id:target._local_entity_id??patch.id,_server_entity_id:target._server_entity_id??null}:patch;
   out=mergeByIdentity(out,[projected]);
  }
 }
 return out;
}

async function eligibleLegacyQueue(){
 const eligible=[];
 for(const job of await getQueue()){
  const own=await ownership55(job);
  if(legacyMayRead55(own.owner))eligible.push(job);else if(own.owner==='UNKNOWN')console.error('Offline ownership unresolved; operational projection read fail-closed',job?.client_tx_id,own.reason);
 }
 return eligible;
}
const HR_OFFLINE_SNAPSHOT_TABLES=new Set([
 'hr_employees','hr_attendance_daily_summary','hr_attendance_events','hr_leave_requests','hr_attendance_devices',
 'hr_work_schedules','hr_employee_schedule_assignments','hr_deduction_rules','hr_recurring_adjustments',
 'hr_employee_adjustments','hr_employee_advances','hr_payroll_items','hr_staff_accounts','hr_branch_geofences','hr_settings'
]);
async function compatibilityRows(table){
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
 else if(HR_OFFLINE_SNAPSHOT_TABLES.has(table)){const cached=await dbGet(`hrSnapshot:${branchId()}:${table}`);if(Array.isArray(cached))rows=cached}
 else if(table==='orders'){
   const bundles=await dbGet('cachedOrders')||[];rows=bundles.map(x=>x.order).filter(Boolean);
   const q=await eligibleLegacyQueue();rows=mergeByIdentity(rows,q.filter(x=>x.type==='sale'&&x.local_order).map(x=>({...x.local_order,client_tx_id:x.local_order.client_tx_id||x.client_tx_id})));
 }
 else if(table==='order_items'){
   const bundles=await dbGet('cachedOrders')||[];rows=bundles.flatMap(x=>x.items||[]);
   const q=await eligibleLegacyQueue();rows=mergeByIdentity(rows,q.filter(x=>x.type==='sale').flatMap(x=>(x.local_items||[]).map((r,i)=>({...r,_projection_key:`sale:${x.client_tx_id}:item:${r.line_uid||i+1}`}))));
 }
 else if(table==='order_payments'){
   const q=await eligibleLegacyQueue();rows=q.filter(x=>x.type==='sale').flatMap(x=>(x.p_payments||[]).map((p,i)=>({...p,order_id:x.local_order?.id||null,_projection_key:`sale:${x.client_tx_id}:payment:${i+1}`})));
 }
 else if(table==='expenses'){
   rows=(await dbGet('offlineV2Expenses'))||[];const q=await eligibleLegacyQueue();rows=mergeByIdentity(rows,q.filter(x=>x.type==='expense'&&x.local_expense).map(x=>({...x.local_expense,client_tx_id:x.local_expense.client_tx_id||x.client_tx_id})));
 }
 else if(table==='shifts'){
   rows=(await dbGet(`shiftHistory:${branchId()}`))||[];const c=await cachedShift();if(c&&!rows.some(x=>String(x.id)===String(c.id)))rows.unshift(c);
   const q=await eligibleLegacyQueue();rows=mergeByIdentity(rows,q.filter(x=>['shift_open','shift_close'].includes(x.type)&&x.local_shift).map(x=>({...x.local_shift,client_tx_id:x.local_shift.client_tx_id||x.client_tx_id})));
 }
 else if(table==='returns'){
   rows=(await dbGet(`cachedReturns:${branchId()}`))||[];const q=await eligibleLegacyQueue();rows=mergeByIdentity(rows,q.filter(x=>x.type==='return'&&x.local_return).map(x=>({...x.local_return,client_tx_id:x.local_return.client_tx_id||x.client_tx_id})));
 }
 else if(table==='return_items'){
   rows=(await dbGet('offlineV2ReturnItems'))||[];const q=await eligibleLegacyQueue();rows=mergeByIdentity(rows,q.filter(x=>x.type==='return').flatMap(x=>(x.local_items||[]).map((r,i)=>({...r,_projection_key:`return:${x.client_tx_id}:item:${r.line_uid||i+1}`}))));
 }
 else if(table==='return_payments'){
   rows=(await dbGet('offlineV2ReturnPayments'))||[];const q=await eligibleLegacyQueue();rows=mergeByIdentity(rows,q.filter(x=>x.type==='return').flatMap(x=>(x.local_payments||x.p_payments||[]).map((r,i)=>({...r,return_id:r.return_id||x.local_return?.id||null,_projection_key:`return:${x.client_tx_id}:payment:${i+1}`}))));
  }
 else if(table==='customers')rows=(await dbGet('customersCache'))||[];
 else if(table==='customer_addresses')rows=(await dbGet('customerAddressesCache'))||[];
 else if(table==='shift_bon_counters')rows=[];
 if(rows===null)return null;
 return clone(rows);
}
async function readOperationalRows(table,query='',baseline=null,baselineAuthoritative=false){
 const operational=['orders','order_items','order_payments','expenses','returns','return_items','return_payments','customers','customer_addresses','shifts'],compatibility=await compatibilityRows(table),supported=compatibility!==null||operational.includes(table);
 if(!supported&&!Array.isArray(baseline))return null;
 if(!operational.includes(table))return applyQuery(clone(Array.isArray(baseline)?baseline:(compatibility||[])),query);
 const serverBaseline=(Array.isArray(baseline)?baseline:[]).map(row=>baselineAuthoritative?({...clone(row),__sharawla_server_baseline:true}):clone(row));
 let rows=mergeByIdentity(compatibility||[],serverBaseline);
 rows=await mergeNative(table,rows);
 rows=rows.map(row=>{if(!row||row.__sharawla_server_baseline!==true)return row;const clean={...row};delete clean.__sharawla_server_baseline;return clean});
 if(table==='return_items'){
  const orderId=parseEq(query,'returns.order_id');
  if(orderId!==null){const returns=await readOperationalRows('returns',`order_id=eq.${encodeURIComponent(orderId)}`,[]),ids=new Set((returns||[]).map(x=>String(x.id)));rows=rows.filter(x=>ids.has(String(x.return_id)))}
 }
 return applyQuery(rows,query);
}
function remoteQueryForUnion(query){
 const parts=String(query||'').split('&').filter(Boolean),offset=Number(parts.find(x=>/^offset=\d+$/.test(x))?.slice(7)||0),limit=Number(parts.find(x=>/^limit=\d+$/.test(x))?.slice(6)||0);
 if(!limit)return query;
 return [...parts.filter(x=>!/^offset=\d+$/.test(x)&&!/^limit=\d+$/.test(x)),`limit=${offset+limit}`].join('&');
}

let baseRest=null;
async function restRecovery(table,query='',opt={}){
 const method=String(opt?.method||'GET').toUpperCase();
 if(method!=='GET'){
   if(!navigator.onLine)throw new Error('العملية دي تحتاج إنترنت. البيانات الحالية محفوظة ومش هتتمسح.');
   try{return await baseRest(table,query,opt)}catch(e){if(netError(e))throw new Error('العملية دي تحتاج اتصالًا بالإنترنت. لم يتم تأكيد أي تغيير؛ راجع البيانات بعد رجوع الاتصال قبل إعادة المحاولة.');throw e}
 }
 let networkFailed=false;
 if(onlineAuthorized()){
   try{const remote=await baseRest(table,remoteQueryForUnion(query),opt),rows=await readOperationalRows(table,query,remote,true);await dbSet(readKey(table,query),remote);clearFallback();return rows}catch(e){if(!netError(e))throw e;networkFailed=true}
 }
 const exact=await dbGet(readKey(table,query));if(Array.isArray(exact)){publishFallback(table,networkFailed?'network-failure':'offline');return readOperationalRows(table,query,clone(exact))}
 const local=await readOperationalRows(table,query,null);if(local!==null){publishFallback(table,networkFailed?'network-failure':'offline');return local}
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
 try{const sh=await baseGetOpenShift(employee,branch);if(sh)await rememberShift(sh);return sh}catch(e){if(netError(e))return (await cachedShift())||(await pendingLocalShift())||null;throw e}
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
 if(warmCachesPromise)return warmCachesPromise;
 if(Date.now()-lastWarmCachesAt<60000)return false;
 warmCachesPromise=(async()=>{
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
,
  // Restaurant Offline Read Foundation: deterministic screen snapshots.
  ['ingredients','select=*&order=active.desc,name'],
  ['ingredient_stock',`select=*&branch_id=eq.${b}`],
  ['inventory_units','select=*&active=eq.true&order=sort_order,code'],
  ['products','select=id,name,active&active=eq.true&order=name'],
  ['product_variants','select=id,product_id,name,active&active=eq.true&order=product_id,id'],
  ['food_recipe_headers','select=*&order=id'],
  ['food_recipe_headers','select=*&recipe_kind=eq.prep'],
  ['food_recipe_versions','select=*&order=recipe_id,version_no.desc'],
  ['food_recipe_branch_cost_v1',`select=*&branch_id=eq.${b}`],
  ['food_prep_items','select=*&order=active.desc,name'],
  ['food_production_batches',`select=*&branch_id=eq.${b}&order=created_at.desc&limit=100`],
  ['food_production_consumptions','select=*'],
  ['food_waste_reasons','select=*&active=eq.true&order=sort_order'],
  ['food_waste_events',`select=*&branch_id=eq.${b}&order=occurred_at.desc&limit=100`],
  ['food_menu_costing_v1',`select=*&branch_id=eq.${b}&order=food_cost_percent.desc`],
  ['food_theoretical_consumption_net_v1',`select=*&branch_id=eq.${b}&order=business_date.desc`],
  ['suppliers','select=*&order=active.desc,name'],
  ['suppliers','select=*&active=is.true&order=name'],
  ['purchases',`select=*&branch_id=eq.${b}&order=created_at.desc&limit=100`],
  ['purchase_items','select=*'],
  ['food_purchase_receipts',`select=*&branch_id=eq.${b}&order=received_at.desc&limit=100`],
  ['branches','select=id,name,active&active=eq.true&order=sort_order,id'],
  ['stock_transfers',`select=*&or=(from_branch_id.eq.${b},to_branch_id.eq.${b})&order=created_at.desc&limit=100`],
  ['stock_transfer_items','select=*'],
  ['restaurant_floors',`select=*&branch_id=eq.${b}&order=sort_order,id`],
  ['restaurant_tables',`select=*&branch_id=eq.${b}&order=floor_id,id`],
  ['restaurant_table_sessions',`select=*&branch_id=eq.${b}&order=opened_at.desc&limit=200`],
  ['restaurant_table_session_orders','select=*'],
  // HR read-only Offline snapshots. Mutations remain server-authoritative/Online-only.
  ['hr_employees','select=*&active=eq.true&order=name'],
  ['hr_attendance_daily_summary',`select=*&branch_id=eq.${b}&order=work_date.desc&limit=2000`],
  ['hr_attendance_events',`select=*&branch_id=eq.${b}&order=captured_at_device.desc&limit=5000`],
  ['hr_leave_requests','select=*&order=created_at.desc&limit=2000'],
  ['hr_attendance_devices','select=*'],
  ['hr_work_schedules',`select=*&branch_id=eq.${b}&order=active.desc,name`],
  ['hr_employee_schedule_assignments',`select=*&branch_id=eq.${b}&order=effective_from.desc`],
  ['hr_deduction_rules','select=*&order=active.desc,id.desc'],
  ['hr_recurring_adjustments','select=*&order=created_at.desc&limit=2000'],
  ['hr_employee_adjustments','select=*&order=effective_date.desc&limit=5000'],
  ['hr_employee_advances','select=*&order=requested_on.desc&limit=5000'],
  ['hr_payroll_items','select=*&order=id.desc&limit=5000'],
  ['hr_staff_accounts','select=*'],
  ['hr_branch_geofences',`select=*&branch_id=eq.${b}`],
  ['hr_settings',`select=*&branch_id=eq.${b}`],
  ['orders',`select=id,invoice_number,bon_number,total,status,created_at,order_type&branch_id=eq.${b}&order_type=eq.dinein&order=created_at.desc&limit=100`] ];
 for(const [t,q] of calls){try{const rows=await baseRest(t,q);await dbSet(readKey(t,q),rows);if(HR_OFFLINE_SNAPSHOT_TABLES.has(t))await dbSet(`hrSnapshot:${b}:${t}`,rows);if(t==='shifts')await dbSet(`shiftHistory:${b}`,rows);if(t==='orders'){const bundles=(await dbGet('cachedOrders'))||[],itemsByOrder=new Map();for(const x of ((await dbGet(readKey('order_items','select=*&order_id=not.is.null&order=id.desc&limit=5000')))||[])){const k=String(x.order_id);if(!itemsByOrder.has(k))itemsByOrder.set(k,[]);itemsByOrder.get(k).push(x)}await dbSet('cachedOrders',rows.map(o=>({order:o,items:itemsByOrder.get(String(o.id))||[]})).concat(bundles.filter(x=>!rows.some(o=>String(o.id)===String(x.order?.id)))).slice(0,500))}if(t==='customers')await dbSet('customersCache',rows);if(t==='customer_addresses')await dbSet('customerAddressesCache',rows)}catch{}}
 try{await getOpenShiftRecovery(employeeId(),b)}catch{}
 lastWarmCachesAt=Date.now();
 return true;
 })();
 try{return await warmCachesPromise}finally{warmCachesPromise=null}
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
 global.__SharawlaBeta554RuntimeRecovery=Object.freeze({version:VERSION,installed:true,warmRuntimeCaches,reconcileOpenShiftBeforeSync,syncNow:syncRecovery,readOperationalRows,offlineReadFallback:true,openShiftContinuity:true,reconnectReconcile:true,officialNumberServerAssigned:true,bonSequencing:false,ownershipGate:true,cacheFallbackState:()=>clone(cacheFallbackState)});
 global.dispatchEvent(new CustomEvent('sharawla-beta55-4-runtime-recovery-ready',{detail:{version:VERSION}}));
 return true;
}
function start(){let tries=0;const t=setInterval(()=>{tries++;if(install()||tries>=80)clearInterval(t)},75)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
