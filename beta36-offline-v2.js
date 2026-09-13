(function(global){
'use strict';
const VERSION='10.5.4-beta.49-offline-v2.2';
const KEY='sharawlaOfflineActionsV2';
const SAFE=new Set([
 'commerce_order_document_create_v2','commerce_order_document_record_payment_v2',
 'service_appointment_create_v1','service_job_create_v1','service_package_purchase_v1','service_package_use_v1',
 'membership_subscribe_v1','membership_renew_v1','membership_checkin_v1','membership_book_class_v1',
 'logistics_shipment_create_v1','logistics_pickup_request_create_v1','logistics_cod_collect_v1','logistics_settlement_create_v1'
]);
const foundation=global.SharawlaOfflineV2||null;
const baseRpc=typeof global.rpc==='function'?global.rpc.bind(global):null;
if(!baseRpc){console.error('Offline V2: rpc is not ready');return}
function parse(){try{const q=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(q)?q:[]}catch{return[]}}
function save(q){localStorage.setItem(KEY,JSON.stringify(q));global.dispatchEvent(new CustomEvent('sharawla-offline-v2-change',{detail:{pending:q.length}}));return q}
function netError(e){try{if(typeof global.isNetError==='function')return global.isNetError(e)}catch{}const m=String(e?.message||e||'');return e?.name==='TypeError'||/failed to fetch|network|offline|load failed|internet/i.test(m)}
function tx(payload){return String(payload?.p_client_tx_id||'').trim()}
function put(name,payload){
 const id=tx(payload);if(!id)throw new Error(`Offline V2 requires p_client_tx_id for ${name}`);
 const q=parse();if(q.some(x=>x.client_tx_id===id&&x.rpc===name))return q.find(x=>x.client_tx_id===id&&x.rpc===name);
 const job={type:'engine_action_v2',rpc:name,payload,client_tx_id:id,created_at:new Date().toISOString(),tries:0,last_error:null};
 q.push(job);save(q);
 try{global.topBurgerDesktop?.operations?.put?.(job)}catch{}
 return job;
}
async function call(name,payload={}){
 if(!SAFE.has(name))return baseRpc(name,payload);
 if(!tx(payload))return baseRpc(name,payload);
 if(!navigator.onLine){const j=put(name,payload);return {_offline:true,client_tx_id:j.client_tx_id,queued:true}}
 try{return await baseRpc(name,payload)}catch(e){if(!netError(e))throw e;const j=put(name,payload);return {_offline:true,client_tx_id:j.client_tx_id,queued:true}}
}
let syncing=false;
async function sync(){
 if(syncing||!navigator.onLine)return {done:0,pending:parse().length};
 syncing=true;let q=parse(),done=0;
 try{
  for(const job of [...q]){
   try{
    await baseRpc(job.rpc,job.payload);
    q=q.filter(x=>!(x.client_tx_id===job.client_tx_id&&x.rpc===job.rpc));save(q);done++;
    try{await global.topBurgerDesktop?.operations?.status?.(job.client_tx_id,'synced',null)}catch{}
   }catch(e){
    if(!netError(e)){
     job.tries=Number(job.tries||0)+1;job.last_error=String(e?.message||e);save(q);
     try{await global.topBurgerDesktop?.operations?.status?.(job.client_tx_id,'failed',job.last_error)}catch{}
    }
    break;
   }
  }
  if(done)try{global.toast?.(`تمت مزامنة ${done} حركة تشغيل أوفلاين`)}catch{}
  return {done,pending:q.length};
 }finally{syncing=false}
}
function pending(){return parse().length}
async function migrateLegacyQueuePreservingConflict(){
 if(!foundation?.migrateLegacyQueue||!foundation?.transitionOutbox)throw new Error('Offline V2 foundation migration API unavailable');
 const result=await foundation.migrateLegacyQueue();
 let legacy=[];try{legacy=Array.isArray(await global.odbGet?.('queue'))?await global.odbGet('queue'):[]}catch{}
 let preserved=0;
 for(const job of legacy){
  if(String(job?._sync?.status||'').toLowerCase()!=='conflict')continue;
  try{
   await foundation.transitionOutbox(String(job.client_tx_id),'conflict',{
    last_error_code:'OFFLINE_V2_LEGACY_CONFLICT_PRESERVED',
    last_error_message:String(job?._sync?.last_error||'Legacy conflict preserved during V2 migration')
   });
   preserved++;
  }catch(e){
   const msg=String(e?.message||e||'');
   if(!/conflict\s*->\s*conflict|Invalid Offline V2 transition conflict/i.test(msg))throw e;
  }
 }
 return {...result,preserved_conflicts:preserved};
}
// Wrap rpc only for the explicitly safe idempotent RPC set. All legacy calls pass through untouched.
global.rpc=async function(name,payload={}){return call(name,payload)};
const api={...(foundation||{}),engineWrapperVersion:VERSION,safe:[...SAFE],call,sync,pending};
if(foundation?.migrateLegacyQueue)api.migrateLegacyQueue=migrateLegacyQueuePreservingConflict;
global.SharawlaOfflineV2=Object.freeze(api);
global.addEventListener('online',()=>setTimeout(()=>sync().catch(()=>{}),500));
setInterval(()=>{if(navigator.onLine)sync().catch(()=>{})},30000);
setTimeout(()=>{if(navigator.onLine)sync().catch(()=>{})},1500);
})(window);
