(function(global){
'use strict';

// Sharawla Offline Engine V2 — Phase 5 renderer bridge.
// Registers transport-ready operation adapters and supplies only the current
// authenticated session to the main-process sync transport. It never arms or
// activates takeover automatically.
const VERSION='10.5.4-beta.45-dev-phase5';
const CONNECTION_KEY='sharawlaBusinessConnectionV1';
let syncing=false,timer=null;

function text(v){return String(v??'').trim()}
function num(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function nowIso(){return new Date().toISOString()}
function runtimeBranch(){try{return num(typeof currentBranchId==='function'?currentBranchId():state?.activeBranchId)}catch{return 0}}
function runtimeEmployee(){try{return num(state?.employee?.id)}catch{return 0}}
function retailProfile(){try{return typeof isRetailProfile==='function'&&isRetailProfile()}catch{return false}}
function localShiftTx(v){const s=text(v);return s.startsWith('offline-shift-')?s.slice('offline-shift-'.length):null}
function localOrderTx(v){const s=text(v);if(!s.startsWith('offline-')||s.startsWith('offline-shift-')||s.startsWith('offline-ret-')||s.startsWith('offline-exp-')||s.startsWith('offline-movement-'))return null;return s.slice('offline-'.length)||null}
function deterministicLocalId(type,tx){
  if(type==='sale')return `offline-${tx}`;
  if(type==='return')return `offline-ret-${tx}`;
  if(type==='expense')return `offline-exp-${tx}`;
  if(type==='shift_open')return `offline-shift-${tx}`;
  if(type==='shift_close')return `offline-shift-close-${tx}`;
  return `offline-${type}-${tx}`;
}
function foodApi(){return global.__SharawlaFoodRecipeRuntimeV1||null}
function variantsApi(){return global.__SharawlaRetailVariantsRuntimeV1||null}
function foodOn(){try{return foodApi()?.operational?.()===true}catch{return false}}
function variantsOn(){try{return variantsApi()?.operational?.()===true}catch{return false}}
function enrichSaleItems(items){
  let out=clone(items||[]);
  try{if(variantsOn()&&typeof variantsApi()?.enrichSaleItems==='function')out=variantsApi().enrichSaleItems(out)}catch{}
  try{if(foodOn()&&typeof foodApi()?.enrich==='function')out=foodApi().enrich(out)}catch{}
  return out;
}
function resolveSale(payload={}){
  const p=clone(payload||{});p.p_items=enrichSaleItems(p.p_items||[]);
  if(retailProfile()){
    if(foodOn())return {rpc_name:'create_food_retail_pos_order_atomic_v1',rpc_payload:{...p,p_use_variants:variantsOn()||foodApi()?.variantsOperational?.()===true}};
    if(variantsOn())return {rpc_name:'create_retail_variant_pos_order_atomic_v1',rpc_payload:p};
    return {rpc_name:'create_retail_pos_order_atomic',rpc_payload:p};
  }
  return foodOn()?{rpc_name:'create_food_pos_order_atomic_v1',rpc_payload:p}:{rpc_name:'create_pos_order_atomic',rpc_payload:p};
}
function resolveReturn(payload={}){
  const p=clone(payload||{});
  if(retailProfile()){
    if(foodOn())return {rpc_name:'create_food_retail_order_return_idempotent_v1',rpc_payload:{...p,p_use_variants:variantsOn()||foodApi()?.variantsOperational?.()===true}};
    if(variantsOn())return {rpc_name:'create_retail_variant_order_return_idempotent_v1',rpc_payload:p};
    return {rpc_name:'create_retail_order_return_idempotent',rpc_payload:p};
  }
  return foodOn()?{rpc_name:'create_food_order_return_idempotent_v1',rpc_payload:p}:{rpc_name:'create_order_return_idempotent',rpc_payload:p};
}
function resolveOperation(type,payload){
  if(type==='sale')return resolveSale(payload);
  if(type==='return')return resolveReturn(payload);
  if(type==='expense')return {rpc_name:'create_pos_expense_idempotent',rpc_payload:clone(payload)};
  if(type==='shift_open')return {rpc_name:'open_pos_shift_idempotent',rpc_payload:clone(payload)};
  if(type==='shift_close')return {rpc_name:'close_pos_shift_idempotent',rpc_payload:clone(payload)};
  throw new Error(`Offline V2 transport target is not registered: ${type}`);
}
function dependencyTx(type,payload={}){
  if(type==='sale')return localShiftTx(payload?.p_order?.shift_id);
  if(type==='expense'||type==='shift_close')return localShiftTx(payload?.p_shift_id);
  if(type==='return')return localOrderTx(payload?.p_order_id);
  return null;
}
function shiftId(type,payload={}){
  if(type==='sale')return text(payload?.p_order?.shift_id)||null;
  if(type==='expense'||type==='shift_close')return text(payload?.p_shift_id)||null;
  return null;
}
function recordsFor(type,entityType,localId,rpcPayload,created){
  if(type==='sale'){
    const order={...(clone(rpcPayload.p_order)||{}),id:localId,_offline:true};
    const rows=[{record_type:'order',local_id:localId,payload:order,created_local_at:created}];
    (rpcPayload.p_items||[]).forEach((item,i)=>rows.push({record_type:'order_item',local_id:`${localId}-i${i+1}`,parent_local_id:localId,payload:{...clone(item),order_id:localId},created_local_at:created}));
    (rpcPayload.p_payments||[]).forEach((p,i)=>rows.push({record_type:'payment',local_id:`${localId}-p${i+1}`,parent_local_id:localId,payload:{...clone(p),order_id:localId},created_local_at:created}));
    return rows;
  }
  return [{record_type:entityType,local_id:localId,payload:clone(rpcPayload),created_local_at:created}];
}
function adapter(type,entityType,rpcNames){
  return {
    rpcNames,
    extractTx:p=>type==='sale'?text(p?.p_order?.client_tx_id||p?.p_client_tx_id):text(p?.p_client_tx_id||p?.client_tx_id),
    buildCommit:({payload,clientTx,identity,createdAt})=>{
      const resolved=resolveOperation(type,payload),created=createdAt||nowIso(),localId=deterministicLocalId(type,clientTx),order=resolved.rpc_payload?.p_order||{};
      const branchId=num(order.branch_id??resolved.rpc_payload?.p_branch_id,runtimeBranch()),employeeId=num(order.employee_id??resolved.rpc_payload?.p_employee_id,runtimeEmployee());
      return {
        client_tx_id:clientTx,device_id:identity.device_id,business_id:identity.business_id,branch_id:branchId,employee_id:employeeId,
        operation_type:type,entity_type:entityType,local_entity_id:localId,local_shift_id:shiftId(type,resolved.rpc_payload),depends_on_tx_id:dependencyTx(type,resolved.rpc_payload),
        created_local_at:created,protocol_version:2,schema_version:2,status:'pending',
        payload:{rpc_name:resolved.rpc_name,rpc_payload:clone(resolved.rpc_payload)},
        records:recordsFor(type,entityType,localId,resolved.rpc_payload,created)
      };
    }
  };
}

function registerTransportAdapters(){
  const t=global.SharawlaOfflineV2Takeover;if(!t?.registerOperation)return false;
  t.registerOperation('sale',adapter('sale','order',[
    'create_pos_order_atomic','create_retail_pos_order_atomic','create_retail_variant_pos_order_atomic_v1','create_food_pos_order_atomic_v1','create_food_retail_pos_order_atomic_v1'
  ]));
  t.registerOperation('return',adapter('return','return',[
    'create_order_return_idempotent','create_retail_order_return_idempotent','create_retail_variant_order_return_idempotent_v1','create_food_order_return_idempotent_v1','create_food_retail_order_return_idempotent_v1'
  ]));
  t.registerOperation('expense',adapter('expense','expense',['create_pos_expense_idempotent']));
  t.registerOperation('shift_open',adapter('shift_open','shift',['open_pos_shift_idempotent']));
  t.registerOperation('shift_close',adapter('shift_close','shift_event',['close_pos_shift_idempotent']));
  return true;
}

function connection(){try{return JSON.parse(localStorage.getItem(CONNECTION_KEY)||'null')}catch{return null}}
async function syncContext(){
  if(typeof refreshSessionIfNeeded==='function')try{await refreshSessionIfNeeded()}catch{}
  const st=typeof loadLicenseState==='function'?await loadLicenseState():null,c=connection();
  const token=typeof session!=='undefined'?text(session?.access_token):'';
  if(!st?.device_id||!st?.business_id||!st?.device_fingerprint||!c?.url||!c?.key||!token||runtimeEmployee()<=0)throw new Error('Offline V2 authenticated sync context is unavailable');
  return {url:c.url,key:c.key,access_token:token,device_id:st.device_id,business_id:st.business_id,device_fingerprint:st.device_fingerprint,employee_id:runtimeEmployee()};
}
async function syncNow(){
  if(syncing)return {ok:true,skipped:'renderer_sync_running'};
  const api=global.topBurgerDesktop?.offlineV2;if(!api?.syncNow)return {ok:true,skipped:'transport_unavailable'};
  const state=await api.takeoverState();if(state?.active!==true||state?.migration_verified!==true||state?.transport_ready!==true)return {ok:true,skipped:'takeover_inactive'};
  syncing=true;try{return await api.syncNow(await syncContext())}finally{syncing=false}
}
async function attestTransport(){const api=global.topBurgerDesktop?.offlineV2;if(!api?.transportAttest)throw new Error('Offline V2 transport attestation unavailable');return api.transportAttest({...await syncContext(),approved:true})}
async function manualRetry(clientTx){
  const api=global.topBurgerDesktop?.offlineV2;if(!api?.manualRetry)throw new Error('Offline V2 manual retry unavailable');
  const c=await syncContext();const r=await api.manualRetry({client_tx_id:text(clientTx),device_id:c.device_id,business_id:c.business_id,device_fingerprint:c.device_fingerprint});
  try{await syncNow()}catch{}return r;
}
function start(){
  if(!registerTransportAdapters())return setTimeout(start,80);
  global.addEventListener('online',()=>{syncNow().catch(e=>console.warn('Offline V2 online sync',e))});
  timer=setInterval(()=>{if(navigator.onLine)syncNow().catch(()=>{})},15_000);
  global.SharawlaOfflineV2Transport=Object.freeze({version:VERSION,syncNow,manualRetry,attestTransport,resolveSale,resolveReturn,registerTransportAdapters});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
