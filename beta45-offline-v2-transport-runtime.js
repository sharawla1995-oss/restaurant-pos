(function(global){
'use strict';

// Sharawla Offline Engine V2 — Phase 5 renderer bridge.
// Once controlled takeover is active, mapped operational RPCs use the V2
// outbox/explicit-ACK transport as their only network authority. Inactive mode
// delegates unchanged to the protected Phase 4/legacy runtime.
const VERSION='10.5.4-beta.50';
const CONNECTION_KEY='sharawlaBusinessConnectionV1';
const FALLBACK_CONTEXT_MS=30_000;
const adaptersByType=new Map();
const typeByRpc=new Map();
const fallbackByType=new Map();
let syncing=false,timer=null,bridge=null,installed=false;

function text(v){return String(v??'').trim()}
function num(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function nowIso(){return new Date().toISOString()}
function uid(){try{return typeof uuid==='function'?uuid():crypto.randomUUID()}catch{return `${Date.now()}-${Math.random().toString(16).slice(2)}`}}
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
    type,entityType,rpcNames,
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

function registerOne(type,a){
  const t=global.SharawlaOfflineV2Takeover;if(!t?.registerOperation)return false;
  adaptersByType.set(type,a);for(const name of a.rpcNames||[])typeByRpc.set(name,type);t.registerOperation(type,a);return true;
}
function registerTransportAdapters(){
  const t=global.SharawlaOfflineV2Takeover;if(!t?.registerOperation)return false;
  registerOne('sale',adapter('sale','order',[
    'create_pos_order_atomic','create_retail_pos_order_atomic','create_retail_variant_pos_order_atomic_v1','create_food_pos_order_atomic_v1','create_food_retail_pos_order_atomic_v1'
  ]));
  registerOne('return',adapter('return','return',[
    'create_order_return_idempotent','create_retail_order_return_idempotent','create_retail_variant_order_return_idempotent_v1','create_food_order_return_idempotent_v1','create_food_retail_order_return_idempotent_v1'
  ]));
  registerOne('expense',adapter('expense','expense',['create_pos_expense_idempotent']));
  registerOne('shift_open',adapter('shift_open','shift',['open_pos_shift_idempotent']));
  registerOne('shift_close',adapter('shift_close','shift_event',['close_pos_shift_idempotent']));
  return true;
}

function connection(){try{return JSON.parse(localStorage.getItem(CONNECTION_KEY)||'null')}catch{return null}}
async function canonicalIdentity(){
  const st=typeof loadLicenseState==='function'?await loadLicenseState():null;
  const identity={device_id:text(st?.device_id),business_id:text(st?.business_id),device_fingerprint:text(st?.device_fingerprint)};
  if(!identity.device_id||!identity.business_id||!identity.device_fingerprint){const e=new Error('Offline V2 canonical device identity is required');e.code='OFFLINE_V2_CANONICAL_IDENTITY_REQUIRED';throw e}
  return identity;
}
async function syncContext(){
  if(typeof refreshSessionIfNeeded==='function')try{await refreshSessionIfNeeded()}catch{}
  const st=await canonicalIdentity(),c=connection();
  const token=typeof session!=='undefined'?text(session?.access_token):'';
  if(!c?.url||!c?.key||!token||runtimeEmployee()<=0)throw new Error('Offline V2 authenticated sync context is unavailable');
  return {url:c.url,key:c.key,access_token:token,device_id:st.device_id,business_id:st.business_id,device_fingerprint:st.device_fingerprint,employee_id:runtimeEmployee()};
}
async function syncNow(){
  if(syncing)return {ok:true,skipped:'renderer_sync_running'};
  const api=global.topBurgerDesktop?.offlineV2;if(!api?.syncNow)return {ok:true,skipped:'transport_unavailable'};
  const st=await api.takeoverState();if(st?.active!==true||st?.migration_verified!==true||st?.transport_ready!==true)return {ok:true,skipped:'takeover_inactive'};
  syncing=true;try{return await api.syncNow(await syncContext())}finally{syncing=false}
}
async function attestTransport(){const api=global.topBurgerDesktop?.offlineV2;if(!api?.transportAttest)throw new Error('Offline V2 transport attestation unavailable');return api.transportAttest({...await syncContext(),approved:true})}
async function manualRetry(clientTx){
  const api=global.topBurgerDesktop?.offlineV2;if(!api?.manualRetry)throw new Error('Offline V2 manual retry unavailable');
  const c=await syncContext();const r=await api.manualRetry({client_tx_id:text(clientTx),device_id:c.device_id,business_id:c.business_id,device_fingerprint:c.device_fingerprint});
  try{await syncNow()}catch{}return r;
}
async function activeState(){const api=global.topBurgerDesktop?.offlineV2;if(!api?.takeoverState)return null;const st=await api.takeoverState();return st?.active===true&&st?.migration_verified===true&&st?.transport_ready===true?st:null}
function rememberFallback(type,tx){fallbackByType.set(type,{tx:text(tx),at:Date.now()})}
function consumeFallback(type){const x=fallbackByType.get(type);if(!x)return null;fallbackByType.delete(type);return Date.now()-x.at<=FALLBACK_CONTEXT_MS?x:null}
function networkDeferred(type,tx,row=null){rememberFallback(type,tx);const e=new TypeError('Failed to fetch');e.code=text(row?.last_error_code)||'OFFLINE_V2_DEFERRED';e.offline_v2_status=text(row?.status)||'pending';return e}
function durableError(row,tx){const e=new Error(text(row?.last_error_message)||`Offline V2 sync failed: ${text(row?.status)||'unknown'}`);e.code=text(row?.last_error_code)||'OFFLINE_V2_SYNC_TERMINAL';e.client_tx_id=text(tx);e.kind=row?.status==='conflict'?'business_conflict':'permanent';return e}
function numericServerId(v){const n=Number(v);return Number.isFinite(n)&&n>0}
function mustUseOriginalEntityFallback(type,payload={}){
  if(type==='expense'||type==='shift_close')return !numericServerId(payload?.p_shift_id);
  if(type==='return')return !numericServerId(payload?.p_order_id);
  return false;
}
function unwrapResult(type,row){const result=row?.server_ack?.result;if(type==='return'){const n=Number(result?.return_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 return ACK missing return_id');return n}if(result===undefined||result===null)throw new Error('Offline V2 ACK missing operational result');return clone(result)}

async function ensureEvent(type,payload,tx){
  const api=global.topBurgerDesktop?.offlineV2;if(!api?.event||!api?.commitOperation)throw new Error('Offline V2 event bridge unavailable');
  let row=await api.event(tx);if(row)return row;
  const a=adaptersByType.get(type);if(!a)throw new Error(`Offline V2 transport adapter missing: ${type}`);
  const identity=await canonicalIdentity();
  await api.commitOperation(a.buildCommit({payload:clone(payload),clientTx:tx,identity,createdAt:nowIso()}));
  row=await api.event(tx);if(!row)throw new Error(`Offline V2 durable event missing after commit: ${tx}`);return row;
}
async function authoritativeRpc(name,payload={}){
  const type=typeByRpc.get(text(name));
  if(!type||!(await activeState()))return bridge.rpc(name,payload);
  const a=adaptersByType.get(type),tx=text(a?.extractTx?.(payload));
  if(!tx){const e=new Error(`Offline V2 operational RPC requires client_tx_id: ${type}`);e.code='OFFLINE_V2_CLIENT_TX_REQUIRED';throw e}
  if(mustUseOriginalEntityFallback(type,payload))throw networkDeferred(type,tx);
  let row=await ensureEvent(type,payload,tx);
  if(row.last_error_code==='OFFLINE_V2_LEGACY_PRESERVED'){const e=durableError(row,tx);e.code='OFFLINE_V2_LEGACY_AUTHORITY_ACTIVE';throw e}
  if(row.status==='synced')return unwrapResult(type,row);
  try{await syncNow()}catch(e){/* row state below is authoritative */}
  row=await global.topBurgerDesktop.offlineV2.event(tx);
  if(row?.status==='synced')return unwrapResult(type,row);
  if(row?.last_error_code==='OFFLINE_V2_LEGACY_PRESERVED'){const e=durableError(row,tx);e.code='OFFLINE_V2_LEGACY_AUTHORITY_ACTIVE';throw e}
  if(row?.status==='conflict'||row?.status==='dead_letter')throw durableError(row,tx);
  // pending/retryable/syncing/dependency/auth blocked are durable local work and
  // must flow through the caller's existing offline-success branch, never through
  // the legacy server RPC.
  throw networkDeferred(type,tx,row);
}

function installFallbackWrappers(){
  const saveExpense=bridge.saveOfflineExpense,saveShiftOpen=bridge.saveOfflineShiftOpen,saveReturn=bridge.saveOfflineReturn,saveShiftClose=bridge.saveOfflineShiftClose;
  if(saveExpense){const f=async(shift,description,amount,provided=null)=>{const x=provided?null:consumeFallback('expense');return saveExpense(shift,description,amount,provided||x?.tx||null)};try{saveOfflineExpense=f}catch{};global.saveOfflineExpense=f}
  if(saveShiftOpen){const f=async(opening,provided=null)=>{const x=provided?null:consumeFallback('shift_open');return saveShiftOpen(opening,provided||x?.tx||null)};try{saveOfflineShiftOpen=f}catch{};global.saveOfflineShiftOpen=f}
  if(saveReturn){const f=async(o,selected,reason,notes,method,total,available,provided=null)=>{const x=provided?null:consumeFallback('return');return saveReturn(o,selected,reason,notes,method,total,available,provided||x?.tx||null)};try{saveOfflineReturn=f}catch{};global.saveOfflineReturn=f}
  if(saveShiftClose){const f=async(shift,metrics,actual,provided=null)=>{const x=provided?null:consumeFallback('shift_close');return saveShiftClose(shift,metrics,actual,provided||x?.tx||null)};try{saveOfflineShiftClose=f}catch{};global.saveOfflineShiftClose=f}
}
function captureBridge(){
  const r=(typeof rpc==='function'?rpc:global.rpc);
  if(typeof r!=='function')return false;
  bridge={rpc:r,saveOfflineExpense:(typeof saveOfflineExpense==='function'?saveOfflineExpense:global.saveOfflineExpense),saveOfflineShiftOpen:(typeof saveOfflineShiftOpen==='function'?saveOfflineShiftOpen:global.saveOfflineShiftOpen),saveOfflineReturn:(typeof saveOfflineReturn==='function'?saveOfflineReturn:global.saveOfflineReturn),saveOfflineShiftClose:(typeof saveOfflineShiftClose==='function'?saveOfflineShiftClose:global.saveOfflineShiftClose)};
  return true;
}
function installAuthority(){
  if(installed)return true;if(!captureBridge())return false;
  try{rpc=authoritativeRpc}catch{};global.rpc=authoritativeRpc;installFallbackWrappers();installed=true;return true;
}
function start(){
  if(!registerTransportAdapters())return setTimeout(start,80);
  if(!installAuthority())return setTimeout(start,80);
  global.addEventListener('online',()=>{syncNow().catch(e=>console.warn('Offline V2 online sync',e))});
  timer=setInterval(()=>{if(navigator.onLine)syncNow().catch(()=>{})},15_000);
  global.SharawlaOfflineV2Transport=Object.freeze({version:VERSION,syncNow,manualRetry,attestTransport,resolveSale,resolveReturn,registerTransportAdapters,authoritativeRpc});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
