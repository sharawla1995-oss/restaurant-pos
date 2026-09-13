(function(global){
'use strict';

// Sharawla Offline Engine V2 — Phase 4 runtime takeover bridge.
// Generic by operation type, not by business profile. Restaurant/Retail/
// Pharmacy/Logistics/Warehouse/Service/Membership can register handlers without
// changing the Offline V2 core.
const VERSION='10.5.4-beta.50';
const FALLBACK_CONTEXT_MS=30_000;
const registry=new Map();
const rpcToOperation=new Map();
const committedThisSession=new Map();
const failedFallback=new Map();
let migrationLock=false;
let installed=false;
let base=null;

function text(v){return String(v??'').trim()}
function num(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function nowIso(){return new Date().toISOString()}
function uid(){try{return typeof uuid==='function'?uuid():crypto.randomUUID()}catch{return `${Date.now()}-${Math.random().toString(16).slice(2)}`}}
function offlineShiftTx(v){const s=text(v);return s.startsWith('offline-shift-')?s.slice('offline-shift-'.length):null}
function runtimeBranch(){try{return num(typeof currentBranchId==='function'?currentBranchId():state?.activeBranchId)}catch{return 0}}
function runtimeEmployee(){try{return num(state?.employee?.id)}catch{return 0}}

async function canonicalIdentity(){
  if(typeof loadLicenseState!=='function')throw Object.assign(new Error('Offline V2 requires persisted license state'),{code:'OFFLINE_V2_LICENSE_STATE_REQUIRED'});
  const st=await loadLicenseState();
  const identity={device_id:text(st?.device_id),business_id:text(st?.business_id),device_fingerprint:text(st?.device_fingerprint)};
  if(!identity.device_id||!identity.business_id||!identity.device_fingerprint){
    const e=new Error('Offline V2 requires canonical device identity before migration/takeover');e.code='OFFLINE_V2_CANONICAL_IDENTITY_REQUIRED';throw e;
  }
  try{
    const runtimeBusiness=text(state?.business?.id||global.sharawlaRuntimeConfig?.business_id);
    if(runtimeBusiness&&runtimeBusiness!==identity.business_id){const e=new Error('Offline V2 business identity mismatch');e.code='OFFLINE_V2_BUSINESS_IDENTITY_MISMATCH';throw e}
  }catch(e){if(e?.code)throw e}
  return identity;
}
function desktopApi(){const api=global.topBurgerDesktop?.offlineV2;if(!api?.commitOperation||!api?.takeoverState)throw new Error('Offline V2 desktop bridge unavailable');return api}
async function takeoverState(){return desktopApi().takeoverState()}
async function isTakeoverActive(){const s=await takeoverState();return s?.active===true&&s?.migration_verified===true&&s?.transport_ready===true}

function registerOperation(type,adapter={}){
  type=text(type);
  if(!type)throw new Error('Offline V2 operation type is required');
  if(typeof adapter.buildCommit!=='function')throw new Error(`Offline V2 ${type} adapter requires buildCommit`);
  registry.set(type,Object.freeze({...adapter,type}));
  for(const name of (adapter.rpcNames||[]))registerRpc(name,type);
  return registry.get(type);
}
function registerRpc(rpcName,type){
  rpcName=text(rpcName);type=text(type);
  if(!rpcName||!registry.has(type))throw new Error('Offline V2 registerRpc requires known operation type');
  rpcToOperation.set(rpcName,type);return true;
}
function operationForRpc(name){const type=rpcToOperation.get(text(name));return type?registry.get(type):null}

function scopeFrom(payload={},identity){
  const order=payload?.p_order||{};
  return {
    device_id:identity.device_id,business_id:identity.business_id,
    branch_id:num(order.branch_id??payload.p_branch_id,runtimeBranch()),
    employee_id:num(order.employee_id??payload.p_employee_id,runtimeEmployee())
  };
}
function txFromPayload(type,payload={}){
  if(type==='sale')return text(payload?.p_order?.client_tx_id||payload?.p_client_tx_id);
  return text(payload?.p_client_tx_id||payload?.client_tx_id);
}
function shiftFromPayload(type,payload={}){
  if(type==='sale')return text(payload?.p_order?.shift_id)||null;
  return text(payload?.p_shift_id)||null;
}
function deterministicLocalId(type,tx){
  if(type==='sale')return `offline-${tx}`;
  if(type==='return')return `offline-ret-${tx}`;
  if(type==='expense')return `offline-exp-${tx}`;
  if(type==='shift_open')return `offline-shift-${tx}`;
  if(type==='shift_close')return `offline-shift-close-${tx}`;
  if(type==='customer_create')return `offline-customer-${tx}`;
  if(type==='inventory_movement')return `offline-movement-${tx}`;
  if(type==='order_status')return `offline-order-event-${tx}`;
  return `offline-${type}-${tx}`;
}
function recordsFor(type,entityType,localId,payload,created){
  if(type==='sale'){
    const order={...(clone(payload.p_order)||{}),id:localId,client_tx_id:text(payload?.p_order?.client_tx_id),_offline:true};
    const rows=[{record_type:'order',local_id:localId,payload:order,created_local_at:created}];
    (payload.p_items||[]).forEach((item,i)=>rows.push({record_type:'order_item',local_id:`${localId}-i${i+1}`,parent_local_id:localId,payload:{...clone(item),order_id:localId},created_local_at:created}));
    (payload.p_payments||[]).forEach((p,i)=>rows.push({record_type:'payment',local_id:`${localId}-p${i+1}`,parent_local_id:localId,payload:{...clone(p),order_id:localId},created_local_at:created}));
    return rows;
  }
  return [{record_type:entityType,local_id:localId,payload:clone(payload),created_local_at:created}];
}
function genericBuild(type,entityType,{payload,clientTx,identity,createdAt}){
  const scope=scopeFrom(payload,identity),localShiftId=shiftFromPayload(type,payload),localId=deterministicLocalId(type,clientTx),created=createdAt||nowIso();
  return {
    client_tx_id:clientTx,...scope,
    operation_type:type,entity_type:entityType,local_entity_id:localId,
    local_shift_id:localShiftId,
    depends_on_tx_id:offlineShiftTx(localShiftId),
    created_local_at:created,protocol_version:2,schema_version:2,status:'pending',
    payload:{rpc_payload:clone(payload)},
    records:recordsFor(type,entityType,localId,payload,created)
  };
}
function standardAdapter(type,entityType,rpcNames=[]){return {rpcNames,extractTx:p=>txFromPayload(type,p),buildCommit:ctx=>genericBuild(type,entityType,ctx)}}

// Generic core operation catalog. Profile-specific modules may add aliases or
// entirely new operations (shipment.*, warehouse.*, service.*, etc.) at runtime.
registerOperation('sale',standardAdapter('sale','order',[
  'create_pos_order_atomic','create_retail_pos_order_atomic','create_food_retail_pos_order_atomic_v1'
]));
registerOperation('return',standardAdapter('return','return',[
  'create_order_return_idempotent','create_retail_order_return_idempotent','create_food_retail_order_return_idempotent_v1'
]));
registerOperation('expense',standardAdapter('expense','expense',['create_pos_expense_idempotent']));
registerOperation('shift_open',standardAdapter('shift_open','shift',['open_pos_shift_idempotent']));
registerOperation('shift_close',standardAdapter('shift_close','shift_event',['close_pos_shift_idempotent']));
registerOperation('customer_create',standardAdapter('customer_create','customer'));
registerOperation('inventory_movement',standardAdapter('inventory_movement','inventory_movement'));
registerOperation('order_status',standardAdapter('order_status','order_event'));

async function ensureCommitted(type,payload,forcedTx=null){
  const adapter=registry.get(type);if(!adapter)throw new Error(`Offline V2 adapter missing: ${type}`);
  const tx=text(forcedTx||adapter.extractTx?.(payload)||txFromPayload(type,payload));
  if(!tx){const e=new Error(`Offline V2 operational RPC requires client_tx_id: ${type}`);e.code='OFFLINE_V2_CLIENT_TX_REQUIRED';throw e}
  if(committedThisSession.has(tx))return committedThisSession.get(tx);
  const identity=await canonicalIdentity();
  const createdAt=nowIso();
  const commit=adapter.buildCommit({payload:clone(payload),clientTx:tx,identity,createdAt});
  const result=await desktopApi().commitOperation(commit);
  const entry={type,tx,commit,result,createdAt};committedThisSession.set(tx,entry);return entry;
}
function rememberFailed(type,entry,rpcName,payload,error){failedFallback.set(type,{...entry,rpcName,payload:clone(payload),error,at:Date.now()})}
function consumeFailed(type){const c=failedFallback.get(type);if(!c)return null;failedFallback.delete(type);return Date.now()-c.at<=FALLBACK_CONTEXT_MS?c:null}
function localDependencyError(){const e=new TypeError('Failed to fetch');e.code='OFFLINE_V2_LOCAL_DEPENDENCY_PENDING';return e}
function numericServerId(v){const n=Number(v);return Number.isFinite(n)&&n>0}
function mustFallbackBeforeCommit(type,payload={}){
  if(type==='expense'||type==='shift_close')return !numericServerId(payload?.p_shift_id);
  if(type==='return')return !numericServerId(payload?.p_order_id);
  return false;
}
function mustDeferAfterCommit(type,payload={}){
  if(type==='sale')return offlineShiftTx(payload?.p_order?.shift_id)!==null;
  return false;
}

function localSaleResult(entry,payload){
  const localId=entry.commit.local_entity_id,created=entry.commit.created_local_at,code=`OFF-${entry.tx.slice(0,8)}`;
  const order={...(clone(payload.p_order)||{}),id:localId,client_tx_id:entry.tx,invoice_number:code,bon_number:code,created_at:created,payment_status:'confirmed',_offline:true};
  const items=(payload.p_items||[]).map((x,i)=>({...clone(x),id:`${localId}-i${i+1}`,order_id:localId}));
  return {order,items,client_tx_id:entry.tx};
}
function localExpense(entry,shift,description,amount){return {id:entry.commit.local_entity_id,branch_id:runtimeBranch(),employee_id:runtimeEmployee(),shift_id:shift?.id,description,amount:Number(amount),created_at:entry.commit.created_local_at,_offline:true,client_tx_id:entry.tx}}
function localShiftOpen(entry,opening){return {id:entry.commit.local_entity_id,branch_id:runtimeBranch(),employee_id:runtimeEmployee(),opening_cash:Number(opening||0),status:'open',opened_at:entry.commit.created_local_at,_offline:true,client_tx_id:entry.tx}}
function localReturnResult(entry,o,selected,reason,notes,method,total,available=[]){
  const id=entry.commit.local_entity_id;
  const r={id,return_number:`OFF-${entry.tx.slice(0,8)}`,branch_id:o?.branch_id??runtimeBranch(),order_id:o?.id,shift_id:null,original_invoice_number:o?.invoice_number,original_bon_number:o?.bon_number,reason,notes,subtotal:Number(total),total:Number(total),created_at:entry.commit.created_local_at,_offline:true,client_tx_id:entry.tx};
  const items=(selected||[]).map(x=>{const i=(available||[]).find(z=>String(z.id)===String(x.order_item_id));const unit=Number(i?.total||0)/Math.max(1,Number(i?.quantity||1));return {return_id:id,order_item_id:x.order_item_id,product_name:i?.product_name||'صنف',quantity:x.quantity,unit_refund:unit,total:unit*x.quantity}});
  const payments=[{return_id:id,method,amount:Number(total)}];return {r,items,payments};
}
function shiftMetricsPayload(metrics,actual){const expected=Number(metrics?.expected||0);return {sales_total:Number(metrics?.sales||0),cash_sales:Number(metrics?.cash||0),wallet_sales:Number(metrics?.wallet||0),instapay_sales:Number(metrics?.instapay||0),expenses_total:Number(metrics?.exp||0),expected_cash:expected,cash_difference:Number(actual)-expected,orders_count:Number(metrics?.count||0)}}
function localShiftClosed(entry,shift,metrics,actual){const p=shiftMetricsPayload(metrics,actual);return {...clone(shift),closing_cash:Number(actual),closed_at:entry.commit.created_local_at,status:'closed',closed_by_employee_id:runtimeEmployee(),sales_total:p.sales_total,cash_sales:p.cash_sales,wallet_sales:p.wallet_sales,instapay_sales:p.instapay_sales,expenses_total:p.expenses_total,expected_cash:p.expected_cash,cash_difference:p.cash_difference,orders_count:p.orders_count,_offline:true,client_tx_id:entry.tx}}

async function rpcTakeover(name,payload={}){
  const adapter=operationForRpc(name);
  if(migrationLock&&adapter){const e=new Error('Offline V2 migration lock: operational sync is paused');e.code='OFFLINE_V2_MIGRATION_LOCK';throw e}
  if(!adapter||!(await isTakeoverActive()))return base.rpc(name,payload);
  const type=adapter.type;
  // Some legacy callers coerce local IDs through Number(), producing NaN before
  // the RPC wrapper sees them. Do not persist that corrupted dependency. Throw a
  // network-shaped error so the caller's existing offline branch commits from
  // the original local entity (shift/order) instead.
  if(mustFallbackBeforeCommit(type,payload))throw localDependencyError();
  const tx=text(adapter.extractTx?.(payload)||txFromPayload(type,payload));
  const entry=await ensureCommitted(type,payload,tx); // durable COMMIT BEFORE network
  // A sale attached to an unsynced local shift is durable now but must wait for
  // its parent mapping; never send the local shift id to the server.
  if(mustDeferAfterCommit(type,payload)){rememberFailed(type,entry,name,payload,localDependencyError());throw localDependencyError()}
  try{return await base.rpc(name,payload)}
  catch(error){rememberFailed(type,entry,name,payload,error);throw error}
}

async function saveSaleV2(orderPayload,itemPayload,payRows,providedClientTx=null){
  if(!(await isTakeoverActive()))return base.saveOfflineSale(orderPayload,itemPayload,payRows,providedClientTx);
  const tx=text(providedClientTx)||uid(),payload={p_order:{...clone(orderPayload),client_tx_id:tx},p_items:clone(itemPayload||[]),p_payments:clone(payRows||[])};
  const entry=await ensureCommitted('sale',payload,tx);return localSaleResult(entry,payload);
}
async function saveExpenseV2(shift,description,amount,providedClientTx=null){
  if(!(await isTakeoverActive()))return base.saveOfflineExpense(shift,description,amount,providedClientTx);
  let entry=consumeFailed('expense');
  const tx=text(providedClientTx||entry?.tx)||uid();
  if(!entry||entry.tx!==tx){const payload={p_shift_id:shift?.id,p_description:description,p_amount:Number(amount),p_client_tx_id:tx};entry=await ensureCommitted('expense',payload,tx)}
  return localExpense(entry,shift,description,amount);
}
async function saveShiftOpenV2(opening,providedClientTx=null){
  if(!(await isTakeoverActive()))return base.saveOfflineShiftOpen(opening,providedClientTx);
  let entry=consumeFailed('shift_open');const tx=text(providedClientTx||entry?.tx)||uid();
  if(!entry||entry.tx!==tx){entry=await ensureCommitted('shift_open',{p_branch_id:runtimeBranch(),p_opening_cash:Number(opening||0),p_client_tx_id:tx},tx)}
  const local=localShiftOpen(entry,opening);try{if(typeof rememberOpenShift==='function')await rememberOpenShift(local)}catch{}return local;
}
async function saveReturnV2(o,selected,reason,notes,method,total,available,providedClientTx=null){
  if(!(await isTakeoverActive()))return base.saveOfflineReturn(o,selected,reason,notes,method,total,available,providedClientTx);
  let entry=consumeFailed('return');const tx=text(providedClientTx||entry?.tx)||uid();
  if(!entry||entry.tx!==tx){
    const payload={p_order_id:o?.id,p_reason:reason,p_notes:notes,p_items:clone(selected||[]),p_payments:[{method,amount:Number(total)}],p_client_tx_id:tx};
    entry=await ensureCommitted('return',payload,tx);
  }
  return localReturnResult(entry,o,selected,reason,notes,method,total,available);
}
async function saveShiftCloseV2(shift,metrics,actual,providedClientTx=null){
  if(!(await isTakeoverActive()))return base.saveOfflineShiftClose(shift,metrics,actual,providedClientTx);
  let entry=consumeFailed('shift_close');const tx=text(providedClientTx||entry?.tx)||uid();
  if(!entry||entry.tx!==tx){
    const payload={p_shift_id:shift?.id,p_closing_cash:Number(actual),p_metrics:shiftMetricsPayload(metrics,actual),p_client_tx_id:tx};
    entry=await ensureCommitted('shift_close',payload,tx);
  }
  const local=localShiftClosed(entry,shift,metrics,actual);
  try{await odbSet(`openShift:${state.employee?.id}:${runtimeBranch()}`,null)}catch{}
  return local;
}

async function guardedLegacySync(...args){
  if(migrationLock)return {ok:true,skipped:'offline_v2_migration_lock'};
  // Historical legacy jobs remain legacy-authoritative until a later explicit
  // retirement phase. New takeover operations are never added to legacy queue.
  return base.syncOfflineQueue?.(...args);
}

async function armTakeover(){const identity=await canonicalIdentity();return desktopApi().takeoverArm({approved:true,identity})}
async function prepareLegacyMigration(){
  if(migrationLock)throw Object.assign(new Error('Offline V2 migration already running'),{code:'OFFLINE_V2_MIGRATION_BUSY'});
  migrationLock=true;
  try{
    const identity=await canonicalIdentity();
    const foundation=global.SharawlaOfflineV2;
    if(!foundation?.migrateLegacyQueue||!foundation?.keys)throw new Error('Offline V2 foundation unavailable');
    const legacy=clone(await offlineQueue()); // immutable migration snapshot
    await foundation.migrateLegacyQueue();   // copy -> re-read -> verify, never clears legacy
    const shadow=clone(await odbGet(foundation.keys.OUTBOX)||[]);
    const txs=new Set(legacy.map(x=>text(x?.client_tx_id)));
    const events=shadow.filter(x=>txs.has(text(x?.client_tx_id)));
    const mappings=clone(await odbGet(foundation.keys.MAPPINGS)||[]).filter(x=>txs.has(text(x?.client_tx_id)));
    return await desktopApi().takeoverPrepare({approved:true,identity,legacy_snapshot:legacy,events,mappings});
  }finally{migrationLock=false}
}
async function activateTakeover(){const identity=await canonicalIdentity();return desktopApi().takeoverActivate({approved:true,identity})}
async function deactivateTakeover(){const identity=await canonicalIdentity();return desktopApi().takeoverDeactivate({approved:true,identity})}

function install(){
  if(installed)return;installed=true;
  base={
    rpc:typeof rpc==='function'?rpc:null,
    saveOfflineSale:typeof saveOfflineSale==='function'?saveOfflineSale:null,
    saveOfflineExpense:typeof saveOfflineExpense==='function'?saveOfflineExpense:null,
    saveOfflineShiftOpen:typeof saveOfflineShiftOpen==='function'?saveOfflineShiftOpen:null,
    saveOfflineReturn:typeof saveOfflineReturn==='function'?saveOfflineReturn:null,
    saveOfflineShiftClose:typeof saveOfflineShiftClose==='function'?saveOfflineShiftClose:null,
    syncOfflineQueue:typeof syncOfflineQueue==='function'?syncOfflineQueue:null
  };
  if(!base.rpc||!base.saveOfflineSale)throw new Error('Offline V2 takeover requires legacy runtime bridge');
  try{rpc=rpcTakeover}catch{};try{global.rpc=rpcTakeover}catch{};
  try{saveOfflineSale=saveSaleV2}catch{};try{global.saveOfflineSale=saveSaleV2}catch{};
  if(base.saveOfflineExpense){try{saveOfflineExpense=saveExpenseV2}catch{};try{global.saveOfflineExpense=saveExpenseV2}catch{}}
  if(base.saveOfflineShiftOpen){try{saveOfflineShiftOpen=saveShiftOpenV2}catch{};try{global.saveOfflineShiftOpen=saveShiftOpenV2}catch{}}
  if(base.saveOfflineReturn){try{saveOfflineReturn=saveReturnV2}catch{};try{global.saveOfflineReturn=saveReturnV2}catch{}}
  if(base.saveOfflineShiftClose){try{saveOfflineShiftClose=saveShiftCloseV2}catch{};try{global.saveOfflineShiftClose=saveShiftCloseV2}catch{}}
  try{syncOfflineQueue=guardedLegacySync}catch{};try{global.syncOfflineQueue=guardedLegacySync}catch{};

  // Expose explicit controls for later acceptance/takeover. Nothing below arms,
  // migrates or activates automatically.
  global.SharawlaOfflineV2Takeover=Object.freeze({
    version:VERSION,registerOperation,registerRpc,operationTypes:()=>[...registry.keys()],rpcMappings:()=>Object.fromEntries(rpcToOperation),
    state:takeoverState,arm:armTakeover,prepareMigration:prepareLegacyMigration,activate:activateTakeover,deactivate:deactivateTakeover,
    isMigrationLocked:()=>migrationLock
  });
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(window);
