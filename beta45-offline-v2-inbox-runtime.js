(function(global){
'use strict';

// Sharawla Offline Engine V2 — Phase 7 renderer Inbox + Customer/Order events.
// Cloud/domain events are received durably before compatibility caches are
// touched. Cursor advances only after the event is locally applied.
const VERSION='10.5.4-beta.50';
const CURSOR_PREFIX='sharawlaOfflineV2InboxCursor';
const PULL_RPC='offline_v2_pull_events_v1';
const ORDER_STATUSES=new Set(['new','preparing','ready','out_for_delivery','completed','delivered','cancelled']);
let pulling=false,timer=null,installed=false,baseRest=null;

function text(v){return String(v??'').trim()}
function num(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function nowIso(){return new Date().toISOString()}
function uid(){try{return typeof uuid==='function'?uuid():crypto.randomUUID()}catch{return `${Date.now()}-${Math.random().toString(16).slice(2)}`}}
function normalizePhone(v){let s=text(v).replace(/\D/g,'');if(s.startsWith('20')&&s.length>=12)s=s.slice(2);if(s.length===10&&s.startsWith('1'))s=`0${s}`;return s}
function branchId(){try{return num(typeof currentBranchId==='function'?currentBranchId():state?.activeBranchId)}catch{return 0}}
function employeeId(){try{return num(state?.employee?.id)}catch{return 0}}
function api(){return global.topBurgerDesktop?.offlineV2||null}
async function takeoverActive(){const s=await api()?.takeoverState?.();return s?.active===true&&s?.migration_verified===true&&s?.transport_ready===true}
async function identity(){
  const st=typeof loadLicenseState==='function'?await loadLicenseState():null;
  const x={device_id:text(st?.device_id),business_id:text(st?.business_id),device_fingerprint:text(st?.device_fingerprint)};
  if(!x.device_id||!x.business_id||!x.device_fingerprint){const e=new Error('Offline V2 canonical device identity required');e.code='OFFLINE_V2_CANONICAL_IDENTITY_REQUIRED';throw e}
  return x;
}
function cursorKey(business,branch){return `${CURSOR_PREFIX}:${business}:${branch}`}
function loadCursor(business,branch){try{return JSON.parse(localStorage.getItem(cursorKey(business,branch))||'null')}catch{return null}}
function saveCursor(business,branch,event){const c={created_at:text(event?.created_at),event_id:text(event?.event_id)};localStorage.setItem(cursorKey(business,branch),JSON.stringify(c));return c}

async function cachedBundles(){try{return typeof cachedOrderBundles==='function'?await cachedOrderBundles():(await odbGet('cachedOrders'))||[]}catch{return []}}
async function putOrderBundle(order,items=[]){
  if(typeof cacheOrderBundle==='function')return cacheOrderBundle(order,items);
  const all=(await odbGet('cachedOrders'))||[];const next=[{order,items},...all.filter(x=>String(x.order?.id)!==String(order.id))].slice(0,250);return odbSet('cachedOrders',next);
}
async function applyOrderCache(event){
  const order=clone(event.payload||{});if(!order?.id)order.id=event.entity_id;
  const bundles=await cachedBundles();const old=bundles.find(x=>String(x.order?.id)===String(order.id));let items=old?.items||[];
  if(event.event_type==='website.order_created'){
    if(typeof baseRest!=='function')throw new Error('Offline V2 website order item fetch unavailable');
    items=await baseRest('order_items',`select=*&order_id=eq.${encodeURIComponent(order.id)}&order=id`);
  }
  await putOrderBundle({...old?.order,...order},items);
}
async function applyCustomerCache(event){
  const customer=clone(event.payload||{});if(!customer?.id)customer.id=event.entity_id;
  const all=(await odbGet('customersCache'))||[];
  const phone=normalizePhone(customer.phone),next=[customer,...all.filter(x=>String(x.id)!==String(customer.id)&&(!phone||normalizePhone(x.phone)!==phone))];
  await odbSet('customersCache',next.slice(0,10000));
}
async function applyAddressCache(event){
  const address=clone(event.payload||{});if(!address?.id)address.id=event.entity_id;
  const all=(await odbGet('customerAddressesCache'))||[];
  const rest=all.filter(x=>String(x.id)!==String(address.id));
  await odbSet('customerAddressesCache',event.event_type==='customer_address.deleted'?rest:[address,...rest]);
}
async function applyCompatibilityCache(event){
  if(event.entity_type==='order')await applyOrderCache(event);
  else if(event.entity_type==='customer')await applyCustomerCache(event);
  else if(event.entity_type==='customer_address')await applyAddressCache(event);
}

async function pullNow(){
  if(pulling)return {ok:true,skipped:'already_pulling'};
  if(!navigator.onLine||employeeId()<=0||branchId()<=0||typeof rpc!=='function')return {ok:true,skipped:'offline_or_logged_out'};
  if(!(await takeoverActive()))return {ok:true,skipped:'takeover_inactive'};
  const a=api();if(!a?.inboxReceive||!a?.inboxApply)throw new Error('Offline V2 Inbox bridge unavailable');
  const st=await identity(),branch=branchId(),cursor=loadCursor(st.business_id,branch);
  pulling=true;let received=0,applied=0,duplicates=0;
  try{
    const rows=await rpc(PULL_RPC,{p_branch_id:branch,p_after_created_at:cursor?.created_at||null,p_after_event_id:cursor?.event_id||null,p_limit:100});
    for(const raw of (Array.isArray(rows)?rows:[])){
      const event={...clone(raw),event_id:text(raw.event_id),entity_id:text(raw.entity_id)};
      const rec=await a.inboxReceive(event);received++;
      try{
        if(!(rec?.duplicate===true&&rec?.applied===true)){
          await applyCompatibilityCache(event);
          await a.inboxApply(event.event_id);applied++;
          try{global.dispatchEvent(new CustomEvent('sharawla:offline-v2-server-event',{detail:clone(event)}))}catch{}
        }else duplicates++;
        // Exactly-once cursor rule: never advance beyond an event until its
        // durable local Inbox state is applied.
        saveCursor(st.business_id,branch,event);
      }catch(e){
        try{await a.inboxError?.(event.event_id,{message:e?.message||String(e)})}catch{}
        throw e;
      }
    }
    return {ok:true,received,applied,duplicates,cursor:loadCursor(st.business_id,branch)};
  }finally{pulling=false}
}

async function syncOutboxIfOnline(){
  if(!navigator.onLine)return null;
  try{return await global.SharawlaOfflineV2Transport?.syncNow?.()}catch{return null}
}
async function commitDomainOperation({type,entityType,localId,dependsOnTx=null,payload,records=[]}){
  if(!(await takeoverActive()))throw Object.assign(new Error('Offline V2 takeover is not active'),{code:'OFFLINE_V2_TAKEOVER_INACTIVE'});
  const st=await identity(),tx=text(payload?.rpc_payload?.p_client_tx_id),branch=branchId(),employee=employeeId();
  if(!tx||branch<=0||employee<=0)throw Object.assign(new Error('Offline V2 domain operation context incomplete'),{code:'OFFLINE_V2_DOMAIN_CONTEXT_INVALID'});
  const created=nowIso();
  await api().commitOperation({
    client_tx_id:tx,device_id:st.device_id,business_id:st.business_id,branch_id:branch,employee_id:employee,
    operation_type:type,entity_type:entityType,local_entity_id:localId,local_shift_id:null,depends_on_tx_id:dependsOnTx,
    created_local_at:created,protocol_version:2,schema_version:2,status:'pending',payload:clone(payload),records:clone(records)
  });
  await syncOutboxIfOnline();
  return api().event(tx);
}

async function queueCustomerMerge(data={},providedTx=null){
  const tx=text(providedTx)||uid(),created=nowIso(),localId=`offline-customer-${tx}`;
  const rpcPayload={p_name:text(data.name)||text(data.phone),p_phone:text(data.phone),p_area:text(data.area)||null,p_address:text(data.address)||null,p_notes:text(data.notes)||null,p_client_tx_id:tx};
  if(normalizePhone(rpcPayload.p_phone).length<10)throw Object.assign(new Error('رقم العميل غير صالح للمزامنة'),{code:'OFFLINE_V2_CUSTOMER_PHONE_INVALID'});
  const row=await commitDomainOperation({
    type:'customer_merge',entityType:'customer',localId,
    payload:{rpc_name:'offline_v2_merge_customer_v1',rpc_payload:rpcPayload},
    records:[{record_type:'customer',local_id:localId,payload:{id:localId,name:rpcPayload.p_name,phone:rpcPayload.p_phone,area:rpcPayload.p_area,address:rpcPayload.p_address,notes:rpcPayload.p_notes,created_at:created,_offline:true,client_tx_id:tx},created_local_at:created}]
  });
  const customer=row?.status==='synced'?clone(row?.server_ack?.result?.customer):{id:localId,name:rpcPayload.p_name,phone:rpcPayload.p_phone,area:rpcPayload.p_area,address:rpcPayload.p_address,notes:rpcPayload.p_notes,created_at:created,_offline:true,client_tx_id:tx};
  return {ok:true,client_tx_id:tx,status:row?.status||'pending',synced:row?.status==='synced',customer,row};
}
function orderDependency(id){const s=text(id);return s.startsWith('offline-')&&!s.startsWith('offline-ret-')&&!s.startsWith('offline-exp-')&&!s.startsWith('offline-shift-')?s.slice('offline-'.length):null}
async function patchCachedOrder(id,patch){
  const bundles=await cachedBundles();const old=bundles.find(x=>String(x.order?.id)===String(id));
  const order={...(old?.order||{id}),...clone(patch),id:old?.order?.id??id,_offline:old?.order?._offline===true};await putOrderBundle(order,old?.items||[]);return order;
}
async function queueOrderStatus(orderId,status,options={},providedTx=null){
  const wanted=text(status).toLowerCase();if(!ORDER_STATUSES.has(wanted))throw Object.assign(new Error('حالة الطلب غير مدعومة للأوفلاين'),{code:'OFFLINE_V2_ORDER_STATUS_INVALID'});
  const tx=text(providedTx)||uid(),localId=`offline-order-event-${tx}`,dep=orderDependency(orderId),branch=branchId();
  const rpcPayload={p_order_id:dep?text(orderId):num(orderId),p_branch_id:branch,p_status:wanted,p_driver_id:options.driver_id==null?null:num(options.driver_id),p_cancelled_reason:text(options.cancelled_reason)||null,p_client_tx_id:tx};
  if(!dep&&rpcPayload.p_order_id<=0)throw Object.assign(new Error('رقم الطلب غير صالح'),{code:'OFFLINE_V2_ORDER_ID_INVALID'});
  const created=nowIso();
  const row=await commitDomainOperation({
    type:'order_status',entityType:'order_event',localId,dependsOnTx:dep,
    payload:{rpc_name:'offline_v2_update_order_status_v1',rpc_payload:rpcPayload},
    records:[{record_type:'order_event',local_id:localId,parent_local_id:text(orderId),payload:{order_id:text(orderId),status:wanted,driver_id:rpcPayload.p_driver_id,cancelled_reason:rpcPayload.p_cancelled_reason,created_at:created,client_tx_id:tx},created_local_at:created}]
  });
  const local=await patchCachedOrder(orderId,{status:wanted,driver_id:rpcPayload.p_driver_id??undefined,cancelled_reason:rpcPayload.p_cancelled_reason??undefined});
  return {ok:true,client_tx_id:tx,status:row?.status||'pending',synced:row?.status==='synced',order:row?.server_ack?.result?.order||local,row};
}

function parseBody(opt){try{const x=JSON.parse(opt?.body||'null');return x}catch{return null}}
function querySingleId(q){const m=String(q||'').match(/(?:^|&)id=eq\.([^&]+)/);return m?decodeURIComponent(m[1]):null}
function terminalRow(row){return row?.status==='conflict'||row?.status==='dead_letter'}
function deferredError(code='OFFLINE_V2_DEFERRED'){const e=new TypeError('Failed to fetch');e.code=code;e.kind='network';return e}

async function restV2(table,query='',opt={}){
  if(!(await takeoverActive()))return baseRest(table,query,opt);
  const method=text(opt?.method||'GET').toUpperCase(),body=parseBody(opt);
  if(table==='orders'&&method==='PATCH'&&body&&ORDER_STATUSES.has(text(body.status).toLowerCase())){
    const id=querySingleId(query);if(!id)return baseRest(table,query,opt);
    const result=await queueOrderStatus(id,body.status,{driver_id:body.driver_id,cancelled_reason:body.cancelled_reason});
    if(terminalRow(result.row))throw Object.assign(new Error(result.row.last_error_message||'تعذر مزامنة حالة الطلب'),{code:result.row.last_error_code||'OFFLINE_V2_ORDER_STATUS_FAILED'});
    return [clone(result.order)];
  }
  if(table==='customers'&&method==='POST'&&Array.isArray(body)&&body.length===1&&text(body[0]?.phone)){
    const result=await queueCustomerMerge(body[0]);
    if(result.synced)return [clone(result.customer)];
    // Preserve checkout compatibility: the durable customer remains in Outbox,
    // while legacy checkout continues with customer_id=null rather than writing a
    // local text id into a bigint order.customer_id field.
    throw deferredError('OFFLINE_V2_CUSTOMER_PENDING');
  }
  return baseRest(table,query,opt);
}
function installRestAuthority(){
  if(baseRest)return true;
  const fn=typeof rest==='function'?rest:(typeof global.rest==='function'?global.rest:null);if(!fn)return false;
  baseRest=fn.bind(global);try{rest=restV2}catch{};global.rest=restV2;return true;
}

function start(){
  if(installed)return;
  if(!api()?.inboxReceive||typeof rpc!=='function'||!installRestAuthority())return setTimeout(start,100);
  installed=true;
  global.addEventListener('online',()=>{pullNow().catch(e=>console.warn('Offline V2 Inbox online pull',e))});
  global.addEventListener('sharawla:runtime-config-updated',()=>{pullNow().catch(()=>{})});
  timer=setInterval(()=>{if(navigator.onLine)pullNow().catch(()=>{})},15_000);
  setTimeout(()=>{if(navigator.onLine)pullNow().catch(()=>{})},1200);
  global.SharawlaOfflineV2Inbox=Object.freeze({version:VERSION,pullNow,queueCustomerMerge,queueOrderStatus,cursorKey,normalizePhone});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
